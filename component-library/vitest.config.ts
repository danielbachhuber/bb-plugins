import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Per-file `// @vitest-environment jsdom` docblocks opt suites into a DOM.
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**"],
  },
});
