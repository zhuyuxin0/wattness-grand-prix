/** Poll already queued programs without blocking on their link status. The caller owns the render targets. */
export async function waitForPrograms(programs: ReadonlySet<{ isReady(): boolean }>, alive: () => boolean,
  clock = () => performance.now(), later = (next: () => void) => setTimeout(next, 10), ceiling = 5000):
  Promise<{ state: 'ready' | 'cancelled' | 'ceiling'; programs: number }> {
  const pending = new Set(programs), started = clock();
  return new Promise(resolve => {
    const check = () => {
      // Disposal wins before inspecting programs whose GL resources have gone.
      if (!alive()) { resolve({ state: 'cancelled', programs: programs.size }); return; }
      for (const program of pending) if (program.isReady()) pending.delete(program);
      if (!pending.size) resolve({ state: 'ready', programs: programs.size });
      else if (clock() - started >= ceiling) resolve({ state: 'ceiling', programs: programs.size });
      else later(check);
    };
    check();
  });
}
