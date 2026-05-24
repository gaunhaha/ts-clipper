import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  duration: number;
  currentTime: number;
  inSec: number | null;
  outSec: number | null;
  onSeek: (sec: number) => void;
}

export function TimelineBar({ duration, currentTime, inSec, outSec, onSeek }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

  const handle = useCallback(
    (clientX: number) => {
      if (!ref.current || duration <= 0) return;
      const r = ref.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  return (
    <div
      ref={ref}
      className={cn(
        'relative h-12 rounded-md bg-bg-subtle border border-border cursor-pointer',
        'select-none',
      )}
      onMouseDown={(e) => {
        dragging.current = true;
        handle(e.clientX);
        const onMove = (ev: MouseEvent) => dragging.current && handle(ev.clientX);
        const onUp = () => {
          dragging.current = false;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }}
    >
      {inSec !== null && outSec !== null && outSec > inSec && (
        <div
          className="absolute top-0 bottom-0 bg-accent/30 border-x border-accent"
          style={{
            left: `${pct(inSec)}%`,
            width: `${pct(outSec - inSec)}%`,
          }}
        />
      )}
      {inSec !== null && (
        <Marker pct={pct(inSec)} label="入" side="left" />
      )}
      {outSec !== null && (
        <Marker pct={pct(outSec)} label="出" side="right" />
      )}
      <div
        className="absolute top-0 bottom-0 w-px bg-white pointer-events-none"
        style={{ left: `${pct(currentTime)}%` }}
      >
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-white" />
      </div>
    </div>
  );
}

function Marker({ pct, label, side }: { pct: number; label: string; side: 'left' | 'right' }) {
  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-accent pointer-events-none"
      style={{ left: `${pct}%` }}
    >
      <div
        className={cn(
          'absolute -top-5 px-1 text-[10px] font-mono rounded-sm bg-accent text-white',
          side === 'left' ? 'left-0' : '-translate-x-full',
        )}
      >
        {label}
      </div>
    </div>
  );
}
