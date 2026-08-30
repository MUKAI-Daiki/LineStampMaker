import { useState } from 'react';
import { useAuth } from './utils/useAuth';
import { isLocalDev } from './utils/isLocalDev';
import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import OnboardingPage from './pages/OnboardingPage';
import App from './App';

export default function AppShell() {
  const { session, user, isLoading, isAllowedDomain, isAdmin } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(true);
  const local = isLocalDev();

  if (!local && isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-biz-ud">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <p className="font-bold text-gray-500 text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!local && !session) {
    return <LoginPage />;
  }

  if (!local && isAllowedDomain === false) {
    return <UnauthorizedPage />;
  }

  if (showOnboarding) {
    return <OnboardingPage onStart={() => setShowOnboarding(false)} />;
  }

  return <App userId={local ? 'local-dev' : user?.id} isAdmin={local ? true : isAdmin} />;
}
