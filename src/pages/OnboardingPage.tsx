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
  },
  {
    number: 2,
    icon: Palette,
    title: '基本イラスト生成',
    description: '好きな画風（コピック・アニメ・水彩など）を選んで、AIが線画をカラーイラストに仕上げます。',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    iconBg: 'bg-emerald-100',
  },
  {
    number: 3,
    icon: MessageSquare,
    title: 'スタンプ作成',
    description: 'ポーズや感情、文字を選んで、8〜40個のスタンプバリエーションを作ります。',
    color: 'bg-amber-50 border-amber-200 text-amber-600',
    iconBg: 'bg-amber-100',
  },
  {
    number: 4,
    icon: Image,
    title: 'メイン画像・タブ画像',
    description: 'LINEスタンプの販売ページ用のメイン画像とトークルームのタブ画像を自動生成します。',
    color: 'bg-rose-50 border-rose-200 text-rose-600',
    iconBg: 'bg-rose-100',
  },
  {
    number: 5,
    icon: Download,
    title: '印刷・ダウンロード',
    description: '完成したスタンプ一覧をPDFで確認したり、ZIPファイルでまとめてダウンロードできます。',
    color: 'bg-violet-50 border-violet-200 text-violet-600',
    iconBg: 'bg-violet-100',
  },
];

export default function OnboardingPage({ onStart }: OnboardingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4 font-biz-ud">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-gray-800 mb-2">LINEスタンプの作り方</h1>
          <p className="text-gray-500 text-sm">5つのステップで、あなただけのオリジナルスタンプが完成します</p>
        </div>

        <div className="space-y-3 mb-8">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.number}
                className={`flex items-start gap-4 p-4 rounded-xl border ${s.color} transition-all duration-300`}
                style={{ animationDelay: `${i * 80}ms`, animation: 'fadeSlideIn 0.4s ease-out both' }}
              >
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold opacity-60">STEP {s.number}</span>
                    <h3 className="font-extrabold text-base">{s.title}</h3>
                  </div>
                  <p className="text-xs leading-relaxed opacity-80">{s.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white font-extrabold text-base shadow-lg shadow-green-200 transition-all duration-200"
          >
            はじめる <ArrowRight size={20} />
          </button>
          <p className="mt-3 text-xs text-gray-400">いつでもやり直しや修正ができます</p>
        </div>
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
