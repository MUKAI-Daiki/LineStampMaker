import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const MAX_STAMINA = 50;
const STAMINA_COST: Record<string, number> = {
  'gemini-3.1-flash-image': 2,
  'gemini-3.1-flash-lite-image': 1,
};

export interface StaminaState {
  stamina: number;
  maxStamina: number;
  isLoading: boolean;
}

export function useStamina(userId: string | undefined, isAdmin: boolean) {
  const [state, setState] = useState<StaminaState>({
    stamina: MAX_STAMINA,
    maxStamina: MAX_STAMINA,
    isLoading: true,
  });

  const initAndRecover = useCallback(async () => {
    if (!userId || isAdmin) {
      setState({ stamina: MAX_STAMINA, maxStamina: MAX_STAMINA, isLoading: false });
      return;
    }

    const now = new Date();

    const { data: existing } = await supabase
      .from('user_stamina')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      await supabase.from('user_stamina').insert({
        user_id: userId,
        stamina: MAX_STAMINA,
        last_login_at: now.toISOString(),
      });
      setState({ stamina: MAX_STAMINA, maxStamina: MAX_STAMINA, isLoading: false });
      return;
    }

    const lastLogin = new Date(existing.last_login_at);
    const diffMs = now.getTime() - lastLogin.getTime();
    const hoursElapsed = Math.floor(diffMs / (1000 * 60 * 60));
    const recovery = Math.min(hoursElapsed, MAX_STAMINA - existing.stamina);
    const newStamina = Math.min(existing.stamina + Math.max(recovery, 0), MAX_STAMINA);

    await supabase
      .from('user_stamina')
      .update({ stamina: newStamina, last_login_at: now.toISOString() })
      .eq('user_id', userId);

    setState({ stamina: newStamina, maxStamina: MAX_STAMINA, isLoading: false });
  }, [userId, isAdmin]);

  useEffect(() => {
    initAndRecover();
  }, [initAndRecover]);

  const consumeStamina = useCallback(async (model: string): Promise<boolean> => {
    if (isAdmin) return true;
    if (!userId) return false;

    const cost = STAMINA_COST[model] ?? 1;
    if (state.stamina < cost) return false;

    const newStamina = state.stamina - cost;
    const { error } = await supabase
      .from('user_stamina')
      .update({ stamina: newStamina })
      .eq('user_id', userId);

    if (error) return false;

    setState(prev => ({ ...prev, stamina: newStamina }));
    return true;
  }, [userId, isAdmin, state.stamina]);

  const canAfford = useCallback((model: string): boolean => {
    if (isAdmin) return true;
    const cost = STAMINA_COST[model] ?? 1;
    return state.stamina >= cost;
  }, [isAdmin, state.stamina]);

  const getStaminaCost = useCallback((model: string): number => {
    return STAMINA_COST[model] ?? 1;
  }, []);

  return {
    ...state,
    consumeStamina,
    canAfford,
    getStaminaCost,
    isAdmin,
  };
}
