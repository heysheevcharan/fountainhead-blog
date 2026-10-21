/**
 * Renders the homepage hero's still frames: public/3d/awe-house-<size>-<slot>.webp, plus
 * public/3d/awe-house-posters.json (where the wall art + the desk land in each size's frame).
 * While the live scene loads, the page shows the still for the visitor's screen shape and the
 * hour in Bangalore, fitted around the page copy, and the live room starts from exactly that
 * frame — so re-run this whenever the room changes. Sizes + time slots come from
 * src/lab/posters.ts (read back out of the page).
 *
 *   1. npx astro dev --port 4400
 *   2. node tools/posters/render-posters.cjs      (needs playwright: npm i -D playwright, or a global install)
 *      CHROME_PATH=/path/to/chrome node tools/posters/render-posters.cjs   to use a specific browser
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '../../public/3d');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4400';
const SCENE_BASE = 'awe-house';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  // the spec, as the page sees it
  const probe = await browser.newPage();
  await probe.goto(`${BASE}/?intro=0`, { waitUntil: 'domcontentloaded' });
  const spec = JSON.parse(await probe.getAttribute('.h3d', 'data-posters'));
  await probe.close();

  const layout = {};
  for (const size of spec.sizes) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: size.dpr });
    for (const slot of spec.times) {
      const page = await ctx.newPage();
      // no rain on the stills (the live room lets it start after the hand-off)
      // (full quality: phones get a lighter live room, never lighter stills)
      await page.goto(`${BASE}/?time=${slot.render}&intro=0&rain=0&quality=high`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.h3d.is-ready', { timeout: 30000 });
      await page.waitForTimeout(400);
      const still = await page.evaluate(({ ox, oy }) => document.querySelector('.h3d').__h3d.still(ox, oy), { ox: size.ox, oy: size.oy });
      const file = path.join(OUT, `${SCENE_BASE}-${size.id}-${slot.id}.webp`);
      fs.writeFileSync(file, Buffer.from(still.url.split(',')[1], 'base64'));
      console.log(path.basename(file), Math.round(fs.statSync(file).size / 1024) + ' KB');
      // the furniture doesn't move between slots, but on portrait screens the camera follows him
      // (the armchair in the evening, the desk otherwise): one layout per size, and per slot
      const lay = (layout[size.id] ??= { w: size.w, h: size.h, ox: size.ox, oy: size.oy, head: still.head, foot: still.foot, slots: {} });
      lay.slots[slot.id] = { head: still.head, foot: still.foot };
      await page.close();
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, `${SCENE_BASE}-posters.json`), JSON.stringify({ sizes: layout }) + '\n');
  console.log(`${SCENE_BASE}-posters.json`);
  await browser.close();
})();
