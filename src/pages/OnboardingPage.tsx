import { ArrowRight } from 'lucide-react';

interface OnboardingPageProps {
  onStart: () => void;
}

const steps = [
  {
    number: 1,
    title: '線画を描く',
    description: 'キャンバスに線画を描くか、カメラで手描きイラストを取り込みます。',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    image: '/images/onboarding/Step1.jpeg',
  },
  {
    number: 2,
    title: '基本イラスト生成',
    description: '画風を選ぶと、AIが線画をカラーイラストに仕上げます。',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    image: '/images/onboarding/Step3.jpeg',
  },
  {
    number: 3,
    title: 'スタンプ作成',
    description: 'ポーズや感情、文字を選んで、8個のスタンプを作ります。',
    color: 'bg-amber-50 border-amber-200 text-amber-700',
    image: '/images/onboarding/Step2.jpeg',
  },
  {
    number: 4,
    title: 'メイン画像・タブ画像',
    description: '販売ページ用のメイン画像とタブ画像を自動生成します。',
    color: 'bg-rose-50 border-rose-200 text-rose-700',
  },
  {
    number: 5,
    title: '印刷・ダウンロード',
    description: 'スタンプ一覧をPDFで確認し、ZIPでダウンロードできます。',
    color: 'bg-teal-50 border-teal-200 text-teal-700',
  },
];

export default function OnboardingPage({ onStart }: OnboardingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-4 px-3 font-biz-ud flex flex-col">
      <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col">
        <h1 className="text-center text-xl md:text-2xl font-extrabold text-gray-800 mb-3">
          <span className="inline-block border-b-2 border-green-500 pb-0.5">「手描きでスタンプ」</span>つくり方
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
          {steps.slice(0, 3).map((s, i) => (
            <div
              key={s.number}
              className={`rounded-xl border overflow-hidden ${s.color} transition-all duration-300`}
              style={{ animationDelay: `${i * 80}ms`, animation: 'fadeSlideIn 0.4s ease-out both' }}
            >
              <div className="px-3 pt-2.5 pb-1.5">
                <span className="text-[10px] font-bold opacity-50">STEP {s.number}</span>
                <h3 className="font-extrabold text-sm leading-tight">{s.title}</h3>
                <p className="text-[11px] leading-snug opacity-75 mt-0.5">{s.description}</p>
              </div>
              {s.image && (
                <div className="px-2.5 pb-2.5">
                  <img
                    src={s.image}
                    alt={`Step ${s.number}`}
                    className="w-full rounded-lg border border-black/5 shadow-sm"
                    loading={i > 0 ? 'lazy' : undefined}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
          {steps.slice(3).map((s, i) => (
            <div
              key={s.number}
              className={`rounded-xl border overflow-hidden ${s.color} transition-all duration-300`}
              style={{ animationDelay: `${(i + 3) * 80}ms`, animation: 'fadeSlideIn 0.4s ease-out both' }}
            >
              <div className="px-3 py-2.5">
                <span className="text-[10px] font-bold opacity-50">STEP {s.number}</span>
                <h3 className="font-extrabold text-sm leading-tight">{s.title}</h3>
                <p className="text-[11px] leading-snug opacity-75 mt-0.5">{s.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-3 pb-2 flex flex-col md:flex-row items-center gap-3">
          <img
            src="/images/onboarding/Finish.jpeg"
            alt="完成イメージ"
            className="w-full md:flex-1 max-h-[320px] object-contain rounded-xl border border-gray-200 shadow-sm"
            loading="lazy"
          />
          <div className="flex flex-col items-center gap-2 shrink-0 md:pr-4">
            <button
              onClick={onStart}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white font-extrabold text-base shadow-lg shadow-green-200 transition-all duration-200"
            >
              はじめる <ArrowRight size={20} />
            </button>
            <p className="text-[11px] text-gray-400">いつでもやり直しや修正ができます</p>
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-400 pb-2">イラスト原案: 向井友香</p>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}