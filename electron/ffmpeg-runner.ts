import { spawn, ChildProcess, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface FfmpegRunnerOptions {
  ffmpegPath: string;
  ffprobePath: string;
}

export interface ProbeInfo {
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  fps: number;
}

export interface ExportOptions {
  input: string;
  output: string;
  inSec: number;
  outSec: number;
  mode: 'copy' | 'reencode';
  encoder?: string;
  videoBitrateK?: number;
}

export interface Progress {
  percent: number;
  frame: number;
  fps: number;
  speed: number;
}

export interface ExportResult {
  ok: boolean;
  output: string;
  durationMs: number;
  message?: string;
}

const KNOWN_ENCODERS = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264'] as const;

export class FfmpegRunner {
  private proc: ChildProcess | null = null;
  private cancelled = false;

  constructor(private opts: FfmpegRunnerOptions) {}

  async probe(file: string): Promise<ProbeInfo> {
    const { stdout } = await execFileAsync(this.opts.ffprobePath, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      file,
    ], { maxBuffer: 16 * 1024 * 1024 });
    const j = JSON.parse(stdout);
    const v = (j.streams || []).find((s: any) => s.codec_type === 'video');
    const a = (j.streams || []).find((s: any) => s.codec_type === 'audio');
    const duration =
      Number(j.format?.duration) ||
      Number(v?.duration) ||
      Number(a?.duration) ||
      0;
    let fps = 0;
    if (v?.r_frame_rate) {
      const [n, d] = v.r_frame_rate.split('/').map(Number);
      if (d) fps = n / d;
    }
    return {
      duration,
      width: Number(v?.width) || 0,
      height: Number(v?.height) || 0,
      videoCodec: v?.codec_name || '',
      audioCodec: a?.codec_name || '',
      fps,
    };
  }

  async detectHwEncoders(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        this.opts.ffmpegPath,
        ['-hide_banner', '-encoders'],
        { maxBuffer: 8 * 1024 * 1024 },
      );
      return KNOWN_ENCODERS.filter((e) =>
        new RegExp(`\\b${e}\\b`).test(stdout),
      );
    } catch {
      return [];
    }
  }

  cancel() {
    this.cancelled = true;
    if (this.proc && !this.proc.killed) {
      try {
        this.proc.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
  }

  export(opts: ExportOptions, onProgress: (p: Progress) => void): Promise<ExportResult> {
    return new Promise((resolve) => {
      const start = Date.now();
      const totalSec = Math.max(0.001, opts.outSec - opts.inSec);
      const args = this.buildArgs(opts);
      this.cancelled = false;
      this.proc = spawn(this.opts.ffmpegPath, args, { windowsHide: true });

      let stderr = '';
      this.proc.stderr?.on('data', (d) => {
        stderr += d.toString();
        if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
      });

      let progBuf = '';
      const stats: Record<string, string> = {};
      this.proc.stdout?.on('data', (d: Buffer) => {
        progBuf += d.toString('utf8');
        let idx: number;
        while ((idx = progBuf.indexOf('\n')) !== -1) {
          const line = progBuf.slice(0, idx).trim();
          progBuf = progBuf.slice(idx + 1);
          const eq = line.indexOf('=');
          if (eq === -1) continue;
          const k = line.slice(0, eq);
          const v = line.slice(eq + 1);
          stats[k] = v;
          if (k === 'progress') {
            const outMs = Number(stats.out_time_ms || stats.out_time_us || 0) / 1000;
            const percent = Math.min(100, Math.max(0, (outMs / 1000 / totalSec) * 100));
            onProgress({
              percent,
              frame: Number(stats.frame || 0),
              fps: Number(stats.fps || 0),
              speed: Number((stats.speed || '0').replace('x', '')) || 0,
            });
          }
        }
      });

      this.proc.on('error', (err) => {
        resolve({ ok: false, output: opts.output, durationMs: Date.now() - start, message: err.message });
      });

      this.proc.on('exit', (code) => {
        this.proc = null;
        if (this.cancelled) {
          resolve({ ok: false, output: opts.output, durationMs: Date.now() - start, message: '已取消' });
          return;
        }
        if (code === 0) {
          onProgress({ percent: 100, frame: Number(stats.frame || 0), fps: 0, speed: 0 });
          resolve({ ok: true, output: opts.output, durationMs: Date.now() - start });
        } else {
          resolve({
            ok: false,
            output: opts.output,
            durationMs: Date.now() - start,
            message: extractFfmpegError(stderr) || `ffmpeg exited with code ${code}`,
          });
        }
      });
    });
  }

  private buildArgs(o: ExportOptions): string[] {
    const args: string[] = ['-hide_banner', '-loglevel', 'error', '-y', '-progress', 'pipe:1', '-nostats'];

    if (o.mode === 'copy') {
      // Fast seek before -i for keyframe snap
      args.push('-ss', o.inSec.toFixed(3));
      args.push('-to', o.outSec.toFixed(3));
      args.push('-i', o.input);
      args.push('-c', 'copy');
      args.push('-avoid_negative_ts', 'make_zero');
      args.push('-bsf:a', 'aac_adtstoasc');
      args.push('-movflags', '+faststart');
      args.push(o.output);
    } else {
      // Accurate seek after -i
      args.push('-i', o.input);
      args.push('-ss', o.inSec.toFixed(3));
      args.push('-to', o.outSec.toFixed(3));
      const enc = o.encoder || 'libx264';
      args.push('-c:v', enc);
      const br = `${o.videoBitrateK || 8000}k`;
      switch (enc) {
        case 'h264_nvenc':
          args.push('-preset', 'p5', '-rc', 'vbr', '-b:v', br, '-maxrate', br);
          break;
        case 'h264_qsv':
          args.push('-preset', 'medium', '-b:v', br);
          break;
        case 'h264_amf':
          args.push('-quality', 'balanced', '-b:v', br);
          break;
        default:
          args.push('-preset', 'medium', '-crf', '20');
      }
      args.push('-c:a', 'aac', '-b:a', '192k');
      args.push('-movflags', '+faststart');
      args.push(o.output);
    }

    return args;
  }
}

function extractFfmpegError(stderr: string): string | null {
  const lines = stderr.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return null;
  return lines.slice(-3).join('\n');
}
