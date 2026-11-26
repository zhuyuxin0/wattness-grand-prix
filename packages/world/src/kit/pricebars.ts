// @ts-nocheck
// Ported from landing-3d/live/kit/pricebars.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// Twenty-four 3D price bars for one real day: height from the hour's real-time price at the battery's node
// (0..$100/MWh -> 0..maxH m), colour from what the battery did that hour (charging teal, discharging orange,
// otherwise grey), the current hour solid, brighter and outlined in white (2 px). Hour marks at 0, 6, 12 and
// 18 h are returned as ground points (`ticks`) for screen-space labels; the bars carry no text of their own.
import { exactColor } from './tone';
import { contactTex } from './textures';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const COLORS = {
  dark: { charge: '#2ec7a6', discharge: '#eb6834', other: '#8b9198', tick: '#c3c8ce', outline: '#eef2f6' },
  light: { charge: '#2ec7a6', discharge: '#eb6834', other: '#8b9198', tick: '#4d535c', outline: '#1a1a1a' },
};

export function buildPriceBars(THREE, { prices, net, origin = [0, 0], dir = [1, 0], pitch = 2.2, depth = 1.1, maxPrice = 100, maxH = 14, theme = 'dark', threshold = 5 }) {
  const group = new THREE.Group(); group.name = 'priceBars';
  const n = prices.length, w = pitch * 0.62;
  const ang = Math.atan2(-dir[1], dir[0]);
  const at = (i) => [origin[0] + dir[0] * pitch * (i - (n - 1) / 2), origin[1] + dir[1] * pitch * (i - (n - 1) / 2)];
  const kind = (i) => (net[i] < -threshold ? 'charge' : net[i] > threshold ? 'discharge' : 'other');

  // one merged mesh, RGBA vertex colours: shade by face so the bars read as solids without lights
  const pos = [], nor = [], idx = [];
  const tops = [];
  for (let i = 0; i < n; i++) {
    const h = Math.max(0.25, (Math.min(prices[i], maxPrice) / maxPrice) * maxH);
    const g = new THREE.BoxGeometry(w, h, depth);
    g.rotateY(ang); const [x, z] = at(i); g.translate(x, h / 2, z);
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    for (const k of g.index.array) idx.push(base + k);
    g.dispose();
    tops.push(new THREE.Vector3(x, h, z));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 4), 4));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const bars = new THREE.Mesh(geo, mat); bars.renderOrder = 5; bars.userData.overlay = true;
  group.add(bars);

  // current-hour outline, 2 px
  const outlineMat = new LineMaterial({ color: 0xffffff, linewidth: 2, worldUnits: false, transparent: true, opacity: 1, depthWrite: false, depthTest: false });
  outlineMat.resolution.set(1600, 900);
  const outlineGeo = new LineSegmentsGeometry();
  const outline = new LineSegments2(outlineGeo, outlineMat); outline.userData.overlay = true; outline.renderOrder = 6; outline.frustumCulled = false;
  group.add(outline);

  // ground: baseline, ticks, hour decals, a soft contact strip
  const tickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
  const lineLen = pitch * n;
  const baseline = new THREE.Mesh(new THREE.PlaneGeometry(lineLen, 0.09), tickMat);
  baseline.rotation.set(-Math.PI / 2, 0, ang); const tick0 = at((n - 1) / 2);
  // offset toward the viewer side (perpendicular to dir, rotated -90 deg)
  const perp = [-dir[1], dir[0]];
  baseline.position.set(tick0[0] + perp[0] * (depth / 2 + 0.35), 0.03, tick0[1] + perp[1] * (depth / 2 + 0.35));
  baseline.userData.overlay = true; group.add(baseline);
  const ticks = [];
  for (const hr of [0, 6, 12, 18]) {
    const [x, z] = at(hr);
    ticks.push({ hour: hr, at: new THREE.Vector3(x + perp[0] * (depth / 2 + 0.35), 0.03, z + perp[1] * (depth / 2 + 0.35)) });
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.9), tickMat);
    t.rotation.set(-Math.PI / 2, 0, ang); t.position.set(x + perp[0] * (depth / 2 + 0.75), 0.03, z + perp[1] * (depth / 2 + 0.75));
    t.userData.overlay = true; group.add(t);
  }
  const keyAnchor = (() => { const [x, z] = at(0); return new THREE.Vector3(x - dir[0] * pitch, maxH, z - dir[1] * pitch); })();
  const shadowTex = contactTex(THREE, { inset: 0.8, round: 0.3, blur: 0.08 });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(lineLen + 1.5, depth + 1.6), new THREE.MeshBasicMaterial({ color: 0, alphaMap: shadowTex, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.set(-Math.PI / 2, 0, ang); shadow.position.set(tick0[0], 0.02, tick0[1]); shadow.userData.noAO = true;
  group.add(shadow);

  let hour = 0, th = theme;
  const anchor = new THREE.Vector3();
  function paint() {
    const C = COLORS[th === 'light' ? 'light' : 'dark'];
    const col = geo.attributes.color.array, nrm = geo.attributes.normal.array;
    const per = 24; // vertices per box
    for (let i = 0; i < n; i++) {
      const k = kind(i), cur = i === hour;
      const c = exactColor(THREE, C[k]);
      if (cur) c.multiplyScalar(th === 'light' ? 1.0 : 1.12);
      const a = cur ? 1.0 : k === 'other' ? 0.5 : 0.78;
      for (let v = 0; v < per; v++) {
        const j = i * per + v, ny = nrm[j * 3 + 1];
        const nx = Math.abs(nrm[j * 3] * dir[0] + nrm[j * 3 + 2] * dir[1]);
        const shade = ny > 0.5 ? 1.12 : ny < -0.5 ? 0.6 : nx > 0.5 ? 0.78 : 0.95;
        col.set([c.r * shade, c.g * shade, c.b * shade, a], j * 4);
      }
    }
    geo.attributes.color.needsUpdate = true;
    const h = tops[hour].y, [x, z] = at(hour);
    const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.08, h + 0.04, depth + 0.08));
    e.rotateY(ang); e.translate(x, (h + 0.04) / 2, z);
    outlineGeo.setPositions(e.attributes.position.array); e.dispose();
    outline.computeLineDistances();
    outlineMat.color.copy(exactColor(THREE, C.outline));
    tickMat.color.copy(exactColor(THREE, C.tick));
    anchor.set(x, h, z);
  }
  paint();
  return {
    group, tops, anchor, ticks, keyAnchor,
    setResolution(w2, h2) { outlineMat.resolution.set(w2, h2); },
    setHour(h) { hour = Math.max(0, Math.min(n - 1, Math.round(h))); paint(); },
    setTheme(t) { th = t; paint(); },
    setVisible(v) { group.visible = !!v; },
    kind,
  };
}
