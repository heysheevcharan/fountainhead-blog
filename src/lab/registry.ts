/* Registry of 3D hero scenes. Code-split: each scene loads only when mounted. */

export interface SceneHandle {
  dispose(): void;
  setHours?(h: number | null): void;
  setRain?(on: boolean): void;
  stage?: { toggle(): boolean; isPaused: boolean };
  /** resolves once the first complete frame (character loaded, shaders compiled) is on screen */
  ready?: Promise<void>;
}

export interface Direction {
  id: string;
  load: () => Promise<{ mount: (el: HTMLElement, opts?: Record<string, unknown>) => SceneHandle }>;
  /** big assets worth fetching in parallel with the scene's code */
  preload?: string[];
}

export const DIRECTIONS: Direction[] = [{ id: 'awe-house', load: () => import('./scenes/awe-house/index'), preload: ['/3d/sheev.opt.glb'] }];

export const byId = (id: string) => DIRECTIONS.find((d) => d.id === id);
