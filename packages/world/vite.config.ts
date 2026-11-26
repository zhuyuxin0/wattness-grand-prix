import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
// three is the only dependency the page loads at runtime; its real directory sits in the workspace's store,
// outside this package, and is the one path besides the package itself the server may read.
const three = realpathSync(dirname(createRequire(import.meta.url).resolve("three")) + "/..");

// Ports other services own on this machine.
const RESERVED = new Set([5184, 5185, 15190, 15193, 15199]);

function refuseReservedPorts(): Plugin {
  return {
    name: "world:refuse-reserved-ports",
    configResolved(config) {
      const port = config.server.port;
      if (port != null && RESERVED.has(port)) throw new Error(`port ${port} is reserved; pick a spare port`);
    },
  };
}

// Vite 5.4.11 checks neither the Host header nor the peer: a page elsewhere could reach this server by rebinding a
// name to 127.0.0.1. A plugin's own middleware runs before Vite's, so this answers every request first.
function loopbackOnly(): Plugin {
  return {
    name: "world:loopback-only",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const port = server.config.server.port;
        const host = (req.headers.host ?? "").toLowerCase();
        const peer = req.socket.remoteAddress ?? "";
        const hostOk = host === `127.0.0.1:${port}` || host === `localhost:${port}`;
        const peerOk = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
        if (hostOk && peerOk) return next();
        res.statusCode = 403;
        res.end("forbidden");
      });
    },
  };
}

const ADDONS = [
  "environments/RoomEnvironment.js",
  "lines/Line2.js",
  "lines/LineGeometry.js",
  "lines/LineMaterial.js",
  "lines/LineSegments2.js",
  "lines/LineSegmentsGeometry.js",
  "postprocessing/EffectComposer.js",
  "postprocessing/GTAOPass.js",
  "postprocessing/OutputPass.js",
  "postprocessing/Pass.js",
  "postprocessing/RenderPass.js",
  "utils/BufferGeometryUtils.js",
].map((p) => `three/addons/${p}`);

export default defineConfig({
  root: here,
  base: "./",
  publicDir: false,
  clearScreen: false,
  plugins: [refuseReservedPorts(), loopbackOnly()],
  server: {
    host: "127.0.0.1",
    strictPort: true,
    // no cross-origin reads; no live reload (a reload mid-render would restart the frame)
    cors: false,
    hmr: false,
    fs: {
      strict: true,
      allow: [here, three],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/data-local/**", "**/.git/**"],
    },
  },
  preview: { host: "127.0.0.1", strictPort: true },
  // Every station is crawled at startup, so no dependency is discovered mid-render (a discovery reloads the page).
  optimizeDeps: { entries: ["lab.html", "src/**/*.ts"], include: ["three", ...ADDONS] },
  // Every page the package serves: the frame lab, the story (site and capture), ONE PLAN, the stack's live demo and the
  // Memory tab's (the brain station's).
  // three is one chunk of about 820 kB and the synced frame data another of about 730 kB, so the limit sits above both.
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        lab: resolve(here, "lab.html"),
        story: resolve(here, "src/story/story.html"),
        play: resolve(here, "src/game/play.html"),
        stack: resolve(here, "src/stations/stack/demo/index.html"),
        brain: resolve(here, "src/stations/brain/demo/index.html"),
      },
    },
  },
});
