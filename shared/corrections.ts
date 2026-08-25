/**
 * Speech-recognition corrections: "what the transcript said" → "what was meant".
 *
 * Importable from both the browser and the server — no Node imports.
 *
 * Two mechanisms, because they do different jobs (both verified by probe):
 *
 *  - **Substitution** is the only thing that fixes the transcript itself. The ASR
 *    behind `inputAudioTranscription` ignores the system instruction entirely —
 *    a glossary, however forceful, left "coals" as "coals".
 *  - **The glossary** fixes the model's own output. With the same glossary in the
 *    system instruction, the translation correctly said "Kohl's" even while the
 *    transcript still read "coals".
 *
 * So a rule is applied as text substitution *and* passed to the model as a
 * glossary; neither alone is enough.
 */

export interface CorrectionRule {
  id: string;
  /** What the transcript wrongly contained. */
  heard: string;
  /** What the speaker actually meant. */
  meant: string;
  /** Also kept in the global dictionary, so it applies to every future recording. */
  global: boolean;
  createdAt: Date;
}

/** Escape a string for literal use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the matcher for one rule.
 *
 * Boundaries are Unicode-aware lookarounds rather than `\b`: JavaScript's `\b` is
 * defined by ASCII `\w`, so `\bmély\b` would treat the "é" as a boundary and match
 * inside unrelated words. Hungarian transcripts make this immediately wrong.
 */
function ruleRegex(heard: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(heard)}(?![\\p{L}\\p{N}])`, "giu");
}

/** Copy the first character's case from the text being replaced. */
function matchLeadingCase(match: string, replacement: string): string {
  const first = match[0];
  if (!first || !replacement) return replacement;
  const isUpper = first === first.toUpperCase() && first !== first.toLowerCase();
  if (!isUpper) return replacement;
  return replacement[0].toUpperCase() + replacement.slice(1);
}

/**
 * Order rules so longer phrases win. Without this, a rule for "mély" would eat
 * part of "marad mély" and the longer, more specific correction could never fire.
 */
export function sortRules(rules: CorrectionRule[]): CorrectionRule[] {
  return [...rules].sort((a, b) => b.heard.length - a.heard.length);
}

/**
 * Apply every rule to a piece of text. Matching is case-insensitive and
 * whole-word; the replacement keeps the original's leading capital so a
 * mid-sentence fix doesn't lower-case the start of a sentence.
 */
export function applyCorrections(text: string, rules: CorrectionRule[]): string {
  if (!text || rules.length === 0) return text;
  let out = text;
  for (const rule of sortRules(rules)) {
    if (!rule.heard.trim() || !rule.meant.trim()) continue;
    out = out.replace(ruleRegex(rule.heard), (m) => matchLeadingCase(m, rule.meant));
  }
  return out;
}

/** True when any rule would change the text. */
export function hasCorrection(text: string, rules: CorrectionRule[]): boolean {
  return applyCorrections(text, rules) !== text;
}

/**
 * Prompt fragment naming the correct forms, for the Live system instruction and
 * the text-translation prompt. Returns "" when there is nothing to say, so
 * callers can concatenate unconditionally.
 */
export function buildGlossary(rules: Array<Pick<CorrectionRule, "heard" | "meant">>): string {
  const usable = rules.filter((r) => r.heard.trim() && r.meant.trim());
  if (usable.length === 0) return "";
  const lines = usable.map((r) => `  - "${r.meant}" (may sound like, or be misheard as, "${r.heard}")`);
  return (
    "\n\nGLOSSARY — the speaker uses these exact terms. Whenever you hear something " +
    "similar, use the form on the left and never the misheard variant:\n" +
    lines.join("\n")
  );
}

/** De-duplicate rules by their `heard` side, keeping the newest. */
export function dedupeRules(rules: CorrectionRule[]): CorrectionRule[] {
  const byHeard = new Map<string, CorrectionRule>();
  for (const rule of rules) {
    const key = rule.heard.trim().toLowerCase();
    if (!key) continue;
    const existing = byHeard.get(key);
    if (!existing || rule.createdAt.getTime() >= existing.createdAt.getTime()) {
      byHeard.set(key, rule);
    }
  }
  return [...byHeard.values()];
}

// ─── Serialization ───────────────────────────────────────────────────────────

export function serializeRule(r: CorrectionRule): unknown {
  return { id: r.id, heard: r.heard, meant: r.meant, global: r.global, createdAt: r.createdAt.toISOString() };
}

export function parseRule(raw: unknown): CorrectionRule | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const heard = typeof r.heard === "string" ? r.heard.trim() : "";
  const meant = typeof r.meant === "string" ? r.meant.trim() : "";
  // A rule missing either side can only cause damage, so drop it rather than
  // storing something that matches everything or replaces with nothing.
  if (!heard || !meant) return null;
  const created = new Date(typeof r.createdAt === "string" ? r.createdAt : NaN);
  return {
    id: typeof r.id === "string" && r.id ? r.id : Math.random().toString(36).slice(2),
    heard,
    meant,
    global: r.global === true,
    createdAt: Number.isNaN(created.getTime()) ? new Date() : created,
  };
}

export function parseRules(raw: unknown): CorrectionRule[] {
  if (!Array.isArray(raw)) return [];
  const out: CorrectionRule[] = [];
  for (const item of raw) {
    const rule = parseRule(item);
    if (rule) out.push(rule);
  }
  return out;
}
