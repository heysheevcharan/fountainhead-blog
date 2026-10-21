import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Collapse every static mesh under `group` into one mesh per material.
 * The originals stay in the graph but invisible, so raycast hotspots keep
 * working (Raycaster ignores `visible`). Animated / pulsed subtrees go in
 * `exclude`. Returns the number of draw calls saved.
 */
export function mergeStatic(group: THREE.Object3D, exclude: THREE.Object3D[] = []) {
  const skip = new Set(exclude);
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[]; cast: boolean; receive: boolean }>();

  const visit = (o: THREE.Object3D) => {
    if (skip.has(o) || !o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !m.userData.noMerge) {
      const mat = m.material;
      if (!Array.isArray(mat) && !(mat as THREE.Material).transparent) {
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        const b = buckets.get(mat as THREE.Material) ?? { geos: [], meshes: [], cast: false, receive: false };
        b.geos.push(geo);
        b.meshes.push(m);
        b.cast ||= m.castShadow;
        b.receive ||= m.receiveShadow;
        buckets.set(mat as THREE.Material, b);
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(group);

  let saved = 0;
  buckets.forEach((b, mat) => {
    if (b.geos.length < 2) {
      b.geos.forEach((g) => g.dispose());
      return;
    }
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.userData.merged = true;
    mesh.raycast = () => {}; // hotspots raycast the hidden originals
    group.add(mesh);
    // hide originals from rendering (they still answer raycasts)
    b.meshes.forEach((m) => (m.visible = false));
    saved += b.meshes.length - 1;
  });
  return saved;
}
