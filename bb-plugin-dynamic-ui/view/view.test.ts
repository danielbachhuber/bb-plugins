import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { firstLine, mainAction } from "./banner.js";
import { triageView } from "./fixtures.js";
import { runCommand, tail } from "./run-command.js";
import { applyEdit, parseView } from "./schema.js";
import { MIGRATIONS, createStore, describeItems } from "./store.js";

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

  it("shows the primary action, else the first that is not a link", () => {
    const [issue101] = triageView.sections[0]!.items;
    expect(mainAction(issue101!)?.action.label).toBe("Post and close");
    const noPrimary = { ...issue101!, actions: issue101!.actions.map((a) => ({ ...a, primary: false })) };
    expect(mainAction({ ...noPrimary, actions: [noPrimary.actions[2]!, noPrimary.actions[1]!] })).toMatchObject({ index: 1 });
    expect(mainAction({ ...issue101!, actions: [] })).toBeNull();
  });
});

describe("editable actions", () => {
  const thread = {
    type: "thread" as const,
    label: "Open thread",
    project: "widgets",
    title: "Fix it",
    prompt: "Do the thing.",
    primary: true,
    editable: true,
  };

  it("defaults to not editable", () => {
    const view = parseView(
      JSON.stringify({ title: "T", sections: [{ items: [{ id: "a", title: "A", actions: [{ type: "message", label: "Go", text: "hi" }] }] }] }),
    );
    expect(view.sections[0]!.items[0]!.actions[0]).toMatchObject({ editable: false });
  });

  it("swaps in the user's text for an editable thread or message", () => {
    expect(applyEdit(thread, "Do the other thing.")).toEqual({ action: { ...thread, prompt: "Do the other thing." }, edited: true });
    const message = { type: "message" as const, label: "Post", text: "Post it.", primary: false, editable: true };
    expect(applyEdit(message, "Post it now.").action).toMatchObject({ text: "Post it now." });
  });

  it("treats unchanged or absent text as no edit", () => {
    expect(applyEdit(thread, "Do the thing.")).toEqual({ action: thread, edited: false });
    expect(applyEdit(thread, undefined)).toEqual({ action: thread, edited: false });
  });

  it("refuses text for an action the skill did not mark editable", () => {
    expect(() => applyEdit({ ...thread, editable: false }, "sneaky")).toThrow(/not editable/);
    expect(() => applyEdit({ type: "command", label: "Close", command: "gh issue close 1", primary: false }, "rm -rf /")).toThrow(/not editable/);
  });
});
