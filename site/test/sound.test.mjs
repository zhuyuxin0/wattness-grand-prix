// The opt-in sound (packages/world/src/lib/sound.ts) in a page made of stubs:
// no audio before the visitor's click (nor from the click that turns it off),
// the choice remembered, and every cue silent while sound is off, while the tab
// is hidden, or when it repeats too soon. The Sound switch
// (src/pages/Intro/SoundToggle.tsx) reads the module's key, and the site's
// declaration names only what the module exports. Run with `pnpm test` (Node
// 22.18 or later runs the TypeScript module directly).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const kit = resolve(site, "..", "packages", "world", "src", "lib", "sound.ts");
const RUNTIME = Symbol.for("gatelock.world.sound");

/**
 * A page of stubs: storage, the document's listeners and visibility, the
 * visitor's activation, and an AudioContext that counts the contexts made and
 * the sources started.
 */
function page({ stored = null, hasBeenActive = false } = {}) {
  const store = new Map(stored == null ? [] : [["gp.sound", stored]]);
  const listeners = new Map();
  const doc = {
    visibilityState: "visible",
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
  };
  const activation = { isActive: false, hasBeenActive };
  const audio = { made: 0, played: 0, ctx: null };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (extra = {}) => ({ connect: (next) => next, disconnect() {}, ...extra });
  const source = (extra) => node({ onended: null, start: () => void audio.played++, stop() {}, ...extra });
  class FakeAudioContext {
    constructor() {
      audio.made++;
      audio.ctx = this;
      this.state = activation.isActive ? "running" : "suspended";
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.destination = node();
    }
    resume() {
      if (activation.isActive || activation.hasBeenActive) this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      this.state = "suspended";
      return Promise.resolve();
    }
    createGain() { return node({ gain: param() }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBuffer(_channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data }; }
    createBiquadFilter() { return node({ type: "", frequency: param(), Q: param() }); }
    createStereoPanner() { return node({ pan: param() }); }
    createOscillator() { return source({ type: "", frequency: param() }); }
    createBufferSource() { return source({ buffer: null }); }
  }
  const put = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  put("localStorage", { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)) });
  put("document", doc);
  put("navigator", { userActivation: activation });
  put("AudioContext", FakeAudioContext);
  delete globalThis[RUNTIME];
  /** The page's capture listeners for one event on a target, with or without the activation the browser grants it. */
  const fire = (type, grants = true, target = null) => {
    if (grants) activation.isActive = activation.hasBeenActive = true;
    for (const fn of listeners.get(type) ?? []) fn({ type, target });
  };
  return { store, doc, activation, audio, fire };
}

let pages = 0;
/** The module as a fresh page loads it (its own URL, so its own copy). */
const load = () => import(`${pathToFileURL(kit).href}?page=${++pages}`);
const settle = () => new Promise((r) => setImmediate(r));
const cues = (s) => [s.coin, s.tick, s.glass, s.press, s.chime, s.stamp, s.fail, s.chord];

test("nothing stored: sound is off, no audio is made, and every cue is silent", async () => {
  const p = page({ hasBeenActive: true });
  const s = await load();
  assert.equal(s.soundOn(), false);
  p.fire("pointerdown");
  for (const cue of cues(s)) cue();
  assert.equal(p.audio.made, 0);
  assert.equal(p.audio.played, 0);
});

test("turning sound on starts the audio inside that click, remembers it, and the cues sound", async () => {
  const p = page();
  const s = await load();
  let told = 0;
  s.onSoundChange(() => told++);
  p.activation.isActive = p.activation.hasBeenActive = true;
  s.setSound(true);
  assert.equal(p.audio.made, 1);
  assert.equal(p.store.get("gp.sound"), "on");
  assert.equal(told, 1);
  await settle();
  assert.equal(p.audio.ctx.state, "running");
  const tink = p.audio.played;
  assert.ok(tink > 0, "turning it on sounds a tink");
  for (const cue of cues(s)) cue();
  assert.ok(p.audio.played > tink);
});

test("turning it off silences every cue, pauses the audio, and is remembered", async () => {
  const p = page();
  const s = await load();
  p.activation.isActive = p.activation.hasBeenActive = true;
  s.setSound(true);
  await settle();
  s.setSound(false);
  assert.equal(s.soundOn(), false);
  assert.equal(p.store.get("gp.sound"), "off");
  assert.equal(p.audio.ctx.state, "suspended");
  const before = p.audio.played;
  for (const cue of cues(s)) cue();
  assert.equal(p.audio.played, before);
});

test("a remembered on makes no audio at load and waits for the visitor's first click", async () => {
  const p = page({ stored: "on" });
  const s = await load();
  assert.equal(s.soundOn(), true);
  assert.equal(p.audio.made, 0);
  for (const cue of cues(s)) cue();
  assert.equal(p.audio.played, 0);
  // a key that grants no activation (Escape) starts nothing
  p.fire("keydown", false);
  assert.equal(p.audio.made, 0);
  p.fire("pointerdown");
  assert.equal(p.audio.made, 1);
  await settle();
  s.press();
  assert.ok(p.audio.played > 0);
});

test("a click on the switch is left to it: turning a remembered on off makes no audio", async () => {
  const p = page({ stored: "on" });
  const s = await load();
  const onSwitch = { closest: (sel) => (sel === "[data-sound-switch]" ? onSwitch : null) };
  for (const type of ["pointerdown", "pointerup", "click"]) p.fire(type, true, onSwitch);
  assert.equal(p.audio.made, 0);
  s.setSound(false);
  assert.equal(p.audio.made, 0);
  assert.equal(p.store.get("gp.sound"), "off");
  // and with sound off, a click anywhere starts nothing
  p.fire("pointerdown");
  assert.equal(p.audio.made, 0);
});

test("a remembered on starts at load when the page has already had a click", async () => {
  const p = page({ stored: "on", hasBeenActive: true });
  const s = await load();
  assert.equal(p.audio.made, 1);
  await settle();
  s.stamp();
  assert.ok(p.audio.played > 0);
});

test("coins clink a dozen times a second at most, and a hidden tab is silent", async () => {
  const p = page();
  const s = await load();
  p.activation.isActive = p.activation.hasBeenActive = true;
  s.setSound(true);
  await settle();
  const ctx = p.audio.ctx;
  const clinks = () => {
    const before = p.audio.played;
    s.coin(5);
    return p.audio.played > before;
  };
  ctx.currentTime = 10;
  assert.equal(clinks(), true);
  assert.equal(clinks(), false, "a second clink in the same instant");
  ctx.currentTime += 1 / 24;
  assert.equal(clinks(), false);
  ctx.currentTime += 1 / 12;
  assert.equal(clinks(), true);
  p.doc.visibilityState = "hidden";
  ctx.currentTime += 1;
  assert.equal(clinks(), false);
});

test("the switch reads the module's key, and the site declares only what the module exports", () => {
  const src = readFileSync(kit, "utf8");
  const key = /export const SOUND_KEY = '([^']+)';/.exec(src)?.[1];
  assert.ok(key, "lib/sound exports SOUND_KEY");
  const toggle = readFileSync(resolve(site, "src", "pages", "Intro", "SoundToggle.tsx"), "utf8");
  assert.ok(toggle.includes(`const KEY = "${key}";`), "SoundToggle reads the same key");
  const dts = readFileSync(resolve(site, "src", "pages", "Intro", "world-sound.d.ts"), "utf8");
  const declared = [...dts.matchAll(/export (?:const|function) (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(declared.sort(), ["SOUND_KEY", "onSoundChange", "setSound", "soundOn"]);
  for (const name of declared) assert.match(src, new RegExp(`export (?:const|function) ${name}\\b`), `lib/sound exports ${name}`);
});
