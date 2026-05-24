// Ensures dist-electron/package.json marks output as CommonJS,
// overriding the root package.json "type": "module" for compiled electron code.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'dist-electron');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2),
);
