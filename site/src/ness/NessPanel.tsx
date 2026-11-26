import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { dualTime } from "../lib/time";
import { Glyph } from "../ui/Glyph";
import { LogoChip, type ChipLogo } from "../ui/LogoChip";
import { ANSWERS, GROUPS, SPONSORS, START_HERE, type Answer, type Block, type LogoKey, type Source } from "./answers";
import { BrainHeader, brainCaption } from "./BrainHeader";
import { filterByQuery, hostOf, isExternal, splitTimes, writeAsk } from "./logic";
import { NessMark } from "./NessMark";
import "./ness.css";

// Ask Ness's panel. Ness is Wattness's one AI system; this site has no server,
// model or sign-in, so here Ness gives prepared answers from the record, and
// the panel says so in its first line. A modal dialog: a glass panel at the
// right on a desktop (wider on request), a sheet from the bottom on a phone.
// Esc or the close button leaves; focus stays inside while it is open; the
// page behind keeps its place.

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

function Question({ answer, onShow }: { answer: Answer; onShow: (id: string) => void }) {
  return (
    <li>
      <button type="button" className="ness__q" onClick={() => onShow(answer.id)}>
        <span className="ness__q-text">{answer.question}</span>
        <Glyph name="next" />
      </button>
    </li>
  );
}

function Questions({
  query,
  logos,
  onShow,
  onClear,
}: {
  query: string;
  logos: Partial<Record<LogoKey, ChipLogo>> | null;
  onShow: (id: string) => void;
  onClear: () => void;
}) {
  const shown = useMemo(() => filterByQuery(ANSWERS, query, searchText), [query]);
  if (shown.length === 0)
    return (
      <div className="ness__none" role="status">
        <p>No prepared answer matches “{query.trim()}”.</p>
        <button type="button" className="btn" onClick={onClear}>
          Show every question
        </button>
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
              <Question key={a.id} answer={a} onShow={onShow} />
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
                        <Question key={a.id} answer={a} onShow={onShow} />
                      ))}
                    </ul>
                  </div>
                );
              })
            ) : (
              <ul className="ness__qs">
                {inGroup.map((a) => (
                  <Question key={a.id} answer={a} onShow={onShow} />
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

export default function NessPanel({ open, id, onShow, onList, onClose, onLeave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState("");
  const [wide, setWide] = useState(false);
  const logos = useLogos();
  const live = useRef({ onClose });
  live.current = { onClose };

  // The Memory tab draws the brains itself: there the header keeps its still, so one stage runs at a time.
  const onMemory = useLocation().pathname.startsWith("/agents/memory");
  const answer = id ? (ANSWERS.find((a) => a.id === id) ?? null) : null;
  const missing = id !== null && answer === null;
  const caption = brainCaption(answer?.brainPage ?? null);

  // The address opens and closes the modal; the page keeps its place under it.
  useLayoutEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const html = document.documentElement;
    if (open && !d.open) {
      html.dataset.nessOpen = "1";
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      delete html.dataset.nessOpen;
    }
  }, [open]);
  useEffect(
    () => () => {
      dialog.current?.close();
      delete document.documentElement.dataset.nessOpen;
    },
    [],
  );

  // Each view starts at its top, with focus on what it shows: the answer's question, or the search.
  useLayoutEffect(() => {
    if (!open) return;
    body.current?.scrollTo({ top: 0 });
    const fine = window.matchMedia?.("(pointer: fine)").matches ?? true;
    const target = answer ? answerHeading.current : fine ? search.current : title.current;
    target?.focus({ preventScroll: true });
  }, [open, answer]);

  // Esc leaves; Tab stays inside the panel.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      live.current.onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
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
    d.addEventListener("cancel", onCancel);
    d.addEventListener("keydown", onKey);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("keydown", onKey);
    };
  }, []);

  const clear = useCallback(() => {
    setQuery("");
    search.current?.focus();
  }, []);

  let view: ReactNode;
  if (answer) view = <AnswerView answer={answer} headingRef={answerHeading} onList={onList} onLeave={onLeave} />;
  else
    view = (
      <>
        {missing && (
          <p className="ness__missing" role="status">
            That link names no answer here. Every question is below.
          </p>
        )}
        <Questions query={query} logos={logos} onShow={onShow} onClear={clear} />
      </>
    );

  return createPortal(
    <dialog
      ref={dialog}
      id="ness-panel"
      className="ness"
      aria-labelledby="ness-title"
      aria-describedby="ness-creed"
      onMouseDown={(e) => {
        // A press on the dim around the panel closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ness__panel" data-wide={wide || undefined}>
        <header className="ness__head" data-atmosphere="dark">
          <BrainHeader lit={answer?.brainPage ?? null} live={open && !onMemory} />
          <div className="ness__bar">
            <NessMark size={24} />
            <h2 className="ness__title" id="ness-title" tabIndex={-1} ref={title}>
              Ask Ness
            </h2>
            <button
              type="button"
              className="ness__icon ness__wide"
              onClick={() => setWide((w) => !w)}
              aria-pressed={wide}
              title={wide ? "Narrower panel" : "Wider panel"}
              aria-label={wide ? "Narrower panel" : "Wider panel"}
            >
              <Glyph name={wide ? "collapse" : "expand"} />
            </button>
            <button type="button" className="ness__icon" onClick={onClose} title="Close (Esc)" aria-label="Close Ask Ness">
              <Glyph name="close" />
            </button>
          </div>
          <p className="ness__caption">
            <span className="ness__caption-text">
              {caption.lead}
              {caption.page && (
                <>
                  : <b>{caption.page}</b>
                  <span className="ness__caption-brain">, {caption.brain}</span>
                </>
              )}
            </span>
            <Link
              className="ness__caption-link"
              to={answer?.brainPage ? { pathname: "/agents/memory", search: `?page=${answer.brainPage}` } : "/agents/memory"}
              onClick={onLeave}
            >
              {caption.page ? "Open it in Memory" : "Open Memory"}
              <Glyph name="next" />
            </Link>
          </p>
        </header>
        <p className="ness__creed" id="ness-creed">
          Prepared answers from the record. Each links to what it rests on.
        </p>
        {!answer && (
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
        )}
        <div className="ness__body" ref={body}>
          {view}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
