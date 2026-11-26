import { useEffect, useRef, useState, type ReactNode } from "react";
import { isCapture } from "../../lib/capture";
import { externalClock, registerScene } from "../clock";
import { Stage, type Quality } from "./stage";
import "../scenes.css";

export interface SceneModel {
  /** Seconds of choreography; after it the scene holds its last state. */
  duration: number;
  /** The frame shown when motion is reduced, or in a capture with no clock. */
  still: number;
  update(t: number): void;
  dispose(): void;
}

export interface SceneProps {
  /** Scene time in seconds. When set, the scene draws exactly this frame and never runs its own clock. */
  clock?: number;
  quality?: Quality;
  /** "once" plays the choreography and holds (the loop stops on the last frame); "loop" restarts after a short rest. */
  playback?: "once" | "loop";
  /** Scene time the page's own playback starts from, in seconds: a scene trimmed to its close. Default 0. */
  from?: number;
  /**
   * While true the scene draws `from` and waits; once false its clock runs from
   * `from`, in its own time. True again puts it back on `from`, to play again
   * (the Intro's closing band: the scroll triggers it, it never scrubs it).
   */
  hold?: boolean;
  /** Device pixels per CSS pixel, overriding the quality's. */
  pixelRatio?: number;
  /** Corner annotations (phase, legend, source line). */
  hud?: boolean;
  className?: string;
  /** Registry name under window.__gpScenes; defaults to the scene's own. */
  name?: string;
  onReady?: (duration: number) => void;
}

interface HostProps<D> extends SceneProps {
  defaultName: string;
  label: string;
  load: () => Promise<D>;
  create: (stage: Stage, data: D, opts: { hud: boolean }) => SceneModel | Promise<SceneModel>;
  /** Shown when WebGL is unavailable. */
  fallback: (data: D | null) => ReactNode;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function SceneHost<D>(props: HostProps<D>) {
  const { clock, quality = "high", pixelRatio, hud = true, className, label, hold = false } = props;
  const box = useRef<HTMLDivElement>(null);
  const draw = useRef<((t: number) => void) | null>(null);
  const resume = useRef<(() => void) | null>(null);
  const rewind = useRef<(() => void) | null>(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const [failed, setFailed] = useState<{ data: D | null } | null>(null);
  // The latest props for the long-lived effect, without restarting it.
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let stage: Stage;
    try {
      stage = new Stage(el, { quality, pixelRatio, preserve: isCapture() || clockRef.current !== undefined });
    } catch {
      live.current.load().then(
        (data) => setFailed({ data }),
        () => setFailed({ data: null }),
      );
      return;
    }

    let model: SceneModel | null = null;
    let disposed = false;
    let raf = 0;
    let visible = true;
    let start: number | null = null;
    let elapsedAtPause = 0;
    let markReady: () => void = () => {};
    const ready = new Promise<void>((r) => (markReady = r));

    let lastT = 0;
    const frame = (t: number) => {
      if (!model) return;
      lastT = t;
      model.update(t);
      stage.draw();
    };

    const still = () => reducedMotion() || isCapture();

    const tick = (ts: number) => {
      raf = 0;
      if (disposed || !model) return;
      const ext = externalClock();
      if (clockRef.current !== undefined) {
        frame(clockRef.current);
        return;
      }
      if (ext !== undefined) {
        frame(ext);
      } else if (still()) {
        frame(model.still);
        return;
      } else {
        const from = live.current.from ?? 0;
        if (live.current.hold) {
          // Waiting on the first frame: drawn once, no loop until the hold lifts.
          start = null;
          elapsedAtPause = 0;
          frame(from);
          return;
        }
        if (start === null) start = ts - elapsedAtPause * 1000;
        let t = from + (ts - start) / 1000;
        if (live.current.playback === "loop") t = from + ((t - from) % (model.duration - from + 3));
        frame(t);
        // Played once to its end: the last frame holds, with nothing more to draw until a resize.
        if (live.current.playback !== "loop" && t >= model.duration) return;
      }
      if (visible) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver((entries) => {
      const v = entries.some((e) => e.isIntersecting);
      if (v === visible) return;
      visible = v;
      if (!v && start !== null) {
        elapsedAtPause = (performance.now() - start) / 1000;
        start = null;
      }
      if (v) kick();
    });
    io.observe(el);
    resume.current = kick;
    // Back on the first frame, to play again from it when the hold lifts.
    rewind.current = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      start = null;
      elapsedAtPause = 0;
      kick();
    };
    stage.onResize = () => {
      if (!raf) frame(clockRef.current ?? lastT);
    };
    draw.current = frame;

    const name = live.current.name ?? live.current.defaultName;
    const unregister = registerScene({
      name,
      get duration() {
        return model?.duration ?? 0;
      },
      ready,
      render: (t: number) => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        frame(t);
      },
      size: () => ({ width: stage.renderer.domElement.width, height: stage.renderer.domElement.height }),
    });

    (async () => {
      try {
        const data = await live.current.load();
        await document.fonts?.ready;
        if (disposed) return;
        model = await live.current.create(stage, data, { hud: live.current.hud ?? true });
        if (disposed) {
          model.dispose();
          return;
        }
        el.dataset.ready = "1";
        markReady();
        live.current.onReady?.(model.duration);
        if (clockRef.current !== undefined) frame(clockRef.current);
        else kick();
      } catch (e) {
        console.error(e);
        setFailed({ data: null });
      }
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      unregister();
      draw.current = null;
      resume.current = null;
      rewind.current = null;
      model?.dispose();
      stage.dispose();
      delete el.dataset.ready;
    };
  }, [quality, pixelRatio, hud]);

  // A controlled clock draws on every change, outside the loop.
  useEffect(() => {
    if (clock !== undefined) draw.current?.(clock);
    else resume.current?.();
  }, [clock]);

  // The hold: lifting it starts the clock from `from`; setting it again rewinds to `from`.
  useEffect(() => {
    if (clock === undefined) rewind.current?.();
  }, [hold]);

  return (
    <div ref={box} className={`scene${className ? ` ${className}` : ""}`} role="img" aria-label={label}>
      {failed && <div className="scene__fallback">{props.fallback(failed.data)}</div>}
    </div>
  );
}
