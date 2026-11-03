import { useEffect, useRef, useState } from 'react';
import { Check, Eraser, Pen, Trash2, X } from 'lucide-react';

const SIZE = 512;

interface SketchPadModalProps {
  onClose: () => void;
  onDone: (dataUrl: string) => void;
}

export function SketchPadModal({ onClose, onDone }: SketchPadModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [brush, setBrush] = useState(6);

  const clear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, SIZE, SIZE);
  };

  useEffect(clear, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = point(e);
    ctx.fillStyle = tool === 'pen' ? 'black' : 'white';
    ctx.beginPath();
    ctx.arc(x, y, brush / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineWidth = brush;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'pen' ? 'black' : 'white';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onUp = () => {
    drawingRef.current = false;
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">参照用のラフを描く</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500" title="閉じる">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-slate-500 -mt-2">ポーズや構図の目安になるラフを描くと、AIが参考にします。</p>

        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="w-full aspect-square rounded-2xl border-2 border-slate-200 touch-none cursor-crosshair bg-white"
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-slate-100 rounded-full p-1">
            <button
              onClick={() => setTool('pen')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-all ${tool === 'pen' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
            >
              <Pen size={14} /> ペン
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-all ${tool === 'eraser' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
            >
              <Eraser size={14} /> 消しゴム
            </button>
          </div>
          <input
            type="range"
            min={2}
            max={30}
            value={brush}
            onChange={e => setBrush(Number(e.target.value))}
            className="w-28 accent-green-500"
            title="線の太さ"
          />
          <button onClick={clear} className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 flex items-center gap-1">
            <Trash2 size={14} /> 全消し
          </button>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm">
            キャンセル
          </button>
          <button
            onClick={() => canvasRef.current && onDone(canvasRef.current.toDataURL('image/png'))}
            className="flex-1 py-2.5 rounded-full font-bold text-white bg-green-500 hover:bg-green-600 shadow text-sm flex items-center justify-center gap-1.5"
          >
            <Check size={16} /> 参照に追加
          </button>
        </div>
      </div>
    </div>
  );
}
