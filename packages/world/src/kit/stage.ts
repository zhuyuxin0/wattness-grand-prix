// @ts-nocheck
// Ported from landing-3d/live/stage.js (27 Oct 2026).
// The stage around the kit: renderer, studio light (warm key with soft shadows, cool rim, low image-based
// light), the map ground fading into the page chrome, and the post chain:
//   opaque pass (layer 0) -> GTAO (ambient occlusion) -> copy back over the opaque depth ->
//   overlay pass (layer 1: flow, data bars, ghosts, guides) -> Neutral tone mapping + sRGB.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { exactColor } from './tone';
import { waitForPrograms } from './program-preparation';

export const OVERLAY = 1;

// The stage is graded in the Terminal's palette: chrome at the top of the sky, a blue-tinted horizon (the
// chrome mixed toward the revenue ramp's #3c618b, light: #93b8ee), and a warm South Texas caliche ground
// that dissolves radially into that backdrop. Key warm, fill cool (hemisphere), rim cool.
export const STAGES = {
  dark: { ground: '#24303d', top: '#101315', horizon: '#243650', bottom: '#192431', glow: '#2b4058',
    key: '#ffe9cf', keyI: 2.7, rim: '#a9c8ff', rimI: 1.25, sky: '#9db9de', bounce: '#6a5a44', fillI: 0.55, env: 0.17 },
  light: { ground: '#e3e4e2', top: '#f3f4f6', horizon: '#d9e4f4', bottom: '#eef0f3', glow: '#e6eefa',
    key: '#fff0dc', keyI: 2.6, rim: '#cfe0ff', rimI: 1.0, sky: '#c8d9f2', bounce: '#b8a888', fillI: 0.5, env: 0.2 },
};
STAGES.navy = STAGES.dark; // the navy variant is retired; the dark stage carries its blue as the horizon grade

const BG_FN = /* glsl */`
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uGlow; uniform vec2 uGlowAt; uniform vec2 uResBg;
vec3 backdrop(vec3 dir, vec2 frag) {
  float y = dir.y;
  vec3 sky = mix(uHorizon, uTop, pow(smoothstep(-0.01, 0.42, y), 0.8));
  vec3 low = mix(uHorizon, uBottom, smoothstep(0.0, -0.32, y));
  vec3 c = y >= 0.0 ? sky : low;
  vec2 p = frag / uResBg - uGlowAt; p.x *= uResBg.x / uResBg.y;
  float g = exp(-dot(p, p) / 0.16) * (1.0 - smoothstep(0.0, 0.5, abs(y)));
  return mix(c, uGlow, g * 0.55);
}`;
const GROUND_VERT = /* glsl */`
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GROUND_FRAG = /* glsl */`
uniform vec3 uGround; uniform vec2 uRes; uniform vec2 uCenter; uniform vec2 uScreen; uniform vec2 uWorld; uniform vec2 uWorldCenter;
varying vec3 vWorld;
${BG_FN}
void main() {
  vec2 p = gl_FragCoord.xy / uRes - uCenter; p.x *= uRes.x / uRes.y;
  float fs = smoothstep(uScreen.x, uScreen.y, length(p));
  float fw = smoothstep(uWorld.x, uWorld.y, length(vWorld.xz - uWorldCenter));
  vec3 bg = backdrop(normalize(vWorld - cameraPosition), gl_FragCoord.xy);
  gl_FragColor = vec4(mix(uGround, bg, max(fs, fw)), 1.0);
}`;
const SKY_VERT = /* glsl */`
uniform mat4 uInvProj; uniform mat4 uCamWorld;
varying vec3 vDir;
void main() {
  vec4 v = uInvProj * vec4(position.xy, 1.0, 1.0);
  vDir = (uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;
const SKY_FRAG = /* glsl */`
varying vec3 vDir;
${BG_FN}
void main() { gl_FragColor = vec4(backdrop(normalize(vDir), gl_FragCoord.xy), 1.0); }`;

class CopyBackPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }',
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = writeBuffer.texture;
    renderer.setRenderTarget(readBuffer);
    const ac = renderer.autoClear; renderer.autoClear = false;
    this.quad.render(renderer);
    renderer.autoClear = ac;
  }
}

class LayerPass extends RenderPass {
  constructor(scene, camera, layer) { super(scene, camera); this.layer = layer; this.clear = false; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    const mask0 = this.camera.layers.mask; this.camera.layers.set(this.layer);
    const bg = this.scene.background; this.scene.background = null; // a colour background would force a clear
    super.render(renderer, writeBuffer, readBuffer, dt, mask);
    this.scene.background = bg; this.camera.layers.mask = mask0;
  }
}

/** Point and spot lights that cast no shadow and project no map are lit in a plain loop that passes over a light
 *  which does not reach the fragment (outside its cone or past its distance, where three's own code adds zero), in
 *  place of three's unrolled block, which runs every light's BRDF for every fragment. The picture is the same (at most
 *  one level apart, from rounding, at every rest and leg of the story); the shader is a fraction of the size. Three
 *  unrolls the loop only to index shadow maps and light maps by a constant, so a light with either keeps three's
 *  code. The garage's 35 high bays and 4 pit lamps drew the pit wall's leg in about 200 ms a frame at DPR 2 on an
 *  M1 Max with the unrolled block and 25 ms with the loop (lane E's probe, 27 Nov, under load). Done once, before
 *  any program is built; if three's chunk is not the one this was written for, it is left as it is. */
export function installLightLoop() {
  const chunks = THREE.ShaderChunk, src = chunks.lights_fragment_begin;
  if (typeof src !== 'string' || src.includes('LIGHT_LOOP_PLAIN')) return;
  const pointAt = src.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )');
  const spotAt = src.indexOf('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )');
  const nextAt = spotAt < 0 ? -1 : src.indexOf('#if ( NUM_', spotAt + 1);
  const point = src.slice(pointAt, spotAt), spot = src.slice(spotAt, nextAt);
  const RE = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  if (pointAt < 0 || spotAt < pointAt || nextAt < 0 || ![point, spot].every((b) => b.includes('#pragma unroll_loop_start') && b.includes(RE))) {
    console.warn('stage: three\'s lights_fragment_begin is not the one installLightLoop knows; left unrolled');
    return;
  }
  const plain = (kind, type, when) => `#if ( NUM_${kind}_LIGHTS > 0 ) && defined( RE_Direct ) && ${when} // LIGHT_LOOP_PLAIN
	${type} ${type[0].toLowerCase()}${type.slice(1)};
	for ( int i = 0; i < NUM_${kind}_LIGHTS; i ++ ) {
		${type[0].toLowerCase()}${type.slice(1)} = ${type[0].toLowerCase()}${type.slice(1)}s[ i ];
		get${type}Info( ${type[0].toLowerCase()}${type.slice(1)}, geometryPosition, directLight );
		if ( ! directLight.visible ) continue;
		${RE}
	}
#else
`;
  chunks.lights_fragment_begin = src.slice(0, pointAt)
    + plain('POINT', 'PointLight', '( ! defined( USE_SHADOWMAP ) || NUM_POINT_LIGHT_SHADOWS == 0 )') + point + '#endif\n'
    + plain('SPOT', 'SpotLight', '( NUM_SPOT_LIGHT_MAPS == 0 ) && ( ! defined( USE_SHADOWMAP ) || NUM_SPOT_LIGHT_SHADOWS == 0 )') + spot + '#endif\n'
    + src.slice(nextAt);
}

/** Redraws the shadow map at the start of a frame: every frame while `auto`, otherwise only when asked (a scene
 *  that knows when its lights or casters changed asks; the camera alone never needs it). While `hold` is set the map
 *  is kept as it was last drawn, whatever auto and a request say (the caller knows nothing that lights or casts has
 *  changed since: the same scene at the same time, seen from another place). */
class ShadowOncePass extends Pass {
  constructor() { super(); this.needsSwap = false; this.auto = true; this.pending = true; this.hold = false; }
  render(renderer) { if (this.hold) return; if (this.auto || this.pending) { renderer.shadowMap.needsUpdate = true; this.pending = false; } }
}

export function createStage({ canvas, width, height, dpr = 1, theme = 'dark', stage = null, ao = true }) {
  installLightLoop();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(dpr);
  // no link check per program (three reads the program's and both shaders' logs on first use: three round trips to the
  // GPU process each, which a busy GPU made the mounts' longest waits, 28 Oct); a broken shader still shows as GL errors
  renderer.debug.checkShaderErrors = false;
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r185: PCFSoft is folded into PCF (soft, filtered)
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.24;
  room.dispose?.();

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.3, 3000);
  camera.layers.set(0);

  // lights (layer 0 and the overlay layer, so overlay draws do not change light counts)
  const key = new THREE.DirectionalLight('#fff3e4', 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025; key.shadow.normalBias = 0.025; key.shadow.radius = 3.2;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#dce8ff', 1.0);
  scene.add(rim, rim.target);
  const fill = new THREE.HemisphereLight('#dfe6f0', '#4a4744', 0.12);
  scene.add(fill);
  for (const l of [key, rim, fill]) l.layers.enableAll();

  // ground: unlit map colour with a screen- and world-radial fade into the chrome; shadow catcher above it
  // backdrop uniforms, shared by the sky quad and the ground's fade (one gradient, so the ground has no edge)
  const bgU = {
    uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() }, uGlowAt: { value: new THREE.Vector2(0.62, 0.5) }, uResBg: { value: new THREE.Vector2(width * dpr, height * dpr) },
  };
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthWrite: false, depthTest: true,
    uniforms: { ...bgU, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() } },
  }));
  sky.frustumCulled = false; sky.renderOrder = -1000; sky.userData.noAO = true; sky.name = 'backdrop';
  sky.onBeforeRender = (r, sc, cam) => { sky.material.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse); sky.material.uniforms.uCamWorld.value.copy(cam.matrixWorld); };
  scene.add(sky);
  const gmat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG,
    uniforms: {
      ...bgU,
      uGround: { value: new THREE.Color() }, uRes: { value: new THREE.Vector2(width * dpr, height * dpr) },
      uCenter: { value: new THREE.Vector2(0.62, 0.5) }, uScreen: { value: new THREE.Vector2(0.55, 1.05) },
      uWorld: { value: new THREE.Vector2(160, 420) }, uWorldCenter: { value: new THREE.Vector2(0, 0) },
    },
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2400, 96).rotateX(-Math.PI / 2), gmat);
  ground.position.y = -0.16; ground.name = 'ground';
  ground.userData.noAO = true; // AO on this far, grazing plane drew a hard band at the horizon; the lit pad and patch keep their AO
  scene.add(ground);
  const catcher = new THREE.Mesh(new THREE.CircleGeometry(600, 64).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32, depthWrite: false }));
  catcher.position.y = -0.155; catcher.receiveShadow = true; catcher.userData.noAO = true; catcher.name = 'shadowCatcher';
  scene.add(catcher);

  // post chain
  const rt = new THREE.WebGLRenderTarget(width * dpr, height * dpr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr); composer.setSize(width, height);
  const shadowPass = new ShadowOncePass();
  composer.addPass(shadowPass);
  const main = new RenderPass(scene, camera);
  composer.addPass(main);
  const gtao = new GTAOPass(scene, camera, width * dpr, height * dpr);
  gtao.needsSwap = false; gtao.enabled = ao;
  gtao.blendIntensity = 1.0;
  // keep transparent overlays and contact quads out of the AO normal pass
  const ov = gtao._overrideVisibility.bind(gtao);
  gtao._overrideVisibility = function () {
    ov();
    scene.traverse((o) => { if (o.visible && (o.userData.noAO || (o.material && (o.material.userData?.noAO)))) { o.visible = false; this._visibilityCache.push(o); } });
  };
  // the share of a scene's ambient occlusion drawn while the camera travels (setAOMotion): 1 draws the scene's own;
  // at its scene's strength times this share of 0.002 or less, the AO pass and its copy-back are both skipped
  let aoMotion = 1;
  const aoSkipped = () => gtao.blendIntensity * aoMotion <= 0.002;
  const gtaoRender = gtao.render.bind(gtao);
  gtao.render = (...a) => {
    if (aoSkipped()) return;
    const bg = scene.background, k = gtao.blendIntensity;
    scene.background = null; gtao.blendIntensity = k * aoMotion;
    try { gtaoRender(...a); } finally { gtao.blendIntensity = k; scene.background = bg; }
  };
  composer.addPass(gtao);
  const copyBack = new CopyBackPass(); copyBack.enabled = ao;
  const copyBackRender = copyBack.render.bind(copyBack);
  copyBack.render = (...a) => { if (!aoSkipped()) copyBackRender(...a); };
  composer.addPass(copyBack);
  const overlay = new LayerPass(scene, camera, OVERLAY);
  composer.addPass(overlay);
  const output = new OutputPass();
  composer.addPass(output);

  let themeNow = theme, stageNow = stage || theme;
  function setTheme(t, s = null) {
    themeNow = t; stageNow = s || t;
    const st = STAGES[stageNow] || STAGES.dark;
    gmat.uniforms.uGround.value.copy(exactColor(THREE, st.ground));
    for (const k of ['top', 'horizon', 'bottom', 'glow']) bgU[`u${k[0].toUpperCase()}${k.slice(1)}`].value.copy(exactColor(THREE, st[k]));
    scene.background = null;
    key.color.set(st.key); key.intensity = st.keyI; rim.color.set(st.rim); rim.intensity = st.rimI;
    fill.color.set(st.sky); fill.groundColor.set(st.bounce); fill.intensity = st.fillI;
    scene.environmentIntensity = st.env;
    catcher.material.opacity = t === 'light' ? 0.2 : 0.36;
  }
  setTheme(theme, stage);

  function setAO(params, pd) {
    gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1, thickness: 1, scale: 1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false, ...params });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 9, rings: 3, samples: 24, ...pd });
  }
  setAO({});

  /** Ambient occlusion's strength, 0..1 (a scene fades it out while the camera moves and back in at rest; at 0 the
   *  AO and copy-back passes are skipped). */
  function setAOStrength(k) {
    const on = ao && k > 0.002;
    gtao.enabled = on; copyBack.enabled = on;
    gtao.blendIntensity = Math.min(1, Math.max(0, k));
  }
  /** The share (0..1) of the scene's ambient occlusion drawn while the camera travels: 1 at rest (the scene's own
   *  strength); a story lowers it through the middle of a camera move, where the AO and copy-back passes are about
   *  half of a frame's GPU time, and has it back at 1 before the camera lands. It is not the scene's: setAOStrength
   *  and the scene's state are left as they are. */
  function setAOMotion(k) { aoMotion = Math.min(1, Math.max(0, Number.isFinite(k) ? k : 1)); }
  /** Shadow-map refresh: auto (every frame) or on request (requestShadow() before the frame that needs it). */
  function setShadowAuto(on) { shadowPass.auto = !!on; if (!on) shadowPass.pending = true; }
  function requestShadow() { shadowPass.pending = true; }
  /** Keep the shadow map as last drawn, whatever auto and requests say (on), or redraw it as they say (off). For a
   *  caller that knows the lights and the casters are as they were when it was drawn: only the camera has moved. */
  function holdShadow(on) { shadowPass.hold = !!on; }

  /** Key light from compass azimuth (deg, from the subject toward the light) and elevation; shadow box fitted. */
  function setKey({ az = 225, el = 50, center = [0, 0, 0], radius = 20, intensity, rimAz, rimEl = 22, rimIntensity }) {
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180, d = radius * 4 + 50;
    const c = new THREE.Vector3(...center);
    key.position.set(c.x + Math.sin(a) * Math.cos(e) * d, c.y + Math.sin(e) * d, c.z - Math.cos(a) * Math.cos(e) * d);
    key.target.position.copy(c); key.target.updateMatrixWorld();
    const sc = key.shadow.camera;
    sc.left = -radius; sc.right = radius; sc.top = radius; sc.bottom = -radius; sc.near = 1; sc.far = d + radius * 2;
    sc.updateProjectionMatrix();
    if (intensity != null) key.intensity = intensity;
    const ra = (((rimAz ?? az + 165) % 360) * Math.PI) / 180, re = (rimEl * Math.PI) / 180;
    rim.position.set(c.x + Math.sin(ra) * Math.cos(re) * 100, c.y + Math.sin(re) * 100, c.z - Math.cos(ra) * Math.cos(re) * 100);
    rim.target.position.copy(c); rim.target.updateMatrixWorld();
    if (rimIntensity != null) rim.intensity = rimIntensity;
  }

  /** Camera from a target, compass azimuth (deg, target -> camera), down-angle (deg; negative looks up), distance. */
  function setCamera({ target, az, el, dist, vfov, shift = [0, 0], near, far }) {
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180, t = new THREE.Vector3(...target);
    camera.position.set(t.x + Math.sin(a) * Math.cos(e) * dist, t.y + Math.sin(e) * dist, t.z - Math.cos(a) * Math.cos(e) * dist);
    camera.up.set(0, 1, 0); camera.lookAt(t);
    camera.fov = vfov; camera.near = near ?? Math.max(0.1, dist * 0.02); camera.far = far ?? 3000;
    camera.userData.shift = shift; camera.userData.target = t;
    applyProjection();
  }
  function applyProjection() {
    camera.updateProjectionMatrix();
    const [sx, sy] = camera.userData.shift || [0, 0];
    camera.projectionMatrix.elements[8] = -2 * sx;
    camera.projectionMatrix.elements[9] = -2 * sy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function setFade({ center = [0.62, 0.5], screen = [0.55, 1.05], world = [160, 420], worldCenter = [0, 0], glow = null }) {
    gmat.uniforms.uCenter.value.set(...center); gmat.uniforms.uScreen.value.set(...screen);
    gmat.uniforms.uWorld.value.set(...world); gmat.uniforms.uWorldCenter.value.set(...worldCenter);
    bgU.uGlowAt.value.set(...(glow || center));
  }

  /** Override the backdrop (sky top, horizon, below the horizon, glow; hex as on screen); null restores the theme's.
   *  Chapter 3 at 10 pm draws a night sky this way. */
  function setBackdrop(o) {
    const st = { ...(STAGES[stageNow] || STAGES.dark), ...(o || {}) };
    for (const k of ['top', 'horizon', 'bottom', 'glow']) bgU[`u${k[0].toUpperCase()}${k.slice(1)}`].value.copy(exactColor(THREE, st[k]));
    if (o && o.ground) gmat.uniforms.uGround.value.copy(exactColor(THREE, o.ground));
  }

  /** Override the light rig: { key: { color, intensity }, rim: { color, intensity }, fill: { sky, ground, intensity },
   *  env, shadow (the catcher's opacity) }; null restores the theme's. Chapter 3 follows the sun this way. */
  function setLight(o) {
    const st = STAGES[stageNow] || STAGES.dark;
    key.color.set(o?.key?.color ?? st.key); key.intensity = o?.key?.intensity ?? st.keyI;
    rim.color.set(o?.rim?.color ?? st.rim); rim.intensity = o?.rim?.intensity ?? st.rimI;
    fill.color.set(o?.fill?.sky ?? st.sky); fill.groundColor.set(o?.fill?.ground ?? st.bounce); fill.intensity = o?.fill?.intensity ?? st.fillI;
    scene.environmentIntensity = o?.env ?? st.env;
    catcher.material.opacity = o?.shadow ?? (themeNow === 'light' ? 0.2 : 0.36);
  }

  /** Override the map ground's colour (hex, as it should land on screen); null restores the theme's. */
  function setGround(hex) {
    const st = STAGES[stageNow] || STAGES.dark;
    gmat.uniforms.uGround.value.copy(exactColor(THREE, hex || st.ground));
  }

  function setSize(w, h, d = dpr) {
    renderer.setPixelRatio(d); renderer.setSize(w, h, false);
    composer.setPixelRatio(d); composer.setSize(w, h);
    camera.aspect = w / h; applyProjection();
    gmat.uniforms.uRes.value.set(w * d, h * d); bgU.uResBg.value.set(w * d, h * d);
  }
  camera.aspect = width / height; applyProjection();

  const frameInfo = { calls: 0, triangles: 0, passes: {} };
  // per-pass draw calls (the shadow map is drawn inside the opaque pass; measured separately)
  const names = new Map([[main, 'opaque'], [gtao, 'aoNormalAndBlend'], [copyBack, 'copyBack'], [overlay, 'overlay']]);
  for (const pass of composer.passes) {
    const r = pass.render.bind(pass), name = names.get(pass) || pass.constructor.name;
    pass.render = (...a) => { const c0 = renderer.info.render.calls; r(...a); frameInfo.passes[name] = renderer.info.render.calls - c0; };
  }
  const sm = renderer.shadowMap.render.bind(renderer.shadowMap);
  renderer.shadowMap.render = (...a) => { const c0 = renderer.info.render.calls; sm(...a); frameInfo.passes.shadow += renderer.info.render.calls - c0; };
  function render() {
    renderer.info.reset(); frameInfo.passes = { shadow: 0 };
    composer.render();
    frameInfo.calls = renderer.info.render.calls; frameInfo.triangles = renderer.info.render.triangles;
    if (frameInfo.passes.opaque != null) frameInfo.passes.opaqueColour = frameInfo.passes.opaque - frameInfo.passes.shadow;
    return frameInfo;
  }

  let disposed = false;
  /** Queue the actual color/overlay, AO-normal and post-pass variants at their render targets before warm draws.
   * Renderer-created shadow depth programs still warm in the yielded draws; they have no public compile API. */
  async function preparePrograms(poses, alive) {
    if (!renderer.extensions.has('KHR_parallel_shader_compile')) return { state: 'unavailable', programs: 0 };
    const target = renderer.getRenderTarget(), mask = camera.layers.mask, programs = new Set();
    const collect = (root, view, targetScene = scene) => {
      for (const material of renderer.compile(root, view, targetScene)) {
        const properties = renderer.properties.get(material);
        // Transparent DoubleSide materials compile both sides; currentProgram names only the last variant.
        for (const program of properties.programs?.values() ?? []) programs.add(program);
        if (properties.currentProgram) programs.add(properties.currentProgram);
      }
    };
    const flatCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), emptyScene = new THREE.Scene();
    const flat = (quad, material, renderTarget) => {
      const mesh = quad._mesh.clone(false); mesh.material = material;
      renderer.setRenderTarget(renderTarget); collect(mesh, flatCamera, emptyScene);
    };
    try {
      for (const pose of poses) {
        if (disposed || !alive()) return { state: 'cancelled', programs: programs.size };
        pose();
        camera.layers.set(0); renderer.setRenderTarget(composer.readBuffer); collect(scene, camera);
        camera.layers.set(OVERLAY); collect(scene, camera);
        camera.layers.set(0);
        const normals = new THREE.Group();
        gtao._overrideVisibility();
        try {
          scene.traverseVisible(object => {
            if (!object.isMesh || !object.layers.test(camera.layers)) return;
            const copy = object.clone(false); copy.material = gtao.normalMaterial; normals.add(copy);
          });
        } finally { gtao._restoreVisibility(); }
        renderer.setRenderTarget(gtao.normalRenderTarget); collect(normals, camera);
      }
      flat(gtao._fsQuad, gtao.gtaoMaterial, gtao.gtaoRenderTarget);
      flat(gtao._fsQuad, gtao.pdMaterial, gtao.pdRenderTarget);
      gtao.copyMaterial.blending = THREE.NoBlending;
      flat(gtao._fsQuad, gtao.copyMaterial, composer.writeBuffer);
      flat(gtao._fsQuad, gtao.blendMaterial, composer.writeBuffer);
      flat(copyBack.quad, copyBack.material, composer.readBuffer);
      // This stage fixes sRGB output and Neutral tone mapping; mirror OutputPass's first-render defines.
      output._outputColorSpace = renderer.outputColorSpace; output._toneMapping = renderer.toneMapping;
      output.material.defines = { SRGB_TRANSFER: '', NEUTRAL_TONE_MAPPING: '' }; output.material.needsUpdate = true;
      flat(output._fsQuad, output.material, null);
    } catch (error) {
      console.warn('intro: shader preparation uses the yielded warm draws', error);
      return { state: 'fallback', programs: programs.size };
    } finally { camera.layers.mask = mask; renderer.setRenderTarget(target); }
    return waitForPrograms(programs, () => !disposed && alive());
  }

  /** Free the GPU side (the intro's scene unmounts with the overlay). */
  function dispose() {
    if (disposed) return;
    disposed = true;
    composer.dispose?.(); gtao.dispose?.(); rt.dispose(); pmrem.dispose();
    scene.environment?.dispose?.();
    scene.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints) { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (!m) continue; for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose?.(); } } });
    renderer.dispose(); renderer.forceContextLoss?.();
  }
  return { THREE, sky, renderer, scene, camera, composer, gtao, key, rim, fill, ground, catcher, setTheme, setAO, setAOStrength, setAOMotion, setShadowAuto, requestShadow, holdShadow, setKey, setCamera, applyProjection, setFade, setGround, setBackdrop, setLight, setSize, render, preparePrograms, dispose, frameInfo, theme: () => themeNow };
}

/** Put every object flagged userData.overlay (and its subtree) on the overlay layer only. */
export function assignLayers(root) {
  root.traverse((o) => {
    if (o.userData.overlay) o.traverse((c) => c.layers.set(OVERLAY));
  });
}
