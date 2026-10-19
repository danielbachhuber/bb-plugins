import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { startsCollapsed } from "./banner.js";
import { inlineTwoView, inlineView } from "./fixtures.js";
import { INLINE_REPLY_LABEL, answerText, inlineProgress, inlineReplyMessage } from "./inline.js";
import { parseView } from "./schema.js";
import { MIGRATIONS, createStore, describeItems } from "./store.js";
import { firstOpenItem } from "./view-panel.js";

function store() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createStore(db);
}

const answer = (label: string) => ({ type: "message", label, text: label });

function inline(items: unknown[]) {
  return JSON.stringify({ title: "T", layout: "inline", sections: [{ items }] });
}

describe("inline view schema", () => {
  it("takes a question with two to four answers and a detail line on each", () => {
    const view = parseView(inline([{ id: "q", title: "Go ahead?", actions: [{ ...answer("Yes"), detail: "Commit and push" }, answer("No")] }]));
    expect(view.layout).toBe("inline");
    expect(view.sections[0]!.items[0]!.actions[0]!.detail).toBe("Commit and push");
  });

  it("refuses too few or too many answers", () => {
    expect(() => parseView(inline([{ id: "q", title: "Q", actions: [answer("Yes")] }]))).toThrow(/2 to 4 buttons/);
    expect(() => parseView(inline([{ id: "q", title: "Q", actions: ["A", "B", "C", "D", "E"].map(answer) }]))).toThrow(/2 to 4 buttons/);
    // A link opens a page; it does not answer.
    expect(() => parseView(inline([{ id: "q", title: "Q", actions: [answer("Yes"), { type: "link", label: "PR", url: "https://example.com" }] }]))).toThrow(/at least 2 of them answers/);
  });

  it("refuses more than three questions", () => {
    const items = ["a", "b", "c", "d"].map((id) => ({ id, title: id, actions: [answer("Yes"), answer("No")] }));
    expect(() => parseView(inline(items))).toThrow(/at most 3 questions/);
    expect(() => parseView(inline(items.slice(0, 3)))).not.toThrow();
  });

  it("refuses a command, which needs the side panel to confirm", () => {
    expect(() => parseView(inline([{ id: "q", title: "Q", actions: [answer("Yes"), { type: "command", label: "Close", command: "true" }] }]))).toThrow(
      /actions\.1\.type: an "inline" view answers with message, thread, or link buttons/,
    );
  });

  it("refuses what only the side panel shows", () => {
    const base = { id: "q", title: "Q", actions: [answer("Yes"), answer("No")] };
    expect(() => parseView(inline([{ ...base, draft: "x" }]))).toThrow(/items\.0\.draft: draft needs the side panel/);
    expect(() => parseView(inline([{ ...base, changes: [{ label: "a", before: "x", after: "y" }] }]))).toThrow(/changes needs the side panel/);
    expect(() => parseView(inline([{ ...base, closing: true }]))).toThrow(/closing needs the side panel/);
  });
});

describe("inline view state", () => {
  it("counts questions, then answers", () => {
    const s = store();
    const view = s.publish("thr_1", "default", inlineTwoView, "/tmp", "t");
    expect(inlineProgress(view)).toBe("2 questions");
    const one = s.setItem(view.id, "commit", { state: "done", result: { label: "Not yet", at: "t" } }, "t")!;
    expect(inlineProgress(one)).toBe("1 of 2 answered");
    const both = s.setItem(view.id, "publish", { state: "done", result: { label: "Later", at: "t" } }, "t")!;
    expect(inlineProgress(both)).toBe("answered");
    expect(inlineProgress(s.publish("thr_2", "default", inlineView, "/tmp", "t"))).toBe("1 question");
  });

  it("stays open once answered, so the green answer shows", () => {
    const s = store();
    const view = s.publish("thr_1", "default", inlineView, "/tmp", "t");
    const answered = s.setItem(view.id, "snapshot", { state: "done", result: { label: "Update, commit, and push", at: "t" } }, "t")!;
    expect(startsCollapsed(answered)).toBe(false);
  });

  it("never opens the side panel", () => {
    const s = store();
    expect(firstOpenItem(s.publish("thr_1", "default", inlineView, "/tmp", "t"), "thr_1")).toBeNull();
  });

  it("shows and reports an answer in the user's own words", () => {
    const item = inlineView.sections[0]!.items[0]!;
    expect(inlineReplyMessage(item, "Push to a new branch instead")).toBe("How should I fix the snapshot check?\n\nPush to a new branch instead");
    const result = { label: INLINE_REPLY_LABEL, at: "t", draft: "Push to a new branch instead" };
    expect(answerText(result)).toBe("“Push to a new branch instead”");
    expect(answerText({ label: "Update, commit, and push", at: "t" })).toBe("Update, commit, and push");
    const s = store();
    const view = s.publish("thr_1", "default", inlineView, "/tmp", "t");
    const answered = s.setItem(view.id, "snapshot", { state: "done", result }, "t")!;
    expect(describeItems(answered)).toEqual(['[done] snapshot  How should I fix the snapshot check?  (Something else: "Push to a new branch instead")']);
  });
});
