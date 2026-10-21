import * as THREE from 'three';

export interface StageOptions {
  container: HTMLElement;
  canvas?: HTMLCanvasElement;
  /** Transparent canvas so the page background shows through. */
  alpha?: boolean;
  antialias?: boolean;
  maxDpr?: number;
  shadows?: boolean;
  fov?: number;
  toneMapping?: THREE.ToneMapping;
  exposure?: number;
}

type FrameFn = (dt: number, t: number) => void;

/**
 * Owns the renderer + loop. Pauses itself when the hero is offscreen or the
 * tab is hidden, clamps DPR, tracks the pointer relative to the container and
 * exposes a reduced-motion flag every scene respects.
 */
export class Stage {
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  readonly reducedMotion: boolean;
  private lastTick = 0;

  width = 1;
  height = 1;
  dpr = 1;
  maxDpr: number;
  elapsed = 0;

  /** Pointer in normalised device coords (-1..1), relative to the container. */
  readonly pointer = new THREE.Vector2(0, 0);
  pointerInside = false;
  lastPointerMove = -1e9;

  private frameFns = new Set<FrameFn>();
  private resizeFns = new Set<(w: number, h: number) => void>();
  private renderFn: (() => void) | null = null;
  private running = false;
  private onScreen = true;
  private pageVisible = true;
  private userPaused = false;
  /** until the scene starts its loop, resizes don't draw (that would compile shaders synchronously) */
  private everStarted = false;
  private disposers: (() => void)[] = [];
  private raycaster = new THREE.Raycaster();

  constructor(opts: StageOptions) {
    this.container = opts.container;
    this.canvas = opts.canvas ?? document.createElement('canvas');
    if (!opts.canvas) this.container.appendChild(this.canvas);
    this.maxDpr = opts.maxDpr ?? 1.75;
    this.reducedMotion =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: opts.antialias ?? true,
      alpha: opts.alpha ?? true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = opts.toneMapping ?? THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = opts.exposure ?? 1;
    if (opts.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }

    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 30, 1, 0.1, 200);

    // resize
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.container);
    this.disposers.push(() => ro.disconnect());

    // offscreen pause
    const io = new IntersectionObserver(
      (entries) => {
        this.onScreen = entries[0]?.isIntersecting ?? true;
        this.syncRunning();
      },
      { threshold: 0.01 },
    );
    io.observe(this.container);
    this.disposers.push(() => io.disconnect());

    const onVis = () => {
      this.pageVisible = document.visibilityState === 'visible';
      this.syncRunning();
    };
    document.addEventListener('visibilitychange', onVis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVis));

    // pointer (window-level so overlays don't block look-at)
    const onMove = (e: PointerEvent) => {
      const r = this.container.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.pointerInside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      this.lastPointerMove = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    this.disposers.push(() => window.removeEventListener('pointermove', onMove));

    this.resize();
  }

  get isPaused() {
    return this.userPaused;
  }

  onFrame(fn: FrameFn) {
    this.frameFns.add(fn);
    return () => this.frameFns.delete(fn);
  }

  onResize(fn: (w: number, h: number) => void) {
    this.resizeFns.add(fn);
    fn(this.width, this.height);
    return () => this.resizeFns.delete(fn);
  }

  /** Replace the default renderer.render (e.g. with a post-processing composer). */
  setRender(fn: () => void) {
    this.renderFn = fn;
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    const cam = this.camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    this.resizeFns.forEach((fn) => fn(w, h));
    if (!this.running && this.everStarted) this.renderOnce();
  }

  start() {
    this.userPaused = false;
    this.syncRunning();
  }

  pause() {
    this.userPaused = true;
    this.syncRunning();
  }

  toggle() {
    if (this.userPaused) this.start();
    else this.pause();
    return !this.userPaused;
  }

  private syncRunning() {
    const shouldRun = this.onScreen && this.pageVisible && !this.userPaused;
    if (shouldRun && !this.running) {
      this.running = true;
      this.everStarted = true;
      this.lastTick = performance.now();
      this.renderer.setAnimationLoop(() => this.tick());
    } else if (!shouldRun && this.running) {
      this.running = false;
      this.renderer.setAnimationLoop(null);
    }
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTick) / 1000, 1 / 20);
    this.lastTick = now;
    this.elapsed += dt;
    this.frameFns.forEach((fn) => fn(dt, this.elapsed));
    this.draw();
  }

  private draw() {
    if (this.renderFn) this.renderFn();
    else this.renderer.render(this.scene, this.camera);
  }

  renderOnce() {
    this.draw();
  }

  /** Advance a fixed amount of time (used for posters / reduced motion). */
  step(seconds: number, fps = 30) {
    const dt = 1 / fps;
    for (let s = 0; s < seconds; s += dt) {
      this.elapsed += dt;
      this.frameFns.forEach((fn) => fn(dt, this.elapsed));
    }
    this.draw();
  }

  /** Raycast from the current pointer against objects. */
  pick(objects: THREE.Object3D[], recursive = true) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }

  pickAt(clientX: number, clientY: number, objects: THREE.Object3D[], recursive = true) {
    const r = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }

  /** Project a world position to container pixel coords. */
  toScreen(world: THREE.Vector3, out = { x: 0, y: 0, behind: false }) {
    const v = world.clone().project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.width;
    out.y = (-v.y * 0.5 + 0.5) * this.height;
    out.behind = v.z > 1;
    return out;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.disposers.forEach((d) => d());
    this.frameFns.clear();
    this.resizeFns.clear();
    this.renderer.dispose();
  }
}
