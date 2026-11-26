import { Component, Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { combine, useDay, useReceipts, type BatterySummary, type ChainReceipt, type DayIndex } from "../../data";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { dualTime } from "../../lib/time";
import { GRID_CLOSE, StartingGrid } from "../../scenes";
import { BATTERY_NAMES, Glyph, Hash, PageHeader } from "../../ui";
import { StartHere } from "../Intro/StartHere";
import { Strip } from "../Fleet/Strip";
import { hubLabel, plainName } from "../Fleet/names";
import { LOOP, NESS_QUESTIONS, askSearch, boardTop, findBatteries, sealOf, verifyPath } from "./room";
import { RoomBand } from "./RoomBand";
import "./control-room.css";

// The control room: the Overview's first view, the Terminal's home. Behind it the Tech Stack's 3D in motion, a
// seamless 12 s loop rendered by packages/world's loop lab (public/home/tech-landscape.json says how), muted, inline,
// playing only while on screen; with reduced motion or Save-Data only its first frame shows. Over it, glass panes
// placed round the landscape, each a small live preview that opens its tab: the latest seal, a battery search that
// opens Verify, the Fleet board's first rows, the closing morph of the introduction (Wattness into BNB Chain's seal),
// Ask Ness's prepared questions (in a build that has Ask Ness), and "Start where you are". The first paint loads no
// three.js: the morph's scene is fetched once the page is idle and the pane nears the screen.

const media = (file: string) => `${import.meta.env.BASE_URL}home/${file}`;

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

/** Whether the element is on screen (rootMargin widens the screen); without IntersectionObserver, always. */
function useOnScreen(ref: RefObject<Element>, rootMargin = "0px", threshold = 0): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setOn(entries.some((e) => e.isIntersecting)), { rootMargin, threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, threshold]);
  return on;
}

/** The landscape behind the panes: the loop while on screen and the tab is shown, its first frame otherwise. */
function Landscape() {
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const still = reduced || saveData();
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(box, "0px", 0.05);
  useEffect(() => {
    const v = video.current;
    if (!v || still) return;
    const sync = () => {
      if (onScreen && !document.hidden) v.play().catch(() => undefined);
      else v.pause();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [onScreen, still]);
  const poster = media(LOOP.files.poster);
  return (
    <div ref={box} className="ov-room__media" aria-hidden="true">
      {still ? (
        <img className="ov-room__still" src={poster} alt="" width={LOOP.width} height={LOOP.height} decoding="async" {...{ fetchpriority: "high" }} />
      ) : (
        <video ref={video} className="ov-room__loop" poster={poster} width={LOOP.width} height={LOOP.height} muted loop playsInline preload="auto" tabIndex={-1} disablePictureInPicture>
          <source src={media(LOOP.files.webm)} type='video/webm; codecs="vp9"' />
          <source src={media(LOOP.files.mp4)} type="video/mp4" />
        </video>
      )}
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

/** A scene that fails takes only its own box. */
class Contain extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The introduction's close, as on the Intro's last band: the sealed plans leave the grid for the Wattness mark while
 *  the root's ring becomes BNB Chain's. It plays when it comes on screen and rewinds once off it. */
function MorphPane() {
  const stage = useRef<HTMLDivElement>(null);
  const idle = useIdle();
  const near = useOnScreen(stage, "25% 0px 25% 0px");
  const inView = useOnScreen(stage, "0px", 0.6);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (idle && near) setMounted(true);
  }, [idle, near]);
  return (
    <Pane area="morph" title="Sealed on BNB Chain" to="/seal" toLabel="Seal">
      <div ref={stage} className="ov-morph" data-atmosphere="dark">
        {mounted && (
          <Contain>
            <Suspense fallback={null}>
              <StartingGrid name="ov-morph" hud={false} playback="once" from={GRID_CLOSE - 0.8} hold={!inView} />
            </Suspense>
          </Contain>
        )}
      </div>
      <p className="ov-pane__line">Every plan of the day, under one root.</p>
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
    morph: <MorphPane />,
    fleet: day ? <FleetPane day={day} /> : null,
    ness: NESS_IN_BUILD ? <NessPane /> : undefined,
    start: <StartHere id="ov-start" />,
  };
  // Two sides round the landscape's middle, Ask Ness under it, and the visitors' ways in along its foot; a phone reads
  // them in order. From 1000px of room the same parts are dock panes in that arrangement (RoomBand.tsx).
  return (
    <section className="ov-room" data-atmosphere="dark" aria-label="Control room">
      <Landscape />
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
              {parts.morph}
              {parts.fleet}
            </div>
            {parts.ness}
            <div className="ov-room__start">{parts.start}</div>
          </div>
        }
      />
    </section>
  );
}
