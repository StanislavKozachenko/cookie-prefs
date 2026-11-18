'use client';

import type { ReactNode } from 'react';
import type { ServerRender } from '../lib/options';
import { Controls } from './controls';
import { useDemo, useHydrated } from './demo-state';
import { ChartIcon, ChevronIcon, FolderIcon, GlobeIcon, HomeIcon, RocketIcon, SearchIcon, SettingsIcon, SidebarIcon } from './icons';
import { Inspector } from './inspector';
import { SiteNav } from './site-nav';

const NAV = [
  { label: 'Overview', icon: <HomeIcon /> },
  { label: 'Deployments', icon: <RocketIcon />, current: true },
  { label: 'Projects', icon: <FolderIcon /> },
  { label: 'Domains', icon: <GlobeIcon /> },
  { label: 'Analytics', icon: <ChartIcon /> },
  { label: 'Settings', icon: <SettingsIcon /> },
];

/**
 * The mock app, identical on both pages. CSS reads the sidebar, density and theme from
 * `<html>`; the table comes in as `children`.
 */
export function Shell({ embed, server, children }: { embed: boolean; server: ServerRender; children: ReactNode }) {
  const { variant, values, set, pending } = useDemo();
  const hydrated = useHydrated();
  const cookie = variant == 'cookie';
  return (
    <div className="page" data-testid="app" data-variant={variant} data-hydrated={hydrated} data-embed={embed || undefined}>
      {embed ? null : (
        <>
          <SiteNav current={variant} />
          <p className="banner" data-testid="banner">
            {cookie ? (
              <>
                <strong>Preferences live in cookies.</strong> The server reads them and sends the right HTML in the first
                response: reload, nothing flashes. <a href="/compare">Compare with localStorage</a>
              </>
            ) : (
              <>
                <strong>Preferences live in localStorage.</strong> The server cannot read it and renders defaults; the page
                corrects itself after hydration: reload and watch it jump. <a href="/compare">Compare side by side</a>
              </>
            )}
          </p>
        </>
      )}
      <div className="app">
        <aside id="sidebar" className="sidebar" aria-label="Workspace" data-testid="sidebar">
          <div className="workspace">
            <span className="workspace-logo" aria-hidden="true">
              A
            </span>
            <span className="nav-label workspace-name">Acme Inc</span>
            <ChevronIcon className="nav-label workspace-chevron" />
          </div>
          <nav className="side-nav" aria-label="Main">
            {NAV.map((item) => (
              <a
                key={item.label}
                href="#"
                onClick={(event) => event.preventDefault()}
                aria-current={item.current ? 'page' : undefined}
                title={item.label}
              >
                {item.icon}
                <span className="nav-label">{item.label}</span>
              </a>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className="avatar" aria-hidden="true">
              JD
            </span>
            <span className="nav-label">
              <span className="user-name">Jamie Doe</span>
              <span className="user-mail">jamie@acme.dev</span>
            </span>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button
              type="button"
              className="icon-btn"
              data-testid="sidebar-toggle"
              aria-label={values.sidebar ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-expanded={values.sidebar}
              aria-controls="sidebar"
              onClick={() => set('sidebar', !values.sidebar)}
            >
              <SidebarIcon />
            </button>
            <nav className="crumbs" aria-label="Breadcrumb">
              <span>Acme</span>
              <span className="crumb-sep" aria-hidden="true">
                /
              </span>
              <span aria-current="page">Deployments</span>
            </nav>
            <div className="search" aria-hidden="true">
              <SearchIcon />
              <span>Search</span>
              <kbd>⌘K</kbd>
            </div>
            <span className={`store-badge store-${variant}`} data-testid="store-badge">
              {cookie ? 'cookie-prefs' : 'localStorage'}
            </span>
          </header>

          <div className="content">
            <section className="table-area" aria-labelledby="table-title">
              <div className="table-head">
                <div>
                  <h1 id="table-title">Deployments</h1>
                  <p className="subtitle">
                    {cookie
                      ? 'Row count and number formats come from the server render.'
                      : 'Row count and number formats are fixed up on the client after hydration.'}
                  </p>
                </div>
                <span className="pending" data-testid="table-pending" data-pending={pending || undefined} aria-live="polite">
                  {pending ? 'Rendering on the server…' : ''}
                </span>
              </div>
              {children}
            </section>
            <aside className="rail" aria-label="Demo controls">
              <Controls />
              <Inspector server={server} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
