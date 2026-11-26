import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside the Workers runtime (workerd, through Miniflare), in process. Outbound fetches are
// answered from fixtures, except in test/live.test.ts when EDGE_LIVE=1.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { EDGE_LIVE: process.env.EDGE_LIVE ?? "" } },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
