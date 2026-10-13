import { describe, expect, it } from "vitest";
import { claimSpans, evidenceMarkdown, placeClaims, supportCounts } from "./evidence.js";
import { grantEvidenceView } from "./fixtures.js";
import { evidenceText, parseView, type Evidence } from "./schema.js";
import { itemThreadPrompt } from "./thread-prompt.js";

const need = grantEvidenceView.sections[0]!.items[0]!;

const view = (item: object, extra: object = {}) =>
  JSON.stringify({ title: "Grant", ...extra, sections: [{ items: [{ id: "need", title: "Need", ...item }] }] });

const claim = (id: string, text: string, support: Evidence["support"] = "full"): object => ({ id, claim: text, support });

describe("evidence schema", () => {
  it("fills in an entry's sources", () => {
    const item = parseView(view({ draft: "Two volunteers maintain it.", evidence: [claim("a", "Two volunteers")] })).sections[0]!.items[0]!;
    expect(item.evidence).toEqual([{ id: "a", claim: "Two volunteers", support: "full", sources: [] }]);
  });

  it("refuses a claim that is not quoted exactly from the proposed text", () => {
    expect(() => parseView(view({ draft: "Two volunteers maintain it.", evidence: [claim("a", "Three volunteers")] }))).toThrow(
      /evidence\.0\.claim: a claim must be quoted exactly/,
    );
  });

  it("finds a claim in the draft a change compares against, a change's new text, or a patch's added lines", () => {
    expect(() =>
      parseView(view({ draft: "Two volunteers.", changes: [{ label: "Need", before: "One." }], evidence: [claim("a", "Two volunteers")] })),
    ).not.toThrow();
    expect(() =>
      parseView(view({ changes: [{ label: "Need", before: "One.", after: "Two volunteers." }], evidence: [claim("a", "Two volunteers")] })),
    ).not.toThrow();
    const patch = "--- a/src/sync.ts\n+++ b/src/sync.ts\n@@ -1 +1 @@\n-for (let start = 0; start < rows.length; start += pageSize) {\n+for (let start = 0; start < total; start += pageSize) {";
    expect(() => parseView(view({ changes: [{ label: "src/sync.ts", patch }], evidence: [claim("a", "start < total")] }))).not.toThrow();
    expect(() => parseView(view({ changes: [{ label: "src/sync.ts", patch }], evidence: [claim("a", "start < rows.length")] }))).toThrow(/claim/);
  });

  it("refuses a repeated id, and evidence in a list view", () => {
    expect(() => parseView(view({ draft: "A and B.", evidence: [claim("a", "A"), claim("a", "B")] }))).toThrow(/duplicate evidence id "a"/);
    expect(() =>
      parseView(view({ draft: "A", actions: [{ type: "message", label: "Add", text: "Add {draft}" }], evidence: [claim("a", "A")] }, { layout: "list" })),
    ).toThrow(/evidence needs the "cards" layout/);
  });
});

describe("placing claims", () => {
  it("finds each claim in a line, earliest first, numbered in the item's order", () => {
    const line = "Two volunteers maintain acme/widgets in their evenings. It is a dependency of 1,400 public projects, and its release queue is four months behind.";
    expect(claimSpans(line, need.evidence).map((span) => [span.number, line.slice(span.start, span.end)])).toEqual([
      [1, "Two volunteers maintain acme/widgets in their evenings."],
      [2, "a dependency of 1,400 public projects"],
      [3, "its release queue is four months behind"],
    ]);
  });

  it("drops a claim that overlaps an earlier one", () => {
    const evidence = parseView(view({ draft: "one two three", evidence: [claim("a", "one two"), claim("b", "two three")] })).sections[0]!.items[0]!.evidence;
    expect(claimSpans("one two three", evidence).map((span) => span.evidence.id)).toEqual(["a"]);
  });

  it("moves a claim edited out of the text to missing, keeping its number", () => {
    expect(placeClaims(evidenceText(need, need.draft), need.evidence).missing).toEqual([]);
    const edited = need.draft.replace("212 open issues", "About 200 open issues");
    const { present, missing } = placeClaims(evidenceText(need, edited), need.evidence);
    expect(present.map(({ number }) => number)).toEqual([1, 2, 3, 5, 6]);
    expect(missing.map(({ evidence, number }) => [number, evidence.claim])).toEqual([[4, "212 open issues"]]);
  });

  it("counts claims by support", () => {
    expect(supportCounts(need.evidence)).toEqual({ full: 4, partial: 1, none: 1 });
  });
});

describe("evidence in a new thread's prompt", () => {
  it("lists each claim with its support, doubt, and quoted sources", () => {
    const markdown = evidenceMarkdown(need.evidence);
    expect(markdown).toContain('3. Partly supported: "its release queue is four months behind"\n   - Doubt: The notes date the wait from June');
    expect(markdown).toContain('   - "1,400 public projects depend on acme/widgets." ([GitHub › Dependents](https://github.com/acme/widgets/network/dependents))');
    expect(itemThreadPrompt(grantEvidenceView.title, need, "thr_src")).toContain(markdown);
  });
});
