import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { clamp, damp, lerp, smoothstep, TAU } from './util';
import { clayMaterials, type MaterialFactory, type MaterialRole } from './materials';

/* ================================================================== */
/* Sheev — a procedural, fully rigged stand-in for the real sheev.       */
/* Likeness cues from his travel photos: shaved head, full short black   */
/* beard, warm brown skin, olive overshirt over a black tee, a black     */
/* crossbody sling, apple watch on the left wrist, white sneakers.       */
/* ================================================================== */

export const JOINTS = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'elbowL',
  'wristL',
  'shoulderR',
  'elbowR',
  'wristR',
  'hipL',
  'kneeL',
  'ankleL',
  'hipR',
  'kneeR',
  'ankleR',
] as const;
export type JointName = (typeof JOINTS)[number];
export type V3 = [number, number, number];

export interface Pose {
  j: Partial<Record<JointName, V3>>;
  /** Offset of the hips joint from its rest position (root space). */
  hips?: V3;
  /** IK targets in the character's root space. */
  ik?: { handL?: V3; handR?: V3; footL?: V3; footR?: V3; poleL?: V3; poleR?: V3 };
  /** Facial expression hints. */
  face?: { brow?: number; smile?: number; eyesClosed?: number };
}
export type PoseFn = (t: number, c: Sheev) => Pose;

export interface Outfit {
  skin: string;
  head: string;
  beard: string;
  brow: string;
  eye: string;
  lips: string;
  shirt: string;
  shirtDark: string;
  tee: string;
  pants: string;
  shoes: string;
  sole: string;
  accent: string;
  strap: string;
  watch: string;
  hat?: string;
}

export const SHEEV_OUTFIT: Outfit = {
  skin: '#a5694a',
  head: '#a86c4c',
  beard: '#1c1512',
  brow: '#17100d',
  eye: '#140e0b',
  lips: '#a5614f',
  shirt: '#6e6f48',
  shirtDark: '#5d5e3c',
  tee: '#1f1f21',
  pants: '#2b3141',
  shoes: '#f2efe9',
  sole: '#d8d1c5',
  accent: '#ff3c00',
  strap: '#161616',
  watch: '#141414',
};

/** Magritte's bowler-hat men: the identical crowd for "don't play their game". */
export const CLONE_OUTFIT: Outfit = {
  skin: '#b9b4ab',
  head: '#b9b4ab',
  beard: '#b9b4ab',
  brow: '#3a3a3a',
  eye: '#2a2a2a',
  lips: '#9b958c',
  shirt: '#55575c',
  shirtDark: '#46484d',
  tee: '#e9e6e0',
  pants: '#4a4c51',
  shoes: '#202020',
  sole: '#151515',
  accent: '#2a2a2a',
  strap: '#2a2a2a',
  watch: '#2a2a2a',
  hat: '#26272a',
};

export interface SheevOptions {
  outfit?: Partial<Outfit>;
  materials?: MaterialFactory;
  variant?: 'sheev' | 'clone';
  shadows?: boolean;
  /** Extra props in the face: headphones around the neck. */
  headphones?: boolean;
}

/* ------------------------------------------------------------------ */
/* skeleton dimensions                                                  */
/* ------------------------------------------------------------------ */
const HIPS_Y = 0.92;
const THIGH = 0.415;
const SHIN = 0.38;
const UPPER_ARM = 0.27;
const FOREARM = 0.245;
export const STRIDE = 0.86; // metres per full walk cycle (two steps)

const REST: Record<JointName, V3> = {
  hips: [0, HIPS_Y, 0],
  spine: [0, 0.06, 0],
  chest: [0, 0.13, 0],
  neck: [0, 0.35, 0],
  head: [0, 0.06, 0],
  // must match SH_X in tools/character/build_sheev.py
  shoulderL: [0.23, 0.285, 0],
  elbowL: [0, -UPPER_ARM, 0],
  wristL: [0, -FOREARM, 0],
  shoulderR: [-0.23, 0.285, 0],
  elbowR: [0, -UPPER_ARM, 0],
  wristR: [0, -FOREARM, 0],
  hipL: [0.095, -0.06, 0],
  kneeL: [0, -THIGH, 0],
  ankleL: [0, -SHIN, 0],
  hipR: [-0.095, -0.06, 0],
  kneeR: [0, -THIGH, 0],
  ankleR: [0, -SHIN, 0],
};
const PARENT: Record<JointName, JointName | null> = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  shoulderL: 'chest',
  elbowL: 'shoulderL',
  wristL: 'elbowL',
  shoulderR: 'chest',
  elbowR: 'shoulderR',
  wristR: 'elbowR',
  hipL: 'hips',
  kneeL: 'hipL',
  ankleL: 'kneeL',
  hipR: 'hips',
  kneeR: 'hipR',
  ankleR: 'kneeR',
};

/** World-space rest position of a joint (character root at the origin). */
export function restWorld(name: JointName) {
  const v = new THREE.Vector3();
  let n: JointName | null = name;
  while (n) {
    v.add(new THREE.Vector3(...REST[n]));
    n = PARENT[n];
  }
  return v;
}

function findMesh(root: THREE.Object3D, name: string) {
  let found: THREE.Mesh | null = null;
  root.traverse((c) => {
    if (!found && (c as THREE.Mesh).isMesh && c.name === name) found = c as THREE.Mesh;
  });
  return found as THREE.Mesh | null;
}

/* ------------------------------------------------------------------ */
/* geometry helpers                                                     */
/* ------------------------------------------------------------------ */
const capsule = (r: number, h: number, radial = 14) => new THREE.CapsuleGeometry(r, h, 6, radial, 1);
const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r);
const sphere = (seg = 24) => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));

/** Beard: a sphere shell whose upper vertices sink inside the skull. */
function beardGeometry() {
  const g = new THREE.SphereGeometry(1, 44, 30, -Math.PI / 2, TAU, 0, Math.PI);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const front = smoothstep(-0.05, 0.92, v.z); // 0 at the ears, 1 at the chin
    const boundary = lerp(0.1, -0.3, front); // sideburns high, moustache line low
    let r = 1;
    const inBeard = v.y < boundary && v.z > -0.28;
    if (!inBeard) r = 0.9;
    // fuller chin
    if (inBeard && v.y < -0.45) r += 0.07 * smoothstep(-0.45, -0.95, v.y) * smoothstep(-0.2, 0.6, v.z);
    // thinner near the boundary so the beard edge reads as groomed, not glued on
    if (inBeard) r -= 0.03 * smoothstep(boundary - 0.25, boundary, v.y);
    v.multiplyScalar(r);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Strap that hugs the torso, from left shoulder across the chest to the right hip. */
function strapGeometry() {
  const pts = [
    new THREE.Vector3(0.115, 0.335, -0.06),
    new THREE.Vector3(0.13, 0.3, 0.06),
    new THREE.Vector3(0.07, 0.19, 0.127),
    new THREE.Vector3(-0.03, 0.06, 0.133),
    new THREE.Vector3(-0.12, -0.06, 0.112),
    new THREE.Vector3(-0.185, -0.13, 0.03),
    new THREE.Vector3(-0.19, -0.16, -0.07),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 40, 0.0135, 6, false);
}

/* ------------------------------------------------------------------ */
/* the character                                                         */
/* ------------------------------------------------------------------ */
interface Snapshot {
  q: THREE.Quaternion[];
  hips: THREE.Vector3;
  face: { brow: number; smile: number; eyesClosed: number };
}

export class Sheev {
  readonly root = new THREE.Group();
  readonly j = {} as Record<JointName, THREE.Object3D>;
  readonly outfit: Outfit;
  readonly variant: 'sheev' | 'clone';
  readonly poses: Record<string, PoseFn> = { ...BASE_POSES };

  /** Anchor for speech bubbles (above the head). */
  readonly headTop = new THREE.Object3D();
  /** Attach props to these. */
  readonly handR = new THREE.Object3D();
  readonly handL = new THREE.Object3D();

  state = 'idle';
  private prev: string | null = null;
  private fade = 0.45;
  private fadeT = 1;
  stateTime = 0;
  private prevTime = 0;

  /** Locomotion speed (m/s); drives the walk cycle so feet don't slide. */
  speed = 0;
  walkPhase = 0;
  /** Seat height for seated poses. */
  seatHeight = 0.47;
  /** Anything poses want to read (e.g. pedal angle). */
  params: Record<string, number> = {};

  look: { target: THREE.Vector3 | null; weight: number; yaw: number; pitch: number } = {
    target: null,
    weight: 0,
    yaw: 0,
    pitch: 0,
  };
  private lookW = 0;
  private blinkIn = 2.5;
  private blinkT = -1;
  faceOverride: { brow?: number; smile?: number } = {};
  /** set while a speech bubble is typing — flaps the mouth */
  talking = false;
  private talkAmt = 0;
  private mouthOpen: THREE.Mesh | null = null;
  private face = { brow: 0, smile: 0, eyesClosed: 0 };

  private torso!: THREE.Mesh;
  private torsoScale = new THREE.Vector3();
  private strap: THREE.Mesh | null = null;
  private accents: THREE.Mesh[] = [];
  private watch: THREE.Mesh[] = [];
  /** sculpted, skinned body (see applyBody) */
  private skin: {
    bones: Record<JointName, THREE.Bone>;
    bindQ: Record<JointName, THREE.Quaternion>;
    parentInv: Record<JointName, THREE.Quaternion>;
    hipsBind: THREE.Vector3;
    hipsParentInv: THREE.Quaternion;
  } | null = null;
  private eyes: THREE.Object3D[] = [];
  private brows: THREE.Object3D[] = [];
  private browBaseY = 0;
  private mouth!: THREE.Object3D;
  private mouthBase = new THREE.Vector3(1, 1, 1);
  private time = 0;
  private snapA: Snapshot;
  private snapB: Snapshot;
  private mats: MaterialFactory;

  constructor(opts: SheevOptions = {}) {
    this.variant = opts.variant ?? 'sheev';
    this.outfit = { ...(this.variant === 'clone' ? CLONE_OUTFIT : SHEEV_OUTFIT), ...opts.outfit };
    this.mats = opts.materials ?? clayMaterials();
    this.buildSkeleton();
    this.buildBody(opts);
    this.snapA = this.makeSnapshot();
    this.snapB = this.makeSnapshot();
    const shadows = opts.shadows ?? true;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = shadows && !m.userData.noShadow;
        m.receiveShadow = false;
      }
    });
    this.root.userData.character = this;
    this.update(0);
  }

  /* ---------------- construction ---------------- */
  private m(role: MaterialRole, color: string) {
    return this.mats(role, color);
  }

  private buildSkeleton() {
    for (const name of JOINTS) {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(...REST[name]);
      this.j[name] = o;
    }
    for (const name of JOINTS) {
      const parent = PARENT[name];
      (parent ? this.j[parent] : this.root).add(this.j[name]);
    }
  }

  private add(joint: JointName, geo: THREE.BufferGeometry, mat: THREE.Material, pos: V3, rot?: V3, scale?: V3) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    if (scale) mesh.scale.set(...scale);
    mesh.userData.prim = true; // primitive body part (hidden once the sculpted body loads)
    this.j[joint].add(mesh);
    return mesh;
  }

  /** Mark meshes that survive the switch to the sculpted body (face features, accessories). */
  private keep<T extends THREE.Object3D>(o: T): T {
    o.traverse((c) => (c.userData.keep = true));
    return o;
  }

  private buildBody(opts: SheevOptions) {
    const o = this.outfit;
    const clone = this.variant === 'clone';
    const skin = this.m('skin', o.skin);
    const shirt = this.m('cloth', o.shirt);
    const shirtDark = this.m('cloth', o.shirtDark);
    const pants = this.m('denim', o.pants);

    /* pelvis + torso */
    this.add('hips', rbox(0.33, 0.21, 0.225, 0.075), pants, [0, -0.035, 0]);
    this.torso = this.add('chest', capsule(0.165, 0.2, 18), shirt, [0, 0.09, 0], undefined, [1.13, 1, 0.74]);
    this.torsoScale.copy(this.torso.scale);

    if (!clone) {
      // open collar: a small V of the black tee at the neckline
      const tee = this.add('chest', rbox(0.1, 0.1, 0.04, 0.02), this.m('cloth', o.tee), [0, 0.29, 0.085], [0.35, 0, Math.PI / 4]);
      tee.scale.set(0.9, 0.9, 1);
      // button placket + collar points
      this.add('chest', rbox(0.022, 0.36, 0.03, 0.01), shirtDark, [0, 0.03, 0.118]);
      for (const s of [-1, 1]) {
        this.add('chest', rbox(0.085, 0.032, 0.05, 0.012), shirtDark, [s * 0.058, 0.3, 0.085], [0.45, s * 0.45, s * 0.85]);
        // chest pocket on the left
        if (s === 1) this.add('chest', rbox(0.06, 0.07, 0.02, 0.008), shirtDark, [0.098, 0.17, 0.112], [0, 0.22, 0]);
      }
      // crossbody sling + bag (rides on the back-right hip)
      this.strap = this.keep(this.add('chest', strapGeometry(), this.m('leather', o.strap), [0, 0, 0]));
      const bag = this.add('chest', rbox(0.19, 0.11, 0.07, 0.03), this.m('leather', o.strap), [-0.15, -0.2, -0.13], [0, -0.55, -0.1]);
      bag.add(new THREE.Mesh(rbox(0.195, 0.012, 0.075, 0.005), this.m('metal', '#8a8a8a')));
      this.keep(bag);
    } else {
      // white shirt + tie
      this.add('chest', rbox(0.1, 0.24, 0.05, 0.02), this.m('cloth', o.tee), [0, 0.2, 0.1]);
      this.add('chest', rbox(0.035, 0.2, 0.03, 0.01), this.m('cloth', o.strap), [0, 0.17, 0.127]);
    }

    /* shoulders (deltoid caps hide the joint) */
    for (const s of ['L', 'R'] as const) {
      const sign = s === 'L' ? 1 : -1;
      this.add(`shoulder${s}`, sphere(18), shirt, [sign * -0.008, -0.012, 0], undefined, [0.07, 0.068, 0.068]);
      this.add(`shoulder${s}`, capsule(0.058, 0.17), shirt, [0, -0.125, 0]);
      // rolled sleeve + forearm
      this.add(`elbow${s}`, new THREE.CylinderGeometry(0.064, 0.066, 0.075, 16), clone ? shirt : shirtDark, [0, -0.03, 0]);
      this.add(`elbow${s}`, capsule(clone ? 0.054 : 0.048, 0.14), clone ? shirt : skin, [0, -0.125, 0]);
      // hand
      this.add(`wrist${s}`, rbox(0.082, 0.098, 0.046, 0.021), skin, [0, -0.052, 0.004]);
      this.add(`wrist${s}`, capsule(0.0165, 0.035, 8), skin, [sign * -0.012, -0.03, 0.04], [0.5, 0, sign * 0.35]);
      const hand = s === 'L' ? this.handL : this.handR;
      hand.position.set(0, -0.06, 0.02);
      this.j[`wrist${s}`].add(hand);
      /* legs */
      this.add(`hip${s}`, capsule(0.083, 0.25), pants, [0, -0.2, 0]);
      this.add(`knee${s}`, capsule(0.071, 0.26), pants, [0, -0.19, 0]);
      // sneakers
      this.add(`ankle${s}`, rbox(0.115, 0.085, 0.27, 0.036), this.m('shoe', o.shoes), [0, -0.022, 0.05]);
      this.add(`ankle${s}`, rbox(0.122, 0.03, 0.278, 0.012), this.m('sole', o.sole), [0, -0.058, 0.05]);
      if (!clone) {
        this.accents.push(this.keep(this.add(`ankle${s}`, rbox(0.05, 0.045, 0.02, 0.008), this.m('accent', o.accent), [0, 0.012, -0.085])));
        this.accents.push(this.keep(this.add(`ankle${s}`, rbox(0.006, 0.022, 0.12, 0.003), this.m('accent', o.accent), [sign * 0.059, -0.02, 0.055])));
      }
    }
    if (!clone) {
      // apple watch, left wrist
      this.watch.push(this.keep(this.add('wristL', new THREE.CylinderGeometry(0.0505, 0.0505, 0.018, 16), this.m('leather', o.watch), [0, 0.028, 0])));
      this.watch.push(this.keep(this.add('wristL', rbox(0.01, 0.036, 0.03, 0.005), this.m('glass', '#0b0b0d'), [0.05, 0.028, 0])));
    }

    /* neck + head */
    this.add('neck', new THREE.CylinderGeometry(0.058, 0.066, 0.12, 16), skin, [0, 0.02, 0]);
    const headMat = this.m('head', o.head);
    const C: V3 = [0, 0.155, 0.005];
    const R: V3 = [0.148, 0.165, 0.155];
    this.add('head', sphere(36), headMat, C, undefined, R);
    // ears + nose
    for (const s of [-1, 1]) {
      this.add('head', sphere(14), skin, [s * 0.146, 0.145, -0.005], [0, s * 0.25, 0], [0.016, 0.036, 0.026]);
    }
    this.add('head', sphere(16), skin, [0, 0.133, 0.162], undefined, [0.022, 0.027, 0.024]);

    if (!clone) {
      const beard = this.m('beard', o.beard);
      this.add('head', beardGeometry(), beard, [C[0], C[1] - 0.004, C[2] + 0.002], undefined, [R[0] * 1.05, R[1] * 1.035, R[2] * 1.06]);
      // moustache
      for (const s of [-1, 1]) {
        this.add('head', capsule(0.0135, 0.034, 8), beard, [s * 0.02, 0.108, 0.157], [0, 0, s * (Math.PI / 2 - 0.32)]);
      }
      // smile
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0058, 6, 18, 2.0), this.m('lips', o.lips));
      mouth.position.set(0, 0.1, 0.174);
      mouth.rotation.set(-0.15, 0, -Math.PI / 2 - 1.0);
      this.keep(mouth);
      this.j.head.add(mouth);
      this.mouth = mouth;
    } else {
      this.mouth = new THREE.Object3D();
      this.j.head.add(this.mouth);
      // bowler hat
      const hat = this.m('cloth', o.hat ?? '#222');
      const crown = this.add('head', sphere(24), hat, [0, 0.245, 0], undefined, [0.15, 0.1, 0.158]);
      const brim = this.add('head', new THREE.CylinderGeometry(0.21, 0.21, 0.014, 28), hat, [0, 0.24, 0]);
      crown.userData.hat = brim.userData.hat = true;
    }

    // eyes (dark beads + highlight) and brows
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.052, 0.163, 0.146);
      const bead = new THREE.Mesh(sphere(14), this.m('eye', o.eye));
      bead.scale.set(0.0185, 0.021, 0.011);
      const hi = new THREE.Mesh(sphere(8), this.m('eyeHi', '#ffffff'));
      hi.scale.setScalar(0.0045);
      hi.position.set(0.006, 0.007, 0.009);
      hi.userData.noOutline = true;
      eye.add(bead, hi);
      this.keep(eye);
      this.j.head.add(eye);
      this.eyes.push(eye);
      const brow = this.keep(this.add('head', rbox(0.06, 0.018, 0.02, 0.008), this.m('beard', o.brow), [s * 0.054, 0.2, 0.142], [0.12, s * 0.2, s * -0.06]));
      this.brows.push(brow);
    }
    this.browBaseY = 0.2;

    if (opts.headphones && !clone) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 8, 24, Math.PI * 1.2), this.m('leather', '#1b1b1d'));
      band.position.set(0, 0.0, 0.03);
      band.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 0.4 + Math.PI);
      this.j.neck.add(band);
      for (const s of [-1, 1]) {
        this.add('neck', new THREE.CylinderGeometry(0.05, 0.05, 0.035, 18), this.m('leather', '#1b1b1d'), [s * 0.1, 0.0, 0.05], [0, 0, Math.PI / 2]);
      }
    }

    this.headTop.position.set(0, 0.36, 0);
    this.j.head.add(this.headTop);
  }

  /* ---------------- animation ---------------- */
  play(state: string, fade = 0.45) {
    if (state === this.state) return;
    if (!this.poses[state]) {
      console.warn('unknown pose', state);
      return;
    }
    this.prev = this.state;
    this.prevTime = this.stateTime;
    this.state = state;
    this.stateTime = 0;
    this.fade = Math.max(0.0001, fade);
    this.fadeT = 0;
  }

  setPose(name: string, fn: PoseFn) {
    this.poses[name] = fn;
  }

  lookAt(target: THREE.Vector3 | null, weight = 1) {
    this.look.target = target;
    this.look.weight = target ? weight : 0;
  }

  private makeSnapshot(): Snapshot {
    return {
      q: JOINTS.map(() => new THREE.Quaternion()),
      hips: new THREE.Vector3(),
      face: { brow: 0, smile: 0, eyesClosed: 0 },
    };
  }

  private evaluate(fn: PoseFn, t: number, out: Snapshot) {
    const pose = fn(t, this);
    for (const name of JOINTS) {
      const r = pose.j[name];
      const o = this.j[name];
      if (r) o.rotation.set(r[0], r[1], r[2]);
      else o.rotation.set(0, 0, 0);
    }
    const hp = pose.hips ?? [0, 0, 0];
    this.j.hips.position.set(REST.hips[0] + hp[0], REST.hips[1] + hp[1], REST.hips[2] + hp[2]);
    if (pose.ik) this.solveIK(pose.ik);
    JOINTS.forEach((name, i) => out.q[i].copy(this.j[name].quaternion));
    out.hips.copy(this.j.hips.position);
    out.face.brow = pose.face?.brow ?? 0;
    out.face.smile = pose.face?.smile ?? 0;
    out.face.eyesClosed = pose.face?.eyesClosed ?? 0;
  }

  update(dt: number) {
    this.time += dt;
    this.stateTime += dt;
    this.prevTime += dt;
    this.fadeT = Math.min(1, this.fadeT + dt / this.fade);
    this.walkPhase += (dt * this.speed * TAU) / STRIDE;

    this.evaluate(this.poses[this.state], this.stateTime, this.snapA);
    const w = smoothstep(0, 1, this.fadeT);
    if (this.prev && w < 1) {
      this.evaluate(this.poses[this.prev], this.prevTime, this.snapB);
      JOINTS.forEach((name, i) => {
        this.j[name].quaternion.copy(this.snapB.q[i]).slerp(this.snapA.q[i], w);
      });
      this.j.hips.position.lerpVectors(this.snapB.hips, this.snapA.hips, w);
      this.face.brow = lerp(this.snapB.face.brow, this.snapA.face.brow, w);
      this.face.smile = lerp(this.snapB.face.smile, this.snapA.face.smile, w);
      this.face.eyesClosed = lerp(this.snapB.face.eyesClosed, this.snapA.face.eyesClosed, w);
    } else {
      JOINTS.forEach((name, i) => this.j[name].quaternion.copy(this.snapA.q[i]));
      this.j.hips.position.copy(this.snapA.hips);
      this.face.brow = this.snapA.face.brow;
      this.face.smile = this.snapA.face.smile;
      this.face.eyesClosed = this.snapA.face.eyesClosed;
      if (w >= 1) this.prev = null;
    }

    this.applyLook(dt);
    this.applyFace(dt);

    if (this.skin) {
      this.syncBones();
    } else {
      // breathing (primitive body)
      const b = Math.sin(this.time * 1.6) * 0.5 + 0.5;
      this.torso.scale.set(this.torsoScale.x * (1 + b * 0.012), this.torsoScale.y * (1 + b * 0.01), this.torsoScale.z * (1 + b * 0.025));
    }
  }

  /* ---------------- sculpted body ---------------- */
  /**
   * Swap the primitive body for the sculpted, skinned one built in Blender
   * (tools/character/build_sheev.py). The procedural rig keeps doing all the
   * animation; every frame the bones copy the rig joints (retargeted through
   * their bind orientation), so poses + IK carry over 1:1.
   */
  applyBody(source: THREE.Object3D) {
    if (this.skin) return;
    const body = cloneSkinned(source);
    body.updateMatrixWorld(true);

    // place face features on the actual head surface (bind pose, character space)
    const headMesh = findMesh(body, 'm_head');
    if (headMesh) {
      const probe = new THREE.Mesh(headMesh.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      probe.matrixAutoUpdate = false;
      probe.matrix.copy(headMesh.matrixWorld);
      probe.matrixWorld.copy(headMesh.matrixWorld);
      const ray = new THREE.Raycaster();
      const hit = (x: number, y: number) => {
        ray.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
        const h = ray.intersectObject(probe, false)[0];
        if (!h) return null;
        const n = h.face ? h.face.normal.clone().transformDirection(probe.matrixWorld) : new THREE.Vector3(0, 0, 1);
        return { p: h.point.clone().sub(restWorld('head')), n };
      };
      this.eyes.forEach((e) => {
        const sx = Math.sign(e.position.x);
        const h = hit(sx * 0.053, 1.692);
        if (h) e.position.copy(h.p).addScaledVector(h.n, -0.003);
        e.userData.baseX = e.position.x;
      });
      this.brows.forEach((b) => {
        const sx = Math.sign(b.position.x);
        const h = hit(sx * 0.057, 1.74);
        if (h) b.position.copy(h.p).addScaledVector(h.n, 0.006);
      });
      this.browBaseY = this.brows[0]?.position.y ?? this.browBaseY;
      const m = hit(0, 1.598);
      if (m && this.mouth) {
        this.mouth.position.copy(m.p).addScaledVector(m.n, 0.004);
        this.mouth.scale.set(1.45, 1.1, 1);
      }
      this.mouthBase.copy(this.mouth.scale);
      if (m) {
        const open = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.m('lips', '#3a1d17'));
        open.position.copy(m.p).addScaledVector(m.n, 0.001);
        open.position.y -= 0.004;
        open.visible = false;
        open.userData.keep = true;
        this.j.head.add(open);
        this.mouthOpen = open;
      }
    }

    // materials follow the scene's look (clay / toon / ink…)
    const o = this.outfit;
    const roles: Record<string, [MaterialRole, string]> = {
      shirt: ['cloth', o.shirt],
      pants: ['denim', o.pants],
      skin: ['skin', o.skin],
      head: ['head', o.head],
      beard: ['beard', o.beard],
      shoe: ['shoe', o.shoes],
      sole: ['sole', o.sole],
      tee: ['cloth', o.tee],
      collar: ['cloth', o.shirtDark],
      placket: ['cloth', o.shirtDark],
      buttons: ['leather', '#2a2620'],
    };
    body.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      // match by mesh name (m_shirt, m_shoeL…); material names can be rewritten by optimisers
      const key = mesh.name.replace(/^m_/, '').replace(/[LR]$/, '').replace(/_\d+$/, '');
      const r = roles[key] ?? roles[(mesh.material as THREE.Material).name] ?? ['cloth', '#888888'];
      mesh.material = this.m(r[0], r[1]);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.userData.sculpted = true;
    });

    // bones + bind data (relative to this.root, where the body is mounted)
    const bones = {} as Record<JointName, THREE.Bone>;
    body.traverse((c) => {
      if ((c as THREE.Bone).isBone && (JOINTS as readonly string[]).includes(c.name)) bones[c.name as JointName] = c as THREE.Bone;
    });
    if (JOINTS.some((n) => !bones[n])) {
      console.warn('[sheev] body is missing bones; keeping primitives');
      return;
    }
    const worldQ = (obj: THREE.Object3D) => obj.getWorldQuaternion(new THREE.Quaternion());
    const bindQ = {} as Record<JointName, THREE.Quaternion>;
    const parentInv = {} as Record<JointName, THREE.Quaternion>;
    for (const n of JOINTS) {
      bindQ[n] = worldQ(bones[n]);
      parentInv[n] = worldQ(bones[n].parent!).invert();
    }
    const hipsBind = bones.hips.position.clone();
    const hipsParentInv = worldQ(bones.hips.parent!).invert();

    // hide the primitive body; keep features + accessories
    this.root.traverse((c) => {
      if (c.userData.prim && !c.userData.keep) c.visible = false;
    });
    // re-fit accessories to the sculpted proportions
    if (this.watch.length) {
      this.watch[0].scale.set(0.046 / 0.0505, 1, 0.046 / 0.0505);
      this.watch[1].position.x = 0.047;
    }
    for (const a of this.accents) {
      if (a.position.z < 0) a.position.set(0, 0.0, -0.104);
      else a.position.set(Math.sign(a.position.x) * 0.064, -0.012, 0.05);
    }

    this.root.add(body);
    this.skin = { bones, bindQ, parentInv, hipsBind, hipsParentInv };
    this.syncBones();
  }

  private qa = new THREE.Quaternion();
  private va = new THREE.Vector3();
  private syncBones() {
    const s = this.skin!;
    for (const n of JOINTS) {
      // bone local = inv(parent bind world) · rig local · bind world
      this.qa.copy(s.parentInv[n]).multiply(this.j[n].quaternion).multiply(s.bindQ[n]);
      s.bones[n].quaternion.copy(this.qa);
    }
    // hips translation (sitting, bobbing) in the hips bone's parent space
    this.va.copy(this.j.hips.position).sub(new THREE.Vector3(...REST.hips)).applyQuaternion(s.hipsParentInv);
    s.bones.hips.position.copy(s.hipsBind).add(this.va);
  }

  private applyLook(dt: number) {
    const target = this.look.target;
    this.lookW = damp(this.lookW, target ? this.look.weight : 0, 5, dt);
    let yaw = 0;
    let pitch = 0;
    if (target) {
      this.root.updateMatrixWorld(true);
      const headPos = new THREE.Vector3();
      this.j.head.getWorldPosition(headPos);
      headPos.y += 0.15;
      const chestQ = new THREE.Quaternion();
      this.j.chest.getWorldQuaternion(chestQ);
      const d = target.clone().sub(headPos).applyQuaternion(chestQ.invert());
      yaw = clamp(Math.atan2(d.x, d.z), -1.05, 1.05);
      pitch = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.55, 0.6);
      if (d.z < -0.2) yaw *= 0.6; // don't break the neck looking backwards
    }
    this.look.yaw = damp(this.look.yaw, yaw, 7, dt);
    this.look.pitch = damp(this.look.pitch, pitch, 7, dt);
    const ly = this.look.yaw * this.lookW;
    const lp = this.look.pitch * this.lookW;
    const qn = new THREE.Quaternion().setFromEuler(new THREE.Euler(lp * 0.35, ly * 0.4, 0, 'YXZ'));
    const qh = new THREE.Quaternion().setFromEuler(new THREE.Euler(lp * 0.65, ly * 0.6, 0, 'YXZ'));
    this.j.neck.quaternion.multiply(qn);
    this.j.head.quaternion.multiply(qh);
    // pupils drift toward the target
    for (const e of this.eyes) {
      const base = (e.userData.baseX as number | undefined) ?? (e.position.x > 0 ? 0.052 : -0.052);
      e.userData.baseX = base;
      e.position.x = base + ly * 0.005;
    }
  }

  private applyFace(dt: number) {
    // blinking
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkIn = 2.2 + Math.random() * 3.5;
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      blink = Math.sin(clamp(this.blinkT / 0.16, 0, 1) * Math.PI);
      if (this.blinkT > 0.16) this.blinkT = -1;
    }
    const closed = Math.max(blink, this.face.eyesClosed);
    for (const e of this.eyes) e.scale.y = 1 - closed * 0.88;
    const brow = this.faceOverride.brow ?? this.face.brow;
    for (const b of this.brows) b.position.y = this.browBaseY + brow * 0.014;
    const smile = this.faceOverride.smile ?? this.face.smile;
    this.talkAmt = damp(this.talkAmt, this.talking ? 1 : 0, 12, dt);
    const flap = this.talkAmt * (0.5 + 0.5 * Math.sin(this.time * 21)) * (0.65 + 0.35 * Math.sin(this.time * 7.7));
    this.mouth.scale.set(this.mouthBase.x * (1 + smile * 0.25), this.mouthBase.y * (1 + smile * 0.35 + flap * 0.5), this.mouthBase.z);
    if (this.mouthOpen) {
      this.mouthOpen.visible = flap > 0.02;
      this.mouthOpen.scale.set(0.02, 0.002 + flap * 0.011, 0.006);
    }
  }

  /* ---------------- IK ---------------- */
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private q1 = new THREE.Quaternion();
  private down = new THREE.Vector3(0, -1, 0);

  private solveIK(ik: NonNullable<Pose['ik']>) {
    this.root.updateMatrixWorld(true);
    const toWorld = (p: V3) => this.root.localToWorld(new THREE.Vector3(...p));
    if (ik.footL) this.limbIK('hipL', 'kneeL', 'ankleL', toWorld(ik.footL), toWorld([0.1, 0.5, 1.5]), THIGH, SHIN, true);
    if (ik.footR) this.limbIK('hipR', 'kneeR', 'ankleR', toWorld(ik.footR), toWorld([-0.1, 0.5, 1.5]), THIGH, SHIN, true);
    if (ik.handL) this.limbIK('shoulderL', 'elbowL', 'wristL', toWorld(ik.handL), toWorld(ik.poleL ?? [0.7, 0.6, -0.6]), UPPER_ARM, FOREARM, false);
    if (ik.handR) this.limbIK('shoulderR', 'elbowR', 'wristR', toWorld(ik.handR), toWorld(ik.poleR ?? [-0.7, 0.6, -0.6]), UPPER_ARM, FOREARM, false);
  }

  /** Analytic two-bone IK; bones point down -Y in their rest frame. */
  private limbIK(a: JointName, b: JointName, c: JointName, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number, flatFoot: boolean) {
    const A = this.j[a];
    const B = this.j[b];
    const C = this.j[c];
    A.parent!.updateMatrixWorld(true);
    const pa = A.getWorldPosition(this.v1);
    const toT = this.v2.copy(target).sub(pa);
    const d = clamp(toT.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    const dir = toT.normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const toPole = this.v3.copy(pole).sub(pa);
    const perp = toPole.sub(dir.clone().multiplyScalar(toPole.dot(dir))).normalize();
    const elbow = pa.clone().add(dir.clone().multiplyScalar(along)).add(perp.multiplyScalar(h));
    const end = pa.clone().add(dir.clone().multiplyScalar(d));

    // upper bone
    const parentQ = A.parent!.getWorldQuaternion(new THREE.Quaternion());
    const upperDir = elbow.clone().sub(pa).normalize().applyQuaternion(parentQ.clone().invert());
    A.quaternion.setFromUnitVectors(this.down, upperDir);
    A.updateMatrixWorld(true);
    // lower bone
    const aQ = A.getWorldQuaternion(new THREE.Quaternion());
    const lowerDir = end.clone().sub(elbow).normalize().applyQuaternion(aQ.clone().invert());
    B.quaternion.setFromUnitVectors(this.down, lowerDir);
    B.updateMatrixWorld(true);
    if (flatFoot) {
      // keep the sole parallel to the floor and pointing where the body points
      const rootQ = this.root.getWorldQuaternion(this.q1);
      const bQ = B.getWorldQuaternion(new THREE.Quaternion());
      const extra = new THREE.Quaternion().setFromEuler(C.rotation);
      C.quaternion.copy(bQ.invert().multiply(rootQ).multiply(extra));
    }
  }
}

/* ================================================================== */
/* pose library                                                          */
/* ================================================================== */
const s = Math.sin;
const c = Math.cos;

/** Seated base used by desk poses. */
export function seatedBase(ch: Sheev, extra: Pose['j'] = {}): Pose {
  const hipsY = ch.seatHeight + 0.1 - HIPS_Y;
  return {
    j: {
      spine: [0.05, 0, 0],
      chest: [0.06, 0, 0],
      ...extra,
    },
    hips: [0, hipsY, -0.02],
    ik: {
      footL: [0.11, 0.065, 0.38],
      footR: [-0.11, 0.065, 0.36],
    },
  };
}

export const BASE_POSES: Record<string, PoseFn> = {
  idle: (t) => {
    const sway = s(t * 0.9) * 0.025;
    return {
      j: {
        hips: [0, 0, sway],
        spine: [0.02, 0, -sway * 0.5],
        chest: [0.02 + s(t * 1.6) * 0.01, 0, -sway * 0.5],
        neck: [-0.02, 0, 0],
        shoulderL: [0.04, 0, 0.1],
        elbowL: [-0.18, 0, 0],
        shoulderR: [0.04, 0, -0.1],
        elbowR: [-0.18, 0, 0],
        wristL: [0, 0, 0.05],
        wristR: [0, 0, -0.05],
        hipL: [0, 0, 0.03 - sway],
        hipR: [0, 0, -0.03 - sway],
        ankleL: [0, 0, -0.03 + sway],
        ankleR: [0, 0, 0.03 + sway],
      },
      face: { smile: 0.2 },
    };
  },

  walk: (_t, ch) => {
    const p = ch.walkPhase;
    const amt = clamp(ch.speed / 0.8, 0.35, 1.3);
    const thighL = -0.5 * s(p) * amt;
    const thighR = 0.5 * s(p) * amt;
    const kneeL = 0.12 + 0.9 * Math.pow(Math.max(0, c(p)), 1.6) * amt;
    const kneeR = 0.12 + 0.9 * Math.pow(Math.max(0, -c(p)), 1.6) * amt;
    return {
      j: {
        hips: [0, s(p) * 0.08, s(p) * 0.03],
        spine: [0.05, -s(p) * 0.06, 0],
        chest: [0.03, -s(p) * 0.1, 0],
        neck: [-0.06, s(p) * 0.08, 0],
        shoulderL: [0.42 * s(p) * amt, 0, 0.08],
        elbowL: [-0.25 - 0.25 * Math.max(0, -s(p)) * amt, 0, 0],
        shoulderR: [-0.42 * s(p) * amt, 0, -0.08],
        elbowR: [-0.25 - 0.25 * Math.max(0, s(p)) * amt, 0, 0],
        hipL: [thighL, 0, 0.02],
        kneeL: [kneeL, 0, 0],
        ankleL: [-(thighL + kneeL) * 0.65 + 0.05, 0, 0],
        hipR: [thighR, 0, -0.02],
        kneeR: [kneeR, 0, 0],
        ankleR: [-(thighR + kneeR) * 0.65 + 0.05, 0, 0],
      },
      hips: [0, -0.035 * Math.abs(s(p)) * amt + 0.01, 0],
      face: { smile: 0.15 },
    };
  },

  wave: (t) => ({
    j: {
      spine: [0, 0, 0.03],
      chest: [0, 0.1, 0.04],
      shoulderL: [0.05, 0, 0.12],
      elbowL: [-0.2, 0, 0],
      shoulderR: [-0.2, 0, -2.5],
      elbowR: [-0.35, 0, -0.25 + s(t * 9) * 0.35],
      wristR: [0, 0, s(t * 9 + 0.6) * 0.25],
      hipL: [0, 0, 0.03],
      hipR: [0, 0, -0.03],
      neck: [0, 0, -0.08],
      head: [0, 0, -0.08],
    },
    face: { smile: 1, brow: 0.6 },
  }),

  thinkStand: (t) => ({
    j: {
      hips: [0, 0, 0.03],
      spine: [0.03, 0, -0.02],
      chest: [0.02, 0.08, 0],
      neck: [-0.08, 0.1, 0.08],
      head: [-0.12 + s(t * 0.7) * 0.03, 0.15, 0.1],
      shoulderL: [-0.25, 0, 0.12],
      elbowL: [-1.65, 0.0, 0],
      wristL: [0, 0, 0],
      shoulderR: [-0.85, 0.4, -0.1],
      elbowR: [-2.35, 0, 0],
      wristR: [0.3, 0, 0.2],
      hipL: [0, 0, 0.05],
      hipR: [-0.05, 0, -0.02],
      kneeR: [0.08, 0, 0],
    },
    face: { brow: 0.4, smile: 0 },
  }),

  read: (t) => ({
    j: {
      spine: [0.04, 0, 0],
      chest: [0.06, 0, 0],
      neck: [0.22, 0, 0],
      head: [0.2 + s(t * 0.5) * 0.02, s(t * 0.33) * 0.06, 0],
      shoulderL: [-0.75, 0, 0.28],
      elbowL: [-1.35, 0, 0],
      wristL: [0, 0, -0.4],
      shoulderR: [-0.75, 0, -0.28],
      elbowR: [-1.35, 0, 0],
      wristR: [0, 0, 0.4],
      hipL: [0, 0, 0.03],
      hipR: [0, 0, -0.03],
    },
    face: { smile: 0.1 },
  }),

  lookOut: (t) => ({
    j: {
      spine: [-0.02, 0, 0],
      chest: [-0.04, 0, 0],
      neck: [-0.12, s(t * 0.25) * 0.15, 0],
      head: [-0.12, s(t * 0.25 + 0.5) * 0.12, 0],
      shoulderL: [0.35, 0, 0.18],
      elbowL: [-1.2, 0.0, 0],
      wristL: [0, 0, -0.3],
      shoulderR: [0.35, 0, -0.18],
      elbowR: [-1.2, 0, 0],
      wristR: [0, 0, 0.3],
      hipL: [0, 0, 0.04],
      hipR: [0, 0, -0.04],
    },
    face: { smile: 0.45, brow: 0.3 },
  }),

  water: (t) => ({
    j: {
      spine: [0.12, 0, 0],
      chest: [0.1, 0, 0],
      neck: [0.25, 0, 0],
      head: [0.15, 0, 0],
      shoulderR: [-1.05, 0, -0.08],
      elbowR: [-0.35, 0, 0],
      wristR: [0, 0, -0.5 - (s(t * 1.2) * 0.5 + 0.5) * 0.4],
      shoulderL: [0.1, 0, 0.12],
      elbowL: [-0.4, 0, 0],
      hipL: [0.05, 0, 0.03],
      hipR: [-0.1, 0, -0.03],
      kneeR: [0.15, 0, 0],
    },
    face: { smile: 0.6 },
  }),

  sit: (t, ch) => {
    const base = seatedBase(ch, {
      neck: [0.04, s(t * 0.4) * 0.05, 0],
      shoulderL: [-0.35, 0, 0.12],
      elbowL: [-0.7, 0, 0],
      shoulderR: [-0.35, 0, -0.12],
      elbowR: [-0.7, 0, 0],
    });
    base.face = { smile: 0.2 };
    return base;
  },

  sleepDesk: (t, ch) => {
    const base = seatedBase(ch, {
      spine: [0.3, 0, 0],
      chest: [0.45, 0, 0],
      neck: [0.35, 0, 0.1],
      head: [0.25 + s(t * 1.1) * 0.015, 0.25, 0.25],
    });
    base.ik = {
      ...base.ik,
      handL: [0.08, ch.params.deskY ?? 0.78, 0.36],
      handR: [-0.1, (ch.params.deskY ?? 0.78) + 0.0, 0.38],
      poleL: [0.9, 0.4, 0.3],
      poleR: [-0.9, 0.4, 0.3],
    };
    base.face = { eyesClosed: 1, smile: 0.1 };
    return base;
  },
};
