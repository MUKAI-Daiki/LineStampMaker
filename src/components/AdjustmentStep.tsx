import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Film, Plus, Zap } from 'lucide-react';
import { ASSET_DEFS, ASSET_ORDER, BULK_ASSET_TYPES, slotIndex, type AssetType } from '../characterAssets';
import { MODEL_NANO_BANANA as MODEL } from '../utils/geminiApi';
import type { Variation } from '../utils/variationDb';
import { AnimationPlayer } from './AnimationPlayer';
import { NewVariationModal } from './NewVariationModal';
import { PREVIEW_BG_CLASS, PreviewBgToggle, type PreviewBg } from './PreviewBackground';
import type { StudioProps } from './studioTypes';
import { VariationEditorModal } from './VariationEditorModal';

interface AdjustmentStepProps extends StudioProps {
  onBack: () => void;
  onNext: () => void;
}

interface AnimClip {
  key: string;
  label: string;
  frames: string[];
  fps: number;
}

function buildClips(variations: Variation[]): AnimClip[] {
  return BULK_ASSET_TYPES.flatMap(type => {
    const def = ASSET_DEFS[type];
    const groups = new Map<string, { slotLabels: string[]; frames: string[] }>();
    def.slots.forEach(slot => {
      if (!slot.animGroup) return;
      const v = variations.find(x => x.assetType === type && x.slotKey === slot.key);
      if (!v) return;
      const g = groups.get(slot.animGroup) ?? { slotLabels: [], frames: [] };
      g.slotLabels.push(slot.label);
      g.frames.push(v.image);
      groups.set(slot.animGroup, g);
    });
    return [...groups.entries()]
      .filter(([, g]) => g.frames.length >= 2)
      .map(([group, g]) => ({
        key: `${type}:${group}`,
        label: `${def.label.replace('アセット', '')} ${type === 'act' ? (group === 'walk' ? '歩き' : '走り') : g.slotLabels[0].split('・')[0]}`,
        frames: g.frames.length >= 3 ? [...g.frames, ...g.frames.slice(1, -1).reverse()] : g.frames,
        fps: type === 'act' && group === 'run' ? 8 : g.frames.length >= 3 ? 6 : 3,
      }));
  });
}

export function AdjustmentStep(props: AdjustmentStepProps) {
  const { store, stamina, mode } = props;
  const easy = mode === 'easy';
  const model = MODEL;
  const [bg, setBg] = useState<PreviewBg>('checker');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newVariation, setNewVariation] = useState<{ ref?: Variation } | null>(null);
  const [showAnim, setShowAnim] = useState(true);

  const grouped = useMemo(
    () =>
      ASSET_ORDER.map(type => ({
        type,
        items: store.variations
          .filter(v => v.assetType === type)
          .sort((a, b) => slotIndex(type, a.slotKey) - slotIndex(type, b.slotKey) || a.sortOrder - b.sortOrder),
      })).filter(g => g.items.length > 0),
    [store.variations]
  );
  const clips = useMemo(() => buildClips(store.variations), [store.variations]);
  const editing = editingId ? store.variations.find(v => v.id === editingId) : undefined;

  const scrollTo = (type: AssetType) => document.getElementById(`asset-${type}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{easy ? 'えを なおしたり ふやしたりしよう' : '微調整・バリエーション追加'}</h2>
            <p className="text-sm text-slate-500 mt-1">画像をタップすると、修正・作り直し・元に戻すができます。</p>
          </div>
          <button
            onClick={() => setNewVariation({})}
            className="px-5 py-2.5 rounded-full font-bold text-white bg-green-500 hover:bg-green-600 shadow-lg hover:-translate-y-0.5 transition-all text-sm flex items-center gap-2"
          >
            <Plus size={16} /> 新しいバリエーション
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap gap-1.5">
            {grouped.map(g => (
              <button key={g.type} onClick={() => scrollTo(g.type)} className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-colors">
                {ASSET_DEFS[g.type].label} <span className="text-slate-400">{g.items.length}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 text-xs font-bold text-slate-500" title="使用モデル">
              <Zap size={12} />1回スタミナ{stamina.cost(MODEL)}消費
            </span>
            <PreviewBgToggle value={bg} onChange={setBg} />
          </div>
        </div>
      </div>

      {clips.length > 0 && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 sm:p-6">
          <button onClick={() => setShowAnim(s => !s)} className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <Film size={16} className="text-green-600" /> アニメーション確認
            <span className="text-xs font-normal text-slate-400">{showAnim ? '閉じる' : '開く'}</span>
          </button>
          {showAnim && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-4 animate-in fade-in duration-300">
              {clips.map(c => (
                <AnimationPlayer key={c.key} frames={c.frames} fps={c.fps} bgClass={PREVIEW_BG_CLASS[bg]} label={c.label} />
              ))}
            </div>
          )}
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
          <p className="text-slate-500 text-sm">まだ画像がありません。前の画面で一括生成するか、「新しいバリエーション」から作成してください。</p>
        </div>
      ) : (
        grouped.map(g => (
          <section key={g.type} id={`asset-${g.type}`} className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 sm:p-6 scroll-mt-24">
            <h3 className="font-bold text-slate-800 mb-3">
              {ASSET_DEFS[g.type].label}
              <span className="text-xs font-normal text-slate-400 ml-2">{g.items.length}枚</span>
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {g.items.map(v => (
                <button
                  key={v.id}
                  onClick={() => setEditingId(v.id)}
                  className="group text-left rounded-2xl border-2 border-slate-100 hover:border-green-400 hover:shadow-md transition-all overflow-hidden bg-white"
                >
                  <div className={`aspect-square ${PREVIEW_BG_CLASS[bg]} overflow-hidden`}>
                    <img src={v.image} alt={v.label} loading="lazy" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-600 px-2 py-1.5 truncate">
                    {v.label}
                    {v.history.length > 0 && <span className="text-green-600 ml-1">修正済</span>}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      <div className="flex justify-between gap-3">
        <button onClick={props.onBack} className="px-5 py-3 rounded-full font-bold text-slate-600 bg-white border-2 border-slate-200 hover:bg-slate-50 flex items-center gap-2 text-sm">
          <ArrowLeft size={16} /> 一括生成へ
        </button>
        <button
          onClick={props.onNext}
          disabled={store.variations.length === 0}
          className="px-6 py-3 rounded-full font-bold text-white bg-green-500 hover:bg-green-600 shadow-lg flex items-center gap-2 text-sm disabled:bg-slate-300 disabled:shadow-none"
        >
          ダウンロードへ <ArrowRight size={16} />
        </button>
      </div>

      {editing && (
        <VariationEditorModal
          {...props}
          variation={editing}
          model={model}
          onClose={() => setEditingId(null)}
          onUseAsReference={v => {
            setEditingId(null);
            setNewVariation({ ref: v });
          }}
        />
      )}

      {newVariation && (
        <NewVariationModal
          {...props}
          model={model}
          initialReference={newVariation.ref}
          onClose={() => setNewVariation(null)}
          onCreated={v => {
            setNewVariation(null);
            setEditingId(v.id);
          }}
        />
      )}
    </div>
  );
}
