import { ArrowRight, Pencil, Palette, MessageSquare, Image, Download } from 'lucide-react';

interface OnboardingPageProps {
  onStart: () => void;
}

const steps = [
  {
    number: 1,
    icon: Pencil,
    title: '線画を描く',
    description: 'キャンバスにキャラクターの線画を描きます。カメラで手描きイラストを取り込むこともできます。',
    color: 'bg-blue-50 border-blue-200 text-blue-600',
    iconBg: 'bg-blue-100',
    image: '/images/onboarding/Step1.jpeg',
  },
  {
    number: 2,
    icon: Palette,
    title: '基本イラスト生成',
    description: '好きな画風（コピック・アニメ・水彩など）を選んで、AIが線画をカラーイラストに仕上げます。',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    iconBg: 'bg-emerald-100',
    image: '/images/onboarding/Step2.jpeg',
  },
  {
    number: 3,
    icon: MessageSquare,
    title: 'スタンプ作成',
    description: 'ポーズや感情、文字を選んで、8〜40個のスタンプバリエーションを作ります。',
    color: 'bg-amber-50 border-amber-200 text-amber-600',
    iconBg: 'bg-amber-100',
    image: '/images/onboarding/Step3.jpeg',
  },
  {
    number: 4,
    icon: Image,
    title: 'メイン画像・タブ画像',
    description: 'LINEスタンプの販売ページ用のメイン画像とトークルームのタブ画像を自動生成します。',
    color: 'bg-rose-50 border-rose-200 text-rose-600',
    iconBg: 'bg-rose-100',
    image: '/images/onboarding/Finish.jpeg',
  },
  {
    number: 5,
    icon: Download,
    title: '印刷・ダウンロード',
    description: '完成したスタンプ一覧をPDFで確認したり、ZIPファイルでまとめてダウンロードできます。',
    color: 'bg-violet-50 border-violet-200 text-violet-600',
    iconBg: 'bg-violet-100',
    image: '/images/onboarding/Finish.jpeg',
  },
];

export default function OnboardingPage({ onStart }: OnboardingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-6 px-4 font-biz-ud">
      <div className="w-full max-w-5xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-gray-800 mb-1">LINEスタンプの作り方</h1>
          <p className="text-gray-500 text-sm">5つのステップで、あなただけのオリジナルスタンプが完成します</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.number}
                className={`rounded-xl border overflow-hidden ${s.color} transition-all duration-300 ${s.number === 5 ? 'md:col-span-2 md:max-w-[calc(50%-6px)] md:mx-auto' : ''}`}
                style={{ animationDelay: `${i * 80}ms`, animation: 'fadeSlideIn 0.4s ease-out both' }}
              >
                <div className="flex items-start gap-3 p-3">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${s.iconBg} flex items-center justify-center`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] font-bold opacity-60">STEP {s.number}</span>
                      <h3 className="font-extrabold text-sm">{s.title}</h3>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-80">{s.description}</p>
                  </div>
                </div>
                <div className="px-3 pb-3">
                  <img
                    src={s.image}
                    alt={`Step ${s.number} の画面イメージ`}
                    className="w-full rounded-lg border border-black/5 shadow-sm"
                    loading={i > 1 ? 'lazy' : undefined}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center pb-4">
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white font-extrabold text-base shadow-lg shadow-green-200 transition-all duration-200"
          >
            はじめる <ArrowRight size={20} />
          </button>
          <p className="mt-2 text-xs text-gray-400">いつでもやり直しや修正ができます</p>
        </div>

        <p className="text-center text-[11px] text-gray-400 pb-4">イラスト原案: 向井友香</p>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}


export default OnboardingPage