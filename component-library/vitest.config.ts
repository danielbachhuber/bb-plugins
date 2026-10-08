import { defineConfig } from "vitest/config";

export default defineConfig({
  // A plugin installs this package into its node_modules, where Vite ignores
  // the tsconfig, so the JSX transform is set here as well as there.
  esbuild: { jsx: "automatic" },
  test: {
    // Per-file `// @vitest-environment jsdom` docblocks opt suites into a DOM.
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**"],
  },
});
