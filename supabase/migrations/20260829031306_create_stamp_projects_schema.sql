/*
# Create stamp projects schema (single-tenant, no auth)

This creates the database schema for the LINE Stamp Maker app.
The app has no sign-in, so all data is public/shared via anon key.

## 1. New Tables

### `projects`
Stores stamp creation sessions (one row per project).
- `id` (uuid, PK) — unique project identifier
- `name` (text) — user-given project name, defaults to creation timestamp
- `step` (int) — current workflow step (1-5)
- `selected_style` (text) — chosen art style ID (e.g. 'anime', 'copic')
- `line_retention` (int) — line art retention percentage (1-100)
- `char_desc` (text) — character description text
- `base_free_text` (text) — free-form additional instructions for base image
- `stamp_free_text` (text) — free-form instructions for stamp generation
- `custom_char_text` (text) — custom character text for prompt id 11
- `selected_prompts` (jsonb) — array of selected prompt keyword objects
- `main_prompt_text` (text) — additional prompt for main image
- `tab_prompt_text` (text) — additional prompt for tab image
- `is_debug_mode` (boolean) — debug mode toggle
- `selected_model` (text) — AI model selection
- `mode` (text) — UI mode ('easy', 'default', 'expert')
- `created_at` (timestamptz) — creation timestamp
- `updated_at` (timestamptz) — last update timestamp

### `project_images`
Stores generated images for each project (line art, base, stamps, main, tab).
- `id` (uuid, PK) — unique image identifier
- `project_id` (uuid, FK → projects) — owning project
- `image_type` (text) — one of: 'line_art', 'base', 'stamp', 'main', 'tab'
- `image_data` (text) — base64 data URL of the image
- `sort_order` (int) — ordering for stamp images (0-based)
- `created_at` (timestamptz) — creation timestamp

## 2. Security
- RLS enabled on both tables.
- Full CRUD allowed for anon + authenticated (single-tenant, no auth).

## 3. Indexes
- `project_images.project_id` for fast lookups by project.
- `project_images(project_id, sort_order)` for ordered stamp retrieval.
*/

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  step int NOT NULL DEFAULT 1,
  selected_style text NOT NULL DEFAULT 'copic',
  line_retention int NOT NULL DEFAULT 70,
  char_desc text NOT NULL DEFAULT '',
  base_free_text text NOT NULL DEFAULT '',
  stamp_free_text text NOT NULL DEFAULT '',
  custom_char_text text NOT NULL DEFAULT '',
  selected_prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
  main_prompt_text text NOT NULL DEFAULT '',
  tab_prompt_text text NOT NULL DEFAULT '',
  is_debug_mode boolean NOT NULL DEFAULT false,
  selected_model text NOT NULL DEFAULT 'gemini-3.1-flash-image',
  mode text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_projects" ON projects;
CREATE POLICY "anon_select_projects" ON projects FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_projects" ON projects;
CREATE POLICY "anon_insert_projects" ON projects FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_projects" ON projects;
CREATE POLICY "anon_update_projects" ON projects FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_projects" ON projects;
CREATE POLICY "anon_delete_projects" ON projects FOR DELETE
  TO anon, authenticated USING (true);

-- Project images table
CREATE TABLE IF NOT EXISTS project_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  image_type text NOT NULL CHECK (image_type IN ('line_art', 'base', 'stamp', 'main', 'tab')),
  image_data text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_project_images" ON project_images;
CREATE POLICY "anon_select_project_images" ON project_images FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_project_images" ON project_images;
CREATE POLICY "anon_insert_project_images" ON project_images FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_project_images" ON project_images;
CREATE POLICY "anon_update_project_images" ON project_images FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_project_images" ON project_images;
CREATE POLICY "anon_delete_project_images" ON project_images FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_images_project_id ON project_images(project_id);
CREATE INDEX IF NOT EXISTS idx_project_images_sort_order ON project_images(project_id, sort_order);

-- Auto-update updated_at on projects
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;
CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();
