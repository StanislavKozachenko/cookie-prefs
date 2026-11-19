// @vitest-environment jsdom
import { act, version, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../index';
import { ThemeColor } from '../index';

// The whole document rendered and hydrated by React (outside the Next.js App Router), on
// React 18 and 19: the tag the script appends to <head> must not break hydration.

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = 'theme=; Max-Age=0; Path=/';
  // unmounting a root on `document` removes <html> on React 18
  if (!document.documentElement) document.append(document.createElement('html'));
});

const ssr = (node: ReactNode) => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'document')!;
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });
  try {
    return renderToString(node);
  } finally {
    Object.defineProperty(globalThis, 'document', desc);
  }
};

const Doc = ({ own }: { own?: boolean }) => (
  <html lang="en" suppressHydrationWarning>
    <head>
      <meta charSet="utf-8" />
      <title>t</title>
      {own && <meta name="theme-color" content="#123456" />}
    </head>
    <body>
      <ThemeProvider attribute="class">
        <ThemeColor colors={{ light: '#ffffff', dark: '#0a0a0a' }} />
        <p>content</p>
      </ThemeProvider>
    </body>
  </html>
);

it('hydrates a React-rendered document with the tag appended to <head>', () => {
  document.cookie = 'theme=dark';
  const markup = ssr(<Doc />);
  // as the parser builds it, then the inline scripts run in order
  document.documentElement.innerHTML = markup.replace(/^<html[^>]*>|<\/html>$/g, '');
  for (const s of document.querySelectorAll('script')) new Function(s.textContent!)();
  const tag = document.head.lastElementChild;
  expect(tag?.getAttribute('property')).toBe('cookie-prefs');
  expect(tag?.getAttribute('content')).toBe('#0a0a0a');

  const errors = vi.spyOn(console, 'error');
  let root!: ReturnType<typeof hydrateRoot>;
  act(() => {
    root = hydrateRoot(document, <Doc />);
  });
  expect(errors).not.toHaveBeenCalled();
  expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
  expect(document.querySelector('meta[name="theme-color"]')).toBe(tag);
  expect(document.querySelector('p')?.textContent).toBe('content');
  act(() => root.unmount());
});

// Documented limitation: a theme-color tag the app renders in <head> through React. React 19
// leaves the owned tag alone; React 18 hydrates <head> children by position, claims the
// owned tag for the app's <meta> and warns in development that `content` did not match.
it('a React-rendered page tag in <head>: no warning on React 19, a development warning on React 18', () => {
  document.cookie = 'theme=dark';
  document.documentElement.innerHTML = ssr(<Doc own />).replace(/^<html[^>]*>|<\/html>$/g, '');
  for (const s of document.querySelectorAll('script')) new Function(s.textContent!)();
  const tags = () => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content'));
  expect(tags()).toEqual(['#0a0a0a', '#123456']);

  const errors = vi.spyOn(console, 'error');
  let root!: ReturnType<typeof hydrateRoot>;
  act(() => {
    root = hydrateRoot(document, <Doc own />);
  });
  if (version.startsWith('18.'))
    expect(errors.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['Warning: Prop `%s` did not match. Server: %s Client: %s%s', 'content'],
    ]);
  else expect(errors).not.toHaveBeenCalled();
  // the browser still uses the owned tag
  expect(tags()).toEqual(['#0a0a0a', '#123456']);
  act(() => root.unmount());
});
