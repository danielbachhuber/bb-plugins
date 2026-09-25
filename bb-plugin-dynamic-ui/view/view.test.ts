import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allHandled, firstLine, orderItems } from "./banner.js";
import { triageView } from "./fixtures.js";
import { runCommand, tail } from "./run-command.js";
import { fillDraft, parseView, usesDraft } from "./schema.js";
import { MIGRATIONS, createStore, describeItems, type StoredView } from "./store.js";
import { feedbackMessage, hasFeedback, imageMime } from "./review.js";
import { filmstripLabels, shortLabel } from "./review-panel.js";
import { firstOpenItem, nextOpenItem } from "./view-panel.js";
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

  it("refuses {draft} in a command, and {draft} on an item with no draft", () => {
    const command = { type: "command", label: "Comment", command: "gh issue comment 7 --body '{draft}'" };
    expect(() => parseView(viewWith({ draft: "x", actions: [command] }))).toThrow(/command cannot use \{draft\}/);
    expect(() => parseView(viewWith({ actions: [post] }))).toThrow(/uses \{draft\} but the item has no draft/);
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
  it("carries the item's title, link, summary, details, and draft, and names the thread it came from", () => {
    const item = triageView.sections[0]!.items[0]!;
    const prompt = itemThreadPrompt(triageView.title, item, "thr_src");
    expect(prompt).toContain('from "Triage: acme/widgets milestone 4.2" in @thread:thr_src');
    expect(prompt).toContain("## #101 Export widgets as CSV\n\nhttps://github.com/acme/widgets/issues/101");
    expect(prompt).toContain(item.summary);
    expect(prompt).toContain(item.details);
    expect(prompt).toContain(`Comment to post:\n\n${item.draft}`);
  });

  it("leaves out what the item does not have", () => {
    const item = triageView.sections[1]!.items[1]!;
    expect(itemThreadPrompt("V", item, "thr_src")).toBe('Dig further into this item from "V" in @thread:thr_src.\n\n## #123 Dark mode for the dashboard');
  });
});
