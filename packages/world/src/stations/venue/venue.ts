// The whole venue on one stage: the ground, every station's hero, the Arcade, and the garage's liquid-glass roof with
// the mark. The hub (V01) and the closing (V04) see all of it; the drive (V02) and the stewards' bay (V03) build it
// with near detail on.
import * as THREE from 'three';
import { createMaterials } from '../../kit/materials';
import { ensureBase } from '../../kit/geo';
import { GrabBlurPass, glassPlane, markTexture } from '../../kit/region/glass';
import { setLineResolution, tickPulses } from '../../kit/region/flows';
import { assignLayers } from '../../lib/stage';
import { strand } from './look';
import { buildGround } from './ground';
import { hardware, buildGrid, buildRadar, buildBays, buildTeamData, buildParcFerme, buildRaceDay, buildStewardsFar, buildMachines, buildTiming, buildHangar } from './heroes';
import { buildArena } from './arena';
import { needLayout, type Layout } from './layout';
import type { FrameContext, FrameData } from '../types';

export interface VenueOptions {
  near?: boolean;
  /** The shadow catchers' opacity: the moon's shadows on the flat grounds. */
  shadow?: number;
  /** Leave the far stewards' bay out (the close read draws its own). */
  stewards?: boolean;
  roof?: { blurPasses?: number; blurRadius?: number; fillA?: number; clamp?: number; opacity?: number; sheen?: number; shadow?: number;
    /** The grab's resolution as a divisor of the drawing buffer: the kit's 4 (a quarter) frosts the bays into a blur
     *  at the hub's scale; 1 keeps them legible through the pane. */
    grabDiv?: number;
    /** The pane's dashed edge drawn as a line (the diagram's dashed enclosure); off at eye level, where the pane does
     *  not draw and the line hung in the air over the posts. */
    edge?: boolean };
}

export async function buildVenue(ctx: FrameContext, o: VenueOptions = {}) {
  const { stage, width: W, height: H, dpr } = ctx;
  const d: FrameData = ctx.needData();
  const L: Layout = needLayout(ctx.layout);
  const root = new THREE.Group(); root.name = 'venue';
  const reg = createMaterials(THREE, 'dark');
  const HW = hardware(reg as any);

  const ground = buildGround(L, { dpr, near: !!o.near, shadow: o.shadow ?? 0.34 });
  root.add(ground.group);
  // the stage's ground disc lies 0.16 m under the apron and would close Team data's pit: drawn first and without
  // depth, it stays the venue's surround and the pit shows through the opening
  (stage.ground.material as THREE.Material).depthWrite = false; stage.ground.renderOrder = -900;
  const grid = buildGrid(L, d); root.add(grid.group);
  const radar = buildRadar(HW); root.add(radar.group);
  const bays = buildBays(d, HW); root.add(bays.group);
  const team = buildTeamData(d, HW); root.add(team.group);
  const parc = buildParcFerme(d, HW); root.add(parc.group);
  const race = buildRaceDay(d, HW); root.add(race.group);
  if (o.stewards !== false) root.add(buildStewardsFar(HW).group);
  const machines = buildMachines(HW); root.add(machines.group);
  const timing = buildTiming(d, HW); root.add(timing.group);
  const arena = buildArena(d, HW); root.add(arena.group);
  const hangar = buildHangar(L, HW); root.add(hangar.group);

  // the garage's roof: the Terminal's liquid glass over the whole enclosure at 18 m, the mark on it over the
  // workshop, its dashed hairline edge the diagram's dashed enclosure
  const R = o.roof ?? {};
  const grab = new GrabBlurPass(W * dpr, H * dpr, { passes: R.blurPasses ?? 1, radius: R.blurRadius ?? 0.8 }) as unknown as THREE.Object3D & { texture: THREE.Texture };
  if (R.grabDiv && R.grabDiv !== 4) {
    const gp = grab as unknown as { a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget; setSize(w: number, h: number): void };
    const k = R.grabDiv;
    gp.setSize = (w: number, h: number) => { gp.a.setSize(Math.max(1, Math.round(w / k)), Math.max(1, Math.round(h / k))); gp.b.setSize(Math.max(1, Math.round(w / k)), Math.max(1, Math.round(h / k))); };
    gp.setSize(W * dpr, H * dpr);
  }
  stage.insertBeforeOverlay(grab as never);
  const mark = await markTexture();
  const gf = L.stations.find((s) => s.id === 'garage')!.footprint;
  const cx = (gf.x0 + gf.x1) / 2, cz = (gf.z0 + gf.z1) / 2, wz = gf.z1 - gf.z0, dx = gf.x1 - gf.x0;
  const roof = glassPlane({ w: wz, d: dx, y: 18, x: cx, z: cz, radius: gf.corner_m, theme: 'dark', blur: grab.texture, mark, res: new THREE.Vector2(W * dpr, H * dpr) });
  // turned so the mark reads west to east, its top to the north (glass.ts reads it along the plane's own north)
  roof.rotation.y = -Math.PI / 2;
  const u = roof.material.uniforms;
  u.uFillA.value = R.fillA ?? 0.2; u.uClamp.value = R.clamp ?? 0.3; u.uOpacity.value = R.opacity ?? 1; u.uSheen.value = R.sheen ?? 0.1;
  // the pane's depth shadow is drawn on a quad 70 m wider than the pane: seen from under that margin (the drive) it
  // would darken the sky, so eye-level frames turn it off
  if (R.shadow != null) u.uShadowA.value = R.shadow;
  const markLen = 124, markH = markLen / mark.aspect, markX0 = cx - markLen / 2, markZ1 = gf.z1 - 6;
  u.uMarkRect.value.set((markX0 - gf.x0) / dx, (gf.z1 - markZ1) / wz, markLen / dx, markH / wz);
  u.uMarkA.value = 0.78;
  root.add(roof);
  if (R.edge !== false) {
    const edge = hangar.ring.map(([x, z]) => [x, 18.05, z]);
    root.add(strand([...edge, edge[0]!], { color: '#c3cbd3', width: 1.1, opacity: 0.85, dash: 4, gap: 4, order: 12 }));
  }

  // every line and comet above the roof's glass in the draw order, so the diagram's strokes keep their edge through it
  root.traverse((ob) => { const m = (ob as THREE.Mesh).material as THREE.Material | undefined; if (m && (m as any).userData?.fine && ob.renderOrder < 11) ob.renderOrder += 11; });

  assignLayers(root);
  ensureBase(THREE, root);
  setLineResolution(root, W, H, dpr);
  stage.scene.add(root);
  reg.farNormals(stage.gtao.normalMaterial);

  return {
    root, d, L, reg, HW, ground, grid, radar, parc, timing, arena, roof, grab,
    tick(t: number) { tickPulses(root, t); radar.sweep.rotation.y = -t * 0.9; },
    /** Show the closing's pulse: one bright front once round the lap, its head at track meter t * speed. */
    pulse(on: boolean) { ground.wave.visible = on; },
    detail() { reg.detail.value.x = (2 * Math.tan((stage.camera.fov * Math.PI) / 360)) / (H * dpr); },
  };
}

export type Venue = Awaited<ReturnType<typeof buildVenue>>;
