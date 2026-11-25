import { centsDay, sha256Hex, type PlanInputs } from "@gatelock/data";
import type { PlanInput } from "./plan.js";

/** The parts of a plan's input that come from one data sync. */
export function fromData(inputs: PlanInputs): Pick<PlanInput, "battery" | "hub" | "node" | "provenance"> {
  const generated = Date.parse(inputs.release.manifestGeneratedAt);
  if (Number.isNaN(generated)) throw new Error(`release generated_at is not a time: ${inputs.release.manifestGeneratedAt}`);
  const file = (f: { route: string; sha256: string }) => ({ route: f.route, sha256: f.sha256 });
  const b = inputs.battery;
  return {
    battery: {
      resource: b.resource,
      settlementPoint: b.settlementPoint,
      hub: b.hub,
      zone: b.zone,
      county: b.county,
      maxPowerKw: b.maxPowerKw,
      energyKwh: b.energyKwh,
      source: file(b.source),
    },
    hub: inputs.hub.map(centsDay),
    node: inputs.node.map(centsDay),
    provenance: {
      releaseId: inputs.release.dataRelease,
      releaseGeneratedUnix: Math.floor(generated / 1000),
      manifestSha256: inputs.release.dataManifestSha256,
      files: citedFiles(inputs).map(file),
      live: inputs.live.pins.map((p) => ({ route: p.path, sha256: p.sha256 })),
    },
  };
}

const byRoute = (a: { route: string }, b: { route: string }) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0);

/**
 * The release manifest, the catalogs that hold the cited routes, and the payloads, each group sorted.
 * A first sync also opens catalogs only to learn that a day is absent, reads the live tier's moving
 * current.json before it pins the day indexes, and reads in whatever order its fetches finish; citing
 * only what the payloads need keeps a replay's manifest byte-identical. The pins themselves are cited
 * under inputs.live.
 */
export function citedFiles(inputs: PlanInputs): { route: string; sha256: string }[] {
  const buckets = new Set(inputs.files.filter((f) => f.route.startsWith("/api/")).map((f) => sha256Hex(f.route).slice(0, 2)));
  const trail = inputs.trail.filter((f) => {
    if (f.route.endsWith("/manifest.json")) return true;
    const m = /\/catalogs\/([0-9a-f]{2})\.json$/.exec(f.route);
    return m !== null && buckets.has(m[1] as string);
  });
  const seen = new Set<string>();
  const payloads = inputs.files.filter((f) => !/\/(?:current|release)\.json$/.test(f.route));
  return [...trail.sort(byRoute), ...payloads.sort(byRoute)].filter((f) => {
    const k = `${f.route} ${f.sha256}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
