// One command to try the software: builds the desktop app, starts the service with an embedded
// database, waits until it answers, then opens the app. Closing the app stops the service.
//
//   npm run demo            open the app in TEST MODE (login page with a test-only F2 button)
//   npm run demo -- --login open the app with the real sign-in (admin / admin12345)
//   npm run demo -- --check start everything, confirm the window renders, then exit (used for testing)
//
// Data is kept in ./.devdata, so what you enter is still there next time. Delete that folder to start fresh.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'packages', 'app');
const PORT = process.env.PORT ?? '4100';
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin12345';
const check = process.argv.includes('--check');
// By default the demo runs in TEST MODE: no sign-in screen. Pass --login to try the real sign-in.
const testMode = !process.argv.includes('--login');
const url = `http://127.0.0.1:${PORT}`;

console.log('1/3 Building the desktop app...');
const fromApp = createRequire(join(appDir, 'package.json'));
// Resolved from the app package, wherever npm installed it.
const electronVite = join(dirname(fromApp.resolve('electron-vite/package.json')), 'bin', 'electron-vite.js');
const build = spawnSync(process.execPath, [electronVite, 'build'], { cwd: appDir, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const alreadyRunning = await fetch(`${url}/api/health`).then((r) => r.ok, () => false);
let service = null;
if (alreadyRunning) {
  console.log(`2/3 A service is already answering on ${url}; using it.`);
} else {
  console.log('2/3 Starting the service (embedded database in ./.devdata)...');
  const tsx = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  service = spawn(process.execPath, [tsx, join(root, 'packages', 'service', 'src', 'server', 'main.ts')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SAS_DEV_PGLITE_DIR: join(root, '.devdata'), ADMIN_PASSWORD, PORT, HOST: '127.0.0.1', SAS_NO_LOGIN: testMode ? '1' : '0' },
  });
  let log = '';
  service.stdout.on('data', (d) => (log += d));
  service.stderr.on('data', (d) => (log += d));
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (service.exitCode !== null) {
      console.error(`The service stopped unexpectedly:\n${log}`);
      process.exit(1);
    }
    if (await fetch(`${url}/api/health`).then((r) => r.ok, () => false)) break;
    if (Date.now() > deadline) {
      service.kill();
      console.error(`The service did not start in time:\n${log}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

console.log('3/3 Opening the app.');
console.log(testMode ? '    TEST MODE: press F2 on the login page to continue as the administrator. Use  npm run demo -- --login  to try the real sign-in.' : `    Sign in with   username: ${ADMIN_USER}   password: ${ADMIN_PASSWORD}   (created on the first run only)`);
console.log(`    Server address: ${url}  (the default; the app asks if it cannot connect)`);

// ELECTRON_RUN_AS_NODE is set by editors such as VS Code; with it set Electron would run as plain Node.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const electron = fromApp('electron');
const app = spawn(electron, ['.', ...(check ? ['--smoke'] : [])], { cwd: appDir, stdio: 'inherit', env });

const stop = () => {
  service?.kill();
};
process.on('SIGINT', () => {
  app.kill();
  stop();
});
app.on('exit', (code) => {
  stop();
  process.exit(code ?? 0);
});
