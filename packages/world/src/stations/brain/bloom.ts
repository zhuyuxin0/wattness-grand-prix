// The brain's glow: Living Brain's post chain after its scene (SPEC 1.2), as one pass placed just before the kit's
// output (the Neutral curve): a bright pass over the frame (luminance over the threshold), blurred down a five-level
// chain in UnrealBloom's shape and added back in linear light, then the vignette. The brain frames draw only the brain
// (a black backdrop, nothing lit), so the bright pass needs no selection layer. Shaped like the arcade's LampBloomPass.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const BRIGHT = /* glsl */`
uniform sampler2D tDiffuse; uniform float uThreshold; uniform float uKnee; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c.rgb * smoothstep(uThreshold, uThreshold + uKnee, l), 1.0);
}`;
const BLUR = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  c += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
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
// three's VignetteShader at darkness 1 is a multiply by 1 - dot(uv, uv), uv = (vUv - 0.5) x offset
const VIGNETTE = /* glsl */`
uniform float uOffset; uniform float uDarkness; varying vec2 vUv;
void main() {
  vec2 uv = (vUv - 0.5) * uOffset;
  gl_FragColor = vec4(vec3(max(0.0, 1.0 - uDarkness * dot(uv, uv))), 1.0);
}`;

export interface BloomOptions { strength?: number; radius?: number; threshold?: number; knee?: number; vignette?: { offset: number; darkness: number } | null }

export class BrainBloomPass extends Pass {
  private bright: THREE.WebGLRenderTarget;
  private a: THREE.WebGLRenderTarget[] = [];
  private b: THREE.WebGLRenderTarget[] = [];
  private brightMat: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;
  private copy: THREE.ShaderMaterial;
  private combine: THREE.ShaderMaterial;
  private vignette: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private black = new THREE.Color(0, 0, 0);
  /** The pass's settings, live. */
  readonly o: Required<Omit<BloomOptions, 'vignette'>> & { vignette: { offset: number; darkness: number } | null };

  constructor(w: number, h: number, o: BloomOptions = {}) {
    super();
    this.needsSwap = false;
    this.o = { strength: o.strength ?? 0.24, radius: o.radius ?? 0.11, threshold: o.threshold ?? 0.68, knee: o.knee ?? 0.01, vignette: o.vignette === undefined ? { offset: 1.2, darkness: 1 } : o.vignette };
    const opt = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    this.bright = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), opt);
    for (let i = 0; i < LEVELS; i++) {
      const s = 2 << i;
      this.a.push(new THREE.WebGLRenderTarget(Math.max(1, Math.floor(w / s)), Math.max(1, Math.floor(h / s)), opt));
      this.b.push(this.a[i]!.clone());
    }
    const mat = (frag: string, uniforms: Record<string, THREE.IUniform>, extra: Partial<THREE.ShaderMaterialParameters> = {}) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.brightMat = mat(BRIGHT, { tDiffuse: { value: null }, uThreshold: { value: this.o.threshold }, uKnee: { value: this.o.knee } });
    this.blur = mat(BLUR, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.copy = mat('uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }', { tDiffuse: { value: null } });
    this.combine = mat(COMBINE, { t0: { value: null }, t1: { value: null }, t2: { value: null }, t3: { value: null }, t4: { value: null }, uStrength: { value: this.o.strength }, uRadius: { value: this.o.radius } },
      { blending: THREE.AdditiveBlending, transparent: true });
    this.vignette = mat(VIGNETTE, { uOffset: { value: 1.2 }, uDarkness: { value: 1 } },
      { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, transparent: true });
    this.quad = new FullScreenQuad(this.copy);
  }

  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const rt0 = renderer.getRenderTarget(), ac = renderer.autoClear;
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(this.black, 1);
    // the bright pass, at half resolution
    this.brightMat.uniforms.tDiffuse!.value = readBuffer.texture;
    this.brightMat.uniforms.uThreshold!.value = this.o.threshold; this.brightMat.uniforms.uKnee!.value = this.o.knee;
    this.quad.material = this.brightMat;
    renderer.setRenderTarget(this.bright); this.quad.render(renderer);
    // down the chain, blurring at each level
    let input: THREE.Texture = this.bright.texture;
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
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    for (let i = 0; i < LEVELS; i++) this.combine.uniforms[`t${i}`]!.value = this.a[i]!.texture;
    this.combine.uniforms.uStrength!.value = this.o.strength; this.combine.uniforms.uRadius!.value = this.o.radius;
    if (this.o.strength > 0) { this.quad.material = this.combine; this.quad.render(renderer); }
    if (this.o.vignette && this.o.vignette.darkness > 0) {
      this.vignette.uniforms.uOffset!.value = this.o.vignette.offset; this.vignette.uniforms.uDarkness!.value = this.o.vignette.darkness;
      this.quad.material = this.vignette; this.quad.render(renderer);
    }
    renderer.autoClear = ac; renderer.setClearColor(cc, ca); renderer.setRenderTarget(rt0);
  }

  override setSize(w: number, h: number) {
    this.bright.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    for (let i = 0; i < LEVELS; i++) { const s = 2 << i; this.a[i]!.setSize(Math.max(1, Math.floor(w / s)), Math.max(1, Math.floor(h / s))); this.b[i]!.setSize(Math.max(1, Math.floor(w / s)), Math.max(1, Math.floor(h / s))); }
  }

  override dispose() {
    this.bright.dispose(); for (const t of [...this.a, ...this.b]) t.dispose();
    for (const m of [this.brightMat, this.blur, this.copy, this.combine, this.vignette]) m.dispose();
    this.quad.dispose();
  }
}
