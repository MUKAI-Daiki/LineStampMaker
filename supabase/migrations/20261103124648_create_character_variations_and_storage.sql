/*
# Character variations + private image storage (オリキャラメーカー)

## Summary
Adds storage for the game-asset variations generated from a character's base illustration.
Image files are no longer stored as long text in the database; they live in a private
file bucket and each row only keeps the file path.

## 1. New Tables
### `character_variations`
One row per generated variation image (e.g. "RPG / 右上 / 歩き").
- `id` (uuid, PK)
- `project_id` (uuid, FK -> projects, cascade delete)
- `user_id` (uuid, defaults to the signed-in user)
- `asset_type` (text) one of 'rpg', 'slg', 'act', 'novel', 'custom'
- `slot_key` (text) machine key of the pose/direction/expression (e.g. 'ne_walk')
- `label` (text) human readable label shown in the UI and used for file names
- `sort_order` (int) display order inside the asset group
- `image_path` (text) storage path of the current image
- `previous_paths` (text[]) storage paths of earlier versions (newest last) for undo
- `created_at`, `updated_at` (timestamptz)

## 2. Modified Tables
### `projects`
- `selected_assets` (jsonb, default '[]') asset kinds chosen for bulk generation
- `variation_free_text` (text, default '') extra instructions applied to every variation

## 3. Storage
- Private bucket `character-images`. Objects are stored under `<user_id>/<project_id>/...`.

## 4. Security
- RLS enabled on `character_variations`; owner-only CRUD, also requiring `is_allowed_member()`
  (same rule as the existing `projects` table). Insert/update also require owning the parent project.
- Grants only to `authenticated` (no anon access).
- Storage policies: a signed-in member can read / upload / delete only files inside their own
  `<user_id>/` folder. No update policy (files are written once with unique names).
*/

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS selected_assets jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS variation_free_text text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.character_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('rpg', 'slg', 'act', 'novel', 'custom')),
  slot_key text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  image_path text NOT NULL,
  previous_paths text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS character_variations_project_idx
  ON public.character_variations (project_id, asset_type, sort_order);
CREATE INDEX IF NOT EXISTS character_variations_user_idx
  ON public.character_variations (user_id);

ALTER TABLE public.character_variations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.character_variations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_variations TO authenticated;

DROP POLICY IF EXISTS "select_own_variations" ON public.character_variations;
CREATE POLICY "select_own_variations" ON public.character_variations FOR SELECT
  TO authenticated USING (auth.uid() = user_id AND public.is_allowed_member());

DROP POLICY IF EXISTS "insert_own_variations" ON public.character_variations;
CREATE POLICY "insert_own_variations" ON public.character_variations FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id AND public.is_allowed_member()
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = character_variations.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_variations" ON public.character_variations;
CREATE POLICY "update_own_variations" ON public.character_variations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id AND public.is_allowed_member())
  WITH CHECK (
    auth.uid() = user_id AND public.is_allowed_member()
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = character_variations.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_variations" ON public.character_variations;
CREATE POLICY "delete_own_variations" ON public.character_variations FOR DELETE
  TO authenticated USING (auth.uid() = user_id AND public.is_allowed_member());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('character-images', 'character-images', false, 10485760, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "select_own_character_images" ON storage.objects;
CREATE POLICY "select_own_character_images" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'character-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_allowed_member()
  );

DROP POLICY IF EXISTS "insert_own_character_images" ON storage.objects;
CREATE POLICY "insert_own_character_images" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'character-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_allowed_member()
  );

DROP POLICY IF EXISTS "delete_own_character_images" ON storage.objects;
CREATE POLICY "delete_own_character_images" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'character-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_allowed_member()
  );
