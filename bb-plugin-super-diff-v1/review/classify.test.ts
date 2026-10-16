import { describe, expect, it } from "vitest";
import { isMechanical } from "./classify";

describe("isMechanical", () => {
  it.each([
    "package-lock.json",
    "apps/web/pnpm-lock.yaml",
    "yarn.lock",
    "Cargo.lock",
    "go.sum",
    "src/__snapshots__/widget.test.ts.snap",
    "src/widget.test.ts.snap",
    "dist/index.js",
    "packages/api/generated/client.ts",
    "src/schema.generated.ts",
    "public/vendor.min.js",
  ])("treats %s as mechanical", (path) => {
    expect(isMechanical(path)).toBe(true);
  });

  it.each([
    "src/lockfile.ts",
    "docs/package-lock.md",
    "src/distance.ts",
    "src/generator.ts",
    "src/snapshot.ts",
  ])("treats %s as ordinary", (path) => {
    expect(isMechanical(path)).toBe(false);
  });
});
