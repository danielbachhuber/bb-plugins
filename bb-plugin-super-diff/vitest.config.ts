import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    // Per-file `// @vitest-environment jsdom` docblocks opt suites into a DOM.
    environment: "node",
  },
  resolve: {
    alias: { "@": new URL(".", import.meta.url).pathname },
  },
});
