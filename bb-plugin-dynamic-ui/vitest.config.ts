import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  // The suites test the view schema, the store against a real SQLite database, and the command runner.
  // Nothing needs a DOM.
  test: { environment: "node" },
  resolve: {
    alias: { "@": new URL(".", import.meta.url).pathname },
  },
});
