import { useMemo, useState } from 'react';
import { ArrowLeft, CircleCheck as CheckCircle2, Cloud, Download, FolderArchive, HardDrive, Loader as Loader2 } from 'lucide-react';
import { ASSET_DEFS, ASSET_ORDER, slotIndex } from '../characterAssets';
import type { Variation } from '../utils/variationDb';
import { downloadDataUrl, downloadVariationsZip } from '../utils/zipService';
import { PREVIEW_BG_CLASS } from './PreviewBackground';

interface DownloadStepProps {
  projectName: string;
  variations: Variation[];
  lineArt: string | null;
  baseImage: string;
  isCloudSaved: boolean;
  onBack: () => void;
}

export function DownloadStep({ projectName, variations, lineArt, baseImage, isCloudSaved, onBack }: DownloadStepProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(
    () =>
      ASSET_ORDER.map(type => ({
        type,
        items: variations
          .filter(v => v.assetType === type)
          .sort((a, b) => slotIndex(type, a.slotKey) - slotIndex(type, b.slotKey) || a.sortOrder - b.sortOrder),
      })).filter(g => g.items.length > 0),
    [variations]
  );

  const extras = [
    { name: '00_基本イラスト.png', dataUrl: baseImage },
    ...(lineArt ? [{ name: '00_線画.png', dataUrl: lineArt }] : []),
  ];

  const runZip = async (key: string, zipName: string, items: Variation[], withExtras: boolean) => {
    setBusyKey(key);
    setError(null);
    try {
      await downloadVariationsZip(zipName, items, withExtras ? extras : []);
    } catch {
      setError('ZIPファイルを作れませんでした。もう一度お試しください。');
    } finally {
      setBusyKey(null);
    }
  };

  const zipButton = (key: string, label: string, onClick: () => void, primary = false) => (
    <button
      onClick={onClick}
      disabled={!!busyKey}
      className={`px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50 ${
        primary ? 'text-white bg-green-500 hover:bg-green-600 shadow-lg hover:-translate-y-0.5' : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
      }`}
    >
      {busyKey === key ? <Loader2 size={16} className="animate-spin" /> : primary ? <FolderArchive size={16} /> : <Download size={16} />}
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">保存・ダウンロード</h2>
            <p className="text-sm text-slate-500 mt-1">背景が透明なPNG画像として、アセットごとのフォルダに分けてまとめます。</p>
          </div>
          <div className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full ${isCloudSaved ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
            {isCloudSaved ? <><Cloud size={14} /><CheckCircle2 size={14} /> アカウントに自動保存されています</> : <><HardDrive size={14} /> このPCでの作業（保存はダウンロードのみ）</>}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {zipButton('all', `すべてZIPでダウンロード（${variations.length + extras.length}枚）`, () => runZip('all', projectName || 'オリキャラ', variations, true), true)}
          {zipButton('base', '基本イラストのみ', () => {
            downloadDataUrl(baseImage, '基本イラスト.png');
          })}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {groups.map(g => (
        <section key={g.type} className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="font-bold text-slate-800">
              {ASSET_DEFS[g.type].label}
              <span className="text-xs font-normal text-slate-400 ml-2">{g.items.length}枚</span>
            </h3>
            {zipButton(g.type, 'このアセットをZIPで', () => runZip(g.type, `${projectName || 'オリキャラ'}_${g.type}`, g.items, false))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {g.items.map(v => (
              <div key={v.id} className={`w-16 h-16 shrink-0 rounded-lg border border-slate-200 overflow-hidden ${PREVIEW_BG_CLASS.checker}`} title={v.label}>
                <img src={v.image} alt={v.label} loading="lazy" className="w-full h-full object-contain" />
              </div>
            ))}
          </div>
        </section>
      ))}

      <div>
        <button onClick={onBack} className="px-5 py-3 rounded-full font-bold text-slate-600 bg-white border-2 border-slate-200 hover:bg-slate-50 flex items-center gap-2 text-sm">
          <ArrowLeft size={16} /> 微調整へ戻る
        </button>
      </div>
    </div>
  );
}
