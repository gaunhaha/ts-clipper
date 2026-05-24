// Launches Electron with a clean env that guarantees main-process mode.
// Some environments (e.g. certain IDE / shell profiles) leak
// ELECTRON_RUN_AS_NODE=1, which silently turns `electron .` into a plain
// Node process — in that mode `require('electron')` returns the binary path
// string instead of the API object, causing TypeError on `app.whenReady()`.

import { spawn } from 'node:child_process';
import electronPath from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.NODE_ENV = env.NODE_ENV || 'development';

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
