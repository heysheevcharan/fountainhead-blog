/*
 * Still frames shown while a 3D hero loads (and kept if WebGL is unavailable).
 * One source of truth for: the page's inline picker (Hero3D.astro), the live scene's
 * hand-off (it starts from exactly the still's framing + hour) and the renderer
 * (tools/posters/render-posters.cjs reads this spec back out of the page).
 *
 * No three.js in here: it's imported at build time too.
 */

export interface PosterSize {
  id: string;
  /** reference viewport (CSS px) + device pixel ratio the still is rendered at */
  w: number;
  h: number;
  dpr: number;
  /** used for screens up to this aspect ratio (width / height) */
  maxAspect: number;
  /**
   * extra picture rendered on every side, as a fraction of w / h: room for the page to shrink
   * and slide the still so the wall art clears the page copy on smaller screens (Hero3D.astro)
   */
  ox: number;
  oy: number;
}

export interface PosterTime {
  id: string;
  /** hours in bangalore, [from, to) — wraps past midnight when from > to */
  from: number;
  to: number;
  /** the hour the still is rendered at */
  render: number;
  /** the overlay copy's tone at these hours (scene: night > 0.5 → 'dark') */
  tone: 'light' | 'dark';
}

export interface PosterSpec {
  base: string;
  sizes: PosterSize[];
  times: PosterTime[];
}

export const POSTERS: Record<string, PosterSpec> = {
  'awe-house': {
    base: '/3d/awe-house',
    sizes: [
      { id: 'm', w: 390, h: 844, dpr: 2, maxAspect: 0.85, ox: 0.12, oy: 0.18 },
      { id: 'd', w: 1440, h: 900, dpr: 1.25, maxAspect: 1.72, ox: 0.12, oy: 0.18 },
      { id: 'w', w: 1920, h: 1080, dpr: 1, maxAspect: Infinity, ox: 0.12, oy: 0.18 },
    ],
    // Each slot has ONE routine start (routine.ts: night/morning → writing at the desk,
    // day → typing, evening → film in the armchair) and ONE copy tone, so the still always
    // shows what the live room starts with. The live scene then eases from `render` to the
    // real hour (light + clock), at most ~2h away.
    times: [
      { id: 'night', from: 21, to: 1.5, render: 23.25, tone: 'dark' },
      { id: 'late', from: 1.5, to: 5.83, render: 3.65, tone: 'dark' },
      { id: 'dawn', from: 5.83, to: 7.5, render: 6.67, tone: 'light' },
      { id: 'morning', from: 7.5, to: 11, render: 9.25, tone: 'light' },
      { id: 'noon', from: 11, to: 14.5, render: 12.75, tone: 'light' },
      { id: 'afternoon', from: 14.5, to: 17.5, render: 16, tone: 'light' },
      { id: 'golden', from: 17.5, to: 19.08, render: 18.3, tone: 'light' },
      { id: 'dusk', from: 19.08, to: 21, render: 20.05, tone: 'dark' },
    ],
  },
};

export function posterTimeAt(spec: PosterSpec, hours: number): PosterTime {
  const h = ((hours % 24) + 24) % 24;
  return spec.times.find((t) => (t.from <= t.to ? h >= t.from && h < t.to : h >= t.from || h < t.to)) ?? spec.times[0];
}

export function posterSizeFor(spec: PosterSpec, aspect: number): PosterSize {
  return spec.sizes.find((s) => aspect < s.maxAspect) ?? spec.sizes[spec.sizes.length - 1];
}
