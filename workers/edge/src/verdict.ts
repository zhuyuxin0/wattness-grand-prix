// GET /verify/<battery>: one battery's plan against the chain, check by check. The checks follow the
// repository verifier's V1 (root from the leaf and its audit path), V2 (the on-chain record) and V3 (the
// gate), so the two can be compared on the same day: for a plan that passes they print the verifier's lines,
// and for a changed leaf the results agree and two lines differ (test/verify.test.ts pins which).
import { formatInZone, gateTs, gateTsFromTimeZone } from "../../../packages/core/src/gate.ts";
import { codeHashFromTree, scopeId } from "./abi.ts";
import { checksumAddress, fileSha256, isBytes32, type Hex } from "./bytes.ts";
import { readDayRecord } from "./chain.ts";
import { MIN_CONFIRMATIONS, NETWORKS, PLAN_SCOPE_LABEL, type NetworkName } from "./config.ts";
import { EdgeError, cut } from "./errors.ts";
import { isPlainPath } from "./greenfield.ts";
import { leafHash, rootAndProof, rootFromProof } from "./merkle.ts";
import { INDEX_OBJECT, check, checkIndexFile, checkedRendering, comparison, parseJson, sealedIndex, type Check, type Day, type FleetLeaf, type Rendering } from "./record.ts";

export interface Verdict {
  schema: "gate-record.edge-verdict.v1";
  battery: string;
  operating_day: string;
  network: NetworkName;
  contract: Hex;
  committer: Hex;
  verdict: "pass" | "fail";
  checks: Check[];
  /** index counts from 0, as RFC 6962 audit paths do; number from 1, as the site shows it. */
  leaf: { index: number; number: number; of: number; computed: Hex | null; listed: Hex; proof: Hex[] };
  record: { key: Hex; root: Hex; leaf_count: number; code_hash: Hex; committed_at: number; block: number; confirmations: number } | null;
  /** How the published leaf's bytes render its document. A leaf in neither form gets the 502 /day gives, not a verdict. */
  rendering: Rendering;
  sources: { index: string; leaf: string; rpc: string };
}

const get = (v: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((o, k) => (typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>)[k] : undefined), v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);

/** A value as the verdict prints it: whole, or, past 200 characters, the first 200 of its text or JSON. */
function bounded(v: unknown): unknown {
  if (typeof v === "string") return cut(v, 200);
  let json: string | undefined;
  try {
    json = JSON.stringify(v);
  } catch {
    json = undefined;
  }
  return json !== undefined && json.length > 200 ? cut(json, 200) : v;
}

// record.ts's same, printing each value bounded: a verdict compares values read from the leaf, which is
// unchecked until it passes, and a value that holds the plan must not carry it into the verdict.
const same = (name: string, a: [string, unknown], b: [string, unknown]) => comparison(name, a[1] === b[1], { [a[0]]: bounded(a[1]), [b[0]]: bounded(b[1]) });

export async function verdictFor(day: Day, network: NetworkName, battery: string): Promise<Verdict> {
  const indexObject = await day.object(INDEX_OBJECT);
  if (!indexObject) throw new EdgeError(404, `no record is published for ${day.day}: Greenfield has no od-${day.od}/${INDEX_OBJECT}`);
  const parsedIndex = parseJson(indexObject, `the index of ${day.day}`);
  // The rules the /day endpoints apply to the index's own bytes: no verdict under an index they refuse.
  checkIndexFile(parsedIndex, day.day);
  const index = parsedIndex.doc as { leaves?: unknown; exclusions?: unknown };
  const leaves = Array.isArray(index.leaves) ? (index.leaves as Partial<FleetLeaf>[]) : [];
  if (leaves.length === 0 || !leaves.every((l) => typeof l === "object" && l !== null && isBytes32(l.leaf))) {
    throw new EdgeError(502, `the index of ${day.day} does not list its leaves as 32-byte hashes`);
  }
  const position = leaves.findIndex((l) => l.resource === battery);
  if (position < 0) {
    // A battery is found by the names beside the leaf hashes, which no hash fixes, so a 404 says what the
    // index lists, not what the record holds; and it is said only under a copy that passes every index check
    // against the chain. An isolate that has verified another copy of the day's index answers 502 instead.
    const sealed = await sealedIndex(day, network);
    const copy = fileSha256(indexObject.bytes);
    if (sealed.sha256 !== copy) throw new EdgeError(502, `the index of ${day.day} is not served: Greenfield's copy (SHA-256 ${copy}) is not the one verified on ${network} (SHA-256 ${sealed.sha256})`);
    const excluded = sealed.index.exclusions.find((e) => e.resource === battery);
    throw new EdgeError(
      404,
      `the index of ${day.day} lists no leaf under the name ${battery} (a verdict finds a battery by the names in the index, which no hash fixes)${excluded ? `; it lists the battery as excluded: ${cut(excluded.reason, 200)}` : ""}`,
    );
  }
  const entry = leaves[position] as FleetLeaf;
  if (typeof entry.manifest !== "string" || !isPlainPath(entry.manifest)) throw new EdgeError(502, `the index of ${day.day} names no plain path for ${battery}'s leaf`);

  const [leafObject, chain] = await Promise.all([day.object(entry.manifest), readDayRecord(day.cfg, network, day.od)]);
  if (!leafObject) throw new EdgeError(502, `the index of ${day.day} names ${entry.manifest}, and Greenfield has no such object`);
  const parsed = parseJson(leafObject, entry.manifest);
  // The rule /day applies to the leaf's own bytes: a copy that parses to the plan but is not its rendering
  // (a duplicate key, extra whitespace, an escape) is refused, as /day refuses it, rather than given a verdict.
  const rendering = checkedRendering(parsed, entry.manifest);
  const m = parsed.doc;

  const size = leaves.length;
  const listed = leaves.map((l) => l.leaf as Hex);
  const { root: indexRoot, proof } = rootAndProof(listed, position);
  let computed: Hex | null = null;
  let hashProblem: string | null = null;
  try {
    computed = leafHash(m);
  } catch (err) {
    hashProblem = cut((err as Error).message, 200);
  }
  const walked = computed ? rootFromProof(computed, position, size, proof) : null;
  const rec = chain.record;
  const contract = checksumAddress(chain.contract);

  // V1: the leaf, and the root it walks to.
  const v1Problems = [
    ...(rec && rec.root !== walked ? [`GateRecord holds ${rec.root}`] : []),
    ...(rec && rec.leafCount !== size ? [`GateRecord holds ${rec.leafCount} leaves`] : []),
    ...(rec ? [] : ["GateRecord holds no record for this day"]),
  ];
  const leafCheck = check(
    "leaf hash",
    "SHA-256(0x00 || RFC 8785 form of the published leaf) is the index's leaf for this battery",
    [
      comparison("leaf", computed !== null && computed === entry.leaf, { computed: computed ?? `none: ${hashProblem}`, [`index, leaf ${position + 1} of ${size}`]: entry.leaf }),
      same("battery", ["leaf", get(m, "battery", "resource")], ["asked", battery]),
      same("operating day", ["leaf", get(m, "operating_day")], ["asked", day.day]),
    ],
    { verifier: "V1" },
  );
  const proofCheck = check(
    "Merkle proof",
    "the leaf's RFC 6962 audit path, built from the index's leaf hashes, walks to the root GateRecord holds",
    [
      comparison("root", rec !== null && walked === rec.root, { walked: walked ?? "none", "on chain": rec?.root ?? null }),
      same("tree size", ["index", size], ["on chain", rec?.leafCount ?? null]),
      same("index root", ["index", get(index, "root")], ["recomputed from its leaves", indexRoot]),
    ],
    {
      verifier: "V1",
      details: [...v1Problems, walked ? `root ${walked} from leaf ${position + 1} of ${size} and its audit path` : `the leaf cannot be hashed: ${hashProblem}`],
    },
  );

  // V2: the record key, and the record at it.
  const keyCheck = check(
    "record key",
    "keccak256(abi.encode(committer, keccak256(scope label), od)) is GateRecord.keyOf's answer",
    [same("key", ["computed", chain.key], ["GateRecord.keyOf", chain.keyOf]), same("scope", ["keccak256(scope label)", scopeId(PLAN_SCOPE_LABEL)], ["used", chain.scope])],
    { verifier: "V2", details: [`key ${chain.key} (scope "${PLAN_SCOPE_LABEL}")`] },
  );
  const wallet = get(m, "agent", "wallet");
  const tree = get(m, "engine", "tree");
  let code: Hex | null = null;
  try {
    code = codeHashFromTree(String(tree));
  } catch {
    code = null;
  }
  const leafOd = typeof get(m, "operating_day") === "string" ? Number(String(get(m, "operating_day")).replaceAll("-", "")) : null;
  const recordCheck = check(
    "on-chain record",
    `GateRecord.get(key) on ${network}: the record exists, and its root, size, committer, day, scope and code hash are this plan's`,
    rec
      ? [
          same("chain id", ["RPC", chain.chainId], [network, NETWORKS[network]]),
          same("root", ["on chain", rec.root], ["walked from the leaf", walked]),
          same("leaf count", ["on chain", rec.leafCount], ["index", size]),
          same("committer", ["on chain", rec.committer.toLowerCase()], ["leaf agent.wallet", String(wallet).toLowerCase()]),
          same("operating day", ["on chain", rec.od], ["leaf", leafOd]),
          same("scope", ["on chain", rec.scope], [PLAN_SCOPE_LABEL, chain.scope]),
          same("code hash", ["on chain", rec.codeHash], ["leaf engine.tree", code]),
        ]
      : [comparison("record", false, { key: chain.key, found: `no record on ${network} ${contract}` })],
    {
      verifier: "V2",
      details: rec ? [`${network} ${contract}, block ${rec.blockNumber}`, ...(code && rec.codeHash === code ? [`codeHash is source tree ${String(tree)}`] : [])] : [],
    },
  );

  // V3: the gate, computed as the contract computes it, and the commit's time against it.
  const gate = gateTs(day.od);
  const iana = gateTsFromTimeZone(day.od);
  const leafGate = num(get(m, "gate", "unix"));
  const planTime = num(get(m, "plan_time", "unix"));
  const released = num(get(m, "inputs", "release_generated_unix"));
  const v3Problems: string[] = [];
  if (iana !== gate) v3Problems.push(`IANA America/Chicago gives ${iana}, rule gives ${gate}`);
  if (leafGate !== gate) v3Problems.push(`manifest gate ${leafGate}, recomputed ${gate}`);
  if (planTime === null || planTime >= gate) v3Problems.push(`plan time ${planTime} is not before the gate`);
  if (released === null || planTime === null || released > planTime) v3Problems.push("the release was generated after plan time");
  if (chain.contractGate !== gate) v3Problems.push(`contract gateTs ${chain.contractGate}, recomputed ${gate}`);
  const v3Notes = [`gate ${formatInZone(gate)} = ${formatInZone(gate, "Asia/Bangkok")} (unix ${gate})`];
  if (rec && rec.committedAt >= gate) v3Problems.push(`committed at ${rec.committedAt}, ${rec.committedAt - gate} s after the gate`);
  else if (rec) v3Notes.unshift(`committed ${formatInZone(rec.committedAt)} (unix ${rec.committedAt}), ${gate - rec.committedAt} s before the gate`);
  const gateCheck = check(
    "gate",
    "committed before 10:00 Central on the day before the operating day, the gate computed as GateRecord.gateTs computes it",
    [
      comparison("gate", gate === chain.contractGate && gate === iana, { "computed as the contract does": gate, "GateRecord.gateTs": chain.contractGate, "IANA America/Chicago": iana }),
      same("leaf gate", ["leaf gate.unix", leafGate], ["computed", gate]),
      comparison("committed before the gate", rec !== null && rec.committedAt < gate, {
        "committed at": rec?.committedAt ?? null,
        gate,
        "seconds before": rec ? gate - rec.committedAt : null,
      }),
      comparison("plan time before the gate", planTime !== null && planTime < gate, { "plan time": planTime, gate }),
      comparison("release before the plan", released !== null && planTime !== null && released <= planTime, { "release generated": released, "plan time": planTime }),
    ],
    { verifier: "V3", details: [...v3Problems, ...v3Notes] },
  );

  const checks = [leafCheck, proofCheck, keyCheck, recordCheck, gateCheck];
  return {
    schema: "gate-record.edge-verdict.v1",
    battery,
    operating_day: day.day,
    network,
    contract,
    committer: checksumAddress(chain.committer),
    verdict: checks.every((c) => c.result === "pass") ? "pass" : "fail",
    checks,
    leaf: { index: position, number: position + 1, of: size, computed, listed: entry.leaf, proof },
    record: rec
      ? { key: chain.key, root: rec.root, leaf_count: rec.leafCount, code_hash: rec.codeHash, committed_at: rec.committedAt, block: rec.blockNumber, confirmations: chain.head - rec.blockNumber }
      : null,
    rendering,
    sources: { index: indexObject.url, leaf: leafObject.url, rpc: chain.rpc },
  };
}

/** A passing verdict on a record deep enough to stay is cached; anything else is not. */
export const cacheableVerdict = (v: Verdict): boolean => v.verdict === "pass" && v.record !== null && v.record.confirmations >= MIN_CONFIRMATIONS;
