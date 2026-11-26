// @ts-nocheck
// THE HEDGING WALKTHROUGH'S PICTURE, version 2 (three.js; untyped, as the intro's ported files are: three has no types
// here). Built on the landing intro's stage (ui/intro/region/stage.ts: backdrop, Neutral tone mapping, the composer,
// the overlay layer) with ambient occlusion and the shadowing key light on (the stills' fix round, Nov 20). The
// storyboard of Nov 19 (approved by Jo, Nov 20); the prototype's fields.ts (ui/hedging-story, Nov 19 to 20) carried
// whole, which was v1's file plus:
//   - the light over every cell (not the Evening block's alone), so a hedge on any hours lights the gap;
//   - the glass as tiles: one instanced liquid-glass pane a hedged hour cell (4 a day), each on its day's own hours,
//     with a slide between two hour sets (the lid unlocking on Jun 23);
//   - an outline on the floor around the hedged hours (the intro's financial arm: orange, dashed), merged across
//     columns that hedge the same hours; the path in the physical teal;
//   - "meet" (beat 7): the bars under each tile rise toward the glass as the tiles ease down, and the light goes out;
//   - solid pits (a paid hour as a box hanging under a thin floor: the chart wall), a y scale (the strip), the panes
//     rimmed, the bar shader's key light; the column (the battery itself, the intro's) and a y-scale setter for the
//     scene's moves.
// One battery's season is a field of cells, one an hour of a day (or of a week, as the hour's mean over the week):
//   x  days or weeks, the window's first day at one end and its last at the other
//   z  hours, hour ending 1 at the front and 24 at the back
//   y  what it earned in the hour at its node, 1.4 asinh($ / 1,500): bars up for money earned, pits down for money
//      paid to charge; colored by the Terminal's heat ramp (C16: blue earned, red paid, gray near zero, read against
//      zero); an unknown hour is hatched, never zero
// Nothing here is a figure: heights and colors only. Figures come from data.ts through the model.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OVERLAY } from '../stage';
import { lin } from '../region/geo';
// The walkthrough's data.ts constant: the path's hours (hour ending 17 to 24) and its smoothing (columns either side).
const PATH_HE = { fromHe: 17, toHe: 24, smooth: 10 } as const;

export const DX = 0.2;          // a day across
export const WEEK = 7 * DX;     // a week across
export const HZ = 1.2;          // an hour deep (every field keeps all 24 hours up: no sinking, no deeper rows)
const NH = 24;
const K = 1.4, V0 = 1500;
export const hOf = (v) => K * Math.asinh(v / V0);
export const vOf = (h) => V0 * Math.sinh(h / K);
export const xOf = (j, n, dx) => (j - (n - 1) / 2) * dx;
export const zOf = (he, hz) => (12.5 - he) * hz;
const lerp = (a, b, t) => a + (b - a) * t;

// The heat ramp (ui/chart/chart-tokens.css --ch-heat-0..8), light and dark; read against zero here.
export const HEAT = {
  light: ['#931b00', '#b54a35', '#d07865', '#e8a596', '#dfdedb', '#93b8ee', '#6190d5', '#3169ba', '#004395'],
  dark: ['#ffa383', '#e27d59', '#b36549', '#854f3c', '#414344', '#3c618b', '#4c80ba', '#5ea1ea', '#8cc2ff'],
};
const SAT = 12000; // $ an hour at the ramp's ends
const heatCache = new Map();
export function heatAt(theme, v) {
  const stops = HEAT[theme];
  const t = Math.max(-1, Math.min(1, Math.asinh(v / V0) / Math.asinh(SAT / V0)));
  const f = 4 + t * 4, i = Math.max(0, Math.min(7, Math.floor(f))), k = f - i;
  const key = `${theme}:${i}:${Math.round(k * 64)}`;
  let c = heatCache.get(key);
  if (!c) { c = lin(stops[i]).clone().lerp(lin(stops[i + 1]), Math.round(k * 64) / 64); heatCache.set(key, c); }
  return c;
}

/** Per theme: the floor, the block's sides, the glass (glass.css's values), the light, the two arms' colors, the
 *  column. The light's values were fitted in the stills' fix round (Nov 20): the light at 0.45 (light) and, in dark,
 *  a glow with a body (lightA 0.24, lightFall, lightFar: the light pass, Nov 21), the sheet's tint 0.14, so the pane's
 *  rim and specular read before the light; walkthrough.css carries the same light and arm colors for the key's
 *  swatches (walkthrough.check.ts holds the two together). */
export const THEMES = {
  light: {
    floor: '#dfdedb', floorLine: 0.9, skirt: '#cfd2d6', skirtDark: '#b9bdc3', hatch: '#b4b9c0', dimTo: '#e7e8e9',
    glassTint: '#ffffff', glassTintA: 0.14, hair: '#7f8a96', hairA: 0.95, frost: 0.1, envSky: '#ffffff', envHor: '#d5e0ee', envA: 0.45, spec: 1.0,
    light: '#ffcf5c', lightA: 0.45, lightBlend: 'normal', lightFall: 0, lightFar: 1, ink: '#1a1a1a', teal: '#1fae8f', orange: '#e35f2a', gray: '#dfdedb', halo: '#ffffff', stage: '#f3f4f6',
    column: '#93a1b1', bandFill: 1,
  },
  dark: {
    // the dark light a paler, cooler gold at a lower alpha (it read as an alarm glow over the black field), the hatch
    // nearer the floor so missing hours recede; the outline's halo the floor's own dark; the band's fill a fifth of
    // the field's alpha (bandFill scales makeField's: the orange blended in linear space over the dark floor at the
    // light theme's alpha came out brighter than the trench's deepest paid cells, so the contract's hours read as
    // where the battery paid most, against the ramp's one rule; beat 4's look review, Nov 20). The dark light is a
    // glow from the lit cell's foot (the floor over a pit, the bar's top where it stands) that fades up to lightFar
    // of itself over lightFall world units, in every field alike: under the strip's chart wall (three times the
    // height) the additive gold over the dark stage had made each lit pane an opaque tan column, the brightest mass
    // in the frame (beat 5's look review, Nov 20); the light theme keeps its wash (lightFall 0: GAP_FRAG's first rule).
    // The light pass (Nov 21) gave the glow a body: it keeps lightFar 0.22 of itself past lightFall 1.1 units from the
    // foot (was 0.05 past 0.8), so a lit column reads as light under its pane along its height, the sky still through
    // its top and the rim over it; at the plan's view a column still lit tells from one the meet has put out, and the
    // follow's tiles sit nearer the approved dark still (06-follow-dark), the strip's tall columns still translucent
    floor: '#414344', floorLine: 0.82, skirt: '#262d35', skirtDark: '#1b2128', hatch: '#2a3038', dimTo: '#22272c',
    glassTint: '#1f2429', glassTintA: 0.12, hair: '#a9b3bd', hairA: 0.85, frost: 0.12, envSky: '#9db9de', envHor: '#243650', envA: 0.45, spec: 0.9,
    light: '#ffe3ad', lightA: 0.24, lightBlend: 'additive', lightFall: 1.1, lightFar: 0.22, ink: '#d7d9d4', teal: '#2ec7a6', orange: '#eb6834', gray: '#414344', halo: '#414344', stage: '#101315',
    column: '#8a98a8', bandFill: 0.2,
  },
};
/** The 'pale' state (beat 2's other days): each bar's own ramp color eased this far toward the stage, so hue survives
 *  and gray keeps its one meaning (zero). */
export const PALE = 0.6;

// ── materials (v1's, with the key light on the bars) ─────────────────────────────────────────────────────────────

const BAR_VERT = /* glsl */`
attribute vec3 aColor; attribute float aHe; attribute float aCap;
uniform float uSink; uniform vec2 uFocus;
varying vec3 vColor; varying vec3 vN; varying vec2 vUv; varying float vIn; varying float vY; varying float vCap; varying float vLocalY;
void main() {
  float inF = step(uFocus.x - 0.5, aHe) * step(aHe, uFocus.y + 0.5);
  vColor = aColor; vIn = inF; vUv = uv; vCap = aCap; vLocalY = position.y;
  vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  vec3 p = position;
  p.y *= mix(1.0, 0.02, uSink * (1.0 - inF));
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vY = w.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const BAR_FRAG = /* glsl */`
uniform float uDimOut; uniform vec3 uDimTo; uniform float uPit; uniform float uDeep; uniform float uSink; uniform vec3 uKey;
varying vec3 vColor; varying vec3 vN; varying vec2 vUv; varying float vIn; varying float vY; varying float vCap; varying float vLocalY;
void main() {
  if (uSink > 0.99 && vIn < 0.5) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float up = max(n.y, 0.0);
  // per-face shade from the stage's key light (warm key from the south-west, high): a lit top, a mid face toward the
  // key, the faces away from it shaded, so a box reads as a box (the stills' fix round, Nov 20)
  float lam = max(dot(n, normalize(uKey)), 0.0);
  float s = 0.56 + 0.44 * lam + 0.06 * up;
  s = mix(s, 0.5, step(n.y, -0.5));
  s *= mix(1.0, 1.0 - 0.32 * smoothstep(0.0, uDeep, -vY), uPit);
  vec3 c = vColor * s;
  vec2 e = min(vUv, 1.0 - vUv) / max(fwidth(vUv), vec2(1e-5));
  float edge = 1.0 - smoothstep(0.6, 1.4, min(e.x, e.y));
  c = mix(c, c * 0.72, edge);
  float notch = vCap * (1.0 - step(0.5, abs(n.y))) * step(-0.97, vLocalY) * step(vLocalY, -0.91);
  c = mix(c, uDimTo, notch * 0.85);
  vec3 dimmed = mix(c, uDimTo * (0.55 + 0.45 * s), 0.985);
  c = mix(c, dimmed, uDimOut * (1.0 - vIn));
  gl_FragColor = vec4(c, 1.0);
}`;
function barMaterial(side, T) {
  return new THREE.ShaderMaterial({
    vertexShader: BAR_VERT, fragmentShader: BAR_FRAG, side, extensions: { derivatives: true },
    uniforms: { uDimOut: { value: 0 }, uDimTo: { value: lin(T.dimTo).clone() }, uPit: { value: side === THREE.BackSide ? 1 : 0 },
      uDeep: { value: 3 }, uSink: { value: 0 }, uFocus: { value: new THREE.Vector2(0, 99) }, uKey: { value: new THREE.Vector3(-0.45, 0.77, 0.45) } },
  });
}

const FLOOR_VERT = /* glsl */`
varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */`
uniform sampler2D tMask; uniform sampler2D tMonth; uniform sampler2D tColor; uniform vec2 uCells; uniform vec2 uSize; uniform vec2 uStep;
uniform vec2 uOrigin; uniform float uLine; uniform float uDimOut; uniform vec3 uDimTo; uniform vec2 uBand; uniform vec3 uHatch; uniform vec3 uFloor; uniform float uPlain; uniform float uAlpha; uniform float uHole; uniform float uHatchA;
varying vec3 vW;
void main() {
  vec2 cell = vec2((vW.x - uOrigin.x + uSize.x * 0.5) / uStep.x, (vW.z - uOrigin.y + uSize.y * 0.5) / uStep.y);
  vec2 ci = floor(cell);
  ci.y = uCells.y - 1.0 - ci.y;
  float m = texture2D(tMask, (ci + 0.5) / uCells).r;
  float inBand = step(uBand.x, ci.y) * step(ci.y, uBand.y);
  bool calm = (uDimOut > 0.99 && inBand < 0.5) || uPlain > 0.5;
  // a pit's hole in the floor: open at uHole 1 (the cell discarded, the rests' picture); a move keeps it covered with
  // the cell's own color at 0 and fades it open between (beat 2's fan-out: the boxes drawn up into the pad become its holes)
  float hole = (m < 0.25 && !calm) ? 1.0 : 0.0;
  if (hole > 0.5 && uHole > 0.999) discard;
  vec3 cellC = texture2D(tColor, (ci + 0.5) / uCells).rgb;
  vec2 f = fract(cell), w = fwidth(cell);
  f.y = 1.0 - f.y;
  float dz = min(f.y, 1.0 - f.y) / max(w.y, 1e-5);
  float line = 1.0 - smoothstep(0.4, 1.2, dz);
  float six = step(abs(mod(ci.y, 6.0)), 0.5) * (1.0 - smoothstep(0.4, 1.4, f.y / max(w.y, 1e-5)));
  float mon = texture2D(tMonth, vec2((ci.x + 0.5) / uCells.x, 0.5)).r;
  float atMon = mon * (1.0 - smoothstep(0.5, 1.6, f.x / max(w.x, 1e-5)));
  vec3 c = cellC;
  // an unknown hour's hatch: its stripes fade into plain floor at uHatchA 0 (a move that draws the unknown cells as
  // something else first dissolves the hatch: beat 3's merge)
  if (m < 0.75 && hole < 0.5) { float hz = fract((vW.x + vW.z) * 2.2); c = calm ? uFloor : mix(uFloor, mix(uHatch, uFloor, step(0.5, hz)), uHatchA); }
  c *= mix(1.0, uLine, line * 0.5);
  c *= mix(1.0, uLine * 0.9, max(six, atMon));
  float plainK = max(uDimOut * (1.0 - inBand), clamp(uPlain, 0.0, 1.0)) * (1.0 - hole);
  c = mix(c, mix(c, uDimTo * mix(1.0, uLine, line * 0.5), 0.985), plainK);
  gl_FragColor = vec4(c, uAlpha * (1.0 - hole * uHole));
}`;

// The light under the glass, one box a lit cell. vY: the fragment's world height, the box's foot and its top (world:
// the field's y scale is in the model matrix, so the dark theme's falloff runs in world units under any scale).
const GAP_VERT = /* glsl */`
attribute float aAlpha;
varying float vA; varying vec2 vUv; varying vec3 vN; varying vec3 vY;
void main() { vA = aAlpha; vUv = uv; vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  mat4 M = modelMatrix * instanceMatrix;
  vec4 w = M * vec4(position, 1.0);
  vY = vec3(w.y, (M * vec4(0.0, 0.0, 0.0, 1.0)).y, (M * vec4(0.0, 1.0, 0.0, 1.0)).y);
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const GAP_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uOn; uniform float uA; uniform float uFall; uniform float uFar;
varying float vA; varying vec2 vUv; varying vec3 vN; varying vec3 vY;
void main() {
  // clamped: MSAA shades an edge pixel's center outside its triangle, and a negative uv there made pow() a NaN that the
  // glass's blur spread into black patches (found in the prototype, Nov 13)
  float top = abs(vN.y) > 0.5 ? 1.0 : clamp(vUv.y, 0.0, 1.0);
  float k, c;
  if (uFall > 0.0) {
    // the dark theme: a glow from the lit cell's foot (the floor over a pit, the bar's top where it stands), fading to
    // uFar of itself over uFall world units going up, twice as far going down into a pit, so a tall lit column reads
    // as light in the pane and the pit keeps its ramp color at depth
    float foot = max(vY.y, 0.0);
    float d = vY.x >= foot ? (vY.x - foot) / uFall : (foot - vY.x) / (2.0 * uFall);
    k = uFar + (1.0 - uFar) * exp(-d); c = 1.0;
  } else {
    k = 0.12 + 0.88 * pow(top, 2.2); c = 0.9 + 0.25 * top;
  }
  float a = vA * uOn * uA * k;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * c, a);
}`;

// Beat 7's hairline trails (the storyboard: "a teal hairline trails each moving bar", "an orange dashed hairline on the
// moving glass"): one thin box an instance, the teal one standing on the bar's own top up to where the bar has risen
// (the physical arm's mark: what dispatch has answered), the orange one hanging from the moving pane down to the bar's
// top (the financial arm's: what the two have still to close, dashed in world units as the floor's band is), both on
// the cell's near face; the orange shortens as they meet and the light goes out between them. vY is the fragment's
// world height (the field's y scale is in the model matrix), so the dashes keep their length under any scale: TRAIL_DASH
// on, half of it off (beat 7's reviews, Nov 21: 0.2 on and 0.1 off at two pixels wide were specks at 1,920 x 1,080).
const TRAIL_DASH = 0.3;
const TRAIL_VERT = /* glsl */`
attribute float aKind; attribute float aA;
varying float vKind; varying float vA; varying float vY;
void main() { vKind = aKind; vA = aA; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`;
const TRAIL_FRAG = /* glsl */`
uniform vec3 uTeal; uniform vec3 uOrange; uniform float uOp; uniform float uDash;
varying float vKind; varying float vA; varying float vY;
void main() {
  if (vKind > 0.5 && fract(vY / (1.5 * uDash)) > 0.667) discard;
  float a = vA * uOp;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uTeal, uOrange, vKind), a);
}`;

// Liquid glass: glass.css made a surface. The scene behind is sampled through the surface's normal (gently in the
// body, strongly at the rim: the lensing of liquid glass), lightly frosted, tinted with the raised color, with a Fresnel
// reflection of the stage's sky, two sharp highlights and glass.css's rim (a bright inner line on the far side, a darker
// one on the near side, the hairline). uScaleY flattens it as its field sinks; normals follow.
const GLASS_VERT = /* glsl */`
attribute float aKnown; attribute float aPour; uniform float uScaleY;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying float vKnown; varying float vPour;
void main() {
  vUv = uv; vKnown = aKnown; vPour = aPour;
  vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normalize(vec3(normal.x, normal.y / max(uScaleY, 0.02), normal.z)));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
// a tile: the same glass, instanced, with a gentle dome in its normal so each pane reads as liquid
const TILE_VERT = /* glsl */`
uniform float uDome;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying float vKnown; varying float vPour;
void main() {
  vUv = uv; vKnown = 1.0; vPour = 0.0;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vWorld = w.xyz;
  vec3 n = normalize(vec3(-uDome * (uv.x - 0.5), 1.0, uDome * (uv.y - 0.5)));
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const GLASS_FRAG = /* glsl */`
uniform sampler2D tSharp; uniform sampler2D tBlur; uniform vec2 uRes; uniform float uOpacity;
uniform vec3 uTint; uniform float uTintA; uniform float uRefract; uniform float uFrost;
uniform vec3 uKeyDir; uniform vec3 uRimDir; uniform float uSpec; uniform vec3 uHair; uniform float uHairA;
uniform vec3 uEnvSky; uniform vec3 uEnvHor; uniform float uEnvA; uniform vec2 uSize; uniform float uRadius; uniform float uRimW; uniform float uUvRim;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying float vKnown; varying float vPour;
float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  if (vKnown < 0.5 || uOpacity < 0.002) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec2 p = (vUv - 0.5) * uSize;
  float d = uUvRim > 0.5 ? -min(min(vUv.x, 1.0 - vUv.x) * uSize.x, min(vUv.y, 1.0 - vUv.y) * uSize.y) : sdRound(p, uSize * 0.5, uRadius);
  float px = max(fwidth(d), 1e-4);
  if (d > px) discard;
  float rim = 1.0 - smoothstep(0.0, uRimW, -d);
  vec3 nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  vec2 suv = gl_FragCoord.xy / uRes;
  vec2 off = nv.xy * uRefract * (0.25 + 2.4 * rim * rim) * (1.0 - 0.4 * ndv);
  vec3 sharp = texture2D(tSharp, clamp(suv - off, 0.001, 0.999)).rgb;
  vec3 soft = texture2D(tBlur, clamp(suv - off * 1.4, 0.001, 0.999)).rgb;
  vec3 bg = mix(sharp, soft, clamp(uFrost + rim * 0.35, 0.0, 1.0));
  float l = dot(bg, vec3(0.2126, 0.7152, 0.0722));
  bg = max(mix(vec3(l), bg, 1.22), 0.0);
  vec3 c = mix(bg, uTint, uTintA + rim * 0.22);
  vec3 R = reflect(-V, N);
  vec3 env = mix(uEnvHor, uEnvSky, smoothstep(-0.05, 0.55, R.y));
  float F = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  c = mix(c, env, clamp(F * uEnvA + rim * 0.10, 0.0, 1.0));
  vec3 H1 = normalize(normalize(uKeyDir) + V), H2 = normalize(normalize(uRimDir) + V);
  float s1 = pow(max(dot(N, H1), 0.0), 220.0) * 1.4 + pow(max(dot(N, H1), 0.0), 30.0) * 0.07;
  float s2 = pow(max(dot(N, H2), 0.0), 140.0) * 0.7;
  // vPour is the pour's own term (fields.ts POUR.damp on the swell and the lip while the sheet pours in; 0 at every rest and on every tile, where the specular is uSpec's as before)
  c += vec3(s1 + s2) * uSpec * (1.0 - vPour);
  float far = smoothstep(-0.2, 0.6, -(nv.y));
  float inner = 1.0 - smoothstep(0.0, px * 3.0, -d);
  c = mix(c, c * 0.6, inner * 0.5 * (1.0 - far));
  c += vec3(0.85) * inner * 0.18;
  float hair = 1.0 - smoothstep(px * 0.6, px * 1.6, -d);
  c = mix(c, uHair, hair * uHairA);
  // vKnown is under 1 only along a pour's leading edge (fields.ts POUR.fade); 1 at every rest and on every tile, where this is the alpha as before
  float a = (1.0 - smoothstep(-px, px * 0.5, d)) * uOpacity * smoothstep(0.5, 1.0, vKnown);
  gl_FragColor = vec4(c, a);
}`;

/** The scene behind the glass: a half-resolution sharp copy and a quarter-resolution blur of the opaque pass. `quarter`
 *  drops the sharp copy to quarter resolution (the budget's guard). */
export class GrabPass extends Pass {
  constructor(w, h) {
    super();
    this.needsSwap = false;
    this.div = 2;
    this.w = w; this.h = h;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.sharp = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), opt);
    this.a = new THREE.WebGLRenderTarget(Math.max(1, w >> 2), Math.max(1, h >> 2), opt);
    this.b = this.a.clone();
    const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.copy = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }', uniforms: { tDiffuse: { value: null } }, depthTest: false, depthWrite: false });
    this.blur = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
        c += texture2D(tDiffuse, vUv + uDir * 1.3846153846) * 0.3162162162;
        c += texture2D(tDiffuse, vUv - uDir * 1.3846153846) * 0.3162162162;
        c += texture2D(tDiffuse, vUv + uDir * 3.2307692308) * 0.0702702703;
        c += texture2D(tDiffuse, vUv - uDir * 3.2307692308) * 0.0702702703;
        gl_FragColor = c;
      }`, uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.copy);
  }
  setQuarter(on) { this.div = on ? 4 : 2; this.setSize(this.w, this.h); }
  setSize(w, h) {
    this.w = w; this.h = h;
    this.sharp.setSize(Math.max(1, Math.floor(w / this.div)), Math.max(1, Math.floor(h / this.div)));
    this.a.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); this.b.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  }
  render(renderer, writeBuffer, readBuffer) {
    const rt0 = renderer.getRenderTarget();
    this.copy.uniforms.tDiffuse.value = readBuffer.texture; this.quad.material = this.copy;
    renderer.setRenderTarget(this.sharp); this.quad.render(renderer);
    this.copy.uniforms.tDiffuse.value = this.sharp.texture;
    renderer.setRenderTarget(this.a); this.quad.render(renderer);
    this.quad.material = this.blur;
    const w = this.a.width, h = this.a.height;
    for (let i = 0; i < 2; i++) {
      const r = 1.2 * (1 + i * 0.6);
      this.blur.uniforms.tDiffuse.value = this.a.texture; this.blur.uniforms.uDir.value.set(r / w, 0);
      renderer.setRenderTarget(this.b); this.quad.render(renderer);
      this.blur.uniforms.tDiffuse.value = this.b.texture; this.blur.uniforms.uDir.value.set(0, r / h);
      renderer.setRenderTarget(this.a); this.quad.render(renderer);
    }
    renderer.setRenderTarget(rt0);
  }
  dispose() { this.sharp.dispose(); this.a.dispose(); this.b.dispose(); this.copy.dispose(); this.blur.dispose(); this.quad.dispose(); }
}

function glassUniforms(T, grab, res, { size, radius, rimW, uvRim }) {
  return {
    tSharp: { value: grab.sharp.texture }, tBlur: { value: grab.a.texture }, uRes: { value: res },
    uOpacity: { value: 1 }, uTint: { value: lin(T.glassTint).clone() }, uTintA: { value: T.glassTintA },
    uRefract: { value: 0.035 }, uFrost: { value: T.frost }, uScaleY: { value: 1 }, uDome: { value: 0.22 },
    uKeyDir: { value: new THREE.Vector3(-0.45, 0.8, 0.55) }, uRimDir: { value: new THREE.Vector3(0.6, 0.45, -0.6) },
    uSpec: { value: T.spec }, uHair: { value: lin(T.hair).clone() }, uHairA: { value: T.hairA },
    uEnvSky: { value: lin(T.envSky).clone() }, uEnvHor: { value: lin(T.envHor).clone() }, uEnvA: { value: T.envA },
    uSize: { value: new THREE.Vector2(...size) }, uRadius: { value: radius }, uRimW: { value: rimW }, uUvRim: { value: uvRim },
  };
}
export function glassMaterial(theme, grab, res, { size = [1, 1], radius = 0.4, rimW = 0.35, uvRim = 0, tiles = false } = {}) {
  const T = THEMES[theme];
  return new THREE.ShaderMaterial({
    vertexShader: tiles ? TILE_VERT : GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, extensions: { derivatives: true },
    uniforms: glassUniforms(T, grab, res, { size, radius, rimW, uvRim }),
  });
}

/** Catmull-Rom through values at 0, 1, 2, ... (clamped ends). */
function cr(ys, t) {
  const n = ys.length, tc = Math.max(0, Math.min(n - 1, t));
  const i = Math.min(n - 2, Math.floor(tc)), u = tc - i;
  const p0 = ys[Math.max(0, i - 1)], p1 = ys[i], p2 = ys[i + 1], p3 = ys[Math.min(n - 1, i + 2)];
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}
/** Normals of a grid sheet from its heights box-blurred: the heights stay exact, the shading is a calm liquid. */
function smoothNormals(geo, SX, SZ, sx, sz, rx, rz) {
  const P = geo.attributes.position, nx = SX + 1, nz = SZ + 1;
  let a = new Float32Array(nx * nz), b = new Float32Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) a[i] = P.getY(i);
  const blurX = (src, dst) => { for (let z = 0; z < nz; z++) { const o = z * nx; let acc = 0; for (let d = -rx; d <= rx; d++) acc += src[o + Math.max(0, Math.min(nx - 1, d))];
    for (let x = 0; x < nx; x++) { dst[o + x] = acc / (2 * rx + 1); acc += src[o + Math.min(nx - 1, x + rx + 1)] - src[o + Math.max(0, x - rx)]; } } };
  const blurZ = (src, dst) => { for (let x = 0; x < nx; x++) { let acc = 0; for (let d = -rz; d <= rz; d++) acc += src[Math.max(0, Math.min(nz - 1, d)) * nx + x];
    for (let z = 0; z < nz; z++) { dst[z * nx + x] = acc / (2 * rz + 1); acc += src[Math.min(nz - 1, z + rz + 1) * nx + x] - src[Math.max(0, z - rz) * nx + x]; } } };
  for (let r = 0; r < 2; r++) { blurX(a, b); blurZ(b, a); }
  let N = geo.attributes.normal;
  if (!N) { N = new THREE.BufferAttribute(new Float32Array(nx * nz * 3), 3); geo.setAttribute('normal', N); }
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const x0 = Math.max(0, x - 1), x1 = Math.min(nx - 1, x + 1), z0 = Math.max(0, z - 1), z1 = Math.min(nz - 1, z + 1);
    const dx = (a[x1 + z * nx] - a[x0 + z * nx]) / ((x1 - x0) * sx), dz = (a[x + z1 * nx] - a[x + z0 * nx]) / ((z1 - z0) * sz);
    const l = Math.hypot(dx, 1, dz); N.setXYZ(x + z * nx, -dx / l, 1 / l, -dz / l);
  }
  N.needsUpdate = true;
}

/** The pour (beat 3's move, the storyboard's draft 4: Jo's answer 2 of Nov 20, built after the seven beats passed): the
 *  sheet enters from the December end along the evening band behind a front that layout's pour.front moves along the
 *  field (in columns), a swell at its front, leaving the settled sheet behind it, the settle and the light following
 *  the front. In columns of the field: swell, how far behind the nose the swell reaches (two to three columns, the
 *  storyboard); amp, the crest's height over the sheet's level (world units; 0.35 after the look review of Nov 21: at
 *  0.5 the crest's face caught the key light as a white oval in dark); nose, over how much of a column the surface
 *  rises from the floor to its level, as a rounded lip (a quarter ellipse: steep at the floor, level a column behind,
 *  so the leading edge reads as a meniscus; the first build's smoothstep met the floor tangentially and its last tenth
 *  read as a white sliver hanging below the sheet's near rim); cut, how close to the nose the sheet is drawn at all;
 *  fade, over how much of a column behind the cut the sheet comes in from clear to whole (aKnown carries it, 0.5 at
 *  the cut to 1 fade columns behind it: the glass shader discards under 0.5 and scales its alpha by the rest, so the
 *  lip's steep face, edge-on to the across camera and white with fresnel, is seen through; at every rest aKnown is 0
 *  or 1 and the shader draws exactly as it did); damp, a theme's share of the glass's specular the pour takes off
 *  along the swell and the lip and, fading over dampTail columns, behind the swell (the vertex attribute aPour; 0 at
 *  every rest and on every tile, so the material's uSpec, which the rest shares, stays). The tail is the normals'
 *  box blur (smoothNormals, two passes of seven vertices, about two columns), which carries the crest's slope into the
 *  settled sheet behind it: there, at the material's own specular, the key light's highlight (pow 220) blew to a
 *  white oval in dark as the crest passed April's bars (the look review of Nov 21: about 800 near-white pixels in a
 *  200 px window at 1920 x 1080, 0 with the specular off, unchanged with the crest lower, the refraction off, the
 *  environment off or the specular damped on the swell alone); in light the crest's glint reads as the liquid's and
 *  keeps most of itself; settleFrom and settleSpan, where behind the nose a column's settle starts and over how many
 *  columns it completes (so the ground settles and the light fills under the sheet the swell has just left). */
export const POUR = { swell: 2.6, amp: 0.35, nose: 1.0, cut: 0.05, fade: 0.4, damp: { light: 0.3, dark: 0.75 } as Record<string, number>, dampTail: 2.2, settleFrom: 1.0, settleSpan: 2.0 };
const sm = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

// ── the column: the battery itself ──────────────────────────────────────────────────────────────────────────────

export const COL_R = 1.15;
/** The intro's column (chapter 6's one column on each battery) standing on its pad at a strip's start, as tall as the
 *  day's tallest bar, lit by the stage's key. No ramp color (the storyboard's note): a neutral blue-gray, so the chart
 *  beside it keeps the only ramp in the frame. place(field, grow) stands it past the field's midnight end on the same
 *  floor line; grow scales its height (0 flat, 1 the tallest bar) and, under 1, its footprint and its opacity with it,
 *  so a move folds it away whole and dissolving, the pad with the body (beat 2's fan-out, beat 6's pull-back; the look
 *  review of Nov 20: a value-bearing column that only shrank read as a value going away). */
export function makeColumn(theme) {
  const T = THEMES[theme];
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(COL_R, COL_R, 1, 56, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: lin(T.column), roughness: 0.58, metalness: 0.05 }));
  body.castShadow = true; body.receiveShadow = true;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(COL_R + 0.55, COL_R + 0.55, 0.15, 56, 1).translate(0, -0.075, 0), new THREE.MeshBasicMaterial({ color: lin(T.skirt) }));
  pad.castShadow = true;
  group.add(body, pad); group.visible = false;
  const col = {
    group, body, pad, x: 0, z: 0, h: 1,
    place(f, grow = 1, j = null) {
      const h = Math.max(0.02, Math.max(...f.cells.map((c) => (c.rev != null && (j == null || c.j === j) ? hOf(c.rev) : 0))) * f.yScale * grow);
      col.x = f.x0; col.z = zOf(0.5, f.hz) + 0.7 + COL_R; col.h = h;
      const r = Math.max(0.001, Math.min(1, grow));
      body.scale.y = h; group.scale.set(r, 1, r); group.position.set(col.x, 0, col.z); group.visible = true;
      // dissolving as it folds; opaque at every rest (grow 1), so nothing changes there. The flip to transparent needs
      // the program made again (three.js defines OPAQUE into a material compiled opaque, which pins its alpha to 1:
      // until Nov 21 the column folded at full darkness and ended as a dark stub, the craft review's speck); the
      // scene compiles both programs at mount. Its shadow (depth only, no alpha) goes once the column is under a
      // tenth, where the body is all but gone, rather than linger as a dark fleck on the floor
      const t = r < 0.999;
      for (const m of [body.material, pad.material]) { if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; } m.opacity = r; }
      body.castShadow = pad.castShadow = r >= 0.1;
    },
    show(on) { group.visible = on; },
    /** The column's top (world), for its plate. */
    top() { return [col.x, col.h, col.z - COL_R * 0.3]; },
    dispose() { body.geometry.dispose(); body.material.dispose(); pad.geometry.dispose(); pad.material.dispose(); },
  };
  return col;
}

// ── a field ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One battery's cells as a field: bars and pits (two instanced draws), the floor, the block's sides, the glass (a sheet
 * over the Evening block's rows, and tiles on each column's own hedged hours), the light over every cell, the outline
 * on the floor, the path. layout() places every cell; a placer can move, widen, lift and recolor them.
 *
 * Options (the stills' fix round, Nov 20): solidPits draws a paid hour as a solid box hanging below a thin floor (front
 * faces, the bar's footprint, no cap: the intro's chart wall, out above zero and in below) instead of a pit seen through
 * a hole; yScale stretches the field's heights (the strip's chart wall; setYScale lerps it in a move); pathY and
 * pathDrops place the path (on the floor for the drift); tileRim sizes a pane's rim; bandFill fills the outline's
 * rectangles (its alpha, scaled by the theme's bandFill: a fifth in dark); outlineW the dashes' width; pathR the path's
 * radius.
 */
export function makeField(series, theme, grab, res, { dx, hz, x0 = 0, block = 3.0, sheet = true, pathColor = 'ink', pathY = 4.6, solidPits = false, yScale = 1,
  pathDrops = true, tileRim = { radius: 0.3, rimW: 0.45 }, bandFill = 0.15, outlineW = 0.16, pathR = 0.06 } = {}) {
  const T = THEMES[theme];
  const fillA = bandFill * (T.bandFill ?? 1); // the band's fill as this theme draws it
  const n = series.days.length;
  const W = n * dx, D = NH * hz;
  const group = new THREE.Group();
  group.scale.y = yScale;
  const cells = series.cells, N = cells.length;
  const ev = series.evening.slice().sort((a, b) => a - b);

  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const pitGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
  if (!solidPits) { const idx = pitGeo.index.array, groups = pitGeo.groups, keep = [];
    for (let g = 0; g < groups.length; g++) { if (g === 2) continue; for (let i = groups[g].start; i < groups[g].start + groups[g].count; i++) keep.push(idx[i]); }
    pitGeo.setIndex(keep); pitGeo.clearGroups(); }
  const bars = new THREE.InstancedMesh(box, barMaterial(THREE.FrontSide, T), N);
  const pits = new THREE.InstancedMesh(pitGeo, barMaterial(solidPits ? THREE.FrontSide : THREE.BackSide, T), N);
  if (solidPits) pits.material.uniforms.uPit.value = 0;
  // a field drawn with holes keeps a second pits mesh of solid boxes (the chart wall's look, the strip's): a move that
  // carries the strip's boxes into the pad draws the pits on it until they are inside the pad, then on the holes
  // (layout's solid; beat 2's fan-out), so the paid hours never swap look under a still camera
  const pitsSolid = solidPits ? null : new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), barMaterial(THREE.FrontSide, T), N);
  if (pitsSolid) { pitsSolid.material.uniforms.uPit.value = 0; pitsSolid.visible = false; }
  let solidNow = false;
  const colA = new Float32Array(N * 3), heA = new Float32Array(N), capA = new Float32Array(N);
  const colAttr = new THREE.InstancedBufferAttribute(colA, 3), heAttr = new THREE.InstancedBufferAttribute(heA, 1), capAttr = new THREE.InstancedBufferAttribute(capA, 1);
  for (const m of [bars, pits, ...(pitsSolid ? [pitsSolid] : [])]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false;
    m.geometry.setAttribute('aColor', colAttr); m.geometry.setAttribute('aHe', heAttr); m.geometry.setAttribute('aCap', capAttr);
    m.material.uniforms.uDeep.value = block;
  }
  cells.forEach((c, i) => { heA[i] = c.he; });
  bars.castShadow = true; // the standing bars onto the stage's shadow catcher (the pits hang under the floor: none)
  group.add(bars, pits);
  if (pitsSolid) group.add(pitsSolid);

  // the floor's cell colors as floats: every color here is fed pre-tone-mapped (geo.ts lin, kit/tone.ts exactColor:
  // the linear input Neutral maps back to the exact hex), and the dark ramp's two ends need components over 1 (#8cc2ff
  // asks (0.06, 1.35, 3.49), #ffa383 (3.49, 0.5, 0)); in a byte texture they clamped at 1, so the floor cell under the
  // brightest blue bars drew cyan (#33f0f0) and under the brightest red an orange, while the bars (a float attribute)
  // drew their colors: the neon strips at the lit bars' feet in dark (the craft review of Nov 21, which read them as
  // the additive light; the light theme's ramp stays under 1 everywhere and never showed it)
  const mask = new Uint8Array(n * NH * 4), cellCol = new Float32Array(n * NH * 4), month = new Uint8Array(n * 4);
  const tex = (data, w, h, type = THREE.UnsignedByteType) => { const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, type); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
  const maskTex = tex(mask, n, NH), colorTex = tex(cellCol, n, NH, THREE.FloatType);
  const floorLin = lin(T.floor), floorRGB = [floorLin.r, floorLin.g, floorLin.b];
  // a slot with no cell (an hour that never existed: the clock change's hour ending 3 on Mar 8) is plain floor, never
  // a hole or hatched (the mask's zero would read as a pit's hole); layout() writes every slot that has a cell
  mask.fill(255);
  for (let i = 0; i < n * NH; i++) { cellCol[i * 4] = floorRGB[0]; cellCol[i * 4 + 1] = floorRGB[1]; cellCol[i * 4 + 2] = floorRGB[2]; cellCol[i * 4 + 3] = 1; }
  series.days.forEach((d, j) => {
    // a month's first day falls in this column (a week holds it when any of its seven days is a first)
    const span = series.span?.[j];
    const firsts = span ? Array.from({ length: span[1] - span[0] + 1 }, (_, k) => series.parent?.[span[0] + k]).some((x) => x?.endsWith('-01')) : d.endsWith('-01');
    month[j * 4] = firsts ? 255 : 0;
  });
  const monthTex = tex(month, n, 1);
  const floorMat = new THREE.ShaderMaterial({
    vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, extensions: { derivatives: true },
    uniforms: { tMask: { value: maskTex }, tMonth: { value: monthTex }, tColor: { value: colorTex }, uHatch: { value: lin(T.hatch).clone() }, uFloor: { value: floorLin.clone() },
      uCells: { value: new THREE.Vector2(n, NH) }, uSize: { value: new THREE.Vector2(W, D) }, uStep: { value: new THREE.Vector2(dx, hz) },
      uOrigin: { value: new THREE.Vector2(x0, 0) }, uLine: { value: T.floorLine }, uDimOut: { value: 0 }, uDimTo: { value: lin(T.dimTo).clone() },
      uBand: { value: new THREE.Vector2(-1, 99) }, uPlain: { value: 0 }, uAlpha: { value: 1 }, uHole: { value: 1 }, uHatchA: { value: 1 } },
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floorMat);
  floor.position.x = x0;
  floor.castShadow = true; // the pad's own shadow on the catcher under it: the intro's soft contact shadow
  // while the floor fades (its holes, its alpha) it is drawn after the stage's shadow catcher, never under it
  floor.renderOrder = 1;
  group.add(floor);
  /** The floor blends only while it fades (setFade) or its holes are covered (layout's hole): otherwise opaque. */
  let fadeA = 1, holeA = 1;
  const floorBlend = () => { const t = fadeA < 0.999 || holeA < 0.999; floorMat.transparent = t; floorMat.depthWrite = !t; };

  const skirtMat = new THREE.MeshBasicMaterial({ color: lin(T.skirt) }), skirtDark = new THREE.MeshBasicMaterial({ color: lin(T.skirtDark) });
  const sides = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, block), skirtMat); front.position.set(x0, -block / 2, D / 2);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(D, block), skirtDark); left.rotation.y = -Math.PI / 2; left.position.set(x0 - W / 2, -block / 2, 0);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(D, block), skirtDark); right.rotation.y = Math.PI / 2; right.position.set(x0 + W / 2, -block / 2, 0);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, block), skirtDark); back.rotation.y = Math.PI; back.position.set(x0, -block / 2, -D / 2);
  sides.add(front, left, right, back);
  for (const m of [front, left, right, back]) m.castShadow = true; // onto the stage's shadow catcher: the intro's soft contact shadow round the pad
  group.add(sides);

  // the sheet over the Evening block's rows, across every column (a column without the hedge is a hole)
  const z0 = Math.min(zOf(ev[0], hz), zOf(ev[ev.length - 1], hz)) - hz / 2, z1 = Math.max(zOf(ev[0], hz), zOf(ev[ev.length - 1], hz)) + hz / 2, Dz = z1 - z0;
  const SX = Math.max(n * 2, 240), SZ = 40;
  const glassGeo = new THREE.PlaneGeometry(W, Dz, SX, SZ).rotateX(-Math.PI / 2);
  glassGeo.translate(x0, 0, (z0 + z1) / 2);
  glassGeo.setAttribute('aKnown', new THREE.BufferAttribute(new Float32Array((SX + 1) * (SZ + 1)).fill(1), 1));
  // the pour's weight a vertex (POUR.damp on the swell and the lip while the sheet pours in; 0 at every rest: the rest's glass is drawn as before)
  glassGeo.setAttribute('aPour', new THREE.BufferAttribute(new Float32Array((SX + 1) * (SZ + 1)), 1));
  const glassMat = glassMaterial(theme, grab, res, { size: [W, Dz], radius: 0.55, rimW: 0.6 });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.layers.set(OVERLAY); glass.renderOrder = 10; glass.frustumCulled = false; glass.visible = false;
  group.add(glass);

  // the tiles: one pane a cell (hidden where the cell is not hedged), the glass instanced
  const tileGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const tileMat = glassMaterial(theme, grab, res, { size: [1, 1], radius: tileRim.radius, rimW: tileRim.rimW, tiles: true });
  tileMat.uniforms.uTintA.value = T.glassTintA + 0.08;
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, N);
  tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tiles.frustumCulled = false;
  tiles.layers.set(OVERLAY); tiles.renderOrder = 11; tiles.visible = false;
  group.add(tiles);

  // the light, one column a cell (lit where the cell is hedged and the ground sits below the glass)
  const gapGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const gapAlpha = new Float32Array(N);
  gapGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(gapAlpha, 1));
  const gapMat = new THREE.ShaderMaterial({ vertexShader: GAP_VERT, fragmentShader: GAP_FRAG, transparent: true, depthWrite: false,
    blending: T.lightBlend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uColor: { value: lin(T.light).clone() }, uOn: { value: 0 }, uA: { value: T.lightA }, uFall: { value: T.lightFall ?? 0 }, uFar: { value: T.lightFar ?? 1 } } });
  const gaps = new THREE.InstancedMesh(gapGeo, gapMat, N);
  gaps.instanceMatrix.setUsage(THREE.DynamicDrawUsage); gaps.frustumCulled = false; gaps.renderOrder = 5;
  gaps.userData.noAO = true; // a light, not a solid: out of the stage's ambient-occlusion pass
  group.add(gaps);

  // beat 7's trails: two instances a cell (the teal one the bar as it rises, the orange dashed one hanging from the
  // sinking pane), drawn as diagram lines over the picture (the overlay layer, no depth test, as the path on the floor
  // is), TW world units wide (about three pixels at the plan's view, the craft review's hairline of Nov 21: its first
  // review found 0.08, two pixels, below legibility at 1,920 x 1,080 and gone at X's 720p; its second found 0.2-wide
  // marks of the rise alone flecks, so the lines are long now and thin: layout below), side by side on the cell's
  // near face; shown only while layout's trail is above 0
  const TW = 0.12, trailGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const trailKind = new Float32Array(2 * N), trailA = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) trailKind[2 * i + 1] = 1;
  trailGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(trailKind, 1));
  const trailAAttr = new THREE.InstancedBufferAttribute(trailA, 1); trailGeo.setAttribute('aA', trailAAttr);
  const trailMat = new THREE.ShaderMaterial({ vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, transparent: true, depthWrite: false, depthTest: false,
    uniforms: { uTeal: { value: lin(T.teal).clone() }, uOrange: { value: lin(T.orange).clone() }, uOp: { value: 1 }, uDash: { value: TRAIL_DASH } } });
  const trails = new THREE.InstancedMesh(trailGeo, trailMat, 2 * N);
  trails.instanceMatrix.setUsage(THREE.DynamicDrawUsage); trails.frustumCulled = false;
  trails.layers.set(OVERLAY); trails.renderOrder = 9; trails.visible = false;
  group.add(trails);

  // where its evening sold, column by column (v1's path): the revenue-weighted hour ending of its positive hours from
  // 4 pm to midnight, carried over columns without any, then a mean over PATH_HE.smooth columns either side (21 weeks
  // on the weekly fields; the drift's scope line names it from the same constant: data.ts PATH_HE)
  const by = new Map(), idxOf = new Map(); cells.forEach((c, i) => { by.set(c.j * NH + c.he, c); idxOf.set(c, i); });
  const peakCurve = (() => {
    const raw = new Array(n).fill(null);
    for (let j = 0; j < n; j++) { let t = 0, w = 0; for (let he = PATH_HE.fromHe; he <= PATH_HE.toHe; he++) { const c = by.get(j * NH + he); if (c && c.rev != null && c.rev > 0) { t += he * c.rev; w += c.rev; } } raw[j] = w > 0 ? t / w : null; }
    let last = (PATH_HE.fromHe + PATH_HE.toHe) / 2 - 1; for (let j = 0; j < n; j++) { if (raw[j] == null) raw[j] = last; else last = raw[j]; }
    return raw.map((_, j) => { let t = 0, k = 0; for (let d = -PATH_HE.smooth; d <= PATH_HE.smooth; d++) { t += raw[Math.max(0, Math.min(n - 1, j + d))]; k++; } return t / k; });
  })();
  const pathGroup = new THREE.Group(); pathGroup.visible = false; group.add(pathGroup);
  const pathMats = [];
  // the path's and the outline's draw-on (beat 4's move: the band appears where the sheet was, from the December end
  // across the hedged weeks, then the path draws along the crest to July): each is clipped at a world x by a plane
  // (kept where x is at or before it), nothing past it drawn. At every rest the planes sit far past the field
  // (setDraw(null, null): everything drawn, the same value every frame). The stage's renderer has local clipping on
  // (scene.ts); the shadow pass ignores the planes (neither casts a shadow).
  const revealPath = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6), revealOutline = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6);
  let pathPts = null, pathEnds = null;
  if (n >= 2) { // a one-column field has no path: a curve needs two points
    const ink = lin(pathColor === 'teal' ? T.teal : T.ink);
    const pts = peakCurve.map((pc, j) => new THREE.Vector3(x0 + xOf(j, n, dx), pathY, zOf(pc, hz)));
    // a path laid on the floor is a diagram line: drawn over the bars (the overlay layer, no depth test), as a chart's
    // line sits over its bars; a path in the air keeps its depth
    const onFloor = pathY < 0.5;
    const pathMat = (extra = {}) => { const m = new THREE.MeshBasicMaterial({ color: ink, transparent: true, depthTest: !onFloor, depthWrite: !onFloor, ...extra }); pathMats.push(m); return m; };
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(64, n * 4), pathR, 8, false), pathMat({ clippingPlanes: [revealPath] }));
    if (onFloor) { tube.layers.set(OVERLAY); tube.renderOrder = 9; }
    pathGroup.add(tube);
    const ends = [];
    for (const p of [pts[0], pts[pts.length - 1]]) { const d = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.17, pathR * 2.6), 16, 12), pathMat()); d.position.copy(p); if (onFloor) { d.layers.set(OVERLAY); d.renderOrder = 9; } pathGroup.add(d); ends.push(d); }
    pathPts = pts; pathEnds = ends;
    for (let j = 0; pathDrops && j < n; j += Math.max(1, Math.round(n / 9))) {
      const p = pts[j], m = new THREE.LineDashedMaterial({ color: ink, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.55 }); pathMats.push(m);
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, new THREE.Vector3(p.x, 0.02, p.z)]), m); l.computeLineDistances(); pathGroup.add(l);
    }
  }

  // the outline on the floor around the hedged hours (orange, dashed), merged across columns hedging the same hours
  const outline = new THREE.Group(); outline.visible = false; group.add(outline);
  const outlineMat = new THREE.MeshBasicMaterial({ color: lin(T.orange), transparent: true, opacity: 0.95, clippingPlanes: [revealOutline] });
  // the dashes' halo (a pale rail under them, the kit's glow by other means) and the band's fill, the same orange thin
  const haloMat = new THREE.MeshBasicMaterial({ color: lin(T.halo), transparent: true, opacity: 0.55, depthWrite: false, clippingPlanes: [revealOutline] });
  const fillMat = new THREE.MeshBasicMaterial({ color: lin(T.orange), transparent: true, opacity: fillA, depthWrite: false, clippingPlanes: [revealOutline] });
  function buildOutline(lidOf = (j) => series.lid[j]) {
    for (const ch of [...outline.children]) { ch.geometry.dispose(); outline.remove(ch); }
    const runsOf = (set) => { if (!set) return []; const out = []; let a = set[0], b = set[0]; for (let k = 1; k <= set.length; k++) { if (k < set.length && set[k] === b + 1) { b = set[k]; continue; } out.push([a, b]); if (k < set.length) { a = set[k]; b = set[k]; } } return out; };
    const spans = []; // { a, b, j0, j1 }: the hour endings a..b hedged on columns j0..j1
    for (let j = 0; j < n; j++) {
      for (const [a, b] of runsOf(lidOf(j))) {
        const s = spans.find((q) => q.a === a && q.b === b && q.j1 === j - 1);
        if (s) s.j1 = j; else spans.push({ a, b, j0: j, j1: j });
      }
    }
    // dashes: small flat boxes along each edge of each span's rectangle, on a pale rail (the halo), over a thin fill
    const y = 0.06, DASH = 0.32, GAP = 0.18, RW = outlineW, RH = 0.05, geos = [], rails = [], fills = [];
    const edge = (xa, za, xb, zb) => {
      const L = Math.hypot(xb - xa, zb - za), ang = Math.atan2(zb - za, xb - xa);
      for (let s0 = 0; s0 < L; s0 += DASH + GAP) {
        const len = Math.min(DASH, L - s0), mid = s0 + len / 2;
        const g = new THREE.BoxGeometry(len, RH, RW);
        g.rotateY(-ang); g.translate(xa + Math.cos(ang) * mid, y, za + Math.sin(ang) * mid);
        geos.push(g);
      }
      const r = new THREE.BoxGeometry(L + RW, RH * 0.6, RW + 0.12);
      r.rotateY(-ang); r.translate((xa + xb) / 2, y - 0.012, (za + zb) / 2);
      rails.push(r);
    };
    for (const s of spans) {
      const xa = x0 + xOf(s.j0, n, dx) - dx / 2, xb = x0 + xOf(s.j1, n, dx) + dx / 2;
      const za = zOf(s.a, hz) + hz / 2, zb = zOf(s.b, hz) - hz / 2;
      edge(xa, za, xb, za); edge(xb, za, xb, zb); edge(xb, zb, xa, zb); edge(xa, zb, xa, za);
      if (bandFill > 0) { const f = new THREE.PlaneGeometry(xb - xa, za - zb).rotateX(-Math.PI / 2); f.translate((xa + xb) / 2, 0.03, (za + zb) / 2); fills.push(f); }
    }
    if (geos.length) {
      const add = (gs, mat, order) => { const m = new THREE.Mesh(mergeGeometries(gs, false), mat); m.layers.set(OVERLAY); m.renderOrder = order; for (const g of gs) g.dispose(); outline.add(m); };
      if (fills.length) add(fills, fillMat, 6);
      add(rails, haloMat, 7);
      add(geos, outlineMat, 8);
    }
    return spans.length;
  }
  buildOutline();

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const BAR_X = 0.74, BAR_Z = 0.84, FLAT = 0.06, CAP = solidPits ? -99 : -block + 0.02;
  const evAt = new Map(); for (const c of cells) if (c.gE != null) evAt.set(c.j * NH + c.he, c);
  /** The ground under a cell: what it earned, moving to what it earned with the contract as settle runs 0 to 1; a cell
   *  the hedge does not cover keeps its own revenue. */
  const groundValue = (c, settle) => {
    if (c.rev == null) return null;
    if (settle <= 0 || c.gE == null) return c.rev;
    if (c.hedged == null) return null;
    return c.rev + (c.hedged - c.rev) * settle;
  };
  const own = (c, v) => ({ x: x0 + xOf(c.j, n, dx), z: zOf(c.he, hz), w: dx, d: hz, h: hOf(v), color: heatAt(theme, v) });
  const tmpColor = new THREE.Color();

  let glassKey = '';
  const placed = new Array(N);
  /**
   * settle 0..1 (the hedge settling), grow (0 flat, 1 standing), place(cell, i, v, own) → where a cell goes (null to
   * hide; its floor cell then reads as plain floor), lift/bend/calm/glassScale (the sheet), light (on/off), meet 0..1
   * (beat 7: bars rise to the glass, tiles come down, the light goes out; a number or a function of the column),
   * tileGap (a pane's inset in its cell), tileLift (the panes lifted off their level), slide { lid(j) → hours,
   * gE(j, he), hedged(j, he), t } (the panes moving from another hedge's hours to this one's), cap (how deep a pit
   * may hang before it is capped with its notch: the field's own, just inside its block, unless a move lets the pits
   * keep the chart wall's depth while the pad is still thin: beat 2's fan-out), solid (a field drawn with holes draws
   * its pits as solid boxes under the floor instead, the strip's look, with no notch), hole 0..1 (how far open the
   * floor's holes are: 1 at every rest; a move covers them with the cells' own colors at 0 and fades them open),
   * unknown(cell, i, own) → where a cell with no value goes (null, at every rest: the cell stays hatched; a move that
   * draws the unknown cells as something else gives them a place, a height and a color, as beat 3's merge gives each
   * its week's cell once its hatch has faded), trail 0..1 (beat 7: the two hairline trails on the cells the meet is
   * moving, the teal one the bar's rise so far, the orange dashed one the pane's descent so far; 0 at every rest) and
   * trailAt(j) → 0..1, each column's own weight of them (the scene's: the moving front's band, so a column mid-way
   * through the front carries them whole and one met or untouched none; null: 4m(1 - m) of the column's meet m).
   */
  function layout({ settle = 0, grow = 1, place = null, lift = 0, bend = 0, calm = 0, glassScale = 1, light = true, meet = 0, tileGap = 0.04, tileLift = 0.0, slide = null, cap = CAP, solid = false, hole = 1, unknown = null, trail = 0, trailAt = null, pour = null } = {}) {
    const boxy = solidPits || (solid && !!pitsSolid);
    const meetOf = typeof meet === 'function' ? meet : () => meet;
    // the pour (beat 3's move): once its front is past pourEnd the sheet, the settle and the light are the rest's own,
    // so the frame is the rest's exactly (the sheet's shape key the rest's: no reshaping on the spring's creep)
    if (pour && !(pour.front < pourEnd)) pour = null;
    /** A column's settle this frame: the frame's, or, through a pour, the frame's reached behind the front (0 ahead
     *  of it and under the swell, whole POUR.settleFrom + settleSpan columns behind the nose). */
    const settleOf = pour ? (j) => settle * sm((pour.front - j - POUR.settleFrom) / POUR.settleSpan) : () => settle;
    const trailOf = trailAt ?? ((j) => { const m = meetOf(j); return 4 * m * (1 - m); });
    // the slide: this column's panes from the other hedge's hours (sorted) to its own
    const slidePairs = (j) => {
      if (!slide) return null;
      const from = slide.lid(j) ?? [], to = series.lid[j] ?? [];
      const k = Math.max(from.length, to.length), out = [];
      for (let i = 0; i < k; i++) out.push([from[Math.min(i, from.length - 1)] ?? null, to[Math.min(i, to.length - 1)] ?? null]);
      return out;
    };
    const slideGround = (c) => {
      if (!slide) return null;
      const fromH = slide.hedged(c.j, c.he), fromLid = (slide.lid(c.j) ?? []).includes(c.he);
      const a = fromLid && fromH != null ? fromH : c.rev;
      const b = c.gE != null && c.hedged != null ? c.hedged : c.rev;
      return a == null || b == null ? null : lerp(a, b, slide.t);
    };
    const tileH = new Array(N).fill(null), tileGl = new Array(N).fill(null); // each cell's pane: its height (world y) and its dollar level, where it has one
    const tileY0 = new Array(N).fill(null); // each pane's height before the meet lowered it (the trail's far end)
    for (let i = 0; i < N; i++) {
      const c = cells[i];
      let v = slide ? slideGround(c) : groundValue(c, settleOf(c.j));
      const mi = ((c.he - 1) * n + c.j) * 4;
      capA[i] = 0;
      const g = v == null ? (unknown ? unknown(c, i, own(c, 0)) : null) : place ? place(c, i, v, own(c, v)) : own(c, v);
      placed[i] = g;
      if (pitsSolid) { m4.makeScale(0, 0, 0); pitsSolid.setMatrixAt(i, m4); }
      if (!g) {
        m4.makeScale(0, 0, 0); bars.setMatrixAt(i, m4); pits.setMatrixAt(i, m4); mask[mi] = v == null ? 128 : 255;
        cellCol[mi] = floorRGB[0]; cellCol[mi + 1] = floorRGB[1]; cellCol[mi + 2] = floorRGB[2];
        continue;
      }
      let h = g.h * grow;
      const mt = meetOf(c.j);
      if (mt > 0 && c.gE != null && g.h < hOf(c.gE) * glassScale * grow) h = lerp(h, hOf(c.gE) * glassScale * grow, 0.55 * mt);
      g.hNow = h;
      tmpColor.copy(g.color);
      colA[i * 3] = tmpColor.r; colA[i * 3 + 1] = tmpColor.g; colA[i * 3 + 2] = tmpColor.b;
      cellCol[mi] = tmpColor.r; cellCol[mi + 1] = tmpColor.g; cellCol[mi + 2] = tmpColor.b;
      if (h >= FLAT) {
        pos.set(g.x, g.y0 ?? 0, g.z); scl.set(g.w * BAR_X, h, g.d * BAR_Z); m4.compose(pos, q, scl); bars.setMatrixAt(i, m4);
        m4.makeScale(0, 0, 0); pits.setMatrixAt(i, m4); mask[mi] = 255;
      } else if (h <= -FLAT) {
        const d = Math.max(h, cap); capA[i] = h < cap && !boxy ? 1 : 0;
        pos.set(g.x, 0, g.z); scl.set(g.w * (boxy ? BAR_X : 1), -d, g.d * (boxy ? BAR_Z : 1)); m4.compose(pos, q, scl);
        (boxy && pitsSolid ? pitsSolid : pits).setMatrixAt(i, m4);
        m4.makeScale(0, 0, 0); bars.setMatrixAt(i, m4); if (boxy && pitsSolid) pits.setMatrixAt(i, m4);
        mask[mi] = boxy ? 255 : 0;
      } else { m4.makeScale(0, 0, 0); bars.setMatrixAt(i, m4); pits.setMatrixAt(i, m4); mask[mi] = 255; }
    }
    bars.instanceMatrix.needsUpdate = true; pits.instanceMatrix.needsUpdate = true;
    colAttr.needsUpdate = true; capAttr.needsUpdate = true; maskTex.needsUpdate = true; colorTex.needsUpdate = true;
    if (pitsSolid) {
      pitsSolid.instanceMatrix.needsUpdate = true;
      solidNow = boxy; pitsSolid.visible = bars.visible && boxy; pits.visible = bars.visible && !boxy;
    }
    holeA = Math.max(0, Math.min(1, hole)); floorMat.uniforms.uHole.value = holeA; floorBlend();

    // the sheet: its shape depends on bend and calm only; lift and grow are its transform
    if (sheet) {
      // through a pour the shape changes every frame (the front moves): reshaped on each, about 10,000 vertices
      const key = `${bend.toFixed(4)}:${calm.toFixed(4)}${pour ? `:${pour.front.toFixed(4)}` : ''}`;
      if (key !== glassKey) { glassKey = key; shapeGlass(bend, calm, pour); }
      glass.scale.y = Math.max(0.02, glassScale * grow); glass.position.y = lift;
      glassMat.uniforms.uScaleY.value = glass.scale.y;
    }

    // the tiles: a pane on each hedged cell at the contract's level (or sliding from the other hedge's hours)
    for (let i = 0; i < N; i++) { m4.makeScale(0, 0, 0); tiles.setMatrixAt(i, m4); }
    for (let j = 0; j < n; j++) {
      const pairs = slide ? slidePairs(j) : (series.lid[j] ?? []).map((he) => [he, he]);
      for (const [heA_, heB] of pairs) {
        const cB = heB != null ? by.get(j * NH + heB) : null, cA = heA_ != null ? by.get(j * NH + heA_) : null;
        const c = cB ?? cA; if (!c) continue;
        const i = idxOf.get(c), g = placed[i]; if (!g) continue;
        const gEB = cB?.gE ?? null, gEA = slide && heA_ != null ? slide.gE(j, heA_) : gEB;
        if (gEA == null && gEB == null) continue;
        const t = slide ? slide.t : 1;
        const glNow = gEA == null ? gEB : gEB == null ? gEA : lerp(gEA, gEB, t);
        let y = hOf(glNow) * glassScale * grow + lift + tileLift;
        const zA = heA_ != null ? zOf(heA_, hz) : g.z, zB = heB != null ? zOf(heB, hz) : g.z, z = lerp(zA, zB, t);
        const mt = meetOf(j);
        tileY0[i] = y;
        if (mt > 0 && g.hNow != null && g.hNow < y) y = lerp(y, g.hNow + 0.02, 0.45 * mt);
        tileH[i] = y; tileGl[i] = glNow;
        pos.set(g.x, y, z); scl.set(g.w * (1 - tileGap), 1, g.d * (1 - tileGap)); m4.compose(pos, q, scl); tiles.setMatrixAt(i, m4);
      }
    }
    tiles.instanceMatrix.needsUpdate = true;

    // the light: under the sheet (the Evening block's cells) or under a pane, what the glass holds that the ground did not earn
    /** A cell's light under a glass level gl over a ground v: its foot (the cell's height this frame, or the pit's cap)
     *  and its weight, brightest where it sold nothing of the contract's MWh and faint where it sold most of them (the
     *  shortfall), then the dollar gap's own weight; null where the glass holds no more than $150 the hour did not earn. */
    const lightAt = (c, g, gl, v) => {
      if (gl == null || v == null || !g) return null;
      const bot = Math.max(g.hNow ?? g.h * grow, cap), gap = gl - v;
      if (gap <= 150) return null;
      const sold = Math.max(0, c.x ?? 0), short = Math.max(0, Math.min(1, 1 - sold / Math.max(1, series.contracts)));
      return { bot, a: (0.1 + 0.9 * Math.pow(short, 1.5)) * Math.min(1, Math.max(0.15, Math.asinh(gap / 1500) / Math.asinh(8000 / 1500))) };
    };
    const noGap = (i) => { m4.makeScale(0, 0, 0); gaps.setMatrixAt(i, m4); gapAlpha[i] = 0; };
    if (slide) {
      // through a slide the light rides with each pane (the lid and its light one thing, as the rests draw them): a
      // pane's column stands under it at the pane's z this frame, its foot and its weight each the mix of the two ends'
      // (the hour the pane leaves, under its level there; the hour it reaches, under its level there), so a column
      // fades as its pane leaves a lit hour for one where the bar stands through the glass and fills in as a pane
      // reaches a lit hour; drawn in the reached cell's slot, as the tiles are. At t 0 and t 1 it is the rests' light
      // (beat 6's slide, Nov 20: the lid unlocking on the hero day and sliding to the battery's own hours)
      for (let i = 0; i < N; i++) noGap(i);
      /** The ground under a column's hour he this frame: the cell's height as placed (a pit's at its cap, the light's
       *  own foot), the floor where the cell is hidden. */
      const footOf = (j, he) => { const cc = by.get(j * NH + he), gg = cc ? placed[idxOf.get(cc)] : null; return gg ? Math.max(gg.hNow ?? gg.h * grow, cap) : 0; };
      /** The ground under a pane at the fractional hour hePos: mixed between the two cells it spans. */
      const footAt = (j, hePos) => { const h0 = Math.floor(hePos), h1 = Math.min(NH, h0 + 1); return lerp(footOf(j, h0), footOf(j, h1), hePos - h0); };
      for (let j = 0; light && j < n; j++) {
        for (const [heA_, heB] of slidePairs(j) ?? []) {
          const cB = heB != null ? by.get(j * NH + heB) : null, cA = heA_ != null ? by.get(j * NH + heA_) : null;
          const c = cB ?? cA; if (!c) continue;
          const i = idxOf.get(c), g = placed[i], top = tileH[i];
          if (!g || top == null) continue;
          const t = slide.t;
          const endA = cA ? lightAt(cA, placed[idxOf.get(cA)], heA_ != null ? slide.gE(j, heA_) : null, slideGround(cA)) : null;
          const endB = cB ? lightAt(cB, placed[idxOf.get(cB)], cB.gE, slideGround(cB)) : null;
          if (!endA && !endB) continue;
          const a = lerp(endA?.a ?? 0, endB?.a ?? 0, t);
          // the column's foot is the ground under the pane this frame (the cells it is over, as placed), not the mix
          // of the two ends' feet: between a pit the pane has left and the hour it is reaching, that mix stood below
          // the floor where no pit was (the follow's look review, Nov 20); at t 0 and t 1 the two agree
          const bot = heA_ != null && heB != null ? footAt(j, lerp(heA_, heB, t)) : lerp(endA?.bot ?? endB.bot, endB?.bot ?? endA.bot, t);
          if (a < 0.003 || top - bot < 0.05) continue;
          const z = lerp(heA_ != null ? zOf(heA_, hz) : g.z, heB != null ? zOf(heB, hz) : g.z, t);
          pos.set(g.x, bot, z); scl.set(g.w * 0.96, top - bot - 0.03, g.d * 0.96);
          m4.compose(pos, q, scl); gaps.setMatrixAt(i, m4);
          gapAlpha[i] = a * (1 - meetOf(j));
        }
      }
    } else {
      for (let i = 0; i < N; i++) {
        const c = cells[i], g = placed[i];
        const gl = tiles.visible ? tileGl[i] : c.gE;
        const top = tiles.visible ? tileH[i] : (gl == null ? null : hOf(gl) * glassScale * grow + lift);
        const sj = settleOf(c.j); // through a pour the light follows the front with the settle, column by column
        const L = light && sj > 0 && top != null ? lightAt(c, g, gl, groundValue(c, sj)) : null;
        if (!L || top - L.bot < 0.05) { noGap(i); continue; }
        pos.set(g.x, L.bot, g.z); scl.set(g.w * 0.96, top - L.bot - 0.03, g.d * 0.96);
        m4.compose(pos, q, scl); gaps.setMatrixAt(i, m4);
        gapAlpha[i] = sj * (1 - meetOf(c.j)) * L.a;
      }
    }
    gaps.instanceMatrix.needsUpdate = true; gapGeo.attributes.aAlpha.needsUpdate = true;

    // the trails (beat 7): on each hedged cell whose column the meet is moving, two hairlines side by side on the
    // cell's near face: the bar's whole height as it rises, from its foot on the floor to its risen top (a bar that
    // rose out of a pit, from the floor), in teal, at least one dash long; and from the pane down to where the bar's
    // top stood as the move began, the lit gap as it was, closing as the pane comes down and the bar comes up, in
    // orange dashes. A column's weight is trailOf (the moving front's band), so the trails ride the front and fade
    // behind it. The first build marked the rise alone and the gap left to close: on the weekly field's small means
    // they were flecks, not the two arms (the craft review of Nov 21)
    const trailOn = trail > 0.003 && tiles.visible, TX = TW * 1.5; // each line this far from the cell's middle
    let anyTrail = false;
    if (trailOn) {
      const zero = (k) => { m4.makeScale(0, 0, 0); trails.setMatrixAt(k, m4); trailA[k] = 0; };
      for (let i = 0; i < N; i++) {
        const c = cells[i], g = placed[i], a = g && c.gE != null ? trail * trailOf(c.j) : 0;
        const h0 = g ? Math.max(0, g.h * grow) : 0, h1 = g ? Math.max(0, g.hNow ?? h0) : 0, y1 = tileH[i], yf = g?.y0 ?? 0;
        const zf = g ? g.z + g.d * BAR_Z * 0.5 : 0;
        if (a > 0.003 && h1 - h0 > 0.02) { pos.set(g.x - TX, yf, zf); scl.set(TW, Math.max(h1 - yf, TRAIL_DASH), TW); m4.compose(pos, q, scl); trails.setMatrixAt(2 * i, m4); trailA[2 * i] = a; anyTrail = true; } else zero(2 * i);
        if (a > 0.003 && y1 != null && y1 - h0 > 0.05) { pos.set(g.x + TX, h0, zf); scl.set(TW, y1 - h0, TW); m4.compose(pos, q, scl); trails.setMatrixAt(2 * i + 1, m4); trailA[2 * i + 1] = a; anyTrail = true; } else zero(2 * i + 1);
      }
      trails.instanceMatrix.needsUpdate = true; trailAAttr.needsUpdate = true;
    }
    trails.visible = trailOn && anyTrail;
  }

  const rows = new Array(n);
  for (let j = 0; j < n; j++) {
    const vals = ev.map((he) => evAt.get(j * NH + he)?.gE ?? null);
    rows[j] = vals.every((v) => v != null) ? vals.map(hOf) : null;
  }
  const near = (j) => { for (let d = 0; d < n; d++) { if (rows[j - d]) return rows[j - d]; if (rows[j + d]) return rows[j + d]; } return null; };
  const rowAt = (j) => rows[Math.max(0, Math.min(n - 1, j))] ?? near(Math.max(0, Math.min(n - 1, j)));
  const calmLevel = hOf(series.contracts * 45);
  /** The pour's two ends, in columns of the field (the front of layout's pour): at pourStart nothing of the sheet is
   *  drawn (the front at the sheet's December edge, half a column before the first column with a lid); from pourEnd
   *  the sheet, the settle and the light are the rest's (the swell past the sheet's July edge, the last column's
   *  settle whole). */
  const jStart = Math.max(0, rows.findIndex((r) => r != null));
  const pourStart = jStart - 0.5, pourEnd = Math.max(n - 0.5 + POUR.swell, n - 1 + POUR.settleFrom + POUR.settleSpan);
  /** The sheet's surface, bend and calm its shape (v1), pour its arrival (beat 3's move): behind the front the sheet
   *  rises from the floor at the nose to its level within a column as a rounded lip and carries the swell, a crest
   *  POUR.amp above its level half the swell's width behind the nose, gone POUR.swell columns behind it; ahead of the
   *  front and at the nose's own cut nothing is drawn (aKnown 0: the glass shader discards it), and over POUR.fade
   *  behind the cut the sheet comes in from clear (aKnown 0.5 to 1), so the sheet has a liquid's leading edge on the
   *  floor and no rim there until it reaches the July end, where the plane's own rim is. */
  function shapeGlass(bend, calm, pour = null) {
    const P = glassGeo.attributes.position, kn = glassGeo.attributes.aKnown, pr = glassGeo.attributes.aPour;
    for (let iz = 0; iz <= SZ; iz++) {
      const zf = z0 + (iz / SZ) * Dz, tz = 12.5 - zf / hz - ev[0];
      for (let ix = 0; ix <= SX; ix++) {
        const xf = -W / 2 + (ix / SX) * W, jr = xf / dx + (n - 1) / 2, jf = Math.max(0, Math.min(n - 1, jr));
        const j1 = Math.min(Math.max(0, n - 2), Math.floor(jf)), tj = jf - j1, vi = ix + iz * (SX + 1);
        const ownRow = rows[Math.round(jf)];
        // the pour's front: d is how far behind the nose this vertex lies (its own column position, unclamped, so the
        // sheet's last half column sweeps in as the rest did and does not pop in whole)
        const d = pour ? pour.front - jr : Infinity;
        if (!ownRow || !rowAt(j1) || d <= POUR.cut) { kn.array[vi] = 0; pr.array[vi] = 0; P.setY(vi, 0); continue; }
        kn.array[vi] = pour ? 0.5 + 0.5 * Math.min(1, (d - POUR.cut) / POUR.fade) : 1; // the fade behind the cut; 1 at a rest
        const ys = [j1 - 1, j1, j1 + 1, j1 + 2].map((j) => cr(rowAt(j), tz));
        let y = n > 1 ? cr(ys, 1 + tj) : ys[1];
        if (calm > 0) y += (calmLevel - y) * calm;
        if (pour) {
          const t = Math.min(1, d / POUR.nose), s = Math.sin(Math.PI * Math.min(1, d / POUR.swell));
          y = y * Math.sqrt(t * (2 - t)) + POUR.amp * s * s;
          // the glass's specular taken down along the swell and the lip, and behind the swell over the normals' blur
          pr.array[vi] = (POUR.damp[theme] ?? 0) * (d <= POUR.swell ? 1 : 1 - sm((d - POUR.swell) / POUR.dampTail));
        } else pr.array[vi] = 0;
        P.setY(vi, y);
        const pc = peakCurve[Math.round(jf)] ?? (PATH_HE.fromHe + PATH_HE.toHe) / 2 - 1;
        P.setZ(vi, zf - (pc - (ev[0] + ev[ev.length - 1]) / 2) * hz * bend);
      }
    }
    P.needsUpdate = true; kn.needsUpdate = true; pr.needsUpdate = true;
    smoothNormals(glassGeo, SX, SZ, W / SX, Dz / SZ, 7, 2);
  }

  const api = {
    group, n, W, D, dx, hz, x0, z0, z1, cells, series, peakCurve, glassMesh: glass, tilesMesh: tiles, block, yScale, cap: CAP, pourStart, pourEnd,
    layout, own, groundValue, buildOutline,
    setDim(d) { bars.material.uniforms.uDimOut.value = d; pits.material.uniforms.uDimOut.value = d; floorMat.uniforms.uDimOut.value = d; },
    setSink(k) { bars.material.uniforms.uSink.value = k; pits.material.uniforms.uSink.value = k; },
    setFocus(lo, hi) { for (const m of [bars, pits]) m.material.uniforms.uFocus.value.set(lo, hi); floorMat.uniforms.uBand.value.set(lo - 1, hi - 1); },
    setPlain(p) { floorMat.uniforms.uPlain.value = p; },
    /** How much of the unknown hours' hatch shows (1 at every rest; a move fades it into plain floor before it draws
     *  those cells as something else). */
    setHatch(a) { floorMat.uniforms.uHatchA.value = a; },
    setFade(a) {
      const t = a < 0.999;
      fadeA = a; floorMat.uniforms.uAlpha.value = a; floorBlend();
      for (const m of [skirtMat, skirtDark]) { m.opacity = a; m.transparent = t; m.depthWrite = !t; }
    },
    /** The floor and the block's sides over w x d, centered at cx (the field's x0 unless a move stretches the pad out
     *  from elsewhere: beat 2's fan-out grows the season's pad from the strip's column) and at cz along the hours (0,
     *  the field's own, unless a move draws the pad out from one end: the Terminal's opening unrolls the strip's floor
     *  out of the column's face), the block's thickness scaled by bs (1: the field's own). */
    setFootprint(w, d, cx = x0, bs = 1, cz = 0) {
      const sx = w / W, sz = d / D;
      floor.scale.set(sx, 1, sz); floor.position.x = cx; floor.position.z = cz; floorMat.uniforms.uSize.value.set(w, d); floorMat.uniforms.uStep.value.set(dx * sx, hz * sz);
      floorMat.uniforms.uOrigin.value.set(cx, cz);
      sides.scale.set(sx, bs, sz); sides.position.x = cx - x0 * sx; sides.position.z = cz;
    },
    /** The field's heights stretched (the strip's chart wall, 3; a field, 1): a move lerps it. */
    setYScale(y) { group.scale.y = y; api.yScale = y; },
    show({ bars: b = true, floor: f = true, sides: s = true, glass: g = false, tiles: t = false, gaps: l = true, path = false, outline: o = false } = {}) {
      bars.visible = b; pits.visible = b && !solidNow; if (pitsSolid) pitsSolid.visible = b && solidNow;
      floor.visible = f; sides.visible = s; glass.visible = g && sheet; tiles.visible = t; gaps.visible = l; pathGroup.visible = path; outline.visible = o;
      group.visible = b || f || s || g || t || l || path || o;
    },
    hide() { api.show({ bars: false, floor: false, sides: false, glass: false, tiles: false, gaps: false, path: false, outline: false }); },
    setGlass(opacity) { glassMat.uniforms.uOpacity.value = opacity; tileMat.uniforms.uOpacity.value = opacity; },
    setLight(on) { gapMat.uniforms.uOn.value = on; },
    /** The light's weight and, for a glow (the dark theme), its falloff in world units and the fraction kept far from
     *  the foot (THEMES.*.lightA, lightFall, lightFar: the light pass's dials). */
    setLightShape({ a = null, fall = null, far = null } = {}) {
      if (a != null) gapMat.uniforms.uA.value = a;
      if (fall != null) gapMat.uniforms.uFall.value = fall;
      if (far != null) gapMat.uniforms.uFar.value = far;
    },
    setPath(opacity) { for (const m of pathMats) m.opacity = (m.isLineDashedMaterial ? 0.55 : 1) * opacity; pathGroup.visible = opacity > 0.01; },
    setOutline(opacity) { outlineMat.opacity = 0.95 * opacity; haloMat.opacity = 0.55 * opacity; fillMat.opacity = fillA * opacity; outline.visible = opacity > 0.01; },
    /** How far along the field, from the December end, the path and the outline are drawn (0..1; null: all of it):
     *  a move's draw-on. The path's July end sphere rides the front as the pen (over the tube's open end), and sits
     *  at the path's end at a rest; the December one shows once the draw has begun. */
    setDraw(path = null, outline = null) {
      revealOutline.constant = outline == null || outline >= 1 ? 1e6 : x0 - W / 2 + Math.max(0, outline) * W;
      if (!pathPts) return;
      const f = path == null ? 1 : Math.max(0, Math.min(1, path)), a = pathPts[0], b = pathPts[pathPts.length - 1];
      revealPath.constant = f >= 1 ? 1e6 : f <= 0 ? a.x - 1 : lerp(a.x, b.x, f); // the columns are evenly spaced: the front is the pen's x
      const jf = f * (n - 1), j1 = Math.min(n - 2, Math.floor(jf));
      pathEnds[1].position.lerpVectors(pathPts[j1], pathPts[j1 + 1], jf - j1);
      pathEnds[0].visible = f > 0.002; pathEnds[1].visible = f > 0.002;
    },
    pathAt(j) { const jj = Math.max(0, Math.min(n - 1, Math.round(j))); return [x0 + xOf(jj, n, dx), pathY, zOf(peakCurve[jj], hz)]; },
    cellAt(j, he) { return by.get(j * NH + he) ?? null; },
    /** Where a cell stood in the last layout (world, before the group's y scale), for plates. */
    placedAt(j, he) { const c = by.get(j * NH + he); if (!c) return null; const g = placed[idxOf.get(c)]; return g ? { x: g.x, z: g.z, h: g.hNow ?? g.h } : null; },
    /** The tallest cell of a column (by revenue), for a plate's anchor. */
    tallest(j) { let best = null; for (const c of cells) if (c.j === j && c.rev != null && (!best || c.rev > best.rev)) best = c; return best; },
    dispose() {
      group.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m?.dispose?.(); });
      for (const t of [maskTex, colorTex, monthTex]) t.dispose();
    },
  };
  return api;
}
