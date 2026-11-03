import { useState } from 'react';
import { Copy, Download, Loader as Loader2, Pencil, RefreshCw, RotateCcw, Square, Trash2, Wand as Wand2, X, Zap } from 'lucide-react';
import { ASSET_DEFS, buildRefinePrompt, buildSlotPrompt, type BulkAssetType } from '../characterAssets';
import { MODEL_NANO_BANANA as MODEL, type ModelName } from '../utils/geminiApi';
import type { Variation } from '../utils/variationDb';
import { downloadDataUrl, variationFileName } from '../utils/zipService';
import { PREVIEW_BG_CLASS, PreviewBgToggle, type PreviewBg } from './PreviewBackground';
import type { StudioProps } from './studioTypes';

const QUICK_FIXES = ['顔をもっと基本イラストに似せて', '手足の崩れを直して', '線をくっきりさせて', '色を基本イラストに合わせて', '全身が収まるように小さく'];

interface VariationEditorModalProps extends StudioProps {
  variation: Variation;
  model: ModelName;
  onClose: () => void;
  onUseAsReference: (v: Variation) => void;
}

export function VariationEditorModal(props: VariationEditorModalProps) {
  const { variation: v, runner, store, promptCtx, baseImage, stamina } = props;
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState<'refine' | 'regen' | null>(null);
  const [bg, setBg] = useState<PreviewBg>('checker');
  const [label, setLabel] = useState(v.label);
  const [isRenaming, setIsRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isSlot = v.assetType !== 'custom';
  const slot = isSlot ? ASSET_DEFS[v.assetType].slots.find(s => s.key === v.slotKey) : undefined;
  const refineCost = stamina.cost(MODEL);
  const regenCost = stamina.cost(MODEL);

  const execute = async (kind: 'refine' | 'regen') => {
    setBusy(kind);
    runner.begin();
    const result = kind === 'refine'
      ? await runner.run({ model: MODEL, prompt: buildRefinePrompt(v.label, instruction, promptCtx), images: [v.image, baseImage] })
      : await runner.run({ model: MODEL, prompt: buildSlotPrompt(v.assetType as BulkAssetType, slot!, promptCtx, false), images: [baseImage] });
    if (result.ok) {
      await store.replaceImage(v.id, result.image);
      if (kind === 'refine') setInstruction('');
    }
    setBusy(null);
  };

  const saveLabel = async () => {
    await store.rename(v.id, label);
    setIsRenaming(false);
  };

  const remove = async () => {
    await store.remove(v.id);
    props.onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200" onClick={() => !busy && props.onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-green-600">{ASSET_DEFS[v.assetType].label}</p>
            {isRenaming ? (
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveLabel()}
                  autoFocus
                  maxLength={40}
                  className="border-2 border-slate-200 rounded-lg px-2 py-1 text-sm focus:border-green-500 outline-none"
                />
                <button onClick={saveLabel} className="text-xs font-bold text-white bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded-lg">保存</button>
              </div>
            ) : (
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
                {v.label}
                <button onClick={() => setIsRenaming(true)} className="p-1 rounded hover:bg-slate-100 text-slate-400" title="名前を変更">
                  <Pencil size={13} />
                </button>
              </h3>
            )}
          </div>
          <button onClick={props.onClose} disabled={!!busy} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 disabled:opacity-40" title="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="grid md:grid-cols-[1.1fr_1fr] gap-5 p-5">
          <div className="flex flex-col gap-3">
            <div className={`relative aspect-square rounded-2xl overflow-hidden border border-slate-200 ${PREVIEW_BG_CLASS[bg]}`}>
              <img src={v.image} alt={v.label} className={`w-full h-full object-contain transition-opacity ${busy ? 'opacity-40' : ''}`} />
              {busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="animate-spin text-green-600" size={36} />
                  <button onClick={runner.cancel} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow">
                    <Square size={12} fill="currentColor" /> 中止
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <PreviewBgToggle value={bg} onChange={setBg} />
              <button
                onClick={() => downloadDataUrl(v.image, variationFileName(v, 0))}
                className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full flex items-center gap-1.5"
              >
                <Download size={14} /> PNG保存
              </button>
            </div>

            {v.history.length > 0 && (
              <div className="rounded-2xl border border-slate-200 p-3">
                <p className="text-xs font-bold text-slate-500 mb-2">以前の版</p>
                <div className="flex items-center gap-2">
                  {v.history.map((h, i) => (
                    <div key={i} className={`w-14 h-14 rounded-lg border border-slate-200 overflow-hidden ${PREVIEW_BG_CLASS.checker}`}>
                      <img src={h} alt={`以前の版 ${i + 1}`} className="w-full h-full object-contain" />
                    </div>
                  ))}
                  <button
                    onClick={() => store.revert(v.id)}
                    disabled={!!busy}
                    className="ml-auto text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-full flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <RotateCcw size={14} /> 1つ前に戻す
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><Wand2 size={16} className="text-green-600" />微調整</h4>
              <textarea
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                rows={3}
                disabled={!!busy}
                placeholder="例: 右手を上げて手を振っている / 目をもう少し大きく"
                className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm focus:border-green-500 outline-none disabled:bg-slate-50"
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_FIXES.map(q => (
                  <button
                    key={q}
                    onClick={() => setInstruction(prev => (prev.trim() ? `${prev.trim()}、${q}` : q))}
                    disabled={!!busy}
                    className="text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-green-50 hover:text-green-700 px-2.5 py-1 rounded-full transition-colors"
                  >
                    + {q}
                  </button>
                ))}
              </div>
              <button
                onClick={() => execute('refine')}
                disabled={!!busy || !instruction.trim()}
                className="w-full py-2.5 rounded-full font-bold text-white bg-green-500 hover:bg-green-600 shadow text-sm flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none"
              >
                {busy === 'refine' ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                この指示で修正
                <span className="text-[11px] font-normal opacity-90 flex items-center"><Zap size={11} />{refineCost}</span>
              </button>
            </div>

            {slot && (
              <button
                onClick={() => execute('regen')}
                disabled={!!busy}
                className="w-full py-2.5 rounded-full font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 text-sm flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {busy === 'regen' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                最初から作り直す
                <span className="text-[11px] font-normal flex items-center"><Zap size={11} />{regenCost}</span>
              </button>
            )}

            <button
              onClick={() => props.onUseAsReference(v)}
              disabled={!!busy}
              className="w-full py-2.5 rounded-full font-bold text-slate-700 bg-white border-2 border-slate-200 hover:border-green-400 text-sm flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Copy size={16} /> この画像を参照して新しく作る
            </button>

            <div className="mt-auto pt-2 border-t border-slate-100">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-bold flex-1">この画像を削除しますか？</span>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">やめる</button>
                  <button onClick={remove} className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-full">削除する</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} disabled={!!busy} className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1.5 disabled:opacity-40">
                  <Trash2 size={14} /> この画像を削除
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
