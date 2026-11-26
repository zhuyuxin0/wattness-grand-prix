import "./band.css";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Glyph } from "../ui/Glyph";
import type { Bounds, FloatPanel } from "./model";
import {
  BAND_EDGE,
  BAND_GAP,
  closeIn,
  columnWidth,
  defaultState,
  fitState,
  fromBandLayout,
  isOpen,
  neededHeight,
  nudgeIn,
  parseBand,
  placeOf,
  raiseIn,
  reopenIn,
  restoreBand,
  serializeBand,
  syncSpecs,
  type ArrangeOptions,
  type BandSpec,
  type BandState,
  type Nudge,
} from "./band-model";

// A band of dock panes: a page's own parts as rc-dock float panes inside one region of the page (the Overview's control
// room), with the float layer's look and library. The reader drags a pane by its header and resizes it at its edges
// and corner; its close button hides it, the band's panes menu brings it back, and Reset layout restores the default
// arrangement (band-model.ts). This browser keeps the arrangement under the band's key (try/catch).
//
// This front door holds the band's state and draws its bar and menu; rc-dock and the panes' drawing (band-dock.tsx)
// load by one dynamic import, and until they have, the panes stand in their places as frames with their names. If they
// cannot load, the panes stand there with their contents, fixed. Narrower than `minWidth` (a phone, a narrow window, a
// floating pane) the band draws nothing of its own: the page's own markup for its parts (`stacked`) is shown instead.

export interface BandPane extends BandSpec {
  /** The pane's name in its header and in the panes menu: plain words, in title case. */
  title: string;
  content: ReactNode;
}

export interface BandProps {
  /** Where this browser keeps the arrangement. */
  storageKey: string;
  /** The band's name for assistive tech. */
  label: string;
  panes: readonly BandPane[];
  /** Narrower than this (px, the band's own width), `stacked` is drawn instead of the band. 768 when not given. */
  minWidth?: number;
  /** The page's own markup for the parts, one after another: what a phone shows. */
  stacked: ReactNode;
  /** What stands in the band's top left corner, over its left column (the page's head); the panes menu stands in the
   *  top right corner. Each column of panes starts under its corner. */
  bar?: ReactNode;
  /** Where the default arrangement puts the panes whose side is "bottom" (band-model.ts). */
  foot?: ArrangeOptions["foot"];
  /** The room kept under the panes at the band's foot, in px, for what floats over the page there (band-model.ts). */
  bottom?: number;
  /** The band grows past the height the page gives it, as far as the default arrangement needs to open every pane at
   *  its contents' height. */
  grow?: boolean;
  className?: string;
}

/** What the dock (band-dock.tsx) is given: the band's state, and a call for each thing the reader does to it. */
export interface DockProps {
  panes: readonly BandPane[];
  state: BandState;
  bounds: Bounds;
  onLayout: (floats: readonly FloatPanel[]) => void;
  onClose: (id: string) => void;
  onRaise: (id: string) => void;
  /** A key pressed on a pane's header: an arrow moves it, Shift with an arrow resizes it. */
  onNudge: (id: string, d: Nudge) => void;
  /** The height each open pane's contents ask for, header included, in px: the default arrangement opens them at it. */
  onMeasure: (heights: Readonly<Record<string, number>>) => void;
}

/** An element's width, measured before the first paint and whenever it changes (0 until it is laid out). */
function useWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

type Dock = typeof import("./band-dock");
let loading: Promise<Dock> | null = null;

function loadDock(): Promise<Dock> {
  loading ??= import("./band-dock");
  loading.catch(() => {
    // A chunk that failed to load is asked for again on the next visit to the page.
    loading = null;
  });
  return loading;
}

export function PaneBand(props: BandProps) {
  const host = useRef<HTMLDivElement>(null);
  const width = useWidth(host);
  const docked = width >= (props.minWidth ?? 768);
  // How tall the band needs to be (grow): the host's least height while it is docked.
  const [need, setNeed] = useState(0);
  return (
    <div
      ref={host}
      className={`gp-band-host${docked ? " gp-band-host--docked" : ""}`}
      style={docked && props.grow && need > 0 ? { minHeight: need } : undefined}
    >
      {width > 0 && (docked ? <DockBand {...props} onNeed={setNeed} /> : props.stacked)}
    </div>
  );
}

/** The panes as the arrangement sees them: each at the height its contents ask for, once measured. */
const sizedPanes = (panes: readonly BandPane[], natural: Readonly<Record<string, number>>): BandPane[] =>
  panes.map((p) => (natural[p.id] ? { ...p, h: natural[p.id] } : p));

function readSaved(key: string, specs: readonly BandSpec[], b: Bounds, opts: ArrangeOptions): BandState {
  try {
    const saved = parseBand(localStorage.getItem(key), specs);
    if (saved) return restoreBand(saved, specs, b, opts);
  } catch {
    // Without storage the band opens in its default arrangement.
  }
  return defaultState(specs, b, opts);
}

function writeSaved(key: string, state: BandState, specs: readonly BandSpec[]): void {
  try {
    if (state.custom) localStorage.setItem(key, serializeBand(state, specs));
    else localStorage.removeItem(key);
  } catch {
    // Without storage the arrangement lasts until a reload.
  }
}

/** The panes menu's row in the top right corner: the button's height and the gap under it. */
const MENU_ROW = 28 + 8;

function DockBand({ storageKey, label, panes, bar, foot, bottom, grow, className, onNeed }: BandProps & { onNeed: (px: number) => void }) {
  const area = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [bounds, setBounds] = useState<Bounds>({ w: 0, h: 0 });
  const [state, setState] = useState<BandState | null>(null);
  const [dock, setDock] = useState<Dock | null>(null);
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState<Readonly<Record<string, number>>>({});
  const sized = sizedPanes(panes, natural);
  // The latest of each, for the callbacks rc-dock holds.
  const live = useRef({ panes: sized, bounds, storageKey, opts: { foot, bottom } as ArrangeOptions });
  live.current = { ...live.current, panes: sized, bounds, storageKey };

  useEffect(() => {
    let on = true;
    loadDock().then(
      (m) => on && setDock(() => m),
      () => on && setFailed(true),
    );
    return () => {
      on = false;
    };
  }, []);

  // The band and its head measured before the first paint, then whenever either changes size: the head takes the left
  // column's width, and each column starts under its corner.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      const b = { w: el.clientWidth, h: el.clientHeight };
      if (!(b.w > 0 && b.h > 0)) return;
      const h = head.current;
      if (h) h.style.width = `${columnWidth(b).col}px`;
      const headH = h && h.childElementCount ? h.offsetHeight : 0;
      const opts: ArrangeOptions = {
        foot,
        bottom,
        top: { left: BAND_EDGE + (headH ? headH + BAND_GAP : 0), right: BAND_EDGE + MENU_ROW },
      };
      const prev = live.current.opts;
      const same =
        prev.foot === opts.foot && prev.bottom === opts.bottom && prev.top?.left === opts.top?.left && prev.top?.right === opts.top?.right;
      live.current.opts = same ? live.current.opts : opts;
      live.current.bounds = b;
      setBounds((old) => (old.w === b.w && old.h === b.h ? old : b));
      const { panes: specs, storageKey: key } = live.current;
      setState((s) => (s ? fitState(s, specs, b, live.current.opts) : readSaved(key, specs, b, live.current.opts)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    });
    ro.observe(el);
    if (head.current) ro.observe(head.current);
    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [foot, bottom]);

  // Each pane's contents measured: until the reader changes the band, the default arrangement opens them at that
  // height, and a band that may grow grows to fit them.
  const onMeasure = useCallback((heights: Readonly<Record<string, number>>) => {
    setNatural((prev) => {
      const moved = Object.entries(heights).filter(([id, h]) => Math.abs((prev[id] ?? 0) - h) > 1);
      return moved.length ? { ...prev, ...Object.fromEntries(moved) } : prev;
    });
  }, []);
  useLayoutEffect(() => {
    const { panes: specs, bounds: b, opts } = live.current;
    if (b.w > 0 && b.h > 0) setState((s) => (s ? fitState(s, specs, b, opts) : s));
  }, [natural]);
  const need = grow && bounds.w > 0 ? neededHeight(sized, bounds, live.current.opts) : 0;
  useEffect(() => onNeed(need), [need, onNeed]);

  // A pane the page adds later (a part that waited for its data) opens on top; one it drops leaves the stack.
  const ids = panes.map((p) => p.id).join(" ");
  useLayoutEffect(() => {
    const { panes: specs, bounds: b, opts } = live.current;
    if (b.w > 0 && b.h > 0) setState((s) => (s ? syncSpecs(s, specs, b, opts) : s));
  }, [ids]);

  // Kept in this browser once the reader has changed it; a reset forgets it.
  const saved = useRef<BandState | null>(null);
  useEffect(() => {
    if (!state || saved.current === state) return;
    const first = saved.current === null;
    saved.current = state;
    if (first && !state.custom) return;
    writeSaved(storageKey, state, live.current.panes);
  }, [state, storageKey]);

  const change = useCallback((fn: (s: BandState) => BandState) => setState((s) => (s ? fn(s) : s)), []);

  const onLayout = useCallback(
    (floats: readonly FloatPanel[]) => change((s) => fromBandLayout(floats, s, live.current.panes, live.current.bounds)),
    [change],
  );
  const onRaise = useCallback((id: string) => change((s) => raiseIn(s, id)), [change]);
  const onNudge = useCallback(
    (id: string, d: Nudge) => {
      const spec = live.current.panes.find((p) => p.id === id);
      if (spec) change((s) => nudgeIn(s, spec, live.current.bounds, d));
    },
    [change],
  );
  const onClose = useCallback(
    (id: string) => {
      const hadFocus = !!area.current?.querySelector(`[data-band-pane="${id}"]`)?.contains(document.activeElement);
      change((s) => closeIn(s, id));
      // The pane's controls are gone: the menu that brings it back takes the focus.
      if (hadFocus) requestAnimationFrame(() => menuButton.current?.focus({ preventScroll: true }));
    },
    [change],
  );
  const onToggle = useCallback(
    (id: string) => change((s) => (isOpen(s, id) ? closeIn(s, id) : reopenIn(s, id))),
    [change],
  );
  const onReset = useCallback(() => {
    const b = live.current.bounds;
    if (b.w > 0 && b.h > 0) setState(defaultState(live.current.panes, b, live.current.opts));
  }, []);

  const ready = !!state && bounds.w > 0;
  return (
    <div className={`gp-band${className ? ` ${className}` : ""}`} role="region" aria-label={label}>
      {bar && (
        <div className="gp-band__head" ref={head}>
          {bar}
        </div>
      )}
      <div className="gp-band__corner">
        {state && <PanesMenu panes={panes} state={state} onToggle={onToggle} onReset={onReset} buttonRef={menuButton} />}
      </div>
      <div className="gp-band__area" ref={area}>
        {ready &&
          (dock ? (
            <dock.BandDock
              panes={sized}
              state={state}
              bounds={bounds}
              onLayout={onLayout}
              onClose={onClose}
              onRaise={onRaise}
              onNudge={onNudge}
              onMeasure={onMeasure}
            />
          ) : (
            <StillPanes panes={sized} state={state} bounds={bounds} withContent={failed} />
          ))}
      </div>
    </div>
  );
}

/** The panes in their places without the dock: frames with their names while it loads, their contents if it cannot. */
function StillPanes({ panes, state, bounds, withContent }: { panes: readonly BandPane[]; state: BandState; bounds: Bounds; withContent: boolean }) {
  return (
    <>
      {panes
        .filter((p) => isOpen(state, p.id))
        .map((p) => {
          const r = placeOf(state, p, bounds);
          return (
            <section
              key={p.id}
              className="gp-band-still"
              data-band-pane={p.id}
              aria-label={p.title}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h, zIndex: state.stack.indexOf(p.id) + 1 }}
            >
              <header className="gp-band-still__bar">
                <span className="gp-band__title">{p.title}</span>
              </header>
              <div className="gp-band__body">{withContent ? p.content : null}</div>
            </section>
          );
        })}
    </>
  );
}

// ---------------------------------------------------------------- the panes menu

interface MenuProps {
  panes: readonly BandPane[];
  state: BandState;
  onToggle: (id: string) => void;
  onReset: () => void;
  buttonRef: RefObject<HTMLButtonElement>;
}

/** Every pane, shown or hidden at a click, and Reset layout. It stays open while panes are turned on and off. */
function PanesMenu({ panes, state, onToggle, onReset, buttonRef }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const shown = panes.filter((p) => isOpen(state, p.id)).length;

  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
  const focusItem = (i: number) => {
    const all = items();
    if (all.length) all[(i + all.length) % all.length]?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    setOpen(true);
    const last = e.key === "ArrowUp";
    requestAnimationFrame(() => focusItem(last ? -1 : 0));
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(at + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      focusItem(e.key === "Home" ? 0 : -1);
    } else if (e.key === "Escape") {
      // Handled here: the float layer leaves an Esc that is marked handled alone.
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="gp-band__menu" ref={root}>
      <button
        ref={buttonRef}
        type="button"
        className="gp-band__menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={`Panes, ${shown} of ${panes.length} shown`}
        title="Show, hide or reset the panes"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) requestAnimationFrame(() => focusItem(0));
        }}
        onKeyDown={onButtonKey}
      >
        <span>Panes</span>
        <span className="gp-band__count num" aria-hidden="true">
          {shown}/{panes.length}
        </span>
        <Glyph name="caret" className={open ? "gp-band__caret--open" : undefined} />
      </button>
      {open && (
        <div ref={list} id={`${id}-menu`} role="menu" aria-label="Panes" className="gp-band__menu-list" onKeyDown={onMenuKey}>
          {panes.map((p) => {
            const on = isOpen(state, p.id);
            return (
              <button
                key={p.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                tabIndex={-1}
                className="gp-band__menu-item"
                onClick={() => onToggle(p.id)}
              >
                <span className="gp-band__mark">{on && <Glyph name="check" />}</span>
                <span className="gp-band__menu-label">{p.title}</span>
              </button>
            );
          })}
          <div role="separator" className="gp-band__menu-sep" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="gp-band__menu-item"
            onClick={() => {
              onReset();
              close(true);
            }}
          >
            <span className="gp-band__mark">
              <Glyph name="refresh" />
            </span>
            <span className="gp-band__menu-label">Reset layout</span>
          </button>
        </div>
      )}
    </div>
  );
}
