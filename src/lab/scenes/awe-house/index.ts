import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Stage } from '../../core/stage';
import { Sheev } from '../../core/sheev';
import { Bubble, HoverLabel, SpeechBubble, Tag, Zzz, wireHotspots, type Hotspot, type Line, type SpeechItem } from '../../core/overlay';
import { makeBook, makeMug, makePen, makeWateringCan, standardMats } from '../../core/props';
import { bangaloreTime, clamp, damp, disposeTree, prefersDark, sceneHours, smoothstep } from '../../core/util';
import { SeparationPrinter } from '../../core/ink';
import { loadSheevBody, SHEEV_BODY_URL } from '../../core/body';
import { mergeStatic } from '../../core/merge';
import { buildInterior, makeSkyCard, makeWindowCookie, phaseAt, sampleTime, WALL_Z } from './room';
import { buildFurniture, DESK, SEAT } from './furniture';
import { attachProps, Director, registerDeskPoses, routineFor, type Task } from './routine';
import type { BoardPost } from './extras';
import { POSTERS, posterTimeAt } from '../../posters';

export const QUOTES: Line[] = [
  { text: 'every time i followed my awe, it worked out okay.', href: '/blog/follow-your-awe-intensely' },
  { text: 'rebellion is the source of all progress.', href: '/blog/rebellion' },
  { text: 'seek play in this meaningless life.', href: '/blog/why-do-anything-in-this-meaningless-life' },
  { text: 'emotion is energy in motion.', href: '/blog/energy-sources-energy-sinks' },
  { text: 'i believe my diary to be my unconscious.', href: '/blog/not-that-kind-of-love' },
  { text: 'physical movement facilitates mental movement.', href: '/blog/dont-stop-at-conflict-resolution-make-the-collaboration-work' },
  { text: 'creativity is the only alpha we can bring to the table.', href: '/blog/my-learnings-from-saasboomi-2025' },
  { text: 'things connect in unexpected ways.', href: '/blog/things-connect-in-unexpected-ways' },
  { text: 'human potential is sacred. work is not.', href: '/blog/building-an-imaginary-country' },
  { text: 'every forehand is a micro-experiment.', href: '/blog/the-art-of-experimentation' },
  { text: 'time was sacred.', href: '/blog/weve-turned-filmmaking-into-fast-food-and-the-audience-has-lost-taste' },
  { text: 'i want an os that is fluidic and emergent.', href: '/blog/i-hate-current-operating-systems' },
];

const DEFAULT_INTRO: SpeechItem[] = [
  { html: 'This blog is an attempt to meet like-minded people, and I hope it creates enough digital gravity to attract them.' },
  { html: 'Three core values of my life:' },
  { title: '1/ Entrepreneurial freedom', html: 'I have always been entrepreneurial. As a kid, I was collecting and selling computer game cheat codes. Later on, I sold odd things like event tickets, banners, and decorative paints.' },
  { title: '2/ Thoughtful products and design', html: 'At the age of 12, my dad gifted me an iPod nano gen 3. I loved it so much that I used to carry that thing around all the time.' },
  { title: '3/ Understanding human nature', html: 'In high school, my dad brought me How to Talk to Anyone. I immediately applied the methods on my friends. I still do that now, whenever I learn something new about human behavior.' },
];

export type NavKey = 'home' | 'blog' | 'books' | 'films' | 'travel' | 'now';

export interface MountOptions {
  caption?: boolean;
  skin?: 'clay' | 'print';
  intro?: SpeechItem[];
  autoIntro?: 'auto' | 'always' | 'never';
  /** assets the page already started downloading (url → bytes) */
  preloaded?: Record<string, Promise<ArrayBuffer>>;
  /** his latest posts, pinned to the board above the desk */
  posts?: BoardPost[];
}

const INTRO_SEEN_KEY = 'sheev:intro-seen';
const DRAGGED_KEY = 'sheev:dragged';

export function mount(container: HTMLElement, opts: MountOptions = {}) {
  const stage = new Stage({ container, shadows: true, fov: 30, exposure: 1 });
  const { scene, renderer } = stage;
  const M = standardMats();
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  /** true once the loop runs (the room is about to be on screen) */
  let live = false;

  /* ---------- light: soft room ambience + sun through a window behind you ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;
  const hemi = new THREE.HemisphereLight('#f4efe7', '#a59580', 1.35);
  scene.add(hemi);
  const cookie = makeWindowCookie();
  const sun = new THREE.SpotLight('#fff0d8', 6, 0, 0.3, 0.15, 0);
  sun.map = cookie.texture;
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 40;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#fff7ee', 0.42);
  fill.position.set(5, 6, 9);
  scene.add(fill);

  /* ---------- the room ---------- */
  const model = new THREE.Group();
  scene.add(model);
  const interior = buildInterior(M);
  model.add(interior);
  const sky = makeSkyCard();
  model.add(sky.mesh);
  const F = buildFurniture(M, opts.posts ?? []);
  model.add(F.root);

  // one mesh per material for everything static (books, spokes, leaves…)
  const lilyHeadsAll = F.lilies.userData.heads as THREE.Object3D[];
  mergeStatic(interior);
  mergeStatic(F.shelf.group, [F.shelf.camera, F.cheatCodes]);
  mergeStatic(F.root, [F.chair, F.vase, F.clock.group, F.lamp.group, F.laptop.group, F.diary, F.filmScreen.group, F.projector.group, F.beam.mesh, F.beam.motes, F.travelWall, F.ipod, F.howToTalk, F.shelf.group, F.mug, F.windowArea, F.board.group]);
  mergeStatic(F.board.group);
  lilyHeadsAll.forEach((h) => mergeStatic(h));
  mergeStatic(F.lilies, lilyHeadsAll);
  mergeStatic(F.clock.group, [F.clock.hour, F.clock.minute, F.clock.second]);
  mergeStatic(F.projector.group, F.projector.reels);
  for (const g of [F.travelWall, F.lamp.group, F.diary, F.laptop.group, F.ipod, F.chair, F.vase]) mergeStatic(g, [F.lilies]);
  // late at night the room's bounce light is out: the laptop screen is what lights his face
  const screenGlow = new THREE.SpotLight('#dbe6ff', 0, 1.6, 0.62, 1, 2);
  screenGlow.position.set(DESK.x + 0.03, DESK.h + 0.14, DESK.z - 0.05);
  screenGlow.target.position.set(SEAT.x, 1.2, SEAT.z + 0.05);
  model.add(screenGlow, screenGlow.target);

  /* ---------- sheev ---------- */
  const sheev = new Sheev();
  registerDeskPoses(sheev);
  model.add(sheev.root);
  const bodyReady = loadSheevBody(SHEEV_BODY_URL, opts.preloaded?.[SHEEV_BODY_URL])
    .then((body) => sheev.applyBody(body))
    .catch((e) => console.warn('[awe-house] sculpted body failed to load, keeping primitives', e));
  const handMug = makeMug(M);
  const handCan = makeWateringCan(M);
  const setProp = attachProps(sheev, { pen: makePen(M), mug: handMug, book: makeBook(M, '#2f4858', 0.15, 0.22, 0.03, true), can: handCan });

  const bubble = new Bubble(stage, sheev.headTop, new THREE.Vector3(0, 0.1, 0));
  const speech = new SpeechBubble(stage, sheev.headTop, new THREE.Vector3(0, 0.12, 0));
  speech.avoid = container.querySelector<HTMLElement>('[data-hero-head]');
  speech.avoidObjects = [F.board.group];
  const zzz = new Zzz(stage, sheev.headTop);
  const label = new HoverLabel(stage);

  let hoursOverride: number | null = null;
  /** the hour it really is in bangalore (or the one the visitor picked) */
  const realHours = () => hoursOverride ?? sceneHours();
  /*
   * The page showed a still rendered at its time slot's hour (src/lab/posters.ts). The room
   * starts at exactly that hour, then eases to the real one (light + clock) once it's on screen.
   */
  const posterSpec = POSTERS['awe-house'];
  const [posterSizeId, posterTimeId] = (container.dataset.poster ?? '').split('-');
  const posterSlot = posterSpec.times.find((t) => t.id === posterTimeId) ?? null;
  const timeHandoff = { from: posterSlot?.render ?? 0, k: posterSlot ? 0 : 1 };
  const lerpHours = (a: number, b: number, k: number) => {
    const d = ((((b - a) % 24) + 36) % 24) - 12; // shortest way round the clock
    return (((a + d * k) % 24) + 24) % 24;
  };
  /** the hour the room is showing */
  const currentHours = () => (timeHandoff.k < 1 ? lerpHours(timeHandoff.from, realHours(), timeHandoff.k) : realHours());
  let tstate = sampleTime(currentHours());

  let currentTask: Task | null = null;
  let caption: HTMLDivElement | null = null;
  if (opts.caption !== false) {
    caption = document.createElement('div');
    caption.className = 's3d-caption';
    (container.querySelector('[data-hero-status]') ?? container).appendChild(caption);
  }

  let chairSeated = true;
  const director = new Director(
    sheev,
    {
      setProp: (p) => {
        setProp(p);
        F.mug.visible = p !== 'mug';
      },
      setChair: (seated) => (chairSeated = seated),
      say: (line) => {
        if (!speech.visible) bubble.say(line);
      },
      onTask: (task: Task) => updateCaption(task),
    },
    // what he does follows the clock exactly: the loop for the part of the day it is in bangalore
    // (or the hour the visitor picked) — never the hour the still was rendered at
    () => routineFor(phaseAt(realHours()), realHours()),
  );
  /** which loop he should be on: the part of the day, and the small hours (when he nods off) */
  const loopKey = (h: number) => (phaseAt(h) === 'night' && h >= 0.5 && h < 5 ? 'night-late' : phaseAt(h));
  let loopNow = loopKey(realHours());
  if (import.meta.env.DEV) {
    // the stills only hand off cleanly if each time slot has one routine start + one copy tone
    const sig = (h: number) => {
      const st = sampleTime(h);
      const first = routineFor(st.phase, h)[0];
      return `${first.node}/${first.pose}/${st.night > 0.5 ? 'dark' : 'light'}`;
    };
    for (const slot of posterSpec.times) {
      const span = (((slot.to - slot.from) % 24) + 24) % 24;
      const want = sig(slot.render);
      if (!want.endsWith(slot.tone)) console.warn(`[awe-house] poster slot "${slot.id}": tone should be ${want.split('/')[2]}`);
      for (const h of [slot.from + 0.02, slot.from + span / 2, slot.from + span - 0.02].map((x) => x % 24))
        if (sig(h) !== want) console.warn(`[awe-house] poster slot "${slot.id}" starts differently at ${h.toFixed(2)}h (${sig(h)} vs ${want})`);
    }
  }
  // his first task may already have him at the desk: chair pulled in from the very first frame
  // (it used to slide in during the first second — right under the poster cross-fade)
  F.chair.position.z = chairSeated ? SEAT.z - 0.02 : SEAT.outZ;
  if (chairSeated && director.seated === 'desk') sheev.root.position.z = F.chair.position.z + 0.02;

  function updateCaption(task?: Task | null) {
    if (task) currentTask = task;
    if (!caption) return;
    const t = currentTask;
    const h = realHours();
    const forced = hoursOverride !== null || params.has('time');
    const fmtH = `${((Math.floor(h) + 11) % 12) + 1}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
    const when = forced ? `${fmtH} in bangalore` : `${bangaloreTime().label} in bangalore`;
    caption.innerHTML = `<span class="s3d-dot"></span><span>${when} — sheev is ${t ? t.doing : 'around'}.</span>`;
  }

  /* ---------- time of day ---------- */
  let lampOverride: boolean | null = null;
  const rainParam = params.get('rain');
  let rainWanted = rainParam === '1' || (rainParam === null && tstate.phase === 'night' && Math.random() < 0.35);
  let rainOn = false;
  // the page's inline script already guessed the tone (so the copy doesn't flip on boot)
  let tone: 'light' | 'dark' = container.dataset.tone === 'dark' ? 'dark' : 'light';
  /*
   * Night, as far as the page copy is concerned: one switch, thrown at the same moment the copy
   * flips to light text (and the stills change slot, src/lab/posters.ts). The lamp clicks on, the
   * room's daylight bounce goes out (a lamp-lit room is dark up by the ceiling, where the nav and
   * name sit) and the window light moves off the upper wall. Eased, so it takes a second, not a frame.
   */
  let nightK = tone === 'dark' ? 1 : 0;
  const sunGoal = new THREE.Vector3();
  const sunAim = new THREE.Vector3();
  function applyTime(dt = 1) {
    const hNow = currentHours();
    const s = sampleTime(hNow);
    const k = 1 - Math.exp(-dt * 2.5);
    tstate = s;
    // the stills' time slots decide (so the page's inline script, the stills and the room always
    // agree, to the second); they're drawn where the light crosses night 0.5 (checked in DEV above)
    const dark = posterTimeAt(posterSpec, hNow).tone === 'dark';
    nightK = THREE.MathUtils.lerp(nightK, dark ? 1 : 0, k);
    hemi.color.lerp(s.hemiSky, k);
    hemi.groundColor.lerp(s.hemiGround, k);
    hemi.intensity = THREE.MathUtils.lerp(hemi.intensity, s.hemiInt, k);
    // the window behind you: morning light rakes in from the left, evening from the right
    sun.color.lerp(s.sunColor, k);
    sun.intensity = THREE.MathUtils.lerp(sun.intensity, s.sunInt, k);
    // at night the moon is high: its panes fall steeply, onto the floor and the lower right of the
    // wall, never behind the (now light) page copy at the top
    sunGoal.set(-7.5 + s.sunX * 4.5, 3.6 + s.sunY * 4.2 - nightK * 1.2, 6.0 - nightK * 3.5);
    sun.position.lerp(sunGoal, k);
    sunAim.set(0.55 + s.sunX * 0.9 + nightK * 2.0, 0.85 - nightK * 1.5, WALL_Z + 0.2);
    sun.target.position.lerp(sunAim, k);
    fill.intensity = THREE.MathUtils.lerp(fill.intensity, s.fill, k);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, s.exposure, k);
    scene.environmentIntensity = THREE.MathUtils.lerp(scene.environmentIntensity, 0.3 - 0.285 * nightK, k);
    const u = sky.uniforms;
    u.uTop.value.lerp(s.top, k);
    u.uBottom.value.lerp(s.bottom, k);
    u.uFar.value.lerp(s.far, k);
    u.uNear.value.lerp(s.near, k);
    u.uSunColor.value.lerp(s.sunColor, k);
    u.uNight.value = THREE.MathUtils.lerp(u.uNight.value, s.night, k);
    u.uSun.value.set(0.5 + s.sunX * 0.35, clamp(0.18 + s.sunY * 0.55, 0.1, 0.92), 0);
    u.uRain.value = THREE.MathUtils.lerp(u.uRain.value, rainOn ? 1 : 0, k);
    const lampOn = lampOverride ?? dark;
    F.lamp.light.intensity = THREE.MathUtils.lerp(F.lamp.light.intensity, lampOn ? 9 : 0, k * 1.5);
    F.lamp.light.castShadow = lampOn || F.lamp.light.intensity > 0.2;
    (F.lamp.bulb.material as THREE.MeshBasicMaterial).color.set(lampOn ? '#fff1d6' : '#bdb6a8');
    (F.laptop.screen.material as THREE.MeshBasicMaterial).color.setScalar(0.55 + s.night * 0.45);
    screenGlow.intensity = THREE.MathUtils.lerp(screenGlow.intensity, nightK * 0.8, k);
    (F.beam.mesh.material as THREE.MeshBasicMaterial).opacity = 0.045 + s.night * 0.075;
    // keep the overlay copy readable: dark text on a sunny wall, light text at night
    const nextTone = dark ? 'dark' : 'light';
    if (nextTone !== tone) {
      tone = nextTone;
      container.dataset.tone = tone;
    }
  }
  container.dataset.tone = tone;
  applyTime(10);
  container.dataset.tone = tone;

  /* ---------- camera: standing inside the room ---------- */
  const cam = stage.camera as THREE.PerspectiveCamera;
  const view = {
    yaw: 0,
    yawVel: 0,
    focusW: 0,
    focusPoint: new THREE.Vector3(),
    focusGoal: null as THREE.Vector3 | null,
    lean: 0,
    leanGoal: 0,
    talkW: 0,
  };
  const closeCam = params.get('cam') === 'close';
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  /** Puts a camera where the visitor stands. `lean` is how far the gaze drifts toward the focus point. */
  /*
   * Fit: the page copy (nav + name at the top of the 640px column, status at the bottom) sits
   * where it does on every other page, so the room is framed around it: the picture slides down
   * (and, on short screens, steps back a little) until nothing on the wall is under the copy.
   * A pure function of the screen size, so the poster for a reference size uses the same fit.
   */
  type Fit = { zoom: number; shift: number };
  const headEl = container.querySelector<HTMLElement>('[data-hero-head]');
  const footEl = container.querySelector<HTMLElement>('[data-hero-foot]');
  const copy = { headB: 0, headW: 0, footT: 0, footW: 0 };
  function measureCopy() {
    // the union of the actual glyph boxes (block boxes span the whole column)
    const extent = (el: Element | null) => {
      if (!el) return null;
      const r = document.createRange();
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let box: { left: number; top: number; right: number; bottom: number; width: number } | null = null;
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent?.trim()) continue;
        r.selectNodeContents(n);
        const b = r.getBoundingClientRect();
        if (!b.width) continue; // hidden (e.g. display:none on phones)
        box = box
          ? { left: Math.min(box.left, b.left), top: Math.min(box.top, b.top), right: Math.max(box.right, b.right), bottom: Math.max(box.bottom, b.bottom), width: 0 }
          : { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: 0 };
      }
      if (box) box.width = box.right - box.left;
      return box;
    };
    const hb = headEl?.getBoundingClientRect();
    const ht = extent(headEl);
    if (hb && ht) {
      copy.headB = ht.bottom - hb.top; // text bottom, from the top of the column box
      copy.headW = ht.right - hb.left;
    }
    const fb = footEl?.getBoundingClientRect();
    const ft = extent(footEl);
    if (fb && ft && ft.width > 0) {
      copy.footT = fb.bottom - ft.top; // text top, from the bottom of the box
      copy.footW = ft.right - fb.left;
    }
  }
  // tops of things on the back wall that must stay below the header copy (x, y, z)
  const CLEAR_BELOW_HEAD: [number, number, number][] = [
    [-1.05, 2.22, WALL_Z], [-0.5, 2.22, WALL_Z], [0.05, 2.22, WALL_Z], // the board
    [0.255, 2.22, WALL_Z], [0.685, 2.22, WALL_Z], // the poster
    [0.95, 2.37, WALL_Z], [1.7, 2.37, WALL_Z], [2.45, 2.37, WALL_Z], // the window
    [-2.9, 1.76, WALL_Z], [-1.94, 1.76, WALL_Z], // the film screen
    [2.78, 2.58, WALL_Z], [3.14, 2.57, WALL_Z], [4.32, 2.57, WALL_Z], // the clock + travel photos
  ];
  // things on the floor that must stay above the bottom copy
  const CLEAR_ABOVE_FOOT: [number, number, number][] = [
    [DESK.x - 0.74, 0, DESK.z + 0.32], [DESK.x + 0.74, 0, DESK.z + 0.32], // the desk's front feet
    [SEAT.x - 0.12, 0.02, SEAT.z + 0.42], [SEAT.x + 0.12, 0.02, SEAT.z + 0.42], // his sneakers
  ];
  const fitProbe = new THREE.PerspectiveCamera();
  /** where the page copy sits on a W x H screen (px) */
  function copyRects(W: number, H: number) {
    const col = W <= 600 ? 16 : Math.max(24, (W - 640) / 2); // same rule as the .container column
    // a clear band of wall under the name before anything hangs (it read as one crowded block at 14px)
    const head = { l: col - 12, r: col + copy.headW + 12, b: 64 + copy.headB + 30 };
    const footBottom = H - Math.min(36, Math.max(18, H * 0.04));
    const foot = { l: col - 12, r: col + copy.footW + 12, t: footBottom - copy.footT - 8 };
    return { head, foot };
  }
  function fitFor(W: number, H: number): Fit {
    if (!copy.headB) return { zoom: 1, shift: 0 };
    const { head, foot } = copyRects(W, H);
    fitProbe.fov = cam.fov;
    fitProbe.near = cam.near;
    fitProbe.far = cam.far;
    fitProbe.aspect = W / H;
    let zoom = 1;
    let need = 0;
    for (let i = 0; i < 12; i++, zoom *= 1.03) {
      placeCamera(fitProbe, 0, 0, view.focusPoint, 0, false, W, H, { zoom, shift: 0 });
      fitProbe.updateMatrixWorld();
      const at = (x: number, y: number, z: number) => {
        const v = tmpB.set(x, y, z).project(fitProbe);
        return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
      };
      need = 0;
      for (const [x, y, z] of CLEAR_BELOW_HEAD) {
        const p = at(x, y, z);
        if (p.x > head.l && p.x < head.r) need = Math.max(need, head.b - p.y);
      }
      let room = Infinity;
      if (copy.footW)
        for (const [x, y, z] of CLEAR_ABOVE_FOOT) {
          const p = at(x, y, z);
          if (p.x > foot.l && p.x < foot.r) room = Math.min(room, foot.t - p.y);
        }
      if (need <= 0) return { zoom, shift: 0 };
      if (need <= room) return { zoom, shift: need };
    }
    return { zoom, shift: Math.max(0, need) };
  }
  let fit: Fit = { zoom: 1, shift: 0 };

  function placeCamera(c: THREE.PerspectiveCamera, focusW: number, lean: number, focusPoint: THREE.Vector3, talkW: number, live: boolean, W = stage.width, H = stage.height, f: Fit = fit) {
    const aspect = W / H;
    // what has to fit across the screen (metres, at the back wall)
    const portrait = aspect < 0.85;
    const span = portrait ? 3.4 : aspect < 1.25 ? 5.8 : clamp(6.2 + (aspect - 1.25) * 3.6, 7.0, 9.0);
    const cx = portrait ? -0.12 : aspect < 1.25 ? 0.1 : 0.42;
    const vfov = THREE.MathUtils.degToRad(c.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const pitch = THREE.MathUtils.degToRad(portrait ? 12 : 11);
    const baseYaw = -0.1;
    const look = tmpA.set(cx, portrait ? 1.22 : 1.12, WALL_Z + 0.9);
    if (focusW > 0.001) look.lerp(focusPoint, focusW * lean);
    // during the intro lean in toward him a little
    if (talkW > 0.001) {
      const head = sheev.headTop.getWorldPosition(tmpB);
      look.lerp(tmpB.set(head.x, head.y - 0.55, head.z), talkW * 0.35);
    }
    let dist = portrait ? 2.25 / Math.tan(vfov / 2) : (span / 2) / Math.tan(hfov / 2);
    // a breath closer when something is pointed at; a real move only when it was off to the side
    dist *= f.zoom * (1 - focusW * (0.03 + lean * 0.06) - talkW * 0.12);
    const wobble = live && !stage.reducedMotion;
    const yaw = baseYaw + view.yaw + (wobble ? stage.pointer.x * 0.025 + Math.sin(stage.elapsed * 0.06) * 0.012 : 0);
    const p = pitch + (wobble ? -stage.pointer.y * 0.012 : 0);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(p), Math.sin(p), Math.cos(yaw) * Math.cos(p));
    c.position.copy(look).addScaledVector(dir, dist);
    c.lookAt(look);
    // slide the picture down below the page copy (see fit); phones get a small nudge regardless
    let shiftY = shiftFor(W, H, f);
    // leaning in (the intro, a nav focus) mustn't lift the wall art up under the page copy
    if (live && copy.headB && (talkW > 0.001 || focusW > 0.001)) {
      c.clearViewOffset();
      c.updateMatrixWorld();
      const { head } = copyRects(W, H);
      let need = 0;
      for (const [x, y, z] of CLEAR_BELOW_HEAD) {
        const v = tmpB.set(x, y, z).project(c);
        const sx = ((v.x + 1) / 2) * W;
        const sy = ((1 - v.y) / 2) * H + shiftY;
        if (sx > head.l && sx < head.r) need = Math.max(need, head.b - sy);
      }
      shiftY += need;
    }
    if (shiftY > 0.5) c.setViewOffset(W, H, 0, -shiftY, W, H);
    else c.clearViewOffset();
  }
  const shiftFor = (W: number, H: number, f: Fit) => (W / H < 0.85 ? H * 0.04 : 0) + f.shift;
  /**
   * How far to drift toward a focus point: as little as possible. If the object is already
   * comfortably on screen (and not under the header copy) we only lean in a touch.
   */
  const probe = new THREE.PerspectiveCamera();
  function leanFor(goal: THREE.Vector3) {
    probe.copy(cam);
    probe.aspect = stage.width / stage.height;
    probe.updateProjectionMatrix();
    const box = container.getBoundingClientRect();
    const hb = headEl?.getBoundingClientRect();
    const head = hb ? { r: (hb.right - box.left + 24) / box.width, b: (hb.bottom - box.top + 24) / box.height } : { r: 0, b: 0 };
    for (const lean of [0, 0.15, 0.3, 0.45, 0.6]) {
      placeCamera(probe, 1, lean, goal, 0, false);
      probe.updateMatrixWorld();
      const v = tmpB.copy(goal).project(probe);
      const sx = (v.x + 1) / 2;
      const sy = (1 - v.y) / 2;
      const inside = sx > 0.06 && sx < 0.94 && sy > 0.1 && sy < 0.85;
      const underHead = sx < head.r && sy < head.b;
      if (inside && !underHead) return lean;
    }
    return 0.6;
  }
  /*
   * Hand-off from the poster: the page shows a still rendered for a reference screen shape
   * (CSS-cropped to "cover" this screen). For the first moments the live camera reproduces
   * exactly that crop, so the cross-fade has no ghosting; then it eases into its own framing.
   */
  const posterSize = posterSpec.sizes.find((z) => z.id === posterSizeId) ?? null;
  const handoff = { cam: null as THREE.PerspectiveCamera | null, t: 0 };
  const HANDOFF_HOLD = 1.0;
  const HANDOFF_BLEND = 1.4;
  // how the page laid the still out on this screen (Hero3D.astro): scale, and where the still's
  // reference frame (its top-left corner) sits, in CSS px. It may be shrunk / slid down so the
  // wall art clears the page copy on screens smaller than the still's reference size.
  const posterFit = (container.dataset.posterFit ?? '').split(',').map(Number);
  function posterCamera() {
    if (!posterSize || stage.reducedMotion || closeCam) return null;
    const { w: Wp, h: Hp } = posterSize;
    const pc = new THREE.PerspectiveCamera(cam.fov, Wp / Hp, cam.near, cam.far);
    const pf = fitFor(Wp, Hp); // the framing the still was rendered with
    placeCamera(pc, 0, 0, view.focusPoint, 0, false, Wp, Hp, pf);
    const W = stage.width;
    const H = stage.height;
    let [s, x0, y0] = posterFit.length === 3 && posterFit.every(Number.isFinite) && posterFit[0] > 0 ? posterFit : [0, 0, 0];
    if (!s) {
      s = Math.max(W / Wp, H / Hp); // plain "cover"
      x0 = (W - Wp * s) / 2;
      y0 = (H - Hp * s) / 2;
    }
    pc.setViewOffset(Wp, Hp, -x0 / s, -y0 / s - shiftFor(Wp, Hp, pf), W / s, H / s);
    pc.updateMatrixWorld();
    return pc;
  }
  /**
   * For tools/posters/render-posters.cjs: this screen's framing, rendered with a margin of ox / oy
   * (fractions of the width / height) all round, plus where everything the page copy has to clear
   * lands in the un-margined frame (CSS px). With those the page can fit the still to any screen.
   */
  function still(ox: number, oy: number) {
    const W = stage.width;
    const H = stage.height;
    stage.pause();
    placeCamera(cam, 0, 0, view.focusPoint, 0, false, W, H, fit);
    cam.updateMatrixWorld();
    const proj = ([x, y, z]: [number, number, number]) => {
      const v = tmpB.set(x, y, z).project(cam);
      return [Math.round(((v.x + 1) / 2) * W * 10) / 10, Math.round(((1 - v.y) / 2) * H * 10) / 10];
    };
    const head = CLEAR_BELOW_HEAD.map(proj);
    const foot = CLEAR_ABOVE_FOOT.map(proj);
    cam.setViewOffset(W, H, -ox * W, -oy * H - shiftFor(W, H, fit), W * (1 + 2 * ox), H * (1 + 2 * oy));
    const before = renderer.getSize(new THREE.Vector2());
    renderer.setSize(Math.round(W * (1 + 2 * ox)), Math.round(H * (1 + 2 * oy)), false);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/webp', 0.8);
    renderer.setSize(before.x, before.y, false);
    placeCamera(cam, 0, 0, view.focusPoint, 0, false, W, H, fit);
    renderer.render(scene, cam);
    return { url, head, foot };
  }
  const qTmp = new THREE.Quaternion();
  const TIME_BLEND = 2.6;
  function applyHandoff(dt: number) {
    if (!live) return;
    handoff.t += dt;
    if (timeHandoff.k < 1) timeHandoff.k = smoothstep(HANDOFF_HOLD, HANDOFF_HOLD + TIME_BLEND, handoff.t);
    if (!handoff.cam) return;
    const k = smoothstep(HANDOFF_HOLD, HANDOFF_HOLD + HANDOFF_BLEND, handoff.t);
    if (k >= 1) {
      handoff.cam = null;
      return;
    }
    const pc = handoff.cam;
    cam.position.lerpVectors(pc.position, cam.position, k);
    cam.quaternion.copy(qTmp.slerpQuaternions(pc.quaternion, cam.quaternion, k));
    const a = pc.projectionMatrix.elements;
    const b = cam.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) b[i] = a[i] + (b[i] - a[i]) * k;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.updateMatrixWorld();
  }

  function frameCamera(dt = 0.016) {
    // focus: glide toward whatever the visitor is pointing at (nav hover, intro)
    view.focusW = damp(view.focusW, view.focusGoal ? 1 : 0, 3.2, dt);
    if (view.focusGoal) view.focusPoint.lerp(view.focusGoal, 1 - Math.exp(-dt * 4));
    view.lean = damp(view.lean, view.leanGoal, 4, dt);
    view.talkW = damp(view.talkW, director.introActive ? 1 : 0, 1.6, dt);
    placeCamera(cam, view.focusW, view.lean, view.focusPoint, view.talkW, true);
    applyHandoff(dt);
    if (closeCam) {
      cam.clearViewOffset();
      const hd = sheev.headTop.getWorldPosition(new THREE.Vector3());
      cam.position.copy(hd).add(new THREE.Vector3(1.0, 0.1, 2.4));
      cam.lookAt(hd.clone().add(new THREE.Vector3(0, -0.55, 0)));
    }
  }

  /* ---------- nav tags: every page has an object ---------- */
  const navObjects: Record<Exclude<NavKey, 'home'>, { obj: THREE.Object3D; text: string; href: string; offset: THREE.Vector3; focus: THREE.Vector3 }> = {
    // the tag sits on the cork itself (above it is the page copy, below it is sheev)
    blog: { obj: F.board.group, text: 'blog', href: '/blog', offset: new THREE.Vector3(0, 0.06, 0.06), focus: new THREE.Vector3(-0.5, 1.75, -2.7) },
    books: { obj: F.shelf.group, text: 'books', href: '/books', offset: new THREE.Vector3(0, 1.5, 0.3), focus: new THREE.Vector3(3.4, 1.15, -2.6) },
    films: { obj: F.filmScreen.group, text: 'films', href: '/films', offset: new THREE.Vector3(0, 0.36, 0), focus: new THREE.Vector3(-2.5, 1.1, -2.3) },
    travel: { obj: F.travelWall, text: 'travel', href: '/travel', offset: new THREE.Vector3(0.465, 0.22, 0), focus: new THREE.Vector3(3.55, 2.0, -2.7) },
    now: { obj: F.laptop.group, text: 'now', href: '/now', offset: new THREE.Vector3(0.3, 0.3, 0), focus: new THREE.Vector3(-0.2, 1.0, -1.9) },
  };
  const tags = Object.fromEntries(Object.entries(navObjects).map(([k, v]) => [k, new Tag(stage, v.obj, v.text, v.href, v.offset)])) as Record<
    Exclude<NavKey, 'home'>,
    Tag
  >;
  const headCopy = headEl ? Array.from(headEl.querySelectorAll('nav, h1, p')) : [];
  Object.values(tags).forEach((t) => (t.avoid = headCopy));
  let tagsUntil = 0;
  const tagHover: Partial<Record<NavKey, boolean>> = {};
  const pulse = new Map<THREE.Object3D, number>();
  function emphasise(o: THREE.Object3D) {
    if (!o.userData.baseScale) o.userData.baseScale = o.scale.clone();
    pulse.set(o, 1);
  }

  /* ---------- the three values, as objects ---------- */
  const valueTags = {
    cheat: new Tag(stage, F.cheatCodes, 'cheat codes', undefined, new THREE.Vector3(0, 0.2, 0)),
    ipod: new Tag(stage, F.ipod, 'ipod nano, gen 3', undefined, new THREE.Vector3(0, 0.12, 0)),
    book: new Tag(stage, F.howToTalk, 'how to talk to anyone', undefined, new THREE.Vector3(0, 0.14, 0)),
  };
  const valueObjects = { cheat: F.cheatCodes, ipod: F.ipod, book: F.howToTalk };

  /* ---------- the intro ---------- */
  const intro = opts.intro && opts.intro.length ? opts.intro : DEFAULT_INTRO;
  const focusFor = (item: SpeechItem): keyof typeof valueObjects | null => {
    const t = (item.title ?? '').trim();
    if (/^1\//.test(t)) return 'cheat';
    if (/^2\//.test(t)) return 'ipod';
    if (/^3\//.test(t)) return 'book';
    return null;
  };
  let introIndex = -1;
  let focus: keyof typeof valueObjects | null = null;
  let focusGlance = 0;
  function showIntro(i: number) {
    introIndex = i;
    bubble.hide();
    Object.values(valueTags).forEach((t) => t.show(false));
    focus = focusFor(intro[i]);
    speech.avoidObjects = [F.board.group];
    speech.avoidEls = [];
    if (focus) {
      valueTags[focus].show(true);
      emphasise(valueObjects[focus]);
      focusGlance = 1.3;
      // never cover the thing he's talking about (or its label)
      speech.avoidObjects = [F.board.group, valueObjects[focus]];
      speech.avoidEls = [valueTags[focus].el];
    }
    speech.say(intro[i], i, intro.length);
  }
  function endIntro() {
    speech.hide();
    Object.values(valueTags).forEach((t) => t.show(false));
    focus = null;
    introIndex = -1;
    director.endIntro();
    try {
      localStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {}
    tagsUntil = performance.now() + 7000;
  }
  const restoreIntroNext = () => (speech.onNext = () => (introIndex + 1 < intro.length ? showIntro(introIndex + 1) : endIntro()));
  restoreIntroNext();
  speech.onSkip = () => endIntro();
  function playIntro() {
    zzz.active = false;
    director.startIntro();
    setTimeout(() => showIntro(0), 900);
  }
  const seen = (() => {
    try {
      return localStorage.getItem(INTRO_SEEN_KEY) === '1';
    } catch {
      return false;
    }
  })();
  const auto = params.get('intro') === '1' ? 'always' : params.get('intro') === '0' ? 'never' : opts.autoIntro ?? 'auto';
  let introTimer = 0;
  let disposed = false;
  // greet only once the room is actually on screen (see `ready` below)
  const greet = () => {
    if (disposed) return;
    introTimer =
      auto === 'always' || (auto === 'auto' && !seen)
        ? window.setTimeout(playIntro, stage.reducedMotion ? 300 : 1200)
        : window.setTimeout(() => {
            if (auto !== 'never') bubble.say({ text: 'welcome back.' }, 2200);
            tagsUntil = performance.now() + 5000;
          }, 900);
  };

  /* ---------- interactions ---------- */
  let quoteIndex = -1;
  let ipodSpin = 0;
  let lilyBloom = 0;
  const sayValue = (k: keyof typeof valueObjects) => {
    const i = intro.findIndex((it) => focusFor(it) === k);
    if (i < 0) return;
    director.startIntro();
    showIntro(i);
    speech.onNext = () => endIntro();
  };
  const filmsHotspot: Hotspot = { object: F.projector.group, title: 'films', sub: 'favourites →', href: '/films' };
  const hotspots: Hotspot[] = [
    { object: F.diary, title: 'blog', sub: 'the diary · all posts →', href: '/blog' },
    // the board: each card is a post; the cork + frame is the whole blog
    ...F.board.cards
      .filter((c) => c.userData.post)
      .map((c): Hotspot => ({ object: c, title: 'blog', sub: `${(c.userData.post as BoardPost).title.toLowerCase()} →`, href: (c.userData.post as BoardPost).href })),
    { object: F.board.group, title: 'blog', sub: 'his latest posts · all posts →', href: '/blog' },
    { object: F.laptop.group, title: 'now', sub: 'building at the intersection of ai × creativity →', href: '/now' },
    { object: F.cheatCodes, title: 'cheat codes', sub: 'what i sold as a kid', onClick: () => sayValue('cheat') },
    { object: F.shelf.camera, title: 'travel', sub: 'the film camera →', href: '/travel' },
    { object: F.shelf.group, title: 'books', sub: 'the shelf →', href: '/books' },
    { object: F.travelWall, title: 'travel', sub: 'jaipur · la union · singapore · ho chi minh city →', href: '/travel' },
    { object: F.filmScreen.group, title: 'films', sub: 'now showing →', href: '/films' },
    filmsHotspot,
    { object: F.armchair, title: 'films', sub: 'the film corner →', href: '/films' },
    { object: F.bike.group, title: 'the bike', sub: "don't play their game →", href: '/blog/dont-play-their-game' },
    { object: F.poster, title: 'inspired by rebels', sub: 'rebellion →', href: '/blog/rebellion' },
    { object: F.map, title: 'map of hiraeth', sub: 'an imaginary country →', href: '/blog/building-an-imaginary-country' },
    { object: F.paddle, title: 'pickleball paddle', sub: 'the art of experimentation →', href: '/blog/the-art-of-experimentation' },
    {
      object: F.vase,
      title: 'lilies',
      sub: 'lily mode',
      onClick: () => {
        lilyBloom = 1;
        bubble.say({ text: 'lilies. i love them.', href: '/blog/i-hate-current-operating-systems' });
      },
    },
    {
      object: F.ipod,
      title: 'ipod nano, gen 3',
      sub: 'a gift from dad, age 12',
      onClick: () => {
        ipodSpin = 1;
        sayValue('ipod');
      },
    },
    { object: F.howToTalk, title: 'how to talk to anyone', sub: 'dad brought it home in high school', onClick: () => sayValue('book') },
    { object: F.lamp.group, title: 'desk lamp', sub: 'click to switch', onClick: () => (lampOverride = !(lampOverride ?? posterTimeAt(posterSpec, currentHours()).tone === 'dark')) },
    {
      object: F.windowArea,
      title: 'the window',
      sub: 'click to change the hour',
      onClick: () => {
        const order = [8.5, 13, 18.3, 23.2];
        const cur = currentHours();
        setHours(order.find((h) => h > cur + 0.01) ?? order[0]);
      },
    },
    { object: F.clock.group, title: 'bangalore time', sub: 'click to go live', onClick: () => setHours(null) },
  ];
  const clockSpot = hotspots[hotspots.length - 1];
  const unwire = wireHotspots(stage, hotspots, label, [sheev.root]);
  /** Is sheev the first thing under the pointer (not hidden behind the laptop etc.)? */
  const sheevUnder = (x: number, y: number) => {
    const hit = stage.pickAt(x, y, [sheev.root, ...hotspots.map((h) => h.object)])[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o) {
      if (o === sheev.root) return true;
      o = o.parent;
    }
    return false;
  };
  if (params.has('debug')) {
    // QA hook: a visible, pickable screen point for every hotspot
    const owner = (o: THREE.Object3D | null) => {
      while (o) {
        const s = hotspots.find((h) => h.object === o);
        if (s) return s;
        o = o.parent;
      }
      return null;
    };
    (window as unknown as { __awe: unknown }).__awe = {
      fit: () => ({ fit, copy, at: (W: number, H: number) => fitFor(W, H) }),
      project(x: number, y: number, z: number) {
        const o = stage.toScreen(new THREE.Vector3(x, y, z));
        return { x: Math.round(o.x), y: Math.round(o.y) };
      },
      spots() {
        const r = container.getBoundingClientRect();
        const box = new THREE.Box3();
        const p = new THREE.Vector3();
        const sc = { x: 0, y: 0, behind: false };
        return hotspots.map((h) => {
          box.setFromObject(h.object);
          const c = box.getCenter(new THREE.Vector3());
          stage.toScreen(c, sc);
          const centre = { x: sc.x, y: sc.y };
          let best: { x: number; y: number } | null = null;
          let bestD = Infinity;
          const n = 7;
          for (let i = 0; i <= n; i++)
            for (let j = 0; j <= n; j++)
              for (let k = 0; k <= 2; k++) {
                p.set(THREE.MathUtils.lerp(box.min.x, box.max.x, i / n), THREE.MathUtils.lerp(box.min.y, box.max.y, j / n), THREE.MathUtils.lerp(box.min.z, box.max.z, k / 2));
                stage.toScreen(p, sc);
                if (sc.behind || sc.x < 2 || sc.y < 2 || sc.x > stage.width - 2 || sc.y > stage.height - 2) continue;
                const hit = stage.pickAt(sc.x + r.left, sc.y + r.top, [sheev.root, ...hotspots.map((s) => s.object)])[0];
                if (!hit || owner(hit.object) !== h) continue;
                const d = Math.hypot(sc.x - centre.x, sc.y - centre.y);
                if (d < bestD) {
                  bestD = d;
                  best = { x: sc.x + r.left, y: sc.y + r.top };
                }
              }
          return { title: h.title, href: h.href ?? null, at: best };
        });
      },
    };
  }

  let dragMoved = 0;
  const onCanvasClick = (e: MouseEvent) => {
    if (dragMoved > 6) return; // that was a drag, not a click
    if (!sheevUnder(e.clientX, e.clientY)) return;
    if (speech.visible) return;
    quoteIndex = (quoteIndex + 1) % (QUOTES.length + 1);
    zzz.active = false;
    if (quoteIndex === 0) {
      restoreIntroNext();
      playIntro();
      return;
    }
    director.greet(QUOTES[quoteIndex - 1]);
  };
  stage.canvas.addEventListener('click', onCanvasClick, true);
  const onHoverSheev = (e: PointerEvent) => {
    if (e.target !== stage.canvas || dragging) return;
    if (sheevUnder(e.clientX, e.clientY)) {
      label.show('sheev', speech.visible ? 'talking…' : 'say hi', e.clientX, e.clientY);
      stage.canvas.style.cursor = 'pointer';
    }
  };
  window.addEventListener('pointermove', onHoverSheev, { passive: true });

  /* ---------- drag to look around ---------- */
  // further to the right (the bike, the paddle) than to the left (just a plant)
  const YAW_MIN = -0.62;
  const YAW_MAX = 0.36;
  let dragging = false;
  let lastX = 0;
  const hint = container.querySelector<HTMLElement>('[data-hero-hint]');
  try {
    if (localStorage.getItem(DRAGGED_KEY) === '1') hint?.classList.add('is-done');
  } catch {}
  const onDown = (e: PointerEvent) => {
    dragging = true;
    dragMoved = 0;
    lastX = e.clientX;
    stage.canvas.setPointerCapture?.(e.pointerId);
  };
  const onMoveDrag = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    dragMoved += Math.abs(dx);
    // the room follows the pointer (street-view style): drag left to see what's on the right
    view.yaw = clamp(view.yaw + dx * 0.0032, YAW_MIN, YAW_MAX);
    view.yawVel = dx * 0.0032 * 60;
    if (dragMoved > 24 && hint && !hint.classList.contains('is-done')) {
      hint.classList.add('is-done');
      try {
        localStorage.setItem(DRAGGED_KEY, '1');
      } catch {}
    }
    if (dragMoved > 6) stage.canvas.style.cursor = 'grabbing';
  };
  const onUp = () => {
    dragging = false;
    if (stage.canvas.style.cursor === 'grabbing') stage.canvas.style.cursor = '';
  };
  stage.canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMoveDrag, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  /* ---------- per-frame ---------- */
  const pointerWorld = new THREE.Vector3();
  const camWorld = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0);
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  let glanceIn = 6;
  let glanceT = 0;
  let timeAccum = 0;
  let filmT = 0;
  let cookieT = 0;

  function upright(prop: THREE.Object3D, tilt = 0) {
    if (!prop.visible || !prop.parent) return;
    prop.parent.getWorldQuaternion(qa);
    qb.setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
    const yaw = new THREE.Quaternion().setFromAxisAngle(up, sheev.root.rotation.y);
    prop.quaternion.copy(qa.invert().multiply(yaw).multiply(qb));
  }

  stage.onFrame((dt, t) => {
    timeAccum += dt;
    applyTime(dt);
    // the part of the day just changed: start its loop now, not when the old one runs out
    const key = loopKey(realHours());
    if (key !== loopNow) {
      loopNow = key;
      director.restart();
    }
    if (timeAccum > 30) {
      timeAccum = 0;
      updateCaption();
    }
    // dappled light: the rain tree outside sways (redrawn ~12×/s)
    cookieT += dt;
    if (cookieT > 0.08 && !stage.reducedMotion) {
      cookieT = 0;
      cookie.draw(t);
    }

    F.chair.position.z = damp(F.chair.position.z, chairSeated ? SEAT.z - 0.02 : SEAT.outZ, 6, dt);
    if (chairSeated && director.seated === 'desk') sheev.root.position.z = F.chair.position.z + 0.02;
    if (director.seated === 'lounge') sheev.root.position.set(F.armchair.position.x, 0, F.armchair.position.z - 0.05);

    cam.getWorldPosition(camWorld);
    const recentPointer = performance.now() - stage.lastPointerMove < 2500 && stage.pointerInside && !dragging;
    if (director.introActive) {
      focusGlance -= dt;
      if (focus && focusGlance > 0 && focusGlance < 1.1) sheev.lookAt(valueObjects[focus].getWorldPosition(tmp), 1);
      else sheev.lookAt(camWorld, 1);
    } else if (director.mode === 'greeting') {
      sheev.lookAt(camWorld, 1);
    } else if (director.seated === 'lounge') {
      sheev.lookAt(F.filmScreen.group.getWorldPosition(tmp), 0.9);
    } else if (recentPointer) {
      ray.setFromCamera(stage.pointer, cam);
      sheev.headTop.getWorldPosition(tmp);
      pointerWorld.copy(ray.ray.origin).addScaledVector(ray.ray.direction, ray.ray.origin.distanceTo(tmp));
      sheev.lookAt(pointerWorld, director.mode === 'walking' ? 0.5 : 0.85);
    } else {
      glanceIn -= dt;
      if (glanceIn <= 0 && director.mode === 'acting' && director.task?.pose !== 'sleepDesk') {
        glanceT = 1.8;
        glanceIn = 8 + Math.random() * 7;
      }
      if (glanceT > 0) {
        glanceT -= dt;
        sheev.lookAt(camWorld, 0.9);
      } else sheev.lookAt(null);
    }

    sheev.talking = speech.talking;
    director.update(stage.reducedMotion ? dt * 0.6 : dt);
    zzz.active = !director.introActive && director.task?.pose === 'sleepDesk' && director.mode === 'acting';
    upright(handMug, -0.35 * Math.max(0, Math.sin(Math.min(director.task?.pose === 'sip' ? sheev.stateTime / 4.2 : 0, 1) * Math.PI)));
    upright(handCan, director.task?.pose === 'water' ? -0.6 - Math.sin(t * 1.2) * 0.25 : 0);

    const [hh, mm, ss] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .format(new Date())
      .split(':')
      .map(Number);
    const liveClock = hoursOverride === null && !params.has('time');
    const showH = liveClock && timeHandoff.k >= 1 ? hh + mm / 60 + ss / 3600 : currentHours();
    const secs = liveClock ? (ss / 60) * timeHandoff.k : 0; // the still was rendered with the hand at 12
    F.clock.hour.rotation.z = -((showH % 12) / 12) * Math.PI * 2;
    F.clock.minute.rotation.z = -(showH % 1) * Math.PI * 2;
    F.clock.second.rotation.z = -secs * Math.PI * 2;
    clockSpot.sub = hoursOverride === null ? `${bangaloreTime().label} · live` : 'click to go live';

    F.projector.reels.forEach((r, i) => (r.rotation.z -= dt * (i ? 2.6 : 2.0)));
    F.filmScreen.flicker(t);
    F.beam.update(t);
    filmT += dt;
    if (filmT > 3.6) {
      filmT = 0;
      F.filmScreen.next();
    }
    const [ft, fy] = F.filmScreen.current;
    filmsHotspot.sub = `now showing: ${ft} (${fy}) →`;

    lilyBloom = Math.max(0, lilyBloom - dt * 0.5);
    lilyHeadsAll.forEach((h, i) => {
      h.quaternion.copy(h.userData.base as THREE.Quaternion);
      h.rotateZ(Math.sin(t * 0.9 + i) * 0.04 + lilyBloom * Math.sin(t * 12 + i) * 0.15);
      h.scale.setScalar(1 + lilyBloom * 0.25);
    });
    if (ipodSpin > 0) {
      ipodSpin = Math.max(0, ipodSpin - dt * 0.7);
      F.ipod.rotation.y += dt * 10 * ipodSpin;
    }
    pulse.forEach((p, o) => {
      const np = Math.max(0, p - dt * 0.9);
      const base = o.userData.baseScale as THREE.Vector3;
      o.scale.copy(base).multiplyScalar(1 + Math.sin((1 - np) * Math.PI * 3) * 0.06 * np);
      if (np <= 0) {
        o.scale.copy(base);
        pulse.delete(o);
      } else pulse.set(o, np);
    });

    const showAll = performance.now() < tagsUntil;
    (Object.keys(tags) as (keyof typeof tags)[]).forEach((k) => {
      const on = !director.introActive && (showAll || !!tagHover[k]);
      if (on !== tags[k].visible) tags[k].show(on);
      tags[k].update();
    });
    Object.values(valueTags).forEach((v) => v.update());

    if (!dragging) {
      view.yaw += view.yawVel * dt;
      view.yawVel *= Math.exp(-dt * 5);
      view.yaw = clamp(view.yaw, YAW_MIN, YAW_MAX);
    }
    frameCamera(dt);
    bubble.update();
    speech.update(dt);
    zzz.update();
    sky.uniforms.uTime.value = t;
    if (caption) caption.style.opacity = speech.visible ? '0' : '';
    hint?.classList.toggle('is-talking', speech.visible);
  });
  stage.onResize(() => {
    measureCopy();
    fit = fitFor(stage.width, stage.height);
    if (handoff.cam) handoff.cam = posterCamera();
    frameCamera(0);
  });

  function setHours(h: number | null) {
    hoursOverride = h;
    timeHandoff.k = 1;
    lampOverride = null;
    const s = sampleTime(currentHours());
    rainOn = s.phase === 'night' && rainParam !== '0';
    tstate = s;
    updateCaption();
  }

  /** Nav links call this on hover: the camera glides to the object that leads there. */
  function highlight(key: NavKey, on: boolean) {
    if (key === 'home') {
      view.focusGoal = on ? new THREE.Vector3(SEAT.x, 1.0, SEAT.z + 0.4) : null;
      if (view.focusGoal) {
        view.leanGoal = leanFor(view.focusGoal);
        if (view.focusW < 0.05) view.focusPoint.copy(view.focusGoal);
      }
      return;
    }
    tagHover[key] = on;
    if (on) {
      emphasise(navObjects[key].obj);
      view.focusGoal = navObjects[key].focus.clone();
      view.leanGoal = leanFor(view.focusGoal);
      if (view.focusW < 0.05) view.focusPoint.copy(view.focusGoal);
    } else if (Object.values(tagHover).every((v) => !v)) {
      view.focusGoal = null;
    }
  }

  /* ---------- skins ---------- */
  let printer: SeparationPrinter | null = null;
  let skin: 'clay' | 'print' = 'clay';
  function setSkin(next: 'clay' | 'print') {
    skin = next;
    if (next === 'print') {
      if (!printer) {
        printer = new SeparationPrinter(renderer, { cell: 3.4 });
        if (prefersDark()) printer.setColors('#141210', '#e6e2dc', '#ff3c00', true);
        printer.resize(stage.width, stage.height, stage.dpr);
      }
      stage.setRender(() => printer!.render(scene, cam));
    } else {
      stage.setRender(() => renderer.render(scene, cam));
    }
    if (live) stage.renderOnce();
  }
  stage.onResize((w, h) => printer?.resize(w, h, stage.dpr));
  const skinParam = params.get('skin');
  setSkin(skinParam === 'print' || skinParam === 'clay' ? skinParam : opts.skin ?? 'clay');

  updateCaption(director.task);
  // frame the room around the page copy now that the caption has its words
  measureCopy();
  fit = fitFor(stage.width, stage.height);
  frameCamera();

  /* ---------- reveal: only once the first frame is complete ---------- */
  // wait for the sculpted body, compile every shader off the main thread, then start the loop.
  // The page keeps showing its poster until this resolves, so the swap is invisible.
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const frames = (n: number) => new Promise<void>((r) => {
    const tick = () => (--n <= 0 ? r() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
  const ready = (async () => {
    await Promise.race([bodyReady, sleep(8000)]);
    if (disposed) return;
    try {
      await renderer.compileAsync(scene, cam);
    } catch {}
    if (disposed) return;
    handoff.cam = posterCamera();
    handoff.t = 0;
    setTimeout(() => {
      if (!disposed && hoursOverride === null) rainOn = rainWanted;
    }, (HANDOFF_HOLD + 0.6) * 1000);
    stage.step(0.05);
    stage.start();
    live = true;
    await frames(2);
  })();
  ready.then(greet);

  return {
    stage,
    setHours,
    setRain(on: boolean) {
      rainOn = rainWanted = on;
    },
    setSkin,
    get skin() {
      return skin;
    },
    playIntro: () => {
      restoreIntroNext();
      playIntro();
    },
    highlight,
    ready,
    still,
    dispose() {
      disposed = true;
      clearTimeout(introTimer);
      unwire();
      stage.canvas.removeEventListener('click', onCanvasClick, true);
      window.removeEventListener('pointermove', onHoverSheev);
      stage.canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMoveDrag);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      bubble.dispose();
      speech.dispose();
      zzz.dispose();
      label.dispose();
      Object.values(tags).forEach((t) => t.dispose());
      Object.values(valueTags).forEach((t) => t.dispose());
      caption?.remove();
      printer?.dispose();
      disposeTree(scene);
      pmrem.dispose();
      stage.dispose();
      stage.canvas.remove();
    },
  };
}
