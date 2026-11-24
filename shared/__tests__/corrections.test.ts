import { describe, it, expect } from "vitest";
import {
  applyCorrections,
  buildGlossary,
  dedupeRules,
  hasCorrection,
  parseRules,
  serializeRule,
  sortRules,
  type CorrectionRule,
} from "../corrections.ts";

const rule = (heard: string, meant: string, overrides: Partial<CorrectionRule> = {}): CorrectionRule => ({
  id: heard,
  heard,
  meant,
  global: false,
  createdAt: new Date("2026-08-04T10:00:00Z"),
  ...overrides,
});

describe("applyCorrections", () => {
  it("replaces a whole word", () => {
    expect(applyCorrections("Check the sequel report.", [rule("sequel", "SQL")]))
      .toBe("Check the SQL report.");
  });

  it("replaces every occurrence", () => {
    expect(applyCorrections("sequel and sequel again", [rule("sequel", "SQL")]))
      .toBe("SQL and SQL again");
  });

  it("matches case-insensitively", () => {
    expect(applyCorrections("SEQUEL and Sequel", [rule("sequel", "SQL")]))
      .toBe("SQL and SQL");
  });

  it("does not match inside a longer word", () => {
    // The rule is for the standalone word; "sequential" must survive untouched.
    expect(applyCorrections("a sequential scan works here", [rule("sequel", "SQL")]))
      .toBe("a sequential scan works here");
  });

  it("handles multi-word phrases", () => {
    expect(applyCorrections("Szerintem ez itt marad mély.", [rule("marad mély", "van még")]))
      .toBe("Szerintem ez itt van még.");
  });

  it("respects Hungarian accents as word characters", () => {
    // JavaScript's \b is ASCII-only, so a naive \bmély\b would fire inside
    // "mélyebb" — accented letters must count as word characters.
    expect(applyCorrections("mélyebb vizeken", [rule("mély", "még")]))
      .toBe("mélyebb vizeken");
    expect(applyCorrections("ez mély dolog", [rule("mély", "még")]))
      .toBe("ez még dolog");
  });

  it("prefers the longer rule when two could match", () => {
    const rules = [rule("mély", "még"), rule("marad mély", "van még")];
    expect(applyCorrections("ez itt marad mély", rules)).toBe("ez itt van még");
  });

  it("keeps a leading capital from the replaced text", () => {
    expect(applyCorrections("Sequel is the database.", [rule("sequel", "SQL")]))
      .toBe("SQL is the database.");
    expect(applyCorrections("Titel Generalin ist fontos", [rule("Titel Generalin ist", "title generálást is")]))
      .toBe("Title generálást is fontos");
  });

  it("treats regex metacharacters literally", () => {
    expect(applyCorrections("what about c++ then", [rule("c++", "C sharp")]))
      .toBe("what about C sharp then");
  });

  it("ignores rules with an empty side", () => {
    expect(applyCorrections("unchanged", [rule("", "x"), rule("y", "  ")]))
      .toBe("unchanged");
  });

  it("returns the input untouched with no rules", () => {
    expect(applyCorrections("nothing to do", [])).toBe("nothing to do");
  });
});

describe("hasCorrection", () => {
  it("reports whether anything would change", () => {
    expect(hasCorrection("the sequel report", [rule("sequel", "SQL")])).toBe(true);
    expect(hasCorrection("the report", [rule("sequel", "SQL")])).toBe(false);
  });
});

describe("sortRules", () => {
  it("orders longest heard-phrase first", () => {
    const sorted = sortRules([rule("a", "1"), rule("aaa", "3"), rule("aa", "2")]);
    expect(sorted.map((r) => r.heard)).toEqual(["aaa", "aa", "a"]);
  });
});

describe("buildGlossary", () => {
  it("names both forms so the model can prefer the right one", () => {
    const g = buildGlossary([{ heard: "sequel", meant: "SQL" }]);
    expect(g).toContain("SQL");
    expect(g).toContain("sequel");
    expect(g).toContain("GLOSSARY");
  });

  it("is empty when there is nothing to say", () => {
    expect(buildGlossary([])).toBe("");
    expect(buildGlossary([{ heard: " ", meant: "x" }])).toBe("");
  });
});

describe("dedupeRules", () => {
  it("keeps the newest rule per heard phrase", () => {
    const old = rule("sequel", "Sequel", { createdAt: new Date("2026-01-01") });
    const recent = rule("SEQUEL", "SQL", { createdAt: new Date("2026-08-01") });
    const out = dedupeRules([old, recent]);
    expect(out).toHaveLength(1);
    expect(out[0].meant).toBe("SQL");
  });
});

describe("serialization", () => {
  it("round-trips a rule with a real Date", () => {
    const revived = parseRules([serializeRule(rule("sequel", "SQL", { global: true }))]);
    expect(revived).toHaveLength(1);
    expect(revived[0].global).toBe(true);
    expect(revived[0].createdAt).toBeInstanceOf(Date);
  });

  it("drops rules missing either side", () => {
    expect(parseRules([{ heard: "x" }, { meant: "y" }, {}])).toEqual([]);
  });

  it("tolerates a non-array payload", () => {
    expect(parseRules(null)).toEqual([]);
    expect(parseRules("nope")).toEqual([]);
  });
});
