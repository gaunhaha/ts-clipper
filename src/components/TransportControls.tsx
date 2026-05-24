import { Pause, Play, SkipBack, SkipForward, Scissors, Camera } from 'lucide-react';
import { Button } from './ui/button';
import { VolumeControl } from './VolumeControl';
import { formatTime } from '@/lib/format';

interface Props {
  paused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  onTogglePlay: () => void;
  onStep: (frames: number) => void;
  onSetIn: () => void;
  onSetOut: () => void;
  onScreenshot: () => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  disabled?: boolean;
}

export function TransportControls({
  paused, currentTime, duration, volume, muted,
  onTogglePlay, onStep, onSetIn, onSetOut, onScreenshot, onVolumeChange, onToggleMute,
  disabled,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button size="icon" variant="ghost" disabled={disabled} onClick={() => onStep(-1)} title="上一影格 (←)">
        <SkipBack size={16} />
      </Button>
      <Button size="icon" variant="primary" disabled={disabled} onClick={onTogglePlay} title="播放/暫停 (Space)">
        {paused ? <Play size={16} /> : <Pause size={16} />}
      </Button>
      <Button size="icon" variant="ghost" disabled={disabled} onClick={() => onStep(1)} title="下一影格 (→)">
        <SkipForward size={16} />
      </Button>

      <div className="font-mono text-sm text-neutral-300 ml-3 tabular-nums">
        {formatTime(currentTime)} <span className="text-neutral-600">/ {formatTime(duration)}</span>
      </div>

      <VolumeControl
        volume={volume}
        muted={muted}
        onVolumeChange={onVolumeChange}
        onToggleMute={onToggleMute}
        disabled={disabled}
      />

      <div className="flex-1" />

      <Button size="sm" variant="secondary" disabled={disabled} onClick={onScreenshot} title="截圖 (S)">
        <Camera size={14} /> 截圖
      </Button>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={onSetIn} title="設定入點 (I)">
        <Scissors size={14} /> 入點
      </Button>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={onSetOut} title="設定出點 (O)">
        <Scissors size={14} /> 出點
      </Button>
    </div>
  );
}
