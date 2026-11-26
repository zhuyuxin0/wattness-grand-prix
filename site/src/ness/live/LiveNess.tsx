import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Glyph } from "../../ui/Glyph";
import { hostOf } from "../logic";
import { cleanQuestion, linkTarget, memoryLinks, paragraphs, QUESTION_MAX, sendsOnEnter, SLOW_MS, type LiveLink, type Turn } from "./logic";
import type { LiveNess } from "./useLiveNess";
import "./live.css";

// Ask Ness live, under the prepared questions: the thread (LiveThread, after the questions in their list) and the
// input (LiveComposer, at the foot of the questions' column: held at the panel's bottom beside the page, floating and
// on a phone; under the list in full screen). Answers read as the prepared ones do: the panel's paragraphs, then
// What it rests on with the links, a page of this site opening beside the panel, anything else in a new tab.

function Waiting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <p className="ness-live__line ness-live__wait">
      {slow ? "Ness is still reading the record" : "Ness is reading the record"}
      <span className="ness-live__dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </p>
  );
}

function LinkRow({ link, onLeave }: { link: LiveLink; onLeave: () => void }) {
  const at = linkTarget(link.url);
  if (!at) return null;
  if ("to" in at)
    return (
      <Link className="ness__src" to={at.to} onClick={onLeave}>
        <span className="ness__src-label">{link.label}</span>
        <span className="ness__src-where">on this site</span>
        <Glyph name="next" />
      </Link>
    );
  return (
    <a className="ness__src" href={at.href} target="_blank" rel="noopener noreferrer">
      <span className="ness__src-label">{link.label}</span>
      <span className="ness__src-where">{hostOf(at.href)}</span>
      <Glyph name="popout" />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function LiveTurn({ turn, live, onLeave }: { turn: Turn; live: LiveNess; onLeave: () => void }) {
  const a = turn.answer;
  const rests = a ? [...a.links, ...memoryLinks(a)] : [];
  return (
    <article className="ness-live__turn" id={`ness-live-t-${turn.id}`} aria-labelledby={`ness-live-q-${turn.id}`} data-state={turn.state}>
      <h4 className="ness-live__q" id={`ness-live-q-${turn.id}`}>
        {turn.question}
      </h4>
      {turn.state === "waiting" && <Waiting />}
      {turn.state === "answered" && a && (
        <>
          {paragraphs(a.text).map((p, i) => (
            <p key={i} className="ness__p">
              {p}
            </p>
          ))}
          {rests.length > 0 && (
            <>
              <h5 className="ness__rests">What it rests on</h5>
              <ul className="ness__sources">
                {rests.map((l) => (
                  <li key={l.url}>
                    <LinkRow link={l} onLeave={onLeave} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {(turn.state === "failed" || turn.state === "stopped" || turn.state === "limited") && (
        <div className="ness-live__note">
          <p className="ness-live__line">{turn.line}</p>
          <button type="button" className="btn" onClick={() => live.retry(turn.id)} disabled={live.waiting || live.hold !== null}>
            <Glyph name="refresh" />
            Try again
          </button>
        </div>
      )}
    </article>
  );
}

/** The questions asked here and their answers, after the prepared ones; the newest is brought into view as it is
 *  asked, as its answer comes in, and as the panel changes mode. */
export function LiveThread({ live, mode, onLeave }: { live: LiveNess; mode: string; onLeave: () => void }) {
  const last = live.thread[live.thread.length - 1];
  const lastId = last?.id;
  const lastState = last?.state;
  useEffect(() => {
    if (lastId === undefined) return;
    const el = document.getElementById(`ness-live-t-${lastId}`);
    if (!el || el.getClientRects().length === 0) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // A new question glides in; its answer, the line in its place or a new mode comes at once, so a reply that lands
    // mid-glide (a refusal can) still ends in view.
    el.scrollIntoView({ block: "nearest", behavior: still || lastState !== "waiting" ? "auto" : "smooth" });
  }, [lastId, lastState, mode]);
  if (live.thread.length === 0) return null;
  return (
    <section className="ness-live" aria-labelledby="ness-live-head">
      <h3 className="ness__group-head" id="ness-live-head">
        Asked live
      </h3>
      {live.thread.map((t) => (
        <LiveTurn key={t.id} turn={t} live={live} onLeave={onLeave} />
      ))}
    </section>
  );
}

/** What a screen reader hears of the newest question: Ness at work, its answer in, or the line in its place. */
function announcement(live: LiveNess): string {
  const last = live.thread[live.thread.length - 1];
  if (!last) return "";
  if (last.state === "waiting") return "Ness is reading the record.";
  if (last.state === "answered") return "Ness answered.";
  return last.line ?? "";
}

/** The input: Enter asks, Shift+Enter is a new line; while Ness answers, Stop; while the service asks for a wait, its
 *  own line in place of the hint. */
export function LiveComposer({ live }: { live: LiveNess }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const { draft, waiting, hold } = live;
  const canSend = !waiting && hold === null && cleanQuestion(draft).length > 0;
  const left = QUESTION_MAX - draft.length;

  // The box grows with the question, up to about five lines.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 132)}px`;
  }, [draft]);

  return (
    <form
      className="ness-live__ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) live.send();
      }}
    >
      <div className="ness-live__box">
        <textarea
          ref={box}
          className="ness-live__input"
          rows={1}
          value={draft}
          maxLength={QUESTION_MAX}
          placeholder="Ask Ness about the Grand Prix"
          aria-label="Ask Ness about the Grand Prix"
          aria-describedby="ness-live-how"
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => live.setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (!sendsOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode })) return;
            e.preventDefault();
            if (canSend) live.send();
          }}
        />
        {/* Two buttons, keyed: a click on Stop must not land on Ask in its place, which would send the draft. */}
        {waiting ? (
          <button
            key="stop"
            type="button"
            className="btn ness-live__act"
            onClick={() => {
              live.stop();
              box.current?.focus();
            }}
          >
            Stop
          </button>
        ) : (
          <button key="ask" type="submit" className="btn btn--primary ness-live__act" disabled={!canSend}>
            Ask
          </button>
        )}
      </div>
      <p className="ness-live__how" id="ness-live-how" data-hold={hold ? "" : undefined} data-keys={!hold && left > 100 ? "" : undefined}>
        {hold ? hold.line : left <= 100 ? `${left} ${left === 1 ? "character" : "characters"} left` : "Enter to ask, Shift+Enter for a new line"}
      </p>
      <p className="visually-hidden" role="status">
        {announcement(live)}
      </p>
    </form>
  );
}
