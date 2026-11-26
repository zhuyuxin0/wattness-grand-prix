import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Glyph } from "../ui/Glyph";
import { EDITION, LABELED_SHARE, PHASES, TIME_BASIS, countdown, marketClockAt, readerTime } from "./market-day";
import "./market-day.css";

// The market day, opened from the masthead's wall time and phase tag: wattness.tech's popover (clock.tsx, in its
// liquid-glass frame from ui/popover.tsx and ui/glass.css) under the clock on a wide screen, a sheet from the foot of a
// phone. It reads nothing but the clock it is given; the register lives in market-day.ts.

const PHONE = "(max-width: 767px)";
/** Pixels the popover keeps from the clock and from the window's edges, as wattness.tech's top-layer menus do. */
const GAP = 4;
const MARGIN = 8;

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

interface PanelProps {
  id: string;
  /** The clock: the popover's right edge lines up with its right edge, under it. */
  anchor: RefObject<HTMLElement>;
  /** Whether a press landed on a control that toggles the panel itself. */
  owns: (target: Node) => boolean;
  /** Unix ms. */
  now: number;
  onClose: (returnFocus: boolean) => void;
}

export function MarketDayPanel({ id, anchor, owns, now, onClose }: PanelProps) {
  const sheet = useMedia(PHONE);
  const opened = useRef(sheet);
  const panel = useRef<HTMLDivElement>(null);
  const closeBack = useCallback(() => onClose(true), [onClose]);

  // Under the clock, its right edge on the clock's, kept inside the window (ui/popover.tsx's place()).
  useLayoutEffect(() => {
    const p = panel.current;
    if (!p || sheet) return;
    const place = () => {
      const a = anchor.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      p.style.left = `${Math.round(Math.max(MARGIN, Math.min(r.right - w, vw - w - MARGIN)))}px`;
      p.style.top = `${Math.round(Math.max(MARGIN, Math.min(r.bottom + GAP, vh - h - MARGIN)))}px`;
      p.style.maxWidth = `${Math.max(0, vw - 2 * MARGIN)}px`;
    };
    place();
    const size = new ResizeObserver(place);
    size.observe(p);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      size.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [sheet, anchor]);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);

  // A layout change while open (a phone turned, a window narrowed) hides the control it opened from.
  useEffect(() => {
    if (sheet !== opened.current) onClose(false);
  }, [sheet, onClose]);

  useEffect(() => {
    if (!sheet) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prior;
    };
  }, [sheet]);

  useEffect(() => {
    const p = panel.current;
    if (!p) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(true);
        return;
      }
      const at = document.activeElement;
      if (e.key !== "Tab" || !at || !p.contains(at)) return;
      const items = [...p.querySelectorAll<HTMLElement>(TABBABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      const backOut = e.shiftKey && (at === p || at === first);
      const forwardOut = !e.shiftKey && (at === last || !last);
      if (sheet) {
        // The sheet is modal: focus stays in it.
        if (backOut || forwardOut) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        }
        return;
      }
      // The popover belongs to its trigger: leaving it either way closes it there. Going forward, the browser's own
      // Tab then carries on from the trigger.
      if (backOut) {
        e.preventDefault();
        onClose(true);
      } else if (forwardOut) {
        onClose(true);
      }
    };
    // A press anywhere else closes the popover where it lands; the sheet's scrim closes the sheet.
    const press = (e: PointerEvent) => {
      const target = e.target as Node;
      if (p.contains(target) || owns(target)) return;
      onClose(false);
    };
    document.addEventListener("keydown", key);
    if (!sheet) document.addEventListener("pointerdown", press, true);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", press, true);
    };
  }, [sheet, onClose, owns]);

  const titleId = `${id}-title`;
  return createPortal(
    sheet ? (
      <div className="gate-sheet">
        <div className="gate-sheet__scrim" onClick={closeBack} aria-hidden="true" />
        <div ref={panel} id={id} className="mc-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <MarketDayBody now={now} titleId={titleId} onClose={closeBack} sheet />
        </div>
      </div>
    ) : (
      <div ref={panel} id={id} className="mc-host" role="dialog" aria-labelledby={titleId} tabIndex={-1}>
        <span className="mc-bezel" aria-hidden="true" />
        <div className="mc-pop">
          <MarketDayBody now={now} titleId={titleId} onClose={closeBack} sheet={false} />
        </div>
      </div>
    ),
    document.body,
  );
}

/**
 * On the phone's sheet a stretch keeps its name only where the name fits whole (wattness.tech's popover is never that
 * narrow); elsewhere the 12% rule alone decides, as there. Measured again when the strip's width changes.
 */
function useFittedLabels(strip: RefObject<HTMLElement>, on: boolean) {
  useLayoutEffect(() => {
    const el = strip.current;
    if (!el || !on) return;
    const fit = () => {
      for (const label of el.querySelectorAll<HTMLElement>(".mc-seg > span")) {
        label.hidden = false;
        label.hidden = label.scrollWidth > label.clientWidth + 1;
      }
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [strip, on]);
}

function MarketDayBody({ now, titleId, onClose, sheet }: { now: number; titleId: string; onClose: () => void; sheet: boolean }) {
  const s = marketClockAt(now);
  const strip = useRef<HTMLSpanElement>(null);
  useFittedLabels(strip, sheet);
  const bids = PHASES[0]!;

  const title = (
    <span id={titleId} className="mc-pop-h">
      The day before Operating Day {s.operatingDayShort} · Central time
    </span>
  );

  return (
    <>
      {sheet ? (
        <div className="mc-sheet__head">
          {title}
          <button type="button" className="btn mc-sheet__close" onClick={onClose} aria-label="Close the market day" title="Close (Esc)">
            <Glyph name="close" />
          </button>
        </div>
      ) : (
        title
      )}
      {/* The list below says all of this in words; the strip is its picture. The now line is drawn last, over the
          stretches and their names, unbroken. */}
      <span className="mc-strip" ref={strip} aria-hidden="true">
        {s.segments.map((g) => (
          <span
            key={g.id}
            className={`mc-seg mc-${g.tone}`}
            style={{ left: `${g.from * 100}%`, width: `${(g.to - g.from) * 100}%` }}
            title={`${g.start}–${g.end} ${g.label}`}
          >
            {g.to - g.from >= LABELED_SHARE ? <span>{g.label}</span> : null}
          </span>
        ))}
        <span className="mc-now" style={{ left: `${s.x * 100}%` }} />
      </span>
      {/* Every boundary gets its time, on two alternating rows so 13:30 and 14:30, an hour apart, never print over each
          other. */}
      <span className="mc-ticks" aria-hidden="true">
        {s.ticks.map((t) => (
          <span key={t.at} className={t.low ? "mc-tick-low" : ""} style={{ left: `${t.x * 100}%` }}>
            {t.at}
          </span>
        ))}
      </span>
      <table className="mc-list">
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.key} className={r.passed ? "mc-passed" : ""} title={`"${r.quote}"\n— ${r.source}`}>
              <td className="mc-at">
                <span className={`mc-swatch ${r.tone ? `mc-${r.tone}` : "mc-event"}`} />
                {r.at}
              </td>
              <td>{r.passed ? "passed" : "ahead"}</td>
              <td>
                {r.label}
                {r.firm ? "" : <em> (a figure, not a rule)</em>}
              </td>
              <td className="mc-src">{r.cite}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className="mc-pop-deadlines">
        <span>
          DAM deadline for Operating Day {s.deadline.operatingDayShort}: {bids.end} CT{" · "}
          {readerTime(s.deadline.at)} yours{" · "}
          {countdown(s.deadline.left)} left.
        </span>
        <span>
          Adjustments for HE{s.adjustment.he}
          {s.adjustment.sameDay ? "" : ` (${s.adjustment.dayShort})`} close at {s.adjustment.topHH}:00 CT{" · "}
          {readerTime(s.adjustment.at)} yours{" · "}
          {countdown(s.adjustment.left)} left. Current Operating Hour: HE{s.he}.
        </span>
      </span>
      <span className="mc-foot">
        {EDITION}. {TIME_BASIS}
      </span>
    </>
  );
}
