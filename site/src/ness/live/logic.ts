// Ask Ness live: the pure parts of the input under the prepared questions. A question goes to Ness's live service
// (POST /ask at NESS_LIVE_URL, src/config.ts) with the thread's last four answered turns and the reader's time zone;
// what comes back is read here into what the panel shows: the answer and its links, the service's own line when it
// asks the reader to wait, or one line when it cannot answer. No imports, so test/ness-live.test.mjs runs them in
// Node as they are.

/** The service's limits (its GET /status): a question's characters, and the turns of the thread it reads. */
export const QUESTION_MAX = 600;
export const THREAD_TURNS = 4;
/** How long the page waits for an answer; the service gives itself 45 s a question. */
export const WAIT_MS = 60_000;
/** When the progress line says Ness is still reading. */
export const SLOW_MS = 15_000;
/** A refusal that names no wait holds the input this long. */
export const HOLD_DEFAULT_S = 20;

/** What the panel shows when the service does not answer: any network or server failure, or a reply it cannot read. */
export const FAILURE_LINE = "Ness can't answer live right now. The answers above are checked against the record.";
/** A question the reader stopped. */
export const STOPPED_LINE = "Stopped.";

/** The site's own host: its pages open in the app, beside the panel. */
export const SITE_HOST = "gp.wattness.tech";

/** The brains the panel's stage can light (the Memory tab's three); Ness's questions brain is not drawn. */
const STAGE_BRAINS = new Set(["grand-prix", "terminal", "battery-review"]);
const PAGE_KEY = /^([a-z0-9-]+):([A-Za-z0-9._~-]+)$/;

export interface LiveLink {
  label: string;
  url: string;
}

export interface LiveAnswer {
  text: string;
  links: LiveLink[];
  /** The service's figure check held: every figure in the answer is in a source of this question. */
  checked: boolean;
  /** The Living Brain pages it rests on, the site's own first, as the Memory tab keys them ("grand-prix:gaterecord"). */
  pages: string[];
  /** Their titles in Living Brain, by key. */
  titles: Record<string, string>;
}

export type TurnState = "waiting" | "answered" | "stopped" | "failed" | "limited";

export interface Turn {
  id: number;
  question: string;
  state: TurnState;
  answer?: LiveAnswer;
  /** The line shown in place of an answer: the failure line, or the service's own when it asks the reader to wait. */
  line?: string;
}

export type Reply = { kind: "answer"; answer: LiveAnswer } | { kind: "limit"; line: string; retryAfter: number } | { kind: "failed" };

/** The thread as the service reads it: the answered turns, oldest first, at most four. */
export function historyOf(thread: readonly Turn[]): { question: string; answer: string }[] {
  return thread
    .flatMap((t) => (t.state === "answered" && t.answer ? [{ question: t.question, answer: t.answer.text }] : []))
    .slice(-THREAD_TURNS);
}

/** A question as it is sent: its words, trimmed and held to the service's limit. */
export function cleanQuestion(text: string): string {
  return text.trim().slice(0, QUESTION_MAX).trim();
}

/** What is sent: the question, the thread's answered turns and, when the browser names one, the reader's time zone. */
export function requestBody(
  question: string,
  thread: readonly Turn[],
  timeZone?: string | null,
): { question: string; history: { question: string; answer: string }[]; timeZone?: string } {
  const body: { question: string; history: { question: string; answer: string }[]; timeZone?: string } = {
    question: cleanQuestion(question),
    history: historyOf(thread),
  };
  if (typeof timeZone === "string" && /^[A-Za-z0-9_+\-/]{1,64}$/.test(timeZone)) body.timeZone = timeZone;
  return body;
}

/** The thread with a new question: a turn that holds no answer leaves it (Try again asks one again in its place), and
 *  only the last four stay. */
export function addTurn(thread: readonly Turn[], turn: Turn): Turn[] {
  return [...thread.filter((t) => t.state === "answered"), turn].slice(-THREAD_TURNS);
}

/** The service's own words when it asks the reader to wait, as one sentence; null when it gave none. */
export function limitLine(why: unknown): string | null {
  if (typeof why !== "string") return null;
  const line = why.replace(/\s+/g, " ").trim();
  if (!line || line.length > 300 || /<|https?:/i.test(line)) return null;
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

function isHttps(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 600) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** The pages an answer lights, from the reply's memory: its site page first, then the others, each once, at most six. */
export function memoryPages(memory: unknown): { pages: string[]; titles: Record<string, string> } {
  const out: string[] = [];
  const titles: Record<string, string> = {};
  if (!memory || typeof memory !== "object") return { pages: out, titles };
  const m = memory as { brainPage?: unknown; pages?: unknown };
  const list = Array.isArray(m.pages) ? m.pages : [];
  const keys: unknown[] = [m.brainPage, ...list.map((p) => (p && typeof p === "object" ? (p as { id?: unknown }).id : null))];
  for (const k of keys) {
    if (typeof k !== "string") continue;
    const at = PAGE_KEY.exec(k);
    if (!at || !STAGE_BRAINS.has(at[1] ?? "") || out.includes(k)) continue;
    out.push(k);
    if (out.length === 6) break;
  }
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const { id, title } = p as { id?: unknown; title?: unknown };
    if (typeof id === "string" && out.includes(id) && typeof title === "string" && title.trim() && title.length <= 120) titles[id] = title.trim();
  }
  return { pages: out, titles };
}

/** What the service's reply means for the panel: an answer to show, a wait it asks for (429), or a failure. */
export function readReply(status: number, body: unknown): Reply {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (status === 429) {
    const line = limitLine(b?.why);
    if (!line) return { kind: "failed" };
    const s = Number(b?.retryAfter);
    const retryAfter = Number.isFinite(s) && s >= 1 ? Math.min(Math.ceil(s), 86_400) : HOLD_DEFAULT_S;
    return { kind: "limit", line, retryAfter };
  }
  if (status !== 200 || !b) return { kind: "failed" };
  const text = typeof b.answer === "string" ? b.answer.trim() : "";
  if (!text || text.length > 4000) return { kind: "failed" };
  const links: LiveLink[] = [];
  for (const l of Array.isArray(b.links) ? b.links : []) {
    if (!l || typeof l !== "object") continue;
    const { label, url } = l as { label?: unknown; url?: unknown };
    if (typeof label !== "string" || !label.trim() || label.length > 200 || !isHttps(url)) continue;
    if (links.some((x) => x.url === url)) continue;
    links.push({ label: label.trim(), url });
    if (links.length === 5) break;
  }
  const { pages, titles } = memoryPages(b.memory);
  return { kind: "answer", answer: { text, links, checked: b.checked === true, pages, titles } };
}

/** The Living Brain pages an answer rests on, as links to their place on the Memory tab after the answer's own links:
 *  at most two, each named by its title in Living Brain ("Living Brain: GateRecord"). */
export function memoryLinks(answer: LiveAnswer): LiveLink[] {
  return answer.pages
    .filter((k) => answer.titles[k])
    .slice(0, 2)
    .map((k) => ({ label: `Living Brain: ${answer.titles[k]}`, url: `https://${SITE_HOST}/agents/memory?page=${k}` }))
    .filter((m) => !answer.links.some((l) => l.url === m.url));
}

/** The turn once its reply is in. */
export function settle(turn: Turn, reply: Reply): Turn {
  if (reply.kind === "answer") return { id: turn.id, question: turn.question, state: "answered", answer: reply.answer };
  if (reply.kind === "limit") return { id: turn.id, question: turn.question, state: "limited", line: reply.line };
  return { id: turn.id, question: turn.question, state: "failed", line: FAILURE_LINE };
}

/** Where a link goes: a page of this site opens in the app (its path), anything else in a new tab; null for a link the
 *  panel does not open (not https). A file on the site (/data/day.json) opens as a file, not as a page. */
export function linkTarget(url: string): { to: string } | { href: string } | null {
  if (!isHttps(url)) return null;
  const u = new URL(url);
  if (u.hostname === SITE_HOST && !u.pathname.startsWith("/data/") && !/\.[A-Za-z0-9]{1,6}$/.test(u.pathname)) {
    return { to: `${u.pathname || "/"}${u.search}${u.hash}` };
  }
  return { href: u.toString() };
}

/** The answer's paragraphs: it is plain text, a line break between two. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Enter sends; Shift+Enter is a new line; a key that ends an input method's composition (Chinese, Japanese) does not
 *  send. */
export function sendsOnEnter(e: { key: string; shiftKey: boolean; isComposing?: boolean; keyCode?: number }): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229;
}

/** The latest answer in the thread, whose pages the stage lights. */
export function latestAnswer(thread: readonly Turn[]): LiveAnswer | null {
  for (let i = thread.length - 1; i >= 0; i--) {
    const t = thread[i];
    if (t && t.state === "answered" && t.answer) return t.answer;
  }
  return null;
}
