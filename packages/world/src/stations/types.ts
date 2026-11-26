// The station contract: what the frame lab gives a frame and what the frame gives back (README.md beside this file).
import type { Plates } from '../lib/plates';
import type { Theme, WorldStage } from '../lib/stage';

export type { Plates, Theme, WorldStage };

/** src/data/frame-data.json (schema grand-prix.frame-data.v1; its own `notes` and `units` fields describe it). */
export interface FrameData {
  readonly schema: string;
  readonly [field: string]: any;
}

export interface FrameContext {
  /** The frame's id, as asked for (lab.html?frame=). */
  readonly id: string;
  /** The station directory the frame came from. */
  readonly station: string;
  /** The stage: renderer, scene, camera, lights, composer and their setters (lib/stage.ts, over kit/stage.ts). */
  readonly stage: WorldStage;
  readonly theme: Theme;
  /** The frame's size in CSS px, and drawing-buffer pixels per CSS px. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  /** src/data/frame-data.json, or null when it has not been synced (scripts/sync-data.sh). */
  readonly data: FrameData | null;
  /** src/data/layout.json, the storyboard's layout of the world, or null. */
  readonly layout: unknown;
  /** Words over the canvas: leader plates, ticks, the key card, the caption, the scope line. */
  readonly plates: Plates;
  /** An element over the canvas, under the plates, for a frame's own DOM (a screen's live UI). */
  readonly overlay: HTMLElement;
  /** The frame data, or an error that says how to sync it. */
  needData(): FrameData;
  /** Hold the shot until p settles: an image, a texture, a font a canvas texture draws with. */
  wait(p: Promise<unknown>): void;
}

export interface FrameHandle {
  /** The moment the shot is taken, in seconds on the frame's own clock. Default 0. */
  readonly time?: number;
  /** Fixed 1/60 s steps run up to the shot, so anything that only advances with dt has arrived. Default 30. */
  readonly steps?: number;
  /** Frames drawn at the shot's pose before it is taken. Default 3. */
  readonly settle?: number;
  /** The plates' skin: 'walk', the Hedging walkthrough's 1920 cut (16 px plates, 40/26 px caption; the default), or
   *  'intro', the landing intro's (12.5 px plates). */
  readonly skin?: 'walk' | 'intro';
  /** The frame moves at its rest (the stack's comets along its strands, as the Tech Stack tab runs them): the story
   *  runs the frame's clock on from `time` while it rests there, the site's on the wall clock, a film's through the
   *  hold. With reduced motion the site's rest stays a still. Default false: the rest is one picture. */
  readonly live?: boolean;
  /** For the storyboard, in plain words: what the frame shows, which figures are real and from which file, and what
   *  is illustrative or has not run yet. */
  readonly note: string;
  /** Pose everything at time t, as a pure function of t. dt is the step: 1/60 s while stepping, 0 for the shot. */
  update?(t: number, dt: number): void;
  /** After the shot's pose is drawn: lay out plates, ticks, the key and the caption against the posed camera. */
  decorate?(): void | Promise<void>;
  dispose?(): void;
}

export type FrameSetup = (ctx: FrameContext) => Promise<FrameHandle>;

/** A station module, src/stations/<dir>/index.ts. Frame ids are "<dir>.<name>". */
export interface StationModule {
  readonly frames: Readonly<Record<string, FrameSetup>>;
}
