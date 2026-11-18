// Step 2 of 3: renders the caption pills and callouts to transparent PNGs, in the demo's own font.
// Usage: node captions.mjs [takeDir]
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const take = path.resolve(process.argv[2] ?? '.take');
const font = new URL('../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2', import.meta.url).href;
const CAPTIONS = {
  change: ['1', 'Change a preference. It is saved as a cookie.'],
  compare: ['2', 'Same prefs in <b class="l">localStorage</b> and in <b class="c">cookie-prefs</b>. Reload both.'],
  paused: ['II', 'Paused at the first paint after the reload'],
  after: ['3', '<b class="l">localStorage</b> jumped after hydration. <b class="c">cookie-prefs</b> never moved.'],
};
const CALLOUTS = {
  'callout-local': ['bad', 'Server sent defaults', 'sidebar open · 10 rows · EN'],
  'callout-cookie': ['good', 'Server sent your prefs', 'sidebar closed · 20 rows · DE'],
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 200 }, deviceScaleFactor: 1 });
const index = {};
for (const [id, [step, html]] of Object.entries(CAPTIONS)) {
  await page.setContent(`<style>
    @font-face { font-family: G; src: url(${font}); font-weight: 100 900; }
    body { margin: 0; background: transparent; font: 500 17px/1 G, sans-serif; }
    .pill { display: inline-flex; align-items: center; gap: 10px; padding: 10px 16px 10px 10px; border-radius: 999px;
      background: rgba(17,17,20,.94); color: #f4f4f5; border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 6px 24px rgba(0,0,0,.35); white-space: nowrap; }
    .n { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #6366f1; color: #fff; font-weight: 600; font-size: 14px; }
    b { font-weight: 600; } .l { color: #fbbf24; } .c { color: #a5b4fc; }
  </style><div id="wrap" style="display:inline-block;padding:8px"><div class="pill"><span class="n">${step}</span><span>${html}</span></div></div>`);
  await page.evaluate(() => document.fonts.ready);
  const file = `caption-${id}.png`;
  await page.locator('#wrap').screenshot({ path: path.join(take, file), omitBackground: true });
  index[id] = file;
}
for (const [id, [kind, title, sub]] of Object.entries(CALLOUTS)) {
  await page.setContent(`<style>
    @font-face { font-family: G; src: url(${font}); font-weight: 100 900; }
    body { margin: 0; background: transparent; font: 500 15px/1.25 G, sans-serif; }
    .box { display: inline-flex; align-items: center; gap: 10px; padding: 10px 16px 10px 12px; border-radius: 12px;
      background: rgba(17,17,20,.95); color: #f4f4f5; box-shadow: 0 8px 24px rgba(0,0,0,.45); white-space: nowrap; }
    .bad { border: 1px solid rgba(245,158,11,.7); } .good { border: 1px solid rgba(52,211,153,.7); }
    svg { width: 20px; height: 20px; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    .bad svg { stroke: #fbbf24; } .good svg { stroke: #6ee7b7; }
    .t { font-weight: 550; font-size: 16px; } .s { color: #a1a1aa; margin-top: 2px; font-weight: 400; font-size: 14px; }
  </style><div id="wrap" style="display:inline-block;padding:10px"><div class="box ${kind}">${
    kind === 'bad'
      ? '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/><path d="M10 6v4.5M10 13.6v.1"/></svg>'
      : '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/><path d="M6.6 10.2l2.3 2.3 4.5-4.8"/></svg>'
  }<span><div class="t">${title}</div><div class="s">${sub}</div></span></div></div>`);
  await page.evaluate(() => document.fonts.ready);
  const file = `${id}.png`;
  await page.locator('#wrap').screenshot({ path: path.join(take, file), omitBackground: true });
  index[id] = file;
}
await writeFile(path.join(take, 'captions.json'), JSON.stringify(index));
await browser.close();
