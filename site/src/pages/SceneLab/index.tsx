import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BRAIN_DURATION, BrainMap, GRID_DURATION, StartingGrid, type Quality } from "../../scenes";
import "./styles.css";

// The scene lab: both 3D scenes on a fixed-size stage with a time scrubber, for
// review and for scripted capture. Parameters go before the hash:
//   ?scene=grid|brain   which scene
//   &t=12.5             start at this scene time (seconds), paused
//   &w=1920&h=1080      stage size in CSS pixels (default: fit the window at 16:9)
//   &dpr=2              device pixels per CSS pixel on the canvas
//   &quality=high       low | medium | high
//   &hud=0              hide the scenes' corner annotations
//   &chrome=0           hide the lab's own controls (capture)
//   &live=1             let the scene run its own clock, as it does on a page
// A capture script then steps frames with window.__gpScenes[name].render(t).

const SCENES = {
  grid: { label: "Starting grid", name: "starting-grid", duration: GRID_DURATION, Component: StartingGrid },
  brain: { label: "Brain map", name: "brain-map", duration: BRAIN_DURATION, Component: BrainMap },
} as const;
type SceneKey = keyof typeof SCENES;

const FPS = 60;

function params() {
  const q = new URLSearchParams(window.location.search);
  const num = (k: string) => {
    const v = q.get(k);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const scene = (q.get("scene") as SceneKey) in SCENES ? (q.get("scene") as SceneKey) : "grid";
  const quality = (["low", "medium", "high"] as const).find((x) => x === q.get("quality")) ?? "high";
  return {
    scene,
    t: num("t"),
    w: num("w"),
    h: num("h"),
    dpr: num("dpr"),
    quality: quality as Quality,
    hud: q.get("hud") !== "0",
    chrome: q.get("chrome") !== "0",
    live: q.get("live") === "1",
  };
}

function useFit(w?: number, h?: number) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1280, h: 720 });
  useEffect(() => {
    if (w && h) {
      setSize({ w, h });
      return;
    }
    const fit = () => {
      const maxW = Math.max(320, window.innerWidth - 32);
      const maxH = Math.max(200, window.innerHeight - 168);
      const width = Math.min(maxW, (maxH * 16) / 9);
      setSize({ w: Math.round(width), h: Math.round((width * 9) / 16) });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [w, h]);
  return size;
}

export default function SceneLab() {
  const p = useMemo(params, []);
  const [scene, setScene] = useState<SceneKey>(p.scene);
  const [t, setT] = useState(p.t ?? 0);
  const [playing, setPlaying] = useState(p.t === undefined && p.chrome);
  const [loop, setLoop] = useState(true);
  const def = SCENES[scene];
  const size = useFit(p.w, p.h);

  useEffect(() => {
    document.title = `Scene lab · ${def.label}`;
  }, [def.label]);

  // The lab owns the clock while playing, so playback and scrubbing are one code path.
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const step = (ts: number) => {
      const dt = last.current === null ? 0 : (ts - last.current) / 1000;
      last.current = ts;
      setT((prev) => {
        const next = prev + dt;
        if (next <= def.duration) return next;
        if (loop) return 0;
        setPlaying(false);
        return def.duration;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, def.duration]);

  const nudge = useCallback(
    (d: number) => {
      setPlaying(false);
      setT((x) => Math.min(def.duration, Math.max(0, Math.round((x + d) * FPS) / FPS)));
    },
    [def.duration],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, button, select")) {
        if (e.key !== " ") return;
      }
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((x) => !x);
      } else if (e.key === "ArrowRight") nudge(e.shiftKey ? 1 : 1 / FPS);
      else if (e.key === "ArrowLeft") nudge(e.shiftKey ? -1 : -1 / FPS);
      else if (e.key === "Home") nudge(-1e9);
      else if (e.key === "End") nudge(1e9);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge]);

  const pick = (k: SceneKey) => {
    setScene(k);
    setT(0);
    setPlaying(true);
  };

  const Component = def.Component;
  const stageStyle: CSSProperties = { width: size.w, height: size.h };

  return (
    <div className={`scene-lab${p.chrome ? "" : " scene-lab--bare"}`}>
      {p.chrome && (
        <header className="scene-lab__bar">
          <div className="scene-lab__brand">
            <span className="scene-lab__mark" aria-hidden="true" />
            Scene lab
          </div>
          <div className="seg" role="group" aria-label="Scene">
            {(Object.keys(SCENES) as SceneKey[]).map((k) => (
              <button key={k} type="button" aria-pressed={scene === k} onClick={() => pick(k)}>
                {SCENES[k].label}
              </button>
            ))}
          </div>
          <div className="scene-lab__size">
            {size.w} × {size.h}
            {p.dpr ? ` @${p.dpr}x` : ""}
          </div>
        </header>
      )}
      <div className="scene-lab__stage" style={stageStyle}>
        <Suspense fallback={null}>
          <Component
            key={scene}
            clock={p.live ? undefined : t}
            playback="loop"
            quality={p.quality}
            pixelRatio={p.dpr}
            hud={p.hud}
            name={def.name}
          />
        </Suspense>
      </div>
      {p.chrome && !p.live && (
        <div className="scene-lab__controls" style={{ width: size.w }}>
          <button type="button" className="scene-lab__play" onClick={() => setPlaying((x) => !x)} aria-label={playing ? "Pause" : "Play"}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              {playing ? <path d="M5 3.5v9M11 3.5v9" stroke="currentColor" strokeWidth="2" /> : <path d="M5 3.2v9.6L12.6 8Z" fill="currentColor" />}
            </svg>
          </button>
          <input
            className="scene-lab__scrub"
            type="range"
            min={0}
            max={def.duration}
            step={1 / FPS}
            value={t}
            aria-label="Scene time"
            onChange={(e) => {
              setPlaying(false);
              setT(Number(e.target.value));
            }}
          />
          <div className="scene-lab__time">
            <span>{t.toFixed(2)}</span>
            <small> / {def.duration.toFixed(2)} s</small>
            <small className="scene-lab__frame">frame {Math.round(t * FPS)}</small>
          </div>
          <label className="scene-lab__loop">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            Loop
          </label>
        </div>
      )}
    </div>
  );
}
