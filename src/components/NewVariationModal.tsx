import { useRef, useState } from 'react';
import { Check, ImagePlus, Loader as Loader2, PenLine, Plus, Sparkles, Square, X, Zap } from 'lucide-react';
import { ASSET_DEFS, ASSET_ORDER, buildNewVariationPrompt, type AssetType } from '../characterAssets';
import { MAX_REFERENCE_IMAGES, type ModelName } from '../utils/geminiApi';
import type { Variation } from '../utils/variationDb';
import { PREVIEW_BG_CLASS } from './PreviewBackground';
import { SketchPadModal } from './SketchPadModal';
import type { StudioProps } from './studioTypes';

const IDEAS = ['座って休んでいる', '手を振っている', '武器を構えている', 'ちびキャラ（2頭身）', '魔法を唱えている', '眠っている', '照れている'];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

interface ExtraRef {
  id: string;
  image: string;
  source: 'variation' | 'upload' | 'sketch';
}

interface NewVariationModalProps extends StudioProps {
  model: ModelName;
  initialReference?: Variation;
  onClose: () => void;
  onCreated: (v: Variation) => void;
}

export function NewVariationModal(props: NewVariationModalProps) {
  const { baseImage, store, runner, promptCtx, stamina, model } = props;
  const maxExtra = MAX_REFERENCE_IMAGES - 1;
  const [refs, setRefs] = useState<ExtraRef[]>(
    props.initialReference ? [{ id: props.initialReference.id, image: props.initialReference.image, source: 'variation' }] : []
  );
  const [instruction, setInstruction] = useState('');
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState<AssetType>(props.initialReference?.assetType ?? 'custom');
  const [showPicker, setShowPicker] = useState(false);
  const [showSketch, setShowSketch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canAddRef = refs.length < maxExtra;
  const existingTypes = ASSET_ORDER.filter(t => t === 'custom' || store.variations.some(v => v.assetType === t));

  const addRef = (r: ExtraRef) => {
    setRefs(prev => (prev.length >= maxExtra || prev.some(p => p.id === r.id) ? prev : [...prev, r]));
  };

  const toggleVariationRef = (v: Variation) => {
    if (refs.some(r => r.id === v.id)) setRefs(prev => prev.filter(r => r.id !== v.id));
    else addRef({ id: v.id, image: v.image, source: 'variation' });
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setUploadError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('画像ファイルを選んでください。');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('画像が大きすぎます（8MBまで）。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') addRef({ id: crypto.randomUUID(), image: reader.result, source: 'upload' });
    };
    reader.onerror = () => setUploadError('画像を読み込めませんでした。');
    reader.readAsDataURL(file);
  };

  const create = async () => {
    if (!instruction.trim()) return;
    setBusy(true);
    runner.begin();
    const result = await runner.run({
      model,
      prompt: buildNewVariationPrompt(instruction, refs.length + 1, promptCtx),
      images: [baseImage, ...refs.map(r => r.image)],
    });
    if (result.ok) {
      const inTarget = store.variations.filter(v => v.assetType === target);
      const created = await store.add({
        assetType: target,
        slotKey: `custom_${crypto.randomUUID().slice(0, 8)}`,
        label: label.trim() || instruction.trim().slice(0, 20),
        sortOrder: inTarget.reduce((m, v) => Math.max(m, v.sortOrder), 999) + 1,
        image: result.image,
      });
      if (created) {
        props.onCreated(created);
        return;
      }
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200" onClick={() => !busy && props.onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Plus size={18} className="text-green-600" />新しいバリエーションを作る</h3>
          <button onClick={props.onClose} disabled={busy} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 disabled:opacity-40" title="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">参照する画像（最大{MAX_REFERENCE_IMAGES}枚）</p>
            <div className="flex flex-wrap gap-2">
              <div className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-green-500">
                <img src={baseImage} alt="基本イラスト" className={`w-full h-full object-contain ${PREVIEW_BG_CLASS.checker}`} />
                <span className="absolute bottom-0 inset-x-0 bg-green-500 text-white text-[10px] font-bold text-center py-0.5">基本</span>
              </div>
              {refs.map(r => (
                <div key={r.id} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-slate-200 group">
                  <img src={r.image} alt="参照画像" className={`w-full h-full object-contain ${r.source === 'variation' ? PREVIEW_BG_CLASS.checker : 'bg-white'}`} />
                  <button
                    onClick={() => setRefs(prev => prev.filter(p => p.id !== r.id))}
                    disabled={busy}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-red-500 text-white rounded-full p-0.5 transition-colors"
                    title="参照から外す"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {canAddRef && !busy && (
                <>
                  <button onClick={() => setShowPicker(s => !s)} className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-green-400 hover:bg-green-50 text-slate-500 text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-colors">
                    <Sparkles size={18} />生成画像
                  </button>
                  <button onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-green-400 hover:bg-green-50 text-slate-500 text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-colors">
                    <ImagePlus size={18} />画像を追加
                  </button>
                  <button onClick={() => setShowSketch(true)} className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-green-400 hover:bg-green-50 text-slate-500 text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-colors">
                    <PenLine size={18} />ラフを描く
                  </button>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
            </div>
            {uploadError && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}

            {showPicker && (
              <div className="mt-3 rounded-2xl border border-slate-200 p-3 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                {store.variations.length === 0 ? (
                  <p className="text-xs text-slate-500">まだ生成画像がありません。</p>
                ) : (
                  <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
                    {store.variations.map(v => {
                      const selected = refs.some(r => r.id === v.id);
                      return (
                        <button
                          key={v.id}
                          onClick={() => toggleVariationRef(v)}
                          disabled={!selected && !canAddRef}
                          title={`${ASSET_DEFS[v.assetType].label} / ${v.label}`}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all disabled:opacity-30 ${selected ? 'border-green-500' : 'border-transparent hover:border-slate-300'} ${PREVIEW_BG_CLASS.checker}`}
                        >
                          <img src={v.image} alt={v.label} className="w-full h-full object-contain" />
                          {selected && <span className="absolute top-0.5 right-0.5 bg-green-500 text-white rounded-full p-0.5"><Check size={10} strokeWidth={3} /></span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">どんな画像を作る？</p>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              rows={3}
              disabled={busy}
              placeholder="例: 2枚目の画像と同じポーズで、左向きに剣を振り下ろしている"
              className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm focus:border-green-500 outline-none disabled:bg-slate-50"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {IDEAS.map(idea => (
                <button
                  key={idea}
                  onClick={() => setInstruction(idea)}
                  disabled={busy}
                  className="text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-green-50 hover:text-green-700 px-2.5 py-1 rounded-full transition-colors"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-500">名前（ファイル名に使います）</span>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                maxLength={40}
                disabled={busy}
                placeholder="例: 剣攻撃"
                className="border-2 border-slate-200 rounded-xl p-2.5 text-sm focus:border-green-500 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-500">追加先</span>
              <select
                value={target}
                onChange={e => setTarget(e.target.value as AssetType)}
                disabled={busy}
                className="border-2 border-slate-200 rounded-xl p-2.5 text-sm focus:border-green-500 outline-none bg-white"
              >
                {existingTypes.map(t => <option key={t} value={t}>{ASSET_DEFS[t].label}</option>)}
              </select>
            </label>
          </div>

          <div className="flex gap-3">
            {busy ? (
              <button onClick={runner.cancel} className="flex-1 py-3 rounded-full font-bold text-white bg-red-500 hover:bg-red-600 shadow text-sm flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> 生成中…（押すと中止） <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={create}
                disabled={!instruction.trim()}
                className="flex-1 py-3 rounded-full font-bold text-white bg-green-500 hover:bg-green-600 shadow-lg text-sm flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none"
              >
                <Sparkles size={16} /> 生成して追加
                <span className="text-[11px] font-normal flex items-center"><Zap size={11} />{stamina.cost(model)}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {showSketch && (
        <SketchPadModal
          onClose={() => setShowSketch(false)}
          onDone={img => {
            addRef({ id: crypto.randomUUID(), image: img, source: 'sketch' });
            setShowSketch(false);
          }}
        />
      )}
    </div>
  );
}
