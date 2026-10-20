// Starts the built app once in smoke mode and exits with its exit code.
// ELECTRON_RUN_AS_NODE is removed first: editors such as VS Code set it for the programs they start, and with it
// set Electron runs as plain Node, so `require('electron').app` is undefined and the app cannot start.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(electron, ['.', '--smoke'], {
  stdio: 'inherit',
  env,
  cwd: fileURLToPath(new URL('..', import.meta.url)),
});
process.exit(result.status ?? 1);
