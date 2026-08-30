import { useState, useEffect } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

const ALLOWED_DOMAIN = 'nua.ac.jp';
const ADMIN_EMAIL = 'd-mukai@nua.ac.jp';

export interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAllowedDomain: boolean | null;
  isAdmin: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    session: null,
    user: null,
    isLoading: true,
    isAllowedDomain: null,
    isAdmin: false,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setAuthState({
        session,
        user,
        isLoading: false,
        isAllowedDomain: user ? checkDomain(user) : null,
        isAdmin: user ? checkAdmin(user) : false,
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthState({
        session,
        user,
        isLoading: false,
        isAllowedDomain: user ? checkDomain(user) : null,
        isAdmin: user ? checkAdmin(user) : false,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return authState;
}

function checkDomain(user: User): boolean {
  const email = user.email ?? '';
  return email.endsWith('@' + ALLOWED_DOMAIN);
}

function checkAdmin(user: User): boolean {
  return (user.email ?? '') === ADMIN_EMAIL;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        hd: ALLOWED_DOMAIN,
      },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
