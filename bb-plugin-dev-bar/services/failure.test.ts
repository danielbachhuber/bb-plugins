import { describe, expect, it } from "vitest";
import { diagnose, threadRequest } from "./failure";

describe("diagnose", () => {
  it("finds the missing program in sh, dash, zsh, and pnpm output", () => {
    expect(diagnose("> tsx scripts/launch/cli.ts status --json\n\nsh: tsx: command not found\n ELIFECYCLE  Command failed.")).toEqual({
      kind: "missing-command",
      program: "tsx",
    });
    expect(diagnose("sh: 1: vite: not found")).toEqual({ kind: "missing-command", program: "vite" });
    expect(diagnose("zsh: command not found: pnpm")).toEqual({ kind: "missing-command", program: "pnpm" });
    expect(diagnose('ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "tsx" not found')).toEqual({
      kind: "missing-command",
      program: "tsx",
    });
  });

  it("leaves other failures alone", () => {
    expect(diagnose("Error: listen EADDRINUSE: address already in use :::5174")).toBeNull();
    expect(diagnose("")).toBeNull();
  });
});

describe("threadRequest", () => {
  it("asks a missing program's thread to set up the checkout", () => {
    const request = threadRequest({ title: "Status", command: "pnpm status --json", output: "sh: tsx: command not found" });
    expect(request.title).toBe("Set up Dev Bar in this checkout");
    expect(request.prompt).toContain("Dev Bar ran `pnpm status --json` in this checkout (Status) and it failed because `tsx` isn't installed.");
    expect(request.prompt).toContain("```\nsh: tsx: command not found\n```");
  });

  it("asks any other failure's thread to fix the command", () => {
    const request = threadRequest({ title: "Start web", command: "npm run services -- start web", output: "EADDRINUSE" });
    expect(request.title).toBe("Fix: Start web failed");
    expect(request.prompt).toContain("Dev Bar ran `npm run services -- start web` in this checkout (Start web)");
  });
});
