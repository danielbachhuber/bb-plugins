import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { startsCollapsed } from "./banner.js";
import { inlineTwoView, inlineView } from "./fixtures.js";
import { INLINE_REPLY_LABEL, answerText, inlineProgress, inlineReplyMessage } from "./inline.js";
import { parseView, readView } from "./schema.js";
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

  const moved = (items: unknown[]) => {
    const { view, warnings } = readView(inline(items));
    expect(view.layout).toBe("cards");
    // A suggested change also gets a Revise field, with a warning of its own.
    const published = warnings.filter((warning) => warning.startsWith("Published as"));
    expect(published).toHaveLength(1);
    return published[0]!;
  };

  it("publishes too few or too many answers as cards", () => {
    expect(moved([{ id: "q", title: "Q", actions: [answer("Yes")] }])).toMatch(/2 to 4 buttons/);
    expect(moved([{ id: "q", title: "Q", actions: ["A", "B", "C", "D", "E"].map(answer) }])).toMatch(/2 to 4 buttons/);
    // A link opens a page; it does not answer.
    expect(moved([{ id: "q", title: "Q", actions: [answer("Yes"), { type: "link", label: "PR", url: "https://example.com" }] }])).toMatch(/at least 2 of them answers/);
  });

  it("refuses a question with no buttons, pointing at hide", () => {
    expect(() => parseView(inline([{ id: "q", title: "Q", actions: [] }]))).toThrow(/bb impromptu-ui hide --key <key>/);
  });

  it("publishes more than three questions as cards", () => {
    const items = ["a", "b", "c", "d"].map((id) => ({ id, title: id, actions: [answer("Yes"), answer("No")] }));
    expect(moved(items)).toMatch(/at most 3 questions/);
    expect(readView(inline(items.slice(0, 3)))).toMatchObject({ view: { layout: "inline" }, warnings: [] });
  });

  it("publishes a command, which needs the side panel to confirm, as cards", () => {
    expect(moved([{ id: "q", title: "Q", actions: [answer("Yes"), { type: "command", label: "Close", command: "true" }] }])).toMatch(
      /actions\.1\.type: an "inline" view answers with message, thread, or link buttons/,
    );
  });

  it("publishes what only the side panel shows as cards, naming the field", () => {
    const base = { id: "q", title: "Q", actions: [answer("Yes"), answer("No")] };
    expect(moved([{ ...base, draft: "x" }])).toMatch(/items\.0\.draft: draft needs the side panel/);
    expect(moved([{ ...base, changes: [{ label: "a", before: "x", after: "y" }] }])).toMatch(/changes needs the side panel/);
    expect(moved([{ ...base, closing: true }])).toMatch(/closing needs the side panel/);
    expect(moved([{ ...base, status: { label: "In progress" } }])).toMatch(/status needs the side panel/);
  });

  it("drops a note no button sends, since the Something else field takes a typed reply", () => {
    const { view, warnings } = readView(inline([{ id: "q", title: "Q", note: { label: "Why?" }, actions: [answer("Yes"), answer("No")] }]));
    expect(view.layout).toBe("inline");
    expect(view.sections[0]!.items[0]!.note).toBeUndefined();
    expect(warnings).toEqual([expect.stringMatching(/items\.0\.note: left out, since no button sends \{note\}/)]);
  });

  it("keeps a note a button sends, as cards", () => {
    const actions = [{ type: "message", label: "Revise", text: "Revise: {note}" }, answer("No")];
    expect(moved([{ id: "q", title: "Q", note: { label: "What to change" }, actions }])).toMatch(/note needs the side panel/);
  });

  it("still refuses a view that cards would refuse too", () => {
    expect(() => parseView(inline([{ id: "q", title: "Q", status: { label: "x" }, actions: [{ type: "message", label: "Go", text: "Go {draft}" }] }]))).toThrow(
      /not a valid view/,
    );
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
