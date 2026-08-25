import { runTextPrompt } from "./textModel.ts";

/**
 * Conversation-summary provider. The provider/key/model plumbing lives in
 * textModel.ts (env: SUMMARY_PROVIDER / SUMMARY_MODEL / SUMMARY_API_KEY /
 * SUMMARY_BASE_URL); this module only owns the prompts.
 */

/** Shortest and longest summary we ever ask for, in words. */
export const SUMMARY_MIN_WORDS = 120;
export const SUMMARY_MAX_WORDS = 1000;

/**
 * One summary word per this many transcript words. The summarizer input carries both
 * the source and the translation, so a spoken minute (~150 words) arrives as ~300 —
 * making a 40-minute meeting ~12 000 words in, ~600 words out.
 */
const COMPRESSION_RATIO = 20;

/** One bullet point per this many transcript words. */
const WORDS_PER_BULLET = 500;
export const SUMMARY_MIN_BULLETS = 4;
export const SUMMARY_MAX_BULLETS = 30;

export interface SummaryDepth {
  targetWords: number;
  /** Minimum bullet points asked for — the lever the model actually follows. */
  bullets: number;
  sections: number;
  /** Prompt fragment describing the expected shape, length and the no-padding rule. */
  shape: string;
}

/**
 * How much summary a transcript deserves.
 *
 * Without this the prompt said only "concisely", so a two-minute exchange and a
 * forty-minute meeting both came back as the same short paragraph — the long meeting
 * lost most of its content. Length scales with the transcript, but the instruction
 * also forbids padding: a long recording that genuinely says little must still yield a
 * short summary, which is the caveat that makes scaling safe.
 */
export function summaryDepth(transcript: string): SummaryDepth {
  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const scaledWords = Math.round(words / COMPRESSION_RATIO / 10) * 10;
  const targetWords = Math.min(SUMMARY_MAX_WORDS, Math.max(SUMMARY_MIN_WORDS, scaledWords));
  const bullets = Math.min(
    SUMMARY_MAX_BULLETS,
    Math.max(SUMMARY_MIN_BULLETS, Math.round(words / WORDS_PER_BULLET)),
  );
  const sections = Math.min(8, Math.max(2, Math.round(bullets / 5)));

  // Measured: a word target alone is a weak lever — asking flash-lite for 520 words
  // returned 212. A minimum item count and an explicit coverage rule are what the model
  // actually follows, so the counts lead and the word figure is only a floor.
  const structure = bullets <= SUMMARY_MIN_BULLETS
    ? `Write at least ${bullets} bullet points.`
    : `Write at least ${bullets} bullet points, grouped under ${sections} topic headings, ` +
      `followed by separate "Decisions" and "Action items" lists whenever the conversation ` +
      `contains any.`;

  return {
    targetWords,
    bullets,
    sections,
    shape:
      `${structure} Use at least ${targetWords} words in total. Cover every distinct topic, ` +
      `decision, commitment, name, number and open question that was actually discussed — a ` +
      `long meeting must not be reduced to a handful of generic lines. If the conversation ` +
      `genuinely contains fewer distinct points than that, give fewer: never invent, pad or ` +
      `repeat, and never restate the transcript verbatim.`,
  };
}

function buildPrompt(transcript: string, lang: string): string {
  const { shape } = summaryDepth(transcript);
  return lang === "hu"
    ? `Foglald össze lényegre törően az alábbi tolmácsolt beszélgetést magyarul. Emeld ki a fő témákat, a fontos pontokat és a teendőket, ha vannak. Ne ismételd szó szerint a szöveget.\n\n${shape}\n\n--- BESZÉLGETÉS ---\n${transcript}`
    : `Summarize the following interpreted conversation in English. Highlight the main topics, key points, and any action items. Do not repeat the text verbatim.\n\n${shape}\n\n--- CONVERSATION ---\n${transcript}`;
}

/**
 * Generates a concise summary of an interpreted conversation transcript using
 * the configured provider. `lang` selects the summary language ("hu" → Hungarian,
 * otherwise English).
 */
export async function generateSummary(transcript: string, lang: string): Promise<string> {
  return runTextPrompt(buildPrompt(transcript, lang));
}

/**
 * Generates a very short, filename-friendly subject/title for a conversation,
 * used when saving the transcript into an Obsidian vault. Returns a single line
 * of plain text (the caller sanitizes it for the filesystem).
 */
export async function generateSubject(transcript: string): Promise<string> {
  const prompt =
    `Based on the following interpreted conversation, produce a very short, descriptive ` +
    `title of 3 to 7 words that captures the main topic. Reply with ONLY the title — no ` +
    `quotes, no surrounding punctuation, no file extension, no explanation.\n\n` +
    `--- CONVERSATION ---\n${transcript}`;
  const text = await runTextPrompt(prompt);
  // Keep the first non-empty line only; strip wrapping quotes/backticks.
  return firstLine(text);
}

export interface SummaryBundle {
  en: string;
  hu: string;
  subject: string;
}

/**
 * Both summaries and the title from a **single** request.
 *
 * Three parallel calls used to be free, and on a paid key they are. On the free tier
 * they are not: the quota is counted in requests per minute (measured: `limit: 5` for
 * `generate_content_free_tier_requests`), so one summary click spent 3 of the 5 and a
 * second click inside the same minute was guaranteed to fail with 429 RESOURCE_EXHAUSTED.
 * One request for all three is the difference between the feature working and not.
 *
 * The caller falls back to the per-language prompts for whatever comes back empty, so a
 * model that ignores the section headers degrades to the old cost instead of to nothing.
 */
export async function generateSummaryBundle(transcript: string): Promise<SummaryBundle> {
  const { shape } = summaryDepth(transcript);
  const prompt =
    `Summarize the following interpreted conversation twice — once in English, once in ` +
    `Hungarian — and give it a short title. Highlight the main topics, key points and any ` +
    `action items. Do not repeat the text verbatim.\n\n` +
    `${shape} The two summaries must cover the same ground at the same length.\n\n` +
    `Reply in exactly this format, with these three headers and nothing else:\n\n` +
    `### SUMMARY (EN)\n<the English summary>\n\n` +
    `### SUMMARY (HU)\n<the same summary in Hungarian>\n\n` +
    `### TITLE\n<a descriptive title of 3 to 7 words, plain text, no quotes>\n\n` +
    `--- CONVERSATION ---\n${transcript}`;
  return parseSummaryBundle(await runTextPrompt(prompt));
}

/** First non-empty line, without wrapping quotes or backticks. */
function firstLine(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0)
    ?.replace(/^["'`]+|["'`]+$/g, "")
    .trim() ?? "";
}

/**
 * Split a bundled response into its three parts. Deliberately tolerant: header depth,
 * casing, a chatty preamble and stray blank lines are all accepted, and a section that
 * isn't there comes back as "" rather than as some neighbouring text.
 */
export function parseSummaryBundle(text: string): SummaryBundle {
  const HEADER_RE = /^\s{0,3}#{1,6}\s*(summary\s*\(\s*(en|hu)\s*\)|title)\s*$/i;
  const found: Record<string, string[]> = {};
  let current: string | null = null;

  for (const line of text.split("\n")) {
    const match = HEADER_RE.exec(line);
    if (match) {
      current = match[2] ? match[2].toLowerCase() : "title";
      found[current] ??= [];
      continue;
    }
    if (current) found[current].push(line);
  }

  const section = (key: string) => (found[key] ?? []).join("\n").trim();
  return {
    en: section("en"),
    hu: section("hu"),
    subject: firstLine(section("title")),
  };
}
