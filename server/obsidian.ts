import fs from "fs/promises";
import path from "path";

/**
 * Writes a conversation transcript into an Obsidian vault as a Markdown note.
 *
 * Layout (configurable via the OBSIDIAN_VAULT_DIR env var):
 *   <vault>/<YYYY-MM-DD>/<YYYY-MM-DD HH-MM subject>.md
 *
 * The file gets YAML frontmatter (title/date/time/tags) so Obsidian can index
 * and search it. Nothing is prompted — the caller decides when to save.
 *
 * When `existingPath` points to a note previously written into this vault, the
 * file is updated in place (same name, same date/time frontmatter parsed from
 * the filename) instead of creating a new dated variant.
 */

const DEFAULT_VAULT_DIR = "/home/sanyi/Dokumentumok/Obsidian Vault (Work)/meetings/";

/** Matches the note filename scheme: "YYYY-MM-DD HH-MM subject.md". */
const NOTE_NAME_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2}) (.+)\.md$/;

/** Strip characters that are illegal in filenames and collapse whitespace. */
function sanitizeFilename(s: string): string {
  return s
    .replace(/[\/\\:*?"<>|\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Assemble the note file contents: Obsidian YAML frontmatter + Markdown body. */
function buildContent(dateStr: string, hh: string, mm: string, subject: string, markdown: string): string {
  const frontmatter = [
    "---",
    `title: "${subject.replace(/"/g, "'")}"`,
    `date: ${dateStr}`,
    `time: "${hh}:${mm}"`,
    "tags:",
    "  - meeting",
    "  - livetranslate",
    "---",
    "",
    "",
  ].join("\n");
  return frontmatter + markdown;
}

export interface ObsidianSaveResult {
  path: string;
  subject: string;
  /** True when an existing note was overwritten rather than a new one created. */
  updated: boolean;
}

export async function saveToObsidian(
  markdown: string,
  subject: string,
  existingPath?: string,
  when: Date = new Date(),
): Promise<ObsidianSaveResult> {
  const vaultDir = process.env.OBSIDIAN_VAULT_DIR || DEFAULT_VAULT_DIR;
  const resolvedVault = path.resolve(vaultDir);

  // Update in place when a valid prior path inside this vault is supplied.
  if (existingPath) {
    const resolved = path.resolve(existingPath);
    const base = path.basename(resolved);
    const m = base.match(NOTE_NAME_RE);
    if (m && (resolved === resolvedVault || resolved.startsWith(resolvedVault + path.sep))) {
      const [, dateStr, hh, mm, existingSubject] = m;
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, buildContent(dateStr, hh, mm, existingSubject, markdown), "utf-8");
      return { path: resolved, subject: existingSubject, updated: true };
    }
  }

  // Fresh save.
  const dateStr = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const hh = pad(when.getHours());
  const mm = pad(when.getMinutes());
  const timeStr = `${hh}-${mm}`;

  const cleanSubject = sanitizeFilename(subject) || "meeting";
  const dir = path.join(vaultDir, dateStr);
  await fs.mkdir(dir, { recursive: true });

  const filename = `${dateStr} ${timeStr} ${cleanSubject}.md`;
  const filePath = path.join(dir, filename);

  await fs.writeFile(filePath, buildContent(dateStr, hh, mm, cleanSubject, markdown), "utf-8");
  return { path: filePath, subject: cleanSubject, updated: false };
}
