import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { combine, useDay, useReceipts, type BatterySummary, type ChainReceipt, type DayIndex } from "../../data";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { dualTime } from "../../lib/time";
import { BATTERY_NAMES, Glyph, Hash, PageHeader } from "../../ui";
import { Strip } from "../Fleet/Strip";
import { hubLabel, plainName } from "../Fleet/names";
import { StackSpace } from "../TechStack/StackSpace";
import { NESS_QUESTIONS, STAGE_POSTER, askSearch, boardTop, findBatteries, sealOf, verifyPath } from "./room";
import { RoomBand } from "./RoomBand";
import "./control-room.css";

// The control room: the Overview's first view, the Terminal's home. Its stage is the Tech Stack's 3D itself, live (the
// same mount the Tech Stack tab draws, TechStack/StackSpace.tsx): its lines flow at rest, a piece's card opens under
// the pointer wherever no pane covers it, and a click opens the piece's tab. The first paint shows the stack's poster
// (chapter 21 of the introduction, public/chapters/stack.webp with its receipt); the 3D is fetched once the page's
// text is in and the page is idle, and fades in over the poster once it has drawn. With reduced motion or Save-Data
// the poster stays alone. Leaving the tab disposes the 3D, which releases its WebGL context. Over the stage, glass
// panes, each a small live preview that opens its tab: the latest seal, a battery search that opens Verify, the Fleet
// board's first rows, and Ask Ness's prepared questions (in a build that has Ask Ness). The first paint loads no
// three.js.

const posterSrc = `${import.meta.env.BASE_URL}${STAGE_POSTER.file}`;

/** Ask Ness's panel (site/src/ness) opens from the address (?ask=, ?ask=<id>); the pane shows only where it is built. */
const NESS_IN_BUILD = Object.keys(import.meta.glob("../../ness/NessPanel.tsx")).length > 0;

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const set = () => setOn(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, [query]);
  return on;
}

/** Whether the reader has asked the browser to save data. */
function saveData(): boolean {
  try {
    return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  } catch {
    return false;
  }
}

/** True once the page is idle after its first paint (the window's load, then an idle moment). */
function useIdle(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let id = 0;
    let gone = false;
    const later = (f: () => void) =>
      typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(f, { timeout: 2500 }) : window.setTimeout(f, 600);
    const go = () => {
      id = later(() => !gone && setIdle(true));
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      gone = true;
      window.removeEventListener("load", go);
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);
  return idle;
}

/**
 * The stage behind the panes: the stack's poster on the first paint, and over it the Tech Stack's 3D, live, once the
 * page's text is in (`settled`) and the page is idle; it fades in once it has drawn its first frame. With reduced
 * motion or Save-Data, or where the 3D cannot start, the poster alone.
 */
function HomeStage({ settled }: { settled: boolean }) {
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const still = reduced || saveData();
  const idle = useIdle();
  const [failed, setFailed] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const live = !still && !failed && idle && settled;
  useEffect(() => {
    if (!live) setDrawn(false);
  }, [live]);
  // ready settles as the first frame is asked for: shown after it is drawn, so the poster never gives way to a blank
  const onReady = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
  }, []);
  const onFail = useCallback(() => setFailed(true), []);
  return (
    <div className={`ov-room__stage${live && drawn ? " is-live" : ""}`}>
      <img
        className="ov-room__poster"
        src={posterSrc}
        alt=""
        width={STAGE_POSTER.width}
        height={STAGE_POSTER.height}
        decoding="async"
        {...{ fetchpriority: "high" }}
      />
      {live && <StackSpace className="ov-room__space" onReady={onReady} onFail={onFail} />}
    </div>
  );
}

interface PaneProps {
  area: string;
  title: ReactNode;
  /** Beside the title: a figure's day, a count. */
  meta?: ReactNode;
  /** The tab the pane previews, and its name. */
  to?: string;
  toLabel?: string;
  className?: string;
  children: ReactNode;
}

/** One glass pane: a title-case name, its live preview, and the way into its tab. */
function Pane({ area, title, meta, to, toLabel, className, children }: PaneProps) {
  const id = useId();
  return (
    <section className={`ov-pane ov-pane--${area}${className ? ` ${className}` : ""}`} aria-labelledby={id}>
      <header className="ov-pane__head">
        <h2 id={id} className="ov-pane__title">
          {title}
        </h2>
        {meta && <span className="ov-pane__meta">{meta}</span>}
      </header>
      {children}
      {to && toLabel && (
        <Link to={to} className="ov-pane__open">
          Open {toLabel}
          <Glyph name="next" />
        </Link>
      )}
    </section>
  );
}

/** "Nov 26" for a YYYY-MM-DD operating day. */
function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A time in CT, the reader's own after it. */
function Dual({ unix, seconds = true }: { unix: number; seconds?: boolean }) {
  const t = dualTime(unix, { date: false, seconds });
  return (
    <>
      <span className="num">{t.ct}</span>
      {t.yours && <span className="ov-room__yours num"> · {t.yours}</span>}
    </>
  );
}

function SealPane({ day, seal }: { day: DayIndex; seal: ChainReceipt }) {
  return (
    <Pane area="seal" title="Latest Seal" meta={`Operating day ${shortDay(day.operatingDay)}`} to="/seal" toLabel="Seal">
      <p className="ov-seal__lead">
        <span className="ov-seal__margin num">{minSec(seal.secondsBeforeGate)}</span>
        <span className="ov-seal__before">before ERCOT's day-ahead gate</span>
        <span className="ov-seal__gate">
          <Dual unix={day.gateUnix} seconds={false} />
        </span>
      </p>
      <dl className="ov-seal__facts">
        <div>
          <dt>Plans</dt>
          <dd>
            <span className="num">{formatInt(seal.leafCount)}</span> under one root
          </dd>
        </div>
        <div>
          <dt>Root</dt>
          <dd>
            <Hash value={seal.root} head={6} tail={4} label="day's root" />
          </dd>
        </div>
        <div>
          <dt>Commit</dt>
          <dd>
            <Dual unix={seal.blockTime} />
            {seal.txUrl && (
              <>
                {" "}
                <a className="ov-seal__tx" href={seal.txUrl} target="_blank" rel="noreferrer">
                  BscScan
                  <Glyph name="popout" />
                </a>
              </>
            )}
          </dd>
        </div>
      </dl>
      <p className="ov-pane__note">
        {seal.chainName}, block <span className="num">{formatInt(seal.blockNumber)}</span>
      </p>
    </Pane>
  );
}

function VerifyPane({ day }: { day: DayIndex }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const id = useId();
  const found = useMemo(() => findBatteries(day.batteries, BATTERY_NAMES, query, 5), [day.batteries, query]);
  useEffect(() => setCursor(0), [query]);
  const showcase = day.batteries.find((b) => b.resource === day.showcase) ?? day.batteries[0];
  const go = (b: BatterySummary | undefined) => {
    if (b) navigate(verifyPath(b.resource));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(found.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(found[cursor]);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  };
  const open = found.length > 0;
  return (
    <Pane area="verify" title="Verify a Plan" to="/verify" toLabel="Verify">
      <p className="ov-pane__line">Your browser checks one plan against the root on BNB Chain.</p>
      <div className="ov-find">
        <input
          type="search"
          className="ov-find__input"
          value={query}
          placeholder={`Search ${formatInt(day.batteries.length)} batteries`}
          aria-label="Search batteries to verify"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && found[cursor] ? `${id}-${found[cursor]!.resource}` : undefined}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        {open && (
          <ul className="ov-find__list ov-find__pop" role="listbox" id={`${id}-list`} aria-label="Batteries">
            {found.map((b, i) => (
              <li key={b.resource} id={`${id}-${b.resource}`} role="option" aria-selected={i === cursor} className={i === cursor ? "is-cursor" : undefined} onPointerEnter={() => setCursor(i)} onClick={() => go(b)}>
                <span className="ov-find__name">{plainName(b.resource) ?? b.resource}</span>
                <span className="ov-find__meta num">
                  {plainName(b.resource) ? `${b.resource} · ` : ""}
                  {hubLabel(b.hub)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!open && query.trim() !== "" && <p className="ov-find__none ov-find__pop">No battery matches that.</p>}
      </div>
      {showcase && (
        <p className="ov-pane__note">
          Or try{" "}
          <Link to={verifyPath(showcase.resource)} className="ov-pane__inline">
            {plainName(showcase.resource) ?? showcase.resource}
          </Link>
        </p>
      )}
    </Pane>
  );
}

function FleetPane({ day }: { day: DayIndex }) {
  const rows = useMemo(() => boardTop(day.batteries, 4), [day.batteries]);
  return (
    <Pane area="fleet" title="Fleet Board" meta={`${formatInt(day.leafCount)} sealed plans · ${shortDay(day.operatingDay)}`} to="/fleet" toLabel="Fleet">
      <ol className="ov-board" aria-label="The board's first rows">
        {rows.map((b) => (
          <li key={b.resource}>
            <Link to={`/fleet/${encodeURIComponent(b.resource)}`} className="ov-board__row">
              <span className="ov-board__name">
                {plainName(b.resource) ?? b.resource}
                <span className="ov-board__hub">{hubLabel(b.hub)}</span>
              </span>
              <span className="ov-board__mw num">{formatInt(Math.round(b.powerMw))} MW</span>
              <Strip scheduleMw={b.scheduleMw} powerMw={b.powerMw} width={84} height={18} />
            </Link>
          </li>
        ))}
      </ol>
      <p className="ov-pane__note">One bar an hour: discharge up, charge down.</p>
    </Pane>
  );
}

function NessPane() {
  const location = useLocation();
  const navigate = useNavigate();
  const open = (id: string | null) =>
    navigate({ pathname: location.pathname, search: askSearch(location.search, id), hash: location.hash }, { state: { ness: 1 } });
  return (
    <Pane area="ness" title="Ask Ness" meta="Prepared answers">
      <p className="ov-pane__line">Answers from the record, each linked to what it rests on.</p>
      <ul className="ov-ness">
        {NESS_QUESTIONS.map((q) => (
          <li key={q.id}>
            <button type="button" className="ov-ness__q" onClick={() => open(q.id)}>
              {q.question}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="ov-pane__open" onClick={() => open(null)}>
        All questions
        <Glyph name="next" />
      </button>
    </Pane>
  );
}

export function ControlRoom() {
  const all = combine(useDay(), useReceipts());
  const ready = all.status === "ready" ? all.data : null;
  const day = ready?.[0] ?? null;
  const seal = ready ? sealOf(ready[1].receipts) : null;
  const head = <PageHeader className="ov-room__head" title="Overview" lede="Tomorrow's plan for every Texas battery with complete public data, sealed on BNB Chain before the market closes." />;
  const parts = {
    seal: day && seal ? <SealPane day={day} seal={seal} /> : null,
    verify: day ? <VerifyPane day={day} /> : null,
    fleet: day ? <FleetPane day={day} /> : null,
    ness: NESS_IN_BUILD ? <NessPane /> : undefined,
  };
  // The panes stand down the stage's two sides, its middle left to the 3D; a phone reads them in order under it. From
  // 1000px of room the same parts are dock panes in that arrangement (RoomBand.tsx). The stage comes after them in the
  // page's order, so the keyboard reaches the panes before the stack's pieces.
  return (
    <section className="ov-room" data-atmosphere="dark" aria-label="Control room">
      <RoomBand
        head={head}
        parts={parts}
        stacked={
          <div className="ov-room__panes">
            <div className="ov-room__side ov-room__side--left">
              {head}
              {parts.seal}
              {parts.verify}
            </div>
            <div className="ov-room__side ov-room__side--right">
              {parts.fleet}
              {parts.ness}
            </div>
          </div>
        }
      />
      <HomeStage settled={all.status !== "loading"} />
    </section>
  );
}
