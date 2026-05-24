import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

const isDev = process.env.NODE_ENV === 'development';

export function resolveBin(name: string): string {
  // dev: resources/bin/<name> at project root
  // prod: process.resourcesPath/bin/<name>
  if (isDev) {
    return path.join(app.getAppPath(), 'resources', 'bin', name);
  }
  const candidate = path.join(process.resourcesPath, 'bin', name);
  if (fs.existsSync(candidate)) return candidate;
  // Fallback: rely on PATH
  return name;
}
