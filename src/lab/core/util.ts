import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* math                                                                 */
/* ------------------------------------------------------------------ */
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent exponential smoothing. */
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const TAU = Math.PI * 2;

/** Shortest signed angle difference (radians). */
export function angleDelta(from: number, to: number) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function dampAngle(a: number, b: number, lambda: number, dt: number) {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

/** Small deterministic PRNG so scenes look identical on every load. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* brand                                                                */
/* ------------------------------------------------------------------ */
export const BRAND = {
  paper: '#faf8f5',
  paperSubtle: '#f0ede8',
  ink: '#1a1a1a',
  muted: '#666055',
  border: '#d8d4ce',
  accent: '#ff3c00',
  darkBg: '#141210',
  darkInk: '#e6e2dc',
};

export function prefersDark() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/* ------------------------------------------------------------------ */
/* bangalore time (the scenes are synced to where sheev actually is)    */
/* ------------------------------------------------------------------ */
export function bangaloreTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 12) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(date)
    .toLowerCase();
  return { hours: h + m / 60, label };
}

/** Allow ?time=23.5 overrides for previewing other times of day. */
export function sceneHours(): number {
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('time');
    if (q !== null && !Number.isNaN(Number(q))) return clamp(Number(q), 0, 23.99);
  }
  return bangaloreTime().hours;
}

/* ------------------------------------------------------------------ */
/* textures                                                             */
/* ------------------------------------------------------------------ */
export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  { srgb = true, repeat = false }: { srgb?: boolean; repeat?: boolean } = {},
) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

/** A tiny 3/4-step gradient map for MeshToonMaterial. */
export function toonRamp(steps = [0.35, 0.7, 1]) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    const c = Math.round(v * 255);
    data.set([c, c, c, 255], i * 4);
  });
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial blob texture (contact shadows, glows). */
export function blobTexture(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)') {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Mesh helper that also flags shadows. */
export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  { cast = true, receive = true }: { cast?: boolean; receive?: boolean } = {},
) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Dispose everything under an object. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => disposeMaterial(x));
    else if (mat) disposeMaterial(mat);
  });
}
function disposeMaterial(m: THREE.Material) {
  for (const v of Object.values(m)) {
    if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
  }
  m.dispose();
}
