import { useEffect, useRef, useState, type ReactNode } from "react";
import { isCapture } from "../lib/capture";
import "./object-still.css";

// A rendered still of an object the 3D world already models (the agents' instruments, the seal, the proof tower...),
// in a dark glass frame inside the page. The 3D renders dark in either theme, so the frame does too. The stills are
// files, never live WebGL: public/renders/<name>-640.webp and -1280.webp, each pair with its receipt
// (public/renders/<name>.json: the frame, the code, the command and every file's SHA-256), which
// test/renders.test.mjs holds byte for byte. A still may have a short loop of the same picture, the camera swung round
// the object and back (<name>-loop.mp4, in the same receipt), played over it while the host says it is active (a card
// hovered or focused), only on a pointer that hovers and never with reduced motion or in a capture.

const still = (name: string, w: number) => `${import.meta.env.BASE_URL}renders/${name}-${w}.webp`;
const clip = (name: string) => `${import.meta.env.BASE_URL}renders/${name}-loop.mp4`;

export interface ObjectStillProps {
  /** The still's name in public/renders/ (e.g. "agent-forecaster"). */
  name: string;
  /** What the picture shows, in words. */
  alt: string;
  /** The img's sizes: how wide the frame is drawn at each width. */
  sizes?: string;
  /** The page's first view: fetched at once rather than when it nears the screen. */
  eager?: boolean;
  /** A short line in the frame's corner: whose figures the picture draws, and their day. */
  caption?: ReactNode;
  /** The still has a loop, public/renders/<name>-loop.mp4, played while active. */
  loop?: boolean;
  active?: boolean;
  className?: string;
}

/** Loops play only where a pointer hovers, motion is welcome and the page is not being captured. */
function useLoopsWelcome(): boolean {
  const [ok] = useState(() => {
    try {
      return !isCapture() && window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches;
    } catch {
      return false;
    }
  });
  return ok;
}

export function ObjectStill({ name, alt, sizes = "(max-width: 767px) 100vw, 640px", eager = false, caption, loop = false, active = false, className }: ObjectStillProps) {
  const welcome = useLoopsWelcome();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const plays = loop && welcome;
  useEffect(() => {
    const v = ref.current;
    if (!plays || !v) return;
    if (active) {
      // the clip is fetched the first time its card is hovered, never before
      if (!v.getAttribute("src")) v.setAttribute("src", clip(name));
      v.currentTime = 0;
      v.play().catch(() => setPlaying(false));
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [active, plays, name]);
  return (
    <figure className={`object-still${className ? ` ${className}` : ""}`} data-still={name}>
      <img
        src={still(name, 640)}
        srcSet={`${still(name, 640)} 640w, ${still(name, 1280)} 1280w`}
        sizes={sizes}
        width={640}
        height={360}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
      />
      {plays && (
        <video
          ref={ref}
          className={`object-still__loop${playing && active ? " is-playing" : ""}`}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
        />
      )}
      {caption && <figcaption className="object-still__caption">{caption}</figcaption>}
    </figure>
  );
}
