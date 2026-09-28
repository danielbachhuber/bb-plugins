import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allHandled, decisionItems, firstLine, listPreview, orderItems, progressLabel } from "./banner.js";
import { staplesView, triageView } from "./fixtures.js";
import { runCommand, tail } from "./run-command.js";
import { dismissLabelOf, fillDraft, fillNote, isQuiet, needsConfirm, parseView, shellQuote, usesDraft, usesNote } from "./schema.js";
import { MIGRATIONS, applyStatus, createStore, describeItems, stateAfterAction, type StoredView } from "./store.js";
import { feedbackMessage, hasFeedback, imageMime } from "./review.js";
import { filmstripLabels, shortLabel } from "./review-panel.js";
import { draftKey, enterAction, firstOpenItem, mapPages, nextOpenItem, showsResult } from "./view-panel.js";
import { doneTag, failureLine, listRows } from "./list-panel.js";
import { itemThreadPrompt } from "./thread-prompt.js";

function store() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createStore(db);
}

describe("parseView", () => {
  it("fills in defaults for badges, summary, details, and actions", () => {
    const view = parseView(
      JSON.stringify({ title: "T", sections: [{ items: [{ id: "a", title: "A", badges: [{ label: "x" }] }] }] }),
    );
    const [item] = view.sections[0]!.items;
    expect(item).toMatchObject({ summary: "", details: "", actions: [], badges: [{ label: "x", tone: "neutral" }] });
    expect(view.sections[0]!.title).toBe("");
  });

  it("names the field that is wrong, so the agent can fix its file", () => {
    const bad = { title: "T", sections: [{ items: [{ id: "a", title: "A", actions: [{ type: "shell", label: "x" }] }] }] };
    expect(() => parseView(JSON.stringify(bad))).toThrow(/sections\.0\.items\.0\.actions\.0\.type/);
  });

  it("rejects duplicate item ids, since decisions are kept by id", () => {
    const bad = { title: "T", sections: [{ items: [{ id: "a", title: "A" }] }, { items: [{ id: "a", title: "B" }] }] };
    expect(() => parseView(JSON.stringify(bad))).toThrow(/sections\.1\.items\.0\.id: duplicate item id "a"/);
  });

  it("requires an absolute cwd on a command", () => {
    const bad = {
      title: "T",
      sections: [{ items: [{ id: "a", title: "A", actions: [{ type: "command", label: "x", command: "ls", cwd: "rel" }] }] }],
    };
    expect(() => parseView(JSON.stringify(bad))).toThrow(/cwd/);
  });

  it("round-trips the fixture", () => {
    expect(parseView(JSON.stringify(triageView))).toEqual(triageView);
  });
});

describe("item url", () => {
  it("takes a web address and rejects anything else", () => {
    const view = (url: string) => JSON.stringify({ title: "t", sections: [{ items: [{ id: "a", title: "A", url }] }] });
    expect(parseView(view("https://github.com/acme/widgets/pull/412#discussion_r1")).sections[0]!.items[0]!.url).toContain("discussion_r1");
    expect(() => parseView(view("not a url"))).toThrow(/url/);
  });
});

describe("store", () => {
  it("replaces a view published again under the same key, keeping item decisions", () => {
    const s = store();
    const first = s.publish("thr_one", "default", triageView, "/tmp", "2026-01-05T10:00:00Z");
    s.setItem(first.id, "issue-101", { state: "done", result: { label: "Post and close", at: "t" } }, "t");
    s.setItem(first.id, "issue-123", { state: "dismissed", result: null }, "t");

    const trimmed = { ...triageView, sections: [triageView.sections[0]!] };
    const second = s.publish("thr_one", "default", trimmed, "/tmp", "2026-01-05T11:00:00Z");
    expect(second.id).toBe(first.id);
    expect(second.items).toEqual({ "issue-101": { state: "done", result: { label: "Post and close", at: "t" } } });
    expect(s.forThread("thr_one")).toHaveLength(1);
  });

  it("keeps views apart by thread and by key, newest first", () => {
    const s = store();
    s.publish("thr_one", "default", triageView, null, "2026-01-05T10:00:00Z");
    s.publish("thr_one", "second", triageView, null, "2026-01-05T11:00:00Z");
    s.publish("thr_two", "default", triageView, null, "2026-01-05T12:00:00Z");
    expect(s.forThread("thr_one").map((v) => v.key)).toEqual(["second", "default"]);
    expect(s.forThread("thr_two")).toHaveLength(1);
  });

  it("describes each item for the agent reading state back", () => {
    const s = store();
    const view = s.publish("thr_one", "default", triageView, null, "t");
    s.setItem(view.id, "issue-117", { state: "done", result: { label: "Fix in a new thread", at: "t", threadId: "thr_fix" } }, "t");
    expect(describeItems(s.get(view.id)!)).toEqual([
      "[open] issue-101  #101 Export widgets as CSV",
      "[done] issue-117  #117 Gadget sync drops the last row  (Fix in a new thread → thr_fix)",
      "[open] issue-123  #123 Dark mode for the dashboard",
    ]);
  });

  it("hides a view until the next publish under its key", () => {
    const s = store();
    const view = s.publish("thr_one", "default", triageView, null, "2026-01-05T10:00:00Z");
    expect(view.hiddenAt).toBeNull();
    expect(s.setHidden(view.id, true, "2026-01-05T10:30:00Z")?.hiddenAt).toBe("2026-01-05T10:30:00Z");
    expect(s.publish("thr_one", "default", triageView, null, "2026-01-05T11:00:00Z").hiddenAt).toBeNull();
  });

  it("returns null when setting an item on a view that does not exist", () => {
    expect(store().setItem(99, "a", { state: "done", result: null }, "t")).toBeNull();
  });
});

describe("runCommand", () => {
  it("runs in the given directory and reports the exit code and output", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dynamic-ui-"));
    const result = await runCommand("pwd; echo oops >&2; exit 3", dir, "/bin/sh");
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("dynamic-ui-");
    expect(result.output).toContain("oops");
  });

  it("keeps only the tail of long output", () => {
    const kept = tail("x".repeat(10) + "end", 5);
    expect(kept).toBe("…xend");
  });
});

describe("banner rows", () => {
  it("takes one plain line from a markdown summary", () => {
    expect(firstLine("\n- Shipped in [#140](https://x/140), with **Export** and `--archived`\n\nMore")).toBe(
      "Shipped in #140, with Export and --archived",
    );
    expect(firstLine("")).toBe("");
  });

  it("moves done and dismissed items below the open ones", () => {
    const s = store();
    const view = s.publish("thr_one", "default", triageView, null, "t");
    const before = orderItems(view).map((item) => item.id);
    s.setItem(view.id, before[0]!, { state: "done", result: null }, "t");
    s.setItem(view.id, before[1]!, { state: "dismissed", result: null }, "t");
    const after = orderItems(s.get(view.id)!).map((item) => item.id);
    expect(after).toEqual([...before.slice(2), before[0], before[1]]);
  });

  it("moves on from a dismissed item to the next open one, wrapping to the top", () => {
    const s = store();
    const view = s.publish("thr_one", "default", triageView, null, "t");
    s.setItem(view.id, "issue-117", { state: "dismissed", result: null }, "t");
    expect(nextOpenItem(s.get(view.id)!, "issue-117")?.id).toBe("issue-123");
    s.setItem(view.id, "issue-123", { state: "dismissed", result: null }, "t");
    expect(nextOpenItem(s.get(view.id)!, "issue-123")?.id).toBe("issue-101");
    s.setItem(view.id, "issue-101", { state: "dismissed", result: null }, "t");
    expect(nextOpenItem(s.get(view.id)!, "issue-101")).toBeNull();
  });

  it("counts a view as handled once no item is open", () => {
    const s = store();
    const view = s.publish("thr_one", "default", triageView, null, "t");
    s.setItem(view.id, "issue-101", { state: "done", result: null }, "t");
    s.setItem(view.id, "issue-117", { state: "dismissed", result: null }, "t");
    expect(allHandled(s.get(view.id)!)).toBe(false);
    s.setItem(view.id, "issue-123", { state: "done", result: null }, "t");
    expect(allHandled(s.get(view.id)!)).toBe(true);
  });

});

describe("list layout", () => {
  const add = { type: "command", label: "Add", command: "td task add Milk", confirm: false };
  const find = (view: ReturnType<typeof parseView>, id: string) =>
    view.sections.flatMap((section) => section.items).find((item) => item.id === id)!;
  const stored = (items: StoredView["items"] = {}): StoredView => ({
    id: 1,
    threadId: "thr_test",
    key: "staples",
    view: staplesView,
    cwd: "/tmp",
    publishedAt: "2026-03-12T12:00:00Z",
    hiddenAt: null,
    items,
  });
  const failed = { state: "open" as const, result: { label: "Add", at: "t", exitCode: 1, output: "\nError: no project\nmore" } };

  it("defaults to cards, so a view that does not ask is unchanged", () => {
    expect(triageView.layout).toBe("cards");
    const item = triageView.sections[0]!.items[0]!;
    expect(dismissLabelOf(triageView, item)).toBe("Dismiss");
    expect(decisionItems({ ...stored(), view: triageView })).toHaveLength(3);
    // An item with no buttons is still something to decide in a cards view.
    expect(isQuiet(triageView, find(triageView, "issue-123"))).toBe(false);
  });

  it("takes dismissLabel from the item, then its section, then the view", () => {
    const view = parseView(
      JSON.stringify({
        title: "T",
        dismissLabel: "Skip",
        sections: [
          { items: [{ id: "a", title: "A" }, { id: "b", title: "B", dismissLabel: "Not now" }] },
          { dismissLabel: "Pass", items: [{ id: "c", title: "C" }] },
        ],
      }),
    );
    expect(["a", "b", "c"].map((id) => dismissLabelOf(view, find(view, id)))).toEqual(["Skip", "Not now", "Pass"]);
  });

  it("asks before a command unless it says confirm: false", () => {
    const view = parseView(
      JSON.stringify({
        title: "T",
        sections: [{ items: [{ id: "a", title: "A", actions: [{ type: "command", label: "Close", command: "gh issue close 7" }, add] }] }],
      }),
    );
    const [close, quick] = view.sections[0]!.items[0]!.actions;
    expect(close).toMatchObject({ confirm: true });
    expect([needsConfirm(close!), needsConfirm(quick!)]).toEqual([true, false]);
    expect(needsConfirm({ type: "message", label: "Post", text: "Post it", primary: false })).toBe(false);
  });

  it("refuses a visual review, and more buttons than fit on a row", () => {
    const variations = [
      { label: "Original", image: "/tmp/a.png" },
      { label: "A", image: "/tmp/b.png" },
    ];
    const one = (item: Record<string, unknown>) => JSON.stringify({ title: "T", layout: "list", sections: [{ items: [{ id: "a", title: "A", ...item }] }] });
    expect(() => parseView(one({ variations }))).toThrow(/sections\.0\.items\.0\.variations: a visual review needs the "cards" layout/);
    expect(() => parseView(one({ actions: [0, 1, 2, 3].map((i) => ({ ...add, label: `Add ${i}` })) }))).toThrow(/at most 3 buttons/);
    expect(() => parseView(one({ actions: [add, { ...add, label: "B" }, { ...add, label: "C" }] }))).not.toThrow();
  });

  it("makes an item with no buttons a plain row, left out of the count and of where the panel opens", () => {
    const view = stored();
    expect(decisionItems(view).map((item) => item.id)).toEqual(["oat-milk", "bananas", "coffee-beans", "rice"]);
    const handled = stored(Object.fromEntries(decisionItems(view).map((item) => [item.id, { state: "dismissed" as const, result: null }])));
    expect(allHandled(handled)).toBe(true);
    expect(firstOpenItem(handled)).toBeNull();
    expect(nextOpenItem(stored({ rice: { state: "done", result: null } }), "coffee-beans")?.id).toBe("oat-milk");
  });

  it("does not call a view with only plain rows handled, since there was nothing to decide", () => {
    const view = parseView(JSON.stringify({ title: "T", layout: "list", sections: [{ items: [{ id: "a", title: "A" }] }] }));
    expect(allHandled({ ...stored(), view })).toBe(false);
  });

  it("keeps skipped and failed items on top, and moves done ones into the list ahead of it", () => {
    const { deciding, listed } = listRows(
      stored({ "coffee-beans": { state: "done", result: { label: "Add", at: "t", exitCode: 0 } }, bananas: { state: "dismissed", result: null }, rice: failed }),
    );
    expect(deciding.map((item) => item.id)).toEqual(["oat-milk", "bananas", "rice"]);
    expect(listed.map((item) => item.id)).toEqual(["coffee-beans", "task-eggs", "task-bread", "task-candles"]);
  });

  it("tags a done row with its button's doneLabel, or the button's label", () => {
    const record = { state: "done" as const, result: { label: "Add", at: "t", exitCode: 0 } };
    expect(doneTag(find(staplesView, "oat-milk"), record)).toBe("Just added");
    const plain = parseView(JSON.stringify({ title: "T", layout: "list", sections: [{ items: [{ id: "a", title: "A", actions: [add] }] }] }));
    expect(doneTag(find(plain, "a"), record)).toBe("Add");
  });

  it("says what failed in one line", () => {
    expect(failureLine(failed)).toBe("Error: no project");
    expect(failureLine({ state: "open", result: { label: "Add", at: "t", error: "spawn failed" } })).toBe("spawn failed");
    expect(failureLine({ state: "open", result: { label: "Add", at: "t", exitCode: 2 } })).toBe("exit 2");
    expect(failureLine({ state: "done", result: { label: "Add", at: "t", exitCode: 0 } })).toBeNull();
  });

  it("lets a list view's command take the edited name, quoted as one shell word", () => {
    const item = find(staplesView, "oat-milk");
    const [addAction] = item.actions;
    expect(usesDraft(addAction!)).toBe(true);
    expect(fillDraft(addAction!, item.draft, "Oat milk (2)").action).toMatchObject({ command: `td task add 'Oat milk (2)' --project "Groceries"` });
    expect(fillDraft(addAction!, item.draft, undefined)).toMatchObject({ action: { command: `td task add 'Oat milk' --project "Groceries"` }, edited: false });
  });

  it("quotes anything the user types so it cannot run", async () => {
    const typed = `Kid's "snacks" $(touch /tmp/nope) \`id\`; rm -rf ~`;
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    const { output } = await runCommand(`printf %s ${shellQuote(typed)}`, tmpdir());
    expect(output).toBe(typed);
  });

  it("keeps {draft} out of commands in a cards view", () => {
    const command = { type: "command", label: "Add", command: "td task add {draft}" };
    const view = (layout: string) => JSON.stringify({ title: "T", layout, sections: [{ items: [{ id: "a", title: "A", draft: "x", actions: [command] }] }] });
    expect(() => parseView(view("cards"))).toThrow(/a command can use \{draft\} only in the "list" layout/);
    expect(() => parseView(view("list"))).not.toThrow();
  });

  it("reads back an edited name for the agent", () => {
    const s = store();
    const view = s.publish("thr_one", "staples", staplesView, null, "t");
    s.setItem(view.id, "oat-milk", { state: "done", result: { label: "Add", at: "t", exitCode: 0, edited: true, draft: "Oat milk (2)" } }, "t");
    expect(describeItems(s.get(view.id)!)).toContain('[done] oat-milk  Oat milk  (Add, edited to "Oat milk (2)", exit 0)');
  });

  it("previews the list above the composer: what is left, then what is on the list as added", () => {
    const preview = listPreview(
      stored({
        "oat-milk": { state: "done", result: { label: "Add", at: "t", exitCode: 0, edited: true, draft: "Oat milk (2)" } },
        bananas: { state: "dismissed", result: null },
        rice: failed,
      }),
    );
    expect(preview.deciding).toEqual(["Coffee beans", "Brown rice"]);
    expect(preview.listed).toEqual(["Oat milk (2)", "Eggs (dozen)", "Sourdough bread", "Birthday candles"]);
  });

  it("reads back a skip and a plain row for the agent", () => {
    const s = store();
    const view = s.publish("thr_one", "staples", staplesView, null, "t");
    s.setItem(view.id, "bananas", { state: "dismissed", result: null }, "t");
    const lines = describeItems(s.get(view.id)!);
    expect(lines).toContain("[dismissed] bananas  Bananas  (Skip)");
    expect(lines).toContain("[listed] task-eggs  Eggs (dozen)");
  });
});

describe("item drafts", () => {
  const post = { type: "message" as const, label: "Post and close", text: "Post on #7, then close:\n\n{draft}", primary: true };
  const keep = { type: "message" as const, label: "Post", text: "Post on #7, leave it open:\n\n{draft}", primary: false };

  function viewWith(item: Record<string, unknown>) {
    return JSON.stringify({ title: "T", sections: [{ items: [{ id: "a", title: "A", ...item }] }] });
  }

  it("lets several buttons share one draft", () => {
    const view = parseView(viewWith({ draft: "Done in #9.", draftLabel: "Comment to post", actions: [post, keep] }));
    const item = view.sections[0]!.items[0]!;
    expect(item.draft).toBe("Done in #9.");
    expect(item.actions.every(usesDraft)).toBe(true);
  });

  it("fills {draft} with the user's edit, or the original when unchanged", () => {
    expect(fillDraft(post, "Done in #9.", "Done in #9 and #10.")).toEqual({
      action: { ...post, text: "Post on #7, then close:\n\nDone in #9 and #10." },
      edited: true,
    });
    expect(fillDraft(keep, "Done in #9.", undefined)).toEqual({
      action: { ...keep, text: "Post on #7, leave it open:\n\nDone in #9." },
      edited: false,
    });
  });

  it("keeps a $ in the user's text as written", () => {
    expect(fillDraft(post, "x", "costs $1 and $&").action).toMatchObject({ text: "Post on #7, then close:\n\ncosts $1 and $&" });
  });

  it("refuses {draft} in a cards view's command, and {draft} on an item with no draft", () => {
    const command = { type: "command", label: "Comment", command: "gh issue comment 7 --body '{draft}'" };
    expect(() => parseView(viewWith({ draft: "x", actions: [command] }))).toThrow(/command can use \{draft\} only in the "list" layout/);
    expect(() => parseView(viewWith({ actions: [post] }))).toThrow(/uses \{draft\} but the item has no draft/);
  });
});

describe("one-line drafts", () => {
  const fuji = { type: "command" as const, label: "Fuji ×8", command: "true", primary: true };
  const other = { type: "message" as const, label: "Use this", text: "For apples, use: {draft}", primary: false };

  function viewWith(item: Record<string, unknown>) {
    return JSON.stringify({ title: "T", sections: [{ items: [{ id: "a", title: "A", ...item }] }] });
  }

  it("defaults to markdown, and takes a text field that starts empty", () => {
    expect(parseView(viewWith({ draft: "x", actions: [other] })).sections[0]!.items[0]!.draftFormat).toBe("markdown");
    const item = parseView(
      viewWith({ draftFormat: "text", draftLabel: "Something else", draftPlaceholder: "Fuji ×12, or another product", actions: [fuji, other] }),
    ).sections[0]!.items[0]!;
    expect(item).toMatchObject({ draft: "", draftFormat: "text", draftPlaceholder: "Fuji ×12, or another product" });
  });

  it("refuses a text draft over one line, with no button to send it, or a placeholder on markdown", () => {
    expect(() => parseView(viewWith({ draftFormat: "text", draft: "a\nb", actions: [other] }))).toThrow(/draft: a "text" draft is one line/);
    expect(() => parseView(viewWith({ draftFormat: "text", actions: [fuji] }))).toThrow(/draftFormat: a "text" draft needs a message or thread button/);
    expect(() => parseView(viewWith({ draft: "x", draftPlaceholder: "y", actions: [other] }))).toThrow(/draftPlaceholder: a placeholder needs "draftFormat": "text"/);
  });

  it("lets only a card's text draft start empty, since a list row sends it without a check", () => {
    const list = JSON.stringify({ title: "T", layout: "list", sections: [{ items: [{ id: "a", title: "A", draftFormat: "text", actions: [other] }] }] });
    expect(() => parseView(list)).toThrow(/uses \{draft\} but the item has no draft/);
  });

  it("fills {draft} with what was typed, which is not an edit when the field started empty", () => {
    expect(fillDraft(other, "", "Fuji ×12")).toEqual({ action: { ...other, text: "For apples, use: Fuji ×12" }, edited: false });
    const thread = { type: "thread" as const, label: "Look it up", primary: false, project: "personal", title: "Look up", prompt: "Find {draft} at the store." };
    expect(fillDraft(thread, "", "oat milk").action).toMatchObject({ prompt: "Find oat milk at the store." });
  });

  it("presses the button that sends the draft on Enter, not the primary product", () => {
    const item = parseView(viewWith({ draftFormat: "text", actions: [fuji, other, { ...other, label: "Use and save", primary: true }] })).sections[0]!.items[0]!;
    expect(enterAction(item)).toBe(2);
    expect(enterAction({ ...item, actions: item.actions.slice(0, 2) })).toBe(1);
  });

  it("reads back what a one-line draft sent", () => {
    const s = store();
    const view = s.publish("thr_1", "default", parseView(viewWith({ draftFormat: "text", actions: [other] })), "/tmp", "t");
    s.setItem(view.id, "a", { state: "done", result: { label: "Use this", at: "t", draft: "Fuji ×12" } }, "t");
    expect(describeItems(s.get(view.id)!)).toEqual(['[done] a  A  (Use this: "Fuji ×12")']);
  });
});

describe("firstOpenItem", () => {
  const stored = (items: StoredView["items"]): StoredView => ({
    id: 1,
    threadId: "thr_test",
    key: "default",
    view: triageView,
    cwd: "/tmp",
    publishedAt: "2026-03-12T12:00:00Z",
  hiddenAt: null,
    items,
  });

  it("starts on the first item, across sections", () => {
    expect(firstOpenItem(stored({}))?.id).toBe("issue-101");
    expect(firstOpenItem(stored({ "issue-101": { state: "done", result: null } }))?.id).toBe("issue-117");
  });

  it("skips dismissed items and returns null once all are handled", () => {
    expect(
      firstOpenItem(
        stored({
          "issue-101": { state: "done", result: null },
          "issue-117": { state: "dismissed", result: null },
          "issue-123": { state: "done", result: null },
        }),
      ),
    ).toBeNull();
  });
});

describe("visual review", () => {
  const review = {
    title: "Rows",
    sections: [
      {
        items: [
          {
            id: "review-rows",
            title: "Row layout: 3 directions",
            variations: [
              { label: "Original", image: "shots/original.png" },
              { label: "A. Sections", description: "Headings", image: "shots/a.png" },
              { label: "B. Dates right", image: "/tmp/b.webp" },
            ],
          },
        ],
      },
    ],
  };
  const item = () => parseView(JSON.stringify(review)).sections[0]!.items[0]!;

  it("needs the original and at least one alternative", () => {
    expect(item().variations).toHaveLength(3);
    const one = { ...review, sections: [{ items: [{ ...review.sections[0]!.items[0]!, variations: [review.sections[0]!.items[0]!.variations[0]!] }] }] };
    expect(() => parseView(JSON.stringify(one))).toThrow(/at least two variations/);
  });

  it("shortens labels for the filmstrip", () => {
    expect(shortLabel("A. Sections")).toBe("A");
    expect(shortLabel("B) Dates right")).toBe("B");
    expect(shortLabel("Original")).toBe("Original");
    expect(shortLabel("Compact rows")).toBe("Compact");
    // Two that would both read "C" keep the words after the letter.
    expect(filmstripLabels(["Original", "C. Widgets tab", "C. Gadgets tab", "D. Tabs"])).toEqual(["Original", "Widgets tab", "Gadgets tab", "D"]);
  });

  it("knows which files the panel can show", () => {
    expect(imageMime("a.PNG")).toBe("image/png");
    expect(imageMime("a.jpeg")).toBe("image/jpeg");
    expect(imageMime("a.svg")).toBeNull();
  });

  it("writes the pick and every note into one message", () => {
    const message = feedbackMessage(item(), {
      pick: 2,
      notes: ["", "headings good,\n but too tall", "use A's headings"],
      overall: " keep overdue red ",
    });
    expect(message).toBe(
      [
        'Visual review feedback on "Row layout: 3 directions":',
        "",
        "Pick: **B. Dates right**",
        "",
        "- A. Sections: headings good, but too tall",
        "- B. Dates right: use A's headings",
        "",
        "Overall: keep overdue red",
      ].join("\n"),
    );
    expect(feedbackMessage(item(), { pick: null, notes: ["too busy"], overall: "" })).toContain("Pick: none of them yet.");
  });

  it("has nothing to send until something is picked or written", () => {
    expect(hasFeedback({ pick: null, notes: ["", " "], overall: "" })).toBe(false);
    expect(hasFeedback({ pick: 0, notes: [], overall: "" })).toBe(true);
    expect(hasFeedback({ pick: null, notes: ["", "x"], overall: "" })).toBe(true);
  });

  it("stores a publish's images and replaces them on the next", () => {
    const s = store();
    const stored = s.publish("thr_one", "review", parseView(JSON.stringify(review)), "/tmp", "t");
    s.putImages(stored.id, [
      { itemId: "review-rows", index: 0, mime: "image/png", data: Buffer.from("one") },
      { itemId: "review-rows", index: 1, mime: "image/png", data: Buffer.from("two") },
    ]);
    expect(Buffer.from(s.image(stored.id, "review-rows", 1)!.data).toString()).toBe("two");
    s.putImages(stored.id, [{ itemId: "review-rows", index: 0, mime: "image/webp", data: Buffer.from("new") }]);
    expect(s.image(stored.id, "review-rows", 1)).toBeNull();
    expect(s.image(stored.id, "review-rows", 0)!.mime).toBe("image/webp");
  });
});

describe("itemThreadPrompt", () => {
  it("carries the item's title, link, summary, and details, and names the thread it came from", () => {
    const item = triageView.sections[0]!.items[0]!;
    const prompt = itemThreadPrompt(triageView.title, item, "thr_src");
    expect(prompt).toContain('from "Triage: acme/widgets milestone 4.2" in @thread:thr_src');
    expect(prompt).toContain("## #101 Export widgets as CSV\n\nhttps://github.com/acme/widgets/issues/101");
    expect(prompt).toContain(item.summary);
    expect(prompt).toContain(item.details);
    expect(prompt).not.toContain(item.draft);
  });

  it("leaves out what the item does not have", () => {
    const item = triageView.sections[1]!.items[1]!;
    expect(itemThreadPrompt("V", item, "thr_src")).toBe('Dig further into this item from "V" in @thread:thr_src.\n\n## #123 Dark mode for the dashboard');
  });
});

describe("agent-set status", () => {
  const sections = (need: object) => ({
    title: "Grant: Open Tools Fund",
    sections: [
      {
        items: [
          { id: "summary", title: "Summary", status: { label: "Complete", tone: "success", complete: true } },
          {
            id: "need",
            title: "Need",
            status: { label: "In progress", tone: "warning" },
            history: [
              { text: "Round 1: led with the download counts." },
              { who: "user", text: "Lead with who maintains it, not downloads.", at: "2026-03-12T09:48:00Z" },
            ],
            draft: "Two volunteers maintain acme/widgets.",
            actions: [
              { type: "message", label: "Accept", text: "Accept Need:\n\n{draft}", primary: true },
              { type: "message", label: "Revise", text: "Revise Need:\n\n{draft}" },
            ],
            ...need,
          },
          { id: "team", title: "Team", status: { label: "Not started" } },
        ],
      },
    ],
  });
  const grant = (need: object = {}) => parseView(JSON.stringify(sections(need)));

  it("fills in a status's tone and completeness, and leaves items without one unchanged", () => {
    const view = grant();
    const [summary, need, team] = view.sections[0]!.items;
    expect(summary!.status).toEqual({ label: "Complete", tone: "success", complete: true });
    expect(need!.status).toEqual({ label: "In progress", tone: "warning", complete: false });
    expect(team!.status).toEqual({ label: "Not started", tone: "neutral", complete: false });
    expect(need!.history[0]).toEqual({ who: "agent", text: "Round 1: led with the download counts." });
    expect(need!.actions[0]!.repeat).toBeUndefined();
    expect(triageView.sections[0]!.items[0]!.status).toBeUndefined();
    expect(triageView.sections[0]!.items[0]!.history).toEqual([]);
  });

  it("finishes an item on a button, unless the button repeats or the agent owns the item's status", () => {
    const plain = triageView.sections[0]!.items[0]!;
    const need = grant().sections[0]!.items[1]!;
    expect(stateAfterAction(plain, plain.actions[0]!, false)).toBe("done");
    expect(stateAfterAction(plain, { ...plain.actions[0]!, repeat: true }, false)).toBe("open");
    expect(stateAfterAction(need, need.actions[0]!, false)).toBe("open");
    expect(stateAfterAction(plain, plain.actions[0]!, true)).toBe("open");
  });

  it("takes an item's state from its status, keeping the last result and a dismissal", () => {
    const view = grant();
    const items = applyStatus(view, {
      need: { state: "open", result: { label: "Revise", at: "t" } },
      team: { state: "dismissed", result: null },
    });
    expect(items).toEqual({
      summary: { state: "done", result: null },
      need: { state: "open", result: { label: "Revise", at: "t" } },
      team: { state: "dismissed", result: null },
    });
  });

  it("marks an item done when the agent republishes it complete, and open again when it reopens it", () => {
    const s = store();
    const first = s.publish("thr_one", "grant", grant(), null, "t");
    expect(first.items.need?.state).toBe("open");
    s.setItem(first.id, "need", { state: "open", result: { label: "Accept", at: "t" } }, "t");
    const done = s.publish("thr_one", "grant", grant({ status: { label: "Complete", tone: "success", complete: true } }), null, "t");
    expect(done.items.need).toEqual({ state: "done", result: { label: "Accept", at: "t" } });
    const reopened = s.publish("thr_one", "grant", grant({ status: { label: "40 words over", tone: "danger" } }), null, "t");
    expect(reopened.items.need?.state).toBe("open");
  });

  it("counts complete items in the header once a view uses status, and open ones otherwise", () => {
    const s = store();
    expect(progressLabel(s.publish("thr_one", "grant", grant(), null, "t"))).toBe("1 of 3 complete");
    const triage = s.publish("thr_one", "default", triageView, null, "t");
    expect(progressLabel(triage)).toBe("3 of 3 open");
    s.setItem(triage.id, "issue-101", { state: "done", result: null }, "t");
    expect(progressLabel(s.get(triage.id)!)).toBe("2 of 3 open");
  });

  it("shows an agent-set item's last result only until the agent publishes again", () => {
    const need = grant().sections[0]!.items[1]!;
    const plain = triageView.sections[0]!.items[0]!;
    const record = { state: "open" as const, result: { label: "Revise", at: "2026-03-12T09:48:00Z" } };
    expect(showsResult(need, record, "2026-03-12T09:40:00Z")).toBe(true);
    expect(showsResult(need, record, "2026-03-12T09:51:00Z")).toBe(false);
    expect(showsResult(plain, record, "2026-03-12T09:51:00Z")).toBe(true);
    expect(showsResult(need, undefined, "t")).toBe(false);
  });

  it("names a draft so the card starts over on a new round, and not on a republish that leaves it alone", () => {
    expect(draftKey("Two volunteers maintain acme/widgets.")).toBe(draftKey("Two volunteers maintain acme/widgets."));
    expect(draftKey("Two volunteers maintain acme/widgets.")).not.toBe(draftKey("Three volunteers maintain acme/widgets."));
  });

  it("reads each item's status back for the agent", () => {
    const s = store();
    const view = s.publish("thr_one", "grant", grant(), null, "t");
    s.setItem(view.id, "need", { state: "open", result: { label: "Revise", at: "t" } }, "t");
    expect(describeItems(s.get(view.id)!)).toEqual([
      "[done] summary  Summary  {Complete}",
      "[open] need  Need  {In progress}  (Revise)",
      "[open] team  Team  {Not started}",
    ]);
  });
});

describe("push-back note", () => {
  const view = (item: object) =>
    JSON.stringify({
      title: "T",
      sections: [
        {
          items: [
            {
              id: "need",
              title: "Need",
              draft: "Two volunteers maintain acme/widgets.",
              actions: [
                { type: "message", label: "Revise", text: "Revise Need. {note}\n\n{draft}" },
                { type: "message", label: "Accept", text: "Accept Need:\n\n{draft}", primary: true },
              ],
              ...item,
            },
          ],
        },
      ],
    });

  it("takes a note field for buttons that use {note}, and names what is wrong otherwise", () => {
    const item = parseView(view({ note: { placeholder: "What to change for round 3" } })).sections[0]!.items[0]!;
    expect(item.note).toEqual({ label: "Note", placeholder: "What to change for round 3" });
    expect(usesNote(item.actions[0]!)).toBe(true);
    expect(usesNote(item.actions[1]!)).toBe(false);
    expect(() => parseView(view({}))).toThrow(/uses \{note\} but the item has no note field/);
    expect(() =>
      parseView(view({ note: {}, actions: [{ type: "message", label: "Accept", text: "Accept Need:\n\n{draft}" }] })),
    ).toThrow(/a note field needs a message or thread button that uses \{note\}/);
  });

  it("puts the note where the button says, or nothing when none was written", () => {
    const item = parseView(view({ note: {} })).sections[0]!.items[0]!;
    expect(fillNote(item.actions[0]!, "Shorter, and name the security queue.")).toMatchObject({
      text: "Revise Need. Shorter, and name the security queue.\n\n{draft}",
    });
    expect(fillNote(item.actions[0]!, "")).toMatchObject({ text: "Revise Need. \n\n{draft}" });
  });

  it("reads the note back for the agent", () => {
    const s = store();
    const stored = s.publish("thr_one", "default", parseView(view({ note: {} })), null, "t");
    s.setItem(stored.id, "need", { state: "done", result: { label: "Revise", at: "t", note: "Shorter" } }, "t");
    expect(describeItems(s.get(stored.id)!)).toEqual(['[done] need  Need  (Revise, note: "Shorter")']);
  });
});

describe("meter, related, and map", () => {
  const view = (extra: object = {}, need: object = {}) =>
    JSON.stringify({
      title: "Grant",
      sections: [
        {
          items: [
            { id: "summary", title: "Summary", meter: { value: 48, max: 50, unit: "words" }, status: { label: "Complete", tone: "success", complete: true } },
            {
              id: "need",
              title: "Need",
              meter: { value: 220, max: 200, unit: "words" },
              status: { label: "In progress", tone: "warning" },
              related: {
                title: "From the release notes",
                entries: [
                  { id: "security-queue", text: "38 security reports wait on triage.", detail: "Matches: maintenance burden", action: { type: "message", label: "Add", text: "Add the security queue to Need." } },
                  { id: "downloads", text: "Downloads grew 40% this year.", badge: { label: "Used", tone: "success" } },
                ],
              },
              ...need,
            },
            { id: "team", title: "Team", meter: { value: 0, max: 150, unit: "words" } },
          ],
        },
      ],
      ...extra,
    });

  it("fills in a meter's unit and the related list's title", () => {
    const need = parseView(view()).sections[0]!.items[1]!;
    expect(need.meter).toEqual({ value: 220, max: 200, unit: "words" });
    expect(parseView(view({}, { meter: { value: 1, max: 2 } })).sections[0]!.items[1]!.meter).toEqual({ value: 1, max: 2, unit: "" });
    expect(parseView(view({}, { related: { entries: [{ id: "a", text: "A" }] } })).sections[0]!.items[1]!.related!.title).toBe("Related");
  });

  it("refuses a related entry whose button needs the item's draft or note, runs a command, or repeats an id", () => {
    const entry = (action: object) => ({ related: { entries: [{ id: "a", text: "A", action }] } });
    expect(() => parseView(view({}, entry({ type: "command", label: "Run", command: "ls" })))).toThrow(/related\.entries\.0\.action: a related entry's button/);
    expect(() => parseView(view({}, { draft: "d", ...entry({ type: "message", label: "Add", text: "Add {draft}" }) }))).toThrow(/related\.entries\.0\.action/);
    expect(() => parseView(view({}, { related: { entries: [{ id: "a", text: "A" }, { id: "a", text: "B" }] } }))).toThrow(/duplicate related entry id "a"/);
  });

  it("lays out a map from item ids, and names an id it does not have or has twice", () => {
    const map = { pages: [{ label: "Page 1", columns: [["summary", "need"]] }, { label: "Page 2", columns: [["team"]] }] };
    expect(parseView(view({ map })).map!.pages).toHaveLength(2);
    expect(() => parseView(view({ map: { pages: [{ label: "P", columns: [["nope"]] }] } }))).toThrow(/map\.pages\.0\.columns\.0\.0: no item "nope"/);
    expect(() => parseView(view({ map: { pages: [{ label: "P", columns: [["need"], ["need"]] }] } }))).toThrow(/map\.pages\.0\.columns\.1\.0: "need" is on the map twice/);
    expect(() => parseView(view({ layout: "list", map }))).toThrow(/a map needs the "cards" layout/);
  });

  it("sizes each block by its meter's max, so the tallest column fills the page, and fills it by value", () => {
    const s = store();
    const stored = s.publish("thr_one", "grant", parseView(view({ map: { pages: [{ label: "P1", columns: [["summary", "need"], ["team"]] }] } })), null, "t");
    const [page] = mapPages(stored, 100);
    const [first, second] = page!.columns;
    expect(first!.map((block) => [block.item.id, Math.round(block.height), block.fill, block.over, block.tone])).toEqual([
      ["summary", 20, 0.96, false, "done"],
      ["need", 80, 1, true, "warning"],
    ]);
    expect(second!.map((block) => [block.item.id, Math.round(block.height), block.fill, block.tone])).toEqual([["team", 60, 0, "neutral"]]);
  });

  it("keeps what a related button did across a republish and a button on the item, and reads it back", () => {
    const s = store();
    const stored = s.publish("thr_one", "grant", parseView(view()), null, "t");
    s.setRelated(stored.id, "need", "security-queue", { label: "Add", at: "2026-03-12T10:00:00Z" }, "t");
    s.setItem(stored.id, "need", { state: "open", result: { label: "Revise", at: "t" } }, "t");
    const again = s.publish("thr_one", "grant", parseView(view()), null, "t");
    expect(again.items.need).toEqual({
      state: "open",
      result: { label: "Revise", at: "t" },
      related: { "security-queue": { label: "Add", at: "2026-03-12T10:00:00Z" } },
    });
    expect(describeItems(again)).toContain("    [related] security-queue  (Add)");
  });
});
