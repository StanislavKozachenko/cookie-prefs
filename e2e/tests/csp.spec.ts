import { test, expect, hydrated, seed, recordEarly, early, recordCsp, cspViolations, addedStyles, htmlState } from './fixtures';

const COOKIES = { ctheme: 'dark', sidebar: 'false', density: 'compact' };

test.describe('CSP with nonce (middleware / proxy)', () => {
  test('response carries a strict policy and every script tag in the HTML has the nonce', async ({ request }) => {
    const res = await request.get('/csp');
    const csp = res.headers()['content-security-policy']!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toMatch(/style-src 'self' 'nonce-[^']+'/);
    const nonce = /'nonce-([^']+)'/.exec(csp)![1]!;
    const html = await res.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(2);
    const inline = scripts.filter((s) => !/\ssrc=/.test(s));
    expect(inline.length).toBeGreaterThan(1);
    for (const s of scripts) expect(s, s).toContain(`nonce="${nonce}"`);
  });

  test('no violation; pre-paint script ran; set() and disableTransitionOnChange work', async ({ page, context, env }) => {
    await seed(context, env.baseURL, COOKIES);
    await recordCsp(page);
    await recordEarly(page);
    await page.goto('/csp');
    await hydrated(page);

    const e = await early(page);
    for (const k of ['readystatechange', 'DOMContentLoaded'] as const) {
      expect(e[k]!.cls, `class at ${k}`).toContain('dark');
      expect(e[k]!.sidebar).toBe('false');
      expect(e[k]!.density).toBe('compact');
      expect(e[k]!.hydrated).not.toBe('yes');
    }

    await page.getByTestId('toggle-sidebar').click();
    await expect.poll(() => htmlState(page).then((s) => s.sidebar)).toBe('true');
    await page.getByTestId('set-density-cozy').click();
    await expect.poll(() => htmlState(page).then((s) => s.density)).toBe('cozy');
    await page.getByTestId('set-light').click();
    await expect.poll(() => htmlState(page).then((s) => s.cls)).toEqual(['light']);
    await page.getByTestId('set-dark').click();
    await expect.poll(() => htmlState(page).then((s) => s.cls)).toEqual(['dark']);

    // disableTransitionOnChange added a <style> carrying the nonce, and the browser accepted it
    const styles = await addedStyles(page);
    expect(styles.length, 'transition-disabling <style> was added').toBeGreaterThan(0);
    expect(styles.every((s) => s.nonce), 'it carries the nonce').toBe(true);
    expect(await cspViolations(page)).toEqual([]);

    await page.reload();
    await hydrated(page);
    expect(await htmlState(page)).toMatchObject({ cls: ['dark'], sidebar: 'true', density: 'cozy' });
    expect(await cspViolations(page)).toEqual([]);
  });

  test('negative control: without the nonce prop the same page violates the policy', async ({ page, context, env, watch }) => {
    // the expected CSP reports: "Content Security Policy" in Chromium and WebKit, "Content-Security-Policy:" in Firefox
    const cspReport = /Content[- ]Security[- ]Policy/i;
    watch.ignore.push(cspReport);
    await seed(context, env.baseURL, COOKIES);
    await recordCsp(page);
    await recordEarly(page);
    const consoleErrors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    await page.goto('/cspbad');
    await hydrated(page);
    const violations = await cspViolations(page);
    expect(violations.some((v) => v.startsWith('script-src-elem')), `script violations: ${violations.join(' | ')}`).toBe(true);
    // the pre-paint scripts were blocked, so nothing reflected before hydration
    const e = await early(page);
    expect(e.DOMContentLoaded!.sidebar).toBeNull();
    expect(e.DOMContentLoaded!.cls).not.toContain('dark');
    // the transition-disabling style is blocked too
    await page.getByTestId('set-light').click();
    await expect.poll(async () => (await cspViolations(page)).some((v) => v.startsWith('style-src-elem'))).toBe(true);
    expect(consoleErrors.some((t) => cspReport.test(t))).toBe(true);
  });
});

test.describe('Trusted Types enforced', () => {
  test('hydrated page: toggling prefs and changing provider props does not throw', async ({ page, context, request, env, watch }) => {
    const res = await request.get('/tt');
    expect(res.headers()['content-security-policy']).toContain("require-trusted-types-for 'script'");

    await seed(context, env.baseURL, COOKIES);
    await recordCsp(page);
    await page.goto('/tt');
    await hydrated(page);
    expect(await htmlState(page)).toMatchObject({ cls: ['dark'], sidebar: 'false', density: 'compact' });

    await page.getByTestId('toggle-sidebar').click();
    await expect.poll(() => htmlState(page).then((s) => s.sidebar)).toBe('true');
    await page.getByTestId('set-density-cozy').click();
    await page.getByTestId('set-light').click();
    await expect.poll(() => htmlState(page).then((s) => s.cls)).toEqual(['light']);

    // provider props change after hydration (re-renders the provider and its inert script element)
    await page.getByTestId('prop-disable').click();
    await expect(page.getByTestId('prop-state')).toHaveText('class|false|system');
    await page.getByTestId('prop-default').click();
    await page.getByTestId('prop-attribute').click();
    await expect(page.getByTestId('prop-state')).toHaveText('data-theme|false|dark');
    await page.getByTestId('set-dark').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
    await page.getByTestId('prop-disable').click();
    await page.getByTestId('set-light').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light');
    expect(await cspViolations(page)).toEqual([]);
    // enforcement is on: a raw string sink is rejected
    const before = watch.problems.length;
    const sink = await page.evaluate(() => {
      try {
        document.createElement('div').innerHTML = '<b>x</b>';
        return 'allowed';
      } catch {
        return 'blocked';
      }
    });
    expect(sink, 'Trusted Types enforcement is active').toBe('blocked');
    await page.waitForTimeout(300);
    watch.problems.splice(before); // the probe's own console error
  });
});
