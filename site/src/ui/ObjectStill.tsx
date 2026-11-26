import type { ReactNode } from "react";
import "./object-still.css";

// A rendered still of an object the 3D world already models (the agents' instruments, the seal, the proof tower...),
// in a dark glass frame inside the page. The 3D renders dark in either theme, so the frame does too. The stills are
// files, never live WebGL: public/renders/<name>-640.webp and -1280.webp, each pair with its receipt
// (public/renders/<name>.json: the frame, the code, the command and every file's SHA-256), which
// test/renders.test.mjs holds byte for byte.

const still = (name: string, w: number) => `${import.meta.env.BASE_URL}renders/${name}-${w}.webp`;

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
  className?: string;
}

export function ObjectStill({ name, alt, sizes = "(max-width: 767px) 100vw, 640px", eager = false, caption, className }: ObjectStillProps) {
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
      {caption && <figcaption className="object-still__caption">{caption}</figcaption>}
    </figure>
  );
}
