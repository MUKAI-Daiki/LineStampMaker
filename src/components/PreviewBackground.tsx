import { CHECKER_BG } from '../utils/constants';

export type PreviewBg = 'checker' | 'white' | 'dark' | 'field';

export const PREVIEW_BG_CLASS: Record<PreviewBg, string> = {
  checker: CHECKER_BG,
  white: 'bg-white',
  dark: 'bg-slate-800',
  field: 'bg-gradient-to-b from-sky-200 via-sky-100 to-emerald-200',
};

const OPTIONS: { id: PreviewBg; label: string; swatch: string }[] = [
  { id: 'checker', label: '透過', swatch: CHECKER_BG },
  { id: 'white', label: '白', swatch: 'bg-white' },
  { id: 'dark', label: '黒', swatch: 'bg-slate-800' },
  { id: 'field', label: 'フィールド', swatch: 'bg-gradient-to-b from-sky-200 to-emerald-200' },
];

export function PreviewBgToggle({ value, onChange }: { value: PreviewBg; onChange: (v: PreviewBg) => void }) {
  return (
    <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-full p-1">
      {OPTIONS.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          title={`背景: ${o.label}`}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
            value === o.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className={`w-3.5 h-3.5 rounded-full border border-slate-300 ${o.swatch}`} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
