// The shared "Check it" line and "Built with" row (src/ui/CheckIt.tsx, src/ui/BuiltWith.tsx, src/pages/TechStack/sponsors.ts):
// the closed line counts every kind in one order, in words, and a section's chips are the registry's own entries.
// Run with `pnpm test` (Node 22.18 or later runs the TypeScript modules directly).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CHECK_ORDER, CHECK_WORDS, countLine } from "../src/ui/check-count.ts";
import { sponsors } from "../src/pages/TechStack/sponsors.ts";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const read = (p) => readFileSync(resolve(site, p), "utf8");

test("the closed line counts each kind once, in the list's order, one and many", () => {
  const items = [
    { kind: "transaction" },
    { kind: "file" },
    { kind: "address" },
    { kind: "transaction" },
    { kind: "file" },
    { kind: "file" },
  ];
  assert.equal(countLine(items), "3 files · 2 transactions · 1 address");
  assert.equal(countLine([{ kind: "root" }]), "1 root");
  assert.equal(countLine([]), "");
  assert.equal(countLine(Array.from({ length: 1316 }, () => ({ kind: "hash" }))), "1,316 hashes");
  for (const k of CHECK_ORDER) assert.ok(CHECK_WORDS[k], `${k} has its words`);
  assert.equal(new Set(CHECK_ORDER).size, Object.keys(CHECK_WORDS).length);
});

test("a section's Built with entries are the registry's, singly, grouped or with words", () => {
  const logos = Object.fromEntries(["bnbchain", "agentstudio", "aws", "openfour"].map((id) => [id, { id, name: id, href: `https://example.org/${id}`, src: `${id}.svg`, w: 1, h: 1, ground: "light", optical: 1 }]));
  const reg = { logos, note: "Logos are trademarks of their owners, shown only to identify them." };
  assert.equal(sponsors(null, "bnbchain"), null);
  const [one, group, worded] = sponsors(reg, "bnbchain", ["agentstudio", "aws"], { id: "openfour", caption: "OpenFour" });
  assert.equal(one, logos.bnbchain);
  assert.deepEqual(group, [logos.agentstudio, logos.aws]);
  assert.deepEqual(worded, { logo: logos.openfour, caption: "OpenFour" });
});

test("a section draws its Built with row in its head and its Check it line under its content", () => {
  const section = read("src/ui/Section.tsx");
  const head = section.indexOf('<header className="section__head">');
  const built = section.indexOf("<BuiltWith");
  const body = section.indexOf('<div className="section__body">');
  const check = section.indexOf("<CheckIt");
  const source = section.indexOf('className="section__source"');
  assert.ok(head > 0 && built > head && built < body, "Built with sits in the head");
  assert.ok(check > body && check < source, "Check it sits under the content, before the source line");
  // every item stays whole and copyable
  const checkIt = read("src/ui/CheckIt.tsx");
  assert.match(checkIt, /<Hash value=\{it\.value\} full /);
  assert.doesNotMatch(checkIt, /copy=\{false\}/);
});
