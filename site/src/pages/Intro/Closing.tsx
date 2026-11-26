import { Component, Suspense, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { REPO_URL } from "../../config";
import { GRID_CLOSE, StartingGrid } from "../../scenes";
import { Glyph } from "../../ui";

// The Intro's closing band: the starting grid's close, its sealed plans
// leaving the grid for the Wattness mark while the root's ring becomes BNB
// Chain's, then holding on the lockup with the ways on beneath. It moves the
// way wattness.ai's footer wordmark does (components/footer/WordmarkReveal.tsx):
// arriving on screen starts it and it then takes its own time, never scrubbed
// by the scroll; at the foot of the page, being on screen at all counts as
// arrived; scrolled well back above it, it rewinds to play again. Its code
// (three.js included) loads only as the band nears the screen, it stops
// drawing off screen and once it holds, and with reduced motion it shows the
// lockup at once.

/** The band starts on the sealed grid, a beat before the plans leave it. */
const FROM = GRID_CLOSE - 0.8;
/** Arrived: the band's middle is this far up from the bottom of the frame. */
const ENTER_PX = 80;
/** Scrolled this far below the frame again, the band rewinds. */
const LEAVE_PX = 80;

/**
 * True from when the element comes within half a screen of the frame (it never
 * goes back), and not before `armed`: the page arms it once its first picture
 * is in, so the band's code never competes with the first paint.
 */
function useNear(ref: RefObject<HTMLElement>, armed: boolean): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near || !armed) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setNear(true);
        io.disconnect();
      }
    }, { rootMargin: "50% 0px 50% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near, armed]);
  return near;
}

/**
 * True once the band has arrived, read on scroll and resize (an
 * IntersectionObserver's first callback can come late on a heavy page, and the
 * trigger must not); false again once it is scrolled well below the frame.
 */
function useArrived(ref: RefObject<HTMLElement>): boolean {
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    let raf = 0;
    let state = false;
    const check = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // The band sits at the foot of the page: once the page has no more
      // scroll, being on screen at all is as arrived as it can get.
      const spent = window.scrollY + vh >= document.documentElement.scrollHeight - 4;
      if (!state) {
        if (r.top + r.height / 2 <= vh - ENTER_PX || (spent && r.top < vh)) {
          state = true;
          setArrived(true);
        }
      } else if (r.top > vh + LEAVE_PX) {
        state = false;
        setArrived(false);
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    kick();
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick, { passive: true });
    return () => {
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
  return arrived;
}

/** A scene that fails to load takes only its own box; the links under it stay. */
class Contain extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface ClosingProps {
  /** The page's first picture is in: the band may load its code as it nears the screen. */
  armed: boolean;
  /** The introduction is open over the page: the scene hides in its box and stops drawing until it closes. */
  paused?: boolean;
  /** One line on what the band replays: the sealed morning's times. */
  caption?: ReactNode;
  /** Opens the introduction; absent in a build that cannot play it. */
  onPlay?: (from: HTMLElement) => void;
  onPlayIntent?: () => void;
}

export function Closing({ armed, paused = false, caption, onPlay, onPlayIntent }: ClosingProps) {
  const stage = useRef<HTMLDivElement>(null);
  const near = useNear(stage, armed);
  const arrived = useArrived(stage);
  return (
    <section className="intro-close" data-atmosphere="dark" aria-label="Wattness and BNB Chain">
      <div ref={stage} className="intro-close__stage" data-paused={paused || undefined}>
        {near && (
          <Contain>
            <Suspense fallback={null}>
              <StartingGrid name="intro-close" hud={false} playback="once" from={FROM} hold={!arrived} />
            </Suspense>
          </Contain>
        )}
      </div>
      <div className="intro-close__foot">
        <nav className="intro-close__links" aria-label="Where to go next">
          {onPlay && (
            <button type="button" className="btn btn--primary intro-close__play" aria-haspopup="dialog" onClick={(e) => onPlay(e.currentTarget)} onPointerEnter={onPlayIntent} onFocus={onPlayIntent}>
              Play the introduction
              <Glyph name="expand" />
            </button>
          )}
          <Link to="/verify" className="btn">
            Verify a plan
          </Link>
          <Link to="/overview" className="intro-close__link">
            Enter the Terminal
            <Glyph name="next" />
          </Link>
          <Link to="/about" className="intro-close__link">
            How It Works
            <Glyph name="next" />
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="intro-close__link">
            Source code
            <Glyph name="popout" />
          </a>
        </nav>
        {caption && <p className="intro-close__caption">{caption}</p>}
      </div>
    </section>
  );
}
