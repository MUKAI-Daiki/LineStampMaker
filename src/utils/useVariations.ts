import { useCallback, useRef, useState } from 'react';
import {
  deleteVariation,
  insertVariation,
  loadVariations,
  renameVariation,
  replaceVariationImage,
  revertVariation,
  sortVariations,
  type Variation,
} from './variationDb';

export type NewVariation = Omit<Variation, 'id' | 'history' | 'imagePath' | 'previousPaths'>;

export interface VariationStore {
  variations: Variation[];
  isLoading: boolean;
  load: (projectId: string) => Promise<void>;
  clear: () => void;
  add: (v: NewVariation) => Promise<Variation | null>;
  replaceImage: (id: string, image: string) => Promise<void>;
  revert: (id: string) => Promise<void>;
  rename: (id: string, label: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useVariations(
  userId: string | undefined,
  projectId: string | null,
  onError: (msg: string) => void
): VariationStore {
  const [variations, setVariations] = useState<Variation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const ref = useRef<Variation[]>([]);

  const commit = useCallback((next: Variation[]) => {
    ref.current = sortVariations(next);
    setVariations(ref.current);
  }, []);

  const swap = useCallback((updated: Variation) => {
    commit(ref.current.map(v => (v.id === updated.id ? updated : v)));
  }, [commit]);

  const find = (id: string) => ref.current.find(v => v.id === id);

  const load = useCallback(async (pid: string) => {
    setIsLoading(true);
    commit([]);
    try {
      commit(await loadVariations(pid));
    } catch (e) {
      console.warn('バリエーションの読み込みに失敗しました:', e);
      onError('保存済みのバリエーション画像を読み込めませんでした。');
    } finally {
      setIsLoading(false);
    }
  }, [commit, onError]);

  const clear = useCallback(() => commit([]), [commit]);

  const add = useCallback(async (v: NewVariation) => {
    if (!projectId) return null;
    try {
      const created = await insertVariation(userId, projectId, v);
      commit([...ref.current, created]);
      return created;
    } catch (e) {
      console.warn('バリエーションの保存に失敗しました:', e);
      onError('生成した画像を保存できませんでした。通信状況を確認してください。');
      return null;
    }
  }, [userId, projectId, commit, onError]);

  const replaceImage = useCallback(async (id: string, image: string) => {
    const current = find(id);
    if (!current || !projectId) return;
    try {
      swap(await replaceVariationImage(userId, projectId, current, image));
    } catch (e) {
      console.warn('画像の更新に失敗しました:', e);
      onError('修正した画像を保存できませんでした。');
    }
  }, [userId, projectId, swap, onError]);

  const revert = useCallback(async (id: string) => {
    const current = find(id);
    if (!current) return;
    try {
      swap(await revertVariation(current));
    } catch (e) {
      console.warn('元に戻す処理に失敗しました:', e);
      onError('前の版に戻せませんでした。');
    }
  }, [swap, onError]);

  const rename = useCallback(async (id: string, label: string) => {
    const current = find(id);
    if (!current || !label.trim()) return;
    try {
      swap(await renameVariation(current, label.trim()));
    } catch (e) {
      console.warn('名前の変更に失敗しました:', e);
      onError('名前を変更できませんでした。');
    }
  }, [swap, onError]);

  const remove = useCallback(async (id: string) => {
    const current = find(id);
    if (!current) return;
    try {
      await deleteVariation(current);
      commit(ref.current.filter(v => v.id !== id));
    } catch (e) {
      console.warn('削除に失敗しました:', e);
      onError('画像を削除できませんでした。');
    }
  }, [commit, onError]);

  return { variations, isLoading, load, clear, add, replaceImage, revert, rename, remove };
}
