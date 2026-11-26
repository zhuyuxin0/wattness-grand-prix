import type { FleetPoints, TexasGeo } from "./model";

// The map's two files, under public/geo/ (outside public/data/, which scripts/build-data.mjs rebuilds whole): the
// battery points cut from wattness.tech's fleet-geo route, and Texas's ground from its geo layers, each with its
// receipt. Fetched once a page load and shared, like src/data/load.ts.

const cache = new Map<string, Promise<unknown>>();

function fetchGeo<T>(file: string): Promise<T> {
  let p = cache.get(file) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}geo/${file}`).then(async (res) => {
      if (!res.ok) throw new Error(`geo/${file}: HTTP ${res.status}`);
      return (await res.json()) as T;
    });
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p;
}

export const loadPoints = () => fetchGeo<FleetPoints>("fleet-points.json");
export const loadTexas = () => fetchGeo<TexasGeo>("texas.json");
