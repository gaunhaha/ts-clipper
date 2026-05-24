import { useEffect, useRef } from 'react';

interface Props {
  enabled: boolean;
}

export function PlayerSurface({ enabled }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;

    const report = () => {
      if (!enabled) {
        window.api.setVideoBounds(null);
        return;
      }
      const r = el.getBoundingClientRect();
      window.api.setVideoBounds({
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    window.addEventListener('scroll', report, true);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
      window.removeEventListener('scroll', report, true);
      window.api.setVideoBounds(null);
    };
  }, [enabled]);

  return (
    <div
      ref={ref}
      className="w-full h-full bg-black flex items-center justify-center text-neutral-500"
    >
      {!enabled && <span className="text-sm">尚未載入影片</span>}
    </div>
  );
}
