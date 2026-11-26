// The rig check: the landing intro's battery enclosure and the Hedging walkthrough's battery column on the stage,
// under the key light with its shadows and ambient occlusion, with one plate. It shows the port draws as the intro
// does and that the frame data reaches a frame; it is not a storyboard frame.
import * as THREE from 'three';
import { buildEnclosure, ENC } from '../../kit/enclosure';
import { createMaterials, contactMaterial } from '../../kit/materials';
import { ensureBase } from '../../kit/geo';
import { contactTex, radialTex } from '../../kit/textures';
import { makeColumn, COL_R } from '../../kit/hedge/fields';
import { hOf } from '../../lib/heat';
import { assignLayers, type CameraPose } from '../../lib/stage';
import type { FrameData, FrameHandle, StationModule } from '../types';

/** The selected arm's best hour: each hour's expected dollars are the mean over the scenarios of its physical and
 *  hedge parts, plus its wear and fee (frame-data.json game.results; they sum to the arm's sealed expected_usd). */
function bestHour(d: FrameData) {
  const arm: string = d.showcase.selected_arm;
  const r = d.game.results[arm];
  const n: number = r.physical_uusd.length;
  let best = { hour: -1, usd: -Infinity };
  for (let h = 0; h < 24; h++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += r.physical_uusd[k][h] + r.hedge_uusd[k][h];
    const usd = (s / n + r.wear_uusd[h] + r.fee_uusd[h]) / 1e6;
    if (usd > best.usd) best = { hour: h, usd };
  }
  return { arm, ...best };
}

const clock = (h: number) => (h % 24 === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h} am` : `${h - 12} pm`);
/** An hour-starting index as its span in words: 17 is "5 to 6 pm CT", 11 is "11 am to noon CT". */
const span = (h: number) => {
  const a = clock(h), b = clock(h + 1), sa = a.split(' ')[1], sb = b.split(' ')[1];
  return sa && sa === sb ? `${a.split(' ')[0]} to ${b} CT` : `${a} to ${b} CT`;
};
const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

// The intro's close read of the enclosure (site-scene.ts rests 1a and 1b: key, fade and occlusion), framed wider so
// the column stands beside it.
const CAM: CameraPose = { target: [2.3, 1.55, -0.2], az: 214, el: 14, dist: 17.5, vfov: 38, shift: [0.17, 0.02] };
const COLUMN_AT = { x: 6.6, z: -0.4 };
const CALICHE = { dark: '#7f7768', light: '#d6cdb9' };

export const frames: StationModule['frames'] = {
  '_probe.rig': async (ctx): Promise<FrameHandle> => {
    const { stage, theme } = ctx;
    const materials = createMaterials(THREE, theme);
    const group = new THREE.Group(); group.name = 'probe';

    const enc = buildEnclosure(THREE, { lod: 'hero', theme, materials });
    group.add(enc.group);
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry((ENC.plinthX1 - ENC.plinthX0) / 0.62 * 0.92, (ENC.W + 0.42) / 0.62 * 1.2).rotateX(-Math.PI / 2),
      contactMaterial(THREE, contactTex(THREE), 0.62),
    );
    contact.position.set((ENC.plinthX0 + ENC.plinthX1) / 2, 0.006, 0); contact.renderOrder = 1;
    group.add(contact);

    // the lit patch the intro stands its enclosure on: the pad's concrete fading out radially
    const patchMat = materials.m.pad.clone();
    patchMat.transparent = true; patchMat.alphaMap = radialTex(THREE); patchMat.depthWrite = false;
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(22, 22).rotateX(-Math.PI / 2), patchMat);
    patch.position.set(2.2, -0.004, 0.6); patch.receiveShadow = true; patch.renderOrder = -1;
    group.add(patch);

    const data = ctx.data;
    const best = data ? bestHour(data) : null;
    const height = best ? hOf(best.usd) : 2.0;
    const col = makeColumn(theme);
    col.body.scale.y = height;
    col.group.position.set(COLUMN_AT.x, 0, COLUMN_AT.z);
    col.group.visible = true;
    group.add(col.group);
    const round = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2), contactMaterial(THREE, radialTex(THREE), 0.5));
    round.position.set(COLUMN_AT.x, 0.004, COLUMN_AT.z); round.renderOrder = 1;
    group.add(round);

    assignLayers(group);
    ensureBase(THREE, group);
    stage.scene.add(group);
    materials.farNormals(stage.gtao.normalMaterial);

    stage.setGround(CALICHE[theme]);
    stage.setFade({ center: [0.63, 0.56], screen: [0.44, 1.0], world: [11, 36], worldCenter: [2.6, -0.2], glow: [0.66, 0.48] });
    stage.setKey({ az: 150, el: 42, center: [2.6, 1.5, -0.2], radius: 12, rimAz: 20 });
    stage.setAO({ radius: 0.55, scale: 1.2, thickness: 1.2, samples: 16 });
    stage.setShadowAuto(true);

    const s = data?.showcase;
    return {
      time: 2.4,
      note: best
        ? `Rig check, not a storyboard frame. The enclosure is the landing intro's generic 20-ft unit at full size. The column's height is ${height.toFixed(2)} on the walkthrough's scale, 1.4 asinh($/1,500): the selected arm (${best.arm})'s best expected hour, ${span(best.hour)}, ${usd(best.usd)}, the mean over the sealed leaf's scenarios of that hour's physical, hedge, wear and fee parts (frame-data.json game.results). Name and rating from frame-data.json showcase.`
        : 'Rig check without frame data (scripts/sync-data.sh not run): the column stands at a fixed 2.0.',
      update(t) {
        stage.setCamera(CAM);
        materials.detail.value.x = (2 * Math.tan((stage.camera.fov * Math.PI) / 360)) / (ctx.height * ctx.dpr);
        enc.spin(t);
      },
      decorate() {
        const top: [number, number, number] = [COLUMN_AT.x, height, COLUMN_AT.z - COL_R * 0.3];
        ctx.plates.leaders([best && s
          ? { id: 'column', text: `${s.name} · ${s.power_mw} MW · ${s.energy_mwh} MWh`, sub: `Column: its best expected hour, ${span(best.hour)}, ${usd(best.usd)}`, at: top }
          : { id: 'column', text: 'Battery column', sub: 'Frame data not synced', at: top }]);
      },
    };
  },
};
