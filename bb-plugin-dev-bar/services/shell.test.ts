import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand } from "./shell";

const cwd = mkdtempSync(join(tmpdir(), "dev-bar-"));

describe("runCommand", () => {
  it("returns stdout alone and the output interleaved", async () => {
    const result = await runCommand("echo out; echo err >&2; exit 3", cwd, 5_000);
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("out\n");
    expect(result.output).toContain("err");
  });

  it("returns when the command exits even if a background child keeps the pipes open", async () => {
    const started = Date.now();
    const result = await runCommand("sleep 5 & echo started", cwd, 10_000);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("started");
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("stops a command that runs past its timeout", async () => {
    const result = await runCommand("sleep 5", cwd, 200);
    expect(result.timedOut).toBe(true);
  });
});
