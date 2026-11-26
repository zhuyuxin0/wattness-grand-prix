// Optional members a scene may add to IntroScene (scene-types.ts is unchanged). The scroller looks for each one
// and does without it when a scene has none.
import type { IntroScene } from './scene-types';
/** The landing intro's copy counts (its copy.ts); the world has no copy table. */
type CopyFacts = unknown;

export interface Rect { x: number; y: number; w: number; h: number }

/** A camera described the same way in every scene, round the featured battery's pad (its centre: the kit's
 *  origin): where the pad's centre is on the stage and how many metres one CSS px spans there, seen from a compass
 *  azimuth (target to camera) and a down-angle. The scenes hand the camera on through it at a hand-off. */
export interface EntryView {
  az: number;
  el: number;
  /** Stage CSS px of the pad's centre. */
  x: number;
  y: number;
  /** Real metres per CSS px at the pad's centre, across the view. */
  mpp: number;
  /** Vertical field of view in degrees; 0 for an orthographic view. */
  vfov: number;
}

export interface IntroSceneExtras {
  /** Rects (stage CSS px) the label plates should keep off this frame: the scene's own ticks, keys, its subject. */
  avoid?(): Rect[];
  /** A scene's own window for its label plates inside a move, 0..1: the engine shows plates only near a stop (they
   *  would swim through a move), and a scene that holds a picture mid-move and wants a plate on it (the Hedging
   *  walkthrough's slide, beat 6: the day timed to its own hours) returns that plate's opacity for the frame, 0 at
   *  every rest and everywhere else. The engine takes the larger of the two and lays out labels() as usual, so labels()
   *  returns that frame's plates while the window is open. */
  labelHold?(): number;
  /** The pointer over the stage (stage CSS px), or null when it leaves. Returns the name to show beside the
   *  pointer, or null. The overlay scrolls above the stage, so the scroller forwards the pointer. */
  hover?(p: { x: number; y: number } | null): string | null;
  /** A click on the stage (forwarded like hover). True when the scene used it. */
  click?(p: { x: number; y: number }): boolean;
  /** Counts for the copy that depend on what this scene draws (copy.ts CopyFacts). */
  copyFacts?(): CopyFacts;
  /** The incoming side of a hand-off: this scene's camera at its local time t, round the pad. */
  entryView?(t: number): EntryView | null;
  /** The outgoing side: on the way out of its last rest, follow `view(e)` (e: the eased fraction of the move, 0 at
   *  the last rest) from `win.from`, where the cross-fade starts, and travel to it before then. */
  lockTo?(view: ((e: number) => EntryView | null) | null, win: { from: number; at: number; to: number }): void;
  /** Parallax (Battalion's): the pointer over the stage, smoothed by the engine, x and y in -1..1 from the stage's
   *  centre (right and down positive; 0, 0 when the pointer leaves). Called every frame the scene draws. A
   *  three.js scene offsets its camera a little (about 1 to 1.5 degrees of orbit and a touch of pan), on top of
   *  its own pose; the map's deck camera stays locked. */
  parallax?(x: number, y: number): void;
  /** True while the timeline moves between rests, false while it holds at a rest (and once at mount): a scene
   *  may drop costly passes (ambient occlusion, shadow-map refresh) while moving and restore them at rest. */
  setMoving?(moving: boolean): void;
  /** The loading gate (gate.tsx): how far the scene's load has come, 0..1, and 1 once its first view can be drawn
   *  whole (its data in, its programs linked, that view's imagery in). Without it, a scene counts as loaded once
   *  mounted. */
  progress?(): number;
  /** Whether the scene can draw its picture yet (its programs linked, a first frame made), imagery aside: until then
   *  the scene before it stays on screen and its chapter's label plates wait (engine.ts). Without it, a scene can draw
   *  once mounted. */
  drawable?(): boolean;
}

export type IntroSceneWithExtras = IntroScene & IntroSceneExtras;
