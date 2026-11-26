import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { dualTime, formatOperatingDay } from "../lib/time";
import { Glyph } from "../ui/Glyph";
import { ADJUSTMENT_CLOSE, EDITION, PHASES, TIME_BASIS, leftText, marketDayAt, type Moment } from "./market-day";
import "./market-day.css";

// The market day, opened from the masthead's clock and gate: a popover under the control on a wide screen, a sheet
// from the foot of a phone. It reads nothing but the clock it is given; the register lives in market-day.ts.

const PHONE = "(max-width: 767px)";
/** Pixels the popover keeps from the trigger and from the window's edges. */
const GAP = 6;
const MARGIN = 12;

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

/**
 * One control's hold on the market day: the props that make it the trigger (Enter and Space open it, as a button's
 * click does) and the close that returns focus to it.
 */
export function useMarketDay() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) ref.current?.focus({ preventScroll: true });
  }, []);
  const trigger = {
    ref,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
    onClick: () => setOpen((o) => !o),
  };
  return { open, close, trigger, id, ref };
}

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

interface PanelProps {
  id: string;
  anchor: RefObject<HTMLElement>;
  /** Unix ms; the panel redraws when the minute changes. */
  now: number;
  onClose: (returnFocus: boolean) => void;
}

export function MarketDayPanel({ id, anchor, now, onClose }: PanelProps) {
  const sheet = useMedia(PHONE);
  const opened = useRef(sheet);
  const panel = useRef<HTMLDivElement>(null);
  const minute = Math.floor(now / 60_000) * 60_000;
  const closeBack = useCallback(() => onClose(true), [onClose]);

  // Under the trigger, its right edge on the trigger's, kept inside the window.
  useLayoutEffect(() => {
    const p = panel.current;
    if (!p || sheet) return;
    const place = () => {
      const a = anchor.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const top = Math.round(r.bottom + GAP);
      p.style.top = `${top}px`;
      p.style.left = `${Math.round(Math.max(MARGIN, Math.min(r.right - p.offsetWidth, vw - p.offsetWidth - MARGIN)))}px`;
      p.style.maxHeight = `${Math.max(200, window.innerHeight - top - MARGIN)}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
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
      if (p.contains(target) || anchor.current?.contains(target)) return;
      onClose(false);
    };
    document.addEventListener("keydown", key);
    if (!sheet) document.addEventListener("pointerdown", press, true);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", press, true);
    };
  }, [sheet, onClose, anchor]);

  const titleId = `${id}-title`;
  const body = <MarketDayBody minute={minute} titleId={titleId} onClose={closeBack} />;
  return createPortal(
    sheet ? (
      <div className="gate-sheet">
        <div className="gate-sheet__scrim" onClick={closeBack} aria-hidden="true" />
        <div ref={panel} id={id} className="gate-day gate-day--sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          {body}
        </div>
      </div>
    ) : (
      <div ref={panel} id={id} className="gate-day gate-day--pop" role="dialog" aria-labelledby={titleId} tabIndex={-1}>
        {body}
      </div>
    ),
    document.body,
  );
}

const hm = { date: false, seconds: false } as const;

/** "Nov 27" */
const shortDay = (day: string) => formatOperatingDay(day).replace(/^\w+, /, "").replace(/, \d{4}$/, "");

/**
 * A label is drawn on a stretch of the bar only where it fits (the hour of DAM results is 4% of the day); the list
 * below names every stretch. Measured again when the bar's width or the day's length changes.
 */
function useFittedLabels(strip: RefObject<HTMLElement>, day: string) {
  useLayoutEffect(() => {
    const el = strip.current;
    if (!el) return;
    const fit = () => {
      for (const label of el.querySelectorAll<HTMLElement>(".gate-day__seg-label")) {
        label.hidden = false;
        label.hidden = label.scrollWidth > label.clientWidth + 1;
      }
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [strip, day]);
}

const MarketDayBody = memo(function MarketDayBody({ minute, titleId, onClose }: { minute: number; titleId: string; onClose: () => void }) {
  const day = marketDayAt(minute);
  const strip = useRef<HTMLDivElement>(null);
  useFittedLabels(strip, day.day);

  const now = dualTime(day.now, hm);
  const deadline = dualTime(day.deadline.unix, hm);
  const adjust = dualTime(day.adjustment.closes, hm);
  const late = day.deadline.left <= 600;
  const yours = day.moments.map((m) => dualTime(m.unix, hm).yours);
  const bids = PHASES[0]!;

  return (
    <>
      <div className="gate-day__head">
        <h2 id={titleId} className="gate-day__title">
          The day before Operating Day {formatOperatingDay(day.operatingDay)}
          <span className="gate-day__zone"> · Central time</span>
        </h2>
        <button type="button" className="btn gate-day__close" onClick={onClose} aria-label="Close the market day" title="Close (Esc)">
          <Glyph name="close" />
        </button>
      </div>

      {/* The spaces between the flex items are for reading aloud; the gap does the layout. */}
      <p className="gate-day__now" title={`Next: ${day.phase.next}.`}>
        <span className="gate-day__now-at">
          Now <span className="num">{now.ct}</span>
          {now.yours && <span className="gate-day__muted num"> · {now.yours}</span>}
        </span>{" "}
        <span className={`gate-day__phase gate-day__tone--${day.phase.tone}`}>{day.phase.label}</span>{" "}
        <span>
          until <span className="num">{day.phase.end} CT</span>
          {!day.phase.atDeadline && (
            <>
              {" · "}
              <span className="num">{leftText(day.phase.left)}</span> left
            </>
          )}
        </span>
      </p>

      {/* The list below says all of this in words; the bar is its picture. */}
      <div className="gate-day__bar" aria-hidden="true">
        <div className="gate-day__track">
          <div className="gate-day__strip" ref={strip}>
            {day.segments.map((s) => (
              <span
                key={s.id}
                className={`gate-day__seg gate-day__tone--${s.tone}`}
                style={{ left: `${s.from * 100}%`, width: `${(s.to - s.from) * 100}%` }}
                title={`${s.start}–${s.end} CT ${s.label}`}
              >
                <span className="gate-day__seg-label">{s.label}</span>
              </span>
            ))}
          </div>
          <span className="gate-day__marker" style={{ left: `${day.x * 100}%` }} />
        </div>
        <div className="gate-day__ticks">
          {day.ticks.map((t) => (
            <span key={t.at} className={`num${t.low ? " gate-day__tick--low" : ""}`} style={{ left: `${t.x * 100}%` }}>
              {t.at}
            </span>
          ))}
        </div>
      </div>

      <ol className={`gate-day__list${yours.some(Boolean) ? "" : " gate-day__list--ct"}`}>
        {day.moments.map((m, i) => (
          <MomentRow key={m.key} m={m} yours={yours[i] ?? null} />
        ))}
      </ol>

      <div className="gate-day__deadlines">
        <p title={`“${bids.quote}”\n— ${bids.source}`}>
          DAM deadline for Operating Day {formatOperatingDay(day.deadline.operatingDay)}: <b className="num">{deadline.ct}</b>
          {deadline.yours && <span className="num"> · {deadline.yours}</span>}
          {" · "}
          <b className={`num${late ? " gate-day__late" : ""}`}>{leftText(day.deadline.left)} left</b>.
        </p>
        <p title={`“${ADJUSTMENT_CLOSE.quote}”\n— ${ADJUSTMENT_CLOSE.source}`}>
          Adjustments for {day.adjustment.hour}
          {day.adjustment.day && ` (${shortDay(day.adjustment.day)})`} close at <b className="num">{adjust.ct}</b>
          {adjust.yours && <span className="num"> · {adjust.yours}</span>}
          {" · "}
          <b className="num">{leftText(day.adjustment.left)} left</b>. Current Operating Hour: {day.adjustment.current}.
        </p>
      </div>
      <p className="gate-day__foot">
        {EDITION}. {TIME_BASIS}
      </p>
    </>
  );
});

function MomentRow({ m, yours }: { m: Moment; yours: string | null }) {
  return (
    <li className={`gate-day__moment gate-day__moment--${m.state}`} aria-current={m.state === "now" ? "step" : undefined} title={`“${m.quote}”\n— ${m.source}`}>
      <span className="gate-day__at">
        <i className={`gate-day__swatch ${m.tone ? `gate-day__tone--${m.tone}` : "gate-day__swatch--event"}`} aria-hidden="true" />
        <span className="num">{m.at}</span>
        <span className="visually-hidden"> CT</span>
      </span>
      <span className="gate-day__yours num">{yours ?? ""}</span>
      <span className="gate-day__state">{m.state}</span>
      <span className="gate-day__what">
        <span className="gate-day__label">
          {m.label}
          {!m.firm && <em> (a figure, not a rule)</em>}
        </span>{" "}
        <span className="gate-day__cite">{m.cite}</span>
      </span>
    </li>
  );
}
