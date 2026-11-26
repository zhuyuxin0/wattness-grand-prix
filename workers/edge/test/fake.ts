// Upstreams for the tests: the sealed day's files as Greenfield would serve them, and GateRecord's answers
// as test/fixtures/chain.json recorded them. Every outbound fetch the Worker makes lands here.
import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { vi } from "vitest";
import clo from "../../../fixtures/od-20261126/leaves/CLO_ESR1.json?raw";
import cloScenarios from "../../../fixtures/od-20261126/leaves/CLO_ESR1.scenarios.json?raw";
import dswl from "../../../fixtures/od-20261126/leaves/DSWL_ESS_ESR1.json?raw";
import dswlScenarios from "../../../fixtures/od-20261126/leaves/DSWL_ESS_ESR1.scenarios.json?raw";
import index from "../../../fixtures/od-20261126/manifest.json?raw";
import receiptMainnet from "../../../fixtures/od-20261126/record.bsc-mainnet.json?raw";
import receiptTestnet from "../../../fixtures/od-20261126/record.bsc-testnet.json?raw";
import root from "../../../fixtures/od-20261126/root.txt?raw";
import worker from "../src/index.ts";
import chain from "./fixtures/chain.json";

export const DAY = "od-20261126";
export const BASE = env.GREENFIELD_BASE;

/** The published objects of 26 Nov that the repository's fixture holds, by object name. */
export function sealedObjects(): Map<string, string> {
  return new Map([
    [`${DAY}/manifest.json`, index],
    [`${DAY}/leaves/DSWL_ESS_ESR1.json`, dswl],
    [`${DAY}/leaves/DSWL_ESS_ESR1.scenarios.json`, dswlScenarios],
    [`${DAY}/leaves/CLO_ESR1.json`, clo],
    [`${DAY}/leaves/CLO_ESR1.scenarios.json`, cloScenarios],
    [`${DAY}/record.bsc-mainnet.json`, receiptMainnet],
    [`${DAY}/record.bsc-testnet.json`, receiptTestnet],
    [`${DAY}/root.hex`, root],
    // The salt is in every leaf; the published salt.txt is that value and a newline.
    [`${DAY}/salt.txt`, `${(JSON.parse(dswl) as { salt: string }).salt}\n`],
    [`${DAY}/sync/DSWL_ESS_ESR1.json`, `{"schema": "not covered by the record"}\n`],
  ]);
}

export const text = { index, dswl, dswlScenarios, clo, cloScenarios, receiptMainnet, receiptTestnet, root };

type Network = "bsc-mainnet" | "bsc-testnet";
interface Answer {
  method: string;
  to?: string;
  data?: string;
  hash?: string;
  result: unknown;
}
interface Call {
  id: number;
  method: string;
  params: unknown[];
}

const keyOf = (a: { method: string; to?: string; data?: string; hash?: string }) => [a.method, a.to ?? "", a.data ?? "", a.hash ?? ""].join("|");
const probeOf = (c: Call) => {
  const p = c.params as [{ to?: string; data?: string } | string | undefined];
  if (c.method === "eth_call") return keyOf({ method: c.method, to: String((p[0] as { to?: string })?.to).toLowerCase(), data: String((p[0] as { data?: string })?.data).toLowerCase() });
  if (c.method === "eth_getTransactionReceipt") return keyOf({ method: c.method, hash: String(p[0]).toLowerCase() });
  return keyOf({ method: c.method });
};

const answers: Record<Network, Map<string, unknown>> = {
  "bsc-mainnet": new Map((chain.networks["bsc-mainnet"] as Answer[]).map((a) => [keyOf(a), a.result])),
  "bsc-testnet": new Map((chain.networks["bsc-testnet"] as Answer[]).map((a) => [keyOf(a), a.result])),
};

export interface Upstreams {
  objects: Map<string, string | Uint8Array>;
  /** Replaces a recorded answer: return undefined to keep it. */
  rpc?: (network: Network, call: Call, recorded: unknown) => unknown;
  /** Object names and RPC methods requested, in order. */
  log: string[];
}

export function upstreams(rpc?: Upstreams["rpc"]): Upstreams {
  const u: Upstreams = { objects: sealedObjects(), log: [], ...(rpc ? { rpc } : {}) };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = request.url;
    if (url.startsWith(BASE)) {
      const name = url.slice(BASE.length);
      u.log.push(`greenfield ${name}`);
      const body = u.objects.get(name);
      if (body === undefined) return new Response("<Error><Code>50025</Code><Message>no such object</Message></Error>", { status: 404, headers: { "content-type": "application/xml" } });
      return new Response(body, { status: 200, headers: { "content-type": name.endsWith(".json") ? "application/json" : "text/plain" } });
    }
    const listed = (list: string) => list.split(",").some((u) => new URL(u).href === url);
    const network: Network | null = listed(env.RPC_BSC_MAINNET) ? "bsc-mainnet" : listed(env.RPC_BSC_TESTNET) ? "bsc-testnet" : null;
    if (network && request.method === "POST") {
      const sent = (await request.json()) as Call | Call[];
      const calls = Array.isArray(sent) ? sent : [sent];
      const replies = calls.map((c) => {
        u.log.push(`${network} ${c.method}`);
        const recorded = answers[network].get(probeOf(c));
        const result = u.rpc?.(network, c, recorded) ?? recorded;
        if (result === undefined) return { jsonrpc: "2.0", id: c.id, error: { code: -32000, message: `not in chain.json: ${probeOf(c)}` } };
        return { jsonrpc: "2.0", id: c.id, result };
      });
      return Response.json(Array.isArray(sent) ? replies : replies[0]);
    }
    throw new Error(`unexpected fetch ${request.method} ${url}`);
  });
  return u;
}

let origin = 0;
/** A fresh origin per test, so one test's edge cache entries are not another's. */
export const freshOrigin = () => `https://t${++origin}.edge.test`;

export async function call(origin: string, path: string, init?: RequestInit, bindings: Cloudflare.Env = env): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${origin}${path}`, init) as Request<unknown, IncomingRequestCfProperties>, bindings, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

export const bytesOf = async (res: Response) => new Uint8Array(await res.arrayBuffer());
export const utf8 = (s: string) => new TextEncoder().encode(s);
