// Selective bloom for the Arcade's lamps only: the parts on the BLOOM layer are drawn again, alone, into a
// half-resolution target, blurred down a five-level chain (UnrealBloom's shape: strength 0.9, radius 0.6, threshold 0)
// and added over the scene in linear light just before the Neutral curve. Nothing else blooms, so the data marks keep
// their exact colors. The lamps face the camera with nothing in front of them, so the pass draws them without the
// scene's depth.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const BLUR = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
  c += texture2D(tDiffuse, vUv + uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tDiffuse, vUv - uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tDiffuse, vUv + uDir * 3.2307692308) * 0.0702702703;
  c += texture2D(tDiffuse, vUv - uDir * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}`;
const LEVELS = 5;
const COMBINE = /* glsl */`
uniform sampler2D t0; uniform sampler2D t1; uniform sampler2D t2; uniform sampler2D t3; uniform sampler2D t4;
uniform float uStrength; uniform float uRadius; varying vec2 vUv;
float f(float k) { return mix(k, 1.2 - k, uRadius); }
void main() {
  vec3 c = f(1.0) * texture2D(t0, vUv).rgb + f(0.8) * texture2D(t1, vUv).rgb + f(0.6) * texture2D(t2, vUv).rgb
    + f(0.4) * texture2D(t3, vUv).rgb + f(0.2) * texture2D(t4, vUv).rgb;
  gl_FragColor = vec4(c * uStrength, 1.0);
}`;

export class LampBloomPass extends Pass {
  private src: THREE.WebGLRenderTarget;
  private a: THREE.WebGLRenderTarget[] = [];
  private b: THREE.WebGLRenderTarget[] = [];
  private blur: THREE.ShaderMaterial;
  private combine: THREE.ShaderMaterial;
  private copy: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private black = new THREE.Color(0, 0, 0);

  constructor(private scene: THREE.Scene, private camera: THREE.Camera, private layer: number, w: number, h: number, { strength = 0.9, radius = 0.6 } = {}) {
    super();
    this.needsSwap = false;
    const opt = { type: THREE.HalfFloatType, depthBuffer: true } as const;
    this.src = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), opt);
    for (let i = 0; i < LEVELS; i++) {
      const s = 2 << i;
      this.a.push(new THREE.WebGLRenderTarget(Math.max(1, Math.floor(w / s)), Math.max(1, Math.floor(h / s)), { type: THREE.HalfFloatType, depthBuffer: false }));
      this.b.push(this.a[i]!.clone());
    }
    this.blur = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLUR, uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.copy = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }', uniforms: { tDiffuse: { value: null } }, depthTest: false, depthWrite: false });
    this.combine = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: COMBINE,
      uniforms: { t0: { value: null }, t1: { value: null }, t2: { value: null }, t3: { value: null }, t4: { value: null }, uStrength: { value: strength }, uRadius: { value: radius } },
      blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.copy);
  }

  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const rt0 = renderer.getRenderTarget(), mask = this.camera.layers.mask, bg = this.scene.background, ac = renderer.autoClear;
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    // the lamps alone
    this.camera.layers.set(this.layer); this.scene.background = null;
    renderer.setRenderTarget(this.src); renderer.setClearColor(this.black, 1); renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
    this.camera.layers.mask = mask; this.scene.background = bg;
    // down the chain, blurring at each level
    let input: THREE.Texture = this.src.texture;
    for (let i = 0; i < LEVELS; i++) {
      const A = this.a[i]!, B = this.b[i]!;
      this.quad.material = this.copy; this.copy.uniforms.tDiffuse!.value = input;
      renderer.setRenderTarget(A); this.quad.render(renderer);
      this.quad.material = this.blur;
      const r = 1 + i * 0.35;
      this.blur.uniforms.tDiffuse!.value = A.texture; this.blur.uniforms.uDir!.value.set(r / A.width, 0);
      renderer.setRenderTarget(B); this.quad.render(renderer);
      this.blur.uniforms.tDiffuse!.value = B.texture; this.blur.uniforms.uDir!.value.set(0, r / A.height);
      renderer.setRenderTarget(A); this.quad.render(renderer);
      input = A.texture;
    }
    // added over the scene
    for (let i = 0; i < LEVELS; i++) this.combine.uniforms[`t${i}`]!.value = this.a[i]!.texture;
    this.quad.material = this.combine;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer); this.quad.render(renderer);
    renderer.autoClear = ac; renderer.setClearColor(cc, ca); renderer.setRenderTarget(rt0);
  }

  override setSize(w: number, h: number) {
    this.src.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    for (let i = 0; i < LEVELS; i++) { const s = 2 << i; this.a[i]!.setSize(Math.max(1, Math.floor(w / s)), Math.max(1, Math.floor(h / s))); this.b[i]!.setSize(Math.max(1, Math.floor(w / s)), Math.max(1, Math.floor(h / s))); }
  }

  override dispose() {
    this.src.dispose(); for (const t of [...this.a, ...this.b]) t.dispose();
    this.blur.dispose(); this.combine.dispose(); this.copy.dispose(); this.quad.dispose();
  }
}
