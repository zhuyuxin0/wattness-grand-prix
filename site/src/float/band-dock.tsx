import "rc-dock/dist/rc-dock.css";
import "./band-dock.css";
import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from "react";
import DockLayout, { type LayoutBase, type PanelData, type TabBase, type TabData, type TabGroup } from "rc-dock";
import { Glyph } from "../ui/Glyph";
import type { DockProps } from "./band";
import { BAND_GROUP, bandPanelId, minOf, nudgeFor, paneOfTab, toBandLayout } from "./band-model";
import type { FloatPanel } from "./model";

// The band's dock: its panes as rc-dock float panels inside the band (band.tsx holds their state), on rc-dock 3.3.2 as
// the float layer and wattness.tech's Terminal are. A pane's header carries it and holds its name and close button; its
// edges and corner resize it. The panels keep the page's order and their stack sets which is on top, so a pane raised
// by a press never moves in the reading order. Loaded by band.tsx's one dynamic import.

type Panes = DockProps["panes"];
const PanesContext = createContext<{ panes: Panes; onClose: (id: string) => void }>({ panes: [], onClose: () => undefined });

export function BandDock({ panes, state, bounds, onLayout, onClose, onRaise, onNudge, onMeasure }: DockProps) {
  const box = useRef<HTMLDivElement>(null);
  const hint = useId();
  // The layout follows the panes' places and sizes, not their contents (those reach the panes by the context), so a
  // page that draws again does not hand rc-dock a new layout.
  const shape = panes.map((p) => [p.id, p.side, p.h, p.weight, p.min?.w, p.min?.h].join(":")).join(" ");
  const specs = useRef(panes);
  specs.current = panes;
  const layout = useMemo(() => toBandLayout(state, specs.current, bounds) as unknown as LayoutBase, [state, shape, bounds]);
  const context = useMemo(() => ({ panes, onClose }), [panes, onClose]);

  const groups = useMemo<Record<string, TabGroup>>(
    () => ({
      [BAND_GROUP]: {
        floatable: "singleTab",
        disableDock: true,
        maximizable: false,
        tabLocked: true,
        animated: false,
        panelExtra: (panel: PanelData) => <CloseButton id={paneOfTab(panel.activeId)} />,
      },
    }),
    [],
  );

  // rc-dock keeps the first loadTab it is given; what each pane draws reaches it by the context.
  const loadTab = useCallback((tab: TabBase): TabData => {
    const id = paneOfTab(tab.id);
    const min = minOf(specs.current.find((p) => p.id === id));
    return {
      id: String(tab.id ?? ""),
      group: BAND_GROUP,
      closable: false,
      minWidth: min.w,
      minHeight: min.h,
      title: <PaneTitle id={id} />,
      content: <PaneBody id={id} />,
    };
  }, []);

  const onLayoutChange = useCallback(
    (next: LayoutBase) => onLayout((next.floatbox?.children ?? []) as unknown as FloatPanel[]),
    [onLayout],
  );

  // Each panel is named for its pane, so a press or focus anywhere in it finds it; its header says how the keyboard
  // moves it.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    for (const id of state.stack) {
      const panel = el.querySelector<HTMLElement>(`.dock-panel[data-dockid="${bandPanelId(id)}"]`);
      if (!panel) continue;
      panel.dataset.bandPane = id;
      panel.setAttribute("aria-label", panes.find((p) => p.id === id)?.title ?? "");
      panel.setAttribute("role", "group");
      panel.querySelector(".dock-tab-btn")?.setAttribute("aria-describedby", hint);
    }
  });

  // What each open pane's contents ask for: its header, its contents at its width, its border. Measured when the
  // band's width or panes change, and when contents change size while the reader is not working in the band (a part
  // whose data arrived, its logos loaded), so the panes never move under a reader typing in one.
  const open = [...state.stack].sort().join(" ");
  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const heights: Record<string, number> = {};
    for (const panel of el.querySelectorAll<HTMLElement>("[data-band-pane]")) {
      const bar = panel.querySelector<HTMLElement>(".dock-bar");
      const content = panel.querySelector<HTMLElement>(".gp-band__content");
      if (!bar || !content) continue;
      heights[panel.dataset.bandPane!] = Math.ceil(bar.offsetHeight + content.offsetHeight + 2);
    }
    onMeasure(heights);
  }, [onMeasure]);
  useLayoutEffect(measure, [measure, bounds.w, shape, open]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!el.contains(document.activeElement)) measure();
      });
    });
    for (const c of el.querySelectorAll(".gp-band__content")) ro.observe(c);
    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [measure, open]);

  // The keyboard's drag, on a pane's header: an arrow key moves the pane, Shift with an arrow key resizes it.
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest(".dock-tab-btn") || e.altKey || e.ctrlKey || e.metaKey) return;
    const d = nudgeFor(e.key, e.shiftKey);
    const id = target.closest<HTMLElement>("[data-band-pane]")?.dataset.bandPane;
    if (!d || !id) return;
    e.preventDefault();
    e.stopPropagation();
    onNudge(id, d);
  };

  const raiseFrom = (target: EventTarget | null) => {
    const holder = target instanceof Element ? target.closest<HTMLElement>("[data-band-pane]") : null;
    const id = holder?.dataset.bandPane;
    if (id) onRaise(id);
  };

  return (
    <PanesContext.Provider value={context}>
      <div
        className="gp-band__dock"
        ref={box}
        onPointerDownCapture={(e) => raiseFrom(e.target)}
        onFocusCapture={(e) => raiseFrom(e.target)}
        onKeyDownCapture={onKeyDownCapture}
      >
        <DockLayout layout={layout} loadTab={loadTab} groups={groups} onLayoutChange={onLayoutChange} style={{ position: "absolute", inset: 0 }} />
        <p id={hint} className="visually-hidden">
          Drag the header to move the pane, or use the arrow keys; Shift with an arrow key resizes it.
        </p>
      </div>
    </PanesContext.Provider>
  );
}

function PaneTitle({ id }: { id: string }) {
  const { panes } = useContext(PanesContext);
  return <span className="gp-band__title">{panes.find((p) => p.id === id)?.title ?? ""}</span>;
}

function CloseButton({ id }: { id: string }) {
  const { panes, onClose } = useContext(PanesContext);
  const title = panes.find((p) => p.id === id)?.title ?? "this";
  // drag-ignore: rc-dock starts no drag from it, so a press is a press.
  return (
    <button
      type="button"
      className="gp-band__close drag-ignore"
      aria-label={`Close the ${title} pane`}
      title="Close (the panes menu brings it back)"
      onClick={() => onClose(id)}
    >
      <Glyph name="close" className="drag-ignore" />
    </button>
  );
}

function PaneBody({ id }: { id: string }) {
  const { panes } = useContext(PanesContext);
  const pane = panes.find((p) => p.id === id);
  return (
    <div className="gp-band__body">
      <div className="gp-band__content">{pane?.content ?? null}</div>
    </div>
  );
}
