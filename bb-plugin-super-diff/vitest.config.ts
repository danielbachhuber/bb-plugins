import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Per-file `// @vitest-environment jsdom` docblocks opt suites into a DOM.
    environment: "node",
  },
  resolve: {
    alias: { "@": new URL(".", import.meta.url).pathname },
  },
});
