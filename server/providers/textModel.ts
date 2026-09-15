import { GoogleGenAI } from "@google/genai";

/**
 * Shared text-model runner. Used by both the conversation summary and the
 * segment-by-segment text translation, so the provider plumbing lives in one
 * place. Fully configurable via env so text work can run on a different
 * provider/key/model than the live translation:
 *
 *   SUMMARY_PROVIDER  gemini | openai | openrouter | ollama   (default: gemini)
 *   SUMMARY_MODEL     model id                    (provider-specific default)
 *   SUMMARY_API_KEY   key                         (falls back to GEMINI/OPENAI/OPENROUTER key)
 *   SUMMARY_BASE_URL  base URL                    (OpenAI-compatible / Ollama host)
 *
 * The two jobs are **not** the same shape, so each can have its own provider via a
 * TRANSLATE_ prefix (TRANSLATE_PROVIDER / _MODEL / _API_KEY / _BASE_URL):
 *
 *   - the segment translation is many small, latency-sensitive requests — one per
 *     transcript card, ~130 in a half-hour meeting;
 *   - the summary is one large request at the end, where quality matters and latency
 *     does not.
 *
 * Putting both on one account also means one outage takes out both: an OpenAI key
 * with no credit left turned every card into "(translation failed)" *and* lost the
 * recording's title in the same moment.
 *
 * Fallback rule, deliberately all-or-nothing: **without TRANSLATE_PROVIDER the
 * translation simply uses the summary config.** Once TRANSLATE_PROVIDER is set,
 * nothing is inherited from SUMMARY_* — otherwise a half-specified override would
 * hand, say, "gemini-flash-lite-latest" to OpenRouter and fail on every segment.
 */
export type Provider = "gemini" | "openai" | "openrouter" | "ollama";

export interface TextModelConfig {
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl: string;
}

/** A provider failure that carries the HTTP status, so retryability is a fact, not a regex. */
export class TextModelError extends Error {
  readonly status?: number;
  /** How long the provider asked us to wait, when it said (429 quota, `Retry-After`). */
  readonly retryAfterMs?: number;
  /** The provider said this cannot succeed on a retry at all — e.g. an unpaid account. */
  readonly permanent: boolean;
  constructor(message: string, status?: number, retryAfterMs?: number, permanent = false) {
    super(message);
    this.name = "TextModelError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.permanent = permanent;
  }
}

/**
 * Statuses where another attempt is the correct response: throttling and transient
 * upstream failures. This is the same set the Gemini SDK itself considers retryable.
 * 503 UNAVAILABLE ("this model is currently experiencing high demand") is the one
 * that actually shows up in practice, several times over a long meeting.
 */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Node fetch failure causes that mean "the connection broke", not "the request was wrong". */
const RETRYABLE_CAUSE = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "UND_ERR_SOCKET"]);

export interface RetryOptions {
  /** Total attempts, including the first one. */
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Longest provider-requested wait we are willing to sit out before giving up. */
  maxRetryAfterMs: number;
}

// Four attempts over ~3.5 s of backoff: a demand spike on the flash alias clears in
// seconds, and even the segment translation can absorb that (its card fills in late
// instead of reading "translation failed" forever).
//
// `maxRetryAfterMs` is what keeps a 429 from being made worse: the free tier answers
// an exhausted per-minute quota with "please retry in 46s", and four attempts 500 ms
// apart cannot succeed — they only spend four more requests out of the same empty
// bucket. Anything longer than this cap fails immediately, with the wait in the message.
const DEFAULT_RETRY: RetryOptions = {
  attempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 4000,
  maxRetryAfterMs: 8000,
};

/** HTTP status of a provider failure, when it had one. */
export function errorStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown })?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * The wait a provider asked for, in ms, read out of its error body. Google answers an
 * exhausted quota with both a `google.rpc.RetryInfo` detail and a "Please retry in
 * 46.410974692s." sentence; either one is enough.
 */
export function retryAfterMs(raw: string): number | undefined {
  const start = raw.indexOf("{");
  if (start >= 0) {
    try {
      const body = JSON.parse(raw.slice(start)) as {
        error?: { details?: Array<{ retryDelay?: unknown }> };
      };
      for (const detail of body?.error?.details ?? []) {
        const delay = detail?.retryDelay;
        if (typeof delay === "string") {
          const seconds = Number.parseFloat(delay);
          if (Number.isFinite(seconds)) return Math.round(seconds * 1000);
        }
      }
    } catch {
      // Fall through to the sentence.
    }
  }
  const match = /retry in\s+([\d.]+)\s*s/i.exec(raw);
  if (match) {
    const seconds = Number.parseFloat(match[1]);
    if (Number.isFinite(seconds)) return Math.round(seconds * 1000);
  }
  return undefined;
}

export function isRetryableError(err: unknown): boolean {
  // A 429 usually means "too fast", but from an unpaid account it means "never".
  if ((err as TextModelError)?.permanent) return false;
  const status = errorStatus(err);
  if (status !== undefined) return RETRYABLE_STATUS.has(status);
  // No status: either a broken connection (retry) or a local problem such as a
  // missing API key (never retry — it will not fix itself).
  const code = (err as { cause?: { code?: unknown } })?.cause?.code;
  if (typeof code === "string" && RETRYABLE_CAUSE.has(code)) return true;
  return err instanceof TypeError && /fetch failed|network/i.test(err.message);
}

/**
 * Turn a provider error into something a person can read. The Gemini SDK puts the
 * whole JSON error body in `Error.message`, so without this the UI shows
 * `{"error":{"code":503,"message":"…"}}` verbatim.
 */
export function describeProviderError(label: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const status = errorStatus(err);
  const text = readableBody(raw);
  return status ? `${label} ${status}: ${text}` : `${label}: ${text}`;
}

/**
 * Drop the "head to: <url>" sentences Google appends to a quota error. They double the
 * length of a message shown in a small error banner and tell the user nothing they can
 * act on in the app; the part that matters (which limit, which model, how long to wait)
 * is kept.
 */
function stripDocLinks(text: string): string {
  return text
    .replace(/\s*(?:For more information|To monitor)[^:]{0,60}(?:head to|read the docs):\s*\S+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Pull the human-readable sentence out of a provider's JSON error body. */
function readableBody(raw: string): string {
  const start = raw.indexOf("{");
  if (start < 0) return raw;
  try {
    const body = JSON.parse(raw.slice(start)) as {
      error?: { message?: unknown; status?: unknown } | string;
      message?: unknown;
    };
    const err = typeof body?.error === "object" ? body.error : undefined;
    const inner = err?.message ?? (typeof body?.error === "string" ? body.error : body?.message);
    if (typeof inner === "string" && inner.trim()) {
      const text = stripDocLinks(inner);
      const code = typeof err?.status === "string" ? err.status : "";
      return code ? `${text} [${code}]` : text;
    }
  } catch {
    // Not JSON after all — keep the original text.
  }
  return raw;
}

/** A non-OK HTTP response from a provider, as a readable, retry-classifiable error. */
function httpError(label: string, res: Response, body: string): TextModelError {
  const header = res.headers?.get?.("retry-after");
  const fromHeader = header ? Number.parseFloat(header) : NaN;
  const wait = Number.isFinite(fromHeader) ? Math.round(fromHeader * 1000) : retryAfterMs(body);
  // `insufficient_quota` is OpenAI's spent-balance 429. Unlike a rate limit it is a
  // billing state, so it must not consume the retry budget.
  const permanent = /insufficient_quota/i.test(body);
  return new TextModelError(`${label} ${res.status}: ${readableBody(body)}`, res.status, wait, permanent);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retry a provider call on transient failures, with exponential backoff and jitter.
 * The Gemini SDK ships a retry policy but only applies it when `httpOptions.retryOptions`
 * is set, and the OpenAI/Ollama paths are plain `fetch`, so retrying here covers all
 * three providers with one mechanism.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: Partial<RetryOptions> = {},
): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs, maxRetryAfterMs } = { ...DEFAULT_RETRY, ...opts };
  const budget = Math.max(1, attempts);
  let lastErr: unknown;
  let made = 0;
  for (let attempt = 1; attempt <= budget; attempt++) {
    made = attempt;
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= budget || !isRetryableError(err)) break;
      // When the provider named a wait, that wait is the only one that can work —
      // and if it is longer than we are prepared to sit out, stop now instead of
      // spending the rest of the budget on attempts that are certain to fail.
      const asked = (err as TextModelError)?.retryAfterMs;
      if (asked !== undefined && asked > maxRetryAfterMs) break;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = asked !== undefined ? asked + 100 : backoff * (0.5 + Math.random() * 0.5);
      console.warn(
        `⚠️ Text model attempt ${attempt}/${budget} failed (${errorStatus(err) ?? "network"}), ` +
        `retrying in ${Math.round(delay)} ms`,
      );
      await sleep(delay);
    }
  }
  // Say how hard we actually tried: for a 503 that distinguishes a blip from a real
  // outage. A single attempt needs no suffix — and must not claim more than it made.
  if (made > 1) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new TextModelError(
      `${msg} (${made} attempts)`,
      errorStatus(lastErr),
      (lastErr as TextModelError)?.retryAfterMs,
      (lastErr as TextModelError)?.permanent,
    );
  }
  throw lastErr;
}

// `gemini-flash-latest` is an alias that tracks the current Flash release. Pinned
// versions (gemini-2.0-flash, 2.5-pro, …) return HTTP 429 with `limit: 0` on
// free-tier keys — no quota is granted for them at all — so the alias is the only
// default that works without billing enabled.
const DEFAULT_MODEL: Record<Provider, string> = {
  gemini: "gemini-flash-latest",
  openai: "gpt-4o-mini",
  // Only a fallback — OpenRouter's whole point is picking the model yourself, so
  // SUMMARY_MODEL is expected to be set. Ids are "<vendor>/<model>".
  openrouter: "openai/gpt-4o-mini",
  ollama: "llama3.1",
};

const DEFAULT_BASE_URL: Record<Provider, string> = {
  gemini: "",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
};

/** Which of the two text jobs a config is for. See the module comment. */
export type TextRole = "summary" | "translate";

function providerFromEnv(raw: string | undefined): Provider {
  const name = (raw || "gemini").toLowerCase();
  return name === "openai" || name === "ollama" || name === "openrouter" ? name : "gemini";
}

/** The key a provider uses when no explicit *_API_KEY was given. */
function fallbackKeyFor(provider: Provider): string {
  switch (provider) {
    case "gemini":     return process.env.GEMINI_API_KEY || "";
    case "openai":     return process.env.OPENAI_API_KEY || "";
    case "openrouter": return process.env.OPENROUTER_API_KEY || "";
    default:           return "";
  }
}

function configFor(prefix: "SUMMARY" | "TRANSLATE"): TextModelConfig {
  const provider = providerFromEnv(process.env[`${prefix}_PROVIDER`]);
  return {
    provider,
    model: process.env[`${prefix}_MODEL`] || DEFAULT_MODEL[provider],
    apiKey: process.env[`${prefix}_API_KEY`] || fallbackKeyFor(provider),
    baseUrl: process.env[`${prefix}_BASE_URL`] || DEFAULT_BASE_URL[provider],
  };
}

export function resolveConfig(role: TextRole = "summary"): TextModelConfig {
  // Only a TRANSLATE_PROVIDER splits the two apart; see the module comment for why
  // this is all-or-nothing rather than field-by-field.
  if (role === "translate" && process.env.TRANSLATE_PROVIDER) return configFor("TRANSLATE");
  return configFor("SUMMARY");
}

async function runGemini(cfg: TextModelConfig, prompt: string): Promise<string> {
  if (!cfg.apiKey) throw new Error("Missing API key for Gemini text model (SUMMARY_API_KEY or GEMINI_API_KEY).");
  const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
  let response;
  try {
    response = await ai.models.generateContent({ model: cfg.model, contents: prompt });
  } catch (err) {
    // The SDK's ApiError carries the HTTP status but stuffs the entire JSON error
    // body into `message`, which would otherwise be shown to the user as-is.
    const raw = err instanceof Error ? err.message : String(err);
    throw new TextModelError(describeProviderError("Gemini", err), errorStatus(err), retryAfterMs(raw));
  }
  const text = response.text;
  if (!text) throw new Error("Empty response from Gemini.");
  return text;
}

/** Extract plain text from an OpenAI Responses API result. */
function extractResponsesText(data: unknown): string {
  const d = data as { output_text?: unknown; output?: unknown };
  if (typeof d?.output_text === "string" && d.output_text) return d.output_text;
  const out = d?.output;
  if (Array.isArray(out)) {
    const parts: string[] = [];
    for (const item of out) {
      const content = (item as { content?: unknown })?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const part = c as { type?: unknown; text?: unknown };
          if (part?.type === "output_text" && typeof part.text === "string") parts.push(part.text);
        }
      }
    }
    if (parts.length) return parts.join("");
  }
  return "";
}

async function runOpenAI(cfg: TextModelConfig, prompt: string): Promise<string> {
  if (!cfg.apiKey) throw new Error("Missing API key for OpenAI text model (SUMMARY_API_KEY or OPENAI_API_KEY).");
  // The Responses API works for both legacy and newer models (some of which are
  // not available on /chat/completions).
  const res = await fetch(`${cfg.baseUrl}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, input: prompt }),
  });
  if (!res.ok) throw httpError("OpenAI", res, await res.text());
  const text = extractResponsesText(await res.json());
  if (!text) throw new Error("Empty response from OpenAI.");
  return text;
}

/** `choices[0].message.content` out of an OpenAI-style chat completion. */
export function extractChatText(data: unknown): string {
  const choices = (data as { choices?: unknown })?.choices;
  if (!Array.isArray(choices)) return "";
  const content = (choices[0] as { message?: { content?: unknown } })?.message?.content;
  return typeof content === "string" ? content : "";
}

/**
 * OpenRouter speaks the OpenAI *chat completions* dialect, not the Responses API the
 * `openai` provider uses — pointing SUMMARY_BASE_URL at it with provider "openai"
 * only earns a 404. Hence its own branch rather than a shared OpenAI-compatible one.
 */
async function runOpenRouter(cfg: TextModelConfig, prompt: string): Promise<string> {
  if (!cfg.apiKey) throw new Error("Missing API key for OpenRouter text model (SUMMARY_API_KEY or OPENROUTER_API_KEY).");
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      // OpenRouter attributes requests with these; harmless and it keeps the app
      // identifiable in the account's usage breakdown.
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "LiveTranslate",
    },
    body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw httpError("OpenRouter", res, await res.text());
  const text = extractChatText(await res.json());
  if (!text) throw new Error("Empty response from OpenRouter.");
  return text;
}

async function runOllama(cfg: TextModelConfig, prompt: string): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: prompt }], stream: false }),
  });
  if (!res.ok) throw httpError("Ollama", res, await res.text());
  const data = await res.json() as { message?: { content?: string } };
  const text = data?.message?.content;
  if (!text) throw new Error("Empty response from Ollama.");
  return text;
}

/**
 * Dispatch a prompt to the configured provider and return the raw text, retrying
 * transient failures. Every text-model consumer goes through here, so the retry
 * covers the title, the summary and the per-segment translation alike.
 */
export function runPrompt(
  cfg: TextModelConfig,
  prompt: string,
  retry: Partial<RetryOptions> = {},
): Promise<string> {
  return withRetry(() => {
    switch (cfg.provider) {
      case "openai":     return runOpenAI(cfg, prompt);
      case "openrouter": return runOpenRouter(cfg, prompt);
      case "ollama":     return runOllama(cfg, prompt);
      default:       return runGemini(cfg, prompt);
    }
  }, retry);
}

/** Run a prompt on the text model configured for this job. */
export function runTextPrompt(prompt: string, role: TextRole = "summary"): Promise<string> {
  return runPrompt(resolveConfig(role), prompt);
}
