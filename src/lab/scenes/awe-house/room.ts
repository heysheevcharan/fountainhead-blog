import * as THREE from 'three';
import { canvasTexture, clamp, lerp, rng, smoothstep, TAU } from '../../core/util';
import type { MatFn } from '../../core/props';

/* ================================================================== */
/* The room, seen from inside: one long back wall and a floor that run   */
/* past every edge of the screen. Light comes from a window behind the   */
/* viewer (a projected "cookie" of panes + rain-tree leaves).            */
/* ================================================================== */
export const WALL_Z = -3.0;
export const ROOM = { x0: -14, x1: 14, z0: WALL_Z, z1: 10, h: 6, t: 0.2 };
/** window in the back wall (the bangalore view) */
export const WINDOW = { x0: 0.95, x1: 2.45, y0: 0.85, y1: 2.35 };

export const WALL_COLOR = '#f2e9dc';

function floorTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const r = rng(11);
    ctx.fillStyle = '#d9bf98';
    ctx.fillRect(0, 0, w, h);
    const rows = 12;
    const ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 300;
      while (x < w) {
        const len = 220 + r() * 260;
        const tone = 0.92 + r() * 0.12;
        ctx.fillStyle = `rgb(${Math.round(222 * tone)},${Math.round(198 * tone)},${Math.round(160 * tone)})`;
        ctx.fillRect(x, i * ph, len, ph);
        ctx.strokeStyle = 'rgba(120,85,50,0.07)';
        ctx.lineWidth = 1;
        for (let g = 0; g < 5; g++) {
          ctx.beginPath();
          const y = i * ph + r() * ph;
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.6, y + (r() - 0.5) * 6, x + len, y);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(70,45,25,0.28)';
        ctx.fillRect(x + len - 1.5, i * ph, 1.5, ph);
        x += len;
      }
      ctx.fillStyle = 'rgba(70,45,25,0.32)';
      ctx.fillRect(0, i * ph, w, 1.5);
    }
  });
}

/* ------------------------------------------------------------------ */
/* the view out of the back window: sky + skyline + rain                 */
/* ------------------------------------------------------------------ */
function skylineTexture() {
  return canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      const r = rng(5);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgb(255,0,0)';
      let x = 0;
      while (x < w) {
        const bw = 14 + r() * 30;
        const bh = 30 + r() * 70;
        ctx.fillRect(x, h - bh, bw, bh);
        x += bw + r() * 6;
      }
      ctx.fillStyle = 'rgb(0,255,0)';
      for (let i = 0; i < 9; i++) {
        const cx = r() * w;
        const cy = h - 25 - r() * 30;
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          ctx.ellipse(cx + (r() - 0.5) * 70, cy + (r() - 0.5) * 18, 26 + r() * 22, 14 + r() * 10, 0, 0, TAU);
          ctx.fill();
        }
      }
      ctx.fillRect(0, h - 22, w, 22);
    },
    { srgb: false },
  );
}

export function makeSkyCard() {
  const uniforms = {
    uTop: { value: new THREE.Color('#7fb2e5') },
    uBottom: { value: new THREE.Color('#dceaf5') },
    uFar: { value: new THREE.Color('#9fb6c8') },
    uNear: { value: new THREE.Color('#6f8f6a') },
    uSun: { value: new THREE.Vector3(0.3, 0.7, 0) },
    uSunColor: { value: new THREE.Color('#fff1dc') },
    uNight: { value: 0 },
    uRain: { value: 0 },
    uTime: { value: 0 },
    uSil: { value: skylineTexture() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uBottom, uFar, uNear, uSunColor; uniform vec3 uSun;
      uniform float uNight, uRain, uTime; uniform sampler2D uSil;
      varying vec2 vUv;
      float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      void main(){
        vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
        float d = distance(vUv, uSun.xy);
        col += uSunColor * (0.35 * exp(-d * 6.0) + 0.6 * smoothstep(0.06, 0.04, d)) * (1.0 - uNight);
        vec2 g = floor(vUv * vec2(90.0, 70.0));
        float st = step(0.985, hash(g)) * uNight * smoothstep(0.35, 0.8, vUv.y);
        col += st * (0.6 + 0.4 * sin(uTime * 2.0 + hash(g) * 30.0));
        col += vec3(0.9, 0.92, 1.0) * smoothstep(0.035, 0.03, distance(vUv, vec2(0.78, 0.82))) * uNight;
        vec4 sil = texture2D(uSil, vec2(vUv.x, clamp(vUv.y * 2.2, 0.0, 1.0)));
        vec3 far = mix(uFar, uTop * 0.35, uNight * 0.6);
        col = mix(col, far, sil.r * step(vUv.y, 0.46));
        vec2 wg = floor(vUv * vec2(160.0, 120.0));
        float win = step(0.8, hash(wg + 3.0)) * sil.r * (1.0 - sil.g) * uNight * step(vUv.y, 0.44);
        col += vec3(1.0, 0.78, 0.45) * win * 0.9;
        col = mix(col, uNear * mix(1.0, 0.25, uNight), sil.g * step(vUv.y, 0.46));
        float rx = vUv.x * 120.0 + vUv.y * 18.0;
        float lane = floor(rx);
        float drop = fract(vUv.y * 3.0 + uTime * (1.6 + hash(vec2(lane, 1.0))) + hash(vec2(lane, 7.0)));
        float streak = step(0.96, fract(rx)) * smoothstep(0.0, 0.25, drop) * smoothstep(0.5, 0.25, drop);
        col = mix(col, col * 0.75 + vec3(0.12), uRain * 0.35);
        col += streak * uRain * 0.35;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const w = WINDOW.x1 - WINDOW.x0 + 1.4;
  const h = WINDOW.y1 - WINDOW.y0 + 1.2;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set((WINDOW.x0 + WINDOW.x1) / 2, (WINDOW.y0 + WINDOW.y1) / 2, WALL_Z - ROOM.t - 0.25);
  return { mesh: m, uniforms };
}

/* ------------------------------------------------------------------ */
/* window light: panes + rain-tree leaves, projected from behind you      */
/* ------------------------------------------------------------------ */
export function makeWindowCookie() {
  const size = 512;
  const raw = document.createElement('canvas');
  raw.width = raw.height = size;
  const rctx = raw.getContext('2d')!;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const r = rng(3);
  // rain-tree leaf clusters hanging into the upper-right of the window
  const clusters = Array.from({ length: 9 }, (_, i) => ({
    x: 0.5 + r() * 0.34,
    y: 0.2 + r() * 0.24 - (i % 3) * 0.02,
    ph: r() * TAU,
    leaves: Array.from({ length: 16 }, () => ({ dx: (r() - 0.5) * 0.11, dy: (r() - 0.5) * 0.06, a: r() * TAU, l: 0.012 + r() * 0.016 })),
  }));
  const draw = (t: number) => {
    rctx.fillStyle = '#000';
    rctx.fillRect(0, 0, size, size);
    // a tall steel window: 3 panes across, 2 high
    const x0 = size * 0.25;
    const y0 = size * 0.18;
    const W = size * 0.5;
    const H = size * 0.64;
    const bar = size * 0.022;
    rctx.fillStyle = '#fff';
    const pw = (W - bar * 2) / 3;
    const phh = (H - bar) / 2;
    for (let c = 0; c < 3; c++) for (let rr = 0; rr < 2; rr++) rctx.fillRect(x0 + c * (pw + bar), y0 + rr * (phh + bar), pw, phh);
    // leaves (small, pointed, in clusters), swaying in the breeze
    rctx.fillStyle = 'rgba(0,0,0,0.82)';
    for (const c of clusters) {
      const sx = Math.sin(t * 0.8 + c.ph) * 0.006;
      const sy = Math.cos(t * 0.6 + c.ph) * 0.003;
      for (const l of c.leaves) {
        rctx.beginPath();
        rctx.ellipse((c.x + l.dx + sx) * size, (c.y + l.dy + sy) * size, l.l * size, l.l * 0.38 * size, l.a + sx * 6, 0, TAU);
        rctx.fill();
      }
    }
    rctx.strokeStyle = 'rgba(0,0,0,0.8)';
    rctx.lineWidth = size * 0.008;
    rctx.beginPath();
    rctx.moveTo(size * 0.98, size * 0.12);
    rctx.quadraticCurveTo(size * 0.82, size * 0.2, size * 0.62, size * 0.26 + Math.sin(t * 0.6) * 1.5);
    rctx.stroke();
    // soften: sun through glass has blurry edges
    ctx.filter = 'blur(3px)';
    ctx.drawImage(raw, 0, 0);
    ctx.filter = 'none';
    tex.needsUpdate = true;
  };
  draw(0);
  return { texture: tex, draw };
}

/* ------------------------------------------------------------------ */
/* the shell                                                            */
/* ------------------------------------------------------------------ */
export function buildInterior(M: MatFn) {
  const g = new THREE.Group();
  const { x0, x1, z1, h, t } = ROOM;
  const W = WINDOW;
  const wall = M(WALL_COLOR, 0.96);
  const piece = (xa: number, xb: number, ya: number, yb: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, yb - ya, t), wall);
    m.position.set((xa + xb) / 2, (ya + yb) / 2, WALL_Z - t / 2);
    m.receiveShadow = true;
    m.castShadow = true;
    g.add(m);
  };
  piece(x0, W.x0, 0, h);
  piece(W.x1, x1, 0, h);
  piece(W.x0, W.x1, 0, W.y0);
  piece(W.x0, W.x1, W.y1, h);
  // reveal (inner faces of the window opening)
  const reveal = M('#e7ddcd', 0.95);
  for (const [x, w2] of [
    [W.x0 + 0.005, 0.01],
    [W.x1 - 0.005, 0.01],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w2, W.y1 - W.y0, t), reveal);
    m.position.set(x, (W.y0 + W.y1) / 2, WALL_Z - t / 2);
    g.add(m);
  }
  // floor (runs under the camera)
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.72 });
  floorMat.map!.wrapS = floorMat.map!.wrapT = THREE.RepeatWrapping;
  floorMat.map!.repeat.set(5, 2.6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - WALL_Z), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (WALL_Z + z1) / 2);
  floor.receiveShadow = true;
  g.add(floor);
  // skirting
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.09, 0.018), M('#e4dacb', 0.8));
  skirt.position.set(0, 0.045, WALL_Z + 0.009);
  skirt.receiveShadow = true;
  g.add(skirt);
  // crittall-style steel window + sill
  const steel = M('#1f1f1f', 0.5, 0.3);
  const fw = 0.035;
  const bar = (x: number, y: number, w2: number, hh: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w2, hh, 0.04), steel);
    b.position.set(x, y, WALL_Z - t / 2);
    b.castShadow = true;
    g.add(b);
  };
  const cx = (W.x0 + W.x1) / 2;
  const cy = (W.y0 + W.y1) / 2;
  bar(cx, W.y0 + fw / 2, W.x1 - W.x0, fw);
  bar(cx, W.y1 - fw / 2, W.x1 - W.x0, fw);
  bar(W.x0 + fw / 2, cy, fw, W.y1 - W.y0);
  bar(W.x1 - fw / 2, cy, fw, W.y1 - W.y0);
  for (let i = 1; i < 3; i++) bar(lerp(W.x0, W.x1, i / 3), cy, 0.02, W.y1 - W.y0);
  for (let i = 1; i < 4; i++) bar(cx, lerp(W.y0, W.y1, i / 4), W.x1 - W.x0, 0.02);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W.x1 - W.x0 + 0.14, 0.035, 0.16), M('#cbb08a', 0.7));
  sill.position.set(cx, W.y0 + 0.0175, WALL_Z + 0.06);
  sill.castShadow = true;
  sill.receiveShadow = true;
  g.add(sill);
  return g;
}

/* ------------------------------------------------------------------ */
/* time of day — keyed to the actual hour in bangalore                    */
/* (sunX/sunY now steer the window light coming from behind the viewer)  */
/* ------------------------------------------------------------------ */
interface Key {
  h: number;
  sunColor: string;
  sunInt: number;
  sunX: number;
  sunY: number;
  hemiSky: string;
  hemiGround: string;
  hemiInt: number;
  fill: number;
  top: string;
  bottom: string;
  far: string;
  near: string;
  night: number;
  exposure: number;
}
const KEYS: Key[] = [
  { h: 0, sunColor: '#a9bdf0', sunInt: 2.6, sunX: 0.2, sunY: 0.75, hemiSky: '#3c4566', hemiGround: '#1d1916', hemiInt: 0.16, fill: 0.03, top: '#0b1229', bottom: '#28345a', far: '#1a2340', near: '#121a24', night: 1, exposure: 1.15 },
  { h: 5.2, sunColor: '#a9bdf0', sunInt: 2.2, sunX: 0.3, sunY: 0.6, hemiSky: '#454e72', hemiGround: '#221d1a', hemiInt: 0.2, fill: 0.04, top: '#141c3a', bottom: '#3a4268', far: '#232b4a', near: '#18202a', night: 0.9, exposure: 1.12 },
  { h: 6.4, sunColor: '#ffb27a', sunInt: 9.0, sunX: -0.6, sunY: 0.25, hemiSky: '#e0d8cc', hemiGround: '#7a6a5a', hemiInt: 0.85, fill: 0.22, top: '#7f9cc9', bottom: '#f6c49b', far: '#b39aa3', near: '#566b4f', night: 0.15, exposure: 1.02 },
  { h: 9, sunColor: '#ffeed4', sunInt: 11.5, sunX: -0.45, sunY: 0.5, hemiSky: '#efeae3', hemiGround: '#a59580', hemiInt: 0.88, fill: 0.22, top: '#78ade3', bottom: '#d9e9f5', far: '#a7bccd', near: '#6c8b62', night: 0, exposure: 1 },
  { h: 13, sunColor: '#fff4e4', sunInt: 11.0, sunX: -0.2, sunY: 0.7, hemiSky: '#f1ede7', hemiGround: '#a59580', hemiInt: 0.9, fill: 0.24, top: '#6aa5e0', bottom: '#d3e6f5', far: '#a3b9cb', near: '#6a8a60', night: 0, exposure: 1 },
  { h: 16.8, sunColor: '#ffdcaa', sunInt: 11.0, sunX: 0.1, sunY: 0.42, hemiSky: '#efe8de', hemiGround: '#a08f7a', hemiInt: 0.86, fill: 0.22, top: '#76a3d6', bottom: '#e8e2d0', far: '#b0b5ba', near: '#6b875c', night: 0, exposure: 1 },
  { h: 18.2, sunColor: '#ffa65a', sunInt: 10.0, sunX: 0.3, sunY: 0.22, hemiSky: '#eed6c0', hemiGround: '#856a55', hemiInt: 0.82, fill: 0.2, top: '#6b7fbe', bottom: '#ffbf86', far: '#c08f86', near: '#5b6b45', night: 0.05, exposure: 1.02 },
  { h: 19.3, sunColor: '#ff8460', sunInt: 2.4, sunX: 0.65, sunY: 0.15, hemiSky: '#6f6788', hemiGround: '#2f2624', hemiInt: 0.3, fill: 0.08, top: '#26335f', bottom: '#c2766a', far: '#5b4a5e', near: '#2f3a33', night: 0.55, exposure: 1.08 },
  { h: 20.6, sunColor: '#a9bdf0', sunInt: 2.6, sunX: 0.2, sunY: 0.75, hemiSky: '#3c4566', hemiGround: '#1d1916', hemiInt: 0.16, fill: 0.03, top: '#0d1430', bottom: '#2b375e', far: '#1c2542', near: '#141c26', night: 1, exposure: 1.15 },
  { h: 24, sunColor: '#a9bdf0', sunInt: 2.6, sunX: 0.2, sunY: 0.75, hemiSky: '#3c4566', hemiGround: '#1d1916', hemiInt: 0.16, fill: 0.03, top: '#0b1229', bottom: '#28345a', far: '#1a2340', near: '#121a24', night: 1, exposure: 1.15 },
];

export interface TimeState {
  night: number;
  phase: 'night' | 'morning' | 'day' | 'evening';
}

/** the part of the day it is (his routine, routine.ts): night 9pm–5:30am, morning to 11am, day to 5:30pm, evening to 9pm */
export function phaseAt(hours: number): TimeState['phase'] {
  const hh = ((hours % 24) + 24) % 24;
  return hh >= 21 || hh < 5.5 ? 'night' : hh < 11 ? 'morning' : hh < 17.5 ? 'day' : 'evening';
}

export function sampleTime(hours: number) {
  const hh = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= hh) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smoothstep(0, 1, clamp((hh - a.h) / (b.h - a.h), 0, 1));
  const col = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  const num = (k: keyof Key) => lerp(a[k] as number, b[k] as number, t);
  return {
    sunColor: col(a.sunColor, b.sunColor),
    sunInt: num('sunInt'),
    sunX: num('sunX'),
    sunY: num('sunY'),
    hemiSky: col(a.hemiSky, b.hemiSky),
    hemiGround: col(a.hemiGround, b.hemiGround),
    hemiInt: num('hemiInt'),
    fill: num('fill'),
    top: col(a.top, b.top),
    bottom: col(a.bottom, b.bottom),
    far: col(a.far, b.far),
    near: col(a.near, b.near),
    night: num('night'),
    exposure: num('exposure'),
    phase: phaseAt(hh),
  };
}
