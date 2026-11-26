// RFC 6962 over the day's index of leaf hashes (the site's verifier, re-done here from frame-data.json's leaves):
// the root, and one leaf's audit path with the node each step makes, from the leaf up. WebCrypto's SHA-256.

const hex = (b: Uint8Array) => '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const bytes = (h: string) => { const s = h.slice(2), o = new Uint8Array(s.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16); return o; };
const sha = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));
const node = (l: Uint8Array, r: Uint8Array) => { const o = new Uint8Array(65); o[0] = 1; o.set(l, 1); o.set(r, 33); return sha(o); };
const split = (n: number) => { let k = 1; while (k * 2 < n) k *= 2; return k; };

async function mth(ls: readonly Uint8Array[]): Promise<Uint8Array> {
  if (ls.length === 1) return ls[0]!;
  const k = split(ls.length);
  return node(await mth(ls.slice(0, k)), await mth(ls.slice(k)));
}

export interface Step { side: 'left' | 'right'; sibling: string; result: string }

/** The audit path of leaf m and the walk up it (RFC 9162 2.1.3.2), with the root over all the leaves. */
export async function auditPath(leaves: readonly string[], m: number) {
  const L = leaves.map(bytes);
  const path: Uint8Array[] = [];
  const walk = async (d: readonly Uint8Array[], i: number): Promise<void> => {
    if (d.length === 1) return;
    const k = split(d.length);
    if (i < k) { await walk(d.slice(0, k), i); path.push(await mth(d.slice(k))); }
    else { await walk(d.slice(k), i - k); path.push(await mth(d.slice(0, k))); }
  };
  await walk(L, m);
  let fn = m, sn = L.length - 1, r = L[m]!;
  const steps: Step[] = [];
  for (const p of path) {
    if ((fn & 1) === 1 || fn === sn) {
      r = await node(p, r); steps.push({ side: 'left', sibling: hex(p), result: hex(r) });
      while ((fn & 1) === 0 && fn !== 0) { fn >>= 1; sn >>= 1; }
    } else { r = await node(r, p); steps.push({ side: 'right', sibling: hex(p), result: hex(r) }); }
    fn >>= 1; sn >>= 1;
  }
  return { steps, root: hex(r), fullRoot: hex(await mth(L)) };
}
