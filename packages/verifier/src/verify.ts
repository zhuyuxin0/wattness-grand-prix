import {
  ARM_IDS,
  assumedEntryCents,
  boundedFutureCollateralCents,
  boundedFuturePnlMicroUsd,
  canonicalJson,
  codeHashFromCommit,
  decodeAnchor,
  energyMicroUsd,
  fileSha256,
  formatInZone,
  gateTs,
  gateTsFromTimeZone,
  hoursInOperatingDay,
  leafHash,
  manifestShapeErrors,
  merkleRoot,
  rootFromProof,
  MICRO_USD_PER_CENT,
  mul,
  odFromIso,
  operatingDayEndTs,
  outcomeShapeErrors,
  planScopeLabel,
  PPM,
  recordKey,
  scenarioShapeErrors,
  scopeId,
  socAfter,
  splitKw,
  sum,
  type Arm,
  type ArmId,
  type Manifest,
  type Outcome,
  type OutcomeArm,
  type ScenarioMatrix,
} from "@gatelock/core";
import { getAddress, isAddressEqual, type Address, type Hex } from "viem";
import type { ChainReader, NetworkInfo } from "./chain.js";
import { daysIn, isExcludedDay, EXCLUDED_FROM, EXCLUDED_TO } from "./excluded-days.js";
import { diffJson, formatChanges } from "./diff.js";
import { checkCournotResponse, checkCournotRule, cournotOf, scenarioWeightsFor } from "./cournot.js";
import { armRisk, objectiveUusd, weightedEntryCents } from "./evaluate.js";
import { fail, judge, pass, skip, type CheckResult } from "./report.js";
import { checkSources, type SourceCheck, type SourceOptions } from "./sources.js";

/** record.json beside a manifest: where and how it was committed. */
export interface RecordFile {
  mode?: "contract" | "anchor";
  chainId?: number;
  contract?: Address;
  key?: Hex;
  /** bytes32 scope; when absent, keccak256 of scopeLabel or of the battery's plan scope label. */
  scope?: Hex;
  scopeLabel?: string;
  txHash?: Hex;
  root?: Hex;
  leafCount?: number;
}

export interface OutcomeFile {
  stage: number;
  doc: unknown;
}

export interface VerifyInput {
  manifest: unknown;
  /** scenarios.json: the matrix the manifest's scenario digest covers. */
  scenarios?: unknown;
  outcomes?: OutcomeFile[];
  /** A trusted copy, used to name the fields a modified manifest changed. */
  reference?: unknown;
  record?: RecordFile;
  chain?: { reader: ChainReader; network: NetworkInfo; contract?: Address } | null;
  key?: Hex;
  scopeLabel?: string;
  /** null skips V7 (offline). */
  sources?: SourceOptions | null;
  /** When the record's root covers several leaves: this manifest's place in the tree and its RFC 6962 audit path. */
  inclusion?: Inclusion;
  /** Files published beside the record (an outside input's saved response), by the route the manifest gives. */
  outsideFile?: (route: string) => Uint8Array | null;
}

export interface Inclusion {
  index: number;
  size: number;
  proof: Hex[];
}

interface Commitment {
  committedAt: number;
  key: Hex | null;
  writeOnce: boolean;
}

const TITLES = {
  V1: "root recomputes from the manifest",
  V2: "on-chain record matches",
  V3: "committed before the day-ahead gate",
  V4: "battery limits hold every hour",
  V5: "arm accounting recomputes",
  V6: "no input from an excluded day",
  V7: "inputs match the published release",
  V8: "manifest schema",
  V9: "selected arm exists",
  V10: "outcomes link to this record",
} as const;

type Id = keyof typeof TITLES;
const ORDER: Id[] = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10"];

const solvedArms = (m: Manifest): [ArmId, Arm][] =>
  ARM_IDS.flatMap((id) => {
    const a = m.arms[id];
    return a ? [[id, a] as [ArmId, Arm]] : [];
  });

export async function verify(input: VerifyInput): Promise<CheckResult[]> {
  const results = new Map<Id, CheckResult>();
  const put = (r: CheckResult) => results.set(r.id as Id, r);
  const ordered = () => ORDER.map((id) => results.get(id) as CheckResult);

  const shape = manifestShapeErrors(input.manifest);
  let leaf: Hex | null = null;
  try {
    leaf = leafHash(input.manifest);
  } catch (err) {
    shape.push(`not hashable: ${(err as Error).message}`);
  }
  put(judge("V8", TITLES.V8, shape.slice(0, 20), shape.length > 20 ? [`... ${shape.length - 20} more`] : []));

  if (!leaf) {
    for (const id of ORDER) if (id !== "V8") put(skip(id, TITLES[id], ["manifest cannot be hashed"]));
    return ordered();
  }
  const size = input.inclusion?.size ?? 1;
  let root: Hex;
  try {
    root = input.inclusion ? rootFromProof(leaf, input.inclusion.index, size, input.inclusion.proof) : merkleRoot([leaf]);
  } catch (err) {
    put(fail("V1", TITLES.V1, [`inclusion proof: ${(err as Error).message}`]));
    for (const id of ORDER) if (!results.has(id)) put(skip(id, TITLES[id], ["no root (V1)"]));
    return ordered();
  }
  const tamper = changedFields(input);
  put(checkRoot(root, size, input.record, tamper, input.inclusion?.index));

  if (shape.length > 0) {
    for (const id of ORDER) if (!results.has(id)) put(skip(id, TITLES[id], ["manifest shape is invalid (V8)"]));
    return ordered();
  }
  const m = input.manifest as Manifest;
  const od = odFromIso(m.operating_day);
  // The shape holds; the risk officer's input must also agree with its rule and with the plan.
  const rule = checkCournotRule(m, input.scenarios);
  put(judge("V8", TITLES.V8, rule.problems, rule.notes));

  const { result: v2, commitment } = await checkChain(input, m, od, root, tamper);
  put(v2);
  put(await checkGate(input, m, od, commitment));
  put(checkLimits(m, od));
  put(checkAccounting(m, input.scenarios));
  put(checkExcluded(m, input.outcomes ?? []));
  put(await checkInputs(input, m));
  put(checkSelected(m));
  put(await checkOutcomes(input, m, od, root, commitment));
  return ordered();
}

function changedFields(input: VerifyInput): string[] {
  if (input.reference === undefined) return [];
  const changes = diffJson(input.reference, input.manifest);
  return changes.length > 0 ? ["changed against the reference copy:", ...formatChanges(changes).map((l) => `  ${l}`)] : [];
}

function checkRoot(root: Hex, size: number, record: RecordFile | undefined, tamper: string[], index?: number): CheckResult {
  const notes = [size === 1 ? `root ${root} over 1 leaf` : `root ${root} from leaf ${index} of ${size} and its audit path`];
  const problems: string[] = [];
  if (record?.root && record.root.toLowerCase() !== root) problems.push(`record.json says ${record.root}`);
  if (record?.leafCount !== undefined && record.leafCount !== size) problems.push(`record.json says ${record.leafCount} leaves`);
  // A copy that differs from the reference is rejected even if it hashes consistently with itself.
  if (tamper.length > 0) problems.push(...tamper);
  return judge("V1", TITLES.V1, problems, notes);
}

export function scopeFor(m: Manifest, record?: RecordFile, label?: string): { scope: Hex; label: string | null } {
  if (record?.scope) return { scope: record.scope.toLowerCase() as Hex, label: record.scopeLabel ?? null };
  const l = label ?? record?.scopeLabel ?? planScopeLabel(m.battery.resource);
  return { scope: scopeId(l), label: l };
}

async function checkChain(
  input: VerifyInput,
  m: Manifest,
  od: number,
  root: Hex,
  tamper: string[],
): Promise<{ result: CheckResult; commitment: Commitment | null }> {
  const chain = input.chain;
  if (!chain) return { result: skip("V2", TITLES.V2, ["offline: no chain read"]), commitment: null };
  const problems: string[] = [];
  const notes: string[] = [];

  const chainId = await chain.reader.chainId();
  if (chainId !== chain.network.chainId) problems.push(`RPC is on chain ${chainId}, expected ${chain.network.chainId}`);
  if (input.record?.chainId !== undefined && input.record.chainId !== chainId) {
    problems.push(`record.json names chain ${input.record.chainId}, RPC is on ${chainId}`);
  }

  if (input.record?.mode === "anchor") {
    if (!input.record.txHash) return { result: fail("V2", TITLES.V2, ["anchor record without txHash"]), commitment: null };
    const tx = await chain.reader.transaction(input.record.txHash);
    const anchor = decodeAnchor(tx.input);
    if (!tx.success) problems.push("anchor transaction reverted");
    if (!tx.to || !isAddressEqual(tx.to, tx.from)) problems.push("anchor was not sent to self");
    if (tx.value !== 0n) problems.push("anchor carries value");
    if (!isAddressEqual(tx.from, m.agent.wallet)) problems.push(`sent by ${tx.from}, manifest names ${m.agent.wallet}`);
    if (!anchor) problems.push("calldata is not a GATEREC1 anchor");
    else {
      if (anchor.chainId !== chainId) problems.push(`anchor names chain ${anchor.chainId}`);
      if (anchor.od !== od) problems.push(`anchor od ${anchor.od}, manifest ${od}`);
      if (anchor.root !== root) problems.push(`anchor root ${anchor.root}, recomputed ${root}`, ...tamper);
    }
    notes.push(`calldata anchor ${input.record.txHash} in block ${tx.blockNumber}`);
    notes.push("an anchor proves time, not write-once: a later anchor for the same day is possible");
    return {
      result: judge("V2", TITLES.V2, problems, notes),
      commitment: { committedAt: tx.blockTimestamp, key: null, writeOnce: false },
    };
  }

  const contract = chain.contract ?? input.record?.contract;
  if (!contract) {
    return { result: fail("V2", TITLES.V2, ["no contract address (--contract, record.json or deployments)"]), commitment: null };
  }
  const { scope, label } = scopeFor(m, input.record, input.scopeLabel);
  const expectedKey = recordKey(m.agent.wallet, scope, od);
  const key = (input.key ?? input.record?.key ?? expectedKey).toLowerCase() as Hex;
  if (key !== expectedKey) {
    problems.push(`key ${key} is not keccak256(abi.encode(${m.agent.wallet}, scope, ${od})) = ${expectedKey}`);
  }
  const onChainKey = await chain.reader.keyOf(contract, m.agent.wallet, scope, od);
  if (onChainKey !== expectedKey) problems.push(`contract keyOf gives ${onChainKey}, core gives ${expectedKey}`);

  const rec = await chain.reader.record(contract, key);
  if (!rec) {
    problems.push(`no record at ${key} on ${chain.network.name} ${getAddress(contract)}`);
    return { result: fail("V2", TITLES.V2, problems), commitment: null };
  }
  if (rec.root !== root) problems.push(`on-chain root ${rec.root}, recomputed ${root}`, ...tamper);
  const size = input.inclusion?.size ?? 1;
  if (rec.leafCount !== size) problems.push(`on-chain leaf count ${rec.leafCount}, expected ${size}`);
  if (!isAddressEqual(rec.committer, m.agent.wallet)) problems.push(`committer ${rec.committer}, manifest names ${m.agent.wallet}`);
  if (rec.od !== od) problems.push(`on-chain od ${rec.od}, manifest ${od}`);
  if (rec.scope !== scope) problems.push(`on-chain scope ${rec.scope}, expected ${scope}`);

  notes.push(`key ${key}${label ? ` (scope "${label}")` : ""}`, `${chain.network.name} ${getAddress(contract)}, block ${rec.blockNumber}`);
  let code: Hex | null = null;
  try {
    code = codeHashFromCommit(m.engine.tree);
  } catch {
    code = null;
  }
  if (code && rec.codeHash === code) notes.push(`codeHash is source tree ${m.engine.tree}`);
  else problems.push(`on-chain codeHash ${rec.codeHash}, manifest's source tree gives ${code ?? "nothing"}`);
  return {
    result: judge("V2", TITLES.V2, problems, notes),
    commitment: { committedAt: rec.committedAt, key, writeOnce: true },
  };
}

async function checkGate(input: VerifyInput, m: Manifest, od: number, c: Commitment | null): Promise<CheckResult> {
  const gate = gateTs(od);
  const problems: string[] = [];
  const iana = gateTsFromTimeZone(od);
  if (iana !== gate) problems.push(`IANA America/Chicago gives ${iana}, rule gives ${gate}`);
  if (m.gate.unix !== gate) problems.push(`manifest gate ${m.gate.unix}, recomputed ${gate}`);
  if (m.plan_time.unix >= gate) problems.push(`plan time ${m.plan_time.unix} is not before the gate`);
  if (m.inputs.release_generated_unix > m.plan_time.unix) problems.push("the release was generated after plan time");
  const contract = input.chain?.contract ?? input.record?.contract;
  if (input.chain && contract && input.record?.mode !== "anchor") {
    const onChain = await input.chain.reader.gateTs(contract, od);
    if (onChain !== gate) problems.push(`contract gateTs ${onChain}, recomputed ${gate}`);
  }
  const notes = [`gate ${formatInZone(gate)} = ${formatInZone(gate, "Asia/Bangkok")} (unix ${gate})`];
  if (!c) {
    return problems.length > 0
      ? fail("V3", TITLES.V3, [...problems, ...notes])
      : skip("V3", TITLES.V3, ["no on-chain time to compare", ...notes]);
  }
  if (c.committedAt >= gate) problems.push(`committed at ${c.committedAt}, ${c.committedAt - gate} s after the gate`);
  else notes.unshift(`committed ${formatInZone(c.committedAt)} (unix ${c.committedAt}), ${gate - c.committedAt} s before the gate`);
  return judge("V3", TITLES.V3, problems, notes);
}

function checkLimits(m: Manifest, od: number): CheckResult {
  const hours = hoursInOperatingDay(od);
  const { max_power_kw: maxKw, energy_kwh: kwh } = m.battery;
  const a = m.assumptions;
  const lo = mul(kwh, a.soc_min_ppm);
  const hi = mul(kwh, a.soc_max_ppm);
  const open = mul(kwh, a.soc_open_ppm);
  const endMin = mul(kwh, a.soc_end_min_ppm);
  const cycleCap = mul(kwh, a.max_cycles_ppm);
  const size = m.instrument.size_kwh;
  const problems: string[] = [];
  if (!(a.soc_min_ppm <= a.soc_open_ppm && a.soc_open_ppm <= a.soc_max_ppm && a.soc_max_ppm <= PPM)) {
    problems.push("SOC assumptions are not ordered min <= open <= max <= 100%");
  }
  if (a.soc_end_min_ppm > a.soc_max_ppm) problems.push("closing SOC floor above the SOC ceiling");
  if (a.round_trip_ppm > PPM) problems.push("round-trip efficiency above 100%");

  for (const [id, arm] of solvedArms(m)) {
    const p = (s: string) => problems.push(`arm ${id}: ${s}`);
    if (arm.kw.length !== hours) p(`${arm.kw.length} hourly kW values, the day has ${hours} hours`);
    if (arm.contracts.length !== arm.kw.length) p(`${arm.contracts.length} hourly contract values for ${arm.kw.length} hours`);
    if (arm.soc_ukwh.length !== arm.kw.length) {
      p(`SOC path has ${arm.soc_ukwh.length} points for ${arm.kw.length} hours`);
      continue;
    }
    let discharged = 0;
    let soc = open;
    arm.kw.forEach((kw, h) => {
      if (Math.abs(kw) > maxKw) p(`hour ${h}: ${kw} kW exceeds ${maxKw} kW`);
      const { chargeKwh, dischargeKwh } = splitKw(kw);
      discharged += dischargeKwh;
      soc = socAfter(soc, chargeKwh, dischargeKwh, a.round_trip_ppm);
      const stated = arm.soc_ukwh[h] as number;
      if (stated !== soc) p(`hour ${h}: SOC ${stated} µkWh, energy balance gives ${soc}`);
      if (soc < lo || soc > hi) p(`hour ${h}: SOC ${soc} µkWh outside ${lo}..${hi}`);
      const q = arm.contracts[h] ?? 0;
      if (Math.abs(q) > a.max_contracts_per_hour) p(`hour ${h}: ${q} contracts exceeds ${a.max_contracts_per_hour}`);
      if (a.hedge_cap === "schedule") {
        const covered = q >= 0 ? dischargeKwh : chargeKwh;
        if (mul(Math.abs(q), size) > covered) p(`hour ${h}: ${q} contracts cover more than the ${covered} kWh scheduled`);
      }
    });
    if (soc < endMin) p(`closing SOC ${soc} µkWh below ${endMin}`);
    if (mul(discharged, PPM) > cycleCap) p(`discharges ${discharged} kWh, cap is ${cycleCap / PPM} kWh`);
  }
  return judge("V4", TITLES.V4, problems, [
    `${solvedArms(m).length} arms x ${hours} hours, ${maxKw} kW / ${kwh} kWh, SOC ${lo / PPM}..${hi / PPM} kWh`,
  ]);
}

export function armCollateralCents(m: Manifest, arm: Arm): number {
  return sum(arm.contracts.map((q, h) => boundedFutureCollateralCents(q, m.instrument.entry_cents[h] ?? 0, m.instrument.range_cents)));
}

function checkAccounting(m: Manifest, scenarios: unknown): CheckResult {
  const problems: string[] = [];
  const notes: string[] = [];
  const ins = m.instrument;
  const hours = m.forecast.hub_da_cents.length;
  if (m.forecast.node_da_cents.length !== hours) problems.push(`${m.forecast.node_da_cents.length} node forecast hours, hub has ${hours}`);
  if (ins.entry_cents.length !== hours) problems.push(`${ins.entry_cents.length} entry prices for ${hours} hours`);
  if (ins.size_kwh !== 1_000) problems.push(`contract size ${ins.size_kwh} kWh; the accounting here assumes 1 MWh`);
  // Fair-value entry needs the scenario matrix; without it the entry prices are taken as stated.
  const sum4 = scenarios !== undefined && scenarioShapeErrors(scenarios).length === 0 ? (scenarios as ScenarioMatrix).hub_sum4 : null;
  // An applied weather reading weights the scenarios; the weights come from the matrix and the rule, not from the engine.
  let weights: number[] | undefined;
  if (sum4 && cournotOf(m)?.status === "applied") {
    try {
      weights = scenarioWeightsFor(m, scenarios as ScenarioMatrix);
    } catch (err) {
      problems.push(`scenario weights: ${(err as Error).message}`);
    }
  }
  if (sum4 && sum4.length > 0) {
    ins.entry_cents.forEach((e, h) => {
      const hour = sum4.map((s) => s[h] ?? 0);
      const fair = weights ? weightedEntryCents(hour, weights, ins.range_cents, ins.tick_cents) : assumedEntryCents(hour, ins.range_cents, ins.tick_cents);
      if (e !== fair) problems.push(`hour ${h}: entry ${e}, the ${weights ? "weighted " : ""}scenario mean gives ${fair}`);
    });
  } else {
    notes.push("entry prices not re-derived: no scenarios.json beside the manifest");
  }

  for (const [id, arm] of solvedArms(m)) {
    const p = (s: string) => problems.push(`arm ${id}: ${s}`);
    if (arm.kw.length !== hours || arm.contracts.length !== hours) {
      p(`${arm.kw.length} hours, forecast has ${hours}`);
      continue;
    }
    const collateral = armCollateralCents(m, arm);
    if (collateral !== arm.collateral_cents) p(`collateral_cents ${arm.collateral_cents}, recomputed ${collateral}`);
    if (collateral > m.assumptions.collateral_budget_cents) p(`collateral ${collateral} cents over the budget ${m.assumptions.collateral_budget_cents}`);
    const objective = objectiveUusd(BigInt(arm.expected_uusd), BigInt(arm.cvar_uusd), m.risk.lambda_ppm);
    if (BigInt(arm.objective_uusd) !== objective) p(`objective_uusd ${arm.objective_uusd}, mean - lambda x CVaR gives ${objective}`);
  }

  if (scenarios === undefined) {
    notes.push("expected value and CVaR not re-derived: no scenarios.json beside the manifest");
  } else {
    const matrixProblems = checkMatrix(m, scenarios);
    problems.push(...matrixProblems);
    if (matrixProblems.length === 0) {
      const matrix = scenarios as ScenarioMatrix;
      for (const [id, arm] of solvedArms(m)) {
        const { expected, cvar } = armRisk(m, arm, matrix, weights);
        if (BigInt(arm.expected_uusd) !== expected) problems.push(`arm ${id}: expected_uusd ${arm.expected_uusd}, scenarios give ${expected}`);
        if (BigInt(arm.cvar_uusd) !== cvar) problems.push(`arm ${id}: cvar_uusd ${arm.cvar_uusd}, scenarios give ${cvar}`);
      }
      notes.push(
        `expected value and CVaR re-derived over ${matrix.node_cents.length} ${weights ? "stress-weighted " : ""}scenarios (digest ${m.scenarios.digest_sha256.slice(0, 12)}...)`,
      );
    }
  }
  notes.push("collateral and objective recomputed; the LP itself is not re-solved here");
  return judge("V5", TITLES.V5, problems, notes);
}

function checkMatrix(m: Manifest, doc: unknown): string[] {
  const shape = scenarioShapeErrors(doc);
  if (shape.length > 0) return shape.slice(0, 5).map((s) => `scenarios.json: ${s}`);
  const matrix = doc as ScenarioMatrix;
  const problems: string[] = [];
  const digest = fileSha256(canonicalJson(matrix));
  if (digest !== m.scenarios.digest_sha256) problems.push(`scenarios.json hashes to ${digest}, manifest says ${m.scenarios.digest_sha256}`);
  const n = matrix.node_cents.length;
  if (n !== m.scenarios.count || matrix.hub_sum4.length !== n) {
    problems.push(`scenarios.json has ${n} node and ${matrix.hub_sum4.length} hub rows, manifest says ${m.scenarios.count}`);
  }
  const hours = m.forecast.hub_da_cents.length;
  if ([...matrix.node_cents, ...matrix.hub_sum4].some((row) => row.length !== hours)) problems.push(`a scenario row is not ${hours} hours`);
  const [lo, hi] = m.instrument.range_cents;
  if (matrix.hub_sum4.some((row) => row.some((v) => v < 4 * lo || v > 4 * hi))) problems.push("a hub settlement lies outside the range");
  return problems;
}

function checkExcluded(m: Manifest, outcomes: readonly OutcomeFile[]): CheckResult {
  const routes = [m.battery.source, ...m.inputs.files, ...m.inputs.live].map((f) => f.route);
  for (const o of outcomes) {
    const ins = (o.doc as Outcome | null)?.inputs;
    if (Array.isArray(ins?.files)) routes.push(...ins.files.map((f) => f.route));
    if (Array.isArray(ins?.live)) routes.push(...ins.live.map((f) => f.route));
  }
  const days = new Set([
    m.operating_day,
    ...m.forecast.reference_days.map((r) => r.day),
    ...m.scenarios.history_days,
    ...m.scenarios.basis_days,
    ...daysIn(...routes),
  ]);
  const sorted = [...days].sort();
  return judge(
    "V6",
    TITLES.V6,
    sorted.filter(isExcludedDay).map((d) => `${d} is inside ${EXCLUDED_FROM}..${EXCLUDED_TO}`),
    [`${days.size} distinct days, ${sorted[0]}..${sorted[sorted.length - 1]}`],
  );
}

async function checkInputs(input: VerifyInput, m: Manifest): Promise<CheckResult> {
  // The saved response sits beside the record, so it is checked even when nothing is fetched.
  const outside = checkCournotResponse(m, input.outsideFile);
  if (!input.sources) {
    if (outside.problems.length > 0) {
      return fail("V7", TITLES.V7, [...outside.problems, ...outside.missing, "release inputs not fetched (--offline or --no-fetch)"]);
    }
    return skip("V7", TITLES.V7, ["inputs not fetched (--offline or --no-fetch)", ...outside.missing, ...outside.notes]);
  }
  const r = await checkSources(
    { releaseId: m.inputs.release_id, manifestSha256: m.inputs.manifest_sha256, files: [m.battery.source, ...m.inputs.files], live: m.inputs.live },
    input.sources,
  );
  for (const o of input.outcomes ?? []) {
    const doc = o.doc as Outcome;
    if (outcomeShapeErrors(doc).length > 0) continue;
    const ro = await checkSources(
      { releaseId: doc.inputs.release_id, manifestSha256: doc.inputs.manifest_sha256, files: doc.inputs.files, live: doc.inputs.live },
      input.sources,
    );
    merge(r, ro, `outcome ${o.stage}: `);
  }
  r.problems.push(...outside.problems);
  r.missing.push(...outside.missing);
  const note = `${r.checked} files hashed against release ${m.inputs.release_id}${r.mirrored > 0 ? `, ${r.mirrored} of them from the mirror` : ""}`;
  if (r.problems.length > 0) return fail("V7", TITLES.V7, [...r.problems.slice(0, 20), ...r.missing.slice(0, 5), note]);
  if (r.missing.length > 0) return skip("V7", TITLES.V7, [`${r.missing.length} files could not be checked`, ...r.missing.slice(0, 10), note, ...outside.notes]);
  return pass("V7", TITLES.V7, [note, ...outside.notes]);
}

function merge(into: SourceCheck, from: SourceCheck, prefix: string): void {
  into.checked += from.checked;
  into.mirrored += from.mirrored;
  into.problems.push(...from.problems.map((p) => prefix + p));
  into.missing.push(...from.missing.map((p) => prefix + p));
}

function checkSelected(m: Manifest): CheckResult {
  const problems: string[] = [];
  const solved = solvedArms(m);
  const unsolved = new Set(m.unsolved.map((u) => u.arm));
  for (const id of ARM_IDS) {
    if (m.arms[id] === null && !unsolved.has(id)) problems.push(`arm ${id} is null but not listed as unsolved`);
    if (m.arms[id] !== null && unsolved.has(id)) problems.push(`arm ${id} is solved but listed as unsolved`);
  }
  const chosen = m.arms[m.selected_arm];
  if (!chosen) problems.push(`selected arm ${m.selected_arm} was not solved`);
  // The declared rule: highest objective, ties to the earlier arm.
  let best: [ArmId, Arm] | undefined;
  for (const entry of solved) if (!best || entry[1].objective_uusd > best[1].objective_uusd) best = entry;
  if (chosen && best && best[0] !== m.selected_arm) {
    problems.push(`selected ${m.selected_arm}, but arm ${best[0]} has the higher objective (${best[1].objective_uusd} > ${chosen.objective_uusd})`);
  }
  const listing = solved.map(([id, a]) => `${id} ${a.objective_uusd}`).join(", ");
  return judge("V9", TITLES.V9, problems, [`objective µUSD: ${listing || "no arms"}; selected ${m.selected_arm}`]);
}

export function outcomeArm(m: Manifest, o: Outcome, arm: Arm): OutcomeArm {
  const energy = sum(arm.kw.map((kw, h) => energyMicroUsd(kw, o.prices.da_node_cents[h] ?? 0)));
  const wear = energyMicroUsd(sum(arm.kw.map((kw) => splitKw(kw).dischargeKwh)), m.assumptions.wear_cents_per_mwh);
  const fees = mul(sum(arm.contracts.map(Math.abs)), m.instrument.fee_cents_per_contract, MICRO_USD_PER_CENT);
  let hedge: number | null = 0;
  for (let h = 0; h < arm.contracts.length && hedge !== null; h++) {
    const q = arm.contracts[h] ?? 0;
    if (q === 0) continue;
    const rt = o.prices.rt_hub_cents?.[h];
    const e = m.instrument.entry_cents[h];
    hedge = !rt || e === undefined ? null : hedge + boundedFuturePnlMicroUsd(q, e, rt, m.instrument.range_cents);
  }
  return {
    energy_uusd: energy,
    wear_uusd: wear,
    hedge_uusd: hedge,
    fees_uusd: fees,
    net_uusd: hedge === null ? null : sum([energy, -wear, hedge, -fees]),
  };
}

async function checkOutcomes(
  input: VerifyInput,
  m: Manifest,
  od: number,
  root: Hex,
  c: Commitment | null,
): Promise<CheckResult> {
  const outcomes = input.outcomes ?? [];
  const problems: string[] = [];
  const notes: string[] = [];
  const contract = input.chain?.contract ?? input.record?.contract;
  const onChain = input.chain && contract && c?.key && c.writeOnce ? { reader: input.chain.reader, contract, key: c.key } : null;
  const hours = hoursInOperatingDay(od);

  for (const o of outcomes) {
    const p = (s: string) => problems.push(`outcome ${o.stage}: ${s}`);
    const shape = outcomeShapeErrors(o.doc);
    if (shape.length > 0) {
      p(`schema: ${shape.slice(0, 5).join("; ")}`);
      continue;
    }
    const doc = o.doc as Outcome;
    if (doc.stage !== o.stage) p(`file is stage ${o.stage}, document says ${doc.stage}`);
    if (doc.manifest_root !== root) p(`links to ${doc.manifest_root}, this manifest is ${root}`);
    if (doc.operating_day !== m.operating_day) p(`operating day ${doc.operating_day}`);
    if (doc.prices.da_node_cents.length !== hours) p(`${doc.prices.da_node_cents.length} DA prices, the day has ${hours}`);
    if (doc.prices.rt_hub_cents && doc.prices.rt_hub_cents.length !== hours) p(`${doc.prices.rt_hub_cents.length} RT hours, the day has ${hours}`);
    for (const id of ARM_IDS) {
      const arm = m.arms[id];
      const got = doc.arms[id];
      if (!arm) {
        if (got) p(`arm ${id} was not solved but has an outcome`);
        continue;
      }
      if (!got) {
        p(`arm ${id} missing`);
        continue;
      }
      const want = outcomeArm(m, doc, arm);
      for (const k of Object.keys(want) as (keyof OutcomeArm)[]) {
        if (got[k] !== want[k]) p(`arm ${id}: ${k} ${got[k]}, recomputed ${want[k]}`);
      }
    }
    const hash = merkleRoot([leafHash(doc)]);
    if (onChain) {
      const linked = await onChain.reader.outcome(onChain.contract, onChain.key, o.stage);
      if (!linked) p("not linked on chain");
      else {
        if (linked.hash !== hash) p(`on-chain hash ${linked.hash}, recomputed ${hash}`);
        const opens = o.stage === 1 ? gateTs(od) : operatingDayEndTs(od);
        if (linked.linkedAt < opens) p(`linked at ${linked.linkedAt}, before the stage opened at ${opens}`);
        notes.push(`stage ${o.stage} linked ${formatInZone(linked.linkedAt)}`);
      }
    } else notes.push(`stage ${o.stage} hash ${hash} (not checked on chain)`);
  }

  if (onChain) {
    const present = new Set(outcomes.map((o) => o.stage));
    for (const stage of [1, 2, 3]) {
      if (present.has(stage)) continue;
      const linked = await onChain.reader.outcome(onChain.contract, onChain.key, stage);
      if (linked) problems.push(`stage ${stage} is linked on chain (${linked.hash}) but no outcome-${stage}.json was given`);
    }
  }
  if (outcomes.length === 0 && problems.length === 0) return skip("V10", TITLES.V10, ["no outcomes yet"]);
  return judge("V10", TITLES.V10, problems, notes);
}
