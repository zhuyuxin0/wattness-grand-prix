// The seal's bytes against packages/core and viem: canonical JSON and the leaf hash (Desert Willow's sealed leaf
// re-hashes to the leaf in the record), SHA-256 and Keccak-256, scope ids and record keys (the agent's sealed record
// key re-derives), GateRecord's calldata, errors, event and record, and the gate's clock.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalJson as coreCanonicalJson } from '../../../core/src/jcs.ts';
import { leafHash as coreLeafHash, merkleRoot } from '../../../core/src/hash.ts';
import { recordKey as coreRecordKey, scopeId as coreScopeId } from '../../../core/src/key.ts';
import { gateTs } from '../../../core/src/gate.ts';
import { canonicalJson, keccak256, leafHash, sha256, toHex } from './hash.ts';
import { BSC_TESTNET, GATE_RECORD, SIG, decodeRecord, decodeRevert, encodeCommit, encodeGet, findCommitted, gateUnix, odOf, recordKey, scopeId, selector } from './chain.ts';
import { arenaLeaf, arenaRecord, arenaScopeLabel } from './leaf.ts';
import { DIAL_STEPS, fieldFromFrameData, play } from './model.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const viem = await import(pathToFileURL(createRequire(resolve(repo, 'packages/core/package.json')).resolve('viem')).href);
const abi = JSON.parse(readFileSync(resolve(repo, 'contracts/abi/GateRecord.json'), 'utf8'));
const deployment = JSON.parse(readFileSync(resolve(repo, 'contracts/deployments/bsc-testnet.json'), 'utf8'));
const d = JSON.parse(readFileSync(resolve(here, '../data/frame-data.json'), 'utf8'));
const F = fieldFromFrameData(d);
const sealedLeaf = JSON.parse(readFileSync(resolve(repo, 'fixtures/od-20261126/leaves/DSWL_ESS_ESR1.json'), 'utf8'));
const testnetRecord = JSON.parse(readFileSync(resolve(repo, 'fixtures/od-20261126/record.bsc-testnet.json'), 'utf8'));

const beat = Object.assign(new Array(24).fill(0), { 5: 14, 7: 34, 9: -17, 10: -71, 11: -100, 12: -14, 17: 95 });
const player = '0x1111111111111111111111111111111111111111';
const salt = `0x${'ab'.repeat(32)}`;

describe('hashing', () => {
  it('re-hashes Desert Willow\'s sealed leaf to the leaf in the record, byte for byte as packages/core', () => {
    expect(canonicalJson(sealedLeaf)).toBe(coreCanonicalJson(sealedLeaf));
    expect(leafHash(sealedLeaf)).toBe(coreLeafHash(sealedLeaf));
    expect(leafHash(sealedLeaf)).toBe(F.record.leaf);
  });

  it('writes canonical JSON as packages/core does for escapes, non-ASCII keys and nesting', () => {
    const doc = { z: 1, a: [true, false, null, -5, 0, 9007199254740991], 'é': 'x \n"\\', '€': { b: 'ü', a: '\u0001' }, '😀': 'grin', A: [] };
    expect(canonicalJson(doc)).toBe(coreCanonicalJson(doc));
    expect(() => canonicalJson({ x: 0.5 })).toThrow(/safe integer/);
    expect(() => canonicalJson({ x: -0 })).toThrow(/negative zero/);
  });

  it('computes SHA-256 and Keccak-256 as node and viem do, across the block boundaries', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 135, 136, 137, 200, 271, 272, 273, 1000]) {
      const b = new Uint8Array(randomBytes(n));
      expect(toHex(sha256(b)).slice(2)).toBe(createHash('sha256').update(b).digest('hex'));
      expect(keccak256(b)).toBe(viem.keccak256(b));
    }
  });
});

describe('GateRecord', () => {
  it('re-derives the agent\'s sealed record key from its scope label, wallet and day', () => {
    const scope = scopeId(d.sealed_day.scope_label);
    expect(scope).toBe(coreScopeId(d.sealed_day.scope_label));
    expect(scope).toBe(testnetRecord.scope);
    expect(recordKey(d.sealed_day.agent.wallet, scope, odOf(F.operatingDay))).toBe(testnetRecord.key);
    expect(recordKey(player, scope, 20261127)).toBe(coreRecordKey(player, scope, 20261127));
    expect(GATE_RECORD).toBe(deployment.address);
    expect(BSC_TESTNET.chainId).toBe(deployment.chainId);
  });

  it('encodes commit and get, and decodes the record, its errors and its event, as viem does with the ABI', () => {
    const args = { scope: testnetRecord.scope, od: 20261126, root: testnetRecord.root, leafCount: testnetRecord.leafCount, codeHash: testnetRecord.codeHash };
    expect(encodeCommit(args)).toBe(viem.encodeFunctionData({ abi, functionName: 'commit', args: [args.scope, args.od, args.root, args.leafCount, args.codeHash] }));
    expect(encodeGet(testnetRecord.key)).toBe(viem.encodeFunctionData({ abi, functionName: 'get', args: [testnetRecord.key] }));
    for (const [name, sig] of [['commit', SIG.commit], ['get', SIG.get]]) expect(selector(sig)).toBe(viem.toFunctionSelector(abi.find((x) => x.name === name)));

    const rec = { root: testnetRecord.root, codeHash: testnetRecord.codeHash, scope: testnetRecord.scope, committer: d.sealed_day.agent.wallet, od: 20261126, leafCount: 316, committedAt: BigInt(testnetRecord.committedAt), blockNumber: BigInt(testnetRecord.blockNumber) };
    const out = decodeRecord(viem.encodeFunctionResult({ abi, functionName: 'get', result: rec }));
    expect(out).toEqual({ ...rec, committer: rec.committer.toLowerCase(), committedAt: testnetRecord.committedAt, blockNumber: testnetRecord.blockNumber });

    expect(decodeRevert(viem.encodeErrorResult({ abi, errorName: 'AfterGate', args: [20261126, 1795622400n] }))).toEqual({ name: 'AfterGate', od: 20261126, gate: 1795622400 });
    expect(decodeRevert(viem.encodeErrorResult({ abi, errorName: 'AlreadyCommitted', args: [testnetRecord.key] }))).toEqual({ name: 'AlreadyCommitted', key: testnetRecord.key });
    expect(decodeRevert(viem.encodeErrorResult({ abi, errorName: 'EmptyRecord' }))).toEqual({ name: 'EmptyRecord' });
    expect(decodeRevert('0x08c379a0')).toBe(null);

    const ev = abi.find((x) => x.type === 'event' && x.name === 'Committed');
    const topics = viem.encodeEventTopics({ abi: [ev], eventName: 'Committed', args: { key: testnetRecord.key, committer: player, scope: testnetRecord.scope } });
    const data = viem.encodeAbiParameters(ev.inputs.filter((i) => !i.indexed), [20261126, testnetRecord.root, 316, testnetRecord.codeHash]);
    expect(findCommitted([{ address: GATE_RECORD, topics, data }])).toEqual({ key: testnetRecord.key, committer: player, scope: testnetRecord.scope, od: 20261126, root: testnetRecord.root, leafCount: 316, codeHash: testnetRecord.codeHash });
    expect(findCommitted([{ address: '0x0000000000000000000000000000000000000001', topics, data }])).toBe(null);
  });

  it('puts the gate where packages/core and the contract do, DST included, and at the sealed day\'s gate', () => {
    expect(gateUnix(F.operatingDay)).toBe(d.sealed_day.gate.unix);
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 86_400_000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      if (gateUnix(iso) !== gateTs(odOf(iso))) throw new Error(`gate for ${iso}`);
    }
  });
});

describe('the arena leaf', () => {
  it('is one canonical document whose one-leaf root is its leaf hash, committed under the arena scope', () => {
    const p = play(F, { step: DIAL_STEPS, glass: beat });
    const doc = arenaLeaf(F, { step: DIAL_STEPS, glass: beat }, p, player, salt);
    const r = arenaRecord(doc);
    expect(r.json).toBe(coreCanonicalJson(doc));
    expect(r.leaf).toBe(coreLeafHash(doc));
    expect(r.root).toBe(merkleRoot([r.leaf]));
    expect(r.leafCount).toBe(1);
    expect(r.scopeLabel).toBe(arenaScopeLabel('DSWL_ESS_ESR1'));
    expect(r.scope).toBe(coreScopeId('gate-record/arena/one-plan/DSWL_ESS_ESR1'));
    expect(r.od).toBe(20261126);
    expect(doc.plan.kw).toEqual([...F.arms.C.kw]);
    expect(doc.score.objective_uusd).toBe(p.score.objective);
    expect(encodeCommit(r)).toBe(viem.encodeFunctionData({ abi, functionName: 'commit', args: [r.scope, r.od, r.root, 1, r.codeHash] }));
    console.log(`arena leaf ${r.leaf} under ${r.scopeLabel} (${r.scope}), ${r.json.length} bytes`);
  });

  it('refuses a plan with the light on', () => {
    const plan = { step: 0, glass: [...F.arms.C.contracts] };
    expect(() => arenaLeaf(F, plan, play(F, plan), player, salt)).toThrow(/light is on/);
  });
});
