// A fixed, fake dataset: the same 60 deployments on every render, server and client.

export type Status = 'ready' | 'error' | 'building' | 'canceled';
export type Environment = 'production' | 'preview';

export interface Deployment {
  id: string;
  project: string;
  environment: Environment;
  status: Status;
  branch: string;
  /** Build time in seconds. */
  duration: number;
  /** Requests served in the last 30 days. */
  requests: number;
  /** Cost in US dollars. */
  cost: number;
  /** Creation time, ms since the epoch. */
  createdAt: number;
}

const PROJECTS = [
  'storefront', 'dashboard', 'docs', 'marketing-site', 'api-gateway', 'auth-service',
  'billing', 'search', 'design-system', 'mobile-web', 'analytics', 'status-page',
];
const BRANCHES = [
  'main', 'feat/checkout-v2', 'fix/hydration', 'feat/dark-mode', 'chore/deps', 'feat/i18n',
  'fix/cache-headers', 'feat/sidebar', 'refactor/table', 'feat/search-filters', 'fix/locale-dates',
];

// mulberry32: a tiny seeded PRNG, so the "random" data is identical everywhere.
const random = (() => {
  let seed = 0x5eed;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;

const START = Date.UTC(2026, 10, 17, 17, 42);

export const deployments: readonly Deployment[] = Array.from({ length: 60 }, (_, i) => {
  const branch = i % 4 == 0 ? 'main' : pick(BRANCHES);
  const roll = random();
  return {
    id: 'dpl_' + Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0'),
    project: pick(PROJECTS),
    environment: branch == 'main' ? 'production' : 'preview',
    status: i == 1 ? 'building' : roll < 0.08 ? 'error' : roll < 0.13 ? 'canceled' : 'ready',
    branch,
    duration: 18 + Math.floor(random() * 220),
    requests: Math.floor(random() ** 2 * 4_800_000) + 1200,
    cost: Math.round(random() ** 2 * 18_000) / 100,
    createdAt: START - i * 47 * 60_000 - Math.floor(random() * 40) * 60_000,
  };
});
