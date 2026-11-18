// Step 3 of 3: turns a take (frames + timeline) into the GIF: camera zoom, cursor, click ripples,
// captions, a pause with callouts on the first paint after the reload, and a dissolve into the loop.
// Usage: node compose.mjs [takeDir] [out.gif]
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

const take = path.resolve(process.argv[2] ?? '.take');
const outFile = path.resolve(process.argv[3] ?? '../../.github/demo.gif');
const W = Number(process.env.W ?? 960);
const H = Math.round((W * 9) / 16);
const FPS = Number(process.env.FPS ?? 20);
const STILLS = process.env.STILLS; // directory: also dump every Nth composed frame as PNG

const { view, frames, events } = JSON.parse(await readFile(path.join(take, 'timeline.json'), 'utf8'));
const captions = JSON.parse(await readFile(path.join(take, 'captions.json'), 'utf8')); // id -> png path

// The take is one continuous scene.
const scene = {
  start: events.find((e) => e.type === 'scene').t,
  end: events.find((e) => e.type === 'scene-end').t,
};
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const lerp = (a, b, k) => a + (b - a) * k;

const zooms = events.filter((e) => e.type === 'zoom');
function camera(t) {
  let rect = zooms[0].rect;
  for (const z of zooms) {
    if (z.t > t) break;
    const k = z.ms === 0 ? 1 : Math.min(1, (t - z.t) / (z.ms / 1000));
    const e = ease(k);
    rect = { x: lerp(rect.x, z.rect.x, e), y: lerp(rect.y, z.rect.y, e), w: lerp(rect.w, z.rect.w, e), h: lerp(rect.h, z.rect.h, e) };
  }
  return rect;
}
const moves = events.filter((e) => e.type === 'move');
function cursorAt(t) {
  let i = moves.findLastIndex((m) => m.t <= t);
  if (i < 0) i = 0;
  const a = moves[i];
  const b = moves[i + 1];
  if (!b || b.t - a.t > 0.2) return a;
  const k = (t - a.t) / (b.t - a.t);
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
}
const clicks = events.filter((e) => e.type === 'click');
const captionEvents = events.filter((e) => e.type === 'caption');

const CURSOR = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
<path d="M5 3l0 19 5.2-4.6 3.4 7.6 3.2-1.4-3.4-7.5 6.9-.3z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
const cursorPng = await sharp(CURSOR).png().toBuffer();
const ripple = (k) => {
  const r = 6 + 16 * k;
  const o = (1 - k) * 0.55;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><circle cx="28" cy="28" r="${r}" fill="rgb(99,102,241)" fill-opacity="${o * 0.35}" stroke="rgb(129,140,248)" stroke-opacity="${o}" stroke-width="2"/></svg>`);
};
const captionPngs = {};
for (const [id, file] of Object.entries(captions)) {
  const buffer = await readFile(path.join(take, file));
  const meta = await sharp(buffer).metadata();
  captionPngs[id] = { buffer, width: meta.width, height: meta.height };
}

const ffmpeg = spawn(ffmpegPath, [
  '-y', '-loglevel', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-filter_complex', `split[a][b];[a]palettegen=max_colors=${process.env.COLORS ?? 128}:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
  '-loop', '0', outFile,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const jump = events.find((e) => e.type === 'jump');
const flash = events.find((e) => e.type === 'flash');
const panes = Object.fromEntries(events.filter((e) => e.type === 'pane').map((e) => [e.id, e.rect]));
const FREEZE = Number(process.env.FREEZE ?? 3);
const FADE = 0.25;
// The frame shown while paused: the last one before the localStorage side corrects itself.
const freezeAt = frames.findLast((f) => f.t <= jump.t - Number(process.env.LEAD ?? 0.05)).t;
console.log('first paint', (flash.t - scene.start).toFixed(2), 'pause frame', (freezeAt - scene.start).toFixed(2), 'jump', (jump.t - scene.start).toFixed(2));

// Output time -> { source time, how far into the pause (or null) }.
const beforePause = freezeAt - scene.start;
const duration = scene.end - scene.start + FREEZE;
function sourceAt(o) {
  if (o < beforePause) return { t: scene.start + o, pause: null };
  if (o < beforePause + FREEZE) return { t: freezeAt, pause: o - beforePause };
  return { t: scene.start + o - FREEZE, pause: null };
}
const faded = (buffer, alpha) =>
  alpha >= 0.999 ? buffer : sharp(buffer).ensureAlpha().linear([1, 1, 1, alpha], [0, 0, 0, 0]).png().toBuffer();
const outline = (rect, color, alpha) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(rect.w)}" height="${Math.round(rect.h)}"><rect x="1" y="1" width="${Math.round(rect.w) - 2}" height="${Math.round(rect.h) - 2}" rx="9" fill="none" stroke="${color}" stroke-opacity="${alpha * 0.85}" stroke-width="1.25"/></svg>`);

let frameIndex = 0;
let written = 0;
let firstRaw = null;
let lastRaw = null;
let shownCaption = null;
let captionSince = 0;
const clampPos = (v, max) => Math.max(0, Math.min(max, Math.round(v)));
const send = async (raw) => {
  if (!ffmpeg.stdin.write(raw)) await new Promise((resolve) => ffmpeg.stdin.once('drain', resolve));
  written++;
};
const total = Math.round(duration * FPS);
for (let n = 0; n < total; n++) {
  const o = n / FPS;
  const { t, pause } = sourceAt(o);
  while (frameIndex + 1 < frames.length && frames[frameIndex + 1].t <= t) frameIndex++;
  const source = sharp(path.join(take, frames[frameIndex].file));
  const meta = await source.metadata();
  const s = meta.width / view.width;
  const cam = camera(t);
  const left = clampPos(cam.x * s, meta.width - 2);
  const top = clampPos(cam.y * s, meta.height - 2);
  const width = Math.min(meta.width - left, Math.round(cam.w * s));
  const height = Math.min(meta.height - top, Math.round(cam.h * s));
  const overlays = [];
  const k = W / cam.w;
  const toOut = (p) => ({ x: (p.x - cam.x) * k, y: (p.y - cam.y) * k });

  if (pause !== null) {
    const alpha = Math.min(1, pause / FADE, (FREEZE - pause) / FADE);
    for (const [id, callout, color] of [
      ['iframe-local-storage', 'callout-local', '#f59e0b'],
      ['iframe-cookie-prefs', 'callout-cookie', '#34d399'],
    ]) {
      const pane = panes[id];
      const origin = toOut(pane);
      const rect = { w: pane.w * k, h: Math.min(pane.h * k, H - origin.y) };
      overlays.push({ input: outline(rect, color, alpha), left: Math.round(origin.x), top: Math.round(origin.y) });
      const png = captionPngs[callout];
      overlays.push({
        input: await faded(png.buffer, alpha),
        left: Math.round(origin.x + (rect.w - png.width) / 2),
        top: Math.round(origin.y + rect.h * 0.56 - png.height / 2),
      });
    }
  }
  for (const c of clicks) {
    const age = (t - c.t) / 0.45;
    if (pause === null && age >= 0 && age < 1) {
      const p = toOut(c);
      overlays.push({ input: ripple(age), left: Math.round(p.x - 28), top: Math.round(p.y - 28) });
    }
  }
  const cur = toOut(cursorAt(t));
  if (cur.x > -4 && cur.y > -4 && cur.x < W - 6 && cur.y < H - 6) {
    overlays.push({ input: cursorPng, left: Math.round(cur.x - 5), top: Math.round(cur.y - 3) });
  }
  const captionId = pause !== null ? 'paused' : o >= beforePause + FREEZE ? 'after' : captionEvents.findLast((c) => c.t <= t)?.id;
  if (captionId !== shownCaption) {
    shownCaption = captionId;
    captionSince = o;
  }
  if (captionId) {
    const png = captionPngs[captionId];
    overlays.push({
      input: await faded(png.buffer, Math.min(1, (o - captionSince) / FADE + 0.15)),
      left: captionId === 'change' ? 10 : Math.round((W - png.width) / 2),
      top: H - png.height - 14,
    });
  }
  const inBounds = overlays.filter((item) => item.left >= 0 && item.top >= 0);
  const composed = sharp(
    await source.extract({ left, top, width, height }).resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer(),
  ).composite(inBounds);
  const raw = await composed.clone().removeAlpha().raw().toBuffer();
  firstRaw ??= raw;
  lastRaw = raw;
  if (STILLS && written % Number(process.env.EVERY ?? 10) === 0) {
    await composed.png().toFile(path.join(STILLS, `${String(written).padStart(4, '0')}.png`));
  }
  await send(raw);
}
// Dissolve into the first frame so the loop does not snap.
const LOOP = Math.round(0.5 * FPS);
for (let n = 1; n <= LOOP; n++) {
  const mix = n / (LOOP + 1);
  const blended = Buffer.allocUnsafe(lastRaw.length);
  for (let i = 0; i < lastRaw.length; i++) blended[i] = lastRaw[i] + (firstRaw[i] - lastRaw[i]) * mix;
  await send(blended);
}
console.log('pause at output', beforePause.toFixed(2), 's, frame', Math.round(beforePause * FPS));
ffmpeg.stdin.end();
await new Promise((resolve, reject) => ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))));
console.log(`${written} frames, ${(written / FPS).toFixed(1)} s -> ${outFile}`);
