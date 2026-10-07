import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Weeks and months start at local midnight; pinning the zone keeps tests
// independent of the machine they run on.
process.env.TZ = "UTC";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: { environment: "node" },
});
