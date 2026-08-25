import fs from "fs/promises";
import path from "path";

import {
  type SessionData,
  type SessionSummary,
  parseSession,
  serializeSession,
  toSummary,
  isValidSessionId,
} from "../shared/session.ts";
import { deleteVaultNote } from "./obsidian.ts";

/**
 * Filesystem store for recorded sessions.
 *
 * Layout (root configurable via SESSIONS_DIR):
 *   <root>/<id>/session.json
 *   <root>/<id>/audio.webm      (phase 2)
 *
 * One directory per session so the audio recording lands next to its transcript
 * and deleting a session is a single recursive remove.
 */

const DEFAULT_SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

function root(): string {
  return path.resolve(process.env.SESSIONS_DIR || DEFAULT_SESSIONS_DIR);
}

/**
 * Resolve a session's directory, refusing anything that isn't a well-formed id or
 * that escapes the root. Ids arrive from HTTP, and a delete endpoint sits behind
 * this — an unvalidated id would let a caller remove arbitrary directories.
 */
function sessionDir(id: string): string {
  if (!isValidSessionId(id)) throw new Error(`Invalid session id: ${id}`);
  const dir = path.resolve(root(), id);
  if (dir !== root() && !dir.startsWith(root() + path.sep)) {
    throw new Error(`Session id escapes the store: ${id}`);
  }
  return dir;
}

function sessionFile(id: string): string {
  return path.join(sessionDir(id), "session.json");
}

export function audioFile(id: string): string {
  return path.join(sessionDir(id), "audio.webm");
}

/** Write (or overwrite) a session. This is the autosave target. */
export async function writeSession(session: SessionData): Promise<void> {
  const dir = sessionDir(session.id);
  await fs.mkdir(dir, { recursive: true });
  const payload = JSON.stringify(serializeSession(session), null, 2);
  // Write to a temp file and rename, so an interrupted write cannot leave a
  // half-written session.json behind — autosave runs constantly during a meeting.
  const tmp = path.join(dir, `.session.json.${process.pid}.tmp`);
  await fs.writeFile(tmp, payload, "utf-8");
  await fs.rename(tmp, sessionFile(session.id));
}

/** Read one session. Throws if missing or unparseable. */
export async function readSession(id: string): Promise<SessionData> {
  const raw = await fs.readFile(sessionFile(id), "utf-8");
  return parseSession(JSON.parse(raw));
}

/**
 * List sessions, newest first. A file that fails to parse is skipped with a
 * warning — one corrupt session must not make the whole library unreadable.
 */
export async function listSessions(): Promise<SessionSummary[]> {
  let entries: string[];
  try {
    entries = (await fs.readdir(root(), { withFileTypes: true }))
      .filter((e) => e.isDirectory() && isValidSessionId(e.name))
      .map((e) => e.name);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") return []; // nothing recorded yet
    throw err;
  }

  const out: SessionSummary[] = [];
  for (const id of entries) {
    try {
      out.push(toSummary(await readSession(id)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ Skipping unreadable session ${id}: ${msg}`);
    }
  }
  out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return out;
}

export interface DeleteResult {
  deleted: boolean;
  /** Set when an Obsidian note was removed alongside the session. */
  noteDeleted?: string;
  /** Set when note deletion was requested but refused or failed. */
  noteError?: string;
}

/**
 * Delete a session directory, optionally with the Obsidian note it produced.
 *
 * Note deletion reaches outside the app's own data into the user's vault, so it is
 * deliberately narrow: only the path this session recorded, and only when
 * `deleteVaultNote` confirms it sits inside the configured vault. A refusal there
 * is reported but never blocks the session itself from being deleted.
 */
export async function deleteSession(id: string, withNote: boolean): Promise<DeleteResult> {
  const dir = sessionDir(id);

  let noteDeleted: string | undefined;
  let noteError: string | undefined;

  if (withNote) {
    try {
      const session = await readSession(id);
      if (session.obsidianPath) {
        await deleteVaultNote(session.obsidianPath);
        noteDeleted = session.obsidianPath;
      }
    } catch (err) {
      noteError = err instanceof Error ? err.message : String(err);
    }
  }

  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not delete session ${id}: ${msg}`);
  }

  return { deleted: true, noteDeleted, noteError };
}
