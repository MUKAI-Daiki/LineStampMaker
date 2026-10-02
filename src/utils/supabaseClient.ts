import { createClient } from '@supabase/supabase-js';
import { isLocalDev } from './isLocalDev';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ローカル版はバックエンドを使わない。接続設定が無くても起動でき、通信も発生しないダミーにする
export const supabase = isLocalDev()
  ? createClient('http://localhost.invalid', 'local-dev', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : createClient(supabaseUrl, supabaseAnonKey);
