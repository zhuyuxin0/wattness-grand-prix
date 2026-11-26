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
    // packages/world (the 3D story, ONE PLAN and the stack) is imported from
    // source as well, as @world, and only by dynamic import inside the tab
    // that shows it. Its one runtime dependency, three, is deduped to this
    // project's copy, so the package builds from this install and three.js
    // loads once.
    alias: {
      "@core": resolve(here, "../packages/core/src"),
      "@world": resolve(here, "../packages/world/src"),
      viem: resolve(here, "node_modules/viem"),
      canonicalize: resolve(here, "node_modules/canonicalize"),
    },
    dedupe: ["three"],
  },
  server: {
    port: 15191,
    strictPort: true,
    host: "127.0.0.1",
    fs: {
      allow: [here, resolve(here, "../packages/core/src"), resolve(here, "../packages/world/src")],
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
