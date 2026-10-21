import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, rng, smoothstep, TAU } from './util';

/* ------------------------------------------------------------------ */
/* shared material cache                                                */
/* ------------------------------------------------------------------ */
export type MatFn = (color: THREE.ColorRepresentation, rough?: number, metal?: number) => THREE.Material;

export function standardMats(): MatFn {
  const cache = new Map<string, THREE.Material>();
  return (color, rough = 0.8, metal = 0) => {
    const key = `${new THREE.Color(color).getHexString()}:${rough}:${metal}`;
    let m = cache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      cache.set(key, m);
    }
    return m;
  };
}

export const rbox = (w: number, h: number, d: number, r = 0.01, seg = 2) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));

export function place<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

/** Cylinder spanning two points. */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 10) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

function shadowAll(o: THREE.Object3D, cast = true, receive = true) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast && !m.userData.noShadow;
      m.receiveShadow = receive;
    }
  });
  return o;
}

/* ------------------------------------------------------------------ */
/* bicycle — the rule-breaking ride from "don't play their game"        */
/* ------------------------------------------------------------------ */
export interface Bike {
  group: THREE.Group;
  crank: THREE.Group;
  wheels: THREE.Group[];
  saddle: THREE.Vector3;
  grips: [THREE.Vector3, THREE.Vector3];
  pedalRadius: number;
  crankCenter: THREE.Vector3;
  setCrank(angle: number): void;
}

export function makeBike(M: MatFn, frameColor: THREE.ColorRepresentation = '#ff3c00'): Bike {
  const g = new THREE.Group();
  const frame = M(frameColor, 0.45, 0.1);
  const black = M('#1b1b1b', 0.7);
  const chrome = M('#c9c9c9', 0.3, 0.8);
  const leather = M('#7a4a2a', 0.6);
  const R = 0.34;
  const rear = new THREE.Vector3(-0.52, R, 0);
  const front = new THREE.Vector3(0.54, R, 0);
  const bb = new THREE.Vector3(-0.02, 0.3, 0);
  const seatTop = new THREE.Vector3(-0.16, 0.84, 0);
  const headTop = new THREE.Vector3(0.38, 0.86, 0);
  const headBot = new THREE.Vector3(0.42, 0.7, 0);
  const tubes: [THREE.Vector3, THREE.Vector3, number][] = [
    [bb, seatTop, 0.017],
    [seatTop, headTop, 0.016],
    [bb, headBot, 0.019],
    [headBot, headTop, 0.022],
  ];
  for (const z of [-0.045, 0.045]) {
    const r = rear.clone().setZ(z);
    tubes.push([bb.clone().setZ(z * 0.6), r, 0.011]);
    tubes.push([seatTop.clone().setZ(z * 0.3), r, 0.011]);
    const f = front.clone().setZ(z * 0.9);
    tubes.push([headBot.clone().setZ(z * 0.5), f, 0.012]);
  }
  for (const [a, b, r] of tubes) g.add(rod(a, b, r, frame));
  // seat post + saddle
  const saddlePos = new THREE.Vector3(-0.19, 0.93, 0);
  g.add(rod(seatTop, saddlePos.clone().add(new THREE.Vector3(0.02, -0.03, 0)), 0.012, chrome));
  const saddle = new THREE.Mesh(rbox(0.24, 0.05, 0.13, 0.025), leather);
  saddle.position.copy(saddlePos);
  saddle.scale.set(1, 1, 1);
  g.add(saddle);
  // stem + bars
  const stemTop = new THREE.Vector3(0.34, 1.02, 0);
  g.add(rod(headTop, stemTop, 0.013, chrome));
  const grips: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(0.24, 1.03, 0.26), new THREE.Vector3(0.24, 1.03, -0.26)];
  const barCurve = new THREE.CatmullRomCurve3([grips[0], new THREE.Vector3(0.36, 1.03, 0.12), new THREE.Vector3(0.36, 1.03, -0.12), grips[1]]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(barCurve, 24, 0.012, 6), chrome));
  for (const gp of grips) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 10), M('#3a2416', 0.7));
    grip.position.copy(gp);
    grip.rotation.x = Math.PI / 2;
    g.add(grip);
  }
  // wheels
  const wheels: THREE.Group[] = [];
  for (const c of [rear, front]) {
    const w = new THREE.Group();
    w.position.copy(c);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(R - 0.02, 0.024, 10, 48), black);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.045, 0.008, 6, 48), chrome);
    w.add(tire, rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.07, 10), chrome);
    hub.rotation.x = Math.PI / 2;
    w.add(hub);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const sp = rod(new THREE.Vector3(0, 0, i % 2 ? 0.02 : -0.02), new THREE.Vector3(Math.cos(a) * (R - 0.05), Math.sin(a) * (R - 0.05), 0), 0.0025, chrome, 4);
      sp.castShadow = false;
      w.add(sp);
    }
    wheels.push(w);
    g.add(w);
  }
  // crank
  const crank = new THREE.Group();
  crank.position.copy(bb);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 24), chrome);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = -0.05;
  crank.add(ring);
  const pedalR = 0.165;
  for (const side of [1, -1]) {
    const arm = new THREE.Mesh(rbox(0.03, pedalR + 0.03, 0.014, 0.007), chrome);
    arm.position.set(0, (side * pedalR) / 2, side * 0.075);
    crank.add(arm);
    const pedal = new THREE.Mesh(rbox(0.09, 0.022, 0.08, 0.006), black);
    pedal.position.set(0, side * pedalR, side * 0.115);
    pedal.name = side > 0 ? 'pedalTop' : 'pedalBottom';
    crank.add(pedal);
  }
  g.add(crank);
  // chain (simple loop)
  const chainCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(bb.x, bb.y + 0.09, -0.05),
      new THREE.Vector3(rear.x, rear.y + 0.04, -0.05),
      new THREE.Vector3(rear.x - 0.04, rear.y, -0.05),
      new THREE.Vector3(rear.x, rear.y - 0.04, -0.05),
      new THREE.Vector3(bb.x, bb.y - 0.09, -0.05),
      new THREE.Vector3(bb.x + 0.09, bb.y, -0.05),
    ],
    true,
  );
  g.add(new THREE.Mesh(new THREE.TubeGeometry(chainCurve, 48, 0.005, 4, true), black));
  // fenders
  for (const c of [rear, front]) {
    const f = new THREE.Mesh(new THREE.TorusGeometry(R + 0.03, 0.022, 4, 24, Math.PI * 0.7), frame);
    f.position.copy(c);
    f.rotation.z = c === rear ? Math.PI * 0.18 : Math.PI * 0.12;
    f.scale.z = 1.6;
    g.add(f);
  }
  shadowAll(g, true, false);
  return {
    group: g,
    crank,
    wheels,
    saddle: saddlePos,
    grips,
    pedalRadius: pedalR,
    crankCenter: bb.clone(),
    setCrank(angle: number) {
      crank.rotation.z = -angle;
      crank.children.forEach((ch) => {
        if (ch.name.startsWith('pedal')) ch.rotation.z = angle; // pedals stay level
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* lilies — "I want a Lily mode … because I love them"                   */
/* ------------------------------------------------------------------ */
/**
 * Oriental lilies ("stargazer"): erect stems with lance leaves, open six-tepal blooms facing
 * up and out (trumpet throat, flared + recurved tips, freckles, long rust anthers) and
 * closed buds. `heads` (userData) are the blooms + buds, for the scene to sway.
 */
export function makeLilies(M: MatFn, count = 3, seed = 7) {
  const g = new THREE.Group();
  const r = rng(seed);
  const stemMat = M('#3f6a33', 0.7);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4c7a3a', roughness: 0.6, side: THREE.DoubleSide });
  const tepalTex = canvasTexture(256, 128, (ctx, w, h) => {
    // u (x) runs base → tip, v (y) across the tepal
    const base = ctx.createLinearGradient(0, 0, w, 0);
    base.addColorStop(0, '#cfe3a6');
    base.addColorStop(0.13, '#f3a6c1');
    base.addColorStop(0.38, '#dc2f6c');
    base.addColorStop(0.8, '#e64a85');
    base.addColorStop(1, '#f9c4d8');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // white margins
    const edge = ctx.createLinearGradient(0, 0, 0, h);
    edge.addColorStop(0, 'rgba(255,248,251,0.9)');
    edge.addColorStop(0.15, 'rgba(255,248,251,0)');
    edge.addColorStop(0.85, 'rgba(255,248,251,0)');
    edge.addColorStop(1, 'rgba(255,248,251,0.9)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
    // the deeper midrib
    ctx.fillStyle = 'rgba(200,30,90,0.35)';
    ctx.fillRect(w * 0.12, h * 0.46, w * 0.8, h * 0.08);
    // freckles toward the throat
    const fr = rng(seed + 3);
    for (let i = 0; i < 46; i++) {
      const u = 0.12 + fr() * 0.42;
      ctx.fillStyle = `rgba(150,10,55,${0.55 + fr() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(u * w, (0.3 + fr() * 0.4) * h, 1.6 + fr() * 2.2, 1.2 + fr() * 1.4, 0, 0, TAU);
      ctx.fill();
    }
  });
  const tepalMat = new THREE.MeshStandardMaterial({
    map: tepalTex,
    roughness: 0.5,
    side: THREE.DoubleSide,
    emissive: new THREE.Color('#ff4f8f'),
    emissiveIntensity: 0.14, // petals glow a little in shade: light passes through them
  });
  const budMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(64, 128, (ctx, w, h) => {
      const gr = ctx.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, '#6f9a4a');
      gr.addColorStop(0.55, '#c9d9a0');
      gr.addColorStop(0.85, '#f3a9c2');
      gr.addColorStop(1, '#e8608f');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
    }),
    roughness: 0.55,
  });
  const filamentMat = M('#e9f0d6', 0.6);
  const antherMat = M('#9b3a12', 0.8);
  const stigmaMat = M('#b9cf7a', 0.6);

  /** one tepal as a curved, grooved, pointed strip; axis +Z is the bloom's facing */
  const tepalGeo = (len: number, wid: number, open: number, curl: number) => {
    const nu = 14;
    const nv = 6;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let rr = 0.006;
    let zz = 0;
    const centre: [number, number, number][] = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const a = 0.32 + (open - 0.32) * smoothstep(0, 0.55, u) + (curl - open) * smoothstep(0.5, 1, u);
      centre.push([rr, zz, a]);
      rr += (Math.sin(a) * len) / nu;
      zz += (Math.cos(a) * len) / nu;
    }
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const [cr, cz, a] = centre[i];
      const width = wid * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(u, 0.7) * 0.98 + 0.02)), 0.85);
      for (let j = 0; j <= nv; j++) {
        const v = (j / nv) * 2 - 1;
        // groove: the midrib sits a little below the margins; margins ripple
        const lift = (1 - v * v) * -0.0035 * Math.sin(Math.PI * u) + Math.abs(v) ** 3 * 0.0012 * Math.sin(u * 22);
        const nx = Math.cos(a);
        const nz = -Math.sin(a);
        pos.push(cr + nx * lift, v * width, cz + nz * lift);
        uv.push(u, (v + 1) / 2);
      }
    }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a0 = i * (nv + 1) + j;
        const b0 = a0 + nv + 1;
        idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // the strip was built in the x/z plane (radial = +x); rotate so it can be spun about +z
    return geo;
  };
  const innerGeo = tepalGeo(0.095, 0.029, 1.05, 1.7);
  const outerGeo = tepalGeo(0.098, 0.021, 1.12, 1.85);

  const bloom = () => {
    const head = new THREE.Group();
    for (let p = 0; p < 6; p++) {
      const t = new THREE.Mesh(p % 2 ? innerGeo : outerGeo, tepalMat);
      // radial +x → spun around the facing axis (+z)
      t.rotation.z = (p / 6) * TAU + (r() - 0.5) * 0.12;
      head.add(t);
    }
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * TAU + 0.5;
      const tip = new THREE.Vector3(Math.cos(a) * 0.026, Math.sin(a) * 0.026, 0.064 + r() * 0.008);
      const fil = rod(new THREE.Vector3(Math.cos(a) * 0.003, Math.sin(a) * 0.003, 0.006), tip, 0.0012, filamentMat, 4);
      head.add(fil);
      const anther = new THREE.Mesh(new THREE.CapsuleGeometry(0.0028, 0.011, 3, 6), antherMat);
      anther.position.copy(tip);
      anther.rotation.set(0, 0, a); // lies across the filament tip (tangential), like a T
      head.add(anther);
    }
    head.add(rod(new THREE.Vector3(0, 0, 0.004), new THREE.Vector3(0.004, 0.002, 0.074), 0.0016, filamentMat, 5));
    const stigma = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), stigmaMat);
    stigma.position.set(0.004, 0.002, 0.076);
    head.add(stigma);
    // the green base the tepals spring from
    const cup = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.02, 8), stemMat);
    cup.rotation.x = -Math.PI / 2;
    cup.position.z = -0.006;
    head.add(cup);
    return head;
  };
  const budGeo = new THREE.LatheGeometry(
    [
      [0.0, 0],
      [0.008, 0.008],
      [0.014, 0.03],
      [0.016, 0.055],
      [0.012, 0.078],
      [0.005, 0.094],
      [0.0, 0.1],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    10,
  );
  const bud = () => {
    const head = new THREE.Group();
    const b = new THREE.Mesh(budGeo, budMat);
    b.rotation.x = Math.PI / 2; // lathe axis (+y) → facing (+z)
    head.add(b);
    return head;
  };

  const heads: THREE.Group[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  // stems: [height, lean x, lean z, blooms, buds]
  const stems: [number, number, number, number, number][] = [
    [0.62, -0.08, 0.04, 2, 1],
    [0.55, 0.11, 0.03, 2, 1],
    [0.48, -0.03, 0.13, 1, 2],
    [0.58, 0.04, -0.07, 1, 1],
  ].slice(0, Math.max(1, count)) as [number, number, number, number, number][];
  stems.forEach(([h, lx, lz, nBloom, nBud], si) => {
    const dir = new THREE.Vector3(lx, 1, lz).normalize();
    const top = dir.clone().multiplyScalar(h);
    g.add(rod(new THREE.Vector3(0, 0, 0), top, 0.0055, stemMat, 6));
    // lance leaves spiralling up the stem, pointing upward
    const nLeaves = 7;
    for (let k = 0; k < nLeaves; k++) {
      const y = 0.05 + (k / nLeaves) * h * 0.75;
      const len = 0.075 + r() * 0.03;
      const geo = new THREE.PlaneGeometry(0.014, len, 1, 4);
      const pa = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) {
        const yy = pa.getY(i) / len + 0.5; // 0..1 along the leaf
        pa.setX(i, pa.getX(i) * Math.sin(Math.PI * Math.min(1, yy * 0.95 + 0.05)));
        pa.setZ(i, -0.012 * yy * yy); // arches outward
        pa.setY(i, pa.getY(i) + len / 2);
      }
      geo.computeVertexNormals();
      const leaf = new THREE.Mesh(geo, leafMat);
      leaf.position.copy(dir.clone().multiplyScalar(y));
      leaf.rotation.set(0, si * 1.3 + k * 2.4, 0);
      leaf.rotateX(-0.55 - r() * 0.25);
      g.add(leaf);
    }
    // blooms + buds on short pedicels around the top, facing up and out (toward the room)
    const n = nBloom + nBud;
    for (let i = 0; i < n; i++) {
      const isBloom = i < nBloom;
      const az = (si * 1.7 + i * (TAU / n)) % TAU;
      const out = new THREE.Vector3(Math.sin(az) * 0.55, 0, Math.abs(Math.cos(az)) * 0.75 + 0.35).normalize();
      const face = out.clone().multiplyScalar(isBloom ? 0.82 : 0.45).add(up.clone().multiplyScalar(isBloom ? 0.62 : 1)).normalize();
      const pedicelEnd = top.clone().add(out.clone().multiplyScalar(0.035)).add(up.clone().multiplyScalar(isBloom ? 0.015 - i * 0.025 : 0.03 - i * 0.012));
      g.add(rod(top.clone().add(up.clone().multiplyScalar(-0.02 - i * 0.02)), pedicelEnd, 0.0035, stemMat, 5));
      const head = isBloom ? bloom() : bud();
      head.position.copy(pedicelEnd);
      head.lookAt(pedicelEnd.clone().add(face));
      head.userData.base = head.quaternion.clone();
      heads.push(head);
      g.add(head);
    }
  });
  shadowAll(g, true, false);
  g.userData.heads = heads;
  return g;
}

/* ------------------------------------------------------------------ */
/* small objects                                                        */
/* ------------------------------------------------------------------ */
export function makeMug(M: MatFn, color = '#f4efe7', band = '#ff3c00') {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 18), M(color, 0.4));
  body.position.y = 0.05;
  const bandM = new THREE.Mesh(new THREE.CylinderGeometry(0.0425, 0.0425, 0.012, 18), M(band, 0.5));
  bandM.position.y = 0.085;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 6, 12), M(color, 0.4));
  handle.position.set(0.045, 0.05, 0);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16), M('#3b2417', 0.3));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.092;
  g.add(body, bandM, handle, coffee);
  return shadowAll(g, true, false);
}

export function makePen(M: MatFn) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.14, 8), M('#151515', 0.4));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.015, 8), M('#c9c9c9', 0.3, 0.8));
  tip.position.y = -0.077;
  tip.rotation.x = Math.PI;
  g.add(body, tip);
  return g;
}

export function makeBook(M: MatFn, color: THREE.ColorRepresentation = '#c8452a', w = 0.15, h = 0.22, d = 0.03, open = false) {
  const g = new THREE.Group();
  if (!open) {
    const cover = new THREE.Mesh(rbox(w, h, d, 0.004), M(color, 0.7));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h * 0.95, d * 0.8), M('#f5f0e4', 0.9));
    pages.position.x = 0.004;
    g.add(cover, pages);
  } else {
    for (const s of [-1, 1]) {
      const half = new THREE.Group();
      const cover = new THREE.Mesh(rbox(w, 0.006, h, 0.002), M(color, 0.7));
      const page = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.012, h * 0.95), M('#f7f2e8', 0.9));
      page.position.y = 0.008;
      cover.position.x = (s * w) / 2;
      page.position.x = (s * w) / 2;
      half.add(cover, page);
      half.rotation.z = s * -0.08;
      g.add(half);
    }
  }
  return shadowAll(g, true, true);
}

export function makeWateringCan(M: MatFn) {
  const g = new THREE.Group();
  const mat = M('#3d6b5a', 0.5, 0.3);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 16), mat);
  const spout = rod(new THREE.Vector3(0, -0.02, 0.06), new THREE.Vector3(0, 0.07, 0.2), 0.012, mat, 8);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 14, Math.PI), mat);
  handle.position.set(0, 0.07, -0.01);
  handle.rotation.y = Math.PI / 2;
  g.add(body, spout, handle);
  return shadowAll(g, true, false);
}

export function makeIpodNano(M: MatFn) {
  // 3rd gen "fatty": wide, short, screen on top half, click wheel below
  const g = new THREE.Group();
  const body = new THREE.Mesh(rbox(0.052, 0.07, 0.0065, 0.006), M('#d6d6d8', 0.25, 0.85));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.028), M('#2a3a55', 0.2));
  screen.position.set(0, 0.016, 0.0034);
  const wheel = new THREE.Mesh(new THREE.CircleGeometry(0.0145, 20), M('#f5f5f5', 0.5));
  wheel.position.set(0, -0.016, 0.0034);
  const btn = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 16), M('#d0d0d0', 0.4));
  btn.position.set(0, -0.016, 0.0036);
  g.add(body, screen, wheel, btn);
  return g;
}

export function makeFilmCamera(M: MatFn) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(rbox(0.14, 0.085, 0.05, 0.01), M('#1c1c1c', 0.6));
  const top = new THREE.Mesh(rbox(0.13, 0.02, 0.046, 0.005), M('#c8c8c8', 0.3, 0.8));
  top.position.y = 0.05;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.045, 18), M('#111', 0.4));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0.01, -0.003, 0.045);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), M('#2b3550', 0.05, 0.5));
  glass.position.set(0.01, -0.003, 0.068);
  g.add(body, top, lens, glass);
  return shadowAll(g, true, false);
}

export function makePaddle(M: MatFn, face = '#1d1d1f', edge = '#ff3c00') {
  const g = new THREE.Group();
  const f = new THREE.Mesh(rbox(0.19, 0.25, 0.014, 0.05), M(face, 0.55));
  f.position.y = 0.13;
  const e = new THREE.Mesh(rbox(0.196, 0.256, 0.01, 0.052), M(edge, 0.5));
  e.position.y = 0.13;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.13, 10), M('#2a2a2a', 0.8));
  handle.position.y = -0.05;
  g.add(e, f, handle);
  return shadowAll(g, true, false);
}

export function makePickleball(M: MatFn) {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.037, 14, 10), M('#d9ef3a', 0.6));
  ball.castShadow = true;
  return ball;
}

/** Snake plant in a terracotta pot. */
export function makePlant(M: MatFn, seed = 3, scale = 1) {
  const g = new THREE.Group();
  const r = rng(seed);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.36, 22), M('#b4643f', 0.85));
  pot.position.y = 0.18;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 22), M('#a65a37', 0.85));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.36;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20), M('#3b2a20', 1));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.34;
  g.add(pot, rim, soil);
  const leafMat = M('#3f6b3c', 0.7);
  const leafMat2 = M('#6d8a3e', 0.7);
  for (let i = 0; i < 11; i++) {
    const h = 0.55 + r() * 0.6;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.045, h, 4, 1), i % 3 ? leafMat : leafMat2);
    leaf.scale.z = 0.25;
    const a = r() * TAU;
    const rr = r() * 0.1;
    leaf.position.set(Math.cos(a) * rr, 0.34 + h / 2, Math.sin(a) * rr);
    leaf.rotation.set((r() - 0.5) * 0.35, r() * TAU, (r() - 0.5) * 0.35);
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return shadowAll(g, true, true);
}

/** Text-on-paper texture helper for posters, maps, signs. */
export function paperTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  bg = '#f6f2ea',
) {
  return canvasTexture(w, h, (ctx, W, H) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    draw(ctx, W, H);
  });
}

export function makeFrame(M: MatFn, w: number, h: number, tex: THREE.Texture, frameColor = '#1a1a1a', depth = 0.03) {
  const g = new THREE.Group();
  const t = 0.025;
  const fm = M(frameColor, 0.5);
  const parts: [number, number, number, number][] = [
    [0, h / 2 - t / 2, w, t],
    [0, -h / 2 + t / 2, w, t],
    [-w / 2 + t / 2, 0, t, h],
    [w / 2 - t / 2, 0, t, h],
  ];
  for (const [x, y, pw, ph] of parts) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, depth), fm);
    p.position.set(x, y, 0);
    g.add(p);
  }
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w - t * 2, h - t * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  art.position.z = -depth / 2 + 0.004;
  g.add(art);
  return shadowAll(g, true, true);
}
