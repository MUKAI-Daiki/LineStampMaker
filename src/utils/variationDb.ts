import { supabase } from './supabaseClient';
import { isLocalDev } from './isLocalDev';
import { ASSET_ORDER, slotIndex, type AssetType } from '../characterAssets';

const BUCKET = 'character-images';
const MAX_HISTORY = 3;

export interface Variation {
  id: string;
  assetType: AssetType;
  slotKey: string;
  label: string;
  sortOrder: number;
  image: string;
  /** 以前の版（古い順）。末尾が直前の版 */
  history: string[];
  imagePath: string | null;
  previousPaths: string[];
}

interface VariationRow {
  id: string;
  asset_type: AssetType;
  slot_key: string;
  label: string;
  sort_order: number;
  image_path: string;
  previous_paths: string[] | null;
}

export function sortVariations(list: Variation[]): Variation[] {
  return [...list].sort((a, b) => {
    const t = ASSET_ORDER.indexOf(a.assetType) - ASSET_ORDER.indexOf(b.assetType);
    if (t !== 0) return t;
    const s = slotIndex(a.assetType, a.slotKey) - slotIndex(b.assetType, b.slotKey);
    if (s !== 0) return s;
    return a.sortOrder - b.sortOrder;
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);/)?.[1] ?? 'image/png';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function uploadImage(userId: string, projectId: string, dataUrl: string): Promise<string> {
  const path = `${userId}/${projectId}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, dataUrlToBlob(dataUrl), {
    contentType: 'image/png',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

async function downloadImage(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw error ?? new Error('画像を読み込めませんでした');
  return blobToDataUrl(data);
}

async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn('画像ファイルの削除に失敗しました:', error);
}

export async function loadVariations(projectId: string): Promise<Variation[]> {
  if (isLocalDev()) return [];

  const { data, error } = await supabase
    .from('character_variations')
    .select('id, asset_type, slot_key, label, sort_order, image_path, previous_paths')
    .eq('project_id', projectId);
  if (error) throw error;

  const rows = (data ?? []) as VariationRow[];
  const loaded = await Promise.all(rows.map(async (row): Promise<Variation | null> => {
    try {
      const previousPaths = row.previous_paths ?? [];
      const [image, ...history] = await Promise.all([row.image_path, ...previousPaths].map(downloadImage));
      return {
        id: row.id,
        assetType: row.asset_type,
        slotKey: row.slot_key,
        label: row.label,
        sortOrder: row.sort_order,
        image,
        history,
        imagePath: row.image_path,
        previousPaths,
      };
    } catch (e) {
      console.warn('バリエーション画像の読み込みに失敗しました:', row.id, e);
      return null;
    }
  }));
  return sortVariations(loaded.filter((v): v is Variation => v !== null));
}

export async function insertVariation(
  userId: string | undefined,
  projectId: string,
  v: Omit<Variation, 'id' | 'history' | 'imagePath' | 'previousPaths'>
): Promise<Variation> {
  const id = crypto.randomUUID();
  if (isLocalDev() || !userId) {
    return { ...v, id, history: [], imagePath: null, previousPaths: [] };
  }

  const imagePath = await uploadImage(userId, projectId, v.image);
  const { error } = await supabase.from('character_variations').insert({
    id,
    project_id: projectId,
    asset_type: v.assetType,
    slot_key: v.slotKey,
    label: v.label,
    sort_order: v.sortOrder,
    image_path: imagePath,
  });
  if (error) {
    await removeFiles([imagePath]);
    throw error;
  }
  return { ...v, id, history: [], imagePath, previousPaths: [] };
}

export async function replaceVariationImage(
  userId: string | undefined,
  projectId: string,
  v: Variation,
  newImage: string
): Promise<Variation> {
  const history = [...v.history, v.image];
  const dropCount = Math.max(0, history.length - MAX_HISTORY);

  if (isLocalDev() || !userId || !v.imagePath) {
    return { ...v, image: newImage, history: history.slice(dropCount) };
  }

  const imagePath = await uploadImage(userId, projectId, newImage);
  const allPrevious = [...v.previousPaths, v.imagePath];
  const previousPaths = allPrevious.slice(dropCount);
  const { error } = await supabase
    .from('character_variations')
    .update({ image_path: imagePath, previous_paths: previousPaths, updated_at: new Date().toISOString() })
    .eq('id', v.id);
  if (error) {
    await removeFiles([imagePath]);
    throw error;
  }
  await removeFiles(allPrevious.slice(0, dropCount));
  return { ...v, image: newImage, history: history.slice(dropCount), imagePath, previousPaths };
}

export async function revertVariation(v: Variation): Promise<Variation> {
  if (v.history.length === 0) return v;
  const image = v.history[v.history.length - 1];
  const history = v.history.slice(0, -1);

  if (isLocalDev() || !v.imagePath) {
    return { ...v, image, history };
  }

  const imagePath = v.previousPaths[v.previousPaths.length - 1];
  const previousPaths = v.previousPaths.slice(0, -1);
  const { error } = await supabase
    .from('character_variations')
    .update({ image_path: imagePath, previous_paths: previousPaths, updated_at: new Date().toISOString() })
    .eq('id', v.id);
  if (error) throw error;
  await removeFiles([v.imagePath]);
  return { ...v, image, history, imagePath, previousPaths };
}

export async function renameVariation(v: Variation, label: string): Promise<Variation> {
  if (!isLocalDev() && v.imagePath) {
    const { error } = await supabase.from('character_variations').update({ label }).eq('id', v.id);
    if (error) throw error;
  }
  return { ...v, label };
}

export async function deleteVariation(v: Variation): Promise<void> {
  if (isLocalDev() || !v.imagePath) return;
  const { error } = await supabase.from('character_variations').delete().eq('id', v.id);
  if (error) throw error;
  await removeFiles([v.imagePath, ...v.previousPaths]);
}

export async function deleteProjectFiles(userId: string | undefined, projectId: string): Promise<void> {
  if (isLocalDev() || !userId) return;
  const folder = `${userId}/${projectId}`;
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 });
  if (error) {
    console.warn('画像ファイル一覧の取得に失敗しました:', error);
    return;
  }
  await removeFiles((data ?? []).map(f => `${folder}/${f.name}`));
}
