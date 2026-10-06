// The panel's small pieces of text. Pure.
import type { ReviewView, ViewFile, ViewScenario, ViewSection, ViewTests } from "@/review/contract";
import { hashText } from "@/review/items";
import { isTestSide } from "@/review/tests/paths";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function list(words: string[]): string {
  if (words.length <= 2) return words.join(" and ");
  return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;
}

/** "hunks 1 and 3 of 4" when a concern holds only some of a file's hunks. */
export function hunkNote(file: ViewFile): string | null {
  const shown = file.hunks.filter((h) => h.status !== "removed" && h.kind === "hunk").map((h) => h.index + 1);
  if (shown.length === 0 || shown.length >= file.total) return null;
  return `${shown.length === 1 ? "hunk" : "hunks"} ${list(shown.map(String))} of ${file.total}`;
}

export function staleLabel(commitsSince: number | null, files: number): string {
  const fileText = plural(files, "file", "files");
  if (commitsSince === null) return `the branch was rewritten, and ${fileText} changed since`;
  if (commitsSince === 0) return `${fileText} changed since`;
  return `${plural(commitsSince, "commit", "commits")} and ${fileText} changed since`;
}

export function coverageLabel(coverage: ReviewView["coverage"]): string {
  const files = plural(coverage.files, "file", "files");
  const against = coverage.base ? `, against ${coverage.base}` : "";
  if (coverage.shown === coverage.hunks) return `${files}, ${plural(coverage.hunks, "hunk", "hunks")}, all shown${against}`;
  return `${files}, ${coverage.shown} of ${plural(coverage.hunks, "hunk", "hunks")} shown${against}`;
}

/** Lines a file's shown hunks add and remove. */
export function fileStats(file: ViewFile): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of file.hunks) {
    if (hunk.status === "removed") continue;
    for (const line of hunk.text.split("\n").slice(1)) {
      if (line.startsWith("+")) added++;
      else if (line.startsWith("-")) removed++;
    }
  }
  return { added, removed };
}

export function viewedLabel(coverage: ReviewView["coverage"]): string {
  return `${coverage.viewed} of ${plural(coverage.files, "file", "files")} viewed`;
}

/** "3 scenarios · 3 asserted, 3 snapshot only · 3 not covered" */
export function testsLabel(tests: { scenarios: number; asserted: number; snapshotOnly: number; gaps: number }): string {
  return `${plural(tests.scenarios, "scenario", "scenarios")} · ${tests.asserted} asserted, ${tests.snapshotOnly} snapshot only · ${tests.gaps} not covered`;
}

/**
 * A path for bb's source viewer that changes whenever the text does. The
 * viewer caches a file's lines by path for the whole session, so showing new
 * text under an old path, after a regrouping or on another scenario, crashed
 * it with "Line doesnt exist".
 */
export function sourcePath(name: string, content: string): string {
  return `${name}-${hashText(content)}.feature`;
}

/**
 * The rail's note on a concern's tests: "tests" for a concern that is only
 * tests, and its scenario count for one that also changes code, so the rail
 * does not make a code change look like a test change.
 */
export function testsTag(section: ViewSection): string | null {
  if (section.tests === null) return null;
  if (section.files.every((file) => isTestSide(file.path))) return "tests";
  return plural(section.tests.scenarios.length, "scenario", "scenarios");
}

/**
 * A scenario's note when it does not describe exactly one whole test() call
 * of its own: when it covers part of a test, several tests, or a test another
 * scenario also describes. Null when it lines up, or cites nothing that is
 * still in the tests.
 */
export function scenarioMismatch(scenario: ViewScenario): string | null {
  const [test, ...more] = scenario.tests;
  if (test === undefined) return null;
  if (more.length > 0) return `spans ${scenario.tests.length} tests`;
  if (test.cited < test.total) return `${test.cited} of ${test.total} steps of one test`;
  if (test.sharedWith > 0) return `shares its test with ${plural(test.sharedWith, "other scenario", "other scenarios")}`;
  return null;
}

/** The concern's note when its scenarios and its test() calls do not pair up one to one. */
export function testsMismatch(tests: ViewTests): string | null {
  if (tests.scenarios.every((scenario) => scenarioMismatch(scenario) === null)) return null;
  const cited = new Map(tests.scenarios.flatMap((s) => s.tests.map((t) => [`${t.path}:${t.test}`, t.name] as const)));
  const which = cited.size === 1 ? ` call, "${[...cited.values()][0]}"` : " calls";
  return `${plural(tests.scenarios.length, "scenario describes", "scenarios describe")} ${cited.size} test()${which}, so the descriptions do not match the tests one to one.`;
}
