import "rc-dock/dist/rc-dock.css";
import "./float.css";
import {
  Component,
  lazy,
  StrictMode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useRoutes, type RouteObject } from "react-router-dom";
import DockLayout, { type LayoutBase, type PanelData, type TabBase, type TabData, type TabGroup } from "rc-dock";
import { Glyph } from "../ui/Glyph";
import { TabIcon } from "../ui/TabIcon";
import { Loading } from "../ui/States";
import { groupOf, tabAt, TABS } from "../shell/tabs";
import { PANES_KEY, type FloatHost } from "./index";
import {
  clampAll,
  closePane,
  fromLayout,
  MIN_PANE,
  openPath,
  PANE_GROUP,
  panelId,
  parseSaved,
  raise,
  serialize,
  setPath,
  toLayout,
  topPane,
  type Bounds,
  type FloatPanel,
  type Pane,
} from "./model";

// The float layer: any tab's real page in a pane over the current page, on rc-dock 3.3.2 as on wattness.tech's
// Terminal, drawn in this site's tokens and glyphs (float.css). It loads on first use (index.ts), in its own React root
// over the app, and each pane runs its page under its own memory router: the page reads the pane's path and its query,
// and a link followed inside a pane moves that pane, never the page under it. A pane's Open takes its path to the
// site's router and closes the pane.
//
// Drag a pane by its header and resize it at its edges and its corner; the newest is on top and a press raises one;
// Esc closes the top pane. From the phone breakpoint down a pane is a full-height sheet instead. The open panes and
// their places are kept in this browser (try/catch: without storage they last until a reload).

const PHONE = "(max-width: 767px)";

// ---------------------------------------------------------------- the store

let host: FloatHost | null = null;
let panes: readonly Pane[] = [];
const subs = new Set<() => void>();
/** The control that opened each pane, for focus on the way back. */
const openers = new Map<string, HTMLElement>();
let seq = 0;

const tabOf = (path: string) => tabAt(path.split("?")[0] ?? path);

function save(list: readonly Pane[]): void {
  try {
    if (list.length) localStorage.setItem(PANES_KEY, serialize(list));
    else localStorage.removeItem(PANES_KEY);
  } catch {
    // Without storage the panes last until a reload.
  }
}

function restore(): readonly Pane[] {
  try {
    return parseSaved(localStorage.getItem(PANES_KEY), (path) => tabOf(path) !== undefined);
  } catch {
    return [];
  }
}

function commit(next: readonly Pane[]): void {
  if (next === panes) return;
  panes = next;
  save(next);
  for (const fn of [...subs]) fn();
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

const snapshot = () => panes;
const usePanes = () => useSyncExternalStore(subscribe, snapshot, snapshot);

function usePane(id: string): Pane | undefined {
  const list = usePanes();
  return list.find((p) => p.id === id);
}

/** The layer's size: the window under the masthead. */
function bounds(): Bounds {
  const el = document.querySelector<HTMLElement>(".gp-float");
  if (el && el.clientWidth > 0) return { w: el.clientWidth, h: el.clientHeight };
  const masthead = document.querySelector<HTMLElement>(".masthead")?.offsetHeight ?? 40;
  return { w: window.innerWidth, h: Math.max(0, window.innerHeight - masthead) };
}

function newId(): string {
  seq += 1;
  return `p-${Date.now().toString(36)}-${seq}`;
}

/** The pane's scroll box: what takes focus when it opens, and what Esc and a press find a pane by. */
const paneBox = (id: string) => document.querySelector<HTMLElement>(`.gp-pane__scroll[data-pane-id="${id}"]`);

function focusPane(id: string): void {
  // Once the layer has drawn it (a first open also mounts rc-dock): a frame at a time, for half a second at most.
  let frames = 30;
  const tryFocus = () => {
    const box = paneBox(id);
    if (box) box.focus({ preventScroll: true });
    else if (--frames > 0) requestAnimationFrame(tryFocus);
  };
  requestAnimationFrame(tryFocus);
}

// ---------------------------------------------------------------- the layer's API (index.ts calls it)

let root: Root | null = null;

export function start(h: FloatHost): void {
  host = h;
  if (root) return;
  panes = restore();
  const el = document.createElement("div");
  el.className = "gp-float-root";
  document.body.append(el);
  // Its own prefix for useId: the pages in panes and the page under them never share an id.
  root = createRoot(el, { identifierPrefix: "pane-" });
  root.render(
    <StrictMode>
      <FloatLayer />
    </StrictMode>,
  );
}

export function open(path: string, opener: HTMLElement | null): void {
  const next = openPath(panes, path, bounds(), newId());
  commit(next);
  const shown = topPane(next);
  if (!shown) return;
  if (opener) openers.set(shown.id, opener);
  focusPane(shown.id);
}

function close(id: string): void {
  const box = paneBox(id);
  const hadFocus = !!box && box.closest("[data-pane-root]")?.contains(document.activeElement);
  const opener = openers.get(id);
  openers.delete(id);
  commit(closePane(panes, id));
  if (!hadFocus) return;
  // Back to the control that opened it, else to the pane now on top, else to the page.
  requestAnimationFrame(() => {
    const top = topPane(panes);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    else if (top) paneBox(top.id)?.focus({ preventScroll: true });
    else document.getElementById("main")?.focus({ preventScroll: true });
  });
}

/** The pane's tab as the page: its path to the site's router, and the pane closes. */
function openAsPage(id: string): void {
  const pane = panes.find((p) => p.id === id);
  if (!pane) return;
  openers.delete(id);
  commit(closePane(panes, id));
  host?.navigate(pane.path);
  requestAnimationFrame(() => document.getElementById("main")?.focus({ preventScroll: true }));
}

const raiseFrom = (target: EventTarget | null) => {
  const holder = target instanceof Element ? target.closest<HTMLElement>("[data-pane-root]") : null;
  const id = holder?.dataset.paneRoot;
  if (id) commit(raise(panes, id));
};

// ---------------------------------------------------------------- Esc

/**
 * Whether another part of the page answers this Esc: a modal (the introduction, the tab drawer, the market day's
 * sheet, a dialog of Ask Ness's) or a control that uses the key itself (a text field, a picker's open list, a chart's
 * hour). The market day's popover takes its Esc first and marks it handled.
 */
function escapeTaken(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true;
  const modals = document.querySelectorAll('dialog[open], [aria-modal="true"]');
  if ([...modals].some((m) => !m.closest(".gp-float-root"))) return true;
  const t = e.target instanceof Element ? e.target : null;
  return !!t?.closest(ESC_USERS);
}

/** Controls that use Esc themselves. */
const ESC_USERS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [aria-expanded="true"], [role="listbox"], [role="slider"], svg';

function useEscape(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || panes.length === 0 || escapeTaken(e)) return;
      const top = topPane(panes);
      if (!top) return;
      e.preventDefault();
      close(top.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function useMedia(query: string): boolean {
  const sub = useCallback(
    (fn: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", fn);
      return () => m.removeEventListener("change", fn);
    },
    [query],
  );
  return useSyncExternalStore(sub, () => window.matchMedia(query).matches, () => false);
}

// ---------------------------------------------------------------- the layer

function FloatLayer() {
  const list = usePanes();
  const phone = useMedia(PHONE);
  useEscape();
  if (list.length === 0) return null;
  return phone ? <Sheets list={list} /> : <Floats list={list} />;
}

/** The panes as floats: rc-dock's float box over the page, under the masthead. */
function Floats({ list }: { list: readonly Pane[] }) {
  const box = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => toLayout(list) as unknown as LayoutBase, [list]);

  const groups = useMemo<Record<string, TabGroup>>(
    () => ({
      [PANE_GROUP]: {
        floatable: "singleTab",
        disableDock: true,
        maximizable: false,
        tabLocked: true,
        animated: false,
        panelExtra: (panel: PanelData) => <PaneActions id={String(panel.activeId ?? "")} />,
      },
    }),
    [],
  );

  const onLayoutChange = useCallback((next: LayoutBase) => {
    const floats = (next.floatbox?.children ?? []) as FloatPanel[];
    commit(clampAll(fromLayout(floats, panes), bounds()));
  }, []);

  // A pane stays inside the layer when the window shrinks, as the Terminal keeps its floats inside its dock.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (el.clientWidth > 0) commit(clampAll(panes, { w: el.clientWidth, h: el.clientHeight }));
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // rc-dock draws each panel; the panel is named for its pane here, so a press or focus anywhere in it finds it.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    for (const p of list) {
      const panel = el.querySelector<HTMLElement>(`.dock-panel[data-dockid="${panelId(p.id)}"]`);
      if (panel) panel.dataset.paneRoot = p.id;
    }
  });

  return (
    <div
      className="gp-float"
      ref={box}
      onPointerDownCapture={(e) => raiseFrom(e.target)}
      onFocusCapture={(e) => raiseFrom(e.target)}
    >
      <DockLayout
        layout={layout}
        loadTab={loadTab}
        groups={groups}
        onLayoutChange={onLayoutChange}
        style={{ position: "absolute", inset: 0 }}
      />
    </div>
  );
}

function loadTab(tab: TabBase): TabData {
  const id = String(tab.id ?? "");
  return {
    id,
    group: PANE_GROUP,
    closable: false,
    minWidth: MIN_PANE.w,
    minHeight: MIN_PANE.h,
    title: <PaneTitle id={id} />,
    content: <PaneBody id={id} />,
  };
}

/** From the phone breakpoint down: each pane a full-height sheet, the newest on top. */
function Sheets({ list }: { list: readonly Pane[] }) {
  useEffect(() => {
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prior;
    };
  }, []);
  return (
    <>
      {list.map((p, i) => (
        <section
          key={p.id}
          className="gp-sheet"
          data-pane-root={p.id}
          hidden={i !== list.length - 1}
          aria-label={`${labelOf(p.path)} preview`}
        >
          <header className="gp-sheet__bar">
            <PaneTitle id={p.id} />
            <PaneActions id={p.id} />
          </header>
          <PaneBody id={p.id} />
        </section>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- a pane's parts

const labelOf = (path: string) => tabOf(path)?.label ?? "Page";

function PaneTitle({ id }: { id: string }) {
  const pane = usePane(id);
  const tab = pane ? tabOf(pane.path) : undefined;
  const group = tab ? groupOf(tab) : null;
  return (
    <span className="gp-pane__title">
      {group && <span className="gp-pane__group">{group.label}</span>}
      <span className="gp-pane__name">
        {tab && <TabIcon name={tab.icon} className="gp-pane__icon" />}
        <span className="gp-pane__label">{tab?.label ?? "Page"}</span>
      </span>
    </span>
  );
}

function PaneActions({ id }: { id: string }) {
  const pane = usePane(id);
  const label = pane ? labelOf(pane.path) : "this";
  // drag-ignore: rc-dock starts no drag from these, so a press is a press.
  return (
    <span className="gp-pane__actions">
      <button type="button" className="gp-pane__btn drag-ignore" title={`Go to ${label}`} onClick={() => openAsPage(id)}>
        <Glyph name="popout" className="drag-ignore" />
        <span className="drag-ignore">Open</span>
      </button>
      <button
        type="button"
        className="gp-pane__btn gp-pane__btn--icon drag-ignore"
        aria-label={`Close the ${label} preview`}
        title="Close (Esc)"
        onClick={() => close(id)}
      >
        <Glyph name="close" className="drag-ignore" />
      </button>
    </span>
  );
}

const NotFound = lazy(() => import("../pages/NotFound"));

// The site's tabs, as routes.tsx builds them, for a pane's own router.
const PANE_ROUTES: RouteObject[] = [
  ...TABS.map(
    (t): RouteObject => ({ path: t.path === "/" ? "/" : `${t.path}${t.subpaths ? "/*" : ""}`, element: <t.page /> }),
  ),
  { path: "*", element: <NotFound /> },
];

function PaneBody({ id }: { id: string }) {
  // The path the pane opened at; the pane's router keeps it from then on.
  const start = useRef(panes.find((p) => p.id === id)?.path ?? "/").current;
  const pane = usePane(id);
  return (
    <div
      className="gp-pane__scroll"
      data-pane-id={id}
      tabIndex={-1}
      role="region"
      aria-label={`${labelOf(pane?.path ?? start)} preview`}
    >
      <MemoryRouter initialEntries={[start]}>
        <PaneBoundary>
          <Suspense fallback={<Loading />}>
            <PaneRoutes id={id} />
          </Suspense>
        </PaneBoundary>
      </MemoryRouter>
    </div>
  );
}

function PaneRoutes({ id }: { id: string }) {
  const location = useLocation();
  const path = `${location.pathname}${location.search}`;
  const tab = tabOf(location.pathname);
  useEffect(() => {
    commit(setPath(panes, id, path));
  }, [id, path]);
  // Another tab inside the pane starts at its top, as on the page.
  useEffect(() => {
    paneBox(id)?.scrollTo(0, 0);
  }, [id, tab?.id]);
  return <div className="gp-pane__page">{useRoutes(PANE_ROUTES)}</div>;
}

/** A page that fails inside a pane says so there; the page under it and the other panes go on. */
class PaneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="state state--error" role="alert">
        This page could not be shown here. Its Open button goes to it.
      </div>
    );
  }
}
