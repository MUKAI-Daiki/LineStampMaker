import { signOut } from '../utils/useAuth';

export default function UnauthorizedPage() {
  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (e) {
      console.error('ログアウトエラー:', e);
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4 font-biz-ud">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 flex flex-col items-center gap-6">

          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>

          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-800">
              アクセスが制限されています
            </h1>
            <p className="text-sm text-gray-500 mt-3 leading-relaxed">
              本サービスは<strong className="text-gray-700"> nua.ac.jp </strong>ドメインの<br />
              Google アカウントのみ利用できます。
            </p>
          </div>

          <div className="w-full bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-sm text-red-700 text-center leading-relaxed">
              ログインしたアカウントは<br />
              許可されたドメインに属していません。
            </p>
          </div>

          <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              <strong>名古屋芸術大学の学生・教職員の方:</strong><br />
              大学から発行された <strong>@nua.ac.jp</strong> のメールアドレスに紐づいた Google アカウントでログインしてください。
            </p>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full py-3.5 rounded-2xl bg-gray-800 hover:bg-gray-900 active:scale-[0.98] transition-all text-white font-bold text-[15px] shadow-sm"
          >
            別のアカウントでログインし直す
          </button>

          <div className="flex items-center gap-4 text-xs text-gray-400">
            <a href="/privacy.html" className="hover:text-gray-600 transition-colors underline underline-offset-2">
              プライバシーポリシー
            </a>
            <span className="text-gray-200">|</span>
            <a href="/terms.html" className="hover:text-gray-600 transition-colors underline underline-offset-2">
              利用規約
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
