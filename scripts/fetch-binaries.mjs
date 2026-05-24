// Fetch ffmpeg/ffprobe/mpv into resources/bin/
// Safe to re-run: skips downloads that already exist.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'resources', 'bin');

const FFMPEG_ZIP_URL =
  'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip';

const MPV_RELEASES_API =
  'https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest';

const REQUIRED = ['ffmpeg.exe', 'ffprobe.exe', 'mpv.exe'];

async function main() {
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const have = new Set(fs.readdirSync(BIN_DIR));
  const missing = REQUIRED.filter((f) => !have.has(f));

  if (!missing.length) {
    console.log('[fetch-binaries] 全部就緒：', REQUIRED.join(', '));
    return;
  }

  console.log('[fetch-binaries] 缺少：', missing.join(', '));

  if (missing.includes('ffmpeg.exe') || missing.includes('ffprobe.exe')) {
    await fetchFfmpeg();
  }

  if (missing.includes('mpv.exe')) {
    await fetchMpv();
  }

  // Verify
  const stillMissing = REQUIRED.filter(
    (f) => !fs.existsSync(path.join(BIN_DIR, f)),
  );
  if (stillMissing.length) {
    console.error('[fetch-binaries] 仍缺少：', stillMissing.join(', '));
    process.exit(1);
  }
  console.log('[fetch-binaries] 全部完成。');
}

async function fetchFfmpeg() {
  console.log('[fetch-binaries] 下載 FFmpeg (BtbN gpl latest)...');
  const tmp = path.join(os.tmpdir(), `ffmpeg-${Date.now()}.zip`);
  await download(FFMPEG_ZIP_URL, tmp);
  console.log('[fetch-binaries] 解壓 FFmpeg...');
  const extractDir = path.join(os.tmpdir(), `ffmpeg-extract-${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });
  const r = spawnSync('tar', ['-xf', tmp, '-C', extractDir], {
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('解壓 FFmpeg 失敗（需要 Windows 10+ 內建 tar）');
  const found = findFiles(extractDir, new Set(['ffmpeg.exe', 'ffprobe.exe']));
  for (const [name, src] of Object.entries(found)) {
    const dest = path.join(BIN_DIR, name);
    fs.copyFileSync(src, dest);
    console.log(`[fetch-binaries] -> ${dest}`);
  }
  fs.rmSync(tmp, { force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });
}

async function fetchMpv() {
  console.log('[fetch-binaries] 查詢 mpv 最新版本...');
  const rel = await fetchJson(MPV_RELEASES_API);
  // Pick the plain x86_64 build, not v3 / i686 / mpvnet
  const asset = (rel.assets || []).find((a) =>
    /^mpv-x86_64-\d/.test(a.name) && a.name.endsWith('.7z'),
  );
  if (!asset) throw new Error('找不到 mpv x86_64 7z asset');
  console.log(`[fetch-binaries] 下載 ${asset.name}...`);
  const tmp = path.join(os.tmpdir(), asset.name);
  await download(asset.browser_download_url, tmp);

  console.log('[fetch-binaries] 解壓 mpv (7z)...');
  const sevenZip = (await import('7zip-bin')).default;
  const sevenZipPath = sevenZip.path7za;
  const extractDir = path.join(os.tmpdir(), `mpv-extract-${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });
  const r = spawnSync(sevenZipPath, ['x', tmp, `-o${extractDir}`, '-y'], {
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('解壓 mpv 失敗');

  const found = findFiles(extractDir, new Set(['mpv.exe']));
  if (!found['mpv.exe']) throw new Error('解壓後找不到 mpv.exe');
  const dest = path.join(BIN_DIR, 'mpv.exe');
  fs.copyFileSync(found['mpv.exe'], dest);
  console.log(`[fetch-binaries] -> ${dest}`);

  fs.rmSync(tmp, { force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });
}

function findFiles(dir, names) {
  const result = {};
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (names.has(ent.name) && !result[ent.name]) result[ent.name] = p;
    }
  };
  walk(dir);
  return result;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ts-clipper-fetch-binaries' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json();
}

async function download(url, dest) {
  let current = url;
  for (let i = 0; i < 8; i++) {
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': 'ts-clipper-fetch-binaries' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`下載失敗 ${res.status}: ${current}`);
    await pipeline(res.body, fs.createWriteStream(dest));
    return;
  }
  throw new Error('過多重新導向');
}

main().catch((e) => {
  console.error('[fetch-binaries] 失敗：', e.message);
  process.exit(1);
});
