// Add Your Agent's stack (src/pages/AddAgent/pieces.ts), held to what it links and shows: every link opens a tab of
// the side panel or a section of the page, every chip is a logo of the world package's registry, and no piece shows a
// model provider or an agent framework, none of which has run here. Run with `pnpm test`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { TABS } from "../src/shell/tabs.ts";
import { PIECES } from "../src/pages/AddAgent/pieces.ts";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const read = (p) => readFileSync(join(site, p), "utf8");

/** The registry's ids, read from packages/world/src/kit/logos/registry.ts's LogoId union. */
function registryIds() {
  const m = /export type LogoId =([^;]+);/.exec(readFileSync(resolve(site, "..", "packages", "world", "src", "kit", "logos", "registry.ts"), "utf8"));
  assert.ok(m, "registry.ts declares LogoId");
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
}

test("the stack runs from an identity to the checks at the edge", () => {
  assert.deepEqual(
    PIECES.map((p) => p.id),
    ["identity", "hosting", "seal", "files", "memory", "prices", "odds", "launch", "edge"],
  );
  for (const p of PIECES) {
    assert.ok(p.chips.length > 0, `${p.name} shows no logo`);
    assert.ok(p.see.length > 0, `${p.name} links nowhere`);
    assert.ok(p.text.length > 0, `${p.name} says nothing`);
  }
});

test("every link opens a tab of the side panel or a section of the page", () => {
  const tabs = new Set(TABS.map((t) => t.id));
  const page = read("src/pages/AddAgent/index.tsx");
  for (const p of PIECES) {
    for (const s of p.see) {
      if ("tab" in s) assert.ok(tabs.has(s.tab), `${p.name} links the tab "${s.tab}", which src/shell/tabs.ts does not hold`);
      else assert.ok(page.includes(`id="${s.section}"`), `${p.name} links #${s.section}, which the page does not hold`);
    }
  }
});

test("every chip is a registry logo, and none a model provider's or an agent framework's", () => {
  const ids = registryIds();
  const untested = /anthropic|claude|openai|chatgpt|gpt|google|gemini|deepmind|meta|llama|mistral|cohere|xai|grok|deepseek|qwen|eliza|langchain|langgraph|crewai|autogen|llamaindex|hugging/i;
  for (const p of PIECES) {
    for (const c of p.chips) {
      for (const id of c.ids) {
        assert.ok(ids.has(id), `${p.name} shows "${id}", which the registry does not hold`);
        assert.doesNotMatch(id, untested, `${p.name} shows ${id}`);
      }
      assert.doesNotMatch(`${c.words} ${c.caption ?? ""}`, untested, `${p.name}'s chip names ${c.words}`);
    }
  }
});
