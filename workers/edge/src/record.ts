// What vouches for each file of a sealed day, and the checks that establish it. The chain holds one root
// per day; the index lists the leaves under it; each leaf names its scenario set by digest and its outside
// inputs by SHA-256. A file is served only once its place in that chain of hashes is shown.
import { gateTs, isoFromOd } from "../../../packages/core/src/gate.ts";
import { codeHashFromTree, recordKey, scopeId, type ChainRecord } from "./abi.ts";
import { fileSha256, fromUtf8, isBytes32, utf8, type Hex } from "./bytes.ts";
import { readCommitTx, readDayRecord, type DayRecord } from "./chain.ts";
import { FLEET_SCHEMA, MANIFEST_SCHEMA, MIN_CONFIRMATIONS, NETWORKS, PLAN_SCOPE_LABEL, type Config, type NetworkName } from "./config.ts";
import { EdgeError } from "./errors.ts";
import { fetchObject, isPlainPath, objectUrl, type StoredObject } from "./greenfield.ts";
import { canonicalJson } from "./jcs.ts";
import { leafHash, merkleRoot } from "./merkle.ts";

export type Result = "pass" | "fail";

/** One comparison: its name, the values compared under plain labels, and whether they agree. */
export interface Comparison {
  name: string;
  ok: boolean;
  [label: string]: unknown;
}

export interface Check {
  name: string;
  /** The repository verifier's check this one corresponds to, where there is one. */
  verifier?: "V1" | "V2" | "V3";
  result: Result;
  rule: string;
  compared: Comparison[];
  /** For V1 to V3, the lines the repository verifier prints for the same check. */
  details: string[];
}

export const comparison = (name: string, ok: boolean, values: Record<string, unknown>): Comparison => ({ name, ...values, ok });
export const same = (name: string, a: [string, unknown], b: [string, unknown]): Comparison => comparison(name, a[1] === b[1], { [a[0]]: a[1], [b[0]]: b[1] });

export function check(name: string, rule: string, compared: Comparison[], extra: { verifier?: Check["verifier"]; details?: string[] } = {}): Check {
  return {
    name,
    ...(extra.verifier ? { verifier: extra.verifier } : {}),
    result: compared.every((c) => c.ok) ? "pass" : "fail",
    rule,
    compared,
    details: extra.details ?? [],
  };
}

/**
 * A value as a reason prints it: as JSON, so a string is quoted and "135677078" is not 135677078, with
 * anything outside printable ASCII escaped, so a trailing space, a CR or a BOM shows.
 */
function shown(v: unknown): string {
  let json: string | undefined;
  try {
    json = JSON.stringify(v);
  } catch {
    json = undefined;
  }
  if (json === undefined) return String(v);
  return json.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

const describe = (c: Comparison): string => {
  const values = Object.entries(c)
    .filter(([k]) => k !== "name" && k !== "ok")
    .map(([k, v]) => `${k} ${shown(v)}`);
  return values.length > 0 ? `${c.name}: ${values.join(", ")}` : c.name;
};

/** The failing comparisons of the failing checks, in one line. */
export const reasonOf = (checks: readonly Check[]): string =>
  checks
    .filter((c) => c.result === "fail")
    .map((c) => `${c.name} (${c.compared.filter((x) => !x.ok).map(describe).join("; ")})`)
    .join("; ");

function refuse(what: string, checks: readonly Check[]): void {
  if (checks.some((c) => c.result === "fail")) throw new EdgeError(502, `${what} is not served: ${reasonOf(checks)}`);
}

// ---------------------------------------------------------------------------------------------------------
// Parsing

export interface FleetLeaf {
  resource: string;
  leaf: Hex;
  manifest: string;
  scenarios: string;
}

export interface FleetIndex {
  schema: string;
  operating_day: string;
  scope_label: string;
  gate_unix: number;
  plan_unix: number;
  code_tree: string;
  root: Hex;
  leaf_count: number;
  showcase: string | null;
  leaves: FleetLeaf[];
  exclusions: { resource: string; reason: string }[];
}

/**
 * The index fields no hash covers: the publisher's statements, served as published. An entry's file
 * paths are not among them: they must be leaves/<R>.json and leaves/<R>.scenarios.json for its battery R.
 */
export const INDEX_NOT_COVERED = ["exclusions", "showcase", "plan_unix"] as const;

export interface Parsed {
  object: StoredObject;
  text: string;
  doc: unknown;
}

export function parseJson(object: StoredObject, what: string): Parsed {
  let text: string;
  try {
    text = fromUtf8(object.bytes);
  } catch {
    throw new EdgeError(502, `${what} is not served: its bytes are not UTF-8`);
  }
  try {
    return { object, text, doc: JSON.parse(text) as unknown };
  } catch (err) {
    throw new EdgeError(502, `${what} is not served: it is not JSON (${(err as Error).message})`);
  }
}

/**
 * Hashes cover a document, not its whitespace. Requiring the bytes to be the document's own rendering, the
 * publisher's JSON.stringify(doc, null, 2) and a newline or the RFC 8785 form itself, means no byte rides
 * along unchecked: no padding, no duplicate key a different parser would read the other way, no escapes.
 * The order of an object's keys is the exception: RFC 8785 sorts them, so no hash fixes it.
 */
export function renderingOf(text: string, doc: unknown): "pretty-printed" | "RFC 8785" | null {
  if (text === `${JSON.stringify(doc, null, 2)}\n`) return "pretty-printed";
  try {
    const c = canonicalJson(doc);
    if (text === c || text === `${c}\n`) return "RFC 8785";
  } catch {
    // Not hashable, so it has no canonical form.
  }
  return null;
}

const byteForm = (p: Parsed): Check => {
  const found = renderingOf(p.text, p.doc);
  return check("byte form", "the bytes are the document's own rendering, pretty-printed with a final newline or in RFC 8785 form", [
    comparison("rendering", found !== null, { found: found ?? "neither form (extra whitespace, a duplicate key, an escape or a missing newline)" }),
  ]);
};

const RESOURCE = /^[A-Z0-9_]+$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const get = (v: unknown, ...path: string[]): unknown => path.reduce<unknown>((o, k) => (isRecord(o) ? o[k] : undefined), v);

// The fields the planner writes (core's FleetIndex), and the only ones an index may hold: a field no check
// reads would be served as verified, and x-gate-not-covered would not name it.
const INDEX_FIELDS = ["schema", "operating_day", "scope_label", "gate_unix", "plan_unix", "code_tree", "root", "leaf_count", "showcase", "leaves", "exclusions"];
const LEAF_FIELDS = ["resource", "leaf", "manifest", "scenarios"];
const EXCLUSION_FIELDS = ["resource", "reason"];

/** Fields beside the allowed ones, and allowed ones that are absent. */
const fieldProblems = (where: string, o: Record<string, unknown>, allowed: readonly string[]): string[] => [
  ...Object.keys(o)
    .filter((k) => !allowed.includes(k))
    .map((k) => `${where}: unknown field ${JSON.stringify(k)}`),
  ...allowed.filter((k) => !Object.hasOwn(o, k)).map((k) => `${where}: missing field ${JSON.stringify(k)}`),
];

/** Core's fleetIndexErrors, plus the checks a reader needs before using the index to fetch files. */
export function indexShapeErrors(doc: unknown, day: string): { problems: string[]; root: Hex | null } {
  const out: string[] = [];
  if (!isRecord(doc)) return { problems: ["index: expected object"], root: null };
  out.push(...fieldProblems("index", doc, INDEX_FIELDS));
  const d = doc as Partial<FleetIndex>;
  if (d.schema !== FLEET_SCHEMA) out.push(`schema: expected ${FLEET_SCHEMA}`);
  if (!Array.isArray(d.leaves) || d.leaves.length === 0) return { problems: [...out, "leaves: expected a non-empty array"], root: null };
  const leaves = d.leaves as unknown[];
  if (!leaves.every(isRecord)) return { problems: [...out, "leaves: expected objects"], root: null };
  const entries = leaves as Partial<FleetLeaf>[];
  leaves.forEach((l, i) => out.push(...fieldProblems(`leaves: ${typeof l.resource === "string" ? l.resource : `entry ${i + 1}`}`, l, LEAF_FIELDS)));
  const names = entries.map((l) => l.resource);
  if (names.some((n) => typeof n !== "string" || !RESOURCE.test(n))) out.push("leaves: bad resource name");
  for (let i = 1; i < names.length; i++) {
    if (!((names[i - 1] as string) < (names[i] as string))) out.push(`leaves: ${names[i]} is out of order or repeated`);
  }
  // No hash covers the paths, so they are fixed by the battery's name: a request for leaves/<R>.json can
  // then only reach R's entry, and the leaf's own battery.resource, checked when it is served, must be R.
  for (const l of entries) {
    const r = String(l.resource);
    if (l.manifest !== `leaves/${r}.json`) out.push(`leaves: ${r} names ${JSON.stringify(l.manifest)} as its manifest, not leaves/${r}.json`);
    if (l.scenarios !== `leaves/${r}.scenarios.json`) out.push(`leaves: ${r} names ${JSON.stringify(l.scenarios)} as its scenario set, not leaves/${r}.scenarios.json`);
  }
  if (d.leaf_count !== leaves.length) out.push(`leaf_count ${d.leaf_count}, ${leaves.length} leaves listed`);
  let root: Hex | null = null;
  if (entries.every((l) => isBytes32(l.leaf))) {
    root = merkleRoot(entries.map((l) => l.leaf as Hex));
    if (d.root !== root) out.push(`root ${d.root}, leaves give ${root}`);
  } else out.push("leaves: a leaf hash is not 32 bytes of lowercase hex");
  if (d.showcase !== null && d.showcase !== undefined && !names.includes(d.showcase)) out.push(`showcase ${d.showcase} is not a leaf`);
  if (!/^[0-9a-f]{40}$/.test(d.code_tree ?? "")) out.push("code_tree: expected 40 lowercase hex digits");
  if (d.scope_label !== PLAN_SCOPE_LABEL) out.push(`scope_label: expected ${PLAN_SCOPE_LABEL}, got ${JSON.stringify(d.scope_label)}`);
  if (d.operating_day !== day) out.push(`operating_day ${JSON.stringify(d.operating_day)}, this is the record of ${day}`);
  else {
    const gate = gateTs(Number(day.replaceAll("-", "")));
    if (d.gate_unix !== gate) out.push(`gate_unix ${d.gate_unix}, the gate for ${day} is ${gate}`);
    if (!(Number.isSafeInteger(d.plan_unix) && (d.plan_unix as number) < gate)) out.push(`plan_unix ${d.plan_unix} is not before the gate ${gate}`);
  }
  const exclusions: unknown = d.exclusions;
  if (!Array.isArray(exclusions) || !exclusions.every(isRecord)) out.push("exclusions: expected a list of {resource, reason}");
  else {
    exclusions.forEach((e, i) => {
      const where = `exclusions: ${typeof e.resource === "string" ? e.resource : `entry ${i + 1}`}`;
      out.push(...fieldProblems(where, e, EXCLUSION_FIELDS));
      for (const k of EXCLUSION_FIELDS) if (Object.hasOwn(e, k) && typeof e[k] !== "string") out.push(`${where}: ${k} ${JSON.stringify(e[k])} is not a string`);
    });
  }
  return { problems: out, root };
}

// ---------------------------------------------------------------------------------------------------------
// The day's index, on each network asked for

export interface Day {
  cfg: Config;
  od: number;
  day: string;
  /** A day's object, fetched at most once per request. */
  object(path: string): Promise<StoredObject | null>;
}

export function dayOf(cfg: Config, od: number): Day {
  const fetched = new Map<string, Promise<StoredObject | null>>();
  return {
    cfg,
    od,
    day: isoFromOd(od),
    object(path) {
      let p = fetched.get(path);
      if (!p) fetched.set(path, (p = fetchObject(cfg, od, path)));
      return p;
    },
  };
}

export interface SealedIndex {
  network: NetworkName;
  index: FleetIndex;
  bytes: Uint8Array;
  text: string;
  sha256: string;
  source: string;
  chain: DayRecord;
  record: ChainRecord;
  gate: number;
  confirmations: number;
  checks: Check[];
}

// Verified results only, and only for records deep enough to stay: GateRecord is write-once, so a day
// verified here stays verified. Bounded, oldest first out.
const sealedMemo = new Map<string, SealedIndex>();
const leafMemo = new Map<Hex, LeafFacts>();
const remember = <K, V>(map: Map<K, V>, key: K, value: V, max: number) => {
  map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value as K);
};

/** Drops what this isolate has verified; for tests. */
export function forgetVerified(): void {
  sealedMemo.clear();
  leafMemo.clear();
}

export const INDEX_OBJECT = "manifest.json";

export async function sealedIndex(day: Day, network: NetworkName): Promise<SealedIndex> {
  const memoKey = `${day.od}|${network}`;
  const known = sealedMemo.get(memoKey);
  if (known) return known;

  const object = await day.object(INDEX_OBJECT);
  if (!object) throw new EdgeError(404, `no record is published for ${day.day}: Greenfield has no od-${day.od}/${INDEX_OBJECT}`);
  const what = `the index of ${day.day}`;
  const parsed = parseJson(object, what);
  const shape = indexShapeErrors(parsed.doc, day.day);
  const form = byteForm(parsed);
  refuse(what, [form, check("index shape", "core's fleetIndexErrors", shape.problems.map((p) => comparison(p, false, {})))]);
  const index = parsed.doc as FleetIndex;

  const chain = await readDayRecord(day.cfg, network, day.od);
  const chainCheck = check("RPC chain", "the RPC is on the network asked for", [same("chain id", ["RPC", chain.chainId], [network, NETWORKS[network]])]);
  refuse(what, [chainCheck]);
  if (!chain.record) {
    throw new EdgeError(404, `GateRecord on ${network} holds no record of ${chain.committer} for ${day.day} (key ${chain.key}); nothing is served for that day`);
  }
  const record = chain.record;
  const gate = gateTs(day.od);
  const checks: Check[] = [
    form,
    check("index shape", "schema, leaves in resource order, leaf_count, code_tree, scope_label, operating_day, gate_unix, plan_unix before the gate, each battery's files at leaves/<R>.json and leaves/<R>.scenarios.json, the planner's fields and no others", [
      comparison("fields", true, { checked: `${index.leaves.length} leaves` }),
    ]),
    check("root recomputes", "the RFC 6962 root over the index's leaf hashes, in order, is the index's root", [
      same("root", ["index", index.root], [`recomputed from ${index.leaves.length} leaves`, shape.root]),
    ]),
    chainCheck,
    check("record key", "keccak256(abi.encode(committer, keccak256(scope label), od)) is GateRecord.keyOf's answer", [
      same("key", ["computed", chain.key], ["GateRecord.keyOf", chain.keyOf]),
    ]),
    check("on-chain record", `GateRecord.get(key) on ${network} holds this index's root`, [
      same("root", ["on chain", record.root], ["index", index.root]),
      same("leaf count", ["on chain", record.leafCount], ["index", index.leaf_count]),
      same("code hash", ["on chain", record.codeHash], ["index code_tree", codeHashFromTree(index.code_tree)]),
      same("operating day", ["on chain", record.od], ["asked", day.od]),
      same("scope", ["on chain", record.scope], [PLAN_SCOPE_LABEL, chain.scope]),
      same("committer", ["on chain", record.committer], ["served", chain.committer]),
    ]),
    check("gate", "committed before 10:00 Central on the day before, the gate computed as GateRecord.gateTs computes it", [
      comparison("gate", gate === chain.contractGate && gate === index.gate_unix, {
        "computed as the contract does": gate,
        "GateRecord.gateTs": chain.contractGate,
        index: index.gate_unix,
      }),
      comparison("committed before the gate", record.committedAt < gate, {
        "committed at": record.committedAt,
        gate,
        "seconds before": gate - record.committedAt,
      }),
    ]),
  ];
  refuse(`${what} on ${network}`, checks);
  const sealed: SealedIndex = {
    network,
    index,
    bytes: object.bytes,
    text: parsed.text,
    sha256: fileSha256(object.bytes),
    source: object.url,
    chain,
    record,
    gate,
    confirmations: chain.head - record.blockNumber,
    checks,
  };
  if (sealed.confirmations >= MIN_CONFIRMATIONS) remember(sealedMemo, memoKey, sealed, 32);
  return sealed;
}

/** The index verified on every network asked for; they must vouch for the same bytes. */
export async function sealedIndexes(day: Day, networks: readonly NetworkName[]): Promise<SealedIndex[]> {
  const all = await Promise.all(networks.map((n) => sealedIndex(day, n)));
  const first = all[0] as SealedIndex;
  for (const s of all) {
    if (s.sha256 !== first.sha256) throw new EdgeError(502, `${s.network} and ${first.network} vouch for different copies of the index of ${day.day}`);
  }
  return all;
}

// ---------------------------------------------------------------------------------------------------------
// The files under the root

/** What a verified leaf says about the files beside it. */
export interface LeafFacts {
  resource: string;
  leaf: Hex;
  position: number;
  scenariosDigest: unknown;
  salt: unknown;
  /** Files beside the record the leaf names by SHA-256 (an outside input's saved response). */
  outside: { name: string; route: string; sha256: string }[];
}

export interface Served {
  path: string;
  bytes: Uint8Array;
  contentType: string;
  checks: Check[];
  /** One sentence: what the bytes were checked against. */
  basis: string;
  source: string;
  sealed: SealedIndex[];
  /** For the envelope: the parsed document, or the text of a text file. */
  document: unknown;
  notCovered?: readonly string[];
  /** A file checked against a chain directly (a receipt), when no index was asked for. */
  chain?: DayRecord;
}

const contentTypeOf = (path: string) =>
  path.endsWith(".json") ? "application/json; charset=utf-8" : /\.(hex|txt)$/.test(path) ? "text/plain; charset=utf-8" : "application/octet-stream";

const indexSealed = (sealed: readonly SealedIndex[]): Check =>
  check(
    "index sealed",
    "the index this file is checked against has passed every index check on each network asked for",
    sealed.map((s) => comparison(s.network, s.checks.every((c) => c.result === "pass"), { root: s.record.root, block: s.record.blockNumber })),
  );

const rootsOf = (sealed: readonly SealedIndex[]) => sealed.map((s) => `${s.record.root} on ${s.network}`).join(" and ");

export function serveIndex(sealed: SealedIndex[]): Served {
  const s = sealed[0] as SealedIndex;
  return {
    path: "index.json",
    bytes: s.bytes,
    contentType: contentTypeOf("index.json"),
    checks: sealed.length === 1 ? s.checks : sealed.flatMap((x) => x.checks.map((c) => ({ ...c, name: `${c.name} (${x.network})` }))),
    basis: `the root over its ${s.index.leaf_count} leaf hashes is ${rootsOf(sealed)}, committed ${s.gate - s.record.committedAt} s before the gate; ${INDEX_NOT_COVERED.join(", ")} are the publisher's and no hash covers them`,
    source: s.source,
    sealed,
    document: s.index,
    notCovered: INDEX_NOT_COVERED,
  };
}

function collectOutside(doc: unknown): LeafFacts["outside"] {
  const inputs = get(doc, "outside_inputs");
  if (!isRecord(inputs)) return [];
  const out: LeafFacts["outside"] = [];
  for (const [name, input] of Object.entries(inputs)) {
    const route = get(input, "response", "route");
    const digest = get(input, "response", "sha256");
    if (typeof route === "string" && isPlainPath(route) && typeof digest === "string" && /^[0-9a-f]{64}$/.test(digest)) out.push({ name, route, sha256: digest });
  }
  return out;
}

export async function sealedLeaf(day: Day, sealed: readonly SealedIndex[], position: number): Promise<{ served: Served; facts: LeafFacts }> {
  const s = sealed[0] as SealedIndex;
  const entry = s.index.leaves[position] as FleetLeaf;
  const object = await day.object(entry.manifest);
  if (!object) throw new EdgeError(502, `the index of ${day.day} names ${entry.manifest}, and Greenfield has no such object`);
  const parsed = parseJson(object, entry.manifest);
  const computed = leafHash(parsed.doc);
  const doc = parsed.doc;
  const checks: Check[] = [
    byteForm(parsed),
    check("leaf hash", "SHA-256(0x00 || RFC 8785 form of the document) is the index's leaf for this battery", [
      same("leaf", ["computed", computed], [`index, leaf ${position + 1} of ${s.index.leaf_count}`, entry.leaf]),
    ]),
    check("battery", "the document is this battery's plan for this day, by the agent whose records are served", [
      same("schema", ["document", get(doc, "schema")], ["expected", MANIFEST_SCHEMA]),
      same("resource", ["document", get(doc, "battery", "resource")], ["index", entry.resource]),
      same("operating day", ["document", get(doc, "operating_day")], ["asked", day.day]),
      same("agent wallet", ["document", String(get(doc, "agent", "wallet")).toLowerCase()], ["served", day.cfg.committer.toLowerCase()]),
    ]),
    indexSealed(sealed),
  ];
  refuse(entry.manifest, checks);
  const facts: LeafFacts = {
    resource: entry.resource,
    leaf: entry.leaf,
    position,
    scenariosDigest: get(doc, "scenarios", "digest_sha256"),
    salt: get(doc, "salt"),
    outside: collectOutside(doc),
  };
  remember(leafMemo, entry.leaf, facts, 1024);
  return {
    facts,
    served: {
      path: entry.manifest,
      bytes: object.bytes,
      contentType: contentTypeOf(entry.manifest),
      checks,
      basis: `leaf ${position + 1} of ${s.index.leaf_count} under ${rootsOf(sealed)}: SHA-256(0x00 || RFC 8785 form) is ${computed}`,
      source: object.url,
      sealed: [...sealed],
      document: doc,
    },
  };
}

/**
 * The facts of the entry's leaf: remembered, when this isolate verified that leaf under the same name, or
 * read and checked now. The memo is keyed by hash, and the root fixes the hash, not the name beside it.
 */
async function leafFacts(day: Day, sealed: readonly SealedIndex[], position: number): Promise<LeafFacts> {
  const entry = (sealed[0] as SealedIndex).index.leaves[position] as FleetLeaf;
  const known = leafMemo.get(entry.leaf);
  return known && known.resource === entry.resource ? known : (await sealedLeaf(day, sealed, position)).facts;
}

export async function sealedScenarios(day: Day, sealed: readonly SealedIndex[], position: number): Promise<Served> {
  const entry = (sealed[0] as SealedIndex).index.leaves[position] as FleetLeaf;
  const facts = await leafFacts(day, sealed, position);
  const object = await day.object(entry.scenarios);
  if (!object) throw new EdgeError(502, `the index of ${day.day} names ${entry.scenarios}, and Greenfield has no such object`);
  const parsed = parseJson(object, entry.scenarios);
  let computed: string;
  try {
    computed = fileSha256(utf8(canonicalJson(parsed.doc)));
  } catch (err) {
    computed = `none: ${(err as Error).message}`;
  }
  const checks: Check[] = [
    byteForm(parsed),
    check("scenario digest", "SHA-256 of the RFC 8785 form is the digest the battery's verified leaf names", [
      same("digest", ["computed", computed], [`${entry.resource}'s leaf, scenarios.digest_sha256`, facts.scenariosDigest]),
    ]),
    indexSealed(sealed),
  ];
  refuse(entry.scenarios, checks);
  return {
    path: entry.scenarios,
    bytes: object.bytes,
    contentType: contentTypeOf(entry.scenarios),
    checks,
    basis: `the scenario set ${entry.resource}'s leaf ${facts.leaf} names by digest ${computed}, under ${rootsOf(sealed)}`,
    source: object.url,
    sealed: [...sealed],
    document: parsed.doc,
  };
}

/** The leaf whose statements about shared files are read: the showcase, or the first leaf. */
const referencePosition = (index: FleetIndex): number => {
  const at = index.showcase ? index.leaves.findIndex((l) => l.resource === index.showcase) : -1;
  return at >= 0 ? at : 0;
};

const textLine = (text: string, value: string) => text === `${value}\n` || text === value;

function textOf(object: StoredObject, what: string): string {
  try {
    return fromUtf8(object.bytes);
  } catch {
    throw new EdgeError(502, `${what} is not served: its bytes are not UTF-8`);
  }
}

export async function sealedRootFile(day: Day, sealed: readonly SealedIndex[]): Promise<Served> {
  const path = "root.hex";
  const object = await day.object(path);
  if (!object) throw new EdgeError(404, `Greenfield has no od-${day.od}/${path}`);
  const text = textOf(object, path);
  const checks = [
    check(
      "root file",
      "the file is the committed root and a newline",
      sealed.map((s) => comparison(s.network, textLine(text, s.record.root), { file: text.slice(0, 80), "on chain": s.record.root })),
    ),
  ];
  refuse(path, checks);
  return { path, bytes: object.bytes, contentType: contentTypeOf(path), checks, basis: `the root GateRecord holds: ${rootsOf(sealed)}`, source: object.url, sealed: [...sealed], document: text };
}

export async function sealedSalt(day: Day, sealed: readonly SealedIndex[]): Promise<Served> {
  const path = "salt.txt";
  const s = sealed[0] as SealedIndex;
  const facts = await leafFacts(day, sealed, referencePosition(s.index));
  const object = await day.object(path);
  if (!object) throw new EdgeError(404, `Greenfield has no od-${day.od}/${path}`);
  const text = textOf(object, path);
  const checks = [
    check("salt", "the file is the salt inside the verified leaf, and a newline", [
      comparison("salt", typeof facts.salt === "string" && textLine(text, facts.salt), { file: text.slice(0, 80), [`${facts.resource}'s leaf`]: facts.salt }),
    ]),
    indexSealed(sealed),
  ];
  refuse(path, checks);
  return { path, bytes: object.bytes, contentType: contentTypeOf(path), checks, basis: `the salt inside ${facts.resource}'s verified leaf ${facts.leaf}`, source: object.url, sealed: [...sealed], document: text };
}

/** A file beside the record that the reference leaf names by SHA-256, or null if it names no such file. */
export async function sealedOutsideFile(day: Day, sealed: readonly SealedIndex[], path: string): Promise<Served | null> {
  const s = sealed[0] as SealedIndex;
  const facts = await leafFacts(day, sealed, referencePosition(s.index));
  const ref = facts.outside.find((o) => o.route === path);
  if (!ref) return null;
  const object = await day.object(path);
  if (!object) throw new EdgeError(502, `${facts.resource}'s leaf names ${path}, and Greenfield has no such object`);
  const digest = fileSha256(object.bytes);
  const checks = [
    check("file digest", "SHA-256 of the bytes is the digest the verified leaf records for its outside input", [
      same("sha256", ["computed", digest], [`${facts.resource}'s leaf, outside_inputs.${ref.name}.response`, ref.sha256]),
    ]),
    indexSealed(sealed),
  ];
  refuse(path, checks);
  let document: unknown = null;
  try {
    document = JSON.parse(fromUtf8(object.bytes)) as unknown;
  } catch {
    document = null;
  }
  return { path, bytes: object.bytes, contentType: contentTypeOf(path), checks, basis: `the SHA-256 ${facts.resource}'s verified leaf ${facts.leaf} records for outside_inputs.${ref.name}`, source: object.url, sealed: [...sealed], document };
}

const RECEIPT_KEYS = ["mode", "chainId", "contract", "key", "scope", "scopeLabel", "txHash", "root", "leafCount", "codeHash", "blockNumber", "committedAt"];

/** record.<network>.json: every field against GateRecord on that network, and the transaction that committed it. */
export async function sealedReceipt(day: Day, network: NetworkName): Promise<Served> {
  const path = `record.${network}.json`;
  const object = await day.object(path);
  if (!object) throw new EdgeError(404, `Greenfield has no od-${day.od}/${path}`);
  const parsed = parseJson(object, path);
  const r: Record<string, unknown> = isRecord(parsed.doc) ? parsed.doc : {};
  const chain = await readDayRecord(day.cfg, network, day.od);
  const rec = chain.record;
  if (!rec) throw new EdgeError(502, `${path} is not served: GateRecord on ${network} holds no record of ${chain.committer} for ${day.day}`);
  const keys = Object.keys(r).sort();
  const fields = check("receipt fields", `every field is what GateRecord on ${network} holds, and there are no others`, [
    same("fields", ["receipt", keys.join(",")], ["expected", [...RECEIPT_KEYS].sort().join(",")]),
    same("mode", ["receipt", r.mode], ["expected", "contract"]),
    same("chain id", ["receipt", r.chainId], [network, NETWORKS[network]]),
    same("chain id of the RPC", ["RPC", chain.chainId], [network, NETWORKS[network]]),
    // Exactly: both are in checksum form, and a copy in another case is other bytes.
    same("contract", ["receipt", r.contract], ["served", chain.contract]),
    same("scope label", ["receipt", r.scopeLabel], ["expected", PLAN_SCOPE_LABEL]),
    same("scope", ["receipt", r.scope], ["keccak256(scope label)", typeof r.scopeLabel === "string" && r.scopeLabel ? scopeId(r.scopeLabel) : null]),
    same("key", ["receipt", r.key], ["computed", recordKey(chain.committer, chain.scope, day.od)]),
    same("key of the contract", ["GateRecord.keyOf", chain.keyOf], ["computed", chain.key]),
    same("root", ["receipt", r.root], ["on chain", rec.root]),
    same("leaf count", ["receipt", r.leafCount], ["on chain", rec.leafCount]),
    same("code hash", ["receipt", r.codeHash], ["on chain", rec.codeHash]),
    same("block", ["receipt", r.blockNumber], ["on chain", rec.blockNumber]),
    same("committed at", ["receipt", r.committedAt], ["on chain", rec.committedAt]),
  ]);
  // Refused on its own bytes and fields first: a receipt that fails them is refused with those reasons,
  // whatever an RPC would say about the transaction it names.
  const form = byteForm(parsed);
  refuse(path, [form, fields]);
  const txHash = typeof r.txHash === "string" && /^0x[0-9a-f]{64}$/.test(r.txHash) ? (r.txHash as Hex) : null;
  const tx = txHash ? await readCommitTx(day.cfg, network, txHash) : null;
  const event = tx?.committed.length === 1 ? tx.committed[0] : undefined;
  const txCheck = check("commit transaction", "the receipt's transaction succeeded, called GateRecord in the record's block and logged one Committed event for this record", [
    comparison("transaction", tx !== null, { receipt: r.txHash, found: tx ? "yes" : "no" }),
    same("status", ["transaction", tx?.status ?? null], ["expected", "success"]),
    same("to", ["transaction", tx?.to?.toLowerCase() ?? null], ["GateRecord", chain.contract.toLowerCase()]),
    same("block", ["transaction", tx?.blockNumber ?? null], ["on chain", rec.blockNumber]),
    same("Committed events", ["transaction", tx?.committed.length ?? 0], ["expected", 1]),
    comparison("event", !!event && event.key === chain.key && event.committer === rec.committer && event.scope === rec.scope && event.od === rec.od && event.root === rec.root && event.leafCount === rec.leafCount && event.codeHash === rec.codeHash, {
      event: event ? `${event.key} ${event.root} od ${event.od} ${event.leafCount} leaves` : null,
      "on chain": `${chain.key} ${rec.root} od ${rec.od} ${rec.leafCount} leaves`,
    }),
  ]);
  const checks = [form, fields, txCheck];
  refuse(path, checks);
  return {
    path,
    bytes: object.bytes,
    contentType: contentTypeOf(path),
    checks,
    basis: `the record GateRecord holds on ${network} at key ${chain.key}, committed in transaction ${txHash} at block ${rec.blockNumber}`,
    source: object.url,
    sealed: [],
    document: parsed.doc,
    chain,
  };
}

/**
 * Which file of the day a path names, once the index is verified; null when nothing in the record covers
 * it. The verified index names R's files leaves/<R>.json and leaves/<R>.scenarios.json, so the path finds R.
 */
export function leafEntryAt(index: FleetIndex, path: string): { position: number; kind: "leaf" | "scenarios" } | null {
  for (let i = 0; i < index.leaves.length; i++) {
    const l = index.leaves[i] as FleetLeaf;
    if (l.manifest === path) return { position: i, kind: "leaf" };
    if (l.scenarios === path) return { position: i, kind: "scenarios" };
  }
  return null;
}

export const notCovered = (day: Day, path: string): EdgeError =>
  new EdgeError(
    404,
    `${path} is not covered by the record of ${day.day}: the index names each battery's leaf and scenario set, a leaf names its outside inputs, and root.hex, salt.txt and the receipts are checked against the chain. Greenfield holds it unchecked at ${objectUrl(day.cfg, day.od, path)}`,
  );
