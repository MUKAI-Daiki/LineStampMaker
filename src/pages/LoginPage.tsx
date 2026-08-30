import { signInWithGoogle } from '../utils/useAuth';

export default function LoginPage() {
  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      console.error('ログインエラー:', e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4 font-biz-ud">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 flex flex-col items-center gap-6">

          <div className="w-20 h-20 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center overflow-hidden">
            <img
              src="/favicon-192x192.png"
              alt="手描きでスタンプメーカーのアイコン"
              className="w-14 h-14 object-contain"
            />
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 tracking-tight">
              手描きでスタンプメーカー
            </h1>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              名古屋芸術大学の学生・教職員向け<br />
              LINE スタンプ制作ツール
            </p>
          </div>

          <div className="w-full border-t border-gray-100" />

          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl border-2 border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-all font-bold text-gray-700 text-[15px] shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Google アカウントでログイン
          </button>

          <p className="text-xs text-gray-400 text-center leading-relaxed">
            <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 font-bold text-[11px] mb-1.5">
              nua.ac.jp のみ
            </span>
            <br />
            名古屋芸術大学のアカウントでのみ利用できます
          </p>

          <div className="w-full border-t border-gray-100" />

          <div className="flex items-center gap-4 text-xs text-gray-400">
            <a href="/privacy.html" className="hover:text-green-600 transition-colors underline underline-offset-2">
              プライバシーポリシー
            </a>
            <span className="text-gray-200">|</span>
            <a href="/terms.html" className="hover:text-green-600 transition-colors underline underline-offset-2">
              利用規約
            </a>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-300 mt-6">
          &copy; 2026 RiTan Lab.
        </p>
      </div>
    </div>
  );
}
