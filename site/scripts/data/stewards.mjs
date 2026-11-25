// Every sealed leaf, packed so the Stewards page can recompute any battery's
// leaf in the browser.
//
// The 316 manifests are 38 MB as written, almost all of it the same input
// list repeated with small differences. The pack keeps each leaf exactly:
//
//   stewards/pack.json            values every leaf shares (`template`) and the
//                                 day's input files in one order (`routes`)
//   stewards/leaves/<R>.json      what is particular to battery R (`overlay`),
//                                 and which routes its input list names, in order
//
// The page rebuilds a manifest as merge(template, overlay) with inputs.files
// put back from the route table, then hashes it. This module rebuilds every
// leaf the same way before writing and refuses to publish a pack that does
// not reproduce its manifest exactly.

import { relative } from "node:path";

const FILES_PATH = ["inputs", "files"];

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Key-sorted JSON, enough to compare two documents for equality. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (isPlain(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/**
 * Splits values into what they share and what each holds alone. Objects with
 * the same keys are split key by key; anything else is shared only when every
 * value is identical.
 */
function split(values) {
  const first = stable(values[0]);
  if (values.every((v) => stable(v) === first)) return { shared: true, template: values[0], overlays: values.map(() => undefined) };
  const keys = isPlain(values[0]) ? Object.keys(values[0]).sort().join("\u0000") : null;
  if (keys !== null && values.every((v) => isPlain(v) && Object.keys(v).sort().join("\u0000") === keys)) {
    const template = {};
    const overlays = values.map(() => ({}));
    for (const k of Object.keys(values[0])) {
      const part = split(values.map((v) => v[k]));
      if (part.shared) {
        template[k] = part.template;
        continue;
      }
      if (part.template !== undefined) template[k] = part.template;
      part.overlays.forEach((o, i) => {
        if (o !== undefined) overlays[i][k] = o;
      });
    }
    return { shared: false, template, overlays };
  }
  return { shared: false, template: undefined, overlays: values };
}

function merge(template, overlay) {
  if (overlay === undefined) return structuredClone(template);
  if (template === undefined || !isPlain(template) || !isPlain(overlay)) return structuredClone(overlay);
  const out = structuredClone(template);
  for (const [k, v] of Object.entries(overlay)) out[k] = merge(out[k], v);
  return out;
}

function getPath(doc, path) {
  return path.reduce((o, k) => o?.[k], doc);
}

function withoutPath(doc, path) {
  const copy = structuredClone(doc);
  const parent = getPath(copy, path.slice(0, -1));
  delete parent[path[path.length - 1]];
  return copy;
}

/**
 * One order of every route such that each leaf's list keeps its own order
 * (a topological sort of "comes before" over all lists). Ties go to the
 * route seen first, so the order is the same on every build.
 */
function routeOrder(lists) {
  const seen = new Map();
  const after = new Map();
  const indegree = new Map();
  for (const list of lists) {
    list.forEach((f, i) => {
      if (!seen.has(f.route)) {
        seen.set(f.route, { at: seen.size, sha256: f.sha256 });
        after.set(f.route, new Set());
        indegree.set(f.route, 0);
      } else if (seen.get(f.route).sha256 !== f.sha256) {
        throw new Error(`stewards: ${f.route} has two digests across leaves`);
      }
      if (i > 0) {
        const prev = list[i - 1].route;
        const next = after.get(prev);
        if (!next.has(f.route)) {
          next.add(f.route);
          indegree.set(f.route, indegree.get(f.route) + 1);
        }
      }
    });
  }
  const ready = [...seen.keys()].filter((r) => indegree.get(r) === 0);
  const order = [];
  while (ready.length) {
    ready.sort((a, b) => seen.get(a).at - seen.get(b).at);
    const r = ready.shift();
    order.push(r);
    for (const n of after.get(r)) {
      indegree.set(n, indegree.get(n) - 1);
      if (indegree.get(n) === 0) ready.push(n);
    }
  }
  if (order.length !== seen.size) return null;
  return order.map((r) => [r, seen.get(r).sha256]);
}

/** Positions as a bitmap over the route table, base64; null when the list is not in table order. */
function bitmap(positions, size) {
  for (let i = 1; i < positions.length; i++) if (positions[i] <= positions[i - 1]) return null;
  const bytes = Buffer.alloc(Math.ceil(size / 8));
  for (const p of positions) bytes[p >> 3] |= 0x80 >> (p & 7);
  return bytes.toString("base64");
}

function unbitmap(b64, size) {
  const bytes = Buffer.from(b64, "base64");
  const out = [];
  for (let p = 0; p < size; p++) if (bytes[p >> 3] & (0x80 >> (p & 7))) out.push(p);
  return out;
}

export default function stewards(ctx) {
  const entries = ctx.day.leaves.map((e, index) => ({ ...e, index, doc: ctx.leaf(e.resource) })).filter((e) => e.doc);
  if (entries.length === 0) return;

  const lists = entries.map((e) => getPath(e.doc, FILES_PATH));
  const routes = routeOrder(lists) ?? [];
  const position = new Map(routes.map(([r], i) => [r, i]));

  const parts = split(entries.map((e) => withoutPath(e.doc, FILES_PATH)));
  const template = parts.shared ? parts.template : (parts.template ?? {});

  const leaves = entries.map((e, i) => {
    const list = lists[i];
    const positions = list.map((f) => position.get(f.route));
    const files = (positions.every((p) => p !== undefined) && bitmap(positions, routes.length)) || list.map((f) => [f.route, f.sha256]);
    return { schema: "grand-prix.stewards-leaf.v1", resource: e.resource, index: e.index, leaf: e.leaf, overlay: parts.overlays[i] ?? {}, files };
  });

  // Rebuild every leaf from what will be published and compare it whole.
  leaves.forEach((l, i) => {
    const doc = merge(template, l.overlay);
    const files =
      typeof l.files === "string"
        ? unbitmap(l.files, routes.length).map((p) => ({ route: routes[p][0], sha256: routes[p][1] }))
        : l.files.map(([route, sha256]) => ({ route, sha256 }));
    getPath(doc, FILES_PATH.slice(0, -1))[FILES_PATH[FILES_PATH.length - 1]] = files;
    if (stable(doc) !== stable(entries[i].doc)) throw new Error(`stewards: the pack does not rebuild ${l.resource}`);
  });

  const src = relative(ctx.repo, ctx.dayDir);
  ctx.writeJson(
    "stewards/pack.json",
    {
      schema: "grand-prix.stewards-pack.v1",
      operatingDay: ctx.day.operating_day,
      root: ctx.day.root,
      leafCount: ctx.day.leaf_count,
      resources: leaves.map((l) => l.resource),
      filesPath: FILES_PATH,
      template,
      routes,
    },
    `${src}/leaves (shared values)`,
  );
  for (const l of leaves) ctx.writeJson(`stewards/leaves/${l.resource}.json`, l, `${src}/leaves/${l.resource}.json`);
}
