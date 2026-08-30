import { useState, useEffect, useCallback } from 'react';
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

export function useStamina(userId: string | undefined, isAdmin: boolean) {
  const local = isLocalDev();

  const [state, setState] = useState<StaminaState>({
    stamina: MAX_STAMINA,
    maxStamina: MAX_STAMINA,
    isLoading: !local,
  });

  const initAndRecover = useCallback(async () => {
    if (local) {
      setState({ stamina: MAX_STAMINA, maxStamina: MAX_STAMINA, isLoading: false });
      return;
    }

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
  }, [userId, local]);

  useEffect(() => {
    initAndRecover();
  }, [initAndRecover]);

  const consumeStamina = useCallback(async (model: string): Promise<boolean> => {
    if (local) return true;
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
  }, [userId, local]);

  const canAfford = useCallback((model: string): boolean => {
    if (local || isAdmin) return true;
    const cost = STAMINA_COST[model] ?? 1;
    return state.stamina >= cost;
  }, [local, isAdmin, state.stamina]);

  const getStaminaCost = useCallback((model: string): number => {
    return STAMINA_COST[model] ?? 1;
  }, []);

  return {
    ...state,
    consumeStamina,
    canAfford,
    getStaminaCost,
    isAdmin: local || isAdmin,
  };
}
