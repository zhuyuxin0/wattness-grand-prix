// The Worker against the real upstreams, in process: Greenfield's bucket and the public BSC RPCs, with no
// fetch stubbed. Off by default; EDGE_LIVE=1 pnpm test test/live.test.ts runs it. Each served file must
// hash to the SHA-256 the publisher recorded when it read the objects back (scripts/greenfield/published.json).
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import published from "../../../scripts/greenfield/published.json";
import { forgetVerified } from "../src/record.ts";
import { call, freshOrigin } from "./fake.ts";

const live = (env as unknown as { EDGE_LIVE?: string }).EDGE_LIVE === "1";
const ROOT = "0xf4d4002344fe98be0f64870221e5cc0b5e1d6111c05fe46c0131763d725bbce7";
const sha = new Map(published.files.map((f) => [f.object.replace("od-20261126/", ""), f.sha256]));

describe.runIf(live)("the Worker against Greenfield and BSC, 26 Nov", () => {
  const origin = freshOrigin();
  const rows: string[] = [];
  beforeAll(() => {
    vi.restoreAllMocks();
    forgetVerified();
  });

  const files: [string, string, number][] = [
    ["index.json", "manifest.json", 200],
    ["index.json?network=bsc-mainnet,bsc-testnet", "manifest.json", 200],
    ["leaves/DSWL_ESS_ESR1.json", "leaves/DSWL_ESS_ESR1.json", 200],
    ["leaves/DSWL_ESS_ESR1.scenarios.json", "leaves/DSWL_ESS_ESR1.scenarios.json", 200],
    ["leaves/ABINDUST_ESR1.json", "leaves/ABINDUST_ESR1.json", 200],
    ["record.bsc-mainnet.json", "record.bsc-mainnet.json", 200],
    ["record.bsc-testnet.json", "record.bsc-testnet.json", 200],
    ["root.hex", "root.hex", 200],
    ["salt.txt", "salt.txt", 200],
    ["sync/DSWL_ESS_ESR1.json", "sync/DSWL_ESS_ESR1.json", 404],
  ];
  for (const [path, object, status] of files) {
    it(`GET /day/2026-11-26/${path}`, async () => {
      const t0 = Date.now();
      const res = await call(origin, `/day/2026-11-26/${path}`);
      const body = new Uint8Array(await res.arrayBuffer());
      rows.push(`${res.status} ${res.headers.get("x-gate-verified")} ${res.headers.get("x-gate-cache") ?? "-"} ${Date.now() - t0} ms /day/2026-11-26/${path}`);
      expect(res.status, new TextDecoder().decode(body.slice(0, 400))).toBe(status);
      if (status === 200) {
        expect(res.headers.get("x-gate-sha256")).toBe(sha.get(object));
        expect(res.headers.get("x-gate-root")).toBe(ROOT);
      }
    });
  }

  it("GET /day/2026-11-20/index.json is a 404: no record of that day can exist", async () => {
    const res = await call(origin, "/day/2026-11-20/index.json");
    rows.push(`${res.status} ${res.headers.get("x-gate-verified")} - /day/2026-11-20/index.json`);
    expect(res.status).toBe(404);
  });

  for (const network of ["bsc-mainnet", "bsc-testnet"]) {
    it(`GET /verify/DSWL_ESS_ESR1?od=2026-11-26&network=${network}`, async () => {
      const t0 = Date.now();
      const res = await call(origin, `/verify/DSWL_ESS_ESR1?od=2026-11-26&network=${network}`);
      const v = (await res.json()) as { verdict: string; checks: { name: string; result: string }[] };
      rows.push(`${res.status} ${v.verdict} ${res.headers.get("x-gate-cache")} ${Date.now() - t0} ms /verify/DSWL_ESS_ESR1 ${network}: ${v.checks.map((c) => `${c.name}=${c.result}`).join(", ")}`);
      expect(v.verdict).toBe("pass");
    });
  }

  it("answers a repeated request from the edge cache", async () => {
    const res = await call(origin, "/day/2026-11-26/leaves/DSWL_ESS_ESR1.json");
    rows.push(`${res.status} ${res.headers.get("x-gate-verified")} ${res.headers.get("x-gate-cache")} repeat /day/2026-11-26/leaves/DSWL_ESS_ESR1.json`);
    expect(res.headers.get("x-gate-cache")).toBe("hit");
    console.log(rows.join("\n"));
  });
});
