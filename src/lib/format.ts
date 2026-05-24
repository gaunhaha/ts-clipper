export function formatTime(seconds: number, withMs = true): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const ms = Math.floor((seconds - total) * 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hh = h.toString().padStart(2, '0');
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  const base = `${hh}:${mm}:${ss}`;
  return withMs ? `${base}.${ms.toString().padStart(3, '0')}` : base;
}

export function parseTime(str: string): number | null {
  const m = str.trim().match(/^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const parts = [m[1], m[2], m[3]].filter((p): p is string => !!p).map(Number);
  if (parts.some(isNaN)) return null;
  let total = 0;
  for (const p of parts) total = total * 60 + p;
  return total;
}

export function basenameNoExt(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const base = norm.slice(norm.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}
