import { Component, createRef, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { readAsk, writeAsk } from "./logic";
import { NessMark } from "./NessMark";
import "./launcher.css";

// Ask Ness on every page: the masthead's Ness button (NessButton, as
// wattness.tech's masthead has it; the bottom right corner is the sections
// menu's, src/outline), and the panel (NessPanel.tsx, its answers and styles)
// fetched on the first open or as the pointer reaches the button. The panel
// lives in the address: ?ask= opens the questions and ?ask=<id> one answer,
// so an answer can be linked and Back and Forward step through what the
// visitor opened. Each step the panel adds
// carries { ness: n }, n steps above the page it opened over, so the close
// goes back to that page instead of piling up history.
//
// Beside the page or floating, the panel stays open as the reader follows a
// link (a tab, or a source in an answer): the new page comes in under it and
// the panel's answer is added over that page as one step, so the close leaves
// the reader on the new page. Full screen and the phone's sheet hold the page,
// so a link followed from them closes the panel, as before.

const loadPanel = () => import("./NessPanel");

let warmed = false;
export function warm() {
  if (warmed) return;
  warmed = true;
  loadPanel().catch(() => {
    warmed = false;
  });
}

/** The panel's steps above the page, from the history entry's state. */
function depthOf(state: unknown): number {
  const n = (state as { ness?: unknown } | null)?.ness;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
}

// A link to an answer lands with nothing under it. Once per load, the page
// without the panel goes beneath it, so Back and the close both return to the
// page the answer was opened over.
let landed = false;

/** The masthead's Ness button: where focus goes back to once the panel closes. */
const nessButton = createRef<HTMLButtonElement>();

/** Opening and closing the panel, both by the address: ?ask= opens it, one step above the page per answer opened. */
function useNessSteps() {
  const location = useLocation();
  const navigate = useNavigate();
  const depth = depthOf(location.state);
  const go = useCallback(
    (id: string | null) => {
      navigate(
        { pathname: location.pathname, search: writeAsk(location.search, { open: true, id }), hash: location.hash },
        { state: { ness: depth + 1 } },
      );
    },
    [navigate, location.pathname, location.search, location.hash, depth],
  );
  const close = useCallback(() => {
    if (depth > 0) navigate(-depth);
    else navigate({ pathname: location.pathname, search: writeAsk(location.search, { open: false }), hash: location.hash }, { replace: true });
  }, [navigate, location.pathname, location.search, location.hash, depth]);
  return { location, navigate, depth, go, close };
}

/** Ness in the masthead: its orb and its name (the orb alone on a narrow phone), opening Ask Ness and closing it. */
export function NessButton() {
  const { location, go, close } = useNessSteps();
  const open = readAsk(location.search).open;
  return (
    <button
      ref={nessButton}
      type="button"
      className={`ness-btn${open ? " on" : ""}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="Ask Ness"
      onClick={() => (open ? close() : go(null))}
      onPointerEnter={warm}
      onFocus={warm}
      title={open ? "Close Ask Ness" : "Ask Ness: prepared answers from the record, or ask your own"}
    >
      <NessMark size={18} />
      <span className="ness-btn__label">Ness</span>
    </button>
  );
}

/** If the panel's code cannot load (offline), the page goes on without it, and the next open tries again. */
class Quiet extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFail();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function AskNess() {
  const { location, navigate, depth, go, close } = useNessSteps();
  const navType = useNavigationType();
  const ask = readAsk(location.search);
  // A link followed while the panel is beside the page or floating: for the render that brings the new page in, the
  // panel holds its answer (so its stage keeps drawing), and the step that reopens it over the new page follows.
  const prev = useRef({ key: location.key, open: ask.open, id: ask.open ? ask.id : null });
  const held = useRef<{ key: string; id: string | null } | null>(null);
  if (prev.current.key !== location.key) {
    const frame = document.documentElement.dataset.nessOpen;
    held.current =
      !ask.open && prev.current.open && navType === "PUSH" && (frame === "beside" || frame === "float") ? { key: location.key, id: prev.current.id } : null;
    prev.current = { key: location.key, open: ask.open, id: ask.open ? ask.id : null };
  }
  const carried = held.current?.key === location.key ? held.current : null;
  const open = ask.open || carried !== null;
  const shownId = ask.open ? ask.id : (carried?.id ?? null);
  const [mounted, setMounted] = useState(ask.open);
  const [NessPanel, setNessPanel] = useState(() => lazy(loadPanel));
  // Where focus goes once the panel closes: back to the masthead's button, or into the page a link opened.
  const after = useRef<"button" | "page">("button");
  const wasOpen = useRef(ask.open);

  useEffect(() => {
    if (ask.open) setMounted(true);
  }, [ask.open]);

  useEffect(() => {
    if (landed) return;
    landed = true;
    if (!ask.open || depth > 0) return;
    const { pathname, search, hash } = location;
    try {
      window.history.replaceState(window.history.state, "", `${pathname}${writeAsk(search, { open: false })}${hash}`);
    } catch {
      return;
    }
    navigate({ pathname, search, hash }, { replace: false, state: { ness: 1 } });
    // Once, on the first render only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!carried) return;
    navigate(
      { pathname: location.pathname, search: writeAsk(location.search, { open: true, id: carried.id }), hash: location.hash },
      { state: { ness: 1 } },
    );
    // Once for the page the link brought in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    if (wasOpen.current && !open) {
      if (after.current === "page") document.getElementById("main")?.focus({ preventScroll: true });
      else nessButton.current?.focus({ preventScroll: true });
      after.current = "button";
    }
    wasOpen.current = open;
  }, [open]);

  const onFail = useCallback(() => {
    warmed = false;
    setMounted(false);
    setNessPanel(() => lazy(loadPanel));
    close();
  }, [close]);

  return (
    <>
      {mounted && (
        <Quiet onFail={onFail}>
          <Suspense fallback={null}>
            <NessPanel
              open={open}
              id={open ? shownId : null}
              onShow={(id) => go(id)}
              onList={() => go(null)}
              onClose={close}
              onLeave={() => {
                after.current = "page";
              }}
            />
          </Suspense>
        </Quiet>
      )}
    </>
  );
}
