import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { readAsk, writeAsk } from "./logic";
import { NessMark } from "./NessMark";
import "./launcher.css";

// Ask Ness on every page: a launcher at the bottom right, and the panel
// (NessPanel.tsx, its answers and styles) fetched on the first open or as the
// pointer reaches the button. The panel lives in the address: ?ask= opens the
// questions and ?ask=<id> one answer, so an answer can be linked and Back and
// Forward step through what the visitor opened. Each step the panel adds
// carries { ness: n }, n steps above the page it opened over, so the close
// goes back to that page instead of piling up history.

const loadPanel = () => import("./NessPanel");

let warmed = false;
function warm() {
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
  const location = useLocation();
  const navigate = useNavigate();
  const ask = readAsk(location.search);
  const depth = depthOf(location.state);
  const [mounted, setMounted] = useState(ask.open);
  const [NessPanel, setNessPanel] = useState(() => lazy(loadPanel));
  const button = useRef<HTMLButtonElement>(null);
  // Where focus goes once the panel closes: back to the launcher, or into the page a link opened.
  const after = useRef<"launcher" | "page">("launcher");
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

  useEffect(() => {
    if (wasOpen.current && !ask.open) {
      if (after.current === "page") document.getElementById("main")?.focus({ preventScroll: true });
      else button.current?.focus({ preventScroll: true });
      after.current = "launcher";
    }
    wasOpen.current = ask.open;
  }, [ask.open]);

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

  const onFail = useCallback(() => {
    warmed = false;
    setMounted(false);
    setNessPanel(() => lazy(loadPanel));
    close();
  }, [close]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="ness-launch"
        aria-haspopup="dialog"
        aria-expanded={ask.open}
        onClick={() => go(null)}
        onPointerEnter={warm}
        onFocus={warm}
        title="Ask Ness: prepared answers from the record"
      >
        <NessMark size={22} />
        <span className="ness-launch__label">Ask Ness</span>
      </button>
      {mounted && (
        <Quiet onFail={onFail}>
          <Suspense fallback={null}>
            <NessPanel
              open={ask.open}
              id={ask.open ? ask.id : null}
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
