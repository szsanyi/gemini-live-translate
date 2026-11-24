import fs from "fs/promises";
import path from "path";

import {
  type CorrectionRule,
  parseRules,
  serializeRule,
  dedupeRules,
} from "../shared/corrections.ts";

/**
 * The global correction dictionary: rules the user marked as applying to every
 * recording, not just the one they were created in.
 *
 * Stored as a single JSON file (`data/corrections.json`, root overridable via
 * DATA_DIR) because it is small, read on every session start, and hand-editable.
 */

function file(): string {
  const root = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
  return path.join(root, "corrections.json");
}

export async function readGlobalCorrections(): Promise<CorrectionRule[]> {
  try {
    const raw = await fs.readFile(file(), "utf-8");
    return dedupeRules(parseRules(JSON.parse(raw)));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") return []; // nothing taught yet
    // A corrupt dictionary must not stop a recording from starting.
    console.warn("⚠️ Could not read the global corrections:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function writeGlobalCorrections(rules: CorrectionRule[]): Promise<CorrectionRule[]> {
  const deduped = dedupeRules(rules);
  const target = file();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(deduped.map(serializeRule), null, 2), "utf-8");
  await fs.rename(tmp, target);
  return deduped;
}
