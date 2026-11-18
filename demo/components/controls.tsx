'use client';

import { useId, type ReactNode } from 'react';
import { DENSITIES, LOCALE_LABELS, LOCALES, PAGE_SIZES, THEMES, type DemoPrefs, type PrefKey } from '../lib/options';
import { useDemo } from './demo-state';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';

const THEME_ICONS = { light: <SunIcon />, dark: <MoonIcon />, system: <MonitorIcon /> };
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {label}
      </span>
      {children(id)}
    </div>
  );
}

function Segmented<K extends PrefKey>({
  name,
  labelledBy,
  options,
}: {
  name: K;
  labelledBy: string;
  options: readonly { value: DemoPrefs[K]; label: ReactNode; title?: string }[];
}) {
  const { values, set } = useDemo();
  return (
    <div className="segmented" role="group" aria-labelledby={labelledBy}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={values[name] === option.value}
          data-testid={`pref-${name}-${option.value}`}
          title={option.title}
          onClick={() => set(name, option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The preference controls, bound to whichever store the page provides. */
export function Controls() {
  const { variant, values, set } = useDemo();
  return (
    <section className="card prefs" aria-labelledby="prefs-title" data-testid="preferences">
      <header className="card-head">
        <h2 id="prefs-title">Preferences</h2>
        <span className="card-meta">{variant == 'cookie' ? 'stored in cookies' : 'stored in localStorage'}</span>
      </header>
      <div className="fields">
        <Field label="Theme">
          {(id) => (
            <Segmented
              name="theme"
              labelledBy={id}
              options={THEMES.map((t) => ({ value: t, label: <>{THEME_ICONS[t]}<span>{cap(t)}</span></> }))}
            />
          )}
        </Field>
        <Field label="Sidebar">
          {(id) => (
            <div className="switch-row">
              <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={values.sidebar}
                aria-labelledby={id}
                data-testid="pref-sidebar"
                onClick={() => set('sidebar', !values.sidebar)}
              >
                <span className="switch-thumb" />
              </button>
              <span className="switch-text" aria-hidden="true">
                {values.sidebar ? 'Expanded' : 'Collapsed'}
              </span>
            </div>
          )}
        </Field>
        <Field label="Density">
          {(id) => <Segmented name="density" labelledBy={id} options={DENSITIES.map((d) => ({ value: d, label: cap(d) }))} />}
        </Field>
        <Field label="Rows">
          {(id) => (
            <Segmented
              name="pageSize"
              labelledBy={id}
              options={PAGE_SIZES.map((n) => ({ value: n, label: String(n), title: `${n} rows per page` }))}
            />
          )}
        </Field>
        <Field label="Locale">
          {(id) => (
            <Segmented
              name="locale"
              labelledBy={id}
              options={LOCALES.map((l) => ({ value: l, label: l.toUpperCase(), title: LOCALE_LABELS[l] }))}
            />
          )}
        </Field>
      </div>
    </section>
  );
}
