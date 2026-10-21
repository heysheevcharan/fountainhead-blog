import * as THREE from 'three';
import { makeIpodNano, rbox, rod, type MatFn } from '../../core/props';
import { canvasTexture, rng, TAU } from '../../core/util';

/* ------------------------------------------------------------------ */
/* films: a projector beaming his letterboxd favourites onto a screen     */
/* ------------------------------------------------------------------ */
export const FILMS: [string, number][] = [
  ['the godfather', 1972],
  ['12 angry men', 1957],
  ['the truman show', 1998],
  ['fight club', 1999],
  ['rrr', 2022],
  ['pulp fiction', 1994],
  ['oppenheimer', 2023],
  ['c/o kancharapalem', 2018],
  ['3 idiots', 2009],
  ['eega', 2012],
  ['goodfellas', 1990],
  ['the silence of the lambs', 1991],
];

export function makeFilmScreen(w = 0.92, h = 0.52) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  let index = 0;
  const draw = () => {
    const [title, year] = FILMS[index % FILMS.length];
    ctx.fillStyle = '#0d0c0b';
    ctx.fillRect(0, 0, 640, 360);
    // vignette
    const g = ctx.createRadialGradient(320, 180, 60, 320, 180, 380);
    g.addColorStop(0, 'rgba(255,240,220,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = 'rgba(245,235,220,0.55)';
    ctx.font = '600 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('— sheev’s favourites —', 320, 92);
    ctx.fillStyle = '#f5ecdf';
    ctx.font = `italic ${title.length > 16 ? 50 : 62}px Georgia, serif`;
    ctx.fillText(title, 320, 196);
    ctx.fillStyle = 'rgba(245,235,220,0.7)';
    ctx.font = '26px Arial';
    ctx.fillText(String(year), 320, 248);
    // film grain + scratches
    const r = rng(index * 31 + 7);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(255,255,255,${r() * 0.07})`;
      ctx.fillRect(r() * 640, r() * 360, 1.5, 1.5);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(r() * 640, 0, 1, 360);
    tex.needsUpdate = true;
  };
  draw();
  const group = new THREE.Group();
  const frame = new THREE.Mesh(rbox(w + 0.06, h + 0.06, 0.03, 0.01), new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.z = 0.017;
  group.add(frame, screen);
  frame.castShadow = true;
  return {
    group,
    screen,
    next() {
      index++;
      draw();
    },
    flicker(t: number) {
      const f = 0.86 + Math.sin(t * 37) * 0.03 + Math.sin(t * 91) * 0.02 + (Math.random() < 0.02 ? -0.12 : 0);
      (screen.material as THREE.MeshBasicMaterial).color.setScalar(f);
    },
    get current() {
      return FILMS[index % FILMS.length];
    },
  };
}

export function makeProjector(M: MatFn) {
  const g = new THREE.Group();
  // stool
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 24), M('#c9a77c', 0.6));
  top.position.y = 0.56;
  g.add(top);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    g.add(rod(new THREE.Vector3(Math.cos(a) * 0.12, 0.55, Math.sin(a) * 0.12), new THREE.Vector3(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2), 0.014, M('#3a2e25', 0.6), 6));
  }
  // projector body
  const body = new THREE.Group();
  body.position.y = 0.58;
  g.add(body);
  const box = new THREE.Mesh(rbox(0.3, 0.17, 0.2, 0.03), M('#2c2c2e', 0.45, 0.3));
  box.position.y = 0.085;
  body.add(box);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.042, 0.1, 18), M('#111111', 0.3, 0.5));
  lens.rotation.z = Math.PI / 2;
  lens.position.set(-0.19, 0.09, 0);
  body.add(lens);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: '#fff3dc', toneMapped: false }));
  glass.rotation.y = -Math.PI / 2;
  glass.position.set(-0.241, 0.09, 0);
  body.add(glass);
  const reels: THREE.Object3D[] = [];
  for (const [x, rr] of [
    [-0.06, 0.1],
    [0.1, 0.085],
  ] as const) {
    const reel = new THREE.Group();
    reel.position.set(x, 0.25 + rr * 0.5, 0);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.018, 28), M('#3b3b3e', 0.4, 0.6));
    disc.rotation.x = Math.PI / 2;
    reel.add(disc);
    for (let k = 0; k < 3; k++) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.28, rr * 0.28, 0.02, 14), M('#1b1b1c', 0.6));
      hole.rotation.x = Math.PI / 2;
      const a = (k / 3) * TAU;
      hole.position.set(Math.cos(a) * rr * 0.5, Math.sin(a) * rr * 0.5, 0.001);
      reel.add(hole);
    }
    body.add(rod(new THREE.Vector3(x, 0.17, 0), new THREE.Vector3(x, reel.position.y, 0), 0.008, M('#555', 0.4, 0.5), 5));
    body.add(reel);
    reels.push(reel);
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return { group: g, body, reels, lensTip: glass };
}

/** A soft additive beam between the lens and the screen rectangle. */
export function makeBeam(from: THREE.Vector3, corners: THREE.Vector3[]) {
  const pos = new Float32Array([from.x, from.y, from.z, ...corners.flatMap((c) => [c.x, c.y, c.z])]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: '#fff1d6', transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.raycast = () => {};
  // dust motes drifting in the light
  const N = 60;
  const dust = new Float32Array(N * 3);
  const r = rng(5);
  const seeds: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = r();
    const c = corners[Math.floor(r() * 4)];
    const p = from.clone().lerp(c, t * 0.9).lerp(from.clone().lerp(corners[(Math.floor(r() * 4) + 2) % 4], t), r() * 0.6);
    dust.set([p.x, p.y, p.z], i * 3);
    seeds.push(r() * 10);
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const motes = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: '#fff4e0', size: 0.012, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.raycast = () => {};
  const base = dust.slice();
  return {
    mesh,
    motes,
    update(t: number) {
      const a = dGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        a.setY(i, base[i * 3 + 1] + Math.sin(t * 0.3 + seeds[i]) * 0.04);
        a.setX(i, base[i * 3] + Math.cos(t * 0.21 + seeds[i]) * 0.02);
      }
      a.needsUpdate = true;
      mat.opacity = 0.07 + Math.sin(t * 40) * 0.006;
    },
  };
}

/* ------------------------------------------------------------------ */
/* travel: a framed wall of his own photos                               */
/* ------------------------------------------------------------------ */
export const TRAVEL_PHOTOS = [
  { src: '/3d/travel/jaipur.jpg', label: 'jaipur' },
  { src: '/3d/travel/philippines.jpg', label: 'la union' },
  { src: '/3d/travel/singapore.jpg', label: 'singapore' },
  { src: '/3d/travel/vietnam.jpg', label: 'ho chi minh city' },
];

export function makeTravelWall(M: MatFn, size = 0.3, gap = 0.06, cols = 2) {
  const g = new THREE.Group();
  const loader = new THREE.TextureLoader();
  TRAVEL_PHOTOS.forEach((p, i) => {
    const frame = new THREE.Group();
    const outer = new THREE.Mesh(rbox(size, size, 0.025, 0.004), M('#1a1a1a', 0.5));
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(size - 0.03, size - 0.03), M('#f7f4ee', 0.9));
    mat.position.z = 0.0135;
    const tex = loader.load(p.src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(size - 0.075, size - 0.075), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    photo.position.z = 0.0145;
    frame.add(outer, mat, photo);
    const col = i % cols;
    const row = Math.floor(i / cols);
    frame.position.set(col * (size + gap) + (row ? 0.04 : 0), -row * (size + gap), 0);
    frame.rotation.z = (i % 3 === 1 ? 1 : -1) * 0.012;
    outer.castShadow = true;
    g.add(frame);
  });
  return g;
}

/* ------------------------------------------------------------------ */
/* the three values, as objects                                          */
/* ------------------------------------------------------------------ */
/** 1/ entrepreneurial freedom — the kid who sold computer game cheat codes. */
export function makeCheatCodes(M: MatFn) {
  const cover = canvasTexture(256, 320, (ctx, w, h) => {
    // composition-notebook marble
    ctx.fillStyle = '#151515';
    ctx.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(r() * w, r() * h, 2 + r() * 9, 1 + r() * 4, r() * TAU, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(40, 96, w - 80, 104);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.strokeRect(46, 102, w - 92, 92);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 30px "Comic Sans MS", "Marker Felt", cursive';
    ctx.textAlign = 'center';
    ctx.fillText('CHEAT', w / 2, 140);
    ctx.fillText('CODES', w / 2, 174);
    ctx.fillStyle = '#ff3c00';
    ctx.font = '16px "Marker Felt", cursive';
    ctx.fillText('for sale', w / 2, 192);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 18, h);
  });
  const g = new THREE.Group();
  const book = new THREE.Mesh(rbox(0.012, 0.21, 0.165, 0.003), [
    new THREE.MeshStandardMaterial({ map: cover, roughness: 0.8 }),
    M('#151515'),
    M('#f4efe4'),
    M('#f4efe4'),
    M('#f4efe4'),
    M('#f4efe4'),
  ]);
  g.add(book);
  book.castShadow = true;
  return g;
}

/** 3/ understanding human nature — the book dad brought home. */
export function makeHowToTalk(M: MatFn) {
  const cover = canvasTexture(320, 448, (ctx, w, h) => {
    ctx.fillStyle = '#f2ede2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f6fb2';
    ctx.fillRect(0, 0, w, 140);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 44px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('HOW TO', w / 2, 70);
    ctx.font = '700 30px Arial';
    ctx.fillText('TALK TO', w / 2, 112);
    ctx.fillStyle = '#c8452a';
    ctx.font = '700 62px Arial';
    ctx.fillText('ANYONE', w / 2, 210);
    ctx.fillStyle = '#333';
    ctx.font = '22px Arial';
    ctx.fillText('92 little tricks for big', w / 2, 270);
    ctx.fillText('success in relationships', w / 2, 300);
    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText('leil lowndes', w / 2, 400);
  });
  const book = new THREE.Mesh(rbox(0.15, 0.03, 0.21, 0.004), [
    M('#f2ede2'),
    M('#f2ede2'),
    new THREE.MeshStandardMaterial({ map: cover, roughness: 0.75 }),
    M('#1f6fb2'),
    M('#f6f1e6'),
    M('#1f6fb2'),
  ]);
  book.castShadow = true;
  book.receiveShadow = true;
  return book;
}

/** 2/ thoughtful products and design — the iPod nano (3rd gen) from dad, with earbuds. */
export function makeIpodWithEarbuds(M: MatFn) {
  const g = new THREE.Group();
  const ipod = makeIpodNano(M);
  ipod.rotation.set(-Math.PI / 2, 0, 0);
  ipod.position.y = 0.0035;
  g.add(ipod);
  const white = M('#f6f6f4', 0.35);
  const pts = [
    new THREE.Vector3(0, 0.003, -0.035),
    new THREE.Vector3(0.01, 0.004, -0.07),
    new THREE.Vector3(0.05, 0.004, -0.09),
    new THREE.Vector3(0.08, 0.004, -0.06),
    new THREE.Vector3(0.1, 0.005, -0.02),
  ];
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0016, 4), white));
  for (const p of [new THREE.Vector3(0.1, 0.008, -0.01), new THREE.Vector3(0.115, 0.008, -0.035)]) {
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), white);
    bud.position.copy(p);
    g.add(bud);
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* blog: a cork board above the desk, his latest posts pinned as cards   */
/* ------------------------------------------------------------------ */
export interface BoardPost {
  title: string;
  href: string;
  date?: string;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (line && lines.length === maxLines) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  return lines;
}

/** An index card: orange top rule, faint blue lines, the post title in his lowercase. */
function cardTexture(post: BoardPost | null, seed: number) {
  return canvasTexture(384, 256, (ctx, w, h) => {
    const r = rng(seed);
    ctx.fillStyle = '#fbf8f1';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(120,100,70,${r() * 0.05})`;
      ctx.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    ctx.fillStyle = 'rgba(255,60,0,0.75)';
    ctx.fillRect(0, 46, w, 2.5);
    ctx.fillStyle = 'rgba(70,110,170,0.22)';
    for (let y = 92; y < h; y += 34) ctx.fillRect(0, y, w, 1.5);
    if (!post) return;
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '600 38px Arial';
    wrapLines(ctx, post.title.toLowerCase(), w - 44, 4).forEach((ln, i) => ctx.fillText(ln, 22, 86 + i * 34));
    if (post.date) {
      ctx.fillStyle = '#8a8376';
      ctx.font = '22px Arial';
      ctx.fillText(post.date.toLowerCase(), 22, 34);
    }
  });
}

function corkTexture() {
  return canvasTexture(512, 352, (ctx, w, h) => {
    const r = rng(21);
    ctx.fillStyle = '#a66f3c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const light = r() < 0.5;
      ctx.fillStyle = light ? `rgba(214,160,104,${0.25 + r() * 0.4})` : `rgba(92,54,26,${0.25 + r() * 0.35})`;
      const s = 1 + r() * 2.6;
      ctx.fillRect(r() * w, r() * h, s, s * (0.6 + r() * 0.8));
    }
  });
}

export function makeWritingBoard(M: MatFn, posts: BoardPost[], pinned?: { texture: THREE.Texture; w: number; h: number }) {
  const g = new THREE.Group();
  const W = 1.04;
  const H = 0.62; // low enough to leave clear wall above his head
  const t = 0.028;
  const oak = M('#2a2522', 0.55); // a thin dark frame, like the poster + photos
  for (const [x, y, pw, ph] of [
    [0, H / 2 - t / 2, W, t],
    [0, -H / 2 + t / 2, W, t],
    [-W / 2 + t / 2, 0, t, H - 2 * t],
    [W / 2 - t / 2, 0, t, H - 2 * t],
  ] as const) {
    const bar = new THREE.Mesh(rbox(pw, ph, 0.03, 0.004), oak);
    bar.position.set(x, y, 0.015);
    bar.castShadow = true;
    bar.receiveShadow = true;
    g.add(bar);
  }
  const cork = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * t, H - 2 * t), new THREE.MeshStandardMaterial({ map: corkTexture(), roughness: 0.95 }));
  cork.position.z = 0.012;
  cork.receiveShadow = true;
  g.add(cork);

  const pinHead = M('#ff3c00', 0.35);
  const pinSteel = M('#b9b9b9', 0.3, 0.8);
  const pin = (x: number, y: number, z: number) => {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), pinHead);
    head.position.set(x, y, z + 0.012);
    head.scale.set(1, 1, 0.8);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.012, 6), pinSteel);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(x, y, z + 0.004);
    head.castShadow = true;
    g.add(head, shaft);
  };

  // newest first: three across the top, two (and the pinned map) below
  const slots: [number, number, number, number][] = [
    [-0.3, 0.135, -0.045, 1.08],
    [0.02, 0.15, 0.025, 1],
    [0.33, 0.12, -0.02, 1],
    [0.06, -0.14, 0.035, 1],
    [0.34, -0.15, -0.03, 1],
  ];
  const cards: THREE.Mesh[] = [];
  const cw = 0.25;
  const ch = 0.165;
  slots.forEach(([x, y, rz, k], i) => {
    const post = posts[i] ?? null;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(cw * k, ch * k), new THREE.MeshStandardMaterial({ map: cardTexture(post, 40 + i), roughness: 0.9 }));
    card.position.set(x, y, 0.018 + i * 0.0006);
    card.rotation.z = rz;
    card.castShadow = true;
    card.receiveShadow = true;
    card.userData.post = post;
    g.add(card);
    cards.push(card);
    const top = new THREE.Vector3(0, (ch * k) / 2 - 0.022, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), rz);
    pin(x + top.x, y + top.y, 0.018);
  });

  let map: THREE.Mesh | null = null;
  if (pinned) {
    map = new THREE.Mesh(new THREE.PlaneGeometry(pinned.w, pinned.h), new THREE.MeshStandardMaterial({ map: pinned.texture, roughness: 0.92 }));
    map.position.set(-0.27, -0.13, 0.017);
    map.rotation.z = 0.03;
    map.castShadow = true;
    map.receiveShadow = true;
    g.add(map);
    pin(-0.27 - pinned.w / 2 + 0.03, -0.13 + pinned.h / 2 - 0.025, 0.017);
    pin(-0.27 + pinned.w / 2 - 0.03, -0.13 + pinned.h / 2 - 0.02, 0.017);
  }
  return { group: g, cards, map, width: W, height: H };
}
