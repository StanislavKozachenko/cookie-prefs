'use client';

import { PREF_KEYS, type ServerRender } from '../lib/options';
import { useDemo, useHydrated } from './demo-state';
import { ExternalIcon, ReloadIcon } from './icons';

/**
 * What the server rendered with, next to what the browser has stored. The server column
 * is fixed at render time: reload and it is rendered again (new time and request id).
 */
export function Inspector({ server }: { server: ServerRender }) {
  const { variant, values, stored } = useDemo();
  const hydrated = useHydrated();
  const cookie = variant == 'cookie';
  const stale = cookie
    ? 'Changed after this server render. Reload: the server reads the new cookie.'
    : 'The server rendered the default; the client replaced it after hydration.';
  return (
    <section className="card inspector" aria-labelledby="inspector-title" data-testid="inspector">
      <header className="card-head">
        <h2 id="inspector-title">Inspector</h2>
        <span className="hydration" data-testid="inspector-hydrated" data-hydrated={hydrated}>
          <span className="hydration-dot" aria-hidden="true" />
          {hydrated ? 'hydrated' : 'server HTML'}
        </span>
      </header>
      <dl className="render-meta">
        <div>
          <dt>Server render</dt>
          <dd className="mono" data-testid="inspector-rendered-at">
            {server.renderedAt} UTC
          </dd>
        </div>
        <div>
          <dt className="visually-hidden">Request id</dt>
          <dd className="mono faint" data-testid="inspector-request-id" title="Request id">
            #{server.requestId}
          </dd>
        </div>
      </dl>
      <table className="kv">
        <thead>
          <tr>
            <th scope="col">pref</th>
            <th scope="col" title={cookie ? 'Values the Server Component read with getPrefs(prefs)' : undefined}>
              {cookie ? 'getPrefs()' : 'server'}
            </th>
            <th scope="col">{cookie ? 'document.cookie' : 'localStorage'}</th>
          </tr>
        </thead>
        <tbody>
          {PREF_KEYS.map((key) => {
            const value = server.values[key];
            const changed = value !== values[key];
            const raw = stored?.[key];
            return (
              <tr key={key}>
                <th scope="row">{key}</th>
                <td
                  className="mono"
                  data-testid={`inspector-server-${key}`}
                  data-stale={changed || undefined}
                  title={changed ? stale : undefined}
                >
                  {String(value)}
                </td>
                <td className="mono" data-testid={`inspector-storage-${key}`}>
                  {raw === undefined ? (
                    <span className="faint">…</span>
                  ) : raw === null ? (
                    <span className="faint">not set</span>
                  ) : (
                    raw
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="actions">
        <button type="button" className="btn btn-primary" data-testid="reload-page" onClick={() => location.reload()}>
          <ReloadIcon />
          Reload page
        </button>
        <a className="btn" href={cookie ? '/' : '/local-storage'} target="_blank" rel="noopener" data-testid="open-new-tab">
          <ExternalIcon />
          Open in a new tab
        </a>
      </div>
      {cookie ? null : (
        <p className="note" data-testid="inspector-note">
          <span className="stale-dot" aria-hidden="true" /> The server cannot read localStorage, so it rendered the defaults.
        </p>
      )}
      <p className="hint">Changes sync across tabs.</p>
    </section>
  );
}
