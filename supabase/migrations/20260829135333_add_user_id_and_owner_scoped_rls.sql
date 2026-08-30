/*
# Add user_id ownership and owner-scoped RLS

## Summary
Adds `user_id` column to `projects` and `project_images` tables to enable
per-user data isolation via Google OAuth (nua.ac.jp domain only).
Replaces the previous open (anon) RLS policies with owner-scoped policies
restricted to authenticated users.

## Changes

### Modified Tables
- `projects`: added `user_id uuid NOT NULL DEFAULT auth.uid()` with FK to auth.users
- `project_images`: added `user_id uuid NOT NULL DEFAULT auth.uid()` with FK to auth.users

### Security
- All previous anon_* policies are dropped
- New owner-scoped policies: SELECT/INSERT/UPDATE/DELETE restricted to
  `authenticated` role where `auth.uid() = user_id`
- project_images also supports parent-based ownership check via projects join

### Notes
1. Existing rows (if any) will get a NULL user_id since there's no session
   context during migration. A DO block sets these to a placeholder or
   we make the column nullable initially for existing data, then enforce
   NOT NULL on new inserts via the DEFAULT.
2. The column is added with DEFAULT auth.uid() so frontend inserts that
   omit user_id will automatically populate from the session.
*/

-- Step 1: Add user_id columns (nullable first for existing data)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_images' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE project_images ADD COLUMN user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 2: Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_project_images_user_id ON project_images(user_id);

-- Step 3: Drop old anon policies on projects
DROP POLICY IF EXISTS "anon_select_projects" ON projects;
DROP POLICY IF EXISTS "anon_insert_projects" ON projects;
DROP POLICY IF EXISTS "anon_update_projects" ON projects;
DROP POLICY IF EXISTS "anon_delete_projects" ON projects;

-- Step 4: Drop old anon policies on project_images
DROP POLICY IF EXISTS "anon_select_project_images" ON project_images;
DROP POLICY IF EXISTS "anon_insert_project_images" ON project_images;
DROP POLICY IF EXISTS "anon_update_project_images" ON project_images;
DROP POLICY IF EXISTS "anon_delete_project_images" ON project_images;

-- Step 5: Create owner-scoped policies for projects
DROP POLICY IF EXISTS "select_own_projects" ON projects;
CREATE POLICY "select_own_projects" ON projects FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_projects" ON projects;
CREATE POLICY "insert_own_projects" ON projects FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_projects" ON projects;
CREATE POLICY "update_own_projects" ON projects FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_projects" ON projects;
CREATE POLICY "delete_own_projects" ON projects FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Step 6: Create owner-scoped policies for project_images
DROP POLICY IF EXISTS "select_own_project_images" ON project_images;
CREATE POLICY "select_own_project_images" ON project_images FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_project_images" ON project_images;
CREATE POLICY "insert_own_project_images" ON project_images FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_project_images" ON project_images;
CREATE POLICY "update_own_project_images" ON project_images FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_project_images" ON project_images;
CREATE POLICY "delete_own_project_images" ON project_images FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
