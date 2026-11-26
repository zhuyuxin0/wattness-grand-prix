// @ts-nocheck
// The Wattness layer: a plane of the Terminal's liquid glass (glass.css: the raised pane colour over a 6 px blur
// with saturate 1.4, a white hairline, an inner rim lit at the top and dark at the bottom, and the 122-degree sheen),
// drawn in WebGL over a blurred copy of the scene, carrying the Wattness mark.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { lin } from './geo';

const BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
  c += texture2D(tDiffuse, vUv + uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tDiffuse, vUv - uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tDiffuse, vUv + uDir * 3.2307692308) * 0.0702702703;
  c += texture2D(tDiffuse, vUv - uDir * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}`;
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** Copies the opaque scene (before the overlay pass) into a quarter-resolution target and blurs it. */
export class GrabBlurPass extends Pass {
  constructor(w, h, { passes = 3, radius = 1.6 } = {}) {
    super();
    this.needsSwap = false;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.a = new THREE.WebGLRenderTarget(Math.max(1, w >> 2), Math.max(1, h >> 2), opt);
    this.b = this.a.clone();
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLUR_FRAG, uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.copy = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }', uniforms: { tDiffuse: { value: null } }, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.copy);
    this.passes = passes; this.radius = radius;
    this.texture = this.a.texture;
  }
  setSize(w, h) { this.a.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); this.b.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); }
  render(renderer, writeBuffer, readBuffer) {
    if (!this.enabled) return;
    const rt0 = renderer.getRenderTarget();
    this.copy.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.copy; renderer.setRenderTarget(this.a); this.quad.render(renderer);
    this.quad.material = this.mat;
    const w = this.a.width, h = this.a.height;
    for (let i = 0; i < this.passes; i++) {
      const r = this.radius * (1 + i * 0.6);
      this.mat.uniforms.tDiffuse.value = this.a.texture; this.mat.uniforms.uDir.value.set(r / w, 0);
      renderer.setRenderTarget(this.b); this.quad.render(renderer);
      this.mat.uniforms.tDiffuse.value = this.b.texture; this.mat.uniforms.uDir.value.set(0, r / h);
      renderer.setRenderTarget(this.a); this.quad.render(renderer);
    }
    renderer.setRenderTarget(rt0);
  }
}

const GLASS_VERT = /* glsl */`
varying vec2 vUv; varying vec3 vWorld;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GLASS_FRAG = /* glsl */`
uniform sampler2D tBlur; uniform sampler2D tMark; uniform vec2 uRes; uniform vec2 uSize; uniform float uRadius;
uniform vec3 uFill; uniform float uFillA; uniform vec3 uHair; uniform float uHairA; uniform float uSheen; uniform float uLight;
uniform vec4 uMarkRect; uniform vec3 uMarkColor; uniform float uMarkA; uniform float uOpacity;
uniform float uMargin; uniform float uClamp; uniform vec2 uShadowOff; uniform float uShadowA; uniform float uShadowR;
varying vec2 vUv; varying vec3 vWorld;
float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  // the mesh is larger than the pane by uMargin on every side: outside the pane it draws glass.css's depth shadow
  vec2 full = uSize + 2.0 * uMargin;
  vec2 p = (vUv - 0.5) * full;
  float d = sdRound(p, uSize * 0.5, uRadius);
  float px = max(fwidth(d), 1e-4);
  float inside = 1.0 - smoothstep(-px, px * 0.5, d);
  if (inside <= 0.001) {
    float ds = sdRound(p - uShadowOff, uSize * 0.5 - 4.0, uRadius);
    float sh = (1.0 - smoothstep(-uShadowR * 0.35, uShadowR, ds)) * uShadowA;
    if (sh < 0.004) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, sh * uOpacity);
    return;
  }
  vec2 uvIn = (p / uSize) + 0.5; // the pane's own uv
  vec3 bg = texture2D(tBlur, gl_FragCoord.xy / uRes).rgb;
  float l = dot(bg, vec3(0.2126, 0.7152, 0.0722));
  bg = max(mix(vec3(l), bg, 1.4), 0.0);
  // keep bright things under the pane (the city's white blocks) from smearing into a pale blot: cap the blurred scene
  // a little above the pane's own fill
  float lf = dot(uFill, vec3(0.2126, 0.7152, 0.0722));
  bg *= min(1.0, (lf + uClamp) / max(dot(bg, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
  vec3 c = mix(bg, uFill, uFillA);
  // sheen: glass.css's 122-degree gradient (bright at the start, a second soft band near the end)
  float t = dot(uvIn - 0.5, normalize(vec2(0.53, -0.85))) + 0.5;
  float sheen = 0.62 * (1.0 - smoothstep(0.0, 0.22, t)) + 0.10 * (1.0 - smoothstep(0.22, 0.42, t)) + 0.26 * smoothstep(0.74, 0.93, t) * (1.0 - smoothstep(0.93, 1.0, t));
  c += vec3(sheen * uSheen * uLight);
  // the rim: a bright inner line along the far edges, a darker one along the near edges, and the hairline
  float inner = 1.0 - smoothstep(0.0, px * 3.0, -d);
  float far = smoothstep(0.1, -0.6, (uvIn.y - 0.5) + (0.5 - uvIn.x) * 0.4);
  c = mix(c, c * 0.55, inner * (1.0 - far) * 0.55);
  c += vec3(0.9) * inner * far * 0.22 * uLight;
  float hair = 1.0 - smoothstep(px * 0.6, px * 1.6, -d);
  c = mix(c, uHair, hair * uHairA);
  // the mark
  // the mark reads along north (up and to the right on screen), its top toward the west
  // Sampled outside any branch with clamped coordinates (a texture read inside a branch has no derivatives at the
  // rect's edge, which drew a dotted seam beside the mark), then masked; the canvas keeps a clear margin all round.
  vec2 m = (vec2(uvIn.y, 1.0 - uvIn.x) - uMarkRect.xy) / uMarkRect.zw;
  float inMark = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
  float ma = smoothstep(0.02, 0.55, texture2D(tMark, clamp(m, 0.0, 1.0)).a) * inMark;
  c = mix(c, uMarkColor, ma * uMarkA);
  gl_FragColor = vec4(c, inside * uOpacity);
}`;

/** The mark and the word, white on transparent, for the plane (the Terminal's Logo geometry and Libre Franklin 600). */
export async function markTexture() {
  try { await document.fonts.load('600 120px "Libre Franklin Brand"'); } catch { /* fall back to the system face */ }
  const c = document.createElement('canvas'); c.width = 2304; c.height = 640;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.save(); g.translate(168, 136); g.scale(5.6, 5.6);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'butt'; g.lineJoin = 'miter'; g.miterLimit = 12;
  g.stroke(new Path2D('M0 28.2 H13.95 L20.45 53.65 L32.5 5.2 L44.45 53.65 L50.7 28.2 H59.35'));
  g.beginPath(); g.arc(61.5, 28.2, 2.85, 0, Math.PI * 2); g.fill();
  g.restore();
  g.font = '600 236px "Libre Franklin Brand", "Helvetica Neue", Arial, sans-serif';
  g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.letterSpacing = '-6px';
  g.fillText('Wattness', 598, 302);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture: t, aspect: c.width / c.height };
}

/** A flat rounded-rectangle plane of glass, size w (x) by d (z), at height y. Its uv: u along +x, v along -z (north).
 *  uMarkRect: (start along north, start along west, length along north, height along west), as fractions. */
export function glassPlane({ w, d, y, x = 0, z = 0, radius = 26, theme, blur, mark, res }) {
  const dark = theme !== 'light';
  const M = 70;
  const g = new THREE.PlaneGeometry(w + 2 * M, d + 2 * M).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false, depthTest: true,
    extensions: { derivatives: true },
    uniforms: {
      tBlur: { value: blur }, tMark: { value: mark.texture }, uRes: { value: res.clone() }, uSize: { value: new THREE.Vector2(w, d) }, uRadius: { value: radius },
      uFill: { value: lin(dark ? '#1f2429' : '#ffffff').clone() }, uFillA: { value: dark ? 0.3 : 0.12 },
      uHair: { value: lin(dark ? '#a9b3bd' : '#9aa3ad').clone() }, uHairA: { value: dark ? 0.85 : 0.95 },
      uSheen: { value: dark ? 0.14 : 0.1 }, uLight: { value: dark ? 0.9 : 1.0 },
      uMarkRect: { value: new THREE.Vector4() }, uMarkColor: { value: lin(dark ? '#d7d9d4' : '#1a1a1a').clone() }, uMarkA: { value: dark ? 0.92 : 0.86 }, uOpacity: { value: 1 },
      uMargin: { value: M }, uClamp: { value: dark ? 0.05 : 0.3 }, uShadowOff: { value: new THREE.Vector2(10, -18) }, uShadowA: { value: dark ? 0.32 : 0.17 }, uShadowR: { value: 60 },
    },
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(x, y, z); mesh.renderOrder = 10; mesh.userData.overlay = true; mesh.userData.noAO = true;
  return mesh;
}
