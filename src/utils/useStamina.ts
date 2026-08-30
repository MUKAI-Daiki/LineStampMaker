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

  // 残量の初期化と時間回復はサーバー側(init_stamina)で算出する。
  // クライアントは残量を書き込めない（テーブルへの書き込み権限なし）。
  const initAndRecover = useCallback(async () => {
    if (!userId) {
      setState({ stamina: MAX_STAMINA, maxStamina: MAX_STAMINA, isLoading: false });
      return;
    }

    const { data, error } = await supabase.rpc('init_stamina');

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      setState({ stamina: 0, maxStamina: MAX_STAMINA, isLoading: false });
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    setState({
      stamina: row.is_admin ? MAX_STAMINA : (row.stamina ?? 0),
      maxStamina: row.max_stamina ?? MAX_STAMINA,
      isLoading: false,
    });
  }, [userId]);

  useEffect(() => {
    initAndRecover();
  }, [initAndRecover]);

  // 消費はサーバー側(consume_stamina)で原子的に行う。
  // 不足している場合は -1 が返る。
  const consumeStamina = useCallback(async (model: string): Promise<boolean> => {
    if (!userId) return false;

    const { data, error } = await supabase.rpc('consume_stamina', { p_model: model });

    if (error || typeof data !== 'number' || data < 0) {
      if (typeof data === 'number' && data < 0) {
        setState(prev => ({ ...prev, stamina: 0 }));
      }
      return false;
    }

    setState(prev => ({ ...prev, stamina: data }));
    return true;
  }, [userId]);

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
