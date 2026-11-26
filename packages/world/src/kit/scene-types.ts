// THE LANDING INTRO'S SCENE CONTRACT. The intro (IntroScroller) is one scroll timeline over seven chapters;
// each 3D or map scene implements IntroScene and is driven by a local time t in [0, 1] that the scroller
// derives from the page's scroll (holds at rests, a spring on top). Scenes draw into their own canvas inside
// the host element; the scroller owns the page chrome (copy column, rail, labels, minimap, skip) and the
// cross-fades between scenes. Laptop first: the intro mounts only at 900 px wide and up.

export type IntroTheme = 'dark' | 'light';

/** Where a scene draws, and what it is told about the page. */
export interface IntroSceneHost {
  /** An absolutely positioned element filling the stage; the scene appends its own canvas(es). */
  el: HTMLElement;
  theme: IntroTheme;
  /** CSS px. */
  width: number;
  height: number;
  /** The left share of the stage kept clear for the copy column (0.34 on laptops). */
  copyShare: number;
}

/** A point the page should label, in CSS px from the stage's top-left, already projected. */
export interface IntroLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  /** Lower draws first when space is short. */
  priority?: number;
  /** Optional second line under the text (a small key, a ramp). */
  node?: HTMLElement;
  /** The dot sits this far beside (x, y) on the plate's side, so it marks a thing without covering it. */
  gap?: number;
}

/** A resting point inside the scene's own timeline. */
export interface IntroRest {
  id: string;
  /** Local time, 0..1. */
  t: number;
}

export interface IntroScene {
  /** Stable id: 'site' (chapters 1-3), 'region' (4-5), 'map' (6-7). */
  readonly id: string;
  /** Its rests in order, in local time. */
  readonly rests: readonly IntroRest[];
  /** Build geometry, load data, create the canvas. Resolves when the first frame can be drawn. */
  mount(host: IntroSceneHost): Promise<void>;
  /** Set the local time (0..1). dt is the frame's seconds, for motion that runs on its own (fans, pulses). */
  setTime(t: number, dt: number): void;
  /** Draw one frame. The scroller calls it on every animation frame while the scene is visible. */
  render(): void;
  /** Labels for the current frame. */
  labels(): IntroLabel[];
  resize(width: number, height: number): void;
  setTheme(theme: IntroTheme): void;
  /** Opacity 0..1 for cross-fades; at 0 the scene must stop drawing. */
  setOpacity(opacity: number): void;
  dispose(): void;
}
