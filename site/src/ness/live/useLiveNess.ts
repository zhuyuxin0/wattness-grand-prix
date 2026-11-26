import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NESS_LIVE_URL } from "../../config";
import { addTurn, cleanQuestion, latestAnswer, readReply, requestBody, settle, STOPPED_LINE, WAIT_MS, type LiveAnswer, type Reply, type Turn } from "./logic";

// Ask Ness live: the thread the panel keeps while it is open on this page. It lives in memory only: no cookie, no
// storage, nothing in the address. A question goes out with the thread's last four answered turns and the reader's
// time zone, without credentials, and one at a time; Stop lets it go, Try again asks a stopped or failed one again in
// its place, and a refusal (429) holds the input for as long as the service asks.

/** The reader's time zone as the browser names it, so times come in CT with the reader's own beside them. */
function readerZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export interface LiveHold {
  /** When the input opens again (ms since the epoch). */
  until: number;
  /** The service's own words. */
  line: string;
}

export interface LiveNess {
  thread: Turn[];
  draft: string;
  setDraft: (text: string) => void;
  /** A question is out. */
  waiting: boolean;
  /** The service asked the reader to wait. */
  hold: LiveHold | null;
  /** Asks the draft, or the words given; false when nothing was sent (empty, a question out, a wait asked for). */
  send: (text?: string) => boolean;
  stop: () => void;
  retry: (id: number) => void;
  /** The latest answer, whose pages the stage lights. */
  light: LiveAnswer | null;
}

export function useLiveNess(): LiveNess {
  const [thread, setThread] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [hold, setHold] = useState<LiveHold | null>(null);
  const out = useRef<{ id: number; ctl: AbortController; stopped: boolean } | null>(null);
  const seq = useRef(0);
  const now = useRef({ thread, draft, hold });
  now.current = { thread, draft, hold };

  // The wait the service asked for ends on its own.
  useEffect(() => {
    if (!hold) return;
    const t = window.setTimeout(() => setHold(null), Math.max(0, hold.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [hold]);

  // A question still out when the panel goes is let go.
  useEffect(
    () => () => {
      out.current?.ctl.abort();
      out.current = null;
    },
    [],
  );

  const ask = useCallback(async (turn: Turn, before: readonly Turn[]) => {
    const ctl = new AbortController();
    const mine = { id: turn.id, ctl, stopped: false };
    out.current = mine;
    const timer = window.setTimeout(() => ctl.abort(), WAIT_MS);
    let reply: Reply = { kind: "failed" };
    try {
      const res = await fetch(`${NESS_LIVE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(turn.question, before, readerZone())),
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: ctl.signal,
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      reply = readReply(res.status, body);
    } catch {
      reply = { kind: "failed" };
    } finally {
      window.clearTimeout(timer);
      if (out.current === mine) out.current = null;
    }
    // Stop has already settled the turn.
    if (mine.stopped) return;
    setThread((t) => t.map((x) => (x.id === turn.id ? settle(x, reply) : x)));
    if (reply.kind === "limit") setHold({ until: Date.now() + reply.retryAfter * 1000, line: reply.line });
  }, []);

  const held = () => {
    const h = now.current.hold;
    return h !== null && h.until > Date.now();
  };

  const send = useCallback(
    (text?: string) => {
      const question = cleanQuestion(text ?? now.current.draft);
      if (!question || out.current || held()) return false;
      seq.current += 1;
      const turn: Turn = { id: seq.current, question, state: "waiting" };
      const before = now.current.thread;
      setThread(addTurn(before, turn));
      if (text === undefined) setDraft("");
      void ask(turn, before);
      return true;
    },
    [ask],
  );

  const retry = useCallback(
    (id: number) => {
      if (out.current || held()) return;
      const all = now.current.thread;
      const turn = all.find((t) => t.id === id);
      if (!turn || turn.state === "answered" || turn.state === "waiting") return;
      const again: Turn = { id: turn.id, question: turn.question, state: "waiting" };
      setThread(all.map((t) => (t.id === id ? again : t)));
      void ask(
        again,
        all.filter((t) => t.id !== id),
      );
    },
    [ask],
  );

  const stop = useCallback(() => {
    const f = out.current;
    if (!f) return;
    f.stopped = true;
    out.current = null;
    f.ctl.abort();
    setThread((t) => t.map((x) => (x.id === f.id ? { id: x.id, question: x.question, state: "stopped", line: STOPPED_LINE } : x)));
  }, []);

  const light = useMemo(() => latestAnswer(thread), [thread]);
  const waiting = thread.some((t) => t.state === "waiting");
  return { thread, draft, setDraft, waiting, hold, send, stop, retry, light };
}
