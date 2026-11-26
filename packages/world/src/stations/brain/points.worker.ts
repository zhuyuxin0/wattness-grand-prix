// The brain station's particles off the main thread (prepare.ts): the shared surface sample, each brain's particles and
// each brain's page places, made here by shape.ts with the seeds the clouds use, and sent back as transferred arrays.
// The same code and seeds as on the main thread, so a cloud built from them is the one it would have built itself.
import { brainPoints, pageSpots, surfacePool } from './shape';

interface Job { points: { seed: number; count: number; shellShare: number }[]; spots: { seed: number; n: number }[] }

const scope = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage(m: unknown, transfer: Transferable[]): void };

scope.onmessage = (e) => {
  const job = e.data;
  const pool = surfacePool();
  const points = job.points.map((j) => ({ ...j, p: brainPoints(j.seed, j.count, j.shellShare) }));
  const spots = job.spots.map((j) => ({ ...j, s: pageSpots(j.seed, j.n) }));
  const transfer: Transferable[] = [pool.pos.buffer, pool.nrm.buffer];
  // any further per-point array the pool carries goes with it
  for (const v of Object.values(pool)) if (v instanceof Float32Array && v !== pool.pos && v !== pool.nrm) transfer.push(v.buffer);
  for (const { p } of points) transfer.push(p.pos.buffer, p.start.buffer, p.size.buffer, p.bright.buffer, p.phase.buffer, p.mix.buffer);
  for (const { s } of spots) transfer.push(s.pos.buffer, s.nrm.buffer);
  scope.postMessage({ pool, points, spots }, transfer);
};
