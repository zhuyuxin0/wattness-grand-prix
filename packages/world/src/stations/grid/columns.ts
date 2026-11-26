// Data columns as the walkthrough draws its bars: instanced boxes whose colors land on their hexes (fed through the
// tone curve's inverse), shaded per face from the stage's key so a box reads as a box, a hairline edge, a darker foot,
// and a fade into the venue's fog with distance so a long grid keeps its depth. Opaque: they take the stage's ambient
// occlusion and cast the key's shadows like the walkthrough's bars.
import * as THREE from 'three';
import { lin } from '../../kit/region/geo';
import { radialTex } from '../../kit/textures';

const VERT = /* glsl */`
attribute vec3 aColor; attribute float aGlow;
varying vec3 vColor; varying vec3 vN; varying vec2 vUv; varying vec3 vW; varying float vGlow; varying float vFoot; varying float vH;
void main() {
  vColor = aColor; vUv = uv; vGlow = aGlow;
  vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vFoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y;
  vH = length(vec3(instanceMatrix[1]));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */`
uniform vec3 uKey; uniform vec3 uFog; uniform vec2 uFogR; uniform float uFogK; uniform float uEdge;
varying vec3 vColor; varying vec3 vN; varying vec2 vUv; varying vec3 vW; varying float vGlow; varying float vFoot; varying float vH;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float up = max(n.y, 0.0);
  float lam = max(dot(n, normalize(uKey)), 0.0);
  float s = 0.42 + 0.5 * lam + 0.16 * up;
  vec3 c = vColor * s;
  // the foot darkens over its first 0.7 m (the walkthrough's bars stand in their own occlusion)
  c *= mix(0.62, 1.0, smoothstep(0.0, 0.7, vW.y - vFoot));
  // a gentle rise of light up the side, so a tall column reads as lit from its cap
  c *= mix(0.8, 1.04, clamp((vW.y - vFoot) / max(vH, 0.01), 0.0, 1.0) * (1.0 - up));
  vec2 uvc = clamp(vUv, 0.0, 1.0);
  vec2 e = min(uvc, 1.0 - uvc) / max(fwidth(vUv), vec2(1e-5));
  float edge = 1.0 - smoothstep(0.6, 1.4, min(e.x, e.y));
  c = mix(c, c * uEdge, edge);
  c += vColor * vGlow * 0.35 * up;
  float d = distance(cameraPosition, vW);
  c = mix(c, uFog, uFogK * smoothstep(uFogR.x, uFogR.y, d));
  gl_FragColor = vec4(c, 1.0);
}`;

export function columnMaterial({ key = new THREE.Vector3(-0.45, 0.77, 0.45), fog = '#1f2429', fogR = [60, 320] as [number, number], fogK = 0.55, edge = 0.7 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, extensions: { derivatives: true } as never,
    uniforms: { uKey: { value: key.clone() }, uFog: { value: lin(fog).clone() }, uFogR: { value: new THREE.Vector2(...fogR) }, uFogK: { value: fogK }, uEdge: { value: edge } },
  });
}

export interface ColumnSpec { x: number; z: number; y?: number; w: number; d: number; h: number; color: string; glow?: number; yaw?: number }

/** One instanced draw of boxes standing on their feet. */
export function columns(specs: readonly ColumnSpec[], mat: THREE.ShaderMaterial, { shadow = true } = {}) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const N = specs.length;
  const col = new Float32Array(N * 3), glowA = new Float32Array(N);
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  specs.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw ?? 0);
    m4.compose(new THREE.Vector3(s.x, s.y ?? 0, s.z), q, new THREE.Vector3(s.w, Math.max(0.001, s.h), s.d));
    mesh.setMatrixAt(i, m4);
    const c = lin(s.color); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    glowA[i] = s.glow ?? 0;
  });
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
  geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glowA, 1));
  mesh.castShadow = shadow; mesh.receiveShadow = false; mesh.frustumCulled = false;
  return mesh;
}

/** The site's planned-discharge ramp (dark to light teal) at f in [0, 1]. */
// the site's ramp with its top stop held at a luminous teal (#7fe6cf, not #bdf4e6): lit in 3D, the pale stop read as
// white plastic on the tallest columns
const RAMP = ['#1b4a42', '#249c83', '#2ec7a6', '#7fe6cf'];
export function rampHex(f: number) {
  const x = Math.max(0, Math.min(1, f)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(x)), k = x - i;
  const a = parseInt(RAMP[i]!.slice(1), 16), b = parseInt(RAMP[i + 1]!.slice(1), 16);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) + ((((b >> sh) & 255) - ((a >> sh) & 255)) * k));
  return '#' + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('');
}
export const RAMP_CSS = `linear-gradient(90deg, ${RAMP[0]}, ${RAMP[1]} 33%, ${RAMP[2]} 66%, ${RAMP[3]})`;

/** The light each column throws on the deck round its foot: one additive radial wash an instance, in its own color. */
export function pools(specs: readonly { x: number; z: number; y?: number; r: number; color: string }[], opacity = 0.2) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: radialTex(THREE), transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
  const mesh = new THREE.InstancedMesh(geo, mat, specs.length);
  const m4 = new THREE.Matrix4();
  specs.forEach((s, i) => {
    m4.makeScale(s.r * 2, 1, s.r * 2); m4.setPosition(s.x, s.y ?? 0.15, s.z);
    mesh.setMatrixAt(i, m4); mesh.setColorAt(i, lin(s.color));
  });
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.userData.overlay = true; mesh.userData.noAO = true;
  return mesh;
}
