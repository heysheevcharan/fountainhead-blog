import * as THREE from 'three';
import {
  makeBike,
  makeFilmCamera,
  makeFrame,
  makeLilies,
  makeMug,
  makePaddle,
  makePickleball,
  makePlant,
  paperTexture,
  place,
  rbox,
  rod,
  type MatFn,
} from '../../core/props';
import { canvasTexture, rng, TAU } from '../../core/util';
import { WALL_Z, WINDOW } from './room';
import { makeBeam, makeCheatCodes, makeFilmScreen, makeHowToTalk, makeIpodWithEarbuds, makeProjector, makeTravelWall, makeWritingBoard, type BoardPost } from './extras';

const OAK = '#c9a77c';
const STEEL = '#1f1f1f';

function shadows(o: THREE.Object3D, receive = true) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = !m.userData.noShadow;
      m.receiveShadow = receive;
    }
  });
  return o;
}

/* ------------------------------------------------------------------ */
export const DESK = { x: -0.25, z: -1.75, w: 1.6, d: 0.75, h: 0.76 };
/** Where sheev sits (chair pulled in) and where the chair rests when he's up. */
export const SEAT = { x: -0.25, z: -2.42, outZ: -2.64 };

function makeDesk(M: MatFn) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(rbox(DESK.w, 0.04, DESK.d, 0.012), M(OAK, 0.6));
  top.position.y = DESK.h - 0.02;
  g.add(top);
  const legM = M(STEEL, 0.5, 0.4);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, DESK.h - 0.04, 8), legM);
      leg.position.set(sx * (DESK.w / 2 - 0.06), (DESK.h - 0.04) / 2, sz * (DESK.d / 2 - 0.06));
      g.add(leg);
    }
  return shadows(g);
}

function makeChair(M: MatFn) {
  const g = new THREE.Group();
  const wood = M('#b98d5e', 0.6);
  const seat = new THREE.Mesh(rbox(0.46, 0.045, 0.44, 0.02), M('#2f2b28', 0.7));
  seat.position.y = 0.45;
  g.add(seat);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = rod(new THREE.Vector3(sx * 0.18, 0.43, sz * 0.17), new THREE.Vector3(sx * 0.21, 0, sz * 0.2), 0.016, wood, 8);
      g.add(leg);
    }
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 24, 1, true, Math.PI * 0.72, Math.PI * 0.56), M('#2f2b28', 0.7));
  back.material = M('#2f2b28', 0.7);
  (back.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  back.position.set(0, 0.78, 0.04);
  g.add(back);
  for (const sx of [-1, 1]) g.add(rod(new THREE.Vector3(sx * 0.17, 0.46, -0.17), new THREE.Vector3(sx * 0.17, 0.74, -0.2), 0.012, wood, 6));
  return shadows(g);
}

/* ------------------------------------------------------------------ */
/* books from his actual goodreads shelf (spines are colour-coded)        */
/* ------------------------------------------------------------------ */
const SPINES = ['#c8452a', '#2f4858', '#e3d5b8', '#1a1a1a', '#7b8b6f', '#d9a441', '#8c3b2e', '#f2ede4', '#3d5a80', '#ff3c00', '#5a4e7c', '#b7b2a6', '#264653'];

function makeShelf(M: MatFn) {
  const g = new THREE.Group();
  const r = rng(4);
  const w = 1.7;
  const d = 0.32;
  const hgt = 2.05;
  const wood = M('#efe9df', 0.8);
  // carcass
  for (const sz of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(d, hgt, 0.03), wood);
    side.position.set(0, hgt / 2, (sz * w) / 2);
    g.add(side);
  }
  const levels = [0.06, 0.48, 0.9, 1.32, 1.74, 2.04];
  for (const y of levels) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(d, 0.03, w), wood);
    s.position.set(0, y, 0);
    g.add(s);
  }
  // books per shelf (spines face +x, into the room)
  const bookGroup = new THREE.Group();
  levels.slice(0, 4).forEach((y, li) => {
    let z = -w / 2 + 0.05;
    const end = w / 2 - 0.05;
    while (z < end - 0.05) {
      if (r() < 0.07 && z < end - 0.4) {
        // a camera or object gap
        z += 0.2;
        continue;
      }
      const t = 0.022 + r() * 0.03;
      const hh = 0.2 + r() * 0.13;
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.22 + r() * 0.04, hh, t), M(SPINES[Math.floor(r() * SPINES.length)], 0.75));
      book.position.set(0.02, y + 0.015 + hh / 2, z + t / 2);
      if (r() < 0.06) book.rotation.x = 0.18;
      bookGroup.add(book);
      z += t + 0.003;
      if (li === 1 && z > 0.1 && z < 0.2) z = 0.42; // leave room for the film camera
    }
  });
  g.add(bookGroup);
  // horizontal stack on top shelf
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.17), M(SPINES[(i * 3) % SPINES.length], 0.75));
    b.position.set(0.0, 1.755 + i * 0.036, -0.45);
    b.rotation.y = (r() - 0.5) * 0.3;
    g.add(b);
  }
  const plant = makePlant(M, 9, 0.38);
  plant.position.set(0.0, 1.755, 0.45);
  g.add(plant);

  const camera = makeFilmCamera(M);
  camera.position.set(0.04, 0.55, 0.28);
  camera.rotation.y = Math.PI / 2 - 0.3;
  g.add(camera);
  return { group: shadows(g), camera, books: bookGroup };
}

/* ------------------------------------------------------------------ */
/* desk objects                                                         */
/* ------------------------------------------------------------------ */
function screenTexture() {
  return canvasTexture(512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#16181d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#23262d';
    ctx.fillRect(0, 0, 120, h);
    const r = rng(2);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 5 === 0 ? '#ff3c00' : 'rgba(230,226,220,0.55)';
      ctx.fillRect(140 + (i % 3) * 14, 24 + i * 17, 120 + r() * 220, 6);
    }
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = 'rgba(230,226,220,0.25)';
      ctx.fillRect(16, 24 + i * 22, 70 + r() * 20, 6);
    }
  });
}

function makeLaptop(M: MatFn) {
  const g = new THREE.Group();
  const alu = M('#c8c9cc', 0.32, 0.75);
  const base = new THREE.Mesh(rbox(0.32, 0.014, 0.22, 0.006), alu);
  base.position.y = 0.007;
  g.add(base);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.014, 0.11);
  const lid = new THREE.Mesh(rbox(0.32, 0.21, 0.008, 0.006), alu);
  lid.position.set(0, 0.105, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.18), new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }));
  screen.position.set(0, 0.107, -0.0045);
  screen.rotation.y = Math.PI;
  screen.userData.noShadow = true;
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), M('#e4e5e8', 0.2, 0.6));
  logo.position.set(0, 0.11, 0.0045);
  hinge.add(lid, screen, logo);
  hinge.rotation.x = 0.28; // lid tilted back, screen faces sheev (-z)
  g.add(hinge);
  return { group: shadows(g), screen };
}

function makeDiary(M: MatFn) {
  const g = new THREE.Group();
  const tex = paperTexture(256, 256, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(60,80,120,0.25)';
    for (let y = 30; y < h; y += 16) {
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(25,25,25,0.75)';
    ctx.lineWidth = 1.4;
    const r = rng(8);
    for (let y = 28; y < h * 0.72; y += 16) {
      ctx.beginPath();
      let x = 18;
      ctx.moveTo(x, y);
      const end = w * (0.55 + r() * 0.38);
      while (x < end) {
        x += 4 + r() * 6;
        ctx.lineTo(x, y - r() * 5);
      }
      ctx.stroke();
    }
  });
  const pageMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const cover = new THREE.Mesh(rbox(0.15, 0.008, 0.21, 0.003), M('#2b2b2b', 0.6));
    cover.position.set(s * 0.076, 0.004, 0);
    const page = new THREE.Mesh(new THREE.BoxGeometry(0.142, 0.012, 0.2), [M('#f3eee4', 0.9), M('#f3eee4', 0.9), pageMat, M('#f3eee4', 0.9), M('#f3eee4', 0.9), M('#f3eee4', 0.9)]);
    page.position.set(s * 0.074, 0.012, 0);
    page.rotation.z = s * -0.03;
    g.add(cover, page);
  }
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.12), M('#ff3c00', 0.6));
  ribbon.position.set(0.0, 0.02, 0.14);
  g.add(ribbon);
  return shadows(g);
}

function makeDeskLamp(M: MatFn) {
  const g = new THREE.Group();
  const black = M('#1d1d1d', 0.45, 0.2);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.025, 20), black);
  base.position.y = 0.0125;
  g.add(base);
  const p0 = new THREE.Vector3(0, 0.02, 0);
  const p1 = new THREE.Vector3(0.06, 0.38, 0);
  const p2 = new THREE.Vector3(0.32, 0.5, 0);
  g.add(rod(p0, p1, 0.009, black, 6), rod(p1, p2, 0.009, black, 6));
  const head = new THREE.Group();
  head.position.copy(p2);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.12, 20, 1, true), black);
  (shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  shade.position.y = -0.03;
  head.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff4dc', toneMapped: false }));
  bulb.position.y = -0.07;
  bulb.userData.noShadow = true;
  head.add(bulb);
  head.rotation.z = -0.55;
  g.add(head);
  const light = new THREE.SpotLight('#ffbf7a', 0, 3.2, 0.95, 0.75, 1.6);
  light.position.set(0, -0.07, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.0008;
  light.shadow.radius = 4;
  head.add(light);
  const target = new THREE.Object3D();
  target.position.set(0.22, -0.6, 0.0);
  head.add(target);
  light.target = target;
  shadows(g, false);
  shade.castShadow = true;
  return { group: g, light, bulb };
}

/* ------------------------------------------------------------------ */
/* walls: poster, map, film print, clock                                 */
/* ------------------------------------------------------------------ */
function posterRebels() {
  // big, simple type: it has to read from across the room
  return paperTexture(512, 720, (ctx, w, h) => {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '700 88px Arial';
    ctx.fillText('inspired', 40, 150);
    ctx.fillText('by rebels', 40, 244);
    ctx.fillStyle = '#ff3c00';
    ctx.beginPath();
    ctx.arc(58, 318, 15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#5c564c';
    ctx.font = '30px Arial';
    ctx.fillText('rebellion is the source', 40, h - 132);
    ctx.fillText('of all progress.', 40, h - 92);
    ctx.fillRect(40, h - 62, 64, 4);
  });
}

function hiraethMap() {
  return paperTexture(
    512,
    380,
    (ctx, w, h) => {
      const r = rng(31);
      ctx.strokeStyle = '#3d5a80';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const cx = w * 0.48;
      const cy = h * 0.55;
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * TAU;
        const rr = 120 + Math.sin(a * 3) * 22 + Math.cos(a * 5) * 14 + r() * 8;
        const x = cx + Math.cos(a) * rr * 1.25;
        const y = cy + Math.sin(a) * rr * 0.7;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(61,90,128,0.08)';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '600 34px Arial';
      ctx.fillText('hiraeth', 40, 54);
      ctx.font = 'italic 18px Arial';
      ctx.fillStyle = '#666055';
      ctx.fillText('where humanity comes to thrive.', 40, 82);
      const pins: [number, number, string][] = [
        [0.36, 0.5, 'bread'],
        [0.58, 0.44, 'studio'],
        [0.5, 0.68, '3·2·1'],
      ];
      for (const [px, py, label] of pins) {
        ctx.fillStyle = '#ff3c00';
        ctx.beginPath();
        ctx.arc(px * w, py * h, 7, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '18px Arial';
        ctx.fillText(label, px * w + 12, py * h + 6);
      }
    },
    '#efe6d2',
  );
}

function makeClock(M: MatFn) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 32), M('#f7f4ee', 0.6));
  face.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 8, 32), M('#1a1a1a', 0.5));
  g.add(face, rim);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.008, i % 3 === 0 ? 0.03 : 0.018, 0.004), M('#1a1a1a', 0.6));
    tick.position.set(Math.sin(a) * 0.145, Math.cos(a) * 0.145, 0.017);
    tick.rotation.z = -a;
    g.add(tick);
  }
  const mkHand = (len: number, wdt: number, color: string) => {
    const pivot = new THREE.Group();
    const hand = new THREE.Mesh(new THREE.BoxGeometry(wdt, len, 0.004), M(color, 0.5));
    hand.position.y = len / 2 - 0.015;
    pivot.add(hand);
    pivot.position.z = 0.02;
    g.add(pivot);
    return pivot;
  };
  const hour = mkHand(0.09, 0.012, '#1a1a1a');
  const minute = mkHand(0.13, 0.008, '#1a1a1a');
  const second = mkHand(0.14, 0.003, '#ff3c00');
  return { group: shadows(g), hour, minute, second };
}

function makeRug() {
  const tex = canvasTexture(1024, 768, (ctx, w, h) => {
    // jaipur block print: off-white ground, madder + indigo motifs, orange hint
    ctx.fillStyle = '#efe7d8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8c3b2e';
    ctx.lineWidth = 14;
    ctx.strokeRect(26, 26, w - 52, h - 52);
    ctx.strokeStyle = '#2f4858';
    ctx.lineWidth = 5;
    ctx.strokeRect(52, 52, w - 104, h - 104);
    for (let y = 110; y < h - 90; y += 72) {
      for (let x = 110; x < w - 90; x += 72) {
        const alt = ((x + y) / 72) % 2 === 0;
        ctx.fillStyle = alt ? '#8c3b2e' : '#2f4858';
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          const rr = k % 2 ? 9 : 20;
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff3c00';
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, TAU);
        ctx.fill();
      }
    }
  });
  const rug = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.012, 1.5), [
    new THREE.MeshStandardMaterial({ color: '#d8cdb9', roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: '#d8cdb9', roughness: 1 }),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: '#d8cdb9', roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: '#d8cdb9', roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: '#d8cdb9', roughness: 1 }),
  ]);
  rug.receiveShadow = true;
  return rug;
}

function makeArmchair(M: MatFn) {
  const g = new THREE.Group();
  const fabric = M('#c46a3c', 0.95);
  const fabric2 = M('#b25f36', 0.95);
  const seat = new THREE.Mesh(rbox(0.78, 0.2, 0.74, 0.08, 3), fabric);
  seat.position.y = 0.32;
  const back = new THREE.Mesh(rbox(0.78, 0.55, 0.18, 0.08, 3), fabric2);
  back.position.set(0, 0.62, -0.3);
  back.rotation.x = -0.12;
  g.add(seat, back);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(rbox(0.14, 0.34, 0.7, 0.06, 3), fabric2);
    arm.position.set(s * 0.36, 0.45, 0.0);
    g.add(arm);
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.014, 0.22, 8), M('#5b4636', 0.6));
      leg.position.set(sx * 0.32, 0.11, sz * 0.28);
      g.add(leg);
    }
  return shadows(g);
}

/* ------------------------------------------------------------------ */
export function buildFurniture(M: MatFn, posts: BoardPost[] = []) {
  const root = new THREE.Group();
  const WZ = WALL_Z;

  /* ---------- the desk (centre) ---------- */
  const desk = place(makeDesk(M), DESK.x, 0, DESK.z);
  root.add(desk);
  const chair = place(makeChair(M), SEAT.x, 0, SEAT.outZ, 0);
  root.add(chair);
  const laptop = makeLaptop(M);
  place(laptop.group, DESK.x + 0.03, DESK.h, DESK.z - 0.13, 0);
  root.add(laptop.group);
  const diary = place(makeDiary(M), DESK.x - 0.32, DESK.h, DESK.z - 0.24, 0.12);
  root.add(diary);
  const mug = place(makeMug(M), DESK.x + 0.4, DESK.h, DESK.z - 0.2);
  root.add(mug);
  const lamp = makeDeskLamp(M);
  place(lamp.group, DESK.x - 0.66, DESK.h, DESK.z + 0.12, 0.72);
  root.add(lamp.group);
  const ipod = makeIpodWithEarbuds(M);
  ipod.rotation.y = 0.5;
  ipod.position.set(DESK.x + 0.5, DESK.h + 0.001, DESK.z + 0.22);
  ipod.scale.setScalar(1.6);
  root.add(ipod);
  const deskBooks = new THREE.Group();
  ['#e3d5b8', '#1a1a1a', '#c8452a'].forEach((c, i) => {
    const b = new THREE.Mesh(rbox(0.2, 0.035, 0.14, 0.004), M(c, 0.75));
    b.position.set(0, 0.018 + i * 0.036, 0);
    b.rotation.y = i * 0.12;
    deskBooks.add(b);
  });
  const howToTalk = makeHowToTalk(M);
  howToTalk.position.set(0.01, 3 * 0.036 + 0.016, 0.0);
  howToTalk.rotation.y = -0.15;
  deskBooks.add(howToTalk);
  place(deskBooks, DESK.x + 0.62, DESK.h, DESK.z - 0.18, 0.2);
  root.add(shadows(deskBooks));

  /*
   * The wall, left to right, as a few calm groups instead of one crowded strip under the page
   * header: the film screen alone in its corner, open wall, then the board over the desk with the
   * poster beside it (tops aligned), the window, and a line of small frames over the shelf —
   * the clock (bangalore time) leading his travel photos.
   */
  // above the desk: the writing board — his latest posts pinned up (+ the map of hiraeth)
  const board = makeWritingBoard(M, posts, { texture: hiraethMap(), w: 0.3, h: 0.22 });
  board.group.position.set(DESK.x - 0.25, 1.89, WZ + 0.004); // top at 2.2, like the poster's
  root.add(board.group);

  /* ---------- the window + lilies (right of centre) ---------- */
  const vase = new THREE.Group();
  const vbody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.5, 20), M('#e9e4da', 0.35));
  vbody.position.y = 0.25;
  vase.add(vbody);
  const lilies = makeLilies(M, 4, 12);
  lilies.position.y = 0.48;
  lilies.scale.setScalar(1.2);
  vase.add(lilies);
  place(vase, 2.25, 0, WZ + 0.32);
  root.add(shadows(vase));

  /* ---------- the bookshelf (right), a line of small frames above it ---------- */
  const shelf = makeShelf(M);
  place(shelf.group, 3.55, 0, WZ + 0.17, -Math.PI / 2); // spines face the room
  root.add(shelf.group);
  const cheatCodes = makeCheatCodes(M);
  cheatCodes.position.set(0.125, 0.495 + 0.105, 0.05);
  cheatCodes.rotation.z = 0.08;
  shelf.group.add(cheatCodes);
  // over the shelf, one line: the clock, then his travel photos
  const tSize = 0.26;
  const tGap = 0.05;
  const clockD = 0.29; // the clock, scaled to sit in line with the frames
  const lineW = clockD + 0.07 + 4 * tSize + 3 * tGap;
  const lineX = 3.55 - lineW / 2;
  const clock = makeClock(M);
  clock.group.scale.setScalar(clockD / 0.364);
  clock.group.position.set(lineX + clockD / 2, 2.42, WZ + 0.03);
  root.add(clock.group);
  const travelWall = makeTravelWall(M, tSize, tGap, 4);
  travelWall.position.set(lineX + clockD + 0.07 + tSize / 2, 2.42, WZ + 0.025);
  root.add(travelWall);

  /* ---------- beside the board, at eye level: the poster ---------- */
  const poster = makeFrame(M, 0.43, 0.6, posterRebels());
  poster.position.set(0.47, 1.9, WZ + 0.03); // top edge lines up with the board's
  const posterWrap = new THREE.Group();
  posterWrap.add(poster);
  root.add(posterWrap);

  /* ---------- just past the right edge (drag to find): bike, paddle ---------- */
  const bike = makeBike(M, '#ff3c00');
  bike.group.position.set(6.7, 0, WZ + 0.32);
  bike.group.rotation.x = -0.06;
  bike.setCrank(0.6);
  root.add(bike.group);
  const paddle = makePaddle(M);
  paddle.position.set(7.75, 1.3, WZ + 0.03);
  paddle.rotation.set(0, 0, 0.12);
  root.add(paddle);
  const ball = makePickleball(M);
  ball.position.set(7.6, 0.04, WZ + 0.3);
  root.add(ball);

  /* ---------- the film corner (left): armchair facing a screen, projector beaming ---------- */
  const SCREEN = { x: -2.42, y: 1.46 };
  const filmScreen = makeFilmScreen(0.96, 0.54);
  filmScreen.group.position.set(SCREEN.x, SCREEN.y, WZ + 0.02);
  root.add(filmScreen.group);
  const film = filmScreen.group;
  const projector = makeProjector(M);
  projector.group.position.set(-1.62, 0, -1.02);
  root.add(projector.group);
  const screenCenter = new THREE.Vector3(SCREEN.x, SCREEN.y, WZ + 0.04);
  const dx = screenCenter.x - projector.group.position.x;
  const dz = screenCenter.z - projector.group.position.z;
  const dy = screenCenter.y - (projector.group.position.y + 0.67);
  projector.body.rotation.set(0, Math.atan2(dz, -dx), -Math.atan2(dy, Math.hypot(dx, dz)) * 0.55);
  root.updateMatrixWorld(true);
  const lensWorld = projector.lensTip.getWorldPosition(new THREE.Vector3());
  const hw = 0.48;
  const hh = 0.27;
  const corners = [
    new THREE.Vector3(SCREEN.x - hw, SCREEN.y + hh, WZ + 0.04),
    new THREE.Vector3(SCREEN.x + hw, SCREEN.y + hh, WZ + 0.04),
    new THREE.Vector3(SCREEN.x + hw, SCREEN.y - hh, WZ + 0.04),
    new THREE.Vector3(SCREEN.x - hw, SCREEN.y - hh, WZ + 0.04),
  ];
  const beam = makeBeam(lensWorld, corners);
  root.add(beam.mesh, beam.motes);
  const rug = makeRug();
  rug.position.set(-2.3, 0.006, -1.55);
  root.add(rug);
  const armchair = place(makeArmchair(M), -2.42, 0, -1.35, Math.PI);
  root.add(armchair);
  const side = new THREE.Group();
  const sideTop = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 24), M(OAK, 0.6));
  sideTop.position.y = 0.52;
  const sideLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.52, 8), M(STEEL, 0.5, 0.4));
  sideLeg.position.y = 0.26;
  const sideFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20), M(STEEL, 0.5, 0.4));
  side.add(sideTop, sideLeg, sideFoot);
  const book = new THREE.Mesh(rbox(0.16, 0.03, 0.22, 0.004), M('#2f4858', 0.7));
  book.position.y = 0.55;
  book.rotation.y = 0.4;
  side.add(book);
  place(side, -3.22, 0, -1.12);
  root.add(shadows(side));

  /* ---------- plants framing the edges ---------- */
  const plant = makePlant(M, 3, 1.25);
  plant.position.set(-3.95, 0, WZ + 0.45);
  root.add(plant);
  const plant2 = makePlant(M, 17, 0.85);
  plant2.position.set(4.6, 0, WZ + 0.4);
  root.add(plant2);

  return {
    root,
    desk,
    chair,
    laptop,
    diary,
    mug,
    lamp,
    ipod,
    shelf,
    lilies,
    vase,
    bike,
    paddle,
    poster: posterWrap,
    board,
    map: board.map!,
    film,
    filmScreen,
    projector,
    beam,
    travelWall,
    cheatCodes,
    howToTalk,
    clock,
    armchair,
    windowArea: (() => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.x1 - WINDOW.x0, WINDOW.y1 - WINDOW.y0), new THREE.MeshBasicMaterial({ visible: false }));
      m.position.set((WINDOW.x0 + WINDOW.x1) / 2, (WINDOW.y0 + WINDOW.y1) / 2, WZ + 0.01);
      root.add(m);
      return m;
    })(),
  };
}
