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

/**
 * Default vault location: a folder inside the project, so a fresh checkout can
 * save notes without any configuration. Point OBSIDIAN_VAULT_DIR at a real
 * Obsidian vault to write there instead.
 *
 * Deliberately not an absolute path under /home — a hardcoded home directory
 * fails with EACCES on any machine whose user differs.
 */
const DEFAULT_VAULT_DIR = path.join(process.cwd(), "data", "vault", "meetings");

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

/**
 * Obsidian tags cannot contain spaces — a "client call" tag would be read as the
 * tag "client" followed by loose text. Convert to dashes and strip characters
 * Obsidian does not accept in a tag.
 */
function obsidianTag(tag: string): string {
  return tag
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_\-/]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Assemble the note file contents: Obsidian YAML frontmatter + Markdown body. */
function buildContent(
  dateStr: string,
  hh: string,
  mm: string,
  subject: string,
  markdown: string,
  tags: string[] = [],
): string {
  // The user's own tags join the two the app always applies.
  const own = tags.map(obsidianTag).filter(Boolean);
  const all = ["meeting", "livetranslate", ...own.filter((x) => x !== "meeting" && x !== "livetranslate")];
  const frontmatter = [
    "---",
    `title: "${subject.replace(/"/g, "'")}"`,
    `date: ${dateStr}`,
    `time: "${hh}:${mm}"`,
    "tags:",
    ...all.map((x) => `  - ${x}`),
    "---",
    "",
    "",
  ].join("\n");
  return frontmatter + markdown;
}

/** Absolute, resolved path of the configured vault. */
function resolvedVault(): string {
  return path.resolve(process.env.OBSIDIAN_VAULT_DIR || DEFAULT_VAULT_DIR);
}

/** True when `p` sits inside the configured vault. */
function insideVault(p: string): boolean {
  const vault = resolvedVault();
  return p === vault || p.startsWith(vault + path.sep);
}

/**
 * Delete a note this app previously wrote.
 *
 * Used when a recording is deleted together with its Obsidian note. Guarded
 * deliberately tightly, because it removes a file from the user's own vault:
 * the name must match the scheme this app generates, and the path must resolve
 * inside the configured vault. Anything else is refused rather than deleted.
 */
export async function deleteVaultNote(notePath: string): Promise<void> {
  const resolved = path.resolve(notePath);
  if (!insideVault(resolved)) {
    throw new Error("Refusing to delete a note outside the configured vault.");
  }
  if (!NOTE_NAME_RE.test(path.basename(resolved))) {
    throw new Error("Refusing to delete a file that this app did not create.");
  }
  await fs.rm(resolved, { force: true });
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
  tags: string[] = [],
): Promise<ObsidianSaveResult> {
  const vaultDir = process.env.OBSIDIAN_VAULT_DIR || DEFAULT_VAULT_DIR;

  // Update in place when a valid prior path inside this vault is supplied.
  if (existingPath) {
    const resolved = path.resolve(existingPath);
    const base = path.basename(resolved);
    const m = base.match(NOTE_NAME_RE);
    if (m && insideVault(resolved)) {
      const [, dateStr, hh, mm, existingSubject] = m;
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, buildContent(dateStr, hh, mm, existingSubject, markdown, tags), "utf-8");
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

  await fs.writeFile(filePath, buildContent(dateStr, hh, mm, cleanSubject, markdown, tags), "utf-8");
  return { path: filePath, subject: cleanSubject, updated: false };
}
