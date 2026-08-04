import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { FolderOpen, Download, FolderOpen as FolderIcon } from 'lucide-react';
import { Button } from './components/ui/button';
import { PlayerSurface } from './components/PlayerSurface';
import { TimelineBar } from './components/TimelineBar';
import { TransportControls } from './components/TransportControls';
import { ExportDialog } from './components/ExportDialog';
import { formatTime, basenameNoExt } from './lib/format';

const TS_EXTENSIONS = ['.ts', '.m2ts', '.mts'];

function isTsPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return TS_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [mpvReady, setMpvReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [paused, setPaused] = useState(true);
  const [volume, setVolume] = useState<number>(() => {
    const saved = Number(localStorage.getItem('ts-clipper.volume'));
    return Number.isFinite(saved) && saved >= 0 ? saved : 80;
  });
  const [muted, setMuted] = useState(false);
  const [inSec, setInSec] = useState<number | null>(null);
  const [outSec, setOutSec] = useState<number | null>(null);
  const [encoders, setEncoders] = useState<string[]>([]);
  const [showExport, setShowExport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; path?: string } | null>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const fileDragDepth = useRef(0);

  useEffect(() => {
    return window.api.mpv.onEvent((evt) => {
      switch (evt.type) {
        case 'time-pos':
          if (evt.value !== null) setCurrentTime(evt.value);
          break;
        case 'duration':
          if (evt.value !== null) setDuration(evt.value);
          break;
        case 'pause':
          setPaused(evt.value);
          break;
        case 'volume':
          setVolume(evt.value);
          localStorage.setItem('ts-clipper.volume', String(evt.value));
          break;
        case 'mute':
          setMuted(evt.value);
          break;
        case 'error':
          setError(evt.message);
          break;
      }
    });
  }, []);

  const loadTsFile = useCallback(async (p: string) => {
    setShowExport(false);
    setError(null);
    setInSec(null);
    setOutSec(null);
    setCurrentTime(0);
    setDuration(0);
    setMpvReady(false);
    setFilePath(p);
    try {
      const probe = await window.api.ffmpeg.probe(p);
      setDuration(probe.duration);
      setEncoders(probe.encoders);
      await window.api.mpv.load(p);
      await window.api.mpv.setProperty('volume', volume);
      setMpvReady(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    }
  }, [volume]);

  const openFile = useCallback(async () => {
    const p = await window.api.openTs();
    if (!p) return;
    await loadTsFile(p);
  }, [loadTsFile]);

  const resetFileDrag = useCallback(() => {
    fileDragDepth.current = 0;
    setFileDragActive(false);
  }, []);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (![...e.dataTransfer.types].includes('Files')) return;
    fileDragDepth.current += 1;
    setFileDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileDragDepth.current -= 1;
    if (fileDragDepth.current <= 0) resetFileDrag();
  }, [resetFileDrag]);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if ([...e.dataTransfer.types].includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resetFileDrag();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const p = window.api.getPathForFile(file);
    if (!p) {
      setError('無法取得檔案路徑');
      return;
    }
    if (!isTsPath(p)) {
      setError('請拖入 .ts / .m2ts / .mts 檔案');
      return;
    }
    await loadTsFile(p);
  }, [loadTsFile, resetFileDrag]);

  const changeVolume = useCallback(async (v: number) => {
    const clamped = Math.max(0, Math.min(150, v));
    setVolume(clamped);
    localStorage.setItem('ts-clipper.volume', String(clamped));
    if (mpvReady) await window.api.mpv.setProperty('volume', clamped);
  }, [mpvReady]);

  const toggleMute = useCallback(async () => {
    if (!mpvReady) {
      setMuted((m) => !m);
      return;
    }
    await window.api.mpv.setProperty('mute', !muted);
  }, [mpvReady, muted]);

  const takeScreenshot = useCallback(async () => {
    if (!mpvReady || !filePath) return;
    const stamp = formatTime(currentTime).replace(/[:.]/g, '-');
    const defaultName = `${basenameNoExt(filePath)}_${stamp}.png`;
    const dest = await window.api.saveImage(defaultName);
    if (!dest) return;
    try {
      const saved = await window.api.mpv.screenshot(dest);
      setToast({ message: '已存截圖', path: saved });
    } catch (e: any) {
      setToast({ message: `截圖失敗：${e?.message || e}` });
    }
  }, [mpvReady, filePath, currentTime]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const togglePlay = useCallback(async () => {
    if (!mpvReady) return;
    await window.api.mpv.setProperty('pause', !paused);
  }, [mpvReady, paused]);

  const seek = useCallback(async (sec: number) => {
    if (!mpvReady) return;
    await window.api.mpv.command(['seek', sec, 'absolute', 'exact']);
  }, [mpvReady]);

  const step = useCallback(async (frames: number) => {
    if (!mpvReady) return;
    await window.api.mpv.command([frames > 0 ? 'frame-step' : 'frame-back-step']);
  }, [mpvReady]);

  const setIn = useCallback(() => {
    if (!mpvReady) return;
    setInSec(currentTime);
    if (outSec !== null && currentTime >= outSec) setOutSec(null);
  }, [mpvReady, currentTime, outSec]);

  const setOut = useCallback(() => {
    if (!mpvReady) return;
    setOutSec(currentTime);
    if (inSec !== null && currentTime <= inSec) setInSec(null);
  }, [mpvReady, currentTime, inSec]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) seek(Math.max(0, currentTime - 5));
          else step(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) seek(Math.min(duration, currentTime + 5));
          else step(1);
          break;
        case 'i':
        case 'I':
          setIn();
          break;
        case 'o':
        case 'O':
          setOut();
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(volume + 5);
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(volume - 5);
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 's':
        case 'S':
          takeScreenshot();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, step, setIn, setOut, changeVolume, toggleMute, takeScreenshot, currentTime, duration, volume]);

  const canExport = filePath !== null && inSec !== null && outSec !== null && outSec > inSec;
  const selDuration = inSec !== null && outSec !== null ? Math.max(0, outSec - inSec) : 0;

  return (
    <div
      className="h-full flex flex-col relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header className="flex items-center gap-3 px-4 h-12 border-b border-border bg-bg-panel">
        <div className="font-medium text-sm">TS Clipper</div>
        {filePath && (
          <div className="text-xs text-neutral-500 truncate max-w-[50%]" title={filePath}>
            {filePath}
          </div>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={openFile}>
          <FolderOpen size={14} /> 開啟 TS
        </Button>
        <Button size="sm" variant="primary" disabled={!canExport} onClick={() => setShowExport(true)}>
          <Download size={14} /> 輸出 MP4
        </Button>
      </header>

      <main className="flex-1 min-h-0 bg-black">
        <PlayerSurface enabled={!!filePath && !showExport} />
      </main>

      <section className="border-t border-border bg-bg-panel px-4 py-3 space-y-3">
        <TransportControls
          paused={paused}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          muted={muted}
          onTogglePlay={togglePlay}
          onStep={step}
          onSetIn={setIn}
          onSetOut={setOut}
          onScreenshot={takeScreenshot}
          onVolumeChange={changeVolume}
          onToggleMute={toggleMute}
          disabled={!mpvReady}
        />

        <TimelineBar
          duration={duration}
          currentTime={currentTime}
          inSec={inSec}
          outSec={outSec}
          onSeek={seek}
        />

        <div className="flex items-center gap-4 text-xs text-neutral-400 font-mono tabular-nums">
          <span>入點：{inSec !== null ? formatTime(inSec) : '—'}</span>
          <span>出點：{outSec !== null ? formatTime(outSec) : '—'}</span>
          <span>長度：{selDuration > 0 ? formatTime(selDuration) : '—'}</span>
          <div className="flex-1" />
          <span className="text-neutral-600">Space 播放／I O 入出點／← → 影格／↑ ↓ 音量／M 靜音／S 截圖</span>
        </div>

        {error && (
          <div className="text-xs text-red-400 font-mono">{error}</div>
        )}
      </section>

      <ExportDialog
        open={showExport}
        inputPath={filePath || ''}
        inSec={inSec || 0}
        outSec={outSec || 0}
        encoders={encoders}
        onClose={() => setShowExport(false)}
      />

      {fileDragActive && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/55 border-2 border-dashed border-sky-400/80">
          <div className="rounded-md bg-bg-panel/95 border border-border px-6 py-4 text-center shadow-xl">
            <div className="text-sm text-neutral-100">放開以開啟檔案</div>
            <div className="mt-1 text-xs text-neutral-500">支援 .ts / .m2ts / .mts</div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-bg-panel border border-border rounded-md shadow-xl px-4 py-2.5 text-sm flex items-center gap-3 max-w-[80%]">
          <span className="text-neutral-200">{toast.message}</span>
          {toast.path && (
            <>
              <span className="text-neutral-500 font-mono text-xs truncate max-w-[420px]">{toast.path}</span>
              <Button size="sm" variant="ghost" onClick={() => window.api.shell.revealFile(toast.path!)}>
                <FolderIcon size={14} /> 開啟
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
