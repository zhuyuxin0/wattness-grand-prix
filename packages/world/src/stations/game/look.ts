// The Arcade's materials, on the kit's procedural textures: walnut-graphite panels (a dark grain 0.85 of the way to
// #1f2429, lacquered), brushed brass (metalness 1, roughness 0.32), graphite paint, sealed graphite concrete for the
// plinth, tungsten bulbs, and the enamel of the coins (a data mark: its ramp color shaded by the key as the field's
// bars are, so the color reads as the field's).
import * as THREE from 'three';
import { padTex, roughnessTex } from '../../kit/textures';
import { exactColor } from '../../kit/tone';
import { lin } from '../../kit/region/geo';
import { rng } from '../../lib/random';

export const ARCADE = { tungsten: '#ffcf8f', brass: '#b8935a', graphite: '#1f2429', night: '#101315', apron: '#14171a', hair: '#2b3036' };
export const PAL = {
  teal: '#2ec7a6', charge: '#7f9cc0', orange: '#eb6834', bnb: '#F0B90B', light: '#ffe3ad', refused: '#e5534b',
  ink: '#e6e8ea', strong: '#f6f7f8', muted: '#969ca3', armA: '#2c60de', armB: '#d95926', armC: '#9085e9',
};

/** Bloom's own layer: emissive parts drawn again into the bloom pass (bloom.ts). */
export const BLOOM = 3;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

/** Walnut grain mixed 0.85 of the way to graphite: long figure along u, a few cathedral arcs, fine pores. */
function walnutTex() {
  const R = rng(0x77a1);
  return canvasTex(1024, 256, (g) => {
    const W = 1024, H = 256, img = g.createImageData(W, H);
    const arcs = Array.from({ length: 7 }, () => ({ x: R.range(0, W), y: R.range(0, H), k: R.range(0.0015, 0.004), p: R.range(0, 6.28) }));
    const base = [92, 62, 42], dark = [52, 33, 22], gph = [0x1f, 0x24, 0x29];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0.5 + 0.22 * Math.sin(y * 0.21 + Math.sin(x * 0.006 + y * 0.01) * 2.4) + 0.12 * Math.sin(y * 0.83 + x * 0.002);
      for (const a of arcs) { const d = Math.abs((y - a.y) - a.k * (x - a.x) ** 2 * 0.06); v += 0.1 * Math.exp(-d * 0.08) * Math.sin(d * 0.5 + a.p); }
      v += (R.next() - 0.5) * 0.18;
      const t = Math.max(0, Math.min(1, v));
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) { const wood = dark[k]! + (base[k]! - dark[k]!) * t; img.data[i + k] = Math.round(wood + (gph[k]! - wood) * 0.85); }
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

/** Brushed metal: streaks along u, for roughness. */
function brushedTex() {
  const R = rng(0x5b3);
  return canvasTex(512, 64, (g) => {
    const W = 512, H = 64, img = g.createImageData(W, H);
    const rows = Array.from({ length: H }, () => R.next());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = 0.62 + 0.3 * rows[y]! + 0.08 * Math.sin(x * 0.05 + rows[y]! * 9);
      const i = (y * W + x) * 4; const b = Math.round(Math.max(0, Math.min(1, v)) * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
}

export function arcadeMaterials(env: THREE.Texture | null) {
  const walnutMap = walnutTex(); walnutMap.repeat.set(0.08, 0.3);
  const brushed = brushedTex(); brushed.repeat.set(0.25, 2);
  const rough = roughnessTex(THREE, { lo: 0.7, hi: 1.0, metres: 1.4 });
  const pad = padTex(THREE, { joint: 6 }); pad.repeat.set(1 / 6, 1 / 6);
  const withEnv = <T extends THREE.MeshStandardMaterial>(m: T, k: number) => { if (env) { m.envMap = env; m.envMapIntensity = k; } return m; };
  const m = {
    walnut: withEnv(new THREE.MeshPhysicalMaterial({ map: walnutMap, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.22 }), 0.22),
    paint: withEnv(new THREE.MeshPhysicalMaterial({ color: lin(ARCADE.graphite).clone(), roughness: 0.5, roughnessMap: rough, clearcoat: 0.35, clearcoatRoughness: 0.3 }), 0.18),
    trim: withEnv(new THREE.MeshPhysicalMaterial({ color: lin('#15181c').clone(), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.18 }), 0.22),
    brass: withEnv(new THREE.MeshStandardMaterial({ color: new THREE.Color(ARCADE.brass), metalness: 1, roughness: 0.32, roughnessMap: brushed }), 0.9),
    brassDark: withEnv(new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a6d42'), metalness: 1, roughness: 0.42, roughnessMap: brushed }), 0.7),
    steel: withEnv(new THREE.MeshStandardMaterial({ color: new THREE.Color('#9aa2aa'), metalness: 0.9, roughness: 0.36, roughnessMap: brushed }), 0.6),
    knurl: withEnv(new THREE.MeshStandardMaterial({ color: new THREE.Color(ARCADE.brass), metalness: 1, roughness: 0.5 }), 0.9),
    concrete: withEnv(new THREE.MeshStandardMaterial({ map: pad, color: new THREE.Color('#3f454c'), roughness: 0.82, roughnessMap: rough }), 0.35),
    rubber: new THREE.MeshStandardMaterial({ color: lin('#0d0f11').clone(), roughness: 0.85 }),
    screen: new THREE.MeshBasicMaterial({ color: exactColor(THREE, '#0b0f12') }),
    hair: new THREE.MeshBasicMaterial({ color: exactColor(THREE, ARCADE.hair) }),
  };
  return m;
}

const ENAMEL_VERT = /* glsl */`
attribute vec3 aColor;
varying vec3 vColor; varying vec3 vN; varying vec3 vW;
void main() {
  vColor = aColor;
  vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const ENAMEL_FRAG = /* glsl */`
uniform vec3 uKey; uniform vec3 uWarm;
varying vec3 vColor; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(cameraPosition - vW);
  float lam = max(dot(n, normalize(uKey)), 0.0);
  float s = 0.62 + 0.38 * lam + 0.06 * max(n.y, 0.0);
  vec3 c = vColor * s;
  // the enamel's clearcoat: a narrow highlight of the warm practicals and a grazing sheen
  vec3 H = normalize(normalize(uWarm) + V);
  c += vec3(1.0, 0.9, 0.75) * pow(max(dot(n, H), 0.0), 90.0) * 0.45;
  c += vec3(0.6, 0.66, 0.75) * pow(1.0 - max(dot(n, V), 0.0), 4.0) * 0.16;
  gl_FragColor = vec4(c, 1.0);
}`;

/** The coins' enamel: per-instance ramp color (linear, pre-tone-mapped as the field's are), shaded like the bars. */
export function enamelMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: ENAMEL_VERT, fragmentShader: ENAMEL_FRAG,
    uniforms: { uKey: { value: new THREE.Vector3(-0.45, 0.77, 0.45) }, uWarm: { value: new THREE.Vector3(0.1, 0.6, 0.8) } },
  });
}
