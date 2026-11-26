// @ts-nocheck
// Ported from landing-3d/live/kit/textures.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// Procedural canvas textures (no image files). All small; generated once per page.

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function canvas(w, h = w) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/** Tileable value-noise fBm in [0,1]. */
function noiseField(size, octaves, seed, base = 4) {
  const r = rng(seed); const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const g = base << o; const grid = new Float32Array(g * g);
    for (let i = 0; i < grid.length; i++) grid[i] = r();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * g, fy = (y / size) * g;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = grid[(y0 % g) * g + (x0 % g)], b = grid[(y0 % g) * g + ((x0 + 1) % g)];
      const c = grid[((y0 + 1) % g) * g + (x0 % g)], d = grid[((y0 + 1) % g) * g + ((x0 + 1) % g)];
      out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function toTexture(THREE, c, { srgb = false, repeat = [1, 1], wrap = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** Roughness variation (green channel), values lo..hi. Tiles every `metres`. */
export function roughnessTex(THREE, { lo = 0.78, hi = 1.0, metres = 1.6, seed = 7 } = {}) {
  const s = 256, c = canvas(s), ctx = c.getContext('2d'), img = ctx.createImageData(s, s);
  const f = noiseField(s, 5, seed, 4), f2 = noiseField(s, 3, seed + 3, 16);
  for (let i = 0; i < s * s; i++) {
    const v = lo + (hi - lo) * Math.min(1, Math.max(0, 0.65 * f[i] + 0.35 * f2[i]));
    const b = Math.round(v * 255); img.data.set([b, b, b, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(THREE, c, { repeat: [1 / metres, 1 / metres] });
}

/** Paint colour map: mottling, faint vertical streaks, a dust band at the bottom (v metres from the base). */
export function paintTex(THREE, { seed = 11, heightM = 3.2, widthM = 2.4, dust = 0.1 } = {}) {
  const w = 256, h = 512, c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  const f = noiseField(w, 5, seed, 4); const r = rng(seed + 1);
  const streak = new Float32Array(w);
  for (let x = 0; x < w; x++) streak[x] = 0;
  for (let k = 0; k < 26; k++) { const x0 = Math.floor(r() * w), wd = 1 + Math.floor(r() * 3), a = 0.012 + r() * 0.03; for (let x = x0; x < x0 + wd; x++) streak[x % w] += a; }
  for (let y = 0; y < h; y++) {
    const vM = (1 - y / h) * heightM; // canvas top = high v
    const band = vM < 0.45 ? dust * Math.pow(1 - vM / 0.45, 1.6) : 0;
    const top = vM > heightM - 0.6 ? 0.6 : Math.max(0, 1 - (heightM - 0.6 - vM) / 1.4) * 0.6;
    for (let x = 0; x < w; x++) {
      const m = 0.985 + 0.03 * (f[(y % w) * w + x] - 0.5);
      const v = Math.max(0, Math.min(1, m - band - streak[x] * top));
      const b = Math.round(v * 255); img.data.set([b, b, b, 255], (y * w + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(THREE, c, { srgb: true, repeat: [1 / widthM, 1 / heightM] });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Sealed concrete with saw-cut joints every `joint` metres. */
export function padTex(THREE, { joint = 6, seed = 21 } = {}) {
  const s = 512, c = canvas(s), ctx = c.getContext('2d'), img = ctx.createImageData(s, s);
  const f = noiseField(s, 6, seed, 4), f2 = noiseField(s, 2, seed + 5, 32);
  for (let i = 0; i < s * s; i++) {
    const v = 0.84 + 0.05 * (f[i] - 0.5) * 1.2 + 0.03 * (f2[i] - 0.5);
    const b = Math.round(Math.max(0, Math.min(1, v)) * 255); img.data.set([b, b, b, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.11)'; ctx.fillRect(0, 0, s, 2); ctx.fillRect(0, 0, 2, s);
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, 2, s, 1); ctx.fillRect(2, 0, 1, s);
  return toTexture(THREE, c, { srgb: true, repeat: [1 / joint, 1 / joint] });
}

/** Compacted caliche base (the pad): broad mottling, faint tyre-worn streaks, fine light and dark grit; no joints. */
export function calicheTex(THREE, { seed = 23, metres = 9 } = {}) {
  const s = 512, c = canvas(s), ctx = c.getContext('2d'), img = ctx.createImageData(s, s);
  const r = rng(seed); const f = noiseField(s, 6, seed, 3), f2 = noiseField(s, 3, seed + 9, 24);
  for (let i = 0; i < s * s; i++) {
    const grit = r(); const g = grit > 0.985 ? 0.07 : grit < 0.02 ? -0.08 : (grit - 0.5) * 0.035;
    const v = 0.86 + 0.09 * (f[i] - 0.5) * 1.3 + 0.035 * (f2[i] - 0.5) + g;
    const b = Math.max(0, Math.min(1, v));
    // a faint warm/cool shift with the mottling, so it reads as earth rather than grey paint
    img.data.set([Math.round(b * 255), Math.round(b * 251), Math.round(b * 244), 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(THREE, c, { srgb: true, repeat: [1 / metres, 1 / metres] });
}

/** Crushed rock / gravel speckle. */
export function gravelTex(THREE, { seed = 31, metres = 2.5 } = {}) {
  const s = 256, c = canvas(s), ctx = c.getContext('2d'), img = ctx.createImageData(s, s);
  const r = rng(seed); const f = noiseField(s, 4, seed, 8);
  for (let i = 0; i < s * s; i++) {
    const v = 0.86 + 0.16 * (r() - 0.5) * 1.4 + 0.1 * (f[i] - 0.5);
    const b = Math.round(Math.max(0, Math.min(1, v)) * 255); img.data.set([b, b, b, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(THREE, c, { srgb: true, repeat: [1 / metres, 1 / metres] });
}

/** Chain-link diamonds as an alpha map: 50 mm mesh, about 15% coverage once mipmapped. */
export function chainTex(THREE) {
  const s = 128, c = canvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2;
  const n = 4, step = s / n;
  for (let i = -n; i <= 2 * n; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step + s, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i * step, s); ctx.lineTo(i * step + s, 0); ctx.stroke();
  }
  return toTexture(THREE, c, { repeat: [1 / 0.2, 1 / 0.2] });
}

/** A soft rounded-rectangle shadow (white = dark) for contact-shadow quads. `inset` is the shape's share. */
export function contactTex(THREE, { inset = 0.62, round = 0.18, blur = 0.13 } = {}) {
  const s = 256, c = canvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
  const w = s * inset, x0 = (s - w) / 2, r = w * round;
  ctx.filter = `blur(${Math.round(s * blur)}px)`;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.roundRect(x0, x0, w, w, r); ctx.fill();
  ctx.filter = `blur(${Math.round(s * blur * 0.35)}px)`;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath(); ctx.roundRect(x0 + 4, x0 + 4, w - 8, w - 8, r); ctx.fill();
  return toTexture(THREE, c, { wrap: false });
}

/** Radial falloff (white centre) for round objects: poles, people. */
export function radialTex(THREE) {
  const s = 128, c = canvas(s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return toTexture(THREE, c, { wrap: false });
}

/** A small text decal (hour ticks): light glyphs on transparent. */
export function textTex(THREE, text, { color = '#d7d9d4', px = 64, font = 'ui-monospace, Menlo, monospace', weight = 500 } = {}) {
  const c = canvas(px * 2, px), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = `${weight} ${Math.round(px * 0.78)}px ${font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = toTexture(THREE, c, { srgb: true, wrap: false });
  return t;
}
