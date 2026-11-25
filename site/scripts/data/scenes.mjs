// memory-graph.json for the Brain map scene: Living Brain's pages and
// connections for "Wattness Brain", each page tied to the Terminal part it
// describes. Built from the brain.json and terminal-structure.json this run
// has just published, so it carries no account fields either.

import { existsSync } from "node:fs";
import { join } from "node:path";

// The page each Living Brain page was compiled from, by its slug. The pages were
// ingested from the Terminal's architecture export, one per part or theme, so
// the tie is read off the page's own subject (its title and summary).
const DESCRIBES = {
  "wattness-terminal": null, // the whole Terminal
  "cached-disclosure": "source:fleet",
  "fleet-reference": "source:fleet",
  "mapped-locations": "source:geo",
  "fleet-board-reader": "reader:fbd",
  "battery-page-reader": "reader:fesr",
  "qses-reader": "reader:fqse",
  "shared-section-projections": "reader:fmon",
  "wattness-terminal-shared-fleet-view": "state:fleet",
  "battery-focus": "state:focus",
  "pane-display-settings": "state:panes",
  "fleet-board": "pane:fbd",
  "wattness-terminal-battery-page": "pane:fesr",
  qses: "pane:fqse",
  "month-close": "pane:fmon",
  "my-battery": "workspace:my-battery",
  "wattness-terminal-fleet": "workspace:fleet",
  ness: "ness:routes",
};

export default function scenes({ outDir, readJson, writeJson }) {
  const brainPath = join(outDir, "brain.json");
  const structurePath = join(outDir, "terminal-structure.json");
  if (!existsSync(brainPath) || !existsSync(structurePath)) {
    console.warn("scenes: brain.json or terminal-structure.json is absent; memory-graph.json is not written");
    return;
  }
  const brain = readJson(brainPath);
  const structure = readJson(structurePath);
  const parts = new Set(structure.nodes.map((n) => n.id));

  const pages = brain.pages.map((p) => {
    const known = Object.hasOwn(DESCRIBES, p.slug);
    let describes = known ? DESCRIBES[p.slug] : null;
    if (describes && !parts.has(describes)) {
      console.warn(`scenes: ${p.slug} names ${describes}, which the Terminal graph does not hold`);
      describes = null;
    }
    if (!known) console.warn(`scenes: no Terminal part recorded for page ${p.slug}`);
    return {
      slug: p.slug,
      title: p.title,
      summary: p.summary ?? "",
      describes,
      scope: known && DESCRIBES[p.slug] === null ? "terminal" : describes ? "part" : "unplaced",
    };
  });
  const slugs = new Set(pages.map((p) => p.slug));
  const connections = brain.connections
    .filter((c) => slugs.has(c.pageASlug) && slugs.has(c.pageBSlug))
    .map((c) => ({
      a: c.pageASlug,
      b: c.pageBSlug,
      strength: c.strength ?? null,
      similarity: typeof c.similarity === "number" ? Math.round(c.similarity * 1000) / 1000 : null,
    }));

  writeJson(
    "memory-graph.json",
    {
      schema: "grand-prix.memory-graph.v1",
      brain: brain.brain,
      counts: { pages: pages.length, connections: connections.length, parts: structure.nodes.length, links: structure.edges.length },
      pages,
      connections,
    },
    "brain.json and terminal-structure.json (scripts/data/scenes.mjs)",
  );
}
