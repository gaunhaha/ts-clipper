import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { formatTime, basenameNoExt } from '@/lib/format';
import { X, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  inputPath: string;
  inSec: number;
  outSec: number;
  encoders: string[];
  onClose: () => void;
}

const ENCODER_LABEL: Record<string, string> = {
  h264_nvenc: 'NVIDIA NVENC (硬體)',
  h264_qsv: 'Intel QSV (硬體)',
  h264_amf: 'AMD AMF (硬體)',
  libx264: 'x264 (CPU)',
};

export function ExportDialog({ open, inputPath, inSec, outSec, encoders, onClose }: Props) {
  const [mode, setMode] = useState<'copy' | 'reencode'>('copy');
  const [encoder, setEncoder] = useState<string>('');
  const [bitrate, setBitrate] = useState<number>(8000);
  const [progress, setProgress] = useState<{ percent: number; fps: number; speed: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; output: string; message?: string } | null>(null);

  useEffect(() => {
    const preferred = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264'].find((e) => encoders.includes(e));
    setEncoder(preferred || 'libx264');
  }, [encoders]);

  useEffect(() => {
    if (!open) {
      setProgress(null);
      setResult(null);
      setRunning(false);
    }
  }, [open]);

  useEffect(() => {
    const off = window.api.ffmpeg.onProgress((p) => {
      setProgress({ percent: p.percent, fps: p.fps, speed: p.speed });
    });
    return off;
  }, []);

  if (!open) return null;

  const duration = Math.max(0, outSec - inSec);

  const handleExport = async () => {
    const defaultName = `${basenameNoExt(inputPath)}_${formatTime(inSec, false).replace(/:/g, '')}-${formatTime(outSec, false).replace(/:/g, '')}.mp4`;
    const output = await window.api.saveMp4(defaultName);
    if (!output) return;

    setRunning(true);
    setResult(null);
    setProgress({ percent: 0, fps: 0, speed: 0 });
    const r = await window.api.ffmpeg.export({
      input: inputPath,
      output,
      inSec,
      outSec,
      mode,
      encoder: mode === 'reencode' ? encoder : undefined,
      videoBitrateK: mode === 'reencode' ? bitrate : undefined,
    });
    setRunning(false);
    setResult({ ok: r.ok, output: r.output, message: r.message });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] bg-bg-panel border border-border rounded-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-medium">輸出 MP4</h2>
          <Button size="icon" variant="ghost" onClick={onClose} disabled={running}>
            <X size={16} />
          </Button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-sm text-neutral-400 font-mono tabular-nums">
            區段：{formatTime(inSec)} → {formatTime(outSec)}
            <span className="text-neutral-600"> （長度 {formatTime(duration)}）</span>
          </div>

          <div>
            <label className="text-xs text-neutral-400 mb-2 block">輸出模式</label>
            <div className="grid grid-cols-2 gap-2">
              <ModeCard
                active={mode === 'copy'}
                title="Stream Copy"
                desc="無損、極快。會對齊到最近的關鍵幀。"
                onClick={() => setMode('copy')}
                disabled={running}
              />
              <ModeCard
                active={mode === 'reencode'}
                title="重新編碼"
                desc="精準到影格，可選硬體加速。"
                onClick={() => setMode('reencode')}
                disabled={running}
              />
            </div>
          </div>

          {mode === 'reencode' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-400 mb-1.5 block">編碼器</label>
                <select
                  className="w-full bg-bg-subtle border border-border rounded-md h-9 px-2 text-sm"
                  value={encoder}
                  onChange={(e) => setEncoder(e.target.value)}
                  disabled={running}
                >
                  {(encoders.length ? encoders : ['libx264']).map((e) => (
                    <option key={e} value={e}>{ENCODER_LABEL[e] || e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1.5 block">
                  位元率：{bitrate.toLocaleString()} kbps
                </label>
                <input
                  type="range"
                  min={1000}
                  max={30000}
                  step={500}
                  value={bitrate}
                  onChange={(e) => setBitrate(Number(e.target.value))}
                  className="w-full accent-accent"
                  disabled={running}
                />
              </div>
            </div>
          )}

          {progress && (
            <div className="space-y-1.5">
              <div className="h-2 bg-bg-subtle rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-[width] duration-150"
                  style={{ width: `${progress.percent.toFixed(1)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-neutral-400 font-mono">
                <span>{progress.percent.toFixed(1)}%</span>
                <span>{progress.fps.toFixed(0)} fps · {progress.speed.toFixed(2)}x</span>
              </div>
            </div>
          )}

          {result && (
            <div className={cn(
              'text-sm rounded-md px-3 py-2 border',
              result.ok ? 'border-green-700 bg-green-900/30 text-green-300' : 'border-red-700 bg-red-900/30 text-red-300',
            )}>
              {result.ok ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">完成：{result.output}</span>
                  <Button size="sm" variant="ghost" onClick={() => window.api.shell.revealFile(result.output)}>
                    <FolderOpen size={14} /> 開啟
                  </Button>
                </div>
              ) : (
                <div className="whitespace-pre-wrap font-mono text-xs">失敗：{result.message}</div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          {running ? (
            <Button variant="danger" onClick={() => window.api.ffmpeg.cancel()}>取消</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>關閉</Button>
              <Button variant="primary" onClick={handleExport} disabled={duration <= 0}>
                開始輸出
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeCard({ active, title, desc, onClick, disabled }: {
  active: boolean; title: string; desc: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'text-left p-3 rounded-md border transition-colors',
        active ? 'border-accent bg-accent/10' : 'border-border bg-bg-subtle hover:border-border-strong',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      <div className="text-sm font-medium mb-1">{title}</div>
      <div className="text-xs text-neutral-400 leading-snug">{desc}</div>
    </button>
  );
}
