import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Hash routing plus a relative base lets the same build serve from any path,
  // GitHub Pages included.
  base: "./",
  plugins: [react()],
  resolve: {
    // packages/core is imported from source so the browser recomputes leaves
    // and roots with the exact code that sealed them. Its dependencies resolve
    // from this project, so a clean checkout builds without the root install.
    alias: {
      "@core": resolve(here, "../packages/core/src"),
      viem: resolve(here, "node_modules/viem"),
      canonicalize: resolve(here, "node_modules/canonicalize"),
    },
  },
  server: {
    port: 15191,
    strictPort: true,
    host: "127.0.0.1",
    fs: {
      allow: [here, resolve(here, "../packages/core/src")],
      deny: ["**/data-local/**", "**/.git/**", ".env", ".env.*"],
    },
  },
  preview: { port: 15192, strictPort: true, host: "127.0.0.1" },
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
