'use client';

import { useRef } from 'react';
import { prefs } from '../app/prefs';
import { PREF_KEYS, SAMPLE, type DemoPrefs } from '../lib/options';
import { ReloadIcon } from './icons';
import { SiteNav } from './site-nav';

const PANES = [
  {
    id: 'local-storage',
    title: 'localStorage',
    src: '/local-storage?embed=1',
    caption: 'Server renders defaults: sidebar, rows and dates jump after hydration.',
  },
  {
    id: 'cookie-prefs',
    title: 'cookie-prefs',
    src: '/?embed=1',
    caption: 'Server reads the cookies: the first HTML is already right.',
  },
] as const;

export function CompareView() {
  const frames = useRef<(HTMLIFrameElement | null)[]>([]);

  const reloadBoth = () => frames.current.forEach((frame) => frame?.contentWindow?.location.reload());

  // Both iframes share this page's origin, so both stores can be written from here.
  const writeBoth = (values: DemoPrefs | null) => {
    for (const key of PREF_KEYS) {
      try {
        if (values) localStorage.setItem(key, String(values[key]));
        else localStorage.removeItem(key);
      } catch {
        // storage blocked
      }
      if (values) (prefs[key].set as (value: DemoPrefs[typeof key]) => void)(values[key]);
      else prefs[key].reset();
    }
    reloadBoth();
  };

  return (
    <div className="compare" data-testid="compare">
      <SiteNav current="compare">
        <div className="compare-actions">
          <button type="button" className="btn" data-testid="apply-sample" onClick={() => writeBoth(SAMPLE)}
            title="Dark, collapsed sidebar, compact, 20 rows, German: written to both stores, then both reload">
            Apply sample prefs
          </button>
          <button type="button" className="btn" data-testid="reset-both" onClick={() => writeBoth(null)}>
            Reset both
          </button>
          <button type="button" className="btn btn-primary" data-testid="reload-both" onClick={reloadBoth}>
            <ReloadIcon />
            Reload both
          </button>
        </div>
      </SiteNav>
      <div className="panes">
        {PANES.map((pane, i) => (
          <section key={pane.id} className={`pane pane-${pane.id}`} aria-labelledby={`pane-${pane.id}`}>
            <header className="pane-head">
              <h2 id={`pane-${pane.id}`} className="pane-title">
                <span className="pane-dot" aria-hidden="true" />
                {pane.title}
              </h2>
              <p className="pane-caption">{pane.caption}</p>
            </header>
            <iframe
              ref={(frame) => {
                frames.current[i] = frame;
              }}
              src={pane.src}
              title={`${pane.title} version of the demo`}
              data-testid={`iframe-${pane.id}`}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
