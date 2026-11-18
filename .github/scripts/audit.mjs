// Dependency audit for CI: fails on any high or critical advisory, except the ones listed in
// ALLOWED. An exception is for an advisory that cannot be fixed yet; it names the reason and is
// removed as soon as a fixed version exists.
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const ALLOWED = {
  // picomatch ReDoS. Every release up to the latest (4.0.7) is affected and there is no patched
  // version. A transitive dev dependency only (vitest, tsup, typescript-eslint): the published
  // package has no runtime dependencies. Remove once a fixed picomatch is released.
  'GHSA-fc5q-39xc-vjpf': 'picomatch: no patched version, dev dependency only',
};
const FAILING = new Set(['high', 'critical']);

const print = (line) => process.stdout.write(`${line}\n`);
const { stdout, error } = spawnSync('npm audit --json', { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (error) throw error;

const report = JSON.parse(stdout);
if (!report.vulnerabilities) {
  print(`::error::npm audit did not return a report: ${JSON.stringify(report.error ?? report).slice(0, 500)}`);
  process.exit(1);
}

// A vulnerable package lists its own advisories as objects in `via`; names there are packages
// that are affected only through a dependency.
const advisories = new Map();
for (const { via } of Object.values(report.vulnerabilities)) {
  for (const advisory of via) {
    if (typeof advisory === 'object') advisories.set(advisory.url.split('/').pop(), advisory);
  }
}

const blocking = [];
for (const [id, advisory] of advisories) {
  if (!FAILING.has(advisory.severity)) continue;
  if (id in ALLOWED) print(`allowed  ${id}  ${advisory.name}  (${ALLOWED[id]})`);
  else blocking.push(`${id}  ${advisory.severity}  ${advisory.name} ${advisory.range}: ${advisory.title}`);
}
for (const id of Object.keys(ALLOWED)) {
  if (!advisories.has(id)) print(`::warning::${id} is no longer reported: remove it from ALLOWED in .github/scripts/audit.mjs`);
}

if (blocking.length > 0) {
  for (const line of blocking) print(`::error::${line}`);
  process.exit(1);
}
print('No high or critical advisories outside the allowed list.');
