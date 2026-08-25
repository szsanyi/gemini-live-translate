/**
 * Stored-session shape and its (de)serialization.
 *
 * Importable from both the browser and the server — no Node imports here.
 *
 * The whole reason this module exists: `TranslationPair`, `NoteEntry` and
 * `SummaryEntry` carry real `Date` objects, and JSON silently turns those into
 * strings. A session revived without converting them back looks fine until
 * `buildTranscriptBlocks` calls `.getTime()` on a string and every export path
 * breaks. Serialization is therefore centralised and unit-tested; nothing else may
 * hand-roll it.
 */
import type {
  TranslationPair,
  NoteEntry,
  SummaryEntry,
  AudioSourceType,
} from "../src/types.ts";
import { type CorrectionRule, parseRules, serializeRule } from "./corrections.ts";

export const SESSION_VERSION = 1;

/** The session settings in effect for the most recent run of a session. */
export interface StoredProfile {
  model: string;
  sourceLang: string;
  targetLang: string;
  bidirectional: boolean;
  translate: boolean;
  speak: boolean;
  audioSource: AudioSourceType;
}

/** A complete stored session, with live `Date` objects. */
export interface SessionData {
  version: number;
  id: string;
  createdAt: Date;
  updatedAt: Date;
  /** Name of the recording: user-typed or AI-generated. Null while unnamed. */
  title: string | null;
  /** Free-form tags. Also written into the Obsidian note's frontmatter. */
  tags: string[];
  /** Corrections taught while working on this recording. */
  corrections: CorrectionRule[];
  profile: StoredProfile;
  /**
   * Total recorded time so far. New segments in a resumed session are offset by
   * this, so subtitle cues stay monotonic instead of restarting at zero.
   */
  elapsedMs: number;
  pairs: TranslationPair[];
  notes: NoteEntry[];
  summaries: SummaryEntry[];
  /** Path of the Obsidian note written for this session, if any. */
  obsidianPath: string | null;
  hasAudio: boolean;
}

/** Listing entry — enough to render the library without loading transcripts. */
export interface SessionSummary {
  id: string;
  title: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  profile: StoredProfile;
  elapsedMs: number;
  pairCount: number;
  noteCount: number;
  summaryCount: number;
  hasAudio: boolean;
}

// ─── Serialization ───────────────────────────────────────────────────────────

const iso = (d: Date): string => d.toISOString();

/** Convert a session to a JSON-safe object. */
export function serializeSession(s: SessionData): unknown {
  return {
    version: SESSION_VERSION,
    id: s.id,
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
    title: s.title,
    tags: s.tags,
    corrections: s.corrections.map(serializeRule),
    profile: s.profile,
    elapsedMs: s.elapsedMs,
    pairs: s.pairs.map((p) => ({ ...p, timestamp: iso(p.timestamp) })),
    notes: s.notes.map((n) => ({ ...n, timestamp: iso(n.timestamp) })),
    summaries: s.summaries.map((x) => ({ ...x, timestamp: iso(x.timestamp) })),
    obsidianPath: s.obsidianPath,
    hasAudio: s.hasAudio,
  };
}

function asDate(v: unknown, field: string): Date {
  const d = new Date(typeof v === "string" || typeof v === "number" ? v : NaN);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date in "${field}"`);
  return d;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Normalise a tag list: trimmed, de-duplicated case-insensitively, order kept.
 * Tags end up in Obsidian frontmatter, where duplicates and stray whitespace are
 * noise rather than data.
 */
export function normalizeTags(v: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of asArray(v)) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function parseProfile(v: unknown): StoredProfile {
  const p = (v ?? {}) as Record<string, unknown>;
  const audioSource = p.audioSource === "tab-audio" ? "tab-audio" : "microphone";
  return {
    model: asString(p.model),
    sourceLang: asString(p.sourceLang, "hu"),
    targetLang: asString(p.targetLang, "en"),
    bidirectional: asBool(p.bidirectional),
    // Older files predate these flags; the original behaviour was interpreter mode.
    translate: asBool(p.translate, true),
    speak: asBool(p.speak, true),
    audioSource: audioSource as AudioSourceType,
  };
}

function parsePair(v: unknown): TranslationPair {
  const p = (v ?? {}) as Record<string, unknown>;
  const pair: TranslationPair = {
    id: asString(p.id) || Math.random().toString(),
    originalText: asString(p.originalText),
    translatedText: asString(p.translatedText),
    sourceLang: asString(p.sourceLang, "hu"),
    targetLang: asString(p.targetLang, "en"),
    timestamp: asDate(p.timestamp, "pair.timestamp"),
  };
  if (typeof p.bidirectional === "boolean") pair.bidirectional = p.bidirectional;
  if (typeof p.speaker === "string" && p.speaker.trim()) pair.speaker = p.speaker.trim();
  if (typeof p.startMs === "number") pair.startMs = p.startMs;
  if (typeof p.endMs === "number") pair.endMs = p.endMs;
  // isStreaming is transient UI state — a stored session is never mid-request.
  return pair;
}

function parseNote(v: unknown): NoteEntry {
  const n = (v ?? {}) as Record<string, unknown>;
  const note: NoteEntry = {
    id: asString(n.id) || Math.random().toString(),
    text: asString(n.text),
    timestamp: asDate(n.timestamp, "note.timestamp"),
  };
  if (typeof n.pairId === "string") note.pairId = n.pairId;
  return note;
}

/** One AI-generated conversation summary (not to be confused with SessionSummary,
 *  which is a library listing entry). */
function parseSummaryEntry(v: unknown): SummaryEntry {
  const s = (v ?? {}) as Record<string, unknown>;
  return {
    id: asString(s.id) || Math.random().toString(),
    en: asString(s.en),
    hu: asString(s.hu),
    timestamp: asDate(s.timestamp, "summary.timestamp"),
  };
}

/**
 * Revive a stored session. Throws when the payload is not a usable session, so a
 * corrupt file is reported rather than silently yielding an empty transcript.
 */
export function parseSession(raw: unknown): SessionData {
  if (!raw || typeof raw !== "object") throw new Error("Session is not an object");
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (!id) throw new Error("Session has no id");

  return {
    version: asNumber(r.version, SESSION_VERSION),
    id,
    createdAt: asDate(r.createdAt, "createdAt"),
    updatedAt: asDate(r.updatedAt, "updatedAt"),
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : null,
    tags: normalizeTags(r.tags),
    corrections: parseRules(r.corrections),
    profile: parseProfile(r.profile),
    elapsedMs: asNumber(r.elapsedMs),
    pairs: asArray(r.pairs).map(parsePair),
    notes: asArray(r.notes).map(parseNote),
    summaries: asArray(r.summaries).map(parseSummaryEntry),
    obsidianPath: typeof r.obsidianPath === "string" && r.obsidianPath ? r.obsidianPath : null,
    hasAudio: asBool(r.hasAudio),
  };
}

/** Reduce a full session to its listing entry. */
export function toSummary(s: SessionData): SessionSummary {
  return {
    id: s.id,
    title: s.title,
    tags: s.tags,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    profile: s.profile,
    elapsedMs: s.elapsedMs,
    pairCount: s.pairs.length,
    noteCount: s.notes.length,
    summaryCount: s.summaries.length,
    hasAudio: s.hasAudio,
  };
}

/** JSON-safe listing entry. */
export function serializeSessionSummary(s: SessionSummary): unknown {
  return { ...s, createdAt: iso(s.createdAt), updatedAt: iso(s.updatedAt) };
}

/** Revive a listing entry received by the browser. */
export function parseSessionSummary(raw: unknown): SessionSummary {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: asString(r.id),
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : null,
    tags: normalizeTags(r.tags),
    createdAt: asDate(r.createdAt, "createdAt"),
    updatedAt: asDate(r.updatedAt, "updatedAt"),
    profile: parseProfile(r.profile),
    elapsedMs: asNumber(r.elapsedMs),
    pairCount: asNumber(r.pairCount),
    noteCount: asNumber(r.noteCount),
    summaryCount: asNumber(r.summaryCount),
    hasAudio: asBool(r.hasAudio),
  };
}

// ─── Ids ─────────────────────────────────────────────────────────────────────

/**
 * Session ids double as directory names, so they are validated before ever
 * touching the filesystem — an unchecked id would be a path-traversal primitive
 * with a delete endpoint behind it.
 */
const ID_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[a-z0-9]{4}$/;

export function isValidSessionId(id: string): boolean {
  return ID_RE.test(id);
}

/** Create a chronologically sortable, collision-resistant session id. */
export function newSessionId(when: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  // The year is padded too: a caller passing a date with a year below 1000 (a
  // half-typed year in a date input parses to exactly that) would otherwise mint
  // an id that isValidSessionId rejects, and every autosave for it would 400.
  const stamp =
    `${String(when.getFullYear()).padStart(4, "0")}-${p(when.getMonth() + 1)}-${p(when.getDate())}` +
    `T${p(when.getHours())}-${p(when.getMinutes())}-${p(when.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `${stamp}-${rand}`;
}
