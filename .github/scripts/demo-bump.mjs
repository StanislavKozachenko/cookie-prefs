// Moves the demo to a released cookie-prefs, for the Demo bump workflow.
//
//   node .github/scripts/demo-bump.mjs wait <version>     waits until npm installs the version
//   node .github/scripts/demo-bump.mjs update <version>   sets demo/ to ^<version>
//
// `update` changes only cookie-prefs in demo/package.json and demo/package-lock.json and fails if
// npm touched anything else. It writes changed=true|false to $GITHUB_OUTPUT when that is set.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { URL } from 'node:url';
import process from 'node:process';

const NAME = 'cookie-prefs';
const REGISTRY = 'https://registry.npmjs.org';
const DEMO = new URL('../../demo/', import.meta.url);
// A fresh publish can take minutes to become installable ("being processed").
const TIMEOUT_MS = Number(process.env.DEMO_BUMP_TIMEOUT_MS ?? 15 * 60_000);
const INTERVAL_MS = Number(process.env.DEMO_BUMP_INTERVAL_MS ?? 20_000);

const print = (line) => process.stdout.write(`${line}\n`);
const fail = (message) => {
  print(`::error::${message}`);
  process.exit(1);
};

const [mode, version] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) fail(`Not a version: ${version}`);

// What `npm install` reads: the abbreviated packument, then the tarball it points to.
async function installable() {
  const res = await globalThis.fetch(`${REGISTRY}/${NAME}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  });
  if (!res.ok) return `packument: HTTP ${res.status}`;
  const tarball = (await res.json()).versions?.[version]?.dist?.tarball;
  if (!tarball) return `${version} is not in the packument yet`;
  const head = await globalThis.fetch(tarball, { method: 'HEAD' });
  return head.ok ? null : `tarball: HTTP ${head.status}`;
}

async function wait() {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    const reason = await installable().catch((error) => String(error));
    if (!reason) return print(`${NAME}@${version} is installable`);
    if (Date.now() >= deadline) fail(`${NAME}@${version} is not installable after ${Math.round(TIMEOUT_MS / 1000)} s: ${reason}`);
    print(`Waiting for ${NAME}@${version}: ${reason}`);
    await sleep(INTERVAL_MS);
  }
}

const read = (file) => readFileSync(new URL(file, DEMO), 'utf8');

// The lockfile and the manifest with every trace of cookie-prefs removed: these must not change.
function rest(pkg, lock) {
  const strip = (deps) => (deps ? { ...deps, [NAME]: undefined } : deps);
  const root = lock.packages[''];
  return {
    pkg: { ...pkg, dependencies: strip(pkg.dependencies) },
    lock: {
      ...lock,
      packages: {
        ...lock.packages,
        '': { ...root, dependencies: strip(root.dependencies) },
        [`node_modules/${NAME}`]: undefined,
      },
    },
  };
}

function update() {
  const before = { pkg: read('package.json'), lock: read('package-lock.json') };
  execFileSync(
    'npm',
    ['install', `${NAME}@^${version}`, '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-online'],
    { cwd: DEMO, stdio: 'inherit' },
  );
  const after = { pkg: read('package.json'), lock: read('package-lock.json') };
  const changed = before.pkg !== after.pkg || before.lock !== after.lock;

  const pkg = JSON.parse(after.pkg);
  const lock = JSON.parse(after.lock);
  if (pkg.dependencies?.[NAME] !== `^${version}`) fail(`demo/package.json has ${NAME} ${pkg.dependencies?.[NAME]}, expected ^${version}`);
  if (lock.packages[''].dependencies?.[NAME] !== `^${version}`) fail(`demo/package-lock.json does not require ^${version}`);
  const locked = lock.packages[`node_modules/${NAME}`]?.version;
  if (locked !== version) fail(`demo/package-lock.json locks ${NAME}@${locked}, expected ${version}`);
  if (!isDeepStrictEqual(rest(JSON.parse(before.pkg), JSON.parse(before.lock)), rest(pkg, lock))) {
    fail(`npm changed more than ${NAME} in demo/; see git diff demo/`);
  }

  print(changed ? `demo/ now on ${NAME}@^${version}` : `demo/ is already on ${NAME}@^${version}, nothing to do`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

if (mode === 'wait') await wait();
else if (mode === 'update') update();
else fail(`Unknown mode: ${mode} (wait | update)`);
