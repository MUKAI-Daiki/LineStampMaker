import { supabase } from './supabaseClient';
import { isLocalDev } from './isLocalDev';
import type { BulkAssetType } from '../characterAssets';
import { deleteProjectFiles } from './variationDb';

export interface ProjectRow {
  id: string;
  name: string;
  step: number;
  selected_style: string;
  line_retention: number;
  char_desc: string;
  base_free_text: string;
  selected_assets: BulkAssetType[];
  variation_free_text: string;
  is_debug_mode: boolean;
  selected_model: string;
  mode: string;
  created_at: string;
  updated_at: string;
}

type SingleImageType = 'line_art' | 'base';

export interface FullProject {
  project: ProjectRow;
  lineArt: string | null;
  baseImage: string | null;
}

const LOCAL_STUB_PROJECT: ProjectRow = {
  id: 'local-project',
  name: 'ローカルプロジェクト',
  step: 1,
  selected_style: 'copic',
  line_retention: 70,
  char_desc: '',
  base_free_text: '',
  selected_assets: ['rpg'],
  variation_free_text: '',
  is_debug_mode: false,
  selected_model: 'gemini-3.1-flash-image',
  mode: 'default',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export async function listProjects(): Promise<ProjectRow[]> {
  if (isLocalDev()) return [LOCAL_STUB_PROJECT];

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createProject(name?: string): Promise<ProjectRow> {
  if (isLocalDev()) return { ...LOCAL_STUB_PROJECT, name: name || LOCAL_STUB_PROJECT.name };

  const projectName = name || `プロジェクト ${new Date().toLocaleDateString('ja-JP')}`;
  const { data, error } = await supabase
    .from('projects')
    .insert({ name: projectName })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(
  id: string,
  updates: Partial<Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  if (isLocalDev()) return;

  const { error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id: string, userId: string | undefined): Promise<void> {
  if (isLocalDev()) return;

  await deleteProjectFiles(userId, id);
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function loadProject(id: string): Promise<FullProject> {
  if (isLocalDev()) {
    return { project: LOCAL_STUB_PROJECT, lineArt: null, baseImage: null };
  }

  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (projError) throw projError;
  if (!project) throw new Error('プロジェクトが見つかりませんでした');

  const { data: images, error: imgError } = await supabase
    .from('project_images')
    .select('image_type, image_data')
    .eq('project_id', id)
    .in('image_type', ['line_art', 'base']);
  if (imgError) throw imgError;

  return {
    project: {
      ...project,
      selected_assets: Array.isArray(project.selected_assets) ? project.selected_assets : [],
      variation_free_text: project.variation_free_text ?? '',
    },
    lineArt: images?.find(i => i.image_type === 'line_art')?.image_data ?? null,
    baseImage: images?.find(i => i.image_type === 'base')?.image_data ?? null,
  };
}

async function upsertSingleImage(projectId: string, imageType: SingleImageType, imageData: string | null): Promise<void> {
  if (!imageData) {
    const { error } = await supabase
      .from('project_images')
      .delete()
      .eq('project_id', projectId)
      .eq('image_type', imageType);
    if (error) throw error;
    return;
  }

  const { data: existing, error: findError } = await supabase
    .from('project_images')
    .select('id')
    .eq('project_id', projectId)
    .eq('image_type', imageType)
    .maybeSingle();
  if (findError) throw findError;

  const { error } = existing
    ? await supabase.from('project_images').update({ image_data: imageData }).eq('id', existing.id)
    : await supabase.from('project_images').insert({ project_id: projectId, image_type: imageType, image_data: imageData, sort_order: 0 });
  if (error) throw error;
}

export async function saveProjectImages(
  projectId: string,
  images: { lineArt: string | null; baseImage: string | null }
): Promise<void> {
  if (isLocalDev()) return;
  await upsertSingleImage(projectId, 'line_art', images.lineArt);
  await upsertSingleImage(projectId, 'base', images.baseImage);
}
