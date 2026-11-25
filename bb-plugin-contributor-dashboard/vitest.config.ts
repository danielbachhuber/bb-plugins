import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Weeks and months start at local midnight; pinning the zone keeps tests
// independent of the machine they run on.
process.env.TZ = "UTC";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
    // A component-library file would otherwise load the repository root's
    // older SDK; bb gives the plugin's own at runtime.
    dedupe: ["@get-bb/plugin-sdk"],
  },
  test: { environment: "node" },
});
