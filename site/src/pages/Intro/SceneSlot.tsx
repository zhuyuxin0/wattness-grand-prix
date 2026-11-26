import { Component, Suspense, lazy, useEffect, useState, type ComponentType, type ReactNode, type Ref } from "react";
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

/** A scene that fails to load takes its own box with it; the bar under it stays. */
class Contain extends Component<{ children: ReactNode; onFail?: () => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFail?.();
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

interface SlotProps {
  caption?: ReactNode;
  /** The story is open over the page: the scene is hidden in its box and stops drawing until the story closes. */
  paused?: boolean;
  /** Opens the story; without it the bar offers no story (a build that cannot play it). */
  onPlay?: () => void;
  /** Warms what the story shows first, as the pointer or focus reaches the button. */
  onPlayIntent?: () => void;
  playRef?: Ref<HTMLButtonElement>;
}

/**
 * The stage: the scene, played once to its last frame and held there, over a
 * slim bar that says what it shows, replays it (wattness.tech's "Replay the
 * Intro") and opens the story.
 */
export function SceneSlot({ caption, paused = false, onPlay, onPlayIntent, playRef }: SlotProps) {
  const wide = useWide();
  const [take, setTake] = useState(0);
  const [failed, setFailed] = useState(false);
  return (
    <>
      {Scene && (
        <Contain onFail={() => setFailed(true)}>
          {/* Hidden while the story is open: the scene's loop stops when it leaves view, and resumes where it was. */}
          <div className="intro-scene" role="region" aria-label="The starting grid: every sealed plan for the operating day" data-paused={paused || undefined}>
            <Suspense fallback={<div className="intro-scene__hold" />}>
              <Scene key={take} hud={wide} playback="once" />
            </Suspense>
          </div>
        </Contain>
      )}
      <div className="intro-stagebar">
        {caption && <p className="intro-stagebar__caption">{caption}</p>}
        <div className="intro-stagebar__actions">
          {Scene && !failed && (
            <button type="button" className="btn intro-stagebar__replay" onClick={() => setTake((t) => t + 1)}>
              <Glyph name="refresh" />
              Replay
            </button>
          )}
          {onPlay && (
            <>
              <span className="intro-stagebar__length" id="intro-story-length">
                3 min, from one battery to the whole stack
              </span>
              <button
                ref={playRef}
                type="button"
                className="btn btn--primary intro-stagebar__play"
                aria-haspopup="dialog"
                aria-describedby="intro-story-length"
                onClick={onPlay}
                onPointerEnter={onPlayIntent}
                onFocus={onPlayIntent}
                onTouchStart={onPlayIntent}
              >
                Play the introduction
                <Glyph name="expand" />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
