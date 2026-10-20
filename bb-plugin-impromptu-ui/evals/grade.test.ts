import { describe, expect, it } from "vitest";
import { CASES } from "./cases.ts";
import { grade } from "./grade.ts";

const byId = (id: string) => {
  const found = CASES.find((c) => c.id === id);
  if (!found) throw new Error(`No case ${id}`);
  return found;
};

const publish = (view: unknown, key?: string) => ({
  args: ["impromptu-ui", "publish", "--file", "/tmp/view.json", ...(key ? ["--key", key] : [])],
  view: JSON.stringify(view),
});

const inline = (title: string, labels: string[]) => ({
  title: "Confirm",
  layout: "inline",
  sections: [{ items: [{ id: "q", title, actions: labels.map((label) => ({ type: "message", label, text: label })) }] }],
});

describe("grade", () => {
  it("passes an inline question that offers every expected option", () => {
    const view = inline("Does the total look right now?", ["It works, commit and push", "Still wrong"]);
    expect(grade(byId("approval-as-statement"), [publish(view)])).toEqual({ pass: true, why: "published inline" });
  });

  it("names the option a view left out", () => {
    const view = inline("Does the total look right now?", ["It works, commit and push"]);
    expect(grade(byId("approval-as-statement"), [publish(view)])).toEqual({ pass: false, why: "missing Still wrong" });
  });

  it("fails a view in another layout when the case expects inline", () => {
    const view = { ...inline("Commit?", ["Commit and push"]), layout: "cards" };
    expect(grade(byId("commit-question-after-report"), [publish(view)]).pass).toBe(false);
  });

  it("fails when nothing is published, and passes when nothing should be", () => {
    expect(grade(byId("plan-approval"), [{ args: ["impromptu-ui", "schema"] }])).toEqual({ pass: false, why: "no view published" });
    expect(grade(byId("plain-answer"), [])).toEqual({ pass: true, why: "nothing published" });
  });

  it("requires a republished view to keep every item and mark the handled one finished", () => {
    const items = (complete: boolean) => [
      { id: "null-check", title: "Missing null check in parseRow", status: { label: "Fixed", complete } },
      { id: "naming", title: "Rename tmp to rows" },
    ];
    const c = byId("republish-after-button");
    expect(grade(c, [publish({ title: "Review findings", sections: [{ items: items(true) }] }, "review")]).pass).toBe(true);
    expect(grade(c, [publish({ title: "Review findings", sections: [{ items: items(false) }] }, "review")]).why).toMatch(/not marked finished/);
    expect(grade(c, [publish({ title: "Review findings", sections: [{ items: items(true).slice(0, 1) }] }, "review")]).why).toBe(
      "missing Rename tmp to rows, still open",
    );
  });
});
