import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../index';
import { ThemeColor } from '../index';

// A real server: no DOM when the modules load, as in Node and in server bundles.
describe('server rendering', () => {
  it('renders the script with its nonce and no warning, on React 18 and 19', () => {
    const errors = vi.spyOn(console, 'error');
    const html = renderToString(
      <ThemeProvider attribute="class" nonce="n">
        <ThemeColor colors={{ light: '#ffffff', dark: '#0a0a0a' }} nonce="n" />
      </ThemeProvider>,
    );
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts).toHaveLength(2);
    for (const s of scripts) {
      expect(s).toContain('type="text/javascript"');
      expect(s).toContain('nonce="n"');
    }
    expect(html).toContain('(function(C){');
    expect(html).not.toContain('<meta');
  });
});
