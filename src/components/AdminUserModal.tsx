import { useEffect, useState } from 'react';
import { Loader as Loader2, ShieldCheck, Trash2, Users, X, Zap } from 'lucide-react';

interface UserInfo {
  id: string;
  email: string;
  created_at: string;
  last_seen_at: string;
  stamina: number;
  is_admin: boolean;
}

export function AdminUserModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { supabase } = await import('../utils/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('セッションがありません');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`読み込みに失敗しました (${res.status})`);
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みエラー');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const deleteUser = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const { supabase } = await import('../utils/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('セッションがありません');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `削除に失敗しました (${res.status})`);
      }
      setUsers(prev => prev.filter(u => u.id !== id));
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除エラー');
    } finally {
      setDeletingId(null);
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (days === 0) return '今日';
    if (days === 1) return '昨日';
    if (days < 30) return `${days}日前`;
    if (days < 90) return `${Math.floor(days / 30)}ヶ月前`;
    return `${Math.floor(days / 30)}ヶ月以上前`;
  };

  const inactiveSoon = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return days >= 80;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl flex flex-col gap-4 max-h-[85vh] border border-gray-100">
        <div className="flex justify-between items-center shrink-0">
          <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <Users size={20} className="text-green-600" /> ユーザー管理
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed">
          <p className="font-bold flex items-center gap-1.5"><ShieldCheck size={14} /> 保持期間について</p>
          <p className="mt-1">3ヶ月以上アクセスがないユーザーのデータ（プロジェクト・画像・アカウント）は、毎日3時（UTC）に自動削除されます。ここから個別に削除することもできます。</p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">ユーザーがいません</p>
          ) : (
            users.map(u => (
              <div key={u.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${u.is_admin ? 'border-amber-200 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-gray-800 truncate flex items-center gap-2">
                    {u.email}
                    {u.is_admin && <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-semibold shrink-0">管理者</span>}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-3">
                    <span>最終アクセス: {fmtDate(u.last_seen_at)}</span>
                    <span className="flex items-center gap-0.5"><Zap size={10} />{u.stamina}</span>
                    {inactiveSoon(u.last_seen_at) && !u.is_admin && (
                      <span className="text-red-500 font-bold">削除まで間近</span>
                    )}
                  </div>
                </div>
                {!u.is_admin && (
                  confirmId === u.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-red-600">削除しますか？</span>
                      <button
                        onClick={() => deleteUser(u.id)}
                        disabled={deletingId === u.id}
                        className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        {deletingId === u.id ? <Loader2 size={12} className="animate-spin" /> : '削除'}
                      </button>
                      <button onClick={() => setConfirmId(null)} className="text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
                        やめる
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(u.id)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                      title="このユーザーを削除"
                    >
                      <Trash2 size={16} />
                    </button>
                  )
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
