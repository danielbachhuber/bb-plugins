import { describe, expect, it } from "vitest";
import { headingFor, parseEntry, planInsert, type DocsDocument } from "./journal-insert.js";

// The shape `documents.get` returns for the journal: newest week first, a
// heading per week, then label lines each followed by a list. Every word invented.
function doc(rows: Array<[string, string?, number?]>): DocsDocument {
  let index = 1;
  const content = rows.map(([text, style = "NORMAL_TEXT", level]) => {
    const start = index;
    index += text.length + 1;
    return {
      startIndex: start,
      endIndex: index,
      paragraph: {
        elements: [{ textRun: { content: `${text}\n` } }],
        paragraphStyle: { namedStyleType: style, ...(style.startsWith("HEADING") ? { headingId: `h.${start}` } : {}) },
        ...(level === undefined ? {} : { bullet: { listId: "kix.list", nestingLevel: level } }),
      },
    };
  });
  return { revisionId: "rev1", body: { content } };
}

const JOURNAL = doc([
  ["October 9, 2026", "HEADING_2"],
  [""],
  ["Done:"],
  ["Shipped the widget sync beta.", undefined, 0],
  ["Octocat signed off on it.", undefined, 1],
  [""],
  ["Wins/Highlights:"],
  [""],
  ["Next:"],
  ["Start the gadget launch.", undefined, 0],
  [""],
  [""],
  ["October 2, 2026", "HEADING_2"],
  [""],
  ["Done:"],
  ["Wrote up the widget sync rollout.", undefined, 0],
  [""],
  ["Wins/Highlights:"],
  [""],
  ["Next:"],
]);

const WEEK = { from: "2026-10-05", to: "2026-10-11" };

function startOf(text: string, document = JOURNAL): number {
  const element = document.body.content.find((el) => el.paragraph?.elements[0].textRun?.content === `${text}\n`);
  if (element?.startIndex === undefined) throw new Error(text);
  return element.startIndex;
}

describe("parseEntry", () => {
  it("reads levels, links, and drops code and bold markers", () => {
    const lines = parseEntry(
      "- Took over [the export fix](https://github.com/acme/widgets/issues/412) from Hubber.\n" +
        "  - Ran `bb widgets sync` with **care**, see ([#7](https://github.com/acme/widgets/issues/7)).\n",
    );
    expect(lines).toEqual([
      {
        level: 0,
        text: "Took over the export fix from Hubber.",
        links: [{ start: 10, end: 24, url: "https://github.com/acme/widgets/issues/412" }],
      },
      {
        level: 1,
        text: "Ran bb widgets sync with care, see (#7).",
        links: [{ start: 36, end: 38, url: "https://github.com/acme/widgets/issues/7" }],
      },
    ]);
  });

  it("keeps a line from sitting more than one level under the one above", () => {
    expect(parseEntry("- One\n      - Deep").map((line) => line.level)).toEqual([0, 1]);
  });

  it("joins a wrapped line to the bullet above it", () => {
    expect(parseEntry("- Took over the fix\n  after Octocat found it.")[0].text).toBe(
      "Took over the fix after Octocat found it.",
    );
  });
});

describe("planInsert", () => {
  it("adds after the last bullet of the section, at the levels written", () => {
    const plan = planInsert(JOURNAL, WEEK, "Done", parseEntry("- Paired with Hubber.\n  - It helped."));
    expect(plan.kind).toBe("insert");
    if (plan.kind !== "insert") return;
    const after = startOf("Octocat signed off on it.") + "Octocat signed off on it.".length;
    const requests = plan.body.requests as any[];
    const [insert, , , bullets] = requests;
    expect(insert).toEqual({ insertText: { location: { index: after }, text: "\n\nPaired with Hubber.\n\tIt helped." } });
    // Bullets start after the spare paragraph, which goes last.
    expect(bullets.createParagraphBullets.range.startIndex).toBe(after + 2);
    expect(requests[requests.length - 1]).toEqual({
      deleteContentRange: { range: { startIndex: after + 1, endIndex: after + 2 } },
    });
    expect(plan.heading).toBe("October 9, 2026");
    expect(plan.headingId).toBe(`h.${startOf("October 9, 2026")}`);
    expect(plan.body.writeControl).toEqual({ requiredRevisionId: "rev1" });
  });

  it("counts link ranges without the tabs that set the level", () => {
    const plan = planInsert(
      JOURNAL,
      WEEK,
      "Done:",
      parseEntry("- Paired with Hubber.\n  - See [the notes](https://example.com/notes)."),
    );
    const requests = plan.body.requests as any[];
    const link = requests.find((request) => request.updateTextStyle?.fields === "link");
    const start = startOf("Octocat signed off on it.") + "Octocat signed off on it.".length + 2;
    const second = start + "Paired with Hubber.".length + 1;
    expect(link.updateTextStyle.range).toEqual({ startIndex: second + 4, endIndex: second + 13 });
  });

  it("adds right after the label when the section is empty", () => {
    const plan = planInsert(JOURNAL, WEEK, "wins/highlights", parseEntry("- Octocat asked for a demo."));
    const [insert] = plan.body.requests as any[];
    expect(insert.insertText.location.index).toBe(startOf("Wins/Highlights:") + "Wins/Highlights:".length);
  });

  it("names the label it could not find", () => {
    expect(() => planInsert(JOURNAL, WEEK, "Blockers", parseEntry("- x"))).toThrow(
      'The entry under "October 9, 2026" has no "Blockers:" line.',
    );
  });

  it("plans a new entry above the newest older one, with that entry's labels", () => {
    const plan = planInsert(JOURNAL, { from: "2026-10-12", to: "2026-10-18" }, "Done", parseEntry("- x"));
    expect(plan.kind).toBe("create");
    const [insert] = plan.body.requests as any[];
    expect(insert.insertText).toEqual({
      location: { index: startOf("October 9, 2026") },
      text: "October 16, 2026\n\nDone:\n\nWins/Highlights:\n\nNext:\n\n\n",
    });
  });
});

describe("headingFor", () => {
  it("is the week's Friday, spelled out", () => {
    expect(headingFor("2026-10-05")).toBe("October 9, 2026");
  });
});
