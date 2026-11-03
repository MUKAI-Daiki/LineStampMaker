import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop, Loader as Loader2, ScanLine, Sparkles, Square, X, Zap } from 'lucide-react';
import type { Mode } from '../characterAssets';
import { MODEL_NANO_BANANA as MODEL_STANDARD, type GenerationRunner } from '../utils/geminiApi';
import { AI_LINE_ART_PROMPT, cleanLineArt, cropToCanvas, extractLineArtLocal, loadImage, type CropRect } from '../utils/lineArtExtraction';
import type { StaminaInfo } from './studioTypes';

type Method = 'local' | 'ai';

interface LineArtExtractModalProps {
  source: string;
  mode: Mode;
  runner: GenerationRunner;
  stamina: StaminaInfo;
  onCancel: () => void;
  onConfirm: (lineArt: string) => void;
}

const AI_INPUT_MAX_SIZE = 1536;

function imageBounds(container: HTMLElement, natW: number, natH: number) {
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const scale = Math.min(cw / natW, ch / natH);
  const w = natW * scale;
  const h = natH * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

export function LineArtExtractModal({ source, mode, runner, stamina, onCancel, onConfirm }: LineArtExtractModalProps) {
  const easy = mode === 'easy';
  const [srcImg, setSrcImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [method, setMethod] = useState<Method>('local');
  const [contrast, setContrast] = useState(120);
  const [brightness, setBrightness] = useState(105);
  const [sensitivity, setSensitivity] = useState(60);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [committedCrop, setCommittedCrop] = useState<CropRect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [aiResult, setAiResult] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadImage(source).then(img => alive && setSrcImg(img)).catch(() => alive && setLoadError(true));
    return () => { alive = false; };
  }, [source]);

  const workCanvas = useMemo(() => (srcImg ? cropToCanvas(srcImg, committedCrop) : null), [srcImg, committedCrop]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (method === 'local') setPreview(workCanvas ? extractLineArtLocal(workCanvas, { contrast, brightness }, sensitivity) : null);
      else setPreview(aiResult ? cleanLineArt(aiResult, { contrast, brightness }) : null);
    }, 60);
    return () => clearTimeout(t);
  }, [method, workCanvas, aiResult, contrast, brightness, sensitivity]);

  const toImageCoords = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container || !srcImg) return null;
    const rect = container.getBoundingClientRect();
    const b = imageBounds(container, srcImg.naturalWidth, srcImg.naturalHeight);
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left - b.x) / b.w)),
      y: Math.max(0, Math.min(1, (clientY - rect.top - b.y) / b.h)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    const c = toImageCoords(e.clientX, e.clientY);
    if (!c) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = c;
    setCrop({ x1: c.x, y1: c.y, x2: c.x, y2: c.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStart.current;
    if (!start) return;
    const c = toImageCoords(e.clientX, e.clientY);
    if (c) setCrop({ x1: start.x, y1: start.y, x2: c.x, y2: c.y });
  };

  const commitCrop = (next: CropRect | null) => {
    setCrop(next);
    setCommittedCrop(next);
    setAiResult(null);
  };

  const onPointerUp = () => {
    if (!dragStart.current) return;
    dragStart.current = null;
    const tooSmall = !crop || Math.abs(crop.x2 - crop.x1) < 0.03 || Math.abs(crop.y2 - crop.y1) < 0.03;
    commitCrop(tooSmall ? committedCrop : crop);
  };

  const runAi = async () => {
    if (!srcImg) return;
    setBusy(true);
    setAiError(null);
    runner.begin();
    const input = cropToCanvas(srcImg, committedCrop, AI_INPUT_MAX_SIZE).toDataURL('image/png');
    const result = await runner.run({ model: MODEL_STANDARD, prompt: AI_LINE_ART_PROMPT, images: [input], rawOutput: true });
    if (result.ok) {
      try {
        setAiResult(await loadImage(result.image));
        setContrast(100);
        setBrightness(100);
      } catch {
        setAiError(easy ? 'うまく よみこめなかったよ' : 'AIの結果を読み込めませんでした。');
      }
    } else if (result.reason === 'stamina') {
      setAiError(easy ? 'スタミナがたりないよ' : `スタミナが足りません（必要: ${stamina.cost(MODEL_STANDARD)}）。`);
    } else if (result.reason === 'failed') {
      setAiError(easy ? 'うまく できなかったよ。もういちど ためしてね' : 'AI抽出に失敗しました。もう一度お試しいただくか、端末内処理をご利用ください。');
    }
    setBusy(false);
  };

  const cropOverlay = (() => {
    const container = containerRef.current;
    if (!crop || !container || !srcImg) return null;
    const b = imageBounds(container, srcImg.naturalWidth, srcImg.naturalHeight);
    const left = b.x + Math.min(crop.x1, crop.x2) * b.w;
    const top = b.y + Math.min(crop.y1, crop.y2) * b.h;
    const width = Math.abs(crop.x2 - crop.x1) * b.w;
    const height = Math.abs(crop.y2 - crop.y1) * b.h;
    return (
      <div
        className="absolute pointer-events-none border-2 border-white rounded-sm"
        style={{ left, top, width, height, boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }}
      >
        {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy]) => (
          <div
            key={`${cx}-${cy}`}
            className="absolute w-3 h-3 bg-white border-2 border-green-500 rounded-sm"
            style={{ left: cx ? 'auto' : -6, right: cx ? -6 : 'auto', top: cy ? 'auto' : -6, bottom: cy ? -6 : 'auto' }}
          />
        ))}
      </div>
    );
  })();

  const slider = (label: string, value: number, set: (v: number) => void, min: number, max: number, low: string, high: string, accent: string, suffix = '%') => (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className={`font-bold text-gray-700 ${easy ? 'text-sm' : 'text-xs'}`}>{label}</span>
        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">{value}{suffix}</span>
      </div>
      <div className="flex items-center gap-3 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
        <span className="text-xs text-gray-400 shrink-0">{low}</span>
        <input type="range" min={min} max={max} value={value} disabled={busy} onChange={e => set(Number(e.target.value))} className={`w-full cursor-pointer ${accent}`} />
        <span className="text-xs text-gray-400 shrink-0">{high}</span>
      </div>
    </div>
  );

  const methodButton = (m: Method, icon: React.ReactNode, title: string, desc: string) => (
    <button
      onClick={() => setMethod(m)}
      disabled={busy}
      className={`flex-1 text-left rounded-2xl border-2 p-3 transition-all ${method === m ? 'border-green-500 bg-green-50 shadow-sm' : 'border-gray-200 hover:border-green-300 bg-white'}`}
    >
      <span className={`flex items-center gap-1.5 font-bold ${method === m ? 'text-green-700' : 'text-gray-700'} ${easy ? 'text-base' : 'text-sm'}`}>
        {icon}{title}
      </span>
      <span className="block text-[11px] text-gray-500 mt-1 leading-snug">{desc}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 sm:p-6 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto relative">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className={`font-bold text-gray-800 flex items-center gap-2 ${easy ? 'text-xl' : 'text-lg'}`}>
              <ScanLine size={20} className="text-green-600" />{easy ? 'せんを とりだす' : '線画抽出'}
            </h3>
            <p className={`text-gray-500 ${easy ? 'text-sm' : 'text-xs'}`}>
              {easy ? 'えから せんだけを とりだして キャンバスに のせるよ' : '取り込んだ画像から線だけを取り出し、キャンバスに配置します'}
            </p>
          </div>
          <button onClick={onCancel} disabled={busy} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-40" title="閉じる">
            <X size={22} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className={`font-bold text-gray-500 flex items-center gap-1 ${easy ? 'text-xs' : 'text-[11px]'}`}>
                  <Crop size={13} />
                  {committedCrop ? (easy ? 'きりぬきON' : 'トリミング範囲あり') : (easy ? 'もとのえ（ドラッグできりぬき）' : '元画像（ドラッグで範囲指定）')}
                </span>
                {committedCrop && !busy && (
                  <button onClick={() => commitCrop(null)} className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors">
                    <X size={13} />{easy ? 'リセット' : 'トリミング解除'}
                  </button>
                )}
              </div>
              <div
                ref={containerRef}
                className="w-full aspect-square bg-slate-100 rounded-2xl overflow-hidden border-2 border-gray-200 relative select-none"
                style={{ touchAction: 'none', cursor: busy ? 'default' : 'crosshair' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img src={source} alt="元画像" className="w-full h-full object-contain pointer-events-none" />
                {cropOverlay}
              </div>
            </div>

            <div>
              <span className={`font-bold text-gray-500 flex items-center gap-1 mb-2 h-[18px] ${easy ? 'text-xs' : 'text-[11px]'}`}>
                <Check size={13} />{easy ? 'とりだした せん' : '抽出結果（キャンバスに配置されます）'}
              </span>
              <div className="w-full aspect-square bg-white rounded-2xl overflow-hidden border-2 border-gray-200 relative flex items-center justify-center">
                {loadError ? (
                  <p className="text-sm text-red-600 px-6 text-center">{easy ? 'えを よみこめなかったよ' : '画像を読み込めませんでした。別の画像をお試しください。'}</p>
                ) : busy ? (
                  <div className="flex flex-col items-center gap-3 text-green-700">
                    <Loader2 size={32} className="animate-spin" />
                    <span className="text-sm font-bold">{easy ? 'AIが せんを かいているよ…' : 'AIが線画を抽出しています…'}</span>
                  </div>
                ) : method === 'ai' && !aiResult ? (
                  <div className="flex flex-col items-center gap-3 px-6 text-center">
                    <Sparkles size={28} className="text-green-500" />
                    <p className="text-sm text-gray-600">{easy ? 'したの ボタンで AIに せんを とりだしてもらおう' : '下のボタンでAIによる線画抽出を実行します'}</p>
                  </div>
                ) : preview ? (
                  <img src={preview} alt="抽出結果" className="w-full h-full object-contain animate-in fade-in duration-200" />
                ) : (
                  <Loader2 size={28} className="animate-spin text-gray-300" />
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {methodButton('local', <ScanLine size={16} />, easy ? 'すぐに とりだす' : '自動抽出（端末内処理）', easy ? 'スタミナを つかわないよ。えんぴつの えに ぴったり' : 'スタミナ消費なし。紙に描いた鉛筆・ペン画の取り込みに最適')}
            {methodButton('ai', <Sparkles size={16} />, easy ? 'AIで きれいに とりだす' : 'AI抽出（Nanobanana2）', easy ? 'いろつきの えや しゃしんでも せんを とりだせるよ' : '色付きイラストや写真からも、主線だけをきれいに抽出')}
          </div>

          {method === 'ai' && (
            <div className="flex flex-col gap-2">
              {busy ? (
                <button onClick={runner.cancel} className="w-full py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 shadow text-sm flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />{easy ? 'とりだしちゅう…（おすと やめる）' : '抽出中…（押すと中止）'}<Square size={12} fill="currentColor" />
                </button>
              ) : (
                <button onClick={runAi} disabled={!srcImg} className="w-full py-3 rounded-xl font-bold text-white bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/20 transition-transform active:scale-[0.98] text-sm flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none">
                  <Sparkles size={16} />
                  {aiResult ? (easy ? 'もういちど AIで とりだす' : 'もう一度AIで抽出') : (easy ? 'AIで とりだす' : 'AIで線画を抽出')}
                  {!stamina.unlimited && <span className="text-[11px] font-normal flex items-center"><Zap size={11} />{stamina.cost(MODEL_STANDARD)}</span>}
                </button>
              )}
              {aiError && <p className="text-xs text-red-600">{aiError}</p>}
            </div>
          )}

          <div className={`grid gap-3 ${method === 'local' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {slider(easy ? 'せんの こさ' : 'コントラスト', contrast, setContrast, 50, 300, easy ? 'うすい' : '低', easy ? 'こい' : '高', 'accent-green-500')}
            {slider(easy ? 'あかるさ' : '明度', brightness, setBrightness, 50, 250, easy ? 'くらい' : '低', easy ? 'あかるい' : '高', 'accent-blue-500')}
            {method === 'local' &&
              slider(easy ? 'せんの ひろいかた' : '線の拾いやすさ', sensitivity, setSensitivity, 0, 100, easy ? 'すくなめ' : '少', easy ? 'おおめ' : '多', 'accent-amber-500', '')}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={busy}
              className={`flex-1 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 ${easy ? 'py-3.5 text-base' : 'py-3 text-sm'}`}
            >
              {easy ? 'やめる' : 'キャンセル'}
            </button>
            <button
              onClick={() => preview && onConfirm(preview)}
              disabled={!preview || busy || (method === 'ai' && !aiResult)}
              className={`flex-[2] rounded-xl font-bold text-white bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30 transition-transform active:scale-95 flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none ${easy ? 'py-3.5 text-lg' : 'py-3 text-sm'}`}
            >
              <Check size={18} />{easy ? 'キャンバスに のせる' : 'キャンバスに配置して修正へ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
