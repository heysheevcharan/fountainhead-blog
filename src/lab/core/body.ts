import type * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** The sculpted, skinned body (tools/character/build_sheev.py → gltf-transform meshopt). ~170 KB. */
export const SHEEV_BODY_URL = '/3d/sheev.opt.glb';

let cache: Promise<THREE.Object3D> | null = null;

/**
 * Loads the body once. `prefetched` lets the page start downloading the file while the
 * scene's code is still loading (see Hero3D's boot), so the two don't queue up.
 */
export function loadSheevBody(url = SHEEV_BODY_URL, prefetched?: Promise<ArrayBuffer>): Promise<THREE.Object3D> {
  if (!cache) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const fromNetwork = () => loader.loadAsync(url).then((g) => g.scene);
    cache = prefetched
      ? prefetched.then((buf) => loader.parseAsync(buf, url.slice(0, url.lastIndexOf('/') + 1))).then((g) => g.scene, fromNetwork)
      : fromNetwork();
  }
  return cache;
}
