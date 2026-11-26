// Ask Ness: the address that opens the panel, the search over its questions,
// the times inside an answer, and the answers themselves held to their rules:
// short, every link landing on a tab, a file in this repository or a page
// outside, every Living Brain page one the Memory tab holds, and the testnet
// tickers only where they are labeled. Runs offline.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ANSWERS, BRAIN_PAGES, BRAINS, GROUPS, SPONSORS, START_HERE } from "../src/ness/answers.ts";
import { countWords, filterByQuery, fold, hostOf, isExternal, liveFocus, matchesQuery, queryTerms, readAsk, splitPageKey, splitTimes, writeAsk } from "../src/ness/logic.ts";
import { tabAt } from "../src/shell/tabs.ts";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(site, "..");
const REPO_URL = "https://github.com/zhuyuxin0/wattness-grand-prix";

const prose = (a) => a.body.flatMap((b) => (typeof b === "string" ? [b] : "list" in b ? b.list : []));
const allText = (a) => [a.question, ...prose(a), ...a.body.flatMap((b) => (typeof b === "object" && "code" in b ? [b.code] : []))].join("\n");

// ---------------------------------------------------------------- the address

test("?ask opens the panel: empty on the questions, with an id on one answer", () => {
  assert.deepEqual(readAsk(""), { open: false });
  assert.deepEqual(readAsk("?arm=B"), { open: false });
  assert.deepEqual(readAsk("?ask="), { open: true, id: null });
  assert.deepEqual(readAsk("?ask"), { open: true, id: null });
  assert.deepEqual(readAsk("?ask=cournot"), { open: true, id: "cournot" });
  assert.deepEqual(readAsk("?hour=17&ask=bnb-chain"), { open: true, id: "bnb-chain" });
});

test("the panel's state is written beside the page's own parameters, which keep their place", () => {
  assert.equal(writeAsk("", { open: true, id: null }), "?ask=");
  assert.equal(writeAsk("?arm=B&hour=17", { open: true, id: "stewards" }), "?arm=B&hour=17&ask=stewards");
  assert.equal(writeAsk("?ask=stewards&arm=B", { open: true, id: "cournot" }), "?ask=cournot&arm=B");
  assert.equal(writeAsk("?arm=B&ask=cournot", { open: false }), "?arm=B");
  assert.equal(writeAsk("?ask=cournot", { open: false }), "");
  for (const s of ["", "?page=grand-prix:gaterecord", "?arm=C&hour=3"]) {
    for (const id of [null, "run-it"]) assert.deepEqual(readAsk(writeAsk(s, { open: true, id })), { open: true, id });
  }
});

// ---------------------------------------------------------------- the search

test("the search folds case, accents and the × of CoinMarketCap × Atlas", () => {
  assert.equal(fold("CoinMarketCap × Atlas"), "coinmarketcap  x  atlas");
  assert.deepEqual(queryTerms("  Dallas–Fort Worth, 29°F "), ["dallas-fort", "worth", "29", "f"]);
  assert.ok(matchesQuery("CoinMarketCap × Atlas", "coinmarketcap x atlas"));
  assert.ok(matchesQuery("ERC-8183 jobs", "erc-8183"));
  assert.ok(matchesQuery("GateRecord", "gate record"), "words run together still match");
  assert.ok(!matchesQuery("GateRecord", "gate seal"));
  assert.ok(matchesQuery("anything", "   "));
});

test("a query keeps the answers holding every word, in their order", () => {
  const text = (a) => [a.question, ...prose(a), ...(a.keywords ?? [])].join(" ");
  assert.equal(filterByQuery(ANSWERS, "", text).length, ANSWERS.length);
  const cournot = filterByQuery(ANSWERS, "cournot hash", text).map((a) => a.id);
  assert.ok(cournot.includes("cournot-check"), cournot.join(", "));
  const greenfield = filterByQuery(ANSWERS, "greenfield", text).map((a) => a.id);
  assert.ok(greenfield.includes("bnb-greenfield"));
  assert.deepEqual(filterByQuery(ANSWERS, "zzzz-no-such-word", text), []);
  const ids = ANSWERS.map((a) => a.id);
  const kept = filterByQuery(ANSWERS, "plan", text).map((a) => a.id);
  assert.deepEqual(kept, ids.filter((id) => kept.includes(id)));
});

// ---------------------------------------------------------------- times

test("a time in an answer is a unix second between the braces", () => {
  assert.deepEqual(splitTimes("sealed at {t:1795702241} on Nov 26."), ["sealed at ", { unix: 1795702241 }, " on Nov 26."]);
  assert.deepEqual(splitTimes("{t:1795702216}{t:1795702352}"), [{ unix: 1795702216 }, { unix: 1795702352 }]);
  assert.deepEqual(splitTimes("no time"), ["no time"]);
  assert.equal(countWords("at {t:1795702241} on Nov 26"), 6);
});

test("a Living Brain page key splits into its brain and slug", () => {
  assert.deepEqual(splitPageKey("grand-prix:gaterecord"), { brain: "grand-prix", slug: "gaterecord" });
  assert.deepEqual(splitPageKey("battery-review:dswl-ess-esr1"), { brain: "battery-review", slug: "dswl-ess-esr1" });
  assert.equal(splitPageKey("gaterecord"), null);
  assert.equal(splitPageKey(":x"), null);
  assert.equal(splitPageKey("grand-prix:"), null);
});

test("the live stage centers an answer's brain and pins its page, or shows all three", () => {
  assert.deepEqual(liveFocus("grand-prix:gaterecord"), { brain: "grand-prix", page: "gaterecord" });
  assert.deepEqual(liveFocus("battery-review:dswl-ess-esr1"), { brain: "battery-review", page: "dswl-ess-esr1" });
  assert.deepEqual(liveFocus(null), { brain: "all", page: null });
  assert.deepEqual(liveFocus("combined:anything"), { brain: "all", page: null });
  for (const key of Object.keys(BRAIN_PAGES)) assert.notEqual(liveFocus(key).brain, "all", key);
});

test("links say where they go", () => {
  assert.ok(isExternal("https://bscscan.com/tx/0x1"));
  assert.ok(!isExternal("/verify"));
  assert.equal(hostOf("https://www.example.org/a"), "example.org");
  assert.equal(hostOf("/seal"), "");
});

// ---------------------------------------------------------------- the answers

test("answer ids are unique and fit an address", () => {
  const ids = ANSWERS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test("every group and every sponsor has its questions, and how it works covers what it must", () => {
  for (const g of GROUPS) assert.ok(ANSWERS.some((a) => a.group === g.id), `no answers under ${g.label}`);
  for (const s of SPONSORS) assert.ok(ANSWERS.filter((a) => a.sponsor === s.id).length >= 2, `${s.label} needs how it is used and what was delivered`);
  for (const a of ANSWERS) assert.equal(a.group === "sponsors", !!a.sponsor, `${a.id}: a sponsor answer names its sponsor, and only those do`);
  const how = new Set(ANSWERS.filter((a) => a.group === "how").map((a) => a.id));
  for (const id of ["scoring-rule", "how-plans-are-made", "after-the-seal", "verify-yourself", "stewards", "real-or-shadow"]) assert.ok(how.has(id), `How it works lacks ${id}`);
  const bnb = ANSWERS.filter((a) => a.sponsor === "bnb").map(allText).join("\n");
  for (const piece of ["Greenfield", "Agent Studio", "Cloudflare"]) assert.ok(bnb.includes(piece), `BNB Chain's answers leave out ${piece}`);
});

test("Start here names answers that exist, once each", () => {
  const ids = new Set(ANSWERS.map((a) => a.id));
  assert.ok(START_HERE.length > 0);
  assert.equal(new Set(START_HERE).size, START_HERE.length);
  for (const id of START_HERE) assert.ok(ids.has(id), id);
});

test("each answer is at most about 120 words", () => {
  for (const a of ANSWERS) {
    const words = prose(a).reduce((n, p) => n + countWords(p), 0);
    assert.ok(words <= 125, `${a.id}: ${words} words`);
    assert.ok(words >= 15, `${a.id}: ${words} words`);
  }
});

test("the scoring rule says who wrote it, that it is fixed before the seal, and what the seal stops", () => {
  const a = ANSWERS.find((x) => x.id === "scoring-rule");
  const text = prose(a).join(" ");
  assert.match(text, /Wattness wrote it/);
  assert.match(text, /fixed in code before the seal/);
  assert.match(text, /Wattness included/);
  assert.match(text, /one record per committer, scope and day/);
  const made = prose(ANSWERS.find((x) => x.id === "how-plans-are-made")).join(" ");
  assert.match(made, /No language model writes a plan/);
});

test("every source is a tab, a file in this repository, or a page outside", () => {
  for (const a of ANSWERS) {
    assert.ok(a.sources.length >= 1, `${a.id} rests on nothing`);
    const hrefs = a.sources.map((s) => s.href);
    assert.equal(new Set(hrefs).size, hrefs.length, `${a.id} lists a source twice`);
    for (const s of a.sources) {
      assert.ok(s.label.trim().length > 0, `${a.id}: a source without a label`);
      if (!isExternal(s.href)) {
        assert.match(s.href, /^\/[^/]/, `${a.id}: ${s.href}`);
        const path = s.href.split(/[?#]/)[0];
        assert.ok(tabAt(path), `${a.id}: ${s.href} opens no tab`);
        continue;
      }
      assert.match(s.href, /^https:\/\//, `${a.id}: ${s.href}`);
      if (s.href.startsWith(`${REPO_URL}/`)) {
        const m = /^https:\/\/github\.com\/zhuyuxin0\/wattness-grand-prix\/(tree|blob)\/main\/([^#?]+)/.exec(s.href);
        assert.ok(m, `${a.id}: ${s.href} is not a file on main`);
        assert.ok(existsSync(join(repo, decodeURIComponent(m[2]))), `${a.id}: ${m[2]} is not in the repository`);
      }
    }
  }
});

test("every Living Brain page an answer names is one the Memory tab holds, under its own title", () => {
  const build = JSON.parse(readFileSync(join(site, "public", "data", "memory", "build-brain.json"), "utf8"));
  const titles = new Map(build.pages.map((p) => [`${p.brain}:${p.slug}`, p.title]));
  for (const [key, title] of Object.entries(BRAIN_PAGES)) assert.equal(titles.get(key), title, `${key}`);
  for (const a of ANSWERS) {
    if (!a.brainPage) continue;
    assert.ok(BRAIN_PAGES[a.brainPage], `${a.id}: ${a.brainPage} has no title here`);
    assert.ok(BRAINS[a.brainPage.split(":")[0]], `${a.id}: ${a.brainPage} names no brain`);
  }
  for (const id of Object.keys(BRAINS)) assert.ok(build.brains.some((b) => b.id === id), id);
});

test("every time is one of the build's days, Nov 24 to Nov 28, 2026", () => {
  const from = Date.UTC(2026, 10, 24) / 1000;
  const to = Date.UTC(2026, 10, 29) / 1000;
  for (const a of ANSWERS) {
    for (const p of prose(a).flatMap(splitTimes)) {
      if (typeof p === "string") assert.ok(!/\{t:/.test(p), `${a.id}: a time that does not parse`);
      else assert.ok(p.unix >= from && p.unix < to, `${a.id}: ${p.unix}`);
    }
  }
});

test("the testnet tickers appear only in the Flap and OpenFour answers, each labeled testnet", () => {
  for (const a of ANSWERS) {
    const text = [allText(a), ...a.sources.map((s) => s.label)].join("\n");
    if (!/\b(PRIX|PLNR)\b/.test(text)) continue;
    assert.ok(a.sponsor === "flap" || a.sponsor === "openfour", `${a.id} names a ticker`);
    assert.match(prose(a).join(" "), /testnet/, `${a.id} names a ticker without saying testnet`);
  }
  for (const a of ANSWERS) {
    const title = a.brainPage ? BRAIN_PAGES[a.brainPage] : "";
    if (/\b(PRIX|PLNR)\b/.test(title)) assert.ok(a.sponsor === "flap" || a.sponsor === "openfour", `${a.id} lights a ticker's page`);
  }
});

test("the answers keep the site's words: American spelling, minus for a difference, no uplift, no pilot, no profit claims", () => {
  const banned = /\b(less|uplift|pilot|profit\w*|guarantee\w*|colour|behaviour|centre|licence|organis\w*|recognis\w*|favour\w*|optimis\w*|analys(e|ed|ing))\b/i;
  for (const a of ANSWERS) {
    const text = [allText(a), ...a.sources.map((s) => s.label)].join("\n");
    const m = banned.exec(text);
    assert.equal(m, null, `${a.id}: "${m?.[0]}"`);
    assert.ok(!/\b(I think|as an AI|I'm not sure)\b/i.test(text), `${a.id} speaks as a model`);
  }
});

test("the panel says what it is, and every page carries the launcher", () => {
  const panel = readFileSync(join(site, "src", "ness", "NessPanel.tsx"), "utf8");
  assert.ok(panel.includes("Prepared answers from the record. Each links to what it rests on."));
  const layout = readFileSync(join(site, "src", "shell", "Layout.tsx"), "utf8");
  assert.match(layout, /<AskNess \/>/);
  const launcher = readFileSync(join(site, "src", "ness", "Launcher.tsx"), "utf8");
  assert.match(launcher, /import\("\.\/NessPanel"\)/, "the panel loads on first open");
  assert.ok(!/from "\.\/NessPanel"/.test(launcher), "the panel stays out of the first load");
});
