#!/usr/bin/env node
// Renders each tab's chapter of the introduction as a short seamless loop for the chapter panes (src/chapters). It
// drives packages/world's own story page in capture mode (src/story/story.html?mode=capture, captions none) and its
// player, switched to the site's stops: each beat is built and settled by the page's own clock (window.__gpClock),
// then drawn at the site's rest (the beat's local time) with its plates off and its screens laid out for each camera,
// the camera drifting on a closed path round the rest (a sway in azimuth, a slight rise and push in, and back), one
// picture per 1/fps on the drift's clock: the last frame runs into the first, and frame 0 is the rest itself.
//
//   packages/world: sh scripts/serve.sh <port>
//   site:           WORLD_BROWSER_LIB=<launcher> node scripts/render-chapters.mjs --port <port>
//                     [--loops sealed,stack-flap] [--seconds 5] [--fps 30] [--out public/chapters] [--work <dir>] [--probe]
//
// WORLD_BROWSER_LIB names the launcher module packages/world's render and capture scripts use (its README: Checks):
// headless Chromium on the GPU, a temporary profile and TMPDIR, the user's HOME kept, every request outside the served
// origin refused. The pictures are drawn at 1920 x 1080 (the frames' own layout size) and piped to ffmpeg, which brings
// them to 960 x 540 and 640 x 360 with Lanczos into lossless masters in --work; from those: VP9 WebM and H.264 MP4 at
// each size, each under --max-kb (the quality steps down until it fits), and a WebP poster of frame 0 at 960 x 540.
// Writes <out>/<loop>.json beside them: the beat, its frame, the code's commit, the command, each file's SHA-256.
// site/.gitignore ignores *.mp4 and *.webm (the scene captures'), so a new loop's videos are added with git add -f.
// --probe shoots frame 0 of each loop (--probe-all: and two later frames) as PNGs into --work and stops there.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RESERVED = new Set([5184, 5185, 15190, 15193, 15199]);
const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(site, "..");
const port = Number(opt("port"));
if (!Number.isInteger(port) || port <= 0) {
  console.error("usage: node scripts/render-chapters.mjs --port <p> [--loops a,b] [--seconds 5] [--fps 30] [--out public/chapters] [--work dir] [--probe]");
  process.exit(2);
}
if (RESERVED.has(port)) {
  console.error(`port ${port} is reserved; pick a spare port`);
  process.exit(2);
}
const seconds = Number(opt("seconds", "5"));
const fps = Number(opt("fps", "30"));
const out = resolve(opt("out", join(site, "public", "chapters")));
const work = resolve(opt("work", join(tmpdir(), "gp-chapters")));
const maxBytes = Number(opt("max-kb", "340")) * 1024;
const W = 1920;
const H = 1080;
const SIZES = [
  { w: 960, h: 540 },
  { w: 640, h: 360 },
];
const base = `http://127.0.0.1:${port}`;
const pageUrl = `${base}/src/story/story.html?mode=capture&cut=master&w=${W}&h=${H}&captions=none`;

// The loops: --loops, or every loop the chapter map names (src/chapters/map.ts), each drawn from its beat.
const { CHAPTER_LOOPS, LOOP_BEAT } = await import(pathToFileURL(join(site, "src", "chapters", "map.ts")).href);
const loops = (opt("loops") ?? CHAPTER_LOOPS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);

// The drift round the rest: degrees of azimuth either way, degrees of rise at the far point, the share of distance
// pushed in there. A beat inside a hall moves less.
const DRIFT = { az: 2.4, el: 0.6, push: 0.03 };
const DRIFT_FOR = {
  "pit-wall": { az: 1.4, el: 0.3, push: 0.015 },
  garage: { az: 1.8, el: 0.4, push: 0.02 },
};
// Each loop's view of its beat. The rests leave room for the caption and plates the loops leave out, so a loop whose
// subject then sits off center is cropped round it (crop: x, y and width in the 1920 x 1080 picture, at 16:9). A loop
// of one part of the stack moves the stack's own camera onto that part (cam: the target in the stack's meters, the
// share of the rest's distance, no lens shift), drawn at full size rather than cropped.
const VIEWS = {
  check: { crop: [260, 30, 1600] },
  witness: { crop: [420, 46, 1400] },
  stack: { crop: [75, 0, 1600] },
  "stack-prices": { cam: { target: [170, 24, 105], dist: 0.32, shift: [0, 0] } },
  "stack-flap": { cam: { target: [4, 14, 205], dist: 0.2, shift: [0, 0] } },
  "stack-openfour": { cam: { target: [385, 26, 200], dist: 0.18, shift: [0, 0] } },
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const gpuLoad = () => {
  try {
    return Number(execFileSync("ioreg", ["-r", "-d", "1", "-c", "IOAccelerator"], { encoding: "utf8" }).match(/"Device Utilization %"=(\d+)/)?.[1] ?? NaN);
  } catch {
    return null;
  }
};
const loadAvg = () => {
  try {
    return execFileSync("sysctl", ["-n", "vm.loadavg"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};
const stamp = () => {
  const d = new Date();
  const fmt = (tz) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .format(d)
      .replace(",", "");
  return { bangkok: fmt("Asia/Bangkok"), ct: fmt("America/Chicago") };
};
function run(cmd, args, input) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d;
    });
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}: ${err.trim().slice(-800)}`))));
    if (input) input(p.stdin);
  });
}

// The code the pictures come from: the last commit that changed packages/world (a commit of the main line, which
// stays put when a branch on it is rebased), and packages/world as that commit has it.
const commit = execFileSync("git", ["-C", repo, "log", "-1", "--format=%H", "HEAD", "--", "packages/world"], { encoding: "utf8" }).trim();
const worldDirty = execFileSync("git", ["-C", repo, "status", "--porcelain", "--", "packages/world"], { encoding: "utf8" }).trim();
if (worldDirty && !has("probe")) {
  console.error(`packages/world has changes the commit does not hold; commit or set them aside first:\n${worldDirty}`);
  process.exit(1);
}
const frameDataSha = sha256(readFileSync(join(repo, "packages", "world", "src", "data", "frame-data.json")));
const ffmpegVersion = execFileSync("ffmpeg", ["-hide_banner", "-version"], { encoding: "utf8" }).split("\n")[0];
const cwebpVersion = execFileSync("cwebp", ["-version"], { encoding: "utf8" }).trim();

const lib = process.env.WORLD_BROWSER_LIB;
if (!lib) {
  console.error("set WORLD_BROWSER_LIB to the browser launcher module (packages/world/README.md: Checks)");
  process.exit(2);
}
const { launch, guardRequests } = await import(pathToFileURL(lib).href);
process.env.ROLE_VIDEOS_TMP ??= tmpdir();
mkdirSync(out, { recursive: true });
mkdirSync(work, { recursive: true });

const { ctx, close } = await launch({ viewport: { width: W, height: H }, dpr: 1, colorScheme: "dark" });
const refused = await guardRequests(ctx, base);
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => {
  if (m.type() === "warning" || m.type() === "error") logs.push(`${m.type()}: ${m.text()}`.slice(0, 400));
});
page.on("pageerror", (e) => logs.push(`pageerror: ${String(e?.stack ?? e).slice(0, 400)}`));
const shoot = () => page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H }, animations: "disabled", caret: "hide" });

let failed = 0;
try {
  await page.goto(pageUrl, { waitUntil: "load", timeout: 300_000 });
  // the pointer outside the stage, as the package's stills scripts park it
  await page.mouse.move(W + 40, Math.round(H * 0.86));
  await page.waitForFunction(() => window.__ready === true || typeof window.__error === "string", null, { timeout: 300_000, polling: 100 });
  const err0 = await page.evaluate(() => window.__error ?? null);
  if (err0) throw new Error(err0);
  // the site's stops, on the page's own player and clock
  const stops = await page.evaluate(async () => {
    const P = window.__gpHandle.player;
    P.setCut("site");
    const { keyDef } = await import("/src/story/clock.ts");
    return P.film.stops.map((i, n) => {
      const k = P.film.keys[i];
      const d = keyDef(k.key);
      return { chapter: n + 1, i, id: k.key, at: k.at, frame: d.frame, name: d.name, term: d.term, tab: d.tab, local: d.local ?? null };
    });
  });
  const gpu = await page.evaluate(() => window.__gpHandle.player.stage.gpu());

  for (const loop of loops) {
    const beat = LOOP_BEAT[loop] ?? loop;
    const stop = stops.find((s) => s.id === beat);
    if (!stop) {
      console.error(`${loop}: its beat ${beat} is not a stop of the site's story`);
      failed++;
      continue;
    }
    const drift = { ...DRIFT, ...(DRIFT_FOR[beat] ?? {}) };
    const view = VIEWS[loop] ?? {};
    const n = Math.round(seconds * fps);
    const t0 = Date.now();
    const gpuBefore = gpuLoad();
    const load = loadAvg();
    // built and settled by the page's own clock, at the beat's hold
    await page.evaluate((t) => window.__gpClock(t, 0), stop.at);
    const errAt = await page.evaluate(() => window.__error ?? null);
    if (errAt) throw new Error(`${beat}: ${errAt}`);
    const pose = async (j) =>
      page.evaluate(
        async ({ j, n, i, at, drift, cam: over }) => {
          const P = window.__gpHandle.player;
          const { keyDef } = await import("/src/story/clock.ts");
          const k = P.film.keys[i];
          const inst = P.inst(keyDef(k.key).frame);
          if (!inst.ready) throw new Error(`${k.key}: frame ${inst.id} is not built`);
          const rest = inst.restPose;
          // a part of the beat: its camera moved onto the part, the clipping planes with it
          const r = over
            ? { ...rest, target: over.target, dist: rest.dist * over.dist, shift: over.shift, near: rest.near != null ? rest.near * over.dist : undefined, far: rest.far != null ? rest.far * over.dist : undefined }
            : rest;
          const th = (2 * Math.PI * j) / n;
          const k1 = (1 - Math.cos(th)) / 2;
          const cam = {
            ...r,
            target: [...r.target],
            shift: r.shift ? [...r.shift] : undefined,
            az: r.az + drift.az * Math.sin(th),
            el: drift.el ? Math.min(89.5, r.el + drift.el * k1) : r.el,
            dist: r.dist * (1 - drift.push * k1),
          };
          const local = keyDef(k.key).local ?? inst.restLocal;
          // the plates off (plates: null): the frame's screens are laid out for this camera, its plates hidden
          const pic = { draws: [{ inst, local, alpha: 1, pose: cam }], plates: null, where: { kind: "hold", i, since: 0, left: 1 }, t: at + j * 1e-6 };
          P.render(pic, 0);
          const shown = await P.dress(pic);
          if (shown.moved) P.render(pic, 0);
          shown.apply();
          await document.fonts.ready;
          P.stage.renderer.getContext().finish();
          await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
          return { local, rest: r, pose: { az: +cam.az.toFixed(3), el: +cam.el.toFixed(3), dist: +cam.dist.toFixed(3) } };
        },
        { j, n, i: stop.i, at: stop.at, drift, cam: view.cam ?? null },
      );

    if (has("probe")) {
      for (const j of has("probe-all") ? [0, Math.round(n / 4), Math.round(n / 2)] : [0]) {
        const p = await pose(j);
        writeFileSync(join(work, `${loop}-${String(j).padStart(3, "0")}.png`), await shoot());
        console.log(`${loop} frame ${j}: az ${p.pose.az} el ${p.pose.el} dist ${p.pose.dist} local ${p.local}${j ? "" : ` rest ${JSON.stringify(p.rest)}`}`);
      }
      continue;
    }

    // the pictures, piped to ffmpeg: two lossless masters, one per size
    const masters = SIZES.map((s) => join(work, `${loop}-${s.w}.mkv`));
    const crop = view.crop ? `crop=${view.crop[2]}:${Math.round((view.crop[2] * 9) / 16)}:${view.crop[0]}:${view.crop[1]},` : "";
    const filter = `[0:v]${crop}split=2[a][b];[a]scale=${SIZES[0].w}:${SIZES[0].h}:flags=lanczos[o0];[b]scale=${SIZES[1].w}:${SIZES[1].h}:flags=lanczos[o1]`;
    let feed;
    const ff = run(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "pipe:0", "-filter_complex", filter,
        "-map", "[o0]", "-c:v", "ffv1", masters[0], "-map", "[o1]", "-c:v", "ffv1", masters[1]],
      (stdin) => {
        feed = stdin;
      },
    );
    const perFrame = [];
    for (let j = 0; j < n; j++) {
      const f0 = Date.now();
      await pose(j);
      const png = await shoot();
      if (!feed.write(png)) await new Promise((r) => feed.once("drain", r));
      perFrame.push(Date.now() - f0);
    }
    feed.end();
    await ff;
    const renderMs = Date.now() - t0;
    const gpuAfter = gpuLoad();

    // the poster: frame 0 (the rest) at 960 x 540
    const posterPng = join(work, `${loop}-poster.png`);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", masters[0], "-frames:v", "1", posterPng]);
    const files = {};
    const poster = `${loop}.webp`;
    execFileSync("cwebp", ["-quiet", "-q", "80", "-m", "6", "-sharp_yuv", posterPng, "-o", join(out, poster)]);
    files[poster] = { kind: "poster", width: SIZES[0].w, height: SIZES[0].h, encoder: "cwebp -q 80 -m 6 -sharp_yuv" };

    // the videos, each stepping its quality down until it fits
    const yuv = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p";
    const tags = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
    for (const [si, s] of SIZES.entries()) {
      for (const kind of ["webm", "mp4"]) {
        const name = `${loop}-${s.w}.${kind}`;
        const file = join(out, name);
        const steps = kind === "webm" ? [34, 37, 40, 43, 46, 50] : [24, 26, 28, 30, 32, 35];
        let used = null;
        for (const crf of steps) {
          const args =
            kind === "webm"
              ? ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", String(crf), "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", "-threads", "4", "-g", String(n), "-pix_fmt", "yuv420p"]
              : ["-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high", "-g", String(n), "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
          await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", masters[si], "-vf", yuv, ...args, ...tags, "-an", file]);
          used = crf;
          if (statSync(file).size <= maxBytes) break;
        }
        files[name] = {
          kind,
          width: s.w,
          height: s.h,
          codec: kind === "webm" ? "VP9" : "H.264 High",
          encoder: kind === "webm" ? `libvpx-vp9 -crf ${used} -b:v 0 -deadline good -cpu-used 2` : `libx264 -preset slow -crf ${used}`,
        };
      }
    }
    for (const [name, f] of Object.entries(files)) {
      const buf = readFileSync(join(out, name));
      f.bytes = buf.length;
      f.sha256 = sha256(buf);
    }
    const sorted = perFrame.slice().sort((a, b) => a - b);
    const receipt = {
      schema: "grand-prix.chapter-loop.v1",
      what: `Chapter ${String(stop.chapter).padStart(2, "0")} of the introduction, "${stop.name}", as a ${seconds} s loop for the chapter panes: the beat at the site's rest, drawn without its caption, scope line or plates, the camera drifting round its rest pose and back. Positions are schematic, as in the story.`,
      loop,
      beat,
      chapter: stop.chapter,
      name: stop.name,
      term: stop.term,
      tab: stop.tab,
      frame: stop.frame,
      local: stop.local,
      code: { commit, world: "packages/world as the commit holds it (its last change before the render)" },
      frame_data_sha256: frameDataSha,
      render: {
        command: `packages/world: sh scripts/serve.sh <port>; site: WORLD_BROWSER_LIB=<launcher> node scripts/render-chapters.mjs --port <port> --loops ${loop} --seconds ${seconds} --fps ${fps}`,
        page: `src/story/story.html?mode=capture&cut=master&w=${W}&h=${H}&captions=none, the player set to the site's stops`,
        drawn: `${W} x ${H} CSS px at 1x, Lanczos to each size`,
        loop: { seconds, fps, frames: n, drift, ...(view.crop ? { crop: { x: view.crop[0], y: view.crop[1], width: view.crop[2], height: Math.round((view.crop[2] * 9) / 16) } } : {}), ...(view.cam ? { camera: view.cam } : {}) },
        rendered: stamp(),
        gpu,
        tools: [ffmpegVersion, cwebpVersion],
        timing: {
          wall_ms: renderMs,
          per_frame_ms: { mean: Math.round(perFrame.reduce((a, b) => a + b, 0) / perFrame.length), p95: sorted[Math.floor(sorted.length * 0.95)] },
          gpu_load_pct: { before: gpuBefore, after: gpuAfter },
          load_average: load,
          under_load: (gpuBefore ?? 0) > 30,
        },
      },
      files,
      rerender_when: `the beat's frame changes (packages/world/src/stations/${stop.frame.split(".")[0]}/**, its kit parts or the frame data), or its place in the site's story`,
    };
    writeFileSync(join(out, `${loop}.json`), `${JSON.stringify(receipt, null, 1)}\n`);
    const sizes = Object.entries(files)
      .map(([name, f]) => `${name} ${(f.bytes / 1024).toFixed(0)} KB`)
      .join(", ");
    console.log(`${loop} (chapter ${stop.chapter}, ${stop.frame}): ${n} frames in ${(renderMs / 1000).toFixed(1)} s (GPU ${gpuBefore}% before${receipt.render.timing.under_load ? ", under load" : ""}); ${sizes}`);
  }
} catch (e) {
  console.error(`render failed: ${e?.stack ?? e}`);
  failed++;
} finally {
  await close();
}
if (logs.length) console.log(`console: ${logs.length} warnings or errors\n  ${logs.slice(0, 12).join("\n  ")}`);
if (refused.length) console.log(`refused: ${refused.slice(0, 12).join(", ")}`);
console.log(`out: ${relative(site, out) || "."}`);
process.exit(failed ? 1 : 0);
