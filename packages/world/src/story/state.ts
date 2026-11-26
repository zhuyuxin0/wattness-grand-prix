// What a frame leaves on the shared stage, captured and put back. A station's setup and its update(t) write the
// kit's stage directly (its setters, and a few members: the ground's and the catcher's visibility, the scene's fog,
// the renderer's local clipping, the lights' positions): with one renderer and one stage for the whole story, each
// frame's picture depends on the stage holding that frame's state when it draws. capture() reads every value the kit's
// setters and the stations write; apply() writes them back, touching a material's defines (and so a recompile) only
// when they differ. The camera is not here: the player owns it.
import * as THREE from 'three';
import type { WorldStage } from '../lib/stage';

type Uniforms = Record<string, { value: unknown }>;

/** A uniform's value, copied (colors, vectors and matrices by value; numbers and booleans as they are; textures and
 *  other objects by reference). */
function copyValue(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as { clone?: () => unknown; isColor?: boolean; isVector2?: boolean; isVector3?: boolean; isVector4?: boolean; isMatrix3?: boolean; isMatrix4?: boolean };
    if (o.isColor || o.isVector2 || o.isVector3 || o.isVector4 || o.isMatrix3 || o.isMatrix4) return o.clone!();
  }
  return v;
}
function writeValue(u: { value: unknown }, v: unknown) {
  const cur = u.value as { copy?: (x: unknown) => unknown; isColor?: boolean; isVector2?: boolean; isVector3?: boolean; isVector4?: boolean; isMatrix3?: boolean; isMatrix4?: boolean } | null;
  if (cur && typeof cur === 'object' && v && typeof v === 'object' && cur.copy && (cur.isColor || cur.isVector2 || cur.isVector3 || cur.isVector4 || cur.isMatrix3 || cur.isMatrix4)) cur.copy(v);
  else u.value = v;
}
const readUniforms = (u: Uniforms, keys: readonly string[]) => keys.map((k) => copyValue(u[k]?.value));
const writeUniforms = (u: Uniforms, keys: readonly string[], vals: readonly unknown[]) => keys.forEach((k, i) => { if (u[k]) writeValue(u[k]!, vals[i]); });

const GROUND_U = ['uGround', 'uRes', 'uCenter', 'uScreen', 'uWorld', 'uWorldCenter', 'uTop', 'uHorizon', 'uBottom', 'uGlow', 'uGlowAt', 'uResBg'] as const;
const GTAO_U = ['radius', 'distanceExponent', 'thickness', 'scale', 'distanceFallOff'] as const;
const PD_U = ['lumaPhi', 'depthPhi', 'normalPhi'] as const;

interface LightState { color: THREE.Color; intensity: number; position: THREE.Vector3; target: THREE.Vector3 | null; visible: boolean }
const readLight = (l: THREE.Light & { target?: THREE.Object3D }): LightState => ({
  color: l.color.clone(), intensity: l.intensity, position: l.position.clone(), target: l.target ? l.target.position.clone() : null, visible: l.visible,
});
function writeLight(l: THREE.Light & { target?: THREE.Object3D }, s: LightState) {
  l.color.copy(s.color); l.intensity = s.intensity; l.position.copy(s.position); l.visible = s.visible;
  if (l.target && s.target) { l.target.position.copy(s.target); l.target.updateMatrixWorld(); }
}

export interface StageState {
  fog: THREE.Fog | THREE.FogExp2 | null;
  background: unknown;
  envIntensity: number;
  localClipping: boolean;
  exposure: number;
  key: LightState & { shadow: { left: number; right: number; top: number; bottom: number; near: number; far: number; bias: number; normalBias: number; radius: number } };
  rim: LightState;
  fill: { color: THREE.Color; groundColor: THREE.Color; intensity: number; visible: boolean };
  sky: { visible: boolean };
  ground: { visible: boolean; renderOrder: number; material: THREE.Material | THREE.Material[]; y: number; uniforms: unknown[] | null };
  catcher: { visible: boolean; opacity: number; y: number };
  ao: { enabled: boolean; blend: number; copyBack: boolean; u: unknown[]; samples: number; ssr: number; pd: unknown[]; pdRadius: number; pdRings: number; pdSamples: number };
  shadow: { auto: boolean };
  /** Each pass the frame added, and whether it was on. */
  passes: Map<object, boolean>;
}

/** The kit's own pieces the stations never see by name: its first-built passes and the ground's own material. */
export interface StageParts {
  base: readonly object[];
  shadowPass: { auto: boolean; pending: boolean };
  copyBack: { enabled: boolean };
  groundMat: THREE.ShaderMaterial;
  /** GTAO's own normal material. A station patches the one it is given (kit/materials.ts farNormals binds its own
   *  detail uniform into it, under one program cache key), so each frame gets its own copy (instances.ts). */
  normal0: THREE.Material;
}

/** Read once, right after the stage is made (kit/stage.ts builds its passes in this order: the shadow refresh, the
 *  opaque pass, GTAO, the copy-back, the overlay pass, the output). */
export function stageParts(stage: WorldStage): StageParts {
  const base = stage.composer.passes.slice();
  const shadowPass = base[0] as unknown as StageParts['shadowPass'];
  const copyBack = base[3] as unknown as StageParts['copyBack'];
  if (!shadowPass || typeof shadowPass.auto !== 'boolean' || base[2] !== stage.gtao || !copyBack) throw new Error('story: the kit stage\'s passes are not in the order kit/stage.ts builds them');
  return { base, shadowPass, copyBack, groundMat: stage.ground.material as THREE.ShaderMaterial, normal0: (stage.gtao as unknown as { normalMaterial: THREE.Material }).normalMaterial };
}

export function capture(stage: WorldStage, parts: StageParts, own: Iterable<object>): StageState {
  const g = stage.gtao as unknown as { gtaoMaterial: THREE.ShaderMaterial; pdMaterial: THREE.ShaderMaterial; pdRadius: number; pdRings: number; pdSamples: number; blendIntensity: number; enabled: boolean };
  const key = stage.key, sc = key.shadow.camera as THREE.OrthographicCamera;
  const gm = stage.ground.material;
  const passes = new Map<object, boolean>();
  for (const p of own) passes.set(p, (p as { enabled: boolean }).enabled);
  return {
    fog: stage.scene.fog, background: stage.scene.background, envIntensity: stage.scene.environmentIntensity,
    localClipping: stage.renderer.localClippingEnabled, exposure: stage.renderer.toneMappingExposure,
    key: { ...readLight(key), shadow: { left: sc.left, right: sc.right, top: sc.top, bottom: sc.bottom, near: sc.near, far: sc.far, bias: key.shadow.bias, normalBias: key.shadow.normalBias, radius: key.shadow.radius } },
    rim: readLight(stage.rim),
    fill: { color: stage.fill.color.clone(), groundColor: stage.fill.groundColor.clone(), intensity: stage.fill.intensity, visible: stage.fill.visible },
    sky: { visible: stage.sky.visible },
    ground: { visible: stage.ground.visible, renderOrder: stage.ground.renderOrder, material: gm, y: stage.ground.position.y,
      uniforms: readUniforms(parts.groundMat.uniforms as Uniforms, GROUND_U) },
    catcher: { visible: stage.catcher.visible, opacity: (stage.catcher.material as THREE.Material).opacity, y: stage.catcher.position.y },
    ao: { enabled: g.enabled, blend: g.blendIntensity, copyBack: parts.copyBack.enabled, u: readUniforms(g.gtaoMaterial.uniforms as Uniforms, GTAO_U),
      samples: Number(g.gtaoMaterial.defines.SAMPLES), ssr: Number(g.gtaoMaterial.defines.SCREEN_SPACE_RADIUS ?? 0),
      pd: readUniforms(g.pdMaterial.uniforms as Uniforms, PD_U), pdRadius: g.pdRadius, pdRings: g.pdRings, pdSamples: g.pdSamples },
    shadow: { auto: parts.shadowPass.auto },
    passes,
  };
}

/** Puts a captured state back; every pass not in `own` that a frame added (others' passes) is switched off. */
export function apply(stage: WorldStage, parts: StageParts, s: StageState, allAdded: Iterable<object>) {
  const sc = stage.scene;
  sc.fog = s.fog; sc.background = s.background as THREE.Scene['background']; sc.environmentIntensity = s.envIntensity;
  stage.renderer.localClippingEnabled = s.localClipping; stage.renderer.toneMappingExposure = s.exposure;
  writeLight(stage.key, s.key);
  const kc = stage.key.shadow.camera as THREE.OrthographicCamera, ks = s.key.shadow;
  kc.left = ks.left; kc.right = ks.right; kc.top = ks.top; kc.bottom = ks.bottom; kc.near = ks.near; kc.far = ks.far; kc.updateProjectionMatrix();
  stage.key.shadow.bias = ks.bias; stage.key.shadow.normalBias = ks.normalBias; stage.key.shadow.radius = ks.radius;
  writeLight(stage.rim, s.rim);
  stage.fill.color.copy(s.fill.color); stage.fill.groundColor.copy(s.fill.groundColor); stage.fill.intensity = s.fill.intensity; stage.fill.visible = s.fill.visible;
  stage.sky.visible = s.sky.visible;
  const gr = stage.ground;
  gr.visible = s.ground.visible; gr.renderOrder = s.ground.renderOrder; gr.material = s.ground.material; gr.position.y = s.ground.y;
  if (s.ground.uniforms) writeUniforms(parts.groundMat.uniforms as Uniforms, GROUND_U, s.ground.uniforms);
  stage.catcher.visible = s.catcher.visible; (stage.catcher.material as THREE.Material).opacity = s.catcher.opacity; stage.catcher.position.y = s.catcher.y;
  const g = stage.gtao as unknown as { gtaoMaterial: THREE.ShaderMaterial; pdMaterial: THREE.ShaderMaterial; blendIntensity: number; enabled: boolean;
    updateGtaoMaterial(p: object): void; updatePdMaterial(p: object): void; pdRadius: number; pdRings: number; pdSamples: number };
  g.enabled = s.ao.enabled; g.blendIntensity = s.ao.blend; parts.copyBack.enabled = s.ao.copyBack;
  writeUniforms(g.gtaoMaterial.uniforms as Uniforms, GTAO_U, s.ao.u);
  // the defines through GTAOPass's own setters, which recompile only on a change
  g.updateGtaoMaterial({ samples: s.ao.samples, screenSpaceRadius: s.ao.ssr === 1 });
  writeUniforms(g.pdMaterial.uniforms as Uniforms, PD_U, s.ao.pd);
  if (g.pdRadius !== s.ao.pdRadius || g.pdRings !== s.ao.pdRings || g.pdSamples !== s.ao.pdSamples) g.updatePdMaterial({ radius: s.ao.pdRadius, rings: s.ao.pdRings, samples: s.ao.pdSamples });
  parts.shadowPass.auto = s.shadow.auto; parts.shadowPass.pending = true;
  for (const p of allAdded) (p as { enabled: boolean }).enabled = s.passes.get(p) ?? false;
}
