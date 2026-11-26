// The world's opt-in sound, declared at the site's boundary like the world's mounts (src/world.d.ts): the site never
// compiles packages/world's sources. Written by hand from packages/world/src/lib/sound.ts, so the two change together
// (test/sound.test.mjs holds these names to the module's exports). The cues themselves are called inside the package
// (ONE PLAN's deck and coins, the story's seal).

declare module "@world/lib/sound" {
  /** The browser storage key of the visitor's choice: "on" or "off" (nothing stored is off). */
  export const SOUND_KEY: string;
  /** Whether sound is on. */
  export function soundOn(): boolean;
  /** Turns sound on or off and remembers it. Call it from the click that asks: turning it on starts the audio there. */
  export function setSound(on: boolean): void;
  /** Calls fn whenever the choice changes; returns its unsubscribe. */
  export function onSoundChange(fn: () => void): () => void;
}
