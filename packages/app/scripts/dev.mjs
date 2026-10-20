// `npm run dev`: electron-vite in development mode (hot reload), started with ELECTRON_RUN_AS_NODE removed.
// Editors such as VS Code set that variable for the programs they start; with it set Electron runs as plain Node
// and the app cannot start. Start the service first (see the README), or use `npm run demo` from the repository root.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const req = createRequire(join(appDir, 'package.json'));
const electronVite = join(dirname(req.resolve('electron-vite/package.json')), 'bin', 'electron-vite.js');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(process.execPath, [electronVite, 'dev', ...process.argv.slice(2)], { cwd: appDir, stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill());
