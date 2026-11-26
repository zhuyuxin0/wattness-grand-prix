#!/usr/bin/env node
// Renders a scene frame by frame from the scene lab, in a headless browser, to
// PNG stills or an H.264 video. Every frame is drawn on demand at an exact
// scene time, so two runs give the same pictures and no frame is dropped.
//
//   node scripts/capture-scene.mjs --url http://127.0.0.1:15192/ --scene grid \
//     [--w 1920 --h 1080 --dpr 1 --fps 60 --from 0 --to 24] [--hud 0] \
//     [--stills 0,4,9.5,21.5 --out dir] [--mp4 file.mp4]
//
// Playwright is resolved from this project, or from the folder in PLAYWRIGHT_DIR
// (a node_modules directory that holds it). ffmpeg must be on PATH for --mp4.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const url = arg("url", "http://127.0.0.1:15192/");
const scene = arg("scene", "grid");
const names = { grid: "starting-grid", brain: "brain-map" };
const name = names[scene];
if (!name) throw new Error(`--scene must be one of ${Object.keys(names).join(", ")}`);
const w = Number(arg("w", 1920));
const h = Number(arg("h", 1080));
const dpr = Number(arg("dpr", 1));
const fps = Number(arg("fps", 60));
const hud = arg("hud", "1");
const stills = arg("stills");
const outDir = arg("out");
const mp4 = arg("mp4");
if (!stills && !mp4) throw new Error("pass --stills t1,t2,... with --out, or --mp4 <file>");

const require = createRequire(process.env.PLAYWRIGHT_DIR ? join(resolve(process.env.PLAYWRIGHT_DIR), "noop.js") : import.meta.url);
const { chromium } = require("playwright");

// A throwaway profile and temp folder; the user's HOME stays as it is.
const profile = mkdtempSync(join(tmpdir(), "gp-capture-"));
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  viewport: { width: w, height: h },
  deviceScaleFactor: dpr,
  args: ["--use-mock-keychain", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
  env: { ...process.env, TMPDIR: profile },
});

try {
  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const q = new URLSearchParams({ scene, w: String(w), h: String(h), chrome: "0", quality: "high", t: "0", hud });
  if (dpr !== 1) q.set("dpr", String(dpr));
  // The scene lab is a path from the site's root (the build's base is "/"), whatever path --url names.
  const lab = new URL("/scene-lab", url);
  lab.search = q.toString();
  await page.goto(lab.href, { waitUntil: "networkidle" });
  await page.waitForFunction((n) => window.__gpScenes?.[n], name, { timeout: 30000 });
  await page.evaluate((n) => window.__gpScenes[n].ready, name);
  const duration = await page.evaluate((n) => window.__gpScenes[n].duration, name);
  const stage = page.locator(".scene-lab__stage");

  const shoot = async (t) => {
    await page.evaluate(([n, s]) => window.__gpScenes[n].render(s), [name, t]);
    return stage.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  };

  if (stills) {
    const dir = resolve(outDir ?? ".");
    mkdirSync(dir, { recursive: true });
    for (const s of stills.split(",").map(Number)) {
      const file = join(dir, `${scene}-${s.toFixed(2).replace(".", "_")}.png`);
      writeFileSync(file, await shoot(s));
      console.log(file);
    }
  }

  if (mp4) {
    const from = Number(arg("from", 0));
    const to = Number(arg("to", duration));
    const frames = Math.round((to - from) * fps);
    const ff = spawn(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", resolve(mp4)],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const done = new Promise((ok, fail) => ff.on("close", (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited ${c}`)))));
    const started = Date.now();
    for (let i = 0; i <= frames; i++) {
      const buf = await shoot(from + i / fps);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (i % fps === 0) process.stdout.write(`\r${i}/${frames} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
    ff.stdin.end();
    await done;
    console.log(`\n${resolve(mp4)}`);
  }

  if (errors.length) console.warn(`page errors:\n${errors.join("\n")}`);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}
