// The control room's pure parts: which receipt is the day's seal, the Fleet board's first rows, the battery search
// that opens Verify, the address that opens Ask Ness, and the stage's poster. No imports, so the tests run it in Node
// as it is (test/control-room.test.mjs).

/** The fields of a chain receipt the seal pane reads (src/data/types.ts ChainReceipt). */
export interface SealReceipt {
  chainId: number;
  chainName: string;
  mainnet: boolean;
  txHash: string;
  txUrl: string | null;
  blockNumber: number;
  blockTime: number;
  secondsBeforeGate: number;
  root: string;
  leafCount: number;
}

/** The day's seal: the mainnet commit when there is one, else the first on file. */
export function sealOf<R extends SealReceipt>(receipts: readonly R[]): R | null {
  return receipts.find((r) => r.mainnet) ?? receipts[0] ?? null;
}

/** The fields of a battery's summary the panes read (src/data/types.ts BatterySummary). */
export interface RoomBattery {
  resource: string;
  settlementPoint: string;
  hub: string;
  zone: string | null;
  county: string | null;
  powerMw: number;
  selectedArm: string;
  arms: Partial<Record<string, { expectedUsd: number } | undefined>>;
  scheduleMw: number[];
}

/** The Fleet board's first rows as it opens: sorted by the sealed plan's expected value, highest first, a missing
 *  value last, ties in the day's order (the board's sortRows on its "ev" column, descending). */
export function boardTop<B extends RoomBattery>(batteries: readonly B[], n = 4): B[] {
  const value = (b: B) => b.arms[b.selectedArm]?.expectedUsd;
  const missing = (v: number | undefined) => v == null || Number.isNaN(v);
  return batteries
    .map((b, i) => ({ b, i, v: value(b) }))
    .sort((x, y) => {
      const mx = missing(x.v), my = missing(y.v);
      if (mx || my) return mx === my ? x.i - y.i : mx ? 1 : -1;
      const c = (x.v as number) - (y.v as number);
      return c === 0 ? x.i - y.i : -c;
    })
    .slice(0, Math.max(0, n))
    .map((e) => e.b);
}

/** Batteries whose resource, node, hub, zone, county or plain name hold every word of the query, in the day's order;
 *  the Battery picker's match. An empty query finds none. */
export function findBatteries<B extends RoomBattery>(batteries: readonly B[], names: Readonly<Record<string, string>>, query: string, n = 5): B[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: B[] = [];
  for (const b of batteries) {
    const hay = `${b.resource} ${b.settlementPoint} ${b.hub} ${b.zone ?? ""} ${b.county ?? ""} ${names[b.resource] ?? ""}`.toLowerCase();
    if (words.every((w) => hay.includes(w))) out.push(b);
    if (out.length >= n) break;
  }
  return out;
}

/** Verify's address for one battery. */
export const verifyPath = (resource: string) => `/verify/${encodeURIComponent(resource)}`;

/** Ask Ness's prepared questions the pane offers, by the ids its answers file gives them (site/src/ness/answers.ts),
 *  each in its own words there. */
export const NESS_QUESTIONS: readonly { id: string; question: string }[] = [
  { id: "how-plans-are-made", question: "How are the plans made?" },
  { id: "verify-yourself", question: "How do I verify a plan myself?" },
  { id: "why-a-chain", question: "Why seal on a blockchain, not a timestamp?" },
];

/** The same search with Ask Ness open on one answer (id) or on its questions (null): the panel's own address,
 *  ?ask=<id> or ?ask=, every other parameter kept in its place. */
export function askSearch(search: string, id: string | null): string {
  const params = new URLSearchParams(search);
  params.set("ask", id ?? "");
  return `?${params.toString()}`;
}

/** The stage's poster, shown until the live 3D has drawn and alone with reduced motion: the stack at rest, chapter 21
 *  of the introduction ("What it is built from"), as the chapter panes show it (public/chapters/stack.webp, its
 *  receipt stack.json beside it). */
export const STAGE_POSTER = { file: "chapters/stack.webp", receipt: "chapters/stack.json", width: 960, height: 540 } as const;
