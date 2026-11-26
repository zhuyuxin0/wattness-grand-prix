// The world's stage: the kit's createStage (kit/stage.ts) with the three settings stills need, made from outside it.
// The drawing buffer is preserved (a canvas read after compositing still sees the frame), the ground disc is the
// region stage's 4200 m (its rim never shows at a high, wide framing), and shader errors are reported.
// WorldStage types the kit's untyped API for station code.
import * as THREE from 'three';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import { createStage, assignLayers, OVERLAY, STAGES } from '../kit/stage';

export type Theme = 'dark' | 'light';
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** The key light: compass azimuth from the subject toward the light and elevation (deg); the shadow box is
 *  center plus or minus radius (keep it tight: one 4096 map covers it). */
export interface KeyLight { az?: number; el?: number; center?: Vec3; radius?: number; intensity?: number; rimAz?: number; rimEl?: number; rimIntensity?: number }
/** A camera from its target: compass azimuth target to camera and down-angle (deg), distance, vertical lens (deg) and
 *  the lens shift in stage fractions (0.17 puts the subject right of a copy column). */
export interface CameraPose { target: Vec3; az: number; el: number; dist: number; vfov: number; shift?: Vec2; near?: number; far?: number }
/** Where the ground disc dissolves into the backdrop: screen-radial (stage fractions) and world-radial (meters). */
export interface GroundFade { center?: Vec2; screen?: Vec2; world?: Vec2; worldCenter?: Vec2; glow?: Vec2 | null }
/** Hexes as they should land on screen. */
export interface Backdrop { top?: string; horizon?: string; bottom?: string; glow?: string; ground?: string }
export interface LightRig {
  key?: { color?: string; intensity?: number };
  rim?: { color?: string; intensity?: number };
  fill?: { sky?: string; ground?: string; intensity?: number };
  env?: number;
  /** The shadow catcher's opacity. */
  shadow?: number;
}
export interface AOParams { radius?: number; distanceExponent?: number; thickness?: number; scale?: number; samples?: number; distanceFallOff?: number; screenSpaceRadius?: boolean }
export interface AODenoise { lumaPhi?: number; depthPhi?: number; normalPhi?: number; radius?: number; rings?: number; samples?: number }
export interface FrameInfo { calls: number; triangles: number; passes: Record<string, number> }

export interface WorldStage {
  THREE: typeof THREE;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  gtao: GTAOPass;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
  sky: THREE.Mesh;
  ground: THREE.Mesh;
  catcher: THREE.Mesh;
  frameInfo: FrameInfo;
  setTheme(theme: Theme, stage?: Theme | null): void;
  setAO(params: AOParams, denoise?: AODenoise): void;
  /** 0..1; below 0.002 both AO passes are skipped. */
  setAOStrength(k: number): void;
  setShadowAuto(on: boolean): void;
  requestShadow(): void;
  /** Keep the shadow map as last drawn (on) whatever auto and requests say, for a caller that knows nothing that
   *  lights or casts has changed since; off: redrawn as they say. */
  holdShadow(on: boolean): void;
  setKey(key: KeyLight): void;
  setCamera(pose: CameraPose): void;
  applyProjection(): void;
  setFade(fade: GroundFade): void;
  setGround(hex: string | null): void;
  setBackdrop(backdrop: Backdrop | null): void;
  setLight(rig: LightRig | null): void;
  setSize(width: number, height: number, dpr?: number): void;
  render(): FrameInfo;
  preparePrograms(poses: (() => void)[], alive: () => boolean): Promise<{ state: string; programs: number }>;
  dispose(): void;
  theme(): Theme;
  /** Insert a pass (a glass's grab) between the AO copy-back and the overlay layer, where the kit's glass reads it. */
  insertBeforeOverlay(pass: Pass): void;
  /** The GPU's renderer string (WEBGL_debug_renderer_info), or the masked one. */
  gpu(): string;
}

export interface WorldStageOptions {
  canvas: HTMLCanvasElement;
  /** CSS px. */
  width: number;
  height: number;
  /** Drawing-buffer pixels per CSS px. */
  dpr: number;
  theme: Theme;
  ao?: boolean;
  preserve?: boolean;
  groundRadius?: number;
  /** Check every program's link status (off in the kit for mount speed; on here so a broken shader says so). */
  debug?: boolean;
}

type KitStage = Omit<WorldStage, 'insertBeforeOverlay' | 'gpu'>;

export function createWorldStage(o: WorldStageOptions): WorldStage {
  if (o.preserve !== false) {
    // three asks the canvas for its context with these attributes and preserveDrawingBuffer false; a canvas returns
    // the context it already has, so asking first decides the one attribute that differs.
    o.canvas.getContext('webgl2', {
      alpha: true, depth: true, stencil: false, antialias: false, premultipliedAlpha: true,
      preserveDrawingBuffer: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false,
    });
  }
  const stage = createStage({ canvas: o.canvas, width: o.width, height: o.height, dpr: o.dpr, theme: o.theme, ao: o.ao ?? true }) as unknown as KitStage;
  stage.renderer.debug.checkShaderErrors = o.debug ?? true;
  const radius = o.groundRadius ?? 4200;
  if (radius !== 2400) {
    stage.ground.geometry.dispose();
    stage.ground.geometry = new THREE.CircleGeometry(radius, 96).rotateX(-Math.PI / 2);
  }
  const insertBeforeOverlay = (pass: Pass) => { stage.composer.insertPass(pass, stage.composer.passes.length - 2); };
  const gpu = () => {
    const gl = stage.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  };
  return Object.assign(stage, { insertBeforeOverlay, gpu });
}

export { assignLayers, OVERLAY, STAGES };
