import { Volume2, VolumeX, Volume1 } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  disabled?: boolean;
}

export function VolumeControl({ volume, muted, onVolumeChange, onToggleMute, disabled }: Props) {
  const Icon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const display = muted ? 0 : Math.round(volume);

  return (
    <div className="flex items-center gap-2">
      <Button size="icon" variant="ghost" disabled={disabled} onClick={onToggleMute} title="靜音">
        <Icon size={16} />
      </Button>
      <input
        type="range"
        min={0}
        max={150}
        step={1}
        value={muted ? 0 : volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        disabled={disabled}
        className="w-24 accent-accent cursor-pointer disabled:cursor-not-allowed"
        title="音量"
      />
      <span className="text-xs text-neutral-400 font-mono tabular-nums w-9 text-right">
        {display}
      </span>
    </div>
  );
}
