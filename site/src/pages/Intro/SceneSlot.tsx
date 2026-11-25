import { Component, Suspense, lazy, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Glyph } from "../../ui";

// The starting-grid scene lives in src/scenes/, built on its own lane. It is
// found by glob rather than a static import so this page builds, and renders
// nothing in the slot, whether or not the scene is there. The glob is lazy, so
// three.js stays in the scene's own chunk.
type SceneModule = Record<string, unknown>;

const found = import.meta.glob<SceneModule>([
  "../../scenes/**/StartingGrid.{ts,tsx}",
  "../../scenes/**/StartingGridScene.{ts,tsx}",
  "../../scenes/StartingGrid/index.{ts,tsx}",
  "../../scenes/starting-grid/index.{ts,tsx}",
  "../../scenes/index.{ts,tsx}",
]);

// The most specific file first, so the page never pulls in other scenes.
const loader = Object.entries(found).sort(([a], [b]) => rank(a) - rank(b))[0]?.[1];

function rank(path: string): number {
  if (/StartingGrid(Scene)?\.tsx?$/.test(path)) return 0;
  if (/starting-?grid\/index/i.test(path)) return 1;
  return 2;
}

interface SceneProps {
  hud?: boolean;
  playback?: "once" | "loop";
}

function Nothing() {
  return null;
}

const Scene = loader
  ? lazy(async () => {
      const mod = await loader();
      const candidate = mod.StartingGrid ?? mod.StartingGridScene ?? mod.default;
      return { default: (typeof candidate === "function" || (typeof candidate === "object" && candidate !== null) ? candidate : Nothing) as ComponentType<SceneProps> };
    })
  : null;

/** A scene that fails (no WebGL, a lost context) takes its slot with it. */
class Contain extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const WIDE = "(min-width: 720px)";

// On a phone the scene's corner annotations crowd the grid, and the copy under
// the stage already carries the same facts and source line.
function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window === "undefined" || window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * The stage: the scene, played once to its last frame and held there, over a
 * slim bar that says what it shows and replays it (wattness.tech's "Replay the
 * Intro").
 */
export function SceneSlot({ caption }: { caption?: ReactNode }) {
  const wide = useWide();
  const [take, setTake] = useState(0);
  if (!Scene) return null;
  return (
    <Contain>
      <div className="intro-scene" role="region" aria-label="The starting grid: every sealed plan for the operating day">
        <Suspense fallback={<div className="intro-scene__hold" />}>
          <Scene key={take} hud={wide} playback="once" />
        </Suspense>
      </div>
      <div className="intro-stagebar">
        {caption && <p className="intro-stagebar__caption">{caption}</p>}
        <button type="button" className="btn intro-stagebar__replay" onClick={() => setTake((t) => t + 1)}>
          <Glyph name="refresh" />
          Replay
        </button>
      </div>
    </Contain>
  );
}
