import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';

interface AnimationPlayerProps {
  frames: string[];
  fps: number;
  bgClass: string;
  label?: string;
  className?: string;
}

export function AnimationPlayer({ frames, fps, bgClass, label, className = '' }: AnimationPlayerProps) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = setInterval(() => setFrame(f => (f + 1) % frames.length), 1000 / fps);
    return () => clearInterval(id);
  }, [playing, fps, frames.length]);

  const current = frames.length > 0 ? frames[frame % frames.length] : null;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => setPlaying(p => !p)}
        className={`group relative aspect-square w-full rounded-xl overflow-hidden border border-slate-200 ${bgClass}`}
        title={playing ? '一時停止' : '再生'}
      >
        {current ? (
          <img src={current} alt={label ?? 'アニメーション'} className="w-full h-full object-contain" />
        ) : (
          <span className="text-xs text-slate-400">コマがありません</span>
        )}
        <span className="absolute bottom-1.5 right-1.5 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {playing ? <Pause size={12} /> : <Play size={12} />}
        </span>
      </button>
      {label && (
        <p className="text-center text-xs font-bold text-slate-600">
          {label}
          <span className="ml-1 font-normal text-slate-400">{frames.length}コマ</span>
        </p>
      )}
    </div>
  );
}
