import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { isLocalDev } from './isLocalDev';

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

function withRecovery(stamina: number, lastLoginAt: string): number {
  const hours = Math.max(Math.floor((Date.now() - new Date(lastLoginAt).getTime()) / 3_600_000), 0);
  return Math.min(stamina + hours, MAX_STAMINA);
}

// 実際の消費はサーバー（画像生成の窓口）で行う。ここは表示と事前チェックのみ。
export function useStamina(userId: string | undefined, isAdmin: boolean) {
  const local = isLocalDev();

  const [state, setState] = useState<StaminaState>({
    stamina: MAX_STAMINA,
    maxStamina: MAX_STAMINA,
    isLoading: !local,
  });
  const staminaRef = useRef(MAX_STAMINA);

  const applyStamina = useCallback((value: number) => {
    staminaRef.current = value;
    setState({ stamina: value, maxStamina: MAX_STAMINA, isLoading: false });
  }, []);

  const syncStamina = useCallback(async () => {
    if (local || isAdmin || !userId) {
      applyStamina(MAX_STAMINA);
      return;
    }

    const { data, error } = await supabase
      .from('user_stamina')
      .select('stamina, last_login_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('stamina load failed', error);
      applyStamina(0);
      return;
    }

    applyStamina(data ? withRecovery(data.stamina, data.last_login_at) : MAX_STAMINA);
  }, [userId, local, isAdmin, applyStamina]);

  useEffect(() => {
    syncStamina();
  }, [syncStamina]);

  const getStaminaCost = useCallback((model: string): number => {
    return STAMINA_COST[model] ?? 1;
  }, []);

  const canAfford = useCallback((model: string): boolean => {
    if (isAdmin) return true;
    return state.stamina >= getStaminaCost(model);
  }, [isAdmin, state.stamina, getStaminaCost]);

  const consumeStamina = useCallback(async (model: string): Promise<boolean> => {
    if (local || isAdmin) return true;
    if (!userId) return false;
    const cost = getStaminaCost(model);
    if (staminaRef.current < cost) return false;
    applyStamina(staminaRef.current - cost);
    return true;
  }, [userId, local, isAdmin, getStaminaCost, applyStamina]);

  return {
    ...state,
    consumeStamina,
    canAfford,
    getStaminaCost,
    syncStamina,
    isAdmin,
  };
}
