import { GoogleGenAI } from "@google/genai";

/**
 * Conversation-summary provider. Fully configurable via env so the summary can
 * run on a different provider/key/model than the live translation:
 *
 *   SUMMARY_PROVIDER  gemini | openai | ollama   (default: gemini)
 *   SUMMARY_MODEL     model id                    (provider-specific default)
 *   SUMMARY_API_KEY   key                         (falls back to GEMINI/OPENAI key)
 *   SUMMARY_BASE_URL  base URL                    (OpenAI-compatible / Ollama host)
 */
type Provider = "gemini" | "openai" | "ollama";

interface SummaryConfig {
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl: string;
}

const DEFAULT_MODEL: Record<Provider, string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  ollama: "llama3.1",
};

const DEFAULT_BASE_URL: Record<Provider, string> = {
  gemini: "",
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434",
};

function resolveConfig(): SummaryConfig {
  const raw = (process.env.SUMMARY_PROVIDER || "gemini").toLowerCase();
  const provider: Provider = raw === "openai" || raw === "ollama" ? raw : "gemini";
  const fallbackKey =
    provider === "gemini" ? process.env.GEMINI_API_KEY
    : provider === "openai" ? process.env.OPENAI_API_KEY
    : "";
  return {
    provider,
    model: process.env.SUMMARY_MODEL || DEFAULT_MODEL[provider],
    apiKey: process.env.SUMMARY_API_KEY || fallbackKey || "",
    baseUrl: process.env.SUMMARY_BASE_URL || DEFAULT_BASE_URL[provider],
  };
}

function buildPrompt(transcript: string, lang: string): string {
  return lang === "hu"
    ? `Foglald össze tömören, lényegre törően az alábbi tolmácsolt beszélgetést magyarul. Emeld ki a fő témákat, a fontos pontokat és a teendőket, ha vannak. Ne ismételd szó szerint a szöveget.\n\n--- BESZÉLGETÉS ---\n${transcript}`
    : `Summarize the following interpreted conversation concisely in English. Highlight the main topics, key points, and any action items. Do not repeat the text verbatim.\n\n--- CONVERSATION ---\n${transcript}`;
}

async function summarizeGemini(cfg: SummaryConfig, prompt: string): Promise<string> {
  if (!cfg.apiKey) throw new Error("Missing API key for Gemini summary (SUMMARY_API_KEY or GEMINI_API_KEY).");
  const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
  const response = await ai.models.generateContent({ model: cfg.model, contents: prompt });
  const text = response.text;
  if (!text) throw new Error("Empty summary response from Gemini.");
  return text;
}

/** Extract plain text from an OpenAI Responses API result. */
function extractResponsesText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  const out = data?.output;
  if (Array.isArray(out)) {
    const parts: string[] = [];
    for (const item of out) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
        }
      }
    }
    if (parts.length) return parts.join("");
  }
  return "";
}

async function summarizeOpenAI(cfg: SummaryConfig, prompt: string): Promise<string> {
  if (!cfg.apiKey) throw new Error("Missing API key for OpenAI summary (SUMMARY_API_KEY or OPENAI_API_KEY).");
  // The Responses API works for both legacy and newer models (some of which are
  // not available on /chat/completions).
  const res = await fetch(`${cfg.baseUrl}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, input: prompt }),
  });
  if (!res.ok) throw new Error(`OpenAI summary HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = extractResponsesText(data);
  if (!text) throw new Error("Empty summary response from OpenAI.");
  return text;
}

async function summarizeOllama(cfg: SummaryConfig, prompt: string): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: prompt }], stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama summary HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.message?.content;
  if (!text) throw new Error("Empty summary response from Ollama.");
  return text;
}

/**
 * Generates a concise summary of an interpreted conversation transcript using
 * the configured provider. `lang` selects the summary language ("hu" → Hungarian,
 * otherwise English).
 */
export async function generateSummary(transcript: string, lang: string): Promise<string> {
  const cfg = resolveConfig();
  const prompt = buildPrompt(transcript, lang);
  return runPrompt(cfg, prompt);
}

/** Dispatch a prompt to the configured provider and return the raw text. */
function runPrompt(cfg: SummaryConfig, prompt: string): Promise<string> {
  switch (cfg.provider) {
    case "openai": return summarizeOpenAI(cfg, prompt);
    case "ollama": return summarizeOllama(cfg, prompt);
    default:       return summarizeGemini(cfg, prompt);
  }
}

/**
 * Generates a very short, filename-friendly subject/title for a conversation,
 * used when saving the transcript into an Obsidian vault. Returns a single line
 * of plain text (the caller sanitizes it for the filesystem).
 */
export async function generateSubject(transcript: string): Promise<string> {
  const cfg = resolveConfig();
  const prompt =
    `Based on the following interpreted conversation, produce a very short, descriptive ` +
    `title of 3 to 7 words that captures the main topic. Reply with ONLY the title — no ` +
    `quotes, no surrounding punctuation, no file extension, no explanation.\n\n` +
    `--- CONVERSATION ---\n${transcript}`;
  const text = await runPrompt(cfg, prompt);
  // Keep the first non-empty line only; strip wrapping quotes/backticks.
  return text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0)
    ?.replace(/^["'`]+|["'`]+$/g, "")
    .trim() ?? "";
}
