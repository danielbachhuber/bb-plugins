import { describe, expect, it } from "vitest";
import { parseEntry, type DocsDocument } from "./journal-insert.js";
import { countReviewed, monthHeading, monthRange, monthSection, parseMonth, planWinsInsert, planWinsSummary, previousMonth, statsLine, weeksOf } from "./wins.js";

// The wins doc as `documents.get` returns it: a title, then a heading per
// month, newest first, each with a list. Every word invented.
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

const WINS = doc([
  ["Octocat Wins", "HEADING_1"],
  ["September 2026", "HEADING_2"],
  [""],
  ["August 2026", "HEADING_2"],
  ["Shipped the widget sync beta.", undefined, 0],
  ["Hubber: \"This saves me an hour a week.\"", undefined, 1],
  ["", undefined, 0],
  ["", undefined, 0],
  ["July 2026", "HEADING_2"],
  ["Wrote up the gadget launch plan.", undefined, 0],
]);

function startOf(text: string, document = WINS): number {
  const element = document.body.content.find((el) => el.paragraph?.elements[0].textRun?.content === `${text}\n`);
  if (element?.startIndex === undefined) throw new Error(text);
  return element.startIndex;
}

const LINES = parseEntry("- Ran the gadget review with Hubber.");

describe("months", () => {
  it("reads both spellings and names the heading", () => {
    expect(parseMonth("2026-09")).toBe("2026-09");
    expect(parseMonth("September 2026")).toBe("2026-09");
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("Smarch 2026")).toBeNull();
    expect(monthHeading("2026-09")).toBe("September 2026");
  });

  it("takes the month before today, across a new year", () => {
    expect(previousMonth(new Date(2026, 9, 15))).toBe("2026-09");
    expect(previousMonth(new Date(2027, 0, 3))).toBe("2026-12");
  });

  it("gives the weeks whose Friday is in the month", () => {
    // Fri Sep 4 is the first Friday of September 2026, Fri Oct 2 is October's.
    expect(weeksOf("2026-09")).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]);
    expect(weeksOf("2026-10")[0]).toBe("2026-09-28");
  });
});

describe("monthSection", () => {
  const TEXT = [
    "# Octocat Wins",
    "",
    "## September 2026",
    "",
    "## August 2026",
    "- Shipped the widget sync beta.",
    "  - Hubber agreed.",
    "- ",
    "## July 2026",
    "- Wrote up the gadget launch plan.",
  ].join("\n");

  it("returns the month's bullets without the empty placeholders", () => {
    expect(monthSection(TEXT, "2026-08")).toEqual({
      heading: "August 2026",
      body: "- Shipped the widget sync beta.\n  - Hubber agreed.",
    });
  });

  it("returns an empty body for a heading with nothing under it, and null for no heading", () => {
    expect(monthSection(TEXT, "2026-09")).toEqual({ heading: "September 2026", body: "" });
    expect(monthSection(TEXT, "2026-10")).toBeNull();
  });
});

describe("planWinsInsert", () => {
  it("adds under an empty month's heading", () => {
    const plan = planWinsInsert(WINS, "2026-09", LINES);
    expect(plan).toMatchObject({ kind: "insert", heading: "September 2026", headingId: `h.${startOf("September 2026")}` });
    const at = startOf("September 2026") + "September 2026".length;
    expect(plan.body.requests[0]).toEqual({ insertText: { location: { index: at }, text: "\n\nRan the gadget review with Hubber." } });
    expect(plan.body.writeControl).toEqual({ requiredRevisionId: "rev1" });
  });

  it("adds after the last bullet with text, above the empty placeholders", () => {
    const plan = planWinsInsert(WINS, "2026-08", LINES);
    const quote = 'Hubber: "This saves me an hour a week."';
    expect(plan.body.requests[0]).toMatchObject({ insertText: { location: { index: startOf(quote) + quote.length } } });
  });

  it("adds a missing month's heading above the newest earlier month, in its style", () => {
    const plan = planWinsInsert(WINS, "2026-10", LINES);
    expect(plan.kind).toBe("create");
    const at = startOf("September 2026");
    expect(plan.body.requests).toEqual([
      { insertText: { location: { index: at }, text: "October 2026\n" } },
      {
        updateParagraphStyle: {
          range: { startIndex: at, endIndex: at + "October 2026\n".length },
          paragraphStyle: { namedStyleType: "HEADING_2" },
          fields: "namedStyleType",
        },
      },
    ]);
  });

  it("refuses a month older than every heading", () => {
    expect(() => planWinsInsert(WINS, "2026-01", LINES)).toThrow(/no month heading earlier/);
  });
});

describe("pull request counts", () => {
  it("gives the month's first and last day", () => {
    expect(monthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("counts other people's pull requests reviewed inside the month, once each", () => {
    const review = (submittedAt: string | null) => ({ submittedAt });
    const nodes = [
      { number: 1, author: { login: "hubber" }, reviews: { nodes: [review("2026-09-03T15:00:00Z"), review("2026-09-04T15:00:00Z")] } },
      { number: 2, author: { login: "hubber" }, reviews: { nodes: [review("2026-08-20T15:00:00Z")] } },
      { number: 3, author: { login: "octocat" }, reviews: { nodes: [review("2026-09-10T15:00:00Z")] } },
      { number: 4, author: { login: "hubber" }, reviews: { nodes: [review(null)] } },
      { number: 1, author: { login: "hubber" }, reviews: { nodes: [review("2026-09-03T15:00:00Z")] } },
      {},
    ];
    expect(countReviewed(nodes, "2026-09", "octocat")).toBe(1);
  });

  it("writes the line", () => {
    expect(statsLine({ opened: 12, merged: 9, reviewed: 30 })).toBe("Opened 12 pull requests, had 9 merged, and reviewed 30.");
    expect(statsLine({ opened: 1, merged: 1, reviewed: 0 })).toBe("Opened 1 pull request, had 1 merged, and reviewed 0.");
  });
});

describe("planWinsSummary", () => {
  const LINE = "Opened 12 pull requests, had 9 merged, and reviewed 30.";

  it("puts the line in italics directly under the heading", () => {
    const plan = planWinsSummary(WINS, "2026-08", `_${LINE}_`);
    const at = startOf("August 2026") + "August 2026".length;
    expect(plan.kind).toBe("insert");
    expect(plan.body.requests[0]).toEqual({ insertText: { location: { index: at }, text: `\n${LINE}` } });
    expect(plan.body.requests.at(-1)).toEqual({
      updateTextStyle: { range: { startIndex: at + 1, endIndex: at + 1 + LINE.length }, textStyle: { italic: true }, fields: "*" },
    });
  });

  it("replaces the italic line already under the heading", () => {
    const withLine = doc([
      ["September 2026", "HEADING_2"],
      ["Opened 1 pull request, had 1 merged, and reviewed 0."],
      ["Shipped the widget sync beta.", undefined, 0],
      ["August 2026", "HEADING_2"],
    ]);
    withLine.body.content[1].paragraph!.elements[0].textRun!.textStyle = { italic: true };
    const old = withLine.body.content[1];
    const plan = planWinsSummary(withLine, "2026-09", LINE);
    expect(plan.body.requests[0]).toEqual({ deleteContentRange: { range: { startIndex: old.startIndex, endIndex: old.endIndex } } });
  });

  it("puts wins after the italic line, not between it and the heading", () => {
    const withLine = doc([
      ["September 2026", "HEADING_2"],
      [LINE],
      ["August 2026", "HEADING_2"],
    ]);
    const plan = planWinsInsert(withLine, "2026-09", LINES);
    expect(plan.body.requests[0]).toMatchObject({ insertText: { location: { index: startOf(LINE, withLine) + LINE.length } } });
  });
});
