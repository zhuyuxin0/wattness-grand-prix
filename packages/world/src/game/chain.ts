// GateRecord as the page calls it: its address, BSC testnet's parameters, the commit and get calls encoded by hand,
// its errors and its Committed event decoded, record keys and scope ids, and the day-ahead gate's clock. The ABI is
// contracts/abi/GateRecord.json; chain.test.ts checks every encoding here against viem and packages/core.
import { fromHex, keccak256, toHex, utf8, type Hex } from './hash';

/** GateRecord, at the same address on BSC mainnet and testnet (contracts/deployments). This page writes only to 97. */
export const GATE_RECORD = '0x2922c68cE15EB3e83B7f43b136e981dDc4262876' as const;

export const BSC_TESTNET = {
  chainId: 97,
  hex: '0x61',
  name: 'BNB Smart Chain Testnet',
  currency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  // the RPCs packages/verifier/src/chain.ts reads the testnet record through
  rpcUrls: ['https://bsc-testnet-dataseed.bnbchain.org', 'https://bsc-testnet.bnbchain.org'],
  explorer: 'https://testnet.bscscan.com',
  faucet: 'https://www.bnbchain.org/en/testnet-faucet',
} as const;

export const selector = (signature: string) => keccak256(utf8(signature)).slice(0, 10) as Hex;

export const SIG = {
  commit: 'commit(bytes32,uint32,bytes32,uint32,bytes32)',
  get: 'get(bytes32)',
  committed: 'Committed(bytes32,address,bytes32,uint32,bytes32,uint32,bytes32)',
  afterGate: 'AfterGate(uint32,uint256)',
  alreadyCommitted: 'AlreadyCommitted(bytes32)',
  emptyRecord: 'EmptyRecord()',
  invalidDay: 'InvalidDay(uint32)',
} as const;

const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');
const b32 = (h: string, what: string) => {
  const s = h.startsWith('0x') ? h.slice(2) : h;
  if (!/^[0-9a-fA-F]{64}$/.test(s)) throw new Error(`${what} must be 32 bytes of hex`);
  return s.toLowerCase();
};
const u32 = (n: number, what: string) => { if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error(`${what} is not a uint32`); return n; };

export interface CommitArgs { scope: Hex; od: number; root: Hex; leafCount: number; codeHash: Hex }

/** Calldata for commit(scope, od, root, leafCount, codeHash). */
export function encodeCommit(a: CommitArgs): Hex {
  return `${selector(SIG.commit)}${b32(a.scope, 'scope')}${word(u32(a.od, 'od'))}${b32(a.root, 'root')}${word(u32(a.leafCount, 'leafCount'))}${b32(a.codeHash, 'codeHash')}` as Hex;
}

export const encodeGet = (key: Hex): Hex => `${selector(SIG.get)}${b32(key, 'key')}` as Hex;

export interface OnChainRecord {
  root: Hex; codeHash: Hex; scope: Hex; committer: Hex; od: number; leafCount: number; committedAt: number; blockNumber: number;
}

const words = (data: string) => {
  const s = data.startsWith('0x') ? data.slice(2) : data;
  const out: string[] = [];
  for (let i = 0; i + 64 <= s.length; i += 64) out.push(s.slice(i, i + 64));
  return out;
};
const asNum = (w: string) => Number(BigInt(`0x${w}`));
const asAddr = (w: string) => `0x${w.slice(24)}` as Hex;

/** get(key)'s return: the Record struct (all static fields, so eight words); committer 0 when none exists. */
export function decodeRecord(data: string): OnChainRecord {
  const w = words(data);
  if (w.length < 8) throw new Error('get(key) returned too little data');
  return {
    root: `0x${w[0]}` as Hex, codeHash: `0x${w[1]}` as Hex, scope: `0x${w[2]}` as Hex, committer: asAddr(w[3]!),
    od: asNum(w[4]!), leafCount: asNum(w[5]!), committedAt: asNum(w[6]!), blockNumber: asNum(w[7]!),
  };
}

export type Revert =
  | { name: 'AfterGate'; od: number; gate: number }
  | { name: 'AlreadyCommitted'; key: Hex }
  | { name: 'EmptyRecord' }
  | { name: 'InvalidDay'; od: number };

/** The contract's own refusals, from a revert's data; null for anything else. */
export function decodeRevert(data: unknown): Revert | null {
  if (typeof data !== 'string' || !data.startsWith('0x') || data.length < 10) return null;
  const sel = data.slice(0, 10).toLowerCase(), w = words(`0x${data.slice(10)}`);
  if (sel === selector(SIG.afterGate) && w.length >= 2) return { name: 'AfterGate', od: asNum(w[0]!), gate: asNum(w[1]!) };
  if (sel === selector(SIG.alreadyCommitted) && w.length >= 1) return { name: 'AlreadyCommitted', key: `0x${w[0]}` as Hex };
  if (sel === selector(SIG.emptyRecord)) return { name: 'EmptyRecord' };
  if (sel === selector(SIG.invalidDay) && w.length >= 1) return { name: 'InvalidDay', od: asNum(w[0]!) };
  return null;
}

export interface CommittedEvent { key: Hex; committer: Hex; scope: Hex; od: number; root: Hex; leafCount: number; codeHash: Hex }

/** GateRecord's Committed event from a receipt's logs, or null. */
export function findCommitted(logs: readonly { address?: string; topics?: readonly string[]; data?: string }[]): CommittedEvent | null {
  const topic = keccak256(utf8(SIG.committed));
  for (const l of logs) {
    if (!l.topics || l.topics.length < 4 || l.topics[0]!.toLowerCase() !== topic) continue;
    if (l.address && l.address.toLowerCase() !== GATE_RECORD.toLowerCase()) continue;
    const w = words(l.data ?? '0x');
    if (w.length < 4) continue;
    return {
      key: l.topics[1]!.toLowerCase() as Hex, committer: asAddr(l.topics[2]!.slice(2)), scope: l.topics[3]!.toLowerCase() as Hex,
      od: asNum(w[0]!), root: `0x${w[1]}` as Hex, leafCount: asNum(w[2]!), codeHash: `0x${w[3]}` as Hex,
    };
  }
  return null;
}

/** The bytes32 scope stored on chain for a scope label (packages/core scopeId). */
export const scopeId = (label: string): Hex => { if (!label) throw new Error('empty scope label'); return keccak256(utf8(label)); };

/** keccak256(abi.encode(committer, scope, od)), as GateRecord.keyOf computes it. */
export function recordKey(committer: string, scope: Hex, od: number): Hex {
  const a = committer.startsWith('0x') ? committer.slice(2) : committer;
  if (!/^[0-9a-fA-F]{40}$/.test(a)) throw new Error('committer is not an address');
  return keccak256(fromHex(`${a.toLowerCase().padStart(64, '0')}${b32(scope, 'scope')}${word(u32(od, 'od'))}`));
}

export const ZERO32 = `0x${'0'.repeat(64)}` as Hex;

// ── the gate's clock (packages/core/src/gate.ts, which mirrors GateRecord.gateTs) ──────────────────────────────────

const DAY = 86_400, HOUR = 3_600;

export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  return era * 146_097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719_468;
}

const weekday = (days: number) => (((days + 4) % 7) + 7) % 7; // 0 = Sunday; 1970-01-01 was a Thursday
const nthSunday = (year: number, month: number, n: number) => { const first = daysFromCivil(year, month, 1); return first + ((7 - weekday(first)) % 7) + 7 * (n - 1); };

/** Hours behind UTC at a local hour of a civil day in Central time (CDT 5 from the second Sunday of March at 02:00 to the
 *  first Sunday of November at 02:00, CST 6 otherwise). */
function centralOffset(year: number, days: number, hour: number): number {
  const start = nthSunday(year, 3, 2), end = nthSunday(year, 11, 1);
  const afterStart = days > start || (days === start && hour >= 2), beforeEnd = days < end || (days === end && hour < 2);
  return afterStart && beforeEnd ? 5 : 6;
}

/** "2026-11-26" as GateRecord's od, 20261126. */
export function odOf(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new RangeError(`bad day ${day}`);
  return Number(m[1]) * 10_000 + Number(m[2]) * 100 + Number(m[3]);
}

/** Unix seconds of the day-ahead gate for an operating day: 10:00 Central on the day before. */
export function gateUnix(day: string): number {
  const od = odOf(day), y = Math.floor(od / 10_000), mo = Math.floor(od / 100) % 100, d = od % 100;
  const gateDay = daysFromCivil(y, mo, d) - 1;
  const gy = new Date(gateDay * DAY * 1000).getUTCFullYear();
  return gateDay * DAY + (10 + centralOffset(gy, gateDay, 10)) * HOUR;
}

/** A unix time as Central time, "Thu Nov 26, 9:15:17 am CT", and in a reader's own zone. */
export function clockIn(unix: number, timeZone = 'America/Chicago', withSeconds = true): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}), hour12: true,
  }).formatToParts(new Date(unix * 1000));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  const sec = withSeconds ? `:${get('second')}` : '';
  return `${get('weekday')} ${get('month')} ${get('day')}, ${get('hour')}:${get('minute')}${sec} ${get('dayPeriod').toLowerCase()}`;
}

/** The reader's own zone, from the browser; Central when it cannot be read. */
export const READER_TZ: string = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'; } catch { return 'America/Chicago'; }
})();

/** A unix time as the site prints it, on a 24-hour clock: market time first ("Wed, Nov 25, 10:00 CT"), the reader's
 *  own beside it ("Nov 25, 23:00 yours"), or null for a reader whose clock reads the same as Central. `date: false`
 *  prints the time alone ("09:15:17 CT"). */
export function dualClock(unix: number, o: { seconds?: boolean; weekday?: boolean; date?: boolean } = {}): { ct: string; yours: string | null } {
  const at = (timeZone: string, weekday: boolean) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(unix * 1000));
    const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
    const time = `${get('hour')}:${get('minute')}${o.seconds ? `:${get('second')}` : ''}`;
    if (o.date === false) return time;
    return `${weekday ? `${get('weekday')}, ` : ''}${get('month')} ${get('day')}, ${time}`;
  };
  const own = at(READER_TZ, false);
  return { ct: `${at('America/Chicago', !!o.weekday)} CT`, yours: own === at('America/Chicago', false) ? null : `${own} yours` };
}

export const explorerTx = (tx: string) => `${BSC_TESTNET.explorer}/tx/${tx}`;
export const explorerAddress = (a: string) => `${BSC_TESTNET.explorer}/address/${a}`;
export { toHex };
