import { describe, expect, it } from "vitest";
import { BbUnavailableError, createBbRunner, resolveBbPath } from "./cli";

describe("resolveBbPath", () => {
  it("prefers the setting over everything else", () => {
    const path = resolveBbPath({
      configured: "/opt/custom/bb",
      envPath: "/injected/bb",
      exists: () => true,
    });
    expect(path).toBe("/opt/custom/bb");
  });

  it("uses the path bb injected when the setting is empty", () => {
    const path = resolveBbPath({ configured: "  ", envPath: "/injected/bb", exists: () => true });
    expect(path).toBe("/injected/bb");
  });

  it("falls back to an install location, since the server's PATH is not a shell's", () => {
    const path = resolveBbPath({
      exists: (candidate) => candidate === "/usr/local/bin/bb",
    });
    expect(path).toBe("/usr/local/bin/bb");
  });

  it("settles for bare bb when nothing else matched", () => {
    expect(resolveBbPath({ exists: () => false })).toBe("bb");
  });
});

describe("createBbRunner", () => {
  it("names the setting when the CLI is not where it looked", async () => {
    const runner = createBbRunner("/nonexistent/bb");
    const error = await runner.run(["automation", "list"]).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BbUnavailableError);
    expect((error as BbUnavailableError).message).toContain("bbPath");
  });
});
