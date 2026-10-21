import * as THREE from 'three';
import { toonRamp } from './util';

export type MaterialRole =
  | 'skin'
  | 'head'
  | 'beard'
  | 'eye'
  | 'eyeHi'
  | 'lips'
  | 'cloth'
  | 'denim'
  | 'shoe'
  | 'sole'
  | 'accent'
  | 'leather'
  | 'metal'
  | 'glass'
  | 'emissive';

export type MaterialFactory = (role: MaterialRole, color: THREE.ColorRepresentation) => THREE.Material;

function cached(make: MaterialFactory): MaterialFactory {
  const cache = new Map<string, THREE.Material>();
  return (role, color) => {
    const key = `${role}:${new THREE.Color(color).getHexString()}`;
    let m = cache.get(key);
    if (!m) {
      m = make(role, color);
      cache.set(key, m);
    }
    return m;
  };
}

/** Soft "vinyl toy / clay" PBR look. */
export const clayMaterials = (): MaterialFactory =>
  cached((role, color) => {
    if (role === 'eyeHi') return new THREE.MeshBasicMaterial({ color });
    if (role === 'emissive') return new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const roughness =
      role === 'head'
        ? 0.38
        : role === 'eye'
          ? 0.12
          : role === 'beard'
            ? 0.96
            : role === 'shoe' || role === 'leather'
              ? 0.55
              : role === 'metal'
                ? 0.3
                : role === 'glass'
                  ? 0.08
                  : role === 'denim'
                    ? 0.9
                    : 0.8;
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: role === 'metal' ? 0.8 : 0,
    });
  });

/** Cel shaded, 3-step ramp. */
export const toonMaterials = (steps = [0.45, 0.75, 1]): MaterialFactory => {
  const ramp = toonRamp(steps);
  return cached((role, color) => {
    if (role === 'eyeHi' || role === 'emissive') return new THREE.MeshBasicMaterial({ color, toneMapped: false });
    return new THREE.MeshToonMaterial({ color, gradientMap: ramp });
  });
};

/** Faceted low-poly look. */
export const flatMaterials = (): MaterialFactory =>
  cached((role, color) => {
    if (role === 'eyeHi' || role === 'emissive') return new THREE.MeshBasicMaterial({ color, toneMapped: false });
    return new THREE.MeshLambertMaterial({ color, flatShading: role !== 'head' && role !== 'eye' });
  });

/** Unlit fills (for ink / riso post pipelines that do their own shading). */
export const unlitMaterials = (): MaterialFactory =>
  cached((_role, color) => new THREE.MeshBasicMaterial({ color }));

/* ------------------------------------------------------------------ */
/* inverted-hull outlines                                               */
/* ------------------------------------------------------------------ */
const outlineCache = new Map<string, THREE.Material>();
export function outlineMaterial(color: THREE.ColorRepresentation = '#1a1a1a', thickness = 0.012) {
  const key = `${new THREE.Color(color).getHexString()}:${thickness}`;
  let m = outlineCache.get(key);
  if (m) return m;
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uThickness;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(objectNormal) * uThickness;');
  };
  mat.customProgramCacheKey = () => `outline-${thickness}`;
  outlineCache.set(key, mat);
  return mat;
}

/** Adds a back-face hull to every mesh under root (skips tiny/flagged meshes). */
export function addOutlines(
  root: THREE.Object3D,
  { color = '#1a1a1a', thickness = 0.012, skip }: { color?: THREE.ColorRepresentation; thickness?: number; skip?: (m: THREE.Mesh) => boolean } = {},
) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.noOutline && !m.userData.isOutline && !(skip && skip(m))) meshes.push(m);
  });
  for (const m of meshes) {
    // scale-aware: thickness is in world-ish units, so divide by the mesh's own scale
    const s = (Math.abs(m.scale.x) + Math.abs(m.scale.y) + Math.abs(m.scale.z)) / 3 || 1;
    const hull = new THREE.Mesh(m.geometry, outlineMaterial(color, thickness / s));
    hull.userData.isOutline = true;
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.raycast = () => {};
    m.add(hull);
  }
}
