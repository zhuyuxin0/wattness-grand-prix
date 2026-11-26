import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { StackHandle } from "@world/stations/stack/mount";
import { isCapture } from "../../lib/capture";
import { worldPath } from "../../shell/world";
import "./stack-space.css";

// The stack in 3D, one mount for every page that shows it: the Tech Stack's stage (Stage.tsx) and the Overview's home
// stage (Overview/ControlRoom.tsx). mountStack (packages/world/src/stations/stack) fills the element and follows its
// size. A piece's click, a second tap or its card's button opens the tab that shows it, through the site's map of the
// package's tab ids (shell/world.ts). The 3D holds its own dark in either page theme, without its key card (each page
// draws the key in its own place, or none). It comes by dynamic import once the component mounts, so a page that shows
// it loads no three.js on its first paint, and it is disposed when the component goes, which releases its WebGL
// context.

export interface StackSpaceProps {
  className?: string;
  /** The space is built and drawing: its first frame is on screen at the next animation frame. */
  onReady?: () => void;
  /** It cannot start here (no WebGL, a chunk that would not load). */
  onFail?: (error: unknown) => void;
}

export function StackSpace({ className, onReady, onFail }: StackSpaceProps) {
  const el = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const go = useRef(navigate);
  go.current = navigate;
  const calls = useRef({ onReady, onFail });
  calls.current = { onReady, onFail };

  useEffect(() => {
    let gone = false;
    let handle: StackHandle | null = null;
    const fail = (error: unknown) => {
      if (gone) return;
      console.warn("The stack could not start:", error);
      calls.current.onFail?.(error);
    };
    import("@world/stations/stack/mount")
      .then(({ mountStack }) => {
        if (gone || !el.current) return;
        handle = mountStack(el.current, {
          theme: "dark",
          key: false,
          onRoute: (id) => {
            const to = worldPath(id);
            if (to) go.current(to);
          },
          // A recording holds the moving marks still; otherwise the visitor's reduced-motion setting decides.
          still: isCapture() ? true : undefined,
        });
        handle.ready.then(() => {
          if (!gone) calls.current.onReady?.();
        }, fail);
      })
      .catch(fail);
    return () => {
      gone = true;
      handle?.dispose();
    };
  }, []);

  return <div ref={el} className={`stack-space${className ? ` ${className}` : ""}`} />;
}
