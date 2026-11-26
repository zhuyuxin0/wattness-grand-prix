// The brain station's particles, made before its clouds are built (SPEC 6.5: the Memory tab's opening must not stall the
// page): the shared surface sample of 90,000 points and each brain's particles and page places are pure functions of
// their seeds (shape.ts), so a module worker makes them (points.worker.ts) and this primes shape.ts's caches with what it
// sends back. A cloud built after it takes no long task; one built without it computes the same arrays itself, on the
// thread it runs on (a browser without module workers, Node).
import { hasPoints, hasPool, hasSpots, primePoints, primePool, primeSpots, type BrainPoints, type SurfacePool } from './shape';

export interface PointsJob { points: { seed: number; count: number; shellShare: number }[]; spots: { seed: number; n: number }[] }

let queue: Promise<void> = Promise.resolve();

/** Makes what the job names off the main thread and primes shape.ts with it; resolves once primed (or at once when all
 *  of it is made already, or there is no module worker: the clouds then make it themselves). Never rejects. */
export function preparePoints(job: PointsJob): Promise<void> {
  const run = queue.then(() => {
    const todo: PointsJob = { points: job.points.filter((j) => !hasPoints(j.seed, j.count, j.shellShare)), spots: job.spots.filter((j) => !hasSpots(j.seed, j.n)) };
    if (!todo.points.length && !todo.spots.length && hasPool()) return;
    if (typeof Worker !== 'function') return;
    return new Promise<void>((done) => {
      let w: Worker | null = null;
      // a worker that never answers (30 s) is let go: the clouds then make the arrays themselves
      const timer = setTimeout(() => end(), 30_000);
      const end = () => { clearTimeout(timer); w?.terminate(); w = null; done(); };
      try {
        w = new Worker(new URL('./points.worker.ts', import.meta.url), { type: 'module' });
      } catch { end(); return; }
      w.onerror = (e) => { e.preventDefault?.(); end(); };
      w.onmessageerror = () => end();
      w.onmessage = (e: MessageEvent<{ pool: SurfacePool; points: (PointsJob['points'][number] & { p: BrainPoints })[]; spots: (PointsJob['spots'][number] & { s: { pos: Float32Array; nrm: Float32Array } })[] }>) => {
        const r = e.data;
        primePool(r.pool);
        for (const x of r.points) primePoints(x.seed, x.count, x.shellShare, x.p);
        for (const x of r.spots) primeSpots(x.seed, x.n, x.s);
        end();
      };
      w.postMessage(todo);
    });
  });
  queue = run.catch(() => undefined);
  return run.catch(() => undefined);
}
