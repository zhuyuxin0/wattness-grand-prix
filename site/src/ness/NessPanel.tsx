import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { dualTime } from "../lib/time";
import { Glyph } from "../ui/Glyph";
import { LogoChip, type ChipLogo } from "../ui/LogoChip";
import { ANSWERS, GROUPS, SPONSORS, START_HERE, type Answer, type Block, type LogoKey, type Source } from "./answers";
import { NessBrain, brainCaption } from "./BrainHeader";
import {
  besideLayout,
  clampWidth,
  defaultFloat,
  FRAME_KEY,
  inDockZone,
  keepInView,
  PHONE_MAX,
  pulled,
  readFrame,
  stepDown,
  WIDTH,
  writeFrame,
  type FloatRect,
  type FrameState,
  type NessMode,
} from "./frame";
import { LiveComposer, LiveThread } from "./live/LiveNess";
import { useLiveNess } from "./live/useLiveNess";
import { filterByQuery, hostOf, isExternal, litPages, splitTimes, writeAsk } from "./logic";
import { NessMark } from "./NessMark";
import "./ness.css";

// Ask Ness's panel. Ness is Wattness's one AI system. Here it answers in two
// layers, and the panel says both under its name: prepared answers, checked
// against the record ahead of time, and, under them, a question of the
// reader's own, answered live by Ness's service on Azure (live/: no sign-in,
// no cookie, the thread kept in memory only). Its frame is wattness.tech's Ness window
// (frame.ts): beside the page, a column at the right that the page narrows
// for (or that covers the page where it has no room); floating, a window
// dragged by its header and sized from its corner; or full screen, over the
// whole view with the questions at its left, the page under it inert. The
// header's buttons change the mode, Esc steps down one (full screen to the
// reader's other mode, the others to the launcher). A phone keeps the sheet
// from the bottom, modal as full screen is. Living Brain's three brains stand
// in the middle of the chat: large over the questions (the conversation's
// backdrop in full screen), smaller beside or above an answer, lighting the
// pages it rests on.

const TABBABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What Tab can reach inside the panel: shown, and outside the header's live stage, which is a picture (inert). */
function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => !el.hidden && el.getClientRects().length > 0 && !el.closest("[inert]") && getComputedStyle(el).visibility !== "hidden",
  );
}

/** What the search reads of an answer: its question, its prose, its sponsor and the words it is known by. */
function searchText(a: Answer): string {
  const sponsor = a.sponsor ? (SPONSORS.find((s) => s.id === a.sponsor)?.label ?? "") : "";
  const prose = a.body.map((b) => (typeof b === "string" ? b : "list" in b ? b.list.join(" ") : "")).join(" ");
  return [a.question, sponsor, prose.replace(/\{t:\d+\}/g, " "), ...(a.keywords ?? [])].join(" ");
}

/**
 * A time in an answer: CT, then the reader's own in brackets (with its date when the reader's day differs). A time
 * the record gives to the minute (a whole minute here) is shown to the minute.
 */
function Clock({ unix }: { unix: number }) {
  const seconds = unix % 60 !== 0;
  const t = dualTime(unix, { date: false, seconds });
  const dated = dualTime(unix, { seconds });
  const sameDay = dated.ct.slice(0, dated.ct.lastIndexOf(",")) === dated.yours?.slice(0, dated.yours.lastIndexOf(","));
  return (
    <>
      <span className="num">{t.ct}</span>
      {t.yours && <span className="num ness__yours"> ({sameDay ? t.yours : dated.yours})</span>}
    </>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <>
      {splitTimes(text).map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <Clock key={i} unix={p.unix} />))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (typeof block === "string")
    return (
      <p className="ness__p">
        <Prose text={block} />
      </p>
    );
  if ("code" in block)
    return (
      <pre className="ness__code">
        <code>{block.code}</code>
      </pre>
    );
  return (
    <ul className="ness__list">
      {block.list.map((item) => (
        <li key={item}>
          <Prose text={item} />
        </li>
      ))}
    </ul>
  );
}

function SourceLink({ source, onLeave }: { source: Source; onLeave: () => void }) {
  if (isExternal(source.href))
    return (
      <a className="ness__src" href={source.href} target="_blank" rel="noopener noreferrer">
        <span className="ness__src-label">{source.label}</span>
        <span className="ness__src-where">{hostOf(source.href)}</span>
        <Glyph name="popout" />
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    );
  return (
    <Link className="ness__src" to={source.href} onClick={onLeave}>
      <span className="ness__src-label">{source.label}</span>
      <span className="ness__src-where">on this site</span>
      <Glyph name="next" />
    </Link>
  );
}

/** The owners' logos, from the world package's registry, once its chunk is in. */
function useLogos(): Partial<Record<LogoKey, ChipLogo>> | null {
  const [logos, setLogos] = useState<Partial<Record<LogoKey, ChipLogo>> | null>(null);
  useEffect(() => {
    let live = true;
    import("@world/kit/logos").then(
      (m) => {
        if (live) setLogos(m.LOGOS);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return logos;
}

function Question({ answer, current, onShow }: { answer: Answer; current: string | null; onShow: (id: string) => void }) {
  return (
    <li>
      <button type="button" className="ness__q" aria-current={answer.id === current || undefined} onClick={() => onShow(answer.id)}>
        <span className="ness__q-text">{answer.question}</span>
        <Glyph name="next" />
      </button>
    </li>
  );
}

function Questions({
  query,
  logos,
  current,
  onShow,
  onClear,
  onAsk,
}: {
  query: string;
  logos: Partial<Record<LogoKey, ChipLogo>> | null;
  /** The answer open beside the list (full screen), marked in it. */
  current: string | null;
  onShow: (id: string) => void;
  onClear: () => void;
  /** Asks the search's words live, when Ness can take a question now. */
  onAsk?: (text: string) => void;
}) {
  const shown = useMemo(() => filterByQuery(ANSWERS, query, searchText), [query]);
  if (shown.length === 0)
    return (
      <div className="ness__none" role="status">
        <p>No prepared answer matches “{query.trim()}”.</p>
        <div className="ness__none-acts">
          <button type="button" className="btn" onClick={onClear}>
            Show every question
          </button>
          {onAsk && (
            <button type="button" className="btn" onClick={() => onAsk(query)}>
              Ask Ness live
            </button>
          )}
        </div>
      </div>
    );
  const jump = (id: string) => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    document.getElementById(`ness-s-${id}`)?.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  };
  const start = query.trim() ? [] : START_HERE.flatMap((id) => ANSWERS.filter((a) => a.id === id));
  return (
    <div className="ness__groups">
      {start.length > 0 && (
        <section className="ness__group ness__group--start" aria-labelledby="ness-g-start">
          <h3 className="ness__group-head" id="ness-g-start">
            Start here
          </h3>
          <ul className="ness__qs">
            {start.map((a) => (
              <Question key={a.id} answer={a} current={current} onShow={onShow} />
            ))}
          </ul>
        </section>
      )}
      {GROUPS.map((g) => {
        const inGroup = shown.filter((a) => a.group === g.id);
        if (inGroup.length === 0) return null;
        return (
          <section key={g.id} className="ness__group" aria-labelledby={`ness-g-${g.id}`}>
            <h3 className="ness__group-head" id={`ness-g-${g.id}`}>
              {g.label}
            </h3>
            {g.id === "sponsors" && logos && !query.trim() && (
              <nav className="ness__jumps" aria-label="Sponsors">
                {SPONSORS.map((s) => {
                  const chips = s.logos.map((k) => logos[k]).filter((l): l is ChipLogo => !!l);
                  return chips.length > 0 ? (
                    <button key={s.id} type="button" className="ness__jump" onClick={() => jump(s.id)} aria-label={`Questions on ${s.label}`} title={`Questions on ${s.label}`}>
                      <LogoChip logo={chips} size={12} link={false} />
                    </button>
                  ) : null;
                })}
              </nav>
            )}
            {g.id === "sponsors" ? (
              SPONSORS.map((s) => {
                const items = inGroup.filter((a) => a.sponsor === s.id);
                if (items.length === 0) return null;
                return (
                  <div key={s.id} className="ness__sponsor" id={`ness-s-${s.id}`}>
                    <div className="ness__sponsor-head">
                      <h4 className="ness__sponsor-name">{s.label}</h4>
                    </div>
                    <ul className="ness__qs">
                      {items.map((a) => (
                        <Question key={a.id} answer={a} current={current} onShow={onShow} />
                      ))}
                    </ul>
                  </div>
                );
              })
            ) : (
              <ul className="ness__qs">
                {inGroup.map((a) => (
                  <Question key={a.id} answer={a} current={current} onShow={onShow} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CopyLink({ id }: { id: string }) {
  const { pathname, search } = useLocation();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const url = `${window.location.origin}${pathname}${writeAsk(search, { open: true, id })}`;
  useEffect(() => setState("idle"), [id]);
  return (
    <div className="ness__share">
      <button
        type="button"
        className="btn"
        onClick={() => {
          const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
          if (!clip) {
            setState("failed");
            return;
          }
          clip.writeText(url).then(
            () => setState("copied"),
            () => setState("failed"),
          );
        }}
      >
        {state === "copied" ? <Glyph name="check" /> : null}
        {state === "copied" ? "Link copied" : "Copy a link to this answer"}
      </button>
      {state === "failed" && (
        <input className="ness__share-url" readOnly value={url} aria-label="This answer's link" onFocus={(e) => e.currentTarget.select()} />
      )}
    </div>
  );
}

function AnswerView({ answer, headingRef, onList, onLeave }: { answer: Answer; headingRef: Ref<HTMLHeadingElement>; onList: () => void; onLeave: () => void }) {
  const where = answer.sponsor ? SPONSORS.find((s) => s.id === answer.sponsor)?.label : GROUPS.find((g) => g.id === answer.group)?.label;
  return (
    <article className="ness__answer" aria-labelledby="ness-answer-q">
      <button type="button" className="ness__back" onClick={onList}>
        <Glyph name="prev" />
        Every question
      </button>
      <p className="eyebrow ness__where">{where}</p>
      <h3 className="ness__question" id="ness-answer-q" tabIndex={-1} ref={headingRef}>
        {answer.question}
      </h3>
      {answer.body.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
      <h4 className="ness__rests">What it rests on</h4>
      <ul className="ness__sources">
        {answer.sources.map((s) => (
          <li key={s.href}>
            <SourceLink source={s} onLeave={onLeave} />
          </li>
        ))}
      </ul>
      <CopyLink id={answer.id} />
    </article>
  );
}

interface Props {
  /** The address holds the panel (?ask=). */
  open: boolean;
  /** The answer it names, or null for the questions. */
  id: string | null;
  onShow: (id: string) => void;
  onList: () => void;
  onClose: () => void;
  /** A link on this site was followed: the panel goes with the address, and focus goes to the page. */
  onLeave: () => void;
}

/** The frame kept in this browser; a private window or blocked storage opens the default. */
function loadFrame(): FrameState {
  try {
    return readFrame(window.localStorage.getItem(FRAME_KEY));
  } catch {
    return readFrame(null);
  }
}

/** The view's size, followed as it changes. */
function useViewport(): { vw: number; vh: number } {
  const [size, setSize] = useState(() => ({ vw: window.innerWidth, vh: window.innerHeight }));
  useEffect(() => {
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setSize((s) => (s.vw === window.innerWidth && s.vh === window.innerHeight ? s : { vw: window.innerWidth, vh: window.innerHeight }));
      });
    };
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("resize", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return size;
}

/** The masthead's foot: where the column starts and a new window first floats. */
function mastheadFoot(): number {
  return Math.round(document.querySelector(".masthead")?.getBoundingClientRect().bottom ?? 40);
}

/** A press on one of the header's controls is the control's, not a drag. */
const onControl = (e: ReactPointerEvent<HTMLElement>) => e.button !== 0 || !!(e.target as HTMLElement).closest("button, a, input, textarea");

/** A pointer drag from `e`, reporting each move from where it pressed, until it is let go. */
function track(e: ReactPointerEvent<HTMLElement>, move: (dx: number, dy: number, ev: PointerEvent) => void, done?: (ev: PointerEvent) => void): void {
  e.preventDefault();
  const el = e.currentTarget;
  const sx = e.clientX;
  const sy = e.clientY;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // a pointer the page no longer holds
  }
  const html = document.documentElement;
  html.dataset.nessDrag = "";
  const step = (ev: PointerEvent) => move(ev.clientX - sx, ev.clientY - sy, ev);
  const end = (ev: PointerEvent) => {
    el.removeEventListener("pointermove", step);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    delete html.dataset.nessDrag;
    done?.(ev);
  };
  el.addEventListener("pointermove", step);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

export default function NessPanel({ open, id, onShow, onList, onClose, onLeave }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const read = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState("");
  const [frame, setFrame] = useState<FrameState>(loadFrame);
  const [full, setFull] = useState(false);
  const [zone, setZone] = useState(false);
  const { vw, vh } = useViewport();
  const logos = useLogos();
  const live = useRef({ onClose });
  live.current = { onClose };

  const phone = vw <= PHONE_MAX;
  const mode: NessMode = full && !phone ? "full" : frame.mode;
  // Full screen and the phone's sheet hold the keyboard, with the page under them inert; beside and floating, the
  // page stays the reader's.
  const modal = phone || mode === "full";
  const beside = besideLayout(vw, frame.width);
  const top = mastheadFoot();
  const rect: FloatRect = keepInView(frame.float ?? defaultFloat(vw, vh, top), vw, vh);

  // The Memory tab draws the brains itself: there the panel keeps the still, so one stage runs at a time.
  const onMemory = useLocation().pathname.startsWith("/agents/memory");
  const answer = id ? (ANSWERS.find((a) => a.id === id) ?? null) : null;
  const missing = id !== null && answer === null;
  // A prepared answer lights its page; with none open, the latest live answer lights the pages it rests on, its own
  // page first, named as Living Brain titles them.
  const liveNess = useLiveNess();
  const liveLight = liveNess.light;
  const lit = useMemo(() => (answer ? litPages(answer.brainPage ?? null) : litPages(null, liveLight?.pages)), [answer, liveLight]);
  const titles = answer ? undefined : liveLight?.titles;
  const caption = brainCaption(lit, titles);

  // The frame is kept in this browser as it rests (a drag moves it every frame).
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(FRAME_KEY, writeFrame(frame));
      } catch {
        // a private window keeps the frame for this page only
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [frame]);

  // Full screen is a moment: closing the panel ends it.
  useEffect(() => {
    if (!open) setFull(false);
  }, [open]);

  // The page under the panel: locked and inert under full screen and the sheet; beside, narrowed for the column where
  // it keeps room (html[data-ness-beside="narrow"], ness.css), covered where it does not.
  const besideMode = open && !phone && mode === "beside";
  const narrows = besideMode && beside.narrows;
  useLayoutEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    html.dataset.nessOpen = modal ? "modal" : mode;
    if (besideMode) {
      html.dataset.nessBeside = narrows ? "narrow" : "over";
      html.style.setProperty("--ness-w", `${beside.width}px`);
    }
    return () => {
      delete html.dataset.nessOpen;
      delete html.dataset.nessBeside;
      html.style.removeProperty("--ness-w");
    };
  }, [open, modal, mode, besideMode, narrows, beside.width]);
  useEffect(() => {
    if (!open || !modal) return;
    const layer = panel.current?.closest<HTMLElement>(".ness");
    const others = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== layer && el.tagName !== "SCRIPT");
    const prior = others.map((el) => el.inert);
    for (const el of others) el.inert = true;
    return () => others.forEach((el, i) => (el.inert = prior[i] ?? false));
  }, [open, modal]);
  // The page's own floating panes and charts measure again once the column settles (wattness.tech's Ness does too).
  const side = narrows ? beside.width : 0;
  useEffect(() => {
    const t = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 140);
    return () => window.clearTimeout(t);
  }, [side]);

  // Each view starts at its top, with focus on what it shows: the answer's question, or the search. Full screen keeps
  // the questions where the reader left them, beside the answer.
  useLayoutEffect(() => {
    if (!open) return;
    if (mode === "full") read.current?.scrollTo({ top: 0 });
    else main.current?.scrollTo({ top: 0 });
    const fine = window.matchMedia?.("(pointer: fine)").matches ?? true;
    const target = answer ? answerHeading.current : fine ? search.current : title.current;
    target?.focus({ preventScroll: true });
    // A change of mode keeps the view and the focus where they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, answer]);

  // Full screen's columns scroll on their own: the chat body's scroll from beside or floating is let go as it opens,
  // so the columns start in view.
  useLayoutEffect(() => {
    if (mode === "full") main.current?.scrollTo({ top: 0 });
  }, [mode]);

  // Esc steps down: a search with words clears first; full screen goes back to the reader's other mode; otherwise the
  // panel closes to its launcher. Tab stays inside while the panel is modal.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const d = panel.current;
    if (!d) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === search.current && query) {
        setQuery("");
        return;
      }
      const next = stepDown(mode, frame.mode);
      if (next === "closed") live.current.onClose();
      else setFull(false);
      return;
    }
    if (e.key !== "Tab" || !modal) return;
    const items = tabbables(d);
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (!first || !last) {
      e.preventDefault();
    } else if (e.shiftKey && (at === first || !d.contains(at))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (at === last || !d.contains(at))) {
      e.preventDefault();
      first.focus();
    }
  };

  // The header moves a window (not from its buttons), and pulled a few pixels it brings the column away as one, under
  // the pointer; let go at the right edge, the window goes back beside the page. The corner sizes the window; the
  // column's left edge sets its width.
  const onHeadDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (phone || mode === "full" || onControl(e)) return;
    const from = mode;
    let start = rect;
    let floating = from === "float";
    let off = { x: e.clientX - rect.x, y: e.clientY - rect.y };
    track(
      e,
      (dx, dy, ev) => {
        if (!floating) {
          if (!pulled(dx, dy)) return;
          floating = true;
          off = { x: 48, y: 18 };
          start = keepInView({ x: ev.clientX - off.x, y: ev.clientY - off.y, w: 440, h: Math.min(680, window.innerHeight - 2 * 16) }, window.innerWidth, window.innerHeight);
          setFrame((f) => ({ ...f, mode: "float", float: start }));
          return;
        }
        setFrame((f) => ({ ...f, float: keepInView({ ...start, x: ev.clientX - off.x, y: ev.clientY - off.y }, window.innerWidth, window.innerHeight) }));
        setZone(inDockZone(ev.clientX, window.innerWidth));
      },
      (ev) => {
        setZone(false);
        if (floating && inDockZone(ev.clientX, window.innerWidth)) setFrame((f) => ({ ...f, mode: "beside" }));
      },
    );
  };
  const onCornerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const start = rect;
    track(e, (dx, dy) => setFrame((f) => ({ ...f, float: keepInView({ ...start, w: start.w + dx, h: start.h + dy }, window.innerWidth, window.innerHeight) })));
  };
  const onEdgeDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const start = beside.width;
    track(e, (dx) => setFrame((f) => ({ ...f, width: clampWidth(start - dx) })));
  };
  const onEdgeKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    const by = e.key === "ArrowLeft" ? 24 : e.key === "ArrowRight" ? -24 : 0;
    if (!by) return;
    e.preventDefault();
    setFrame((f) => ({ ...f, width: clampWidth(beside.width + by) }));
  };
  const setMode = (m: NessMode) => {
    if (m === "full") setFull(true);
    else {
      setFull(false);
      setFrame((f) => ({ ...f, mode: m }));
    }
  };

  const clear = useCallback(() => {
    setQuery("");
    search.current?.focus();
  }, []);

  let style: CSSProperties | undefined;
  if (!phone && mode === "float") style = { left: rect.x, top: rect.y, width: rect.w, height: rect.h };
  else if (!phone && mode === "beside") style = { top, width: beside.width };

  const view: ReactNode = answer ? (
    <div className="ness__read" ref={read}>
      <AnswerView answer={answer} headingRef={answerHeading} onList={onList} onLeave={onLeave} />
    </div>
  ) : null;

  return createPortal(
    <div className="ness" data-mode={phone ? "sheet" : mode} data-open={open || undefined}>
      {phone && open && <div className="ness__scrim" aria-hidden="true" onMouseDown={onClose} />}
      {zone && (
        <div className="ness__zone" style={{ width: beside.width, top }} aria-hidden="true">
          <span>Beside the page</span>
        </div>
      )}
      <div
        ref={panel}
        id="ness-panel"
        className="ness__panel"
        data-view={answer ? "answer" : "list"}
        data-over={(besideMode && !narrows) || undefined}
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby="ness-title"
        aria-describedby="ness-creed"
        hidden={!open}
        style={style}
        onKeyDown={onKeyDown}
      >
        <header className="ness__head" onPointerDown={onHeadDown}>
          <NessMark size={22} />
          <div className="ness__name">
            <h2 className="ness__title" id="ness-title" tabIndex={-1} ref={title}>
              Ask Ness
            </h2>
            <p className="ness__creed" id="ness-creed">
              Pick a question for an answer checked against the record, or ask Ness anything about the Grand Prix.
            </p>
          </div>
          <div className="ness__modes">
            {!phone && mode !== "full" && (
              <button
                type="button"
                className="ness__icon"
                aria-pressed={mode === "float"}
                aria-label={mode === "float" ? "Put Ask Ness beside the page" : "Float Ask Ness as a window"}
                title={mode === "float" ? "Beside the page" : "Float as a window you can move"}
                onClick={() => setMode(mode === "float" ? "beside" : "float")}
              >
                <Glyph name="popout" />
              </button>
            )}
            {!phone && (
              <button
                type="button"
                className="ness__icon"
                aria-label={mode === "full" ? "Exit full screen" : "Full screen"}
                title={mode === "full" ? "Exit full screen (Esc)" : "Full screen"}
                onClick={() => setMode(mode === "full" ? frame.mode : "full")}
              >
                <Glyph name={mode === "full" ? "collapse" : "expand"} />
              </button>
            )}
            <button type="button" className="ness__icon" onClick={onClose} title={mode === "full" ? "Minimize" : "Minimize (Esc)"} aria-label="Minimize Ask Ness">
              <Glyph name="minus" />
            </button>
          </div>
        </header>
        <div className="ness__main" ref={main}>
          <div className="ness__stage" data-atmosphere="dark">
            <NessBrain pages={lit} live={open && !onMemory} titles={titles} />
            <p className="ness__caption">
              <span className="ness__caption-text">
                {caption.lead}
                {caption.page && (
                  <>
                    : <b>{caption.page}</b>
                    <span className="ness__caption-brain">, {caption.brain}</span>
                    {caption.more > 0 && <span className="ness__caption-brain">, and {caption.more === 1 ? "one more page" : `${caption.more} more pages`}</span>}
                  </>
                )}
              </span>
              <Link
                className="ness__caption-link"
                to={lit[0] ? { pathname: "/agents/memory", search: `?page=${lit[0]}` } : "/agents/memory"}
                onClick={onLeave}
              >
                {caption.page ? "Open it in Memory" : "Open Memory"}
                <Glyph name="next" />
              </Link>
            </p>
            {mode === "full" && !answer && lit.length === 0 && <p className="ness__hint">Pick a question: the page its answer rests on lights up here.</p>}
          </div>
          <div className="ness__side">
            <div className="ness__find">
              <input
                ref={search}
                type="search"
                value={query}
                placeholder="Search the questions"
                aria-label="Search the questions"
                spellCheck={false}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="ness__list">
              {missing && (
                <p className="ness__missing" role="status">
                  That link names no answer here. Every question is below.
                </p>
              )}
              <Questions
                query={query}
                logos={logos}
                current={answer?.id ?? null}
                onShow={onShow}
                onClear={clear}
                onAsk={liveNess.waiting || liveNess.hold ? undefined : (text) => liveNess.send(text)}
              />
              <LiveThread live={liveNess} mode={phone ? "sheet" : mode} onLeave={onLeave} />
            </div>
            <LiveComposer live={liveNess} />
          </div>
          {view}
        </div>
        {!phone && mode === "float" && <div className="ness__corner" aria-hidden="true" onPointerDown={onCornerDown} />}
        {!phone && mode === "beside" && (
          <div
            className="ness__edge"
            role="separator"
            aria-orientation="vertical"
            aria-label="Width of Ask Ness"
            aria-valuemin={WIDTH.min}
            aria-valuemax={WIDTH.max}
            aria-valuenow={beside.width}
            tabIndex={0}
            onPointerDown={onEdgeDown}
            onKeyDown={onEdgeKey}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
