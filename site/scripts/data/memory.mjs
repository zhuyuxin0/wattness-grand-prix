// Memory data: the build's own brain in Living Brain, "Wattness Grand Prix",
// for the Memory tab. The source is the brain's site file (build-brain.json:
// pages, connections, the tab map, the corrections, and the union of the three
// brains combined in Living Brain with the connections across them), read from
// --build-brain <file> or GP_SOURCES/build-brain.json. Absent, the last
// published copy is kept, read back from git.
//
// Published as the union once: every page and connection of the three brains,
// each with its brain, the Grand Prix brain's own rows among them. Living
// Brain's summaries and reasoning stay as it wrote them, each correction beside
// the text it corrects. The tab map keys the site's tab ids; a tab the file
// names no page for points at the nearest page, and the entry says so, as it
// does for a tab the file points at a section of another page.
// Written to public/data/memory/build-brain.json.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const OUT = "memory/build-brain.json";

/** Tabs the build brain names no page for, and the page nearest to each. */
const NEAREST = {
  "agent-ids": { page: "erc-8004", label: "Agent IDs", group: "Agents" },
  stack: { page: "wattness-grand-prix-repository", label: "Tech Stack", group: "About" },
};

/**
 * Corrections the site sets beside Living Brain's text where it misstates the
 * repository or the chain record and the brain's file carries none. Checked
 * against GateRecord's receipts (public/data/receipts.json: the Nov 26 root on
 * BSC mainnet at 09:15:17 CT on Nov 25, from the record wallet 0xfa22…94b8), the
 * registry (public/data/agents.json: agents 2923 to 2928 registered on Nov 25
 * from 14:18 to 14:19 CT, agent 2922 at 13:04 CT) and BSC testnet (PRIX and
 * PLNR: name() and symbol() at their addresses, their launch receipts, and the
 * launched round's tax processor's feeRate 1000). Keyed brain:slug for a
 * page and brain:a>brain:b for a connection; a key the file does not hold stops
 * the build, so a renamed page is never left uncorrected.
 */
const SITE_CORRECTIONS = {
  pages: {
    "grand-prix:wattness-grand-prix":
      "No language model writes the plans: each battery's three plans are solved as a mixed-integer program (HiGHS), and the six roles are deterministic code. The bucket's owner, 0xfa22…94b8, is the record wallet that commits each day's root; it holds no agent ID.",
    "grand-prix:forecast-tab":
      "The Nov 26 scenarios on this tab were computed and sealed (09:15:17 CT on Nov 25) before the Forecaster's ID, agent 2925, was registered at 14:19 CT.",
    "grand-prix:hedge-tab":
      "The Nov 26 hedges on this tab were computed and sealed (09:15:17 CT on Nov 25) before the Hedger's ID, agent 2926, was registered at 14:19 CT.",
    "grand-prix:planner-erc-8004-agent-2928":
      "Desert Willow's Nov 26 plan (arm C) was sealed at 09:15:17 CT on Nov 25 by the record wallet 0xfa22…94b8, before agent 2928 was registered at 14:19 CT.",
    "grand-prix:fleet-index":
      "The record wallet 0xfa22…94b8 committed the Nov 26 fleet index's root to GateRecord at 09:15:17 CT on Nov 25, before agent 2928 was registered at 14:19 CT.",
    "grand-prix:prix-season-on-flap": "The read was at 13:07 CT on Nov 25.",
    "grand-prix:prix":
      "PRIX is Grand Prix Season, the season token launched on Flap's Pool Launch on BSC testnet. Flap's protocol fee takes 10% of its 3% tax first; of the rest, 80% goes to the SeasonVault and 20% is burned.",
    "grand-prix:plnr":
      "PLNR is Grand Prix Planner, the agent token launched on our OpenFour deployment on BSC testnet. It graduated into its PancakeSwap V2 pair once the Wattness agent's sealed record was bound to it.",
  },
  connections: {
    "grand-prix:wattness-evaluator>grand-prix:wattness-grand-prix":
      "Agent 2922 is Wattness's own evaluator, not an independent party. Anyone can run the same checks on the Verify tab or from a terminal.",
    "grand-prix:prix>grand-prix:plnr":
      "PRIX and PLNR are both launched tokens on BSC testnet: PRIX through Flap's Pool Launch by the season round, PLNR through our OpenFour deployment.",
  },
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

export default function memory({ repo, readJson, writeJson, copyVerbatim }) {
  const sources = resolve(process.env.GP_SOURCES ?? join(repo, "cache", "site-sources"));
  const src = [arg("--build-brain"), join(sources, "build-brain.json")].filter(Boolean).map((p) => resolve(p)).find((p) => existsSync(p));
  if (!src) {
    let kept = null;
    try {
      kept = execFileSync("git", ["-C", repo, "show", `HEAD:site/public/data/${OUT}`], { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      kept = null;
    }
    if (kept) copyVerbatim(OUT, kept, "Living Brain build brain (kept)");
    else console.warn(`memory: no build-brain.json in ${sources} and none published; ${OUT} is not written`);
    return;
  }

  const f = readJson(src);
  if (f.schema !== "wattness-grand-prix.build-brain.v1") throw new Error(`memory: ${src} is not a build brain site file`);
  const c = f.combined;
  const fix = (table, key, own) => {
    if (own) return own;
    const site = table[key];
    if (site) used.add(key);
    return site;
  };
  const used = new Set();
  const pages = c.pages.map((p) => {
    const correction = fix(SITE_CORRECTIONS.pages, `${p.brain}:${p.slug}`, p.correction);
    return { brain: p.brain, slug: p.slug, title: p.title, summary: p.summary, ...(correction ? { correction } : {}), connections: p.connections };
  });
  const known = new Set(pages.map((p) => `${p.brain}:${p.slug}`));
  const connections = c.connections.map((x) => {
    const aBrain = x.aBrain ?? x.brain;
    const bBrain = x.bBrain ?? x.brain;
    if (!known.has(`${aBrain}:${x.a}`) || !known.has(`${bBrain}:${x.b}`)) throw new Error(`memory: a connection names a page the file does not hold (${x.a}, ${x.b})`);
    const correction = fix(SITE_CORRECTIONS.connections, `${aBrain}:${x.a}>${bBrain}:${x.b}`, x.correction);
    return {
      a: x.a,
      aBrain,
      b: x.b,
      bBrain,
      strength: x.strength,
      similarity: x.similarity,
      reasoning: x.reasoning,
      ...(correction ? { correction } : {}),
      ...(x.conflict ? { conflict: x.conflict } : {}),
      ...(x.made ? { made: x.made.ct } : {}),
    };
  });

  for (const key of [...Object.keys(SITE_CORRECTIONS.pages), ...Object.keys(SITE_CORRECTIONS.connections)]) {
    if (used.has(key)) continue;
    const held = key.includes(">") ? connections.some((x) => `${x.aBrain}:${x.a}>${x.bBrain}:${x.b}` === key) : known.has(key);
    if (!held) throw new Error(`memory: a site correction names ${key}, which the brain does not hold`);
  }

  const gp = (slug) => known.has(`grand-prix:${slug}`);
  const tabs = {};
  for (const [id, t] of Object.entries(f.tabs)) {
    if (!gp(t.page)) throw new Error(`memory: tab ${id} points at ${t.page}, which the brain does not hold`);
    const own = t.describedBy === "the tab's own page";
    tabs[id] = {
      page: t.page,
      also: (t.also ?? []).filter(gp),
      describedBy: t.describedBy,
      relation: own ? "own" : "related",
      ...(t.section ? { section: t.section } : {}),
    };
  }
  for (const [id, n] of Object.entries(NEAREST)) {
    if (tabs[id]) continue;
    if (!gp(n.page)) throw new Error(`memory: the nearest page for ${id}, ${n.page}, is not in the brain`);
    tabs[id] = { page: n.page, also: [], describedBy: `the nearest page; the brain has no page for ${n.label}`, relation: "nearest" };
  }

  writeJson(
    OUT,
    {
      schema: "grand-prix.build-brain.v1",
      brain: {
        id: "grand-prix",
        name: f.brain.name,
        description: f.brain.description,
        readAt: f.brain.readAt.ct,
        readAtUnix: Math.floor(Date.parse(f.brain.readAt.utc) / 1000),
        pages: f.brain.pages,
        connections: f.brain.connections,
        byStrength: f.brain.byStrength,
        notes: { total: f.brain.notes.total, compiled: f.brain.notes.compiled },
        source: f.brain.source,
      },
      brains: c.members.map((m) => ({ id: m.brain, name: m.name, pages: m.pages, connections: m.connections })),
      combined: {
        name: c.name,
        pages: c.pagesAllBrains,
        crossBrainConnections: c.crossBrainConnections,
        checkedAt: c.crossBrainChecked.at.ct,
        checkedAtUnix: Math.floor(Date.parse(c.crossBrainChecked.at.utc) / 1000),
      },
      tabs,
      pages,
      connections,
      conflicts: c.conflicts.map((x) => ({ a: x.a, b: x.b, conflict: x.conflict, correction: x.correction, detected: x.detected.ct })),
    },
    "Living Brain build brain site file (build-brain.json)",
  );
}
