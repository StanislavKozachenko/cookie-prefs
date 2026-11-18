import { NPM_URL, REPO_URL } from '../lib/options';
import { GitHubIcon, LogoMark, NpmIcon } from './icons';

export type Page = 'cookie' | 'local' | 'compare';

const PAGES: { page: Page; href: string; label: string; testid: string }[] = [
  { page: 'cookie', href: '/', label: 'cookie-prefs', testid: 'nav-cookie-prefs' },
  { page: 'local', href: '/local-storage', label: 'localStorage', testid: 'nav-local-storage' },
  { page: 'compare', href: '/compare', label: 'Compare', testid: 'nav-compare' },
];

/**
 * The demo's own navigation. Plain links: each page has its own root layout, so every
 * navigation is a full page load, served by the server like a reload.
 */
export function SiteNav({ current, children }: { current: Page; children?: React.ReactNode }) {
  return (
    <header className="site-nav">
      <a className="brand" href="/" aria-label="cookie-prefs demo home">
        <LogoMark className="brand-mark" />
        <span className="brand-name">cookie-prefs</span>
        <span className="brand-tag">demo</span>
      </a>
      <nav className="site-tabs" aria-label="Demo pages">
        {PAGES.map(({ page, href, label, testid }) => (
          <a key={page} href={href} data-testid={testid} aria-current={page == current ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {children}
      <div className="site-links">
        <a href={REPO_URL} data-testid="link-github" rel="noopener">
          <GitHubIcon />
          <span>GitHub</span>
        </a>
        <a href={NPM_URL} data-testid="link-npm" rel="noopener">
          <NpmIcon />
          <span>npm</span>
        </a>
      </div>
    </header>
  );
}
