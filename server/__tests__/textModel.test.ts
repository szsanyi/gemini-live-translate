import { describe, it, expect, vi, afterEach } from "vitest";
import {
  TextModelError,
  describeProviderError,
  extractChatText,
  isRetryableError,
  resolveConfig,
  retryAfterMs,
  runPrompt,
  withRetry,
} from "../providers/textModel.ts";

// The exact body Gemini returns when the flash alias is momentarily overloaded.
// It arrives as the ApiError's `message`, JSON and all.
const OVERLOADED_BODY = JSON.stringify({
  error: {
    code: 503,
    message:
      "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
    status: "UNAVAILABLE",
  },
});

const fast = { baseDelayMs: 0 } as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isRetryableError", () => {
  it("retries throttling and transient upstream failures", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableError(new TextModelError("boom", status))).toBe(true);
    }
  });

  it("does not retry a request the provider rejected on its merits", () => {
    for (const status of [400, 401, 403, 404]) {
      expect(isRetryableError(new TextModelError("boom", status))).toBe(false);
    }
  });

  it("does not retry a configuration error", () => {
    // A missing key never fixes itself; retrying only delays the message.
    expect(isRetryableError(new Error("Missing API key for Gemini text model."))).toBe(false);
  });

  it("does not retry an exhausted account, even though 429 is normally retryable", () => {
    // OpenAI answers a spent balance with 429 insufficient_quota. That is billing, not
    // throttling: no number of attempts 500 ms apart will make it succeed.
    expect(isRetryableError(new TextModelError("no credit", 429, undefined, true))).toBe(false);
  });

  it("retries a dropped connection", () => {
    const err = new TypeError("fetch failed");
    (err as { cause?: unknown }).cause = { code: "ECONNRESET" };
    expect(isRetryableError(err)).toBe(true);
  });
});

describe("withRetry", () => {
  it("survives a transient 503 instead of failing the whole request", async () => {
    const fn = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TextModelError("overloaded", 503))
      .mockRejectedValueOnce(new TextModelError("overloaded", 503))
      .mockResolvedValue("Quarterly budget review");

    await expect(withRetry(fn, fast)).resolves.toBe("Quarterly budget review");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after the attempt budget and reports how often it tried", async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new TextModelError("overloaded", 503));

    await expect(withRetry(fn, { ...fast, attempts: 3 })).rejects.toThrow(/3 attempts/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("fails immediately on an error a retry cannot fix", async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new TextModelError("bad request", 400));

    await expect(withRetry(fn, fast)).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("retry-after handling", () => {
  // The free tier answers a 429 with the wait it wants: "Please retry in 46.410974692s."
  const QUOTA_BODY = JSON.stringify({
    error: {
      code: 429,
      message:
        "You exceeded your current quota. * Quota exceeded for metric: " +
        "generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, " +
        "model: gemini-3.7-flash Please retry in 46.410974692s.",
      status: "RESOURCE_EXHAUSTED",
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "46.410974692s" }],
    },
  });

  it("reads the wait out of the provider's error body", () => {
    expect(retryAfterMs(QUOTA_BODY)).toBeCloseTo(46411, -2);
  });

  it("refuses to retry when the provider asks for longer than we are willing to wait", async () => {
    // Retrying a per-minute quota after 500 ms cannot work, and each attempt spends
    // another request out of the same exhausted bucket.
    const err = new TextModelError(QUOTA_BODY, 429, 46_411);
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err);

    await expect(withRetry(fn, fast)).rejects.toThrow(/46/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits out a short retry-after and tries again", async () => {
    const fn = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TextModelError("slow down", 429, 5))
      .mockResolvedValue("ok");

    await expect(withRetry(fn, fast)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("reports the attempts it actually made, not the budget", async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new TextModelError("nope", 429, 60_000));
    await expect(withRetry(fn, { ...fast, attempts: 4 })).rejects.not.toThrow(/attempts/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("describeProviderError", () => {
  it("unwraps the provider's JSON body into something readable", () => {
    const msg = describeProviderError("Gemini", new TextModelError(OVERLOADED_BODY, 503));
    expect(msg).toContain("high demand");
    expect(msg).toContain("503");
    // The raw blob must not reach the UI.
    expect(msg).not.toContain("{");
    expect(msg).not.toContain('"code"');
  });

  it("drops the documentation-link boilerplate from a quota message", () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        message:
          "You exceeded your current quota, please check your plan and billing details. " +
          "For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. " +
          "To monitor your current usage, head to: https://ai.dev/rate-limit. " +
          "* Quota exceeded for metric: generate_content_free_tier_requests, limit: 5",
        status: "RESOURCE_EXHAUSTED",
      },
    });
    const msg = describeProviderError("Gemini", new TextModelError(body, 429));
    expect(msg).toContain("exceeded your current quota");
    expect(msg).toContain("limit: 5");
    expect(msg).not.toContain("http");
    expect(msg).not.toContain("head to");
  });

  it("keeps a plain message as it is", () => {
    expect(describeProviderError("Gemini", new Error("Empty response from Gemini."))).toContain(
      "Empty response from Gemini.",
    );
  });
});

describe("runPrompt", () => {
  it("retries a 503 from an HTTP provider", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "upstream busy",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ message: { content: "Quarterly budget review" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const cfg = { provider: "ollama" as const, model: "llama3.1", apiKey: "", baseUrl: "http://localhost:11434" };
    await expect(runPrompt(cfg, "title this", fast)).resolves.toBe("Quarterly budget review");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after one attempt when the account is out of credit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => JSON.stringify({
        error: {
          message:
            "You exceeded your current quota, please check your plan and billing details. " +
            "For more information on this error, read the docs: " +
            "https://platform.openai.com/docs/guides/error-codes/api-errors.",
          type: "insufficient_quota",
          code: "insufficient_quota",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cfg = { provider: "openai" as const, model: "gpt-4o-mini", apiKey: "k", baseUrl: "https://api.openai.com/v1" };
    const err = await runPrompt(cfg, "title this", fast).catch((e) => e);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err.message).not.toContain("attempts");
    // The docs link is boilerplate in a small error banner, whichever provider wrote it.
    expect(err.message).not.toContain("http");
    expect(err.message).toContain("billing details");
  });

  it("does not retry a rejected request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad model",
    });
    vi.stubGlobal("fetch", fetchMock);

    const cfg = { provider: "openai" as const, model: "gpt-4o-mini", apiKey: "k", baseUrl: "https://api.openai.com/v1" };
    await expect(runPrompt(cfg, "title this", fast)).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("OpenRouter provider", () => {
  const envKeys = ["SUMMARY_PROVIDER", "SUMMARY_MODEL", "SUMMARY_API_KEY", "SUMMARY_BASE_URL", "OPENROUTER_API_KEY"];
  const saved: Record<string, string | undefined> = {};

  function withEnv(vars: Record<string, string | undefined>) {
    for (const k of envKeys) saved[k] = process.env[k];
    for (const k of envKeys) delete process.env[k];
    for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  }

  afterEach(() => {
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("picks up the OpenRouter key and base URL without any other setting", () => {
    withEnv({ SUMMARY_PROVIDER: "openrouter", OPENROUTER_API_KEY: "or-key" });
    const cfg = resolveConfig();
    expect(cfg.provider).toBe("openrouter");
    expect(cfg.apiKey).toBe("or-key");
    expect(cfg.baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  it("lets SUMMARY_API_KEY and SUMMARY_MODEL override", () => {
    withEnv({
      SUMMARY_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "or-key",
      SUMMARY_API_KEY: "explicit",
      SUMMARY_MODEL: "anthropic/claude-3.5-sonnet",
    });
    const cfg = resolveConfig();
    expect(cfg.apiKey).toBe("explicit");
    expect(cfg.model).toBe("anthropic/claude-3.5-sonnet");
  });

  it("falls back to gemini for an unknown provider name", () => {
    withEnv({ SUMMARY_PROVIDER: "not-a-provider" });
    expect(resolveConfig().provider).toBe("gemini");
  });

  it("reads the text out of a chat completion", () => {
    expect(extractChatText({ choices: [{ message: { content: "Szia" } }] })).toBe("Szia");
    expect(extractChatText({ choices: [] })).toBe("");
    expect(extractChatText({})).toBe("");
    expect(extractChatText(null)).toBe("");
  });

  it("posts to /chat/completions, not the Responses API", async () => {
    // The whole reason this provider exists: OpenRouter has no /responses endpoint,
    // so routing it through the "openai" branch only earns a 404.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "Jó reggelt." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cfg = {
      provider: "openrouter" as const,
      model: "openai/gpt-4o-mini",
      apiKey: "or-key",
      baseUrl: "https://openrouter.ai/api/v1",
    };
    await expect(runPrompt(cfg, "Good morning.", fast)).resolves.toBe("Jó reggelt.");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer or-key");
    expect(JSON.parse(init.body).messages[0].content).toBe("Good morning.");
  });

  it("refuses to run without a key instead of posting an unauthenticated request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const cfg = {
      provider: "openrouter" as const,
      model: "openai/gpt-4o-mini",
      apiKey: "",
      baseUrl: "https://openrouter.ai/api/v1",
    };
    await expect(runPrompt(cfg, "x", fast)).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces an OpenRouter failure through the shared error formatting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: { message: "Insufficient credits." } }),
    }));
    const cfg = {
      provider: "openrouter" as const,
      model: "openai/gpt-4o-mini",
      apiKey: "or-key",
      baseUrl: "https://openrouter.ai/api/v1",
    };
    const err = await runPrompt(cfg, "x", fast).catch((e) => e);
    expect(err.message).toContain("OpenRouter 402");
    expect(err.message).toContain("Insufficient credits");
  });
});

describe("separate provider for the segment translation", () => {
  const envKeys = [
    "SUMMARY_PROVIDER", "SUMMARY_MODEL", "SUMMARY_API_KEY", "SUMMARY_BASE_URL",
    "TRANSLATE_PROVIDER", "TRANSLATE_MODEL", "TRANSLATE_API_KEY", "TRANSLATE_BASE_URL",
    "GEMINI_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY",
  ];
  const saved: Record<string, string | undefined> = {};

  function withEnv(vars: Record<string, string>) {
    for (const k of envKeys) saved[k] = process.env[k];
    for (const k of envKeys) delete process.env[k];
    for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  }

  afterEach(() => {
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("uses the summary config for both jobs when nothing is split", () => {
    withEnv({ SUMMARY_PROVIDER: "gemini", SUMMARY_MODEL: "gemini-flash-lite-latest", GEMINI_API_KEY: "g" });
    expect(resolveConfig("translate")).toEqual(resolveConfig("summary"));
  });

  it("sends the translation elsewhere once TRANSLATE_PROVIDER is set", () => {
    withEnv({
      SUMMARY_PROVIDER: "gemini", SUMMARY_MODEL: "gemini-flash-lite-latest", GEMINI_API_KEY: "g",
      TRANSLATE_PROVIDER: "openrouter", TRANSLATE_MODEL: "anthropic/claude-3.5-sonnet",
      OPENROUTER_API_KEY: "or",
    });
    const t = resolveConfig("translate");
    expect(t.provider).toBe("openrouter");
    expect(t.model).toBe("anthropic/claude-3.5-sonnet");
    expect(t.apiKey).toBe("or");
    expect(t.baseUrl).toBe("https://openrouter.ai/api/v1");
    // ...while the summary stays where it was.
    expect(resolveConfig("summary").provider).toBe("gemini");
    expect(resolveConfig("summary").model).toBe("gemini-flash-lite-latest");
  });

  it("never inherits the summary's model into a different provider", () => {
    // The footgun this rule exists for: SUMMARY_MODEL is a Gemini id, and handing it
    // to OpenRouter would fail on every single segment.
    withEnv({
      SUMMARY_PROVIDER: "gemini", SUMMARY_MODEL: "gemini-flash-lite-latest", GEMINI_API_KEY: "g",
      TRANSLATE_PROVIDER: "openrouter", OPENROUTER_API_KEY: "or",
    });
    const t = resolveConfig("translate");
    expect(t.model).not.toBe("gemini-flash-lite-latest");
    expect(t.model).toBe("openai/gpt-4o-mini"); // the openrouter default
  });

  it("keeps one provider's outage from taking out the other job", () => {
    // What actually happened: one exhausted account turned every card into
    // "(translation failed)" and lost the recording's title in the same moment.
    withEnv({
      SUMMARY_PROVIDER: "gemini", GEMINI_API_KEY: "g",
      TRANSLATE_PROVIDER: "openrouter", OPENROUTER_API_KEY: "or",
    });
    expect(resolveConfig("summary").apiKey).toBe("g");
    expect(resolveConfig("translate").apiKey).toBe("or");
  });
});
