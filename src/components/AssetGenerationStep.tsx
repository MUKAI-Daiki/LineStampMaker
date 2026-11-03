import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Layers, Loader as Loader2, Sparkles, Square, Zap } from 'lucide-react';
import { ASSET_DEFS, BULK_ASSET_TYPES, buildSlotPrompt, type AssetSlot, type BulkAssetType } from '../characterAssets';
import { MODEL_NANO_BANANA } from '../utils/geminiApi';
import type { Variation } from '../utils/variationDb';
import { PREVIEW_BG_CLASS, PreviewBgToggle, type PreviewBg } from './PreviewBackground';
import type { StudioProps } from './studioTypes';

interface AssetGenerationStepProps extends StudioProps {
  selectedAssets: BulkAssetType[];
  onSelectedAssetsChange: (v: BulkAssetType[]) => void;
  freeText: string;
  onFreeTextChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

interface Job {
  type: BulkAssetType;
  slot: AssetSlot;
}

const jobKey = (type: string, slotKey: string) => `${type}:${slotKey}`;

export function AssetGenerationStep(props: AssetGenerationStepProps) {
  const { baseImage, promptCtx, runner, store, stamina, mode, selectedAssets, onSelectedAssetsChange } = props;
  const [regenerateExisting, setRegenerateExisting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string | null } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [bg, setBg] = useState<PreviewBg>('checker');
  const generatedRef = useRef(new Map<string, string>());

  const bySlot = useMemo(() => {
    const map = new Map<string, Variation>();
    store.variations.forEach(v => {
      if (v.assetType !== 'custom') map.set(jobKey(v.assetType, v.slotKey), v);
    });
    return map;
  }, [store.variations]);

  const jobs: Job[] = useMemo(
    () => selectedAssets
      .flatMap(type => ASSET_DEFS[type].slots.map(slot => ({ type, slot })))
      .filter(j => regenerateExisting || !bySlot.has(jobKey(j.type, j.slot.key))),
    [selectedAssets, regenerateExisting, bySlot]
  );

  const unitCost = stamina.cost(MODEL_NANO_BANANA);
  const totalCost = jobs.length * unitCost;
  const affordable = stamina.unlimited || stamina.remaining >= totalCost;

  const toggleAsset = (type: BulkAssetType) => {
    if (isRunning) return;
    onSelectedAssetsChange(
      selectedAssets.includes(type)
        ? selectedAssets.filter(t => t !== type)
        : BULK_ASSET_TYPES.filter(t => t === type || selectedAssets.includes(t))
    );
  };

  const previousFrame = (job: Job): string | null => {
    if (!job.slot.animGroup) return null;
    const group = ASSET_DEFS[job.type].slots.filter(s => s.animGroup === job.slot.animGroup);
    const idx = group.findIndex(s => s.key === job.slot.key);
    if (idx <= 0) return null;
    const prevKey = jobKey(job.type, group[idx - 1].key);
    return generatedRef.current.get(prevKey) ?? bySlot.get(prevKey)?.image ?? null;
  };

  const runBulk = async () => {
    if (jobs.length === 0) return;
    const queue = [...jobs];
    generatedRef.current = new Map();
    setFailed([]);
    setIsRunning(true);
    runner.begin();
    const failedLabels: string[] = [];

    for (let i = 0; i < queue.length; i++) {
      const job = queue[i];
      const key = jobKey(job.type, job.slot.key);
      setProgress({ done: i, total: queue.length, current: key });

      const prev = previousFrame(job);
      const result = await runner.run({
        model: MODEL_NANO_BANANA,
        prompt: buildSlotPrompt(job.type, job.slot, promptCtx, !!prev),
        images: prev ? [baseImage, prev] : [baseImage],
      });

      if (!result.ok) {
        if (result.reason !== 'failed') break;
        failedLabels.push(`${ASSET_DEFS[job.type].label} / ${job.slot.label}`);
        continue;
      }

      generatedRef.current.set(key, result.image);
      const existing = bySlot.get(key);
      if (existing) {
        await store.replaceImage(existing.id, result.image);
      } else {
        await store.add({
          assetType: job.type,
          slotKey: job.slot.key,
          label: job.slot.label,
          sortOrder: ASSET_DEFS[job.type].slots.indexOf(job.slot),
          image: result.image,
        });
      }
    }

    setFailed(failedLabels);
    setProgress(null);
    setIsRunning(false);
  };

  const hasAnyGenerated = store.variations.length > 0;
  const easy = mode === 'easy';

  return (
    <div className="flex flex-col gap-5 animate-in slide-in-from-right duration-300">
      <div className="text-center">
        <h2 className="text-lg font-bold text-slate-800">{easy ? 'ゲームでつかう えを まとめてつくろう' : 'アセットを選んで一括生成'}</h2>
        <p className="text-xs text-slate-500 mt-1">基本イラストのキャラクターから、ゲーム用のバリエーションをまとめて作ります。</p>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-5">
        <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-4 h-fit lg:sticky lg:top-24">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">基本イラスト</p>
            <div className={`aspect-square rounded-xl overflow-hidden border border-slate-200 ${PREVIEW_BG_CLASS.checker}`}>
              <img src={baseImage} alt="基本イラスト" className="w-full h-full object-contain" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-slate-500">作るアセット</p>
            {BULK_ASSET_TYPES.map(type => {
              const def = ASSET_DEFS[type];
              const on = selectedAssets.includes(type);
              const doneCount = def.slots.filter(s => bySlot.has(jobKey(type, s.key))).length;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleAsset(type)}
                  disabled={isRunning}
                  className={`text-left rounded-xl border-2 p-3 transition-all disabled:cursor-not-allowed ${
                    on ? 'border-green-500 bg-green-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-slate-800">{def.label}</span>
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${on ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300'}`}>
                      {on && <Check size={13} strokeWidth={3} />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{def.description}</p>
                  <p className="text-[11px] font-bold mt-1.5 text-slate-400">
                    {def.slots.length}枚
                    {doneCount > 0 && <span className="text-green-600 ml-2">生成済み {doneCount}/{def.slots.length}</span>}
                  </p>
                </button>
              );
            })}
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">全体への追加指示（任意）</p>
            <textarea
              value={props.freeText}
              onChange={e => props.onFreeTextChange(e.target.value)}
              disabled={isRunning}
              rows={2}
              placeholder="例: 剣を腰に下げている / ドット絵風に"
              className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm focus:border-green-500 outline-none disabled:bg-slate-50"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={regenerateExisting}
              onChange={e => setRegenerateExisting(e.target.checked)}
              disabled={isRunning}
              className="accent-green-500 w-4 h-4"
            />
            生成済みの画像も作り直す
          </label>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs flex flex-col gap-1">
            <div className="flex justify-between"><span className="text-slate-500">生成枚数</span><span className="font-bold text-slate-800">{jobs.length}枚</span></div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 flex items-center gap-1"><Zap size={12} />必要スタミナ</span>
              <span className={`font-bold ${affordable ? 'text-slate-800' : 'text-red-600'}`}>
                {stamina.unlimited ? `${totalCost}（無制限）` : `${totalCost} / 残り ${stamina.remaining}`}
              </span>
            </div>
            {!affordable && <p className="text-red-600 mt-1 leading-relaxed">スタミナが足りないため一括生成できません（1時間に1回復）。</p>}
            <p className="text-slate-400 mt-1">1枚あたりスタミナ2を消費します。</p>
          </div>

          {isRunning ? (
            <button
              onClick={runner.cancel}
              className="w-full py-3 rounded-full font-bold text-white bg-red-500 hover:bg-red-600 shadow flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Square size={14} fill="currentColor" /> 生成を中止
            </button>
          ) : (
            <button
              onClick={runBulk}
              disabled={jobs.length === 0 || !affordable}
              className="w-full py-3 rounded-full font-bold text-white bg-green-500 hover:bg-green-600 shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed"
            >
              <Sparkles size={18} /> {jobs.length === 0 ? '生成する画像がありません' : `${jobs.length}枚を一括生成`}
            </button>
          )}
        </aside>

        <section className="flex flex-col gap-4 min-w-0">
          {progress && (
            <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-4">
              <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin text-green-500" />生成中…</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {failed.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              <p className="font-bold mb-1">{failed.length}枚の生成に失敗しました</p>
              <p className="text-xs leading-relaxed">{failed.join('、')}</p>
              <p className="text-xs mt-2">もう一度「一括生成」を押すと、まだ作れていない画像だけを生成します。</p>
            </div>
          )}

          <div className="flex justify-end">
            <PreviewBgToggle value={bg} onChange={setBg} />
          </div>

          {selectedAssets.length === 0 && !hasAnyGenerated && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500 text-sm">
              <Layers className="mx-auto mb-3 text-slate-300" size={40} />
              左から作りたいアセットを選んでください。
            </div>
          )}

          {BULK_ASSET_TYPES.filter(t => selectedAssets.includes(t) || ASSET_DEFS[t].slots.some(s => bySlot.has(jobKey(t, s.key)))).map(type => (
            <div key={type} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="font-bold text-slate-800 text-sm mb-3">{ASSET_DEFS[type].label}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-2">
                {ASSET_DEFS[type].slots.map(slot => {
                  const key = jobKey(type, slot.key);
                  const v = bySlot.get(key);
                  const active = progress?.current === key;
                  return (
                    <div key={slot.key} className="flex flex-col gap-1">
                      <div className={`relative aspect-square rounded-lg overflow-hidden border transition-all ${active ? 'border-green-500 ring-2 ring-green-300' : 'border-slate-200'} ${v ? PREVIEW_BG_CLASS[bg] : 'bg-slate-50'}`}>
                        {v ? (
                          <img src={v.image} alt={slot.label} className="w-full h-full object-contain animate-in fade-in duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {active ? <Loader2 className="animate-spin text-green-500" size={20} /> : <span className="w-6 h-6 rounded-full border-2 border-dashed border-slate-300" />}
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-center text-slate-600 leading-tight">{slot.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="flex justify-between items-center gap-3">
        <button
          onClick={props.onBack}
          disabled={isRunning}
          className="px-4 py-2.5 rounded-full font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          <ArrowLeft size={16} /> 基本イラストに戻る
        </button>
        <button
          onClick={props.onNext}
          disabled={isRunning || !hasAnyGenerated}
          className="px-6 py-2.5 rounded-full font-bold text-white bg-slate-800 hover:bg-slate-900 shadow text-sm flex items-center gap-1.5 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          調整・追加へ進む <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
