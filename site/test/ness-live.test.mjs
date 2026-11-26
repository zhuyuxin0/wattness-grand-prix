// Ask Ness live (src/ness/live/): what a question sends to Ness's live service, how its reply is read (an answer and
// its links, the service's own line when it asks the reader to wait, one line for any failure), the thread kept to its
// last four turns, Enter and Shift+Enter, and where its links open. The source rules: one public constant for the
// service, no credentials, nothing stored, the input under the prepared questions. Runs offline.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  addTurn,
  cleanQuestion,
  FAILURE_LINE,
  historyOf,
  HOLD_DEFAULT_S,
  latestAnswer,
  limitLine,
  linkTarget,
  memoryLinks,
  memoryPages,
  paragraphs,
  QUESTION_MAX,
  readReply,
  requestBody,
  sendsOnEnter,
  settle,
  STOPPED_LINE,
  THREAD_TURNS,
  WAIT_MS,
} from "../src/ness/live/logic.ts";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(site, ...p), "utf8");

const answered = (id, question, text = `answer ${id}`) => ({ id, question, state: "answered", answer: { text, links: [], checked: true, pages: [], titles: {} } });

// ---------------------------------------------------------------- what is sent

test("a question goes with the thread's answered turns, oldest first, at most four, and the reader's time zone", () => {
  const thread = [answered(1, "q1"), answered(2, "q2"), { id: 3, question: "q3", state: "failed", line: FAILURE_LINE }, answered(4, "q4"), answered(5, "q5"), answered(6, "q6")];
  const body = requestBody("  What does the evaluator do?  ", thread, "Asia/Bangkok");
  assert.equal(body.question, "What does the evaluator do?");
  assert.deepEqual(
    body.history.map((t) => t.question),
    ["q2", "q4", "q5", "q6"],
  );
  assert.deepEqual(body.history[0], { question: "q2", answer: "answer 2" });
  assert.equal(body.timeZone, "Asia/Bangkok");
  assert.deepEqual(Object.keys(body).sort(), ["history", "question", "timeZone"]);
  assert.equal(THREAD_TURNS, 4);
});

test("a time zone the browser does not name, or one that is not an IANA name, is left out", () => {
  assert.equal("timeZone" in requestBody("q", [], null), false);
  assert.equal("timeZone" in requestBody("q", [], ""), false);
  assert.equal("timeZone" in requestBody("q", [], "Europe/London; drop"), false);
  assert.equal(requestBody("q", [], "America/Argentina/Buenos_Aires").timeZone, "America/Argentina/Buenos_Aires");
  assert.equal(requestBody("q", [], "Etc/GMT+7").timeZone, "Etc/GMT+7");
});

test("a question is trimmed and held to the service's 600 characters", () => {
  assert.equal(QUESTION_MAX, 600);
  assert.equal(cleanQuestion("   \n "), "");
  assert.equal(cleanQuestion(` ${"a".repeat(700)} `).length, 600);
  assert.equal(cleanQuestion("line one\nline two"), "line one\nline two");
});

test("the thread keeps its last four turns; a turn with no answer leaves it when the next question comes", () => {
  let t = [];
  for (let i = 1; i <= 5; i++) t = addTurn(t.map((x) => (x.state === "waiting" ? answered(x.id, x.question) : x)), { id: i, question: `q${i}`, state: "waiting" });
  assert.deepEqual(
    t.map((x) => x.id),
    [2, 3, 4, 5],
  );
  const failed = [answered(1, "q1"), { id: 2, question: "q2", state: "stopped", line: STOPPED_LINE }];
  assert.deepEqual(
    addTurn(failed, { id: 3, question: "q3", state: "waiting" }).map((x) => x.id),
    [1, 3],
  );
  assert.deepEqual(historyOf(failed), [{ question: "q1", answer: "answer 1" }]);
});

// ---------------------------------------------------------------- what comes back

test("an answer is read with its links and the pages it rests on", () => {
  const r = readReply(200, {
    answer: "  The evaluator reads the sealed plan after the gate.\nIt runs on Agent Studio.  ",
    links: [
      { label: "Agent IDs tab", url: "https://gp.wattness.tech/agents" },
      { label: "Agent IDs tab", url: "https://gp.wattness.tech/agents" },
      { label: "BscScan (BSC mainnet): transaction 0x24f5…", url: "https://bscscan.com/tx/0x24f5" },
      { label: "not https", url: "http://example.com" },
      { label: "", url: "https://gp.wattness.tech/seal" },
      { label: "a script", url: "javascript:alert(1)" },
      "https://gp.wattness.tech/verify",
    ],
    checked: true,
    memory: {
      pages: [
        { id: "grand-prix:agent-studio", brain: "grand-prix", slug: "agent-studio", title: "Agent Studio" },
        { id: "questions:q-1", brain: "questions", slug: "q-1", title: "A question" },
      ],
      brainPage: "grand-prix:agent-studio",
    },
  });
  assert.equal(r.kind, "answer");
  assert.equal(r.answer.text, "The evaluator reads the sealed plan after the gate.\nIt runs on Agent Studio.");
  assert.deepEqual(r.answer.links, [
    { label: "Agent IDs tab", url: "https://gp.wattness.tech/agents" },
    { label: "BscScan (BSC mainnet): transaction 0x24f5…", url: "https://bscscan.com/tx/0x24f5" },
  ]);
  assert.equal(r.answer.checked, true);
  assert.deepEqual(r.answer.pages, ["grand-prix:agent-studio"], "Ness's questions brain is not drawn");
  assert.deepEqual(r.answer.titles, { "grand-prix:agent-studio": "Agent Studio" });
  assert.equal(readReply(200, { answer: "x", links: [] }).answer.checked, false, "checked only when the service says so");
});

test("at most five links, as the service sends at most five", () => {
  const links = Array.from({ length: 8 }, (_, i) => ({ label: `L${i}`, url: `https://gp.wattness.tech/t${i}` }));
  assert.equal(readReply(200, { answer: "x", links }).answer.links.length, 5);
});

test("the pages light the site's own page first, then the others, each once, at most six, in the stage's three brains", () => {
  const pages = ["terminal:fleet-board", "grand-prix:gaterecord", "battery-review:dswl-ess-esr1", "terminal:fleet-board", "grand-prix:a", "grand-prix:b", "grand-prix:c", "grand-prix:d"];
  const m = memoryPages({ brainPage: "grand-prix:gaterecord", pages: pages.map((id) => ({ id, title: id.toUpperCase() })) });
  assert.deepEqual(m.pages, ["grand-prix:gaterecord", "terminal:fleet-board", "battery-review:dswl-ess-esr1", "grand-prix:a", "grand-prix:b", "grand-prix:c"]);
  assert.equal(m.titles["terminal:fleet-board"], "TERMINAL:FLEET-BOARD");
  assert.deepEqual(memoryPages(null), { pages: [], titles: {} });
  assert.deepEqual(memoryPages({ pages: [{ id: "bad key" }, { id: "x:" }, { id: 7 }] }).pages, []);
});

test("a reply the panel cannot read, and every failure, is one line", () => {
  for (const [status, body] of [
    [200, null],
    [200, { answer: "" }],
    [200, { answer: "   " }],
    [200, { answer: 42 }],
    [200, { answer: "x".repeat(4001) }],
    [200, ["answer"]],
    [503, { error: "busy", why: "Ness is answering many questions; ask again in a moment" }],
    [504, { error: "failed", why: "Ness ran out of time on this question" }],
    [502, { error: "failed", why: "the model service answered 500" }],
    [500, { error: "failed" }],
    [403, { error: "origin", why: "this origin may not call Ness" }],
    [404, null],
    [0, null],
  ])
    assert.deepEqual(readReply(status, body), { kind: "failed" }, `${status}`);
  assert.equal(FAILURE_LINE, "Ness can't answer live right now. The answers above are checked against the record.");
  assert.deepEqual(settle({ id: 1, question: "q", state: "waiting" }, { kind: "failed" }), { id: 1, question: "q", state: "failed", line: FAILURE_LINE });
});

test("a refusal (429) gives the service's own words and holds the input as long as it asks", () => {
  const window10 = readReply(429, { error: "allowance", why: "You have asked many questions in a few minutes; ask again in 2 minutes", retryAfter: 97.2 });
  assert.deepEqual(window10, { kind: "limit", line: "You have asked many questions in a few minutes; ask again in 2 minutes.", retryAfter: 98 });
  const day = readReply(429, { error: "allowance", why: "You have asked all the questions one visitor may ask today; ask again after midnight CT (13:00 Bangkok)", retryAfter: 33_000 });
  assert.equal(day.line, "You have asked all the questions one visitor may ask today; ask again after midnight CT (13:00 Bangkok).");
  assert.equal(day.retryAfter, 33_000);
  assert.equal(readReply(429, { error: "failed", why: "Ness is busy; ask again in a moment" }).retryAfter, HOLD_DEFAULT_S, "no wait named: a short hold");
  assert.equal(readReply(429, { why: "x", retryAfter: 9e9 }).retryAfter, 86_400);
  assert.deepEqual(readReply(429, {}), { kind: "failed" });
  assert.deepEqual(readReply(429, null), { kind: "failed" });
  assert.deepEqual(settle({ id: 2, question: "q", state: "waiting" }, window10), { id: 2, question: "q", state: "limited", line: window10.line });
});

test("the service's line is shown only as plain words", () => {
  assert.equal(limitLine("Ask again soon!"), "Ask again soon!");
  assert.equal(limitLine("  two   spaces \n here "), "two spaces here.");
  assert.equal(limitLine("see https://example.com"), null);
  assert.equal(limitLine("<b>bold</b>"), null);
  assert.equal(limitLine("x".repeat(301)), null);
  assert.equal(limitLine(7), null);
});

// ---------------------------------------------------------------- how it reads

test("a page of this site opens in the app; a file, another host or a link that is not https does not", () => {
  assert.deepEqual(linkTarget("https://gp.wattness.tech/verify"), { to: "/verify" });
  assert.deepEqual(linkTarget("https://gp.wattness.tech/"), { to: "/" });
  assert.deepEqual(linkTarget("https://gp.wattness.tech/agents/memory?page=grand-prix:gaterecord#top"), { to: "/agents/memory?page=grand-prix:gaterecord#top" });
  assert.deepEqual(linkTarget("https://gp.wattness.tech/battery/DSWL_ESS_ESR1"), { to: "/battery/DSWL_ESS_ESR1" });
  assert.deepEqual(linkTarget("https://gp.wattness.tech/data/day.json"), { href: "https://gp.wattness.tech/data/day.json" });
  assert.deepEqual(linkTarget("https://bscscan.com/tx/0xabc"), { href: "https://bscscan.com/tx/0xabc" });
  assert.deepEqual(linkTarget("https://wattness.tech"), { href: "https://wattness.tech/" });
  assert.equal(linkTarget("http://gp.wattness.tech/verify"), null);
  assert.equal(linkTarget("javascript:alert(1)"), null);
  assert.equal(linkTarget("https://user:pw@gp.wattness.tech/"), null);
  assert.equal(linkTarget("not a url"), null);
});

test("the Living Brain pages an answer rests on follow its links, at most two, named by their titles", () => {
  const a = {
    text: "x",
    links: [{ label: "Seal tab", url: "https://gp.wattness.tech/seal" }],
    checked: true,
    pages: ["grand-prix:gaterecord", "terminal:fleet-board", "battery-review:dswl-ess-esr1", "grand-prix:untitled"],
    titles: { "grand-prix:gaterecord": "GateRecord", "terminal:fleet-board": "Fleet Board", "battery-review:dswl-ess-esr1": "DSWL_ESS_ESR1" },
  };
  assert.deepEqual(memoryLinks(a), [
    { label: "Living Brain: GateRecord", url: "https://gp.wattness.tech/agents/memory?page=grand-prix:gaterecord" },
    { label: "Living Brain: Fleet Board", url: "https://gp.wattness.tech/agents/memory?page=terminal:fleet-board" },
  ]);
  assert.deepEqual(linkTarget(memoryLinks(a)[0].url), { to: "/agents/memory?page=grand-prix:gaterecord" });
  const linked = { ...a, links: [{ label: "GateRecord's page", url: "https://gp.wattness.tech/agents/memory?page=grand-prix:gaterecord" }] };
  assert.deepEqual(
    memoryLinks(linked).map((l) => l.label),
    ["Living Brain: Fleet Board"],
    "a page the answer already links is not repeated",
  );
  assert.deepEqual(memoryLinks({ ...a, pages: [], titles: {} }), []);
});

test("an answer's lines are its paragraphs", () => {
  assert.deepEqual(paragraphs("One.\n\nTwo.\nThree."), ["One.", "Two.", "Three."]);
  assert.deepEqual(paragraphs("  One sentence.  "), ["One sentence."]);
});

test("Enter asks; Shift+Enter is a new line; an input method's Enter is its own", () => {
  assert.equal(sendsOnEnter({ key: "Enter", shiftKey: false }), true);
  assert.equal(sendsOnEnter({ key: "Enter", shiftKey: true }), false);
  assert.equal(sendsOnEnter({ key: "Enter", shiftKey: false, isComposing: true }), false);
  assert.equal(sendsOnEnter({ key: "Enter", shiftKey: false, keyCode: 229 }), false);
  assert.equal(sendsOnEnter({ key: "a", shiftKey: false }), false);
});

test("the stage lights the latest answer's pages", () => {
  const a = answered(1, "q1");
  const b = answered(2, "q2");
  assert.equal(latestAnswer([]), null);
  assert.equal(latestAnswer([a, b, { id: 3, question: "q3", state: "waiting" }]), b.answer);
  assert.ok(WAIT_MS > 45_000, "the page waits longer than the service's own deadline");
});

// ---------------------------------------------------------------- the source

const filesIn = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesIn(p) : [p];
  });

test("the service's address is one public constant in the site's config", () => {
  const config = read("src", "config.ts");
  const m = /export const NESS_LIVE_URL = "(https:\/\/[^"]+)";/.exec(config);
  assert.ok(m, "config.ts names NESS_LIVE_URL");
  const host = new URL(m[1]).hostname;
  assert.match(host, /^grand-prix-ness\.[a-z0-9-]+\.[a-z0-9]+\.azurecontainerapps\.io$/);
  for (const f of filesIn(join(site, "src")).filter((p) => /\.(ts|tsx|css)$/.test(p) && !p.endsWith("config.ts")))
    assert.ok(!readFileSync(f, "utf8").includes(host), `${f} repeats the service's host`);
});

test("a question goes without credentials, and nothing of the thread is stored", () => {
  const hook = read("src", "ness", "live", "useLiveNess.ts");
  assert.match(hook, /fetch\(`\$\{NESS_LIVE_URL\}\/ask`/);
  assert.match(hook, /credentials: "omit"/);
  assert.match(hook, /"Content-Type": "application\/json"/);
  for (const f of filesIn(join(site, "src", "ness", "live"))) {
    const src = readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const word of ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "history.pushState", "history.replaceState", "useNavigate", "navigate("])
      assert.ok(!src.includes(word), `${f} uses ${word}`);
    assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(src), `${f} holds an email address`);
  }
});

test("the input stands under the prepared questions, and the panel says both layers", () => {
  const panel = read("src", "ness", "NessPanel.tsx");
  const questions = panel.indexOf("<Questions");
  const thread = panel.indexOf("<LiveThread live={liveNess}");
  const composer = panel.indexOf("<LiveComposer live={liveNess}");
  assert.ok(questions > 0 && thread > questions && composer > thread, "questions, then the thread, then the input");
  assert.ok(panel.includes("Pick a question for an answer checked against the record, or ask Ness anything about the Grand Prix."));
  const live = read("src", "ness", "live", "LiveNess.tsx");
  for (const words of ['placeholder="Ask Ness about the Grand Prix"', "Stop", "Try again", "What it rests on", "Ness is reading the record"])
    assert.ok(live.includes(words), words);
  // Stop and Ask are two keyed buttons: React reusing one element for both made a click on Stop submit the draft.
  assert.match(live, /key="stop"\s+type="button"/);
  assert.match(live, /key="ask"\s+type="submit"/);
  // Full screen starts its columns in view, whatever the chat body's scroll was beside the page.
  assert.match(panel, /if \(mode === "full"\) main\.current\?\.scrollTo\(\{ top: 0 \}\)/);
  assert.match(read("src", "ness", "live", "live.css"), /\.ness-live \{\s*position: relative;/);
});
