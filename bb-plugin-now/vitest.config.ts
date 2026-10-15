import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**"],
    // A failed start throws so bb's composer keeps the draft. bb's composer
    // catches it; the test harness's stand-in does not, so the one test that
    // fails a start on purpose would otherwise fail the run. Only its message.
    onUnhandledError: (error) =>
      (error as { message?: string }).message === "Test: the thread could not be started." ? false : undefined,
  },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
