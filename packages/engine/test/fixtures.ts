// Test fixtures: a deterministic price history shaped like a fall ERCOT day. Not market data.
import { addDays, dayType, type Day } from "../src/calendar.js";
import type { BatteryRecord, PlanInput, PriceDay, Provenance } from "../src/index.js";

export const OD = "2026-11-26";
export const GATE = 1795622400;
export const PLAN_UNIX = GATE - 3 * 3600;
export const SALT = `0x${"ab".repeat(32)}`;

export const BATTERY: BatteryRecord = {
  resource: "CLO_ESR1",
  settlementPoint: "CLO_RN",
  hub: "HB_HOUSTON",
  zone: "LZ_HOUSTON",
  county: "Harris",
  maxPowerKw: 100_000,
  energyKwh: 206_438,
  source: { route: "/api/fleet", sha256: "0".repeat(64) },
};

function noise(day: Day, i: number): number {
  let x = (Number(day.replaceAll("-", "")) * 2654435761 + i * 40503) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 2001) - 1000;
}

// cents per MWh: overnight trough, solar dip, evening peak; weekends cheaper.
function shape(h: number, offpeak: boolean): number {
  const evening = h >= 17 && h <= 20 ? 3500 : 0;
  const morning = h >= 6 && h <= 8 ? 900 : 0;
  const solar = h >= 10 && h <= 15 ? -800 : 0;
  return (offpeak ? 2200 : 2800) + evening + morning + solar;
}

export function hubDay(day: Day, withRt: boolean): PriceDay {
  const off = dayType(day) === "offpeak";
  const da = Array.from({ length: 24 }, (_, h) => shape(h, off) + noise(day, h));
  const rt15 = withRt ? Array.from({ length: 96 }, (_, i) => da[Math.floor(i / 4)]! + 2 * noise(day, 100 + i)) : null;
  return { point: "HB_HOUSTON", day, da, rt15 };
}

export function nodeDay(day: Day): PriceDay {
  const hub = hubDay(day, false).da!;
  return { point: "CLO_RN", day, da: hub.map((p, h) => p - 150 + (noise(day, 200 + h) >> 3)), rt15: null };
}

export function history(from: Day = "2026-09-30", lastDa: Day = "2026-11-24", lastRt: Day = "2026-11-23") {
  const hub: PriceDay[] = [];
  for (let d = from; d <= lastDa; d = addDays(d, 1)) hub.push(hubDay(d, d <= lastRt));
  const node: PriceDay[] = [];
  for (let d = "2026-11-18"; d <= lastDa; d = addDays(d, 1)) node.push(nodeDay(d));
  return { hub, node };
}

export const PROVENANCE: Provenance = {
  releaseId: "terminal-daily-20261124-1120",
  releaseGeneratedUnix: GATE - 86_400,
  manifestSha256: "1".repeat(64),
  files: [{ route: "/api/prices/HB_HOUSTON/2026-11-24", sha256: "2".repeat(64) }],
  live: [],
};

export function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  const { hub, node } = history();
  return {
    kind: "test",
    operatingDay: OD,
    planUnix: PLAN_UNIX,
    battery: BATTERY,
    hub,
    node,
    provenance: PROVENANCE,
    salt: SALT,
    engine: { repo: "https://github.com/zhuyuxin0/gatelock", commit: "0".repeat(40), tree: "0".repeat(40) },
    agent: { wallet: "0x0000000000000000000000000000000000000001", erc8004Id: null },
    ...overrides,
  };
}
