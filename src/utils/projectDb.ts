import { supabase } from './supabaseClient';
import type { PromptKeyword } from '../promptKeywords';

export interface ProjectRow {
  id: string;
  name: string;
  step: number;
  selected_style: string;
  line_retention: number;
  char_desc: string;
  base_free_text: string;
  stamp_free_text: string;
  custom_char_text: string;
  selected_prompts: PromptKeyword[];
  main_prompt_text: string;
  tab_prompt_text: string;
  is_debug_mode: boolean;
  selected_model: string;
  mode: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectImageRow {
  id: string;
  project_id: string;
  image_type: 'line_art' | 'base' | 'stamp' | 'main' | 'tab';
  image_data: string;
  sort_order: number;
  created_at: string;
}

export interface FullProject {
  project: ProjectRow;
  lineArt: string | null;
  baseImage: string | null;
  stamps: string[];
  mainImage: string | null;
  tabImage: string | null;
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createProject(name?: string): Promise<ProjectRow> {
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
  const { error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function loadProject(id: string): Promise<FullProject> {
  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (projError) throw projError;
  if (!project) throw new Error('プロジェクトが見つかりませんでした');

  const { data: images, error: imgError } = await supabase
    .from('project_images')
    .select('*')
    .eq('project_id', id)
    .order('sort_order', { ascending: true });
  if (imgError) throw imgError;

  const lineArtRow = images?.find(i => i.image_type === 'line_art');
  const baseRow = images?.find(i => i.image_type === 'base');
  const mainRow = images?.find(i => i.image_type === 'main');
  const tabRow = images?.find(i => i.image_type === 'tab');
  const stamps = images
    ?.filter(i => i.image_type === 'stamp')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(i => i.image_data) ?? [];

  return {
    project,
    lineArt: lineArtRow?.image_data ?? null,
    baseImage: baseRow?.image_data ?? null,
    stamps,
    mainImage: mainRow?.image_data ?? null,
    tabImage: tabRow?.image_data ?? null,
  };
}

async function upsertSingleImage(
  projectId: string,
  imageType: 'line_art' | 'base' | 'main' | 'tab',
  imageData: string | null
): Promise<void> {
  if (!imageData) {
    await supabase
      .from('project_images')
      .delete()
      .eq('project_id', projectId)
      .eq('image_type', imageType);
    return;
  }

  const { data: existing } = await supabase
    .from('project_images')
    .select('id')
    .eq('project_id', projectId)
    .eq('image_type', imageType)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('project_images')
      .update({ image_data: imageData })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('project_images')
      .insert({
        project_id: projectId,
        image_type: imageType,
        image_data: imageData,
        sort_order: 0,
      });
  }
}

export async function saveProjectImages(
  projectId: string,
  images: {
    lineArt?: string | null;
    baseImage?: string | null;
    mainImage?: string | null;
    tabImage?: string | null;
    stamps?: string[];
  }
): Promise<void> {
  if (images.lineArt !== undefined) {
    await upsertSingleImage(projectId, 'line_art', images.lineArt);
  }
  if (images.baseImage !== undefined) {
    await upsertSingleImage(projectId, 'base', images.baseImage);
  }
  if (images.mainImage !== undefined) {
    await upsertSingleImage(projectId, 'main', images.mainImage);
  }
  if (images.tabImage !== undefined) {
    await upsertSingleImage(projectId, 'tab', images.tabImage);
  }

  if (images.stamps !== undefined) {
    await supabase
      .from('project_images')
      .delete()
      .eq('project_id', projectId)
      .eq('image_type', 'stamp');

    if (images.stamps.length > 0) {
      const rows = images.stamps.map((data, i) => ({
        project_id: projectId,
        image_type: 'stamp' as const,
        image_data: data,
        sort_order: i,
      }));
      const { error } = await supabase
        .from('project_images')
        .insert(rows);
      if (error) throw error;
    }
  }
}
