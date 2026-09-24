import { describe, expect, it } from "vitest";
import { parseCommand } from "./cli.js";

describe("parseCommand", () => {
  it("shows the overview with no arguments", () => {
    expect(parseCommand([])).toEqual({ kind: "show" });
  });

  it("joins unquoted summary words", () => {
    expect(parseCommand(["summary", "Add", "a", "CSV", "export"])).toEqual({
      kind: "summary",
      text: "Add a CSV export",
    });
  });

  it("maps the status verbs", () => {
    expect(parseCommand(["start", "Write"])).toEqual({ kind: "status", refs: ["Write"], status: "current" });
    expect(parseCommand(["done", "a", "b"])).toEqual({ kind: "status", refs: ["a", "b"], status: "done" });
    expect(parseCommand(["reopen", "a"])).toEqual({ kind: "status", refs: ["a"], status: "todo" });
  });

  it("rejects empty arguments and unknown verbs", () => {
    expect(parseCommand(["add", " "]).kind).toBe("error");
    expect(parseCommand(["summary"]).kind).toBe("error");
    expect(parseCommand(["remove", "x"])).toMatchObject({ kind: "error" });
  });
});
