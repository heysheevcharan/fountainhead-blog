import * as THREE from 'three';
import { Sheev, seatedBase, type Pose } from '../../core/sheev';
import type { Line } from '../../core/overlay';
import { angleDelta, clamp, damp, dampAngle } from '../../core/util';
import { DESK, SEAT } from './furniture';

const s = Math.sin;
const DESK_Y = DESK.h + 0.03;

/* ------------------------------------------------------------------ */
/* desk poses (root space: sheev at the seat, facing +z)                 */
/* ------------------------------------------------------------------ */
export function registerDeskPoses(ch: Sheev) {
  ch.setPose('write', (t) => {
    const base = seatedBase(ch, {
      spine: [0.12, 0, 0],
      chest: [0.18, -0.05, 0],
      neck: [0.28, -0.08, 0],
      head: [0.22 + s(t * 0.6) * 0.03, -0.1, 0.03],
    });
    const line = (t % 3.2) / 3.2;
    base.ik = {
      ...base.ik,
      handR: [-0.29 + line * 0.09 + s(t * 9) * 0.006, DESK_Y + 0.025 + Math.abs(s(t * 11)) * 0.006, 0.42 - Math.floor((t / 3.2) % 5) * 0.022],
      handL: [0.05, DESK_Y + 0.012, 0.4],
      poleR: [-0.6, 0.4, -0.2],
      poleL: [0.6, 0.4, -0.2],
    };
    base.j.wristR = [0.35, 0, -0.2];
    base.j.wristL = [0.1, 0, 0.6];
    base.face = { smile: 0.05, brow: 0.15 };
    return base;
  });

  ch.setPose('type', (t) => {
    const base = seatedBase(ch, {
      spine: [0.06, 0, 0],
      chest: [0.08, 0, 0],
      neck: [0.12, s(t * 0.3) * 0.04, 0],
      head: [0.1, 0, 0],
    });
    base.ik = {
      ...base.ik,
      handR: [-0.07, DESK_Y + 0.03 + Math.max(0, s(t * 17)) * 0.012, 0.45],
      handL: [0.13, DESK_Y + 0.03 + Math.max(0, s(t * 15 + 1.3)) * 0.012, 0.45],
      poleR: [-0.7, 0.3, -0.3],
      poleL: [0.7, 0.3, -0.3],
    };
    base.j.wristR = [0.6, 0, 0];
    base.j.wristL = [0.6, 0, 0];
    base.face = { smile: 0.1 };
    return base;
  });

  // his own selfie pose: hand on chin, thinking
  ch.setPose('thinkSit', (t) => {
    const base = seatedBase(ch, {
      spine: [0.1, 0, 0],
      chest: [0.12, 0.12, 0],
      neck: [-0.05, 0.12, 0.08],
      head: [-0.08 + s(t * 0.5) * 0.03, 0.12, 0.1],
    });
    base.ik = {
      ...base.ik,
      handR: [-0.02, 1.06, 0.24],
      handL: [0.15, DESK_Y + 0.01, 0.38],
      poleR: [-0.4, 0.4, 0.9],
      poleL: [0.6, 0.4, -0.2],
    };
    base.j.wristR = [-0.2, 0, 0];
    base.face = { brow: 0.5, smile: 0.15 };
    return base;
  });

  ch.setPose('sip', (t) => {
    const lift = clamp(Math.sin(Math.min(t / 4.2, 1) * Math.PI) * 1.4, 0, 1);
    const base = seatedBase(ch, {
      spine: [0.02, 0, 0],
      chest: [0.0, -0.08, 0],
      neck: [-0.05 * lift, -0.1, 0],
      head: [-0.12 * lift, -0.05, 0],
    });
    const rest: [number, number, number] = [0.28, DESK_Y + 0.05, 0.42];
    const mouth: [number, number, number] = [0.06, 1.13, 0.2];
    base.ik = {
      ...base.ik,
      handL: [rest[0] + (mouth[0] - rest[0]) * lift, rest[1] + (mouth[1] - rest[1]) * lift, rest[2] + (mouth[2] - rest[2]) * lift],
      handR: [-0.12, DESK_Y + 0.01, 0.38],
      poleL: [0.7, 0.2, 0.1],
      poleR: [-0.6, 0.4, -0.2],
    };
    base.face = { eyesClosed: lift > 0.9 ? 0.6 : 0, smile: 0.3 };
    return base;
  });

  ch.setPose('waveSit', (t) => {
    const base = seatedBase(ch, {
      spine: [0.02, 0, 0],
      chest: [0, 0.12, 0],
      shoulderR: [-0.3, 0, -2.4],
      elbowR: [-0.4, 0, -0.25 + s(t * 9) * 0.35],
      wristR: [0, 0, s(t * 9 + 0.6) * 0.25],
      head: [0, 0, -0.06],
    });
    base.ik = { ...base.ik, handL: [0.1, DESK_Y + 0.01, 0.38], poleL: [0.6, 0.4, -0.2] };
    base.face = { smile: 1, brow: 0.7 };
    return base;
  });

  // talking to the visitor (the intro): seated, one hand on the desk, the other gesturing
  ch.setPose('talkSit', (t) => {
    const g = Math.pow(Math.max(0, Math.sin(t * 1.25 + 0.4)), 2);
    const base = seatedBase(ch, {
      spine: [0.03, 0, 0],
      chest: [0.02, 0.06 * Math.sin(t * 0.6), 0],
      neck: [-0.06, 0, 0],
      head: [-0.04 + Math.sin(t * 2.3) * 0.035, Math.sin(t * 0.9) * 0.05, 0],
    });
    base.ik = {
      ...base.ik,
      handL: [0.13, DESK_Y + 0.012, 0.38],
      handR: [-0.16 - g * 0.04, DESK_Y + 0.02 + g * 0.2, 0.36 + g * 0.06],
      poleL: [0.6, 0.4, -0.2],
      poleR: [-0.8, 0.1, -0.1],
    };
    base.j.wristR = [-0.4 * g, 0, -0.3 * g];
    base.face = { smile: 0.55, brow: 0.25 + g * 0.35 };
    return base;
  });

  ch.setPose('talkStand', (t) => {
    const g = Math.pow(Math.max(0, Math.sin(t * 1.25 + 0.4)), 2);
    return {
      j: {
        spine: [0.02, 0, 0],
        chest: [0.0, 0.08 * Math.sin(t * 0.6), 0],
        neck: [-0.05, 0, 0],
        head: [-0.03 + Math.sin(t * 2.3) * 0.035, Math.sin(t * 0.9) * 0.05, 0],
        shoulderL: [0.05, 0, 0.12],
        elbowL: [-0.25, 0, 0],
        shoulderR: [-0.35 - g * 0.45, 0, -0.18 - g * 0.1],
        elbowR: [-0.9 - g * 0.5, 0, 0],
        wristR: [-0.2 * g, 0, -0.3 * g],
        hipL: [0, 0, 0.04],
        hipR: [0, 0, -0.04],
      },
      face: { smile: 0.55, brow: 0.25 + g * 0.35 },
    };
  });

  ch.setPose('readSit', (t) => {
    const base = seatedBase(ch, {
      spine: [-0.05, 0, 0],
      chest: [0.05, 0, 0],
      neck: [0.25, 0, 0],
      head: [0.18 + s(t * 0.4) * 0.02, s(t * 0.25) * 0.05, 0],
      shoulderL: [-0.7, 0, 0.25],
      elbowL: [-1.3, 0, 0],
      shoulderR: [-0.7, 0, -0.25],
      elbowR: [-1.3, 0, 0],
      wristL: [0, 0, -0.4],
      wristR: [0, 0, 0.4],
    });
    base.face = { smile: 0.15 };
    return base;
  });
}

/* ------------------------------------------------------------------ */
/* navigation                                                           */
/* ------------------------------------------------------------------ */
const NODES: Record<string, [number, number]> = {
  seat: [SEAT.x, SEAT.z],
  deskL: [-1.32, -2.45],
  deskR: [0.82, -2.45],
  window: [1.7, -2.36],
  lilies: [2.25, -2.18],
  shelf: [3.55, -2.12],
  front: [0.35, -0.85],
  cinema: [-1.55, -1.95],
  lounge: [-2.42, -1.4],
};
const EDGES: [string, string][] = [
  ['seat', 'deskL'],
  ['seat', 'deskR'],
  ['deskR', 'window'],
  ['window', 'lilies'],
  ['lilies', 'shelf'],
  ['deskR', 'front'],
  ['deskL', 'cinema'],
  ['cinema', 'lounge'],
  ['front', 'cinema'],
];

function shortestPath(from: string, to: string): string[] {
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const q = new Set(Object.keys(NODES));
  for (const k of q) {
    dist[k] = Infinity;
    prev[k] = null;
  }
  dist[from] = 0;
  while (q.size) {
    let u = '';
    let best = Infinity;
    for (const k of q)
      if (dist[k] < best) {
        best = dist[k];
        u = k;
      }
    if (!u || u === to) break;
    q.delete(u);
    for (const [a, b] of EDGES) {
      const v = a === u ? b : b === u ? a : null;
      if (!v || !q.has(v)) continue;
      const d = dist[u] + Math.hypot(NODES[u][0] - NODES[v][0], NODES[u][1] - NODES[v][1]);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  const path: string[] = [];
  let c: string | null = to;
  while (c) {
    path.unshift(c);
    c = prev[c];
  }
  return path[0] === from ? path : [from, to];
}

/* ------------------------------------------------------------------ */
/* routine                                                              */
/* ------------------------------------------------------------------ */
export type Prop = 'pen' | 'mug' | 'book' | 'can';
export interface Task {
  node: string;
  face: number;
  pose: string;
  dur: number;
  seat?: 'desk' | 'lounge';
  prop?: Prop;
  line?: Line;
  /** what the caption says he's doing */
  doing: string;
}

const LOUNGE_FACE = Math.PI;
const T = {
  write: (doing: string, dur = 16, line?: Line): Task => ({ node: 'seat', face: 0, pose: 'write', dur, seat: 'desk', prop: 'pen', doing, line }),
  type: (dur = 15): Task => ({ node: 'seat', face: 0, pose: 'type', dur, seat: 'desk', doing: 'building the startup' }),
  think: (line?: Line): Task => ({ node: 'seat', face: 0, pose: 'thinkSit', dur: 5.5, seat: 'desk', doing: 'thinking', line }),
  sip: (): Task => ({ node: 'seat', face: 0, pose: 'sip', dur: 4.6, seat: 'desk', prop: 'mug', doing: 'taking a sip' }),
  window: (line?: Line): Task => ({ node: 'window', face: Math.PI, pose: 'lookOut', dur: 7, doing: 'looking out at bangalore', line }),
  lilies: (): Task => ({
    node: 'lilies',
    face: Math.PI,
    pose: 'water',
    dur: 5.5,
    prop: 'can',
    doing: 'watering his lilies',
    line: { text: 'lily mode: on.', href: '/blog/i-hate-current-operating-systems' },
  }),
  shelf: (): Task => ({
    node: 'shelf',
    face: 0.15,
    pose: 'read',
    dur: 9,
    prop: 'book',
    doing: 'reading a few pages of a classic',
    line: { text: 'two to three pages of descartes a day.', href: '/blog/the-barbell-rule-of-reading-and-writing' },
  }),
  lounge: (): Task => ({ node: 'lounge', face: LOUNGE_FACE, pose: 'sit', dur: 16, seat: 'lounge', doing: 'watching a film' }),
  sleep: (): Task => ({ node: 'seat', face: 0, pose: 'sleepDesk', dur: 14, seat: 'desk', doing: 'asleep at his desk' }),
};
const AWE: Line = { text: 'bangalore gave me awe. still does.', href: '/blog/follow-your-awe-intensely' };

export function routineFor(phase: 'night' | 'morning' | 'day' | 'evening', hours: number): Task[] {
  switch (phase) {
    case 'morning':
      return [
        T.write('doing his morning pages', 16, { text: 'morning pages first. then the world.', href: '/blog/the-barbell-rule-of-reading-and-writing' }),
        T.sip(),
        T.window(AWE),
        T.lilies(),
        T.type(14),
        T.think(),
      ];
    case 'day':
      return [
        T.type(16),
        T.think({ text: "it's not mere day dreaming, but constrained imagination.", href: '/blog/simulation-thinking' }),
        T.shelf(),
        T.write('writing', 12),
        T.window(),
      ];
    case 'evening':
      return [T.lounge(), T.lilies(), T.window(AWE), T.write('writing', 12), T.sip()];
    default: {
      const late = hours >= 0.5 && hours < 5;
      const list = [
        T.write('writing past his bedtime', 18, { text: 'writing past my bedtime. again.', href: '/blog/follow-your-awe-intensely' }),
        T.think(),
        T.lounge(),
        T.shelf(),
        T.write('writing past his bedtime', 14),
      ];
      if (late) list.push(T.sleep());
      return list;
    }
  }
}

/* ------------------------------------------------------------------ */
/* director: walks, sits, acts, greets                                   */
/* ------------------------------------------------------------------ */
type Mode = 'idle' | 'standing' | 'walking' | 'turning' | 'sitting' | 'acting' | 'greeting';

export interface DirectorHooks {
  setProp(p: Prop | null): void;
  setChair(seated: boolean): void;
  say(line: Line): void;
  onTask?(task: Task): void;
}

export class Director {
  mode: Mode = 'idle';
  task: Task | null = null;
  seated: 'desk' | 'lounge' | null = null;
  private queue: Task[] = [];
  private path: [number, number][] = [];
  /** node names of the remaining path, and the last node he passed (for a change of plan mid-walk) */
  private pathNames: string[] = [];
  private lastNode = 'seat';
  private timer = 0;
  private heading = 0;
  private node = 'seat';
  private greetT = 0;
  private resumeMode: Mode = 'idle';
  private lastLine = -1e9;
  routine: () => Task[];

  constructor(
    private ch: Sheev,
    private hooks: DirectorHooks,
    routine: () => Task[],
  ) {
    this.routine = routine;
    // start mid-task (at the desk, or in the armchair), so the first frame already tells a story;
    // the rest of that loop follows (the first task used to come round twice)
    const loop = this.routine();
    this.queue = loop.slice(1);
    const first = loop[0];
    this.placeAt(first.node, first.face);
    this.begin(first, true);
  }

  /** the first task of a loop that started while he was busy (walking, waving, talking) */
  private redirect: Task | null = null;

  /**
   * The part of the day changed (or the visitor picked another hour): drop the rest of the old
   * loop and start the new one now, not when the old loop runs out. Mid-walk he changes course;
   * if he's waving or talking to the visitor, that finishes first, then he goes straight to it.
   */
  restart() {
    const loop = this.routine();
    this.queue = loop.slice(1);
    this.redirect = loop[0];
    if (!this.introActive && this.mode !== 'greeting') this.takeRedirect();
  }

  private takeRedirect() {
    const t = this.redirect;
    // a moment from arriving somewhere: he picks it up there (begin)
    if (!t || this.mode === 'turning') return false;
    this.redirect = null;
    if (this.mode === 'standing') {
      // already getting up: just change where he's headed
      this.task = t;
      this.hooks.onTask?.(t);
    } else if (this.mode === 'walking') this.reroute(t);
    else this.begin(t);
    return true;
  }

  /** change of plan mid-walk: head for the new task from where he is (back or on, whichever is shorter) */
  private reroute(task: Task) {
    const pos = this.ch.root.position;
    let best: string[] | null = null;
    let bestLen = Infinity;
    for (const from of new Set([this.lastNode, this.pathNames[0] ?? this.lastNode])) {
      const names = shortestPath(from, task.node);
      let len = Math.hypot(NODES[from][0] - pos.x, NODES[from][1] - pos.z);
      for (let i = 1; i < names.length; i++) len += Math.hypot(NODES[names[i]][0] - NODES[names[i - 1]][0], NODES[names[i]][1] - NODES[names[i - 1]][1]);
      if (len < bestLen) {
        bestLen = len;
        best = names;
      }
    }
    if (!best) return this.begin(task);
    this.task = task;
    this.hooks.onTask?.(task);
    this.pathNames = best;
    this.path = best.map((n) => NODES[n]);
    this.node = task.node;
  }

  get position() {
    return this.ch.root.position;
  }

  placeAt(node: string, face: number) {
    const [x, z] = NODES[node];
    this.ch.root.position.set(x, 0, z);
    this.heading = face;
    this.ch.root.rotation.y = face;
    this.node = node;
    this.lastNode = node;
  }

  private next() {
    if (!this.queue.length) this.queue = this.routine();
    return this.queue.shift()!;
  }

  private begin(task: Task, instant = false) {
    this.task = task;
    this.hooks.onTask?.(task);
    const needSeatChange = this.seated && this.seated !== task.seat;
    const needMove = task.node !== this.node;
    if (this.seated && (needSeatChange || needMove)) {
      // stand up first
      this.ch.play('idle', 0.5);
      if (this.seated === 'desk') this.hooks.setChair(false);
      this.seated = null;
      this.hooks.setProp(null);
      this.mode = 'standing';
      this.timer = 0.7;
      return;
    }
    if (needMove) {
      const names = shortestPath(this.node, task.node);
      this.lastNode = this.node;
      this.pathNames = names.slice(1);
      this.path = this.pathNames.map((n) => NODES[n]);
      this.node = task.node;
      this.mode = 'walking';
      this.hooks.setProp(null);
      this.ch.play('walk', 0.3);
      return;
    }
    // arrived (somewhere a new loop doesn't start: go there instead)
    if (this.redirect && this.redirect !== task) {
      const t = this.redirect;
      this.redirect = null;
      this.begin(t);
      return;
    }
    this.redirect = null;
    if (task.seat && !this.seated) {
      this.ch.seatHeight = task.seat === 'desk' ? 0.47 : 0.42;
      this.ch.params.deskY = DESK.h;
      if (task.seat === 'desk') this.hooks.setChair(true);
      this.seated = task.seat;
    }
    this.mode = 'acting';
    this.timer = task.dur;
    this.ch.play(task.pose, instant ? 0.0001 : 0.6);
    this.hooks.setProp(task.prop ?? null);
    const now = performance.now();
    if (task.line && now - this.lastLine > 16000 && Math.random() < 0.75 && !instant) {
      this.lastLine = now;
      setTimeout(() => this.hooks.say(task.line!), 900);
    }
  }

  /* ---------------- intro (he talks to the visitor) ---------------- */
  introActive = false;
  private introPhase: 'wave' | 'talk' = 'wave';
  private introT = 0;
  private introResume: Mode = 'idle';

  startIntro() {
    if (this.introActive) return;
    this.introActive = true;
    this.introResume = this.mode === 'greeting' ? this.resumeMode : this.mode;
    this.introPhase = 'wave';
    this.introT = 1.3;
    this.ch.speed = 0;
    this.hooks.setProp(null);
    this.ch.play(this.seated ? 'waveSit' : 'wave', 0.4);
  }

  endIntro() {
    if (!this.introActive) return;
    this.introActive = false;
    this.mode = this.introResume;
    if (this.redirect && this.mode !== 'turning') {
      this.ch.play(this.mode === 'walking' ? 'walk' : 'idle', 0.4);
      this.takeRedirect();
      return;
    }
    if (this.mode === 'walking') this.ch.play('walk', 0.4);
    else if (this.mode === 'acting' && this.task) {
      this.ch.play(this.task.pose, 0.6);
      this.hooks.setProp(this.task.prop ?? null);
    } else this.begin(this.task ?? this.next());
  }

  /** Visitor clicked him. */
  greet(line: Line) {
    if (this.mode === 'greeting') return;
    this.resumeMode = this.mode;
    this.mode = 'greeting';
    this.greetT = 2.6;
    this.ch.speed = 0;
    this.ch.play(this.seated ? 'waveSit' : 'wave', 0.35);
    this.hooks.say(line);
    this.lastLine = performance.now();
  }

  update(dt: number) {
    const root = this.ch.root;
    if (this.introActive) {
      this.introT -= dt;
      if (this.introPhase === 'wave' && this.introT <= 0) {
        this.introPhase = 'talk';
        this.ch.play(this.seated ? 'talkSit' : 'talkStand', 0.5);
      }
      if (!this.seated) this.heading = dampAngle(this.heading, 0.75, 5, dt);
      root.rotation.y = this.heading;
      this.ch.update(dt);
      return;
    }
    switch (this.mode) {
      case 'greeting': {
        this.greetT -= dt;
        if (!this.seated) {
          // turn toward the viewer (camera sits at +x,+z)
          this.heading = dampAngle(this.heading, 0.75, 6, dt);
        }
        if (this.greetT <= 0) {
          this.mode = this.resumeMode;
          if (this.redirect && this.mode !== 'turning') {
            this.ch.play(this.mode === 'walking' ? 'walk' : 'idle', 0.4);
            this.takeRedirect();
            break;
          }
          if (this.mode === 'walking') this.ch.play('walk', 0.3);
          else if (this.task) this.ch.play(this.mode === 'acting' ? this.task.pose : 'idle', 0.45);
          if (this.mode === 'idle' || this.mode === 'turning' || this.mode === 'standing') this.begin(this.task ?? this.next());
        }
        break;
      }
      case 'standing':
        this.timer -= dt;
        if (this.timer <= 0 && this.task) this.begin(this.task);
        break;
      case 'walking': {
        const target = this.path[0];
        if (!target) {
          this.ch.speed = damp(this.ch.speed, 0, 10, dt);
          this.mode = 'turning';
          this.timer = 0.6;
          this.ch.play('idle', 0.35);
          break;
        }
        const dx = target[0] - root.position.x;
        const dz = target[1] - root.position.z;
        const dist = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        this.heading = dampAngle(this.heading, want, 9, dt);
        const facing = Math.abs(angleDelta(this.heading, want)) < 0.9;
        const last = this.path.length === 1;
        const speed = facing ? (last ? Math.min(0.72, dist * 2.2 + 0.25) : 0.72) : 0.15;
        this.ch.speed = damp(this.ch.speed, speed, 8, dt);
        const step = Math.min(dist, this.ch.speed * dt);
        root.position.x += Math.sin(this.heading) * step;
        root.position.z += Math.cos(this.heading) * step;
        if (dist < 0.06) {
          this.path.shift();
          this.lastNode = this.pathNames.shift() ?? this.lastNode;
        }
        break;
      }
      case 'turning': {
        this.timer -= dt;
        this.ch.speed = 0;
        if (this.task) {
          this.heading = dampAngle(this.heading, this.task.face, 8, dt);
          // snap the final few centimetres
          const [x, z] = NODES[this.task.node];
          root.position.x = damp(root.position.x, x, 10, dt);
          root.position.z = damp(root.position.z, z, 10, dt);
          if (this.timer <= 0) {
            this.heading = this.task.face;
            this.begin(this.task);
          }
        }
        break;
      }
      case 'acting':
        this.timer -= dt;
        if (this.timer <= 0) this.begin(this.next());
        break;
      default:
        this.begin(this.next());
    }
    root.rotation.y = this.heading;
    // lounge seat sits a touch forward in the armchair
    this.ch.update(dt);
  }
}

/* ------------------------------------------------------------------ */
/* props sheev picks up                                                 */
/* ------------------------------------------------------------------ */
export function attachProps(ch: Sheev, make: { pen: THREE.Object3D; mug: THREE.Object3D; book: THREE.Object3D; can: THREE.Object3D }) {
  const { pen, mug, book, can } = make;
  pen.position.set(0.0, -0.02, 0.03);
  pen.rotation.set(0.9, 0, 0.2);
  ch.handR.add(pen);
  mug.position.set(0.0, -0.01, 0.05);
  mug.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
  ch.handL.add(mug);
  can.position.set(0, -0.04, 0.05);
  can.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  ch.handR.add(can);
  // open book held in front of the chest
  book.position.set(0, 0.0, 0.3);
  book.rotation.set(-1.0, 0, 0);
  ch.j.chest.add(book);
  const all: Record<Prop, THREE.Object3D> = { pen, mug, book, can };
  const set = (p: Prop | null) => {
    (Object.keys(all) as Prop[]).forEach((k) => (all[k].visible = k === p));
  };
  set(null);
  return set;
}

export const Poses = { registerDeskPoses };
export type { Pose };
