import { describe, expect, test } from "vitest";

import { bestErrorLine, createGwsRunner, GwsMissingError, parseJsonOutput } from "./gws.js";

describe("parseJsonOutput", () => {
  test("reads plain JSON", () => {
    expect(parseJsonOutput('{"threads":[]}')).toEqual({ threads: [] });
  });

  test("skips a notice printed ahead of the JSON", () => {
    expect(parseJsonOutput('Using keyring backend: keyring\n{\n  "threads": []\n}')).toEqual({ threads: [] });
  });

  test("says what it got when there is no JSON", () => {
    expect(() => parseJsonOutput("Please run gws auth login")).toThrow('got "Please run gws auth login"');
  });
});

describe("bestErrorLine", () => {
  test("skips the keyring notice for the line that names the problem", () => {
    expect(bestErrorLine("Using keyring backend: keyring\nnote: retrying\nerror: token expired\n")).toBe("error: token expired");
  });

  test("is null for empty stderr", () => {
    expect(bestErrorLine("Using keyring backend: keyring\n")).toBeNull();
  });
});

describe("createGwsRunner", () => {
  test("reports a command that does not exist as missing", async () => {
    await expect(createGwsRunner("/nonexistent/gws")(["--version"])).rejects.toBeInstanceOf(GwsMissingError);
  });
});
