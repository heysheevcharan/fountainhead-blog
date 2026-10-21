import * as THREE from 'three';
import type { Stage } from './stage';

export interface Line {
  text: string;
  /** Post the line comes from. Bubbles become a doorway into the writing. */
  href?: string;
}

/**
 * A speech bubble that follows a 3D anchor. Everything sheev "says" is a real
 * line from his blog, so the bubble doubles as a link to the essay.
 */
export class Bubble {
  readonly el: HTMLDivElement;
  private textEl: HTMLSpanElement;
  private linkEl: HTMLAnchorElement;
  private hideAt = 0;
  private shown = false;
  private tmp = new THREE.Vector3();
  private screen = { x: 0, y: 0, behind: false };

  constructor(
    private stage: Stage,
    private anchor: THREE.Object3D,
    private offset = new THREE.Vector3(0, 0.45, 0),
  ) {
    this.el = document.createElement('div');
    this.el.className = 's3d-bubble';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.textEl = document.createElement('span');
    this.linkEl = document.createElement('a');
    this.linkEl.className = 's3d-bubble-link';
    this.linkEl.textContent = 'read →';
    this.el.append(this.textEl, this.linkEl);
    stage.container.appendChild(this.el);
  }

  get visible() {
    return this.shown;
  }

  say(line: Line | string, ms?: number) {
    const l = typeof line === 'string' ? { text: line } : line;
    this.textEl.textContent = l.text;
    if (l.href) {
      this.linkEl.href = l.href;
      this.linkEl.style.display = '';
    } else {
      this.linkEl.removeAttribute('href');
      this.linkEl.style.display = 'none';
    }
    this.el.classList.add('is-on');
    this.shown = true;
    this.hideAt = performance.now() + (ms ?? 2600 + l.text.length * 55);
    this.update();
  }

  hide() {
    this.el.classList.remove('is-on');
    this.shown = false;
  }

  update() {
    if (!this.shown) return;
    if (performance.now() > this.hideAt && !this.el.matches(':hover')) {
      this.hide();
      return;
    }
    this.anchor.getWorldPosition(this.tmp).add(this.offset);
    this.stage.toScreen(this.tmp, this.screen);
    const w = this.el.offsetWidth;
    const x = Math.max(12, Math.min(this.screen.x - w * 0.25, this.stage.width - w - 12));
    const y = Math.max(12, this.screen.y - this.el.offsetHeight - 8);
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  dispose() {
    this.el.remove();
  }
}

/* ------------------------------------------------------------------ */
/* intro speech                                                          */
/* ------------------------------------------------------------------ */
export interface SpeechItem {
  /** e.g. "1/ entrepreneurial freedom" */
  title?: string;
  /** trusted html (only <a>, <strong>, <em> from his own home.mdx) */
  html: string;
}

/**
 * The bubble sheev uses to say his homepage intro: typed out like he's
 * talking, with next/skip, progress dots and auto-advance (paused on hover).
 */
export class SpeechBubble {
  readonly el: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private dotsEl: HTMLDivElement;
  private nextBtn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private tokens: string[] = [];
  private shown = 0;
  private typing = false;
  private holdUntil = 0;
  private acc = 0;
  private tmp = new THREE.Vector3();
  private screen = { x: 0, y: 0, behind: false };
  onNext: (() => void) | null = null;
  onSkip: (() => void) | null = null;
  visible = false;
  /** an element the bubble must never cover (the page header) */
  avoid: HTMLElement | null = null;
  /** things in the room the bubble shouldn't hide while he talks (e.g. the board above him) */
  avoidObjects: THREE.Object3D[] = [];
  /** overlay labels the bubble shouldn't hide (e.g. the tag on the object he's talking about) */
  avoidEls: Element[] = [];
  private place: 'right' | 'left' | 'above' | 'docked' = 'right';
  private box = new THREE.Box3();
  /** true while characters are being revealed (drives his mouth) */
  get talking() {
    return this.typing;
  }

  constructor(
    private stage: Stage,
    private anchor: THREE.Object3D,
    private offset = new THREE.Vector3(0, 0.12, 0),
  ) {
    this.el = document.createElement('div');
    this.el.className = 's3d-speech';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'sheev says');
    this.titleEl = document.createElement('div');
    this.titleEl.className = 's3d-speech-title';
    this.textEl = document.createElement('div');
    this.textEl.className = 's3d-speech-text';
    this.textEl.setAttribute('aria-live', 'polite');
    const bar = document.createElement('div');
    bar.className = 's3d-speech-bar';
    this.dotsEl = document.createElement('div');
    this.dotsEl.className = 's3d-speech-dots';
    this.skipBtn = document.createElement('button');
    this.skipBtn.type = 'button';
    this.skipBtn.className = 's3d-speech-skip';
    this.skipBtn.textContent = 'skip';
    this.nextBtn = document.createElement('button');
    this.nextBtn.type = 'button';
    this.nextBtn.className = 's3d-speech-next';
    this.nextBtn.textContent = 'next →';
    bar.append(this.dotsEl, this.skipBtn, this.nextBtn);
    this.el.append(this.titleEl, this.textEl, bar);
    stage.container.appendChild(this.el);
    this.nextBtn.addEventListener('click', () => this.advance());
    this.skipBtn.addEventListener('click', () => this.onSkip?.());
  }

  /** Show one item. index/total draw the progress dots. */
  say(item: SpeechItem, index: number, total: number, instant = false) {
    this.titleEl.textContent = item.title ?? '';
    this.titleEl.style.display = item.title ? '' : 'none';
    // tokenise: tags stay whole, text reveals char by char
    this.tokens = item.html.match(/<[^>]+>|&[a-z#0-9]+;|[\s\S]/gi) ?? [];
    this.shown = instant ? this.tokens.length : 0;
    this.typing = !instant;
    this.render();
    this.dotsEl.innerHTML = Array.from({ length: total }, (_, i) => `<span class="${i === index ? 'on' : ''}"></span>`).join('');
    this.nextBtn.textContent = index === total - 1 ? 'done' : 'next →';
    if (this.place !== 'docked') this.place = 'right'; // each line starts from the preferred spot
    this.el.classList.add('is-on');
    this.visible = true;
    this.holdUntil = 0;
    this.update(0);
  }

  hide() {
    this.el.classList.remove('is-on');
    this.visible = false;
    this.typing = false;
  }

  private advance() {
    if (this.typing) {
      // first click finishes the sentence, second moves on
      this.shown = this.tokens.length;
      this.typing = false;
      this.render();
      this.holdUntil = performance.now() + this.readTime();
      return;
    }
    this.onNext?.();
  }

  private readTime() {
    const chars = this.textEl.textContent?.length ?? 0;
    return 1600 + chars * 38;
  }

  private render() {
    this.textEl.innerHTML = this.tokens.slice(0, this.shown).join('');
  }

  update(dt: number, cps = 52) {
    if (!this.visible) return;
    if (this.typing) {
      this.acc += dt * cps;
      const n = Math.floor(this.acc);
      if (n > 0) {
        this.acc -= n;
        // tags + entities cost nothing
        let added = 0;
        while (this.shown < this.tokens.length && added < n) {
          const t = this.tokens[this.shown++];
          if (t.length === 1) added++;
        }
        this.render();
        if (this.shown >= this.tokens.length) {
          this.typing = false;
          this.holdUntil = performance.now() + this.readTime();
        }
      }
    } else if (this.holdUntil && performance.now() > this.holdUntil && !this.el.matches(':hover')) {
      this.holdUntil = 0;
      this.onNext?.();
    }
    // follow his head. Beside his face if there's room (so nothing in the room is hidden),
    // else above him; on phones dock it like subtitles.
    const W = this.stage.width;
    const H = this.stage.height;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    this.anchor.getWorldPosition(this.tmp).add(this.offset);
    this.stage.toScreen(this.tmp, this.screen);
    const top = { x: this.screen.x, y: this.screen.y };
    this.anchor.getWorldPosition(this.tmp);
    this.tmp.y -= 0.13; // mouth height
    this.stage.toScreen(this.tmp, this.screen);
    const mouth = { x: this.screen.x, y: this.screen.y };

    type R = { x0: number; y0: number; x1: number; y1: number };
    const blocks: R[] = [];
    const c = this.stage.container.getBoundingClientRect();
    if (this.avoid) {
      const a = this.avoid.getBoundingClientRect();
      blocks.push({ x0: a.left - c.left - 12, y0: a.top - c.top - 12, x1: a.right - c.left + 16, y1: a.bottom - c.top + 14 });
    }
    for (const el of this.avoidEls) {
      if (!el.classList.contains('is-on')) continue;
      const a = el.getBoundingClientRect();
      blocks.push({ x0: a.left - c.left - 8, y0: a.top - c.top - 8, x1: a.right - c.left + 8, y1: a.bottom - c.top + 8 });
    }
    for (const o of this.avoidObjects) {
      this.box.setFromObject(o);
      const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (let i = 0; i < 8; i++) {
        this.tmp.set(i & 1 ? this.box.max.x : this.box.min.x, i & 2 ? this.box.max.y : this.box.min.y, i & 4 ? this.box.max.z : this.box.min.z);
        this.stage.toScreen(this.tmp, this.screen);
        r.x0 = Math.min(r.x0, this.screen.x);
        r.x1 = Math.max(r.x1, this.screen.x);
        r.y0 = Math.min(r.y0, this.screen.y);
        r.y1 = Math.max(r.y1, this.screen.y);
      }
      blocks.push({ x0: r.x0 - 6, y0: r.y0 - 6, x1: r.x1 + 6, y1: r.y1 + 6 });
    }
    const clampY = (y: number) => Math.max(12, Math.min(y, H - h - 60));
    // beside him: level with his mouth, nudged down below anything hanging just above him
    const sideY = (x: number) => {
      let y = mouth.y - h * 0.42;
      for (const b of blocks) if (x < b.x1 && x + w > b.x0 && b.y1 < mouth.y + 8 && y < b.y1) y = b.y1 + 4;
      return clampY(Math.min(y, mouth.y - 14));
    };
    const at = (p: typeof this.place): { x: number; y: number } => {
      if (p === 'right') return { x: mouth.x + 34, y: sideY(mouth.x + 34) };
      if (p === 'left') return { x: mouth.x - 34 - w, y: sideY(mouth.x - 34 - w) };
      if (p === 'above') return { x: Math.max(12, Math.min(top.x - w * 0.35, W - w - 12)), y: clampY(top.y - h - 14) };
      return { x: (W - w) / 2, y: H - h - 72 };
    };
    const fits = (p: typeof this.place) => {
      if (p === 'docked') return true;
      const { x, y } = at(p);
      if (x < 12 || x + w > W - 12) return false;
      return !blocks.some((b) => x < b.x1 && x + w > b.x0 && y < b.y1 && y + h > b.y0);
    };
    if (W < 620) this.place = 'docked';
    else if (this.place === 'docked' || !fits(this.place)) {
      this.place = (['right', 'left', 'above'] as const).find(fits) ?? 'docked';
    }
    const { x, y } = at(this.place);
    this.el.classList.toggle('is-docked', this.place === 'docked');
    this.el.classList.toggle('is-right', this.place === 'right');
    this.el.classList.toggle('is-left', this.place === 'left');
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this.el.style.setProperty('--tail-x', `${Math.max(16, Math.min(w - 16, (this.place === 'above' ? top.x : mouth.x) - x)).toFixed(1)}px`);
    this.el.style.setProperty('--tail-y', `${Math.max(16, Math.min(h - 16, mouth.y - y)).toFixed(1)}px`);
  }

  dispose() {
    this.el.remove();
  }
}

/** A small label pinned to a 3D object (nav hints, intro highlights). */
export class Tag {
  readonly el: HTMLAnchorElement;
  private tmp = new THREE.Vector3();
  private screen = { x: 0, y: 0, behind: false };
  visible = false;

  constructor(
    private stage: Stage,
    readonly anchor: THREE.Object3D,
    text: string,
    href?: string,
    private offset = new THREE.Vector3(0, 0.25, 0),
  ) {
    this.el = document.createElement('a');
    this.el.className = 's3d-tag';
    this.el.innerHTML = `<span class="s3d-dot"></span>${text}`;
    if (href) this.el.href = href;
    else this.el.setAttribute('aria-hidden', 'true');
    this.el.tabIndex = -1;
    stage.container.appendChild(this.el);
  }

  show(on: boolean) {
    this.visible = on;
    this.el.classList.toggle('is-on', on);
  }

  /** page copy the tag must never sit on; if it would, it flips below the object */
  avoid: Element[] = [];

  update() {
    if (!this.visible && !this.el.classList.contains('is-on')) return;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    this.anchor.getWorldPosition(this.tmp).add(this.offset);
    this.stage.toScreen(this.tmp, this.screen);
    // the object is off screen (e.g. on a phone): no tag, rather than one pinned to the edge
    const off = this.screen.behind || this.screen.x < 0 || this.screen.x > this.stage.width || this.screen.y < 0 || this.screen.y > this.stage.height;
    this.el.classList.toggle('is-off', off);
    if (off) return;
    let x = this.screen.x - w / 2;
    let y = this.screen.y - h;
    if (this.avoid.length) {
      const c = this.stage.container.getBoundingClientRect();
      const hits = (yy: number) =>
        this.avoid.some((el) => {
          const a = textBox(el);
          return !!a && x < a.right - c.left + 10 && x + w > a.left - c.left - 10 && yy < a.bottom - c.top + 8 && yy + h > a.top - c.top - 8;
        });
      if (hits(y)) {
        this.anchor.getWorldPosition(this.tmp);
        this.tmp.y -= this.offset.y;
        this.stage.toScreen(this.tmp, this.screen);
        y = this.screen.y + 4;
      }
    }
    x = Math.max(6, Math.min(x, this.stage.width - w - 6));
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  dispose() {
    this.el.remove();
  }
}

/**
 * The box around an element's actual text (a block's own box spans the whole column, which
 * would make a tag far to the right of a short heading flip for nothing). Cached briefly:
 * tags ask every frame, and the page copy doesn't move.
 */
const textBoxes = new WeakMap<Element, { at: number; box: DOMRect | null }>();
function textBox(el: Element): DOMRect | null {
  const now = performance.now();
  const hit = textBoxes.get(el);
  if (hit && now - hit.at < 400) return hit.box;
  const r = document.createRange();
  r.selectNodeContents(el);
  const b = r.getBoundingClientRect();
  const box = b.width > 0 && b.height > 0 ? b : null;
  textBoxes.set(el, { at: now, box });
  return box;
}

/** Floating "z" letters for when he dozes off. */
export class Zzz {
  readonly el: HTMLDivElement;
  private last = 0;
  private tmp = new THREE.Vector3();
  private screen = { x: 0, y: 0, behind: false };
  active = false;

  constructor(private stage: Stage, private anchor: THREE.Object3D, private offset = new THREE.Vector3(0.1, 0.3, 0)) {
    this.el = document.createElement('div');
    this.el.className = 's3d-zzz';
    this.el.setAttribute('aria-hidden', 'true');
    stage.container.appendChild(this.el);
  }

  update() {
    this.anchor.getWorldPosition(this.tmp).add(this.offset);
    this.stage.toScreen(this.tmp, this.screen);
    this.el.style.transform = `translate(${this.screen.x.toFixed(1)}px, ${this.screen.y.toFixed(1)}px)`;
    const now = performance.now();
    if (this.active && now - this.last > 1300) {
      this.last = now;
      const z = document.createElement('span');
      z.textContent = 'z';
      z.style.fontSize = `${11 + Math.random() * 8}px`;
      z.style.setProperty('--drift', `${8 + Math.random() * 20}px`);
      z.addEventListener('animationend', () => z.remove());
      this.el.appendChild(z);
    }
  }

  dispose() {
    this.el.remove();
  }
}

/** Small lowercase hover label that follows the pointer. */
export class HoverLabel {
  readonly el: HTMLDivElement;
  private title: HTMLSpanElement;
  private sub: HTMLSpanElement;

  constructor(private stage: Stage) {
    this.el = document.createElement('div');
    this.el.className = 's3d-label';
    this.el.setAttribute('aria-hidden', 'true');
    this.title = document.createElement('span');
    this.sub = document.createElement('span');
    this.sub.className = 's3d-label-sub';
    this.el.append(this.title, this.sub);
    stage.container.appendChild(this.el);
  }

  show(title: string, sub: string | undefined, clientX: number, clientY: number) {
    const r = this.stage.container.getBoundingClientRect();
    this.title.textContent = title;
    this.sub.textContent = sub ?? '';
    this.sub.style.display = sub ? '' : 'none';
    this.el.classList.add('is-on');
    const x = Math.min(clientX - r.left + 14, this.stage.width - this.el.offsetWidth - 8);
    const y = Math.max(8, clientY - r.top - 34);
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  hide() {
    this.el.classList.remove('is-on');
  }

  dispose() {
    this.el.remove();
  }
}

/* ------------------------------------------------------------------ */
/* interactive hotspots                                                 */
/* ------------------------------------------------------------------ */
export interface Hotspot {
  object: THREE.Object3D;
  title: string;
  sub?: string;
  href?: string;
  onClick?: () => void;
  onHover?: (on: boolean) => void;
}

/**
 * Wires hover labels + clicks to a set of 3D objects. Returns a function the
 * scene can use to test whether the pointer is over anything.
 */
export function wireHotspots(stage: Stage, spots: Hotspot[], label: HoverLabel, occluders: THREE.Object3D[] = []) {
  let hovered: Hotspot | null = null;
  const objects = [...spots.map((s) => s.object), ...occluders];
  const find = (o: THREE.Object3D | null) => {
    while (o) {
      if (occluders.includes(o)) return null; // something (sheev) stands in front
      const s = spots.find((h) => h.object === o);
      if (s) return s;
      o = o.parent;
    }
    return null;
  };

  const onMove = (e: PointerEvent) => {
    if (e.target !== stage.canvas) {
      if (hovered) {
        hovered.onHover?.(false);
        hovered = null;
      }
      label.hide();
      return;
    }
    const hit = stage.pickAt(e.clientX, e.clientY, objects)[0];
    const s = hit ? find(hit.object) : null;
    if (s !== hovered) {
      hovered?.onHover?.(false);
      s?.onHover?.(true);
      hovered = s;
    }
    if (s) {
      label.show(s.title, s.sub, e.clientX, e.clientY);
      stage.canvas.style.cursor = 'pointer';
    } else if (!hit || !occluders.length) {
      label.hide();
      stage.canvas.style.cursor = '';
    }
  };
  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const onClick = (e: MouseEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // that was a drag
    const hit = stage.pickAt(e.clientX, e.clientY, objects)[0];
    const s = hit ? find(hit.object) : null;
    if (!s) return;
    if (s.onClick) s.onClick();
    else if (s.href) window.location.href = s.href;
  };
  const onLeave = () => {
    hovered?.onHover?.(false);
    hovered = null;
    label.hide();
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  stage.canvas.addEventListener('pointerdown', onDown);
  stage.canvas.addEventListener('click', onClick);
  stage.canvas.addEventListener('pointerleave', onLeave);
  return () => {
    window.removeEventListener('pointermove', onMove);
    stage.canvas.removeEventListener('pointerdown', onDown);
    stage.canvas.removeEventListener('click', onClick);
    stage.canvas.removeEventListener('pointerleave', onLeave);
  };
}
