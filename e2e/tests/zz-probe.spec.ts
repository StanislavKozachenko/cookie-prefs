// TEMPORARY probe for #98 (reverted before merge): in CI Firefox, when does a cookie written by one tab show up in
// the other tab's document.cookie, compared with the BroadcastChannel message?
import { test } from './fixtures';

test('probe cookie lag', async ({ context, browserName }) => {
  test.skip(browserName !== 'firefox', 'firefox only');
  test.setTimeout(240_000);
  await context.addInitScript(() => {
    for (let o: object | null = window; o; o = Object.getPrototypeOf(o)) Reflect.deleteProperty(o, 'cookieStore');
  });
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto('/script');
  await b.goto('/script');
  const rows: string[] = [];
  for (const [i, writer, reader] of [
    [0, a, b],
    [1, b, a],
    [2, a, b],
    [3, b, a],
    [4, a, b],
    [5, b, a],
  ] as const) {
    const value = `v${i}`;
    await reader.evaluate((value) => {
      const w = window as any;
      const now = () => performance.timeOrigin + performance.now();
      w.__r = { msg: 0, msgCookie: false, cookie: 0, vis: document.visibilityState, focus: document.hasFocus() };
      const has = () => document.cookie.includes(`probe=${value}`);
      const ch = new BroadcastChannel('cookie-prefs');
      ch.onmessage = () => {
        w.__r.msg = now();
        w.__r.msgCookie = has();
        w.__r.msgVis = document.visibilityState;
        ch.close();
      };
      const end = now() + 12000;
      const poll = () => {
        if (has()) w.__r.cookie = now();
        else if (now() < end) setTimeout(poll, 20);
      };
      poll();
    }, value);
    const t0 = await writer.evaluate((value) => {
      document.cookie = `probe=${value}; path=/`;
      const t = performance.timeOrigin + performance.now();
      const ch = new BroadcastChannel('cookie-prefs');
      ch.postMessage(0);
      ch.close();
      return t;
    }, value);
    await reader.waitForTimeout(12500);
    const r = await reader.evaluate(() => (window as any).__r);
    const w = await writer.evaluate(() => [document.visibilityState, document.hasFocus()]);
    rows.push(
      `${i} ${writer === a ? 'a->b' : 'b->a'} msg=${r.msg ? (r.msg - t0).toFixed(0) : 'never'} cookie=${r.cookie ? (r.cookie - t0).toFixed(0) : 'never'} atMsg=${r.msgCookie} msgVis=${r.msgVis} readerVis=${r.vis}/${r.focus} writerVis=${w}`,
    );
  }
  throw new Error('PROBE\n' + rows.join('\n'));
});
