// @ts-nocheck
// Ported from landing-3d/live/kit/materials.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// One material registry per site, recoloured in place by setTheme(). Values are sRGB hex; three converts
// them to the linear working space. Physical paint carries a light clearcoat; metals are metallic with a
// mottled roughness map so they read as galvanised steel rather than paint.
import { roughnessTex, paintTex, calicheTex, gravelTex, chainTex } from './textures';

export const PALETTE = {
  dark: {
    paint: '#e8ebee', cool: '#dfe3e7', seam: '#3a4048', louvre: '#2a2f35', grille: '#24282d', galv: '#8a9097',
    dark: '#1f2328', plinth: '#b9bdc2', warn: '#e2a13a', warnWhite: '#eef0f2', ink: '#2a2f35', skid: '#2c333b', skidFrame: '#23292f',
    xfmr: '#6d757c', steel: '#9aa2aa', polymer: '#4a4f55', trench: '#1e2329', pad: '#aea793', gravel: '#837a6b',
    yard: '#8d877c', yardDark: '#6b6458', fence: '#7d848c', rack: '#2b3138', module: '#2b3f5c', moduleEnd: '#223349', copper: '#c8783c',
    cell: '#3c5f8f', cellTop: '#c9ced4', fire: '#b8423a', bms: '#2f363e', floor: '#3a4048', figure: '#6c737c',
    pants: '#474e57', glove: '#9a8160', vest: '#eb6834', hat: '#eef0ee', skin: '#9a7861', boots: '#2b2723', hazard: '#eb6834', tray: '#9aa1a8',
    truck: '#eceef0', glass: '#1a1f25', tyre: '#1b1e22', rim: '#a3aab1', house: '#e1e4e7', roof: '#9aa0a7',
    conductor: '#5d646b', concrete: '#a9aeb4', duct: '#d6dadf', teal: '#2ec7a6', orange: '#eb6834',
  },
  light: {
    paint: '#e8ebee', cool: '#dfe3e7', seam: '#4a515a', louvre: '#3a4047', grille: '#343a41', galv: '#959ba2',
    dark: '#2c3238', plinth: '#c6cacf', warn: '#e2a13a', warnWhite: '#f4f5f6', ink: '#30363d', skid: '#3d454e', skidFrame: '#333a42',
    xfmr: '#7a828a', steel: '#a3abb3', polymer: '#5a6067', trench: '#3a4048', pad: '#d2c8b0', gravel: '#aaa08c',
    yard: '#b0aa9e', yardDark: '#8c8578', fence: '#868d95', rack: '#3b424b', module: '#34496a', moduleEnd: '#2c3e57', copper: '#c8783c',
    cell: '#46699a', cellTop: '#d3d8dd', fire: '#bf4a40', bms: '#3f464f', floor: '#4a515a', figure: '#737a84',
    pants: '#525963', glove: '#a2896a', vest: '#eb6834', hat: '#f4f5f3', skin: '#a07e66', boots: '#34302b', hazard: '#eb6834', tray: '#a3aab1',
    truck: '#f1f2f4', glass: '#252b32', tyre: '#262a2f', rim: '#aab1b8', house: '#e6e8eb', roof: '#a7adb4',
    conductor: '#6a7178', concrete: '#b8bcc1', duct: '#dcdfe3', teal: '#2ec7a6', orange: '#eb6834',
  },
};

// Detail at distance. A part smaller than a pixel drawn as geometry flickers as the camera drifts: the multisampled
// coverage of a 16 mm door seam, a hinge or a bevel's highlight jumps between samples from frame to frame. Patched
// materials shade such parts with the normal of the panel they sit on (the vertex attribute aBase, geo.ts) and give
// the small hardware the panel's colour, by how many metres one pixel spans there: unchanged up to FAR.x m a pixel
// (the enclosure at 1a is about 0.007), fully flattened from FAR.y (about 0.08 at chapter 2, 0.12 at chapter 3).
// The detail uniform's x is the pixel's size per metre of depth, set by the scene from its camera (0 turns it off).
const FAR = [0.014, 0.04];
const FAR_VERT = /* glsl */`
  vec3 baseN = dot( aBase.xyz, aBase.xyz ) > 0.25 ? aBase.xyz : objectNormal;
  #ifdef USE_INSTANCING
    baseN /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
    baseN = im * baseN;
  #endif
  vBaseN = normalMatrix * baseN;
  vFade = aBase.w;`;

export function createMaterials(THREE, theme = 'dark') {
  const pal = () => PALETTE[theme === 'light' ? 'light' : 'dark'];
  const detail = { value: new THREE.Vector4(0, FAR[0], FAR[1], 0) }, fadeTo = { value: new THREE.Color() };
  /** Patch a standard or physical material for detail at distance (see FAR); every mesh drawn with it must carry
   *  aBase (the builder's do; site.ts gives the others their own normals). */
  const farDetail = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetail = detail; sh.uniforms.uFadeTo = fadeTo;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aBase;\nvarying vec3 vBaseN;\nvarying float vFade;')
        .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>${FAR_VERT}`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uDetail;\nuniform vec3 uFadeTo;\nvarying vec3 vBaseN;\nvarying float vFade;')
        .replace('#include <color_fragment>', `#include <color_fragment>
  float detailK = smoothstep( uDetail.y, uDetail.z, vViewPosition.z * uDetail.x );
  float detailC = detailK * vFade;
  diffuseColor.rgb = mix( diffuseColor.rgb, uFadeTo, detailC );`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = mix( metalnessFactor, 0.0, detailC );
  roughnessFactor = mix( roughnessFactor, 0.5, detailC );`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize( mix( normal, normalize( vBaseN ) * faceDirection, detailK ) );`)
        .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
  #ifdef USE_CLEARCOAT
    clearcoatNormal = normalize( mix( clearcoatNormal, normalize( vBaseN ) * faceDirection, detailK ) );
  #endif`);
    };
    mat.customProgramCacheKey = () => 'kit-far-detail';
    mat.userData.farDetail = true;
    return mat;
  };
  /** Thin rods at distance (the fence's posts, rails and wires, 1 to 9 cm across): a rod narrower than a pixel lands
   *  on a different handful of multisample points every frame as the camera drifts, so it twinkles. Past FAR.x m a
   *  pixel they swell along their normals to about 1.2 px across (the 3 cm posts gain least), which holds their
   *  coverage steady; the shadow pass keeps their true size. */
  const thinAtDistance = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetail = detail;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uDetail;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  float thinFoot = - ( modelViewMatrix * vec4( transformed, 1.0 ) ).z * uDetail.x;
  transformed += objectNormal * max( 0.0, 0.6 * thinFoot - 0.03 ) * smoothstep( uDetail.y, uDetail.z, thinFoot );`);
    };
    mat.customProgramCacheKey = () => 'kit-thin-at-distance';
    return mat;
  };
  /** The same flattening for the ambient-occlusion pass, which draws the scene with one MeshNormalMaterial: a part
   *  too small to resolve flickers in the occlusion as it does in the colour. */
  const farNormals = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetail = detail;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aBase;\nvarying vec3 vBaseN;\nvarying float vFade;\nvarying float vFarZ;')
        .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>${FAR_VERT}`)
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vFarZ = - mvPosition.z;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec4 uDetail;\nvarying vec3 vBaseN;\nvarying float vFarZ;\nvoid main() {')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize( mix( normal, normalize( vBaseN ) * faceDirection, smoothstep( uDetail.y, uDetail.z, vFarZ * uDetail.x ) ) );`);
    };
    mat.customProgramCacheKey = () => 'kit-far-normals';
    return mat;
  };
  const rough = roughnessTex(THREE, { lo: 0.72, hi: 1.0, metres: 1.4 });
  const roughMetal = roughnessTex(THREE, { lo: 0.6, hi: 1.0, metres: 0.6, seed: 17 });
  const paintMap = paintTex(THREE, { heightM: 3.2, widthM: 2.3 });
  const pad = calicheTex(THREE, { metres: 9 });
  const gravel = gravelTex(THREE, { metres: 2.2 });
  const chain = chainTex(THREE);

  const std = (o) => new THREE.MeshStandardMaterial({ roughnessMap: rough, ...o });
  const phys = (o) => new THREE.MeshPhysicalMaterial({ roughnessMap: rough, ...o });
  const metal = (o) => new THREE.MeshStandardMaterial({ roughnessMap: roughMetal, metalness: 0.82, roughness: 0.42, ...o });

  const m = {
    paint: phys({ map: paintMap, roughness: 0.5, clearcoat: 0.22, clearcoatRoughness: 0.32 }),
    cool: phys({ map: paintMap, roughness: 0.52, clearcoat: 0.18, clearcoatRoughness: 0.35 }),
    house: phys({ map: paintMap, roughness: 0.6, clearcoat: 0.1, clearcoatRoughness: 0.4 }),
    truck: phys({ roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.12 }),
    seam: std({ roughness: 0.75 }),
    louvre: std({ roughness: 0.62, metalness: 0.15 }),
    grille: metal({ metalness: 0.55, roughness: 0.5 }),
    galv: metal({ metalness: 0.8, roughness: 0.4 }),
    steel: metal({ metalness: 0.85, roughness: 0.36 }),
    rim: metal({ metalness: 0.75, roughness: 0.3 }),
    conductor: metal({ metalness: 0.7, roughness: 0.45 }),
    copper: metal({ metalness: 0.9, roughness: 0.34 }),
    fence: metal({ metalness: 0.6, roughness: 0.5 }),
    dark: std({ roughness: 0.68 }),
    plinth: std({ roughness: 0.92 }),
    concrete: std({ roughness: 0.92 }),
    // labels stuck on a surface (placards, plates, tape): a depth offset in the draw order of their layers (plate,
    // then header, then ink) on top of the millimetres they stand proud, so they hold their order where the depth
    // buffer's steps are coarser than that (a few hundred metres off); units only on the plate, which also wraps the
    // worker's curved vest, where a slope term would let it show through an arm
    warn: std({ roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    warnWhite: std({ roughness: 0.45, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -2 }),
    ink: std({ roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -6 }),
    skid: phys({ roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.4 }),
    skidFrame: std({ roughness: 0.6, metalness: 0.3 }),
    xfmr: phys({ roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    polymer: std({ roughness: 0.55 }),
    trench: std({ roughness: 0.85 }),
    pad: std({ map: pad, roughness: 0.95 }),
    gravel: std({ map: gravel, roughness: 1.0 }),
    yard: std({ map: gravel, roughness: 1.0 }),
    yardDark: std({ map: gravel, roughness: 1.0 }),
    rack: std({ roughness: 0.55, metalness: 0.35 }),
    module: phys({ roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.3 }),
    moduleEnd: std({ roughness: 0.55 }),
    cell: phys({ roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
    cellTop: std({ roughness: 0.5 }),
    fire: phys({ roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.3 }),
    bms: std({ roughness: 0.55 }),
    floor: std({ roughness: 0.7, metalness: 0.3 }),
    figure: std({ roughness: 0.82 }),
    pants: std({ roughness: 0.86 }),
    glove: std({ roughness: 0.78 }),
    vest: std({ roughness: 0.6 }),
    hat: phys({ roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
    skin: std({ roughness: 0.7 }),
    boots: std({ roughness: 0.8 }),
    hazard: std({ roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    tray: metal({ metalness: 0.75, roughness: 0.42 }),
    glass: new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0.6 }),
    tyre: std({ roughness: 0.9 }),
    roof: std({ roughness: 0.7, metalness: 0.2 }),
    duct: std({ roughness: 0.55, metalness: 0.2 }),
    lamp: new THREE.MeshStandardMaterial({ roughness: 0.3, emissiveIntensity: 2.4 }),
    led: new THREE.MeshStandardMaterial({ roughness: 0.3, emissiveIntensity: 2.0 }),
    screen: new THREE.MeshStandardMaterial({ roughness: 0.2, emissiveIntensity: 1.3 }),
    lampOrange: new THREE.MeshStandardMaterial({ roughness: 0.3, emissiveIntensity: 2.2 }),
    mesh: new THREE.MeshStandardMaterial({ alphaMap: chain, transparent: true, opacity: 0.85, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false }),
  };
  m.mesh.userData.noAO = true;
  // the enclosures', the skids' and the substation's materials (all their meshes come from the builder)
  for (const k of ['paint', 'cool', 'house', 'seam', 'louvre', 'grille', 'galv', 'steel', 'dark', 'plinth', 'concrete', 'warn', 'warnWhite',
    'ink', 'hazard', 'skid', 'skidFrame', 'xfmr', 'polymer', 'copper', 'rack', 'module', 'moduleEnd', 'fire', 'bms', 'floor', 'roof', 'duct', 'lamp', 'screen', 'led']) farDetail(m[k]);
  thinAtDistance(m.fence);

  const keyOf = { lamp: 'teal', led: 'teal', screen: 'teal', lampOrange: 'orange', mesh: 'fence', module: 'module' };
  function setTheme(t) {
    theme = t;
    const p = pal();
    fadeTo.value.set(p.paint);
    for (const [k, mat] of Object.entries(m)) {
      const hex = p[k] ?? p[keyOf[k]];
      if (!hex) continue;
      mat.color.set(hex);
      if (k === 'lamp' || k === 'led' || k === 'screen' || k === 'lampOrange') {
        mat.color.set(p.dark); mat.emissive.set(hex);
      }
    }
  }
  setTheme(theme);
  return { m, setTheme, palette: () => pal(), textures: { rough, roughMetal, paintMap, pad, gravel, chain }, detail, farDetail, farNormals };
}

/** Contact-shadow material (unlit black, alpha from a soft texture). */
export function contactMaterial(THREE, tex, opacity = 0.55) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mat.userData.noAO = true;
  return mat;
}
