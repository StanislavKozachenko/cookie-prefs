// Builds one e2e app for a Next major and runs the Playwright suite against it.
//
//   node e2e/scripts/run.mjs <14|15|16> [pack] [app] [test] [-- playwright args]
//
// With no step names all three run in order:
//   pack  build the package at this commit and `npm pack` it to e2e/.tmp/cookie-prefs.tgz
//   app   materialise e2e/.apps/next<major> from e2e/app, install it (the tarball included) and `next build`
//   test  install the browsers, then `playwright test` (Chromium, Firefox and WebKit) against `next start` of that app
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2e = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(e2e, '..');
const tarball = path.join(e2e, '.tmp', 'cookie-prefs.tgz');

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const playwrightArgs = dash === -1 ? [] : argv.slice(dash + 1);
const [major, ...steps] = (dash === -1 ? argv : argv.slice(0, dash));
const versions = JSON.parse(fs.readFileSync(path.join(e2e, 'versions.json'), 'utf8'));
if (!major || !(major in versions)) {
  console.error(`usage: node e2e/scripts/run.mjs <${Object.keys(versions).join('|')}> [pack] [app] [test] [-- playwright args]`);
  process.exit(2);
}
const all = ['pack', 'app', 'test'];
const todo = steps.length ? steps : all;
for (const s of todo) if (!all.includes(s)) throw new Error(`unknown step "${s}"`);

const appDir = path.join(e2e, '.apps', `next${major}`);
const run = (cmd, args, cwd, env = {}) => {
  console.log(`\n> ${cwd === root ? '.' : path.relative(root, cwd)}: ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env } });
};
const timed = (name, fn) => {
  const t = Date.now();
  fn();
  console.log(`\n[e2e] ${name}: ${((Date.now() - t) / 1000).toFixed(1)}s`);
};

if (!fs.existsSync(path.join(e2e, 'node_modules'))) run('npm', ['ci', '--no-audit', '--no-fund'], e2e);

if (todo.includes('pack')) {
  timed('pack', () => {
    run('npm', ['run', 'build'], root);
    fs.rmSync(path.dirname(tarball), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(tarball), { recursive: true });
    const out = execFileSync('npm', ['pack', '--silent', '--pack-destination', path.dirname(tarball)], { cwd: root, encoding: 'utf8' });
    fs.renameSync(path.join(path.dirname(tarball), out.trim().split('\n').pop()), tarball);
  });
}

if (todo.includes('app')) {
  timed('app', () => {
    if (!fs.existsSync(tarball)) throw new Error('no tarball: run the "pack" step first');
    // Template files are replaced, node_modules and .next/cache are kept so a second run is fast.
    fs.mkdirSync(appDir, { recursive: true });
    for (const name of ['app', 'middleware.ts', 'proxy.ts']) fs.rmSync(path.join(appDir, name), { recursive: true, force: true });
    fs.cpSync(path.join(e2e, 'app'), appDir, { recursive: true });
    // Next 16 renamed middleware.ts to proxy.ts.
    fs.rmSync(path.join(appDir, major === '16' ? 'middleware.ts' : 'proxy.ts'));
    const { next, react, 'react-dom': reactDom, ...types } = versions[major];
    fs.writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify(
        {
          name: `cookie-prefs-e2e-next${major}`,
          private: true,
          dependencies: { 'cookie-prefs': `file:${tarball}`, next, react, 'react-dom': reactDom, zod: '4.6.7' },
          devDependencies: { ...types, '@types/node': '22.20.5', typescript: '5.9.3' },
        },
        null,
        2,
      ) + '\n',
    );
    // npm would keep a previously installed copy of the tarball: always install the fresh one.
    fs.rmSync(path.join(appDir, 'node_modules', 'cookie-prefs'), { recursive: true, force: true });
    timed('app install', () => run('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock', '--prefer-offline'], appDir));
    timed('app build', () => run('npx', ['next', 'build'], appDir));
  });
}

if (todo.includes('test')) {
  // One Playwright project per browser. Only the browsers of the projects picked with `--project <name>` are
  // installed (all three by default); an installed browser is skipped in under a second. The system libraries
  // are not installed here, they need root: `cd e2e && sudo npx playwright install-deps <browsers>`.
  const browsers = ['chromium', 'firefox', 'webkit'];
  const picked = playwrightArgs.flatMap((a, i) =>
    a === '--project' ? [playwrightArgs[i + 1]] : a.startsWith('--project=') ? [a.slice('--project='.length)] : [],
  );
  run('npx', ['playwright', 'install', ...(picked.length && picked.every((p) => browsers.includes(p)) ? picked : browsers)], e2e);
  timed('test', () => run('npx', ['playwright', 'test', ...playwrightArgs], e2e, { E2E_NEXT: major }));
}
