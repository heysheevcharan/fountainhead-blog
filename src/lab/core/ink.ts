import * as THREE from 'three';
import type { MaterialFactory, MaterialRole } from './materials';

/* ================================================================== */
/* Ink pipeline. Objects don't render colour — they render how much     */
/* black ink (G) and orange ink (R) the printer should lay down, plus a  */
/* per-material id (B) used to draw outlines. A post pass then "prints"  */
/* that as a two-colour risograph: halftone screens at different         */
/* angles, slight misregistration, paper grain.                          */
/* ================================================================== */

export interface Ink {
  /** black ink density 0..1 */
  k?: number;
  /** orange ink density 0..1 */
  o?: number;
  /** how much shading adds black in the shadows */
  shade?: number;
  /** optional texture: dark pixels add black ink, red-ish pixels add orange */
  map?: THREE.Texture | null;
  /** draw outlines around this material */
  outline?: boolean;
}

let nextId = 1;
const idFor = () => {
  nextId = (nextId * 37 + 11) % 251;
  return (nextId + 1) / 255;
};

export function inkMaterial(ink: Ink = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uK: { value: ink.k ?? 0.15 },
      uO: { value: ink.o ?? 0 },
      uShade: { value: ink.shade ?? 0.35 },
      // 1.0 is reserved for "never outline" (no line against anything)
      uId: { value: ink.outline === false ? 1 : idFor() },
      uMap: { value: ink.map ?? null },
      uHasMap: { value: ink.map ? 1 : 0 },
      uLight: { value: new THREE.Vector3(0.45, 0.8, 0.55).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec2 vUv;
      void main() {
        vec3 transformed = position;
        vec3 n = normal;
        #ifdef USE_INSTANCING
          transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
          n = mat3(instanceMatrix) * n;
        #endif
        vUv = uv;
        vN = normalize(normalMatrix * n);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK, uO, uShade, uId, uHasMap;
      uniform sampler2D uMap;
      uniform vec3 uLight;
      varying vec3 vN;
      varying vec2 vUv;
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        float diff = clamp(dot(n, normalize(uLight)), 0.0, 1.0);
        float k = uK + (1.0 - diff) * uShade * (0.35 + uK);
        float o = uO * (0.82 + 0.18 * diff);
        if (uHasMap > 0.5) {
          vec4 t = texture2D(uMap, vUv);
          float orange = clamp((t.r - t.b) * 1.6, 0.0, 1.0) * t.a;
          float dark = clamp(1.0 - (t.r + t.g + t.b) / 3.0, 0.0, 1.0) * t.a * (1.0 - orange);
          k = max(k, dark);
          o = max(o, orange);
        }
        gl_FragColor = vec4(clamp(o, 0.0, 1.0), clamp(k, 0.0, 1.0), uId, 1.0);
      }`,
    side: THREE.FrontSide,
  });
  mat.userData.ink = true;
  return mat;
}

/** Cached ink materials by (k, o, shade). */
export function inkMats() {
  const cache = new Map<string, THREE.ShaderMaterial>();
  return (k: number, o = 0, shade = 0.35, outline = true) => {
    const key = `${k.toFixed(3)}:${o.toFixed(3)}:${shade}:${outline}`;
    let m = cache.get(key);
    if (!m) {
      m = inkMaterial({ k, o, shade, outline });
      cache.set(key, m);
    }
    return m;
  };
}

const lum = (c: THREE.ColorRepresentation) => {
  const col = new THREE.Color(c);
  return 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b; // linear
};

/**
 * Character material factory for the riso look.
 * hero → printed in orange (skin + shirt), beard/eyes in black.
 * clone → all black-ink greys.
 */
export function inkCharacterMaterials(mode: 'hero' | 'clone' | 'convert' | 'ink'): MaterialFactory {
  const M = inkMats();
  return (role: MaterialRole, color: THREE.ColorRepresentation) => {
    const L = lum(color);
    if (role === 'eyeHi') return M(0, 0, 0, false);
    if (role === 'eye') return M(1, 0, 0);
    if (mode === 'ink') {
      // pen drawing: paper-white with outlines; darks are hatched, the accent is orange
      if (role === 'beard') return M(0.92, 0, 0.15);
      if (role === 'skin' || role === 'head') return M(0.03, 0, 0.3);
      if (role === 'lips') return M(0.45, 0, 0.1);
      if (role === 'accent') return M(0, 1, 0.1);
      if (role === 'cloth') return L < 0.03 ? M(0.82, 0, 0.2) : M(0.2, 0, 0.35);
      if (role === 'denim') return M(0.52, 0, 0.3);
      if (role === 'leather') return M(0.85, 0, 0.2);
      if (role === 'shoe' || role === 'sole') return M(0.0, 0, 0.25);
      return M(0.1, 0, 0.3);
    }
    if (mode === 'clone') {
      return M(Math.min(0.85, (1 - Math.pow(L, 0.45)) * 0.62), 0, 0.28);
    }
    // hero / convert
    if (role === 'beard') return M(0.9, 0, 0.2);
    if (role === 'skin' || role === 'head') return M(0.02, 0.3, 0.25);
    if (role === 'lips') return M(0.2, 0.6, 0.2);
    if (role === 'accent') return M(0, 1, 0.2);
    if (role === 'cloth') return L < 0.03 ? M(0.85, 0, 0.25) : M(0.06, 0.78, 0.3);
    if (role === 'denim') return M(0.62, 0, 0.3);
    if (role === 'shoe' || role === 'sole') return M(0.02, 0, 0.3);
    if (role === 'leather') return M(0.85, 0, 0.2);
    return M(Math.min(0.9, (1 - Math.pow(L, 0.45)) * 0.7), 0, 0.3);
  };
}

/* ------------------------------------------------------------------ */
/* the printer                                                          */
/* ------------------------------------------------------------------ */
export interface RisoOptions {
  paper?: string;
  black?: string;
  orange?: string;
  /** halftone cell size in CSS px */
  cell?: number;
  misregister?: [number, number];
  /** fade ink out on the left (room for overlay copy), 0..1 of width */
  fadeLeft?: number;
  /** line weight in CSS px */
  line?: number;
  /** pen mode: hatching instead of dots for black ink */
  hatch?: boolean;
}

const srgb = (hex: string) => {
  const c = new THREE.Color();
  c.setStyle(hex, THREE.SRGBColorSpace);
  // keep the raw sRGB numbers: the print shader writes straight to the canvas
  const v = new THREE.Color(hex);
  return new THREE.Vector3(...v.convertLinearToSRGB().toArray());
};

export class RisoPrinter {
  readonly target: THREE.WebGLRenderTarget;
  readonly material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private orthoScene = new THREE.Scene();
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(
    private renderer: THREE.WebGLRenderer,
    opts: RisoOptions = {},
  ) {
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, depthBuffer: true, samples: 0 });
    this.target.texture.minFilter = THREE.NearestFilter;
    this.target.texture.magFilter = THREE.NearestFilter;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tInk: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(4, 4) },
        uDpr: { value: 1 },
        uPaper: { value: srgb(opts.paper ?? '#faf8f5') },
        uBlack: { value: srgb(opts.black ?? '#2a2522') },
        uOrange: { value: srgb(opts.orange ?? '#ff3c00') },
        uCell: { value: opts.cell ?? 4.2 },
        uMis: { value: new THREE.Vector2(...(opts.misregister ?? [1.4, -1.0])) },
        uFadeLeft: { value: opts.fadeLeft ?? 0 },
        uFadeTop: { value: 0 },
        uLine: { value: opts.line ?? 1.15 },
        uHatch: { value: opts.hatch ? 1 : 0 },
        uTime: { value: 0 },
        uDark: { value: 0 },
      },
      vertexShader: /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tInk;
        uniform vec2 uRes, uMis;
        uniform float uDpr, uCell, uFadeLeft, uFadeTop, uLine, uHatch, uTime, uDark;
        uniform vec3 uPaper, uBlack, uOrange;
        float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p,p.yx+19.19); return fract((p.x+p.y)*p.x); }
        float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float dots(vec2 px, float d, float ang, float cell){
          float c = cos(ang), s = sin(ang);
          vec2 p = mat2(c,-s,s,c) * px / cell;
          vec2 f = fract(p) - 0.5;
          float r = sqrt(clamp(d,0.0,1.0)) * 0.74;
          float dist = length(f);
          float aa = 0.7 / cell;
          return (1.0 - smoothstep(r - aa, r + aa, dist)) * step(0.004, d);
        }
        float hatch(vec2 px, float d, float cell){
          // up to three directions of pen hatching as density rises
          float h = 0.0;
          float w = 0.16 + 0.12 * d;
          float l1 = abs(fract((px.x + px.y) / cell) - 0.5);
          h = max(h, step(0.18, d) * (1.0 - smoothstep(w, w + 0.12, l1)));
          float l2 = abs(fract((px.x - px.y) / cell) - 0.5);
          h = max(h, step(0.5, d) * (1.0 - smoothstep(w, w + 0.12, l2)));
          float l3 = abs(fract(px.x / (cell * 0.7)) - 0.5);
          h = max(h, step(0.78, d) * (1.0 - smoothstep(w, w + 0.12, l3)));
          return h;
        }
        vec4 ink(vec2 px){ return texture2D(tInk, px / uRes); }
        void main(){
          vec2 px = gl_FragCoord.xy;
          vec4 a = ink(px);
          vec4 b = ink(px + uMis * uDpr);
          float k = a.g;
          float o = b.r;
          // outlines: id changes between neighbours
          float lw = uLine * uDpr;
          float idc = a.b;
          float e = 0.0;
          vec2 offs[4];
          offs[0] = vec2(lw, 0.0); offs[1] = vec2(-lw, 0.0); offs[2] = vec2(0.0, lw); offs[3] = vec2(0.0, -lw);
          for (int i = 0; i < 4; i++) {
            float idn = ink(px + offs[i]).b;
            if (idn < 0.999 && idc < 0.999 && abs(idn - idc) > 0.002) e = 1.0;
          }
          float cell = uCell * uDpr;
          float grain = vnoise(px * 0.35 / uDpr) * 0.5 + vnoise(px * 1.7 / uDpr) * 0.5;
          float kd = uHatch > 0.5 ? hatch(px, k, cell * 1.25) : dots(px, k, 0.785, cell);
          kd = mix(kd, 1.0, smoothstep(0.82, 0.97, k));
          float od = dots(px + 1.7, o, 0.26, cell);
          od = mix(od, 1.0, smoothstep(0.78, 0.95, o));
          // fade-out margin for overlay copy
          float fade = uFadeLeft > 0.0 ? smoothstep(uFadeLeft * 0.55, uFadeLeft, px.x / uRes.x) : 1.0;
          // fade ink out toward the top edge (narrow screens put the copy up there)
          if (uFadeTop > 0.0) fade *= 1.0 - smoothstep(1.0 - uFadeTop, 1.0 - uFadeTop * 0.6, px.y / uRes.y);
          kd *= fade; od *= fade; e *= fade;
          // ink mottling
          od *= 0.86 + 0.14 * grain;
          kd *= 0.9 + 0.1 * grain;
          vec3 col = uPaper;
          col = mix(col, uOrange * mix(vec3(1.0), uPaper, 0.0), od * 0.94);
          col = mix(col, uBlack, max(kd * 0.93, e * 0.95));
          // overprint: black over orange darkens slightly
          col -= od * kd * 0.06 * (1.0 - uDark);
          // paper fibre
          col += (hash(px) - 0.5) * 0.035;
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.quad.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad.frustumCulled = false;
    this.orthoScene.add(this.quad);
  }

  setColors(paper: string, black: string, orange: string, dark = false) {
    this.material.uniforms.uPaper.value = srgb(paper);
    this.material.uniforms.uBlack.value = srgb(black);
    this.material.uniforms.uOrange.value = srgb(orange);
    this.material.uniforms.uDark.value = dark ? 1 : 0;
  }

  resize(w: number, h: number, dpr: number) {
    const W = Math.max(1, Math.floor(w * dpr));
    const H = Math.max(1, Math.floor(h * dpr));
    this.target.setSize(W, H);
    this.material.uniforms.uRes.value.set(W, H);
    this.material.uniforms.uDpr.value = dpr;
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time = 0) {
    const r = this.renderer;
    const prevClear = r.getClearAlpha();
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, prevClear);
    this.material.uniforms.uTime.value = time;
    r.render(this.orthoScene, this.ortho);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}

/* ================================================================== */
/* SeparationPrinter — a "print skin" for any normally-lit scene.        */
/* The scene renders with its real lights + shadows into a buffer; this  */
/* pass separates it into two inks (black from luminance, orange from    */
/* orange/warm hues), adds depth outlines and prints it as a riso.        */
/* ================================================================== */
export class SeparationPrinter {
  readonly target: THREE.WebGLRenderTarget;
  readonly material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private orthoScene = new THREE.Scene();
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(
    private renderer: THREE.WebGLRenderer,
    opts: RisoOptions & { exposure?: number } = {},
  ) {
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.target.depthTexture = new THREE.DepthTexture(4, 4);
    this.target.depthTexture.type = THREE.UnsignedIntType;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        uNear: { value: 0.1 },
        uFar: { value: 200 },
        uRes: { value: new THREE.Vector2(4, 4) },
        uDpr: { value: 1 },
        uPaper: { value: srgb(opts.paper ?? '#faf8f5') },
        uBlack: { value: srgb(opts.black ?? '#2a2522') },
        uOrange: { value: srgb(opts.orange ?? '#ff3c00') },
        uCell: { value: opts.cell ?? 3.6 },
        uMis: { value: new THREE.Vector2(...(opts.misregister ?? [1.1, -0.8])) },
        uLine: { value: opts.line ?? 1.0 },
        uExposure: { value: opts.exposure ?? 1.0 },
        uDark: { value: 0 },
      },
      vertexShader: /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tColor, tDepth;
        uniform float uNear, uFar, uDpr, uCell, uLine, uExposure, uDark;
        uniform vec2 uRes, uMis;
        uniform vec3 uPaper, uBlack, uOrange;
        float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p,p.yx+19.19); return fract((p.x+p.y)*p.x); }
        float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float dots(vec2 px, float d, float ang, float cell){
          float c = cos(ang), s = sin(ang);
          vec2 p = mat2(c,-s,s,c) * px / cell;
          vec2 f = fract(p) - 0.5;
          float r = sqrt(clamp(d,0.0,1.0)) * 0.74;
          float aa = 0.7 / cell;
          return (1.0 - smoothstep(r - aa, r + aa, length(f))) * step(0.004, d);
        }
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        float linDepth(vec2 uv){ float z = texture2D(tDepth, uv).x; float ndc = z * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear)); }
        vec2 inks(vec2 uv, out float alpha){
          vec4 c = texture2D(tColor, uv);
          alpha = c.a;
          vec3 s = toSRGB(aces(c.rgb * uExposure));
          float mx = max(s.r, max(s.g, s.b));
          float mn = min(s.r, min(s.g, s.b));
          float sat = (mx - mn) / (mx + 1e-4);
          float hue = 0.0;
          if (mx - mn > 1e-4) {
            if (mx == s.r) hue = mod((s.g - s.b) / (mx - mn), 6.0) / 6.0;
            else if (mx == s.g) hue = ((s.b - s.r) / (mx - mn) + 2.0) / 6.0;
            else hue = ((s.r - s.g) / (mx - mn) + 4.0) / 6.0;
          }
          float hd = abs(hue - 0.045); hd = min(hd, 1.0 - hd);
          float o = (1.0 - smoothstep(0.02, 0.075, hd)) * smoothstep(0.25, 0.7, sat) * smoothstep(0.15, 0.55, mx);
          float warm = clamp((s.r - s.b) * 2.0 - 0.15, 0.0, 1.0) * (1.0 - o) * smoothstep(0.25, 0.75, mx) * smoothstep(0.12, 0.35, sat);
          o = max(o, warm * 0.3);
          float lum = dot(s, vec3(0.299, 0.587, 0.114));
          float k = clamp((1.0 - lum) * 1.12 - 0.12, 0.0, 1.0);
          k *= 1.0 - o * 0.6;
          // foliage (green hues) prints as a lighter screen so trees don't turn into storm clouds
          float gd = abs(hue - 0.27);
          float green = (1.0 - smoothstep(0.05, 0.12, gd)) * smoothstep(0.12, 0.3, sat);
          k *= 1.0 - green * 0.45;
          return vec2(k, o) * alpha;
        }
        void main(){
          vec2 px = gl_FragCoord.xy;
          vec2 uv = px / uRes;
          float a1, a2;
          vec2 ia = inks(uv, a1);
          vec2 ib = inks(uv + uMis * uDpr / uRes, a2);
          float k = ia.x;
          float o = ib.y;
          // depth outlines
          float d = linDepth(uv);
          float lw = uLine * uDpr;
          float e = 0.0;
          for (int i = 0; i < 4; i++) {
            vec2 off = i == 0 ? vec2(lw, 0.0) : i == 1 ? vec2(-lw, 0.0) : i == 2 ? vec2(0.0, lw) : vec2(0.0, -lw);
            float dn = linDepth((px + off) / uRes);
            if (abs(dn - d) > 0.035 * min(d, dn) + 0.02) e = 1.0;
          }
          float cell = uCell * uDpr;
          float grain = vnoise(px * 0.35 / uDpr) * 0.5 + vnoise(px * 1.7 / uDpr) * 0.5;
          float kd = dots(px, k, 0.785, cell);
          kd = mix(kd, 1.0, smoothstep(0.8, 0.96, k));
          float od = dots(px + 1.7, o, 0.26, cell);
          od = mix(od, 1.0, smoothstep(0.75, 0.93, o));
          od *= 0.86 + 0.14 * grain;
          kd *= 0.9 + 0.1 * grain;
          vec3 col = uPaper;
          col = mix(col, uOrange, od * 0.94);
          col = mix(col, uBlack, max(kd * 0.93, e * 0.9));
          col -= od * kd * 0.06 * (1.0 - uDark);
          col += (hash(px) - 0.5) * 0.035;
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.quad.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad.frustumCulled = false;
    this.orthoScene.add(this.quad);
  }

  setColors(paper: string, black: string, orange: string, dark = false) {
    this.material.uniforms.uPaper.value = srgb(paper);
    this.material.uniforms.uBlack.value = srgb(black);
    this.material.uniforms.uOrange.value = srgb(orange);
    this.material.uniforms.uDark.value = dark ? 1 : 0;
  }

  resize(w: number, h: number, dpr: number) {
    const W = Math.max(1, Math.floor(w * dpr));
    const H = Math.max(1, Math.floor(h * dpr));
    this.target.setSize(W, H);
    this.material.uniforms.uRes.value.set(W, H);
    this.material.uniforms.uDpr.value = dpr;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const r = this.renderer;
    this.material.uniforms.uNear.value = camera.near;
    this.material.uniforms.uFar.value = camera.far;
    this.material.uniforms.uExposure.value = r.toneMappingExposure;
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, prevAlpha);
    r.render(this.orthoScene, this.ortho);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
