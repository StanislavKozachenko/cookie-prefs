// TEMPORARY probe for #98 (reverted before merge): instruments the library's path in the app in Firefox.
import type { Page } from '@playwright/test';
import { test, hydrated } from './fixtures';

type W = { __log: string[]; __t0: number };

test('probe library path', async ({ context, browserName }) => {
  test.skip(browserName !== 'firefox', 'firefox only');
  test.setTimeout(240_000);
  await context.addInitScript(() => {
    for (let o: object | null = window; o; o = Object.getPrototypeOf(o)) Reflect.deleteProperty(o, 'cookieStore');
    const w = window as unknown as W;
    w.__log = [];
    w.__t0 = 0;
    const t = () => (performance.now() - w.__t0).toFixed(0);
    const log = (s: string) => w.__log.push(`${t()} ${s}`);
    const BC = BroadcastChannel;
    let n = 0;
    class Logged extends BC {
      id = ++n;
      constructor(name: string) {
        super(name);
        log(`bc#${this.id} open`);
        this.addEventListener('message', (e) => log(`bc#${this.id} msg ${JSON.stringify(e.data)} vis=${document.visibilityState}`));
      }
      postMessage(d: unknown) {
        log(`bc#${this.id} post`);
        super.postMessage(d);
      }
      close() {
        log(`bc#${this.id} close`);
        super.close();
      }
    }
    (window as unknown as { BroadcastChannel: unknown }).BroadcastChannel = Logged;
    const st = window.setTimeout;
    window.setTimeout = ((fn: (...a: unknown[]) => void, d?: number, ...args: unknown[]) => {
      if (args.length && typeof d == 'number' && d >= 16 && d <= 2048) {
        log(`timer set ${d}`);
        return st(() => {
          log(`timer fire ${d} cookie=${/sidebar=[^;]*/.exec(document.cookie)?.[0]}`);
          fn(...args);
        }, d);
      }
      return st(fn, d, ...args);
    }) as typeof setTimeout;
    let last = '';
    const poll = () => {
      const c = /sidebar=[^;]*/.exec(document.cookie)?.[0] ?? '-';
      const txt = document.querySelector('[data-testid="sidebar"]')?.textContent ?? '?';
      const s = `${c} dom=${txt} vis=${document.visibilityState}`;
      if (s != last) log(`state ${s}`);
      last = s;
      st(poll, 10);
    };
    poll();
  });
  const pages: Page[] = [];
  for (let i = 0; i < 2; i++) {
    const p = await context.newPage();
    await p.goto('/script');
    await hydrated(p);
    pages.push(p);
  }
  const [a, b] = pages as [Page, Page];
  const out: string[] = [];
  let failures = 0;
  for (let i = 0; i < 12; i++) {
    const [writer, reader] = i % 2 ? [b, a] : [a, b];
    for (const p of [a, b])
      await p.evaluate((i) => {
        const w = window as unknown as W;
        w.__t0 = performance.now();
        w.__log.push(`---- round ${i}`);
      }, i);
    const before = await reader.getByTestId('sidebar').textContent();
    await writer.getByTestId('toggle-sidebar').click();
    let ok = true;
    try {
      await reader.waitForFunction((v) => document.querySelector('[data-testid="sidebar"]')?.textContent !== v, before, {
        timeout: 6000,
      });
    } catch {
      ok = false;
      failures++;
    }
    const lr = await reader.evaluate(() => (window as unknown as W).__log);
    const lw = await writer.evaluate(() => (window as unknown as W).__log);
    out.push(`#${i} ${i % 2 ? 'b->a' : 'a->b'} ${ok ? 'OK' : 'STALE'}`);
    if (!ok || i < 2) out.push('  writer: ' + lw.join(' | '), '  reader: ' + lr.join(' | '));
    // resync before the next round
    if (!ok) await reader.reload();
    if (!ok) await hydrated(reader);
  }
  throw new Error(`PROBE failures=${failures}\n` + out.join('\n'));
});
