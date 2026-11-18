// Step 1 of 3: drives the running demo with Playwright and writes frames plus a timeline of
// cursor moves, clicks, zooms and captions for compose.mjs.
// Usage: node record.mjs [baseUrl] [takeDir]
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = path.resolve(process.argv[3] ?? '.take');
const VIEW = { width: 1280, height: 720 };
const SCALE = 2;

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'frames'), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: SCALE,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
});
// Runs in every document: the localStorage page notes when it hydrates (and corrects itself).
await context.addInitScript(() => {
  if (location.pathname !== '/local-storage') return;
  new MutationObserver(() => {
    if (document.querySelector('[data-testid="app"][data-hydrated="true"]')) window.__jumpAt ??= Date.now();
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-hydrated'] });
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

const frames = []; // { t, file }
const events = []; // { t, type, ... }
const writes = [];
const now = () => Date.now() / 1000;
const log = (type, data = {}) => events.push({ t: now(), type, ...data });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Screencast frames ignore deviceScaleFactor, so frames are screenshots taken back to back (~30 fps at 2x).
// A screenshot requested while the page navigates may never resolve.
const withTimeout = (promise, ms = 700) => {
  promise.catch(() => {});
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
};
let casting = false;
let hires = false; // 2x frames take ~80 ms, so they are used only while zoomed in

let castLoop = Promise.resolve();
const startCast = async () => {
  casting = true;
  castLoop = (async () => {
    while (casting) {
      const t = now();
      try {
        const { data } = await withTimeout(cdp.send('Page.captureScreenshot', {
          format: 'jpeg',
          quality: 92,
          clip: { x: 0, y: 0, ...VIEW, scale: hires ? SCALE : 1 },
        }));
        const file = `frames/${String(frames.length).padStart(5, '0')}.jpg`;
        frames.push({ t: (t + now()) / 2, file });
        writes.push(writeFile(path.join(out, file), Buffer.from(data, 'base64')));
      } catch {
        await sleep(10);
      }
    }
  })();
};
const stopCast = async () => {
  casting = false;
  await castLoop;
};

// The cursor is drawn by compose.mjs from these logged positions, so it survives reloads.
let mouse = { x: 760, y: 420 };
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
async function moveTo(x, y, ms = 520) {
  const from = { ...mouse };
  const steps = Math.max(2, Math.round(ms / 16));
  const start = Date.now();
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    mouse = { x: from.x + (x - from.x) * k, y: from.y + (y - from.y) * k };
    await page.mouse.move(mouse.x, mouse.y);
    log('move', mouse);
    const wait = start + (ms * i) / steps - Date.now();
    if (wait > 0) await sleep(wait);
  }
}
async function center(target) {
  const box = await target.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function click(testid, { ms = 520, after = 650 } = {}) {
  const point = await center(page.getByTestId(testid));
  await moveTo(point.x, point.y, ms);
  await sleep(110);
  log('click', point);
  await page.mouse.click(point.x, point.y);
  await sleep(after);
}
const zoom = (rect, ms = 700) => log('zoom', { rect, ms });
const caption = (id) => log('caption', { id });
const FULL = { x: 0, y: 0, w: VIEW.width, h: VIEW.height };

// ---- Scene 1: the cookie page -------------------------------------------------------------
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.mouse.move(mouse.x, mouse.y);
await page.getByTestId('app').and(page.locator('[data-hydrated="true"]')).waitFor();
await startCast();
await sleep(400);

log('scene', { id: 'prefs' });
log('move', mouse);
zoom(FULL, 0);
caption('change');
await sleep(900);

const PANEL = { x: 464, y: 161, w: 816, h: 459 };
hires = true;
zoom(PANEL, 800);
await moveTo(1100, 260, 800);
await click('pref-theme-dark', { ms: 380, after: 900 });
await click('pref-pageSize-20', { after: 900 });
await page.locator('[data-testid="table"][data-rows="20"]').waitFor();
await click('pref-locale-de', { after: 500 });
await page.locator('[data-testid="table"][data-locale="de"]').waitFor();
await sleep(900);

zoom(FULL, 800);
await sleep(900);
hires = false;
await click('pref-sidebar', { ms: 600, after: 1000 });

// ---- Side by side: same prefs in localStorage, then reload both ---------------------------
await page.evaluate(() => {
  const sample = { theme: 'dark', sidebar: 'false', density: 'comfortable', pageSize: '20', locale: 'de' };
  for (const [key, value] of Object.entries(sample)) localStorage.setItem(key, value);
});
const local = page.frameLocator('[data-testid="iframe-local-storage"]');
const cookie = page.frameLocator('[data-testid="iframe-cookie-prefs"]');
const settled = async () => {
  await local.locator('[data-testid="app"][data-hydrated="true"]').waitFor();
  await local.locator('[data-testid="table"][data-rows="20"]').waitFor();
  await cookie.locator('[data-testid="app"][data-hydrated="true"]').waitFor();
};
await click('nav-compare', { ms: 800, after: 0 });
await page.waitForURL('**/compare');
await settled();
caption('compare');
for (const id of ['iframe-local-storage', 'iframe-cookie-prefs']) {
  const box = await page.getByTestId(id).boundingBox();
  log('pane', { id, rect: { x: box.x, y: box.y, w: box.width, h: box.height } });
}
await sleep(1500);

// A mid-range phone on a slow connection, so the first paint stays on screen long enough to see.
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await click('reload-both', { ms: 700, after: 0 });
log('reload');
// The reloaded localStorage page first shows the server's defaults (10 rows). Note the moment it
// corrects itself, measured inside the page, so compose.mjs can pause just before it.
await local.locator('[data-testid="table"][data-rows="10"]').waitFor();
log('flash');
const localFrame = page.frames().find((frame) => frame.url().includes('/local-storage'));
await settled();
const jumpAt = await localFrame.evaluate(() => window.__jumpAt);
if (!jumpAt) throw new Error('the localStorage page never reported hydration');
events.push({ t: jumpAt / 1000, type: 'jump' });
await sleep(3000);
log('scene-end');

await stopCast();
await Promise.all(writes);
await writeFile(path.join(out, 'timeline.json'), JSON.stringify({ view: VIEW, scale: SCALE, frames, events }));
await browser.close();
console.log(`${frames.length} frames, ${events.length} events -> ${out}`);
