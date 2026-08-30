/*
# Enforce university membership and project ownership in RLS

## Problem
1. The nua.ac.jp restriction existed only in browser code (useAuth.ts / AppShell.tsx),
   so any Google account that completed OAuth could use the REST API directly.
2. `project_images` INSERT/UPDATE only checked `user_id`, so a caller could attach
   rows to a `project_id` belonging to someone else.

## Changes
- All eight policies on `projects` and `project_images` recreated with the same
  owner check plus `public.is_allowed_member()`.
- `project_images` INSERT/UPDATE additionally require the referenced project to be
  owned by the caller.

## Security
Behaviour for legitimate @nua.ac.jp users acting on their own projects is unchanged.
No data is modified.
*/

DROP POLICY IF EXISTS select_own_projects ON public.projects;
DROP POLICY IF EXISTS insert_own_projects ON public.projects;
DROP POLICY IF EXISTS update_own_projects ON public.projects;
DROP POLICY IF EXISTS delete_own_projects ON public.projects;

CREATE POLICY select_own_projects ON public.projects
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.is_allowed_member());

CREATE POLICY insert_own_projects ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_member());

CREATE POLICY update_own_projects ON public.projects
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.is_allowed_member())
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_member());

CREATE POLICY delete_own_projects ON public.projects
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.is_allowed_member());

DROP POLICY IF EXISTS select_own_project_images ON public.project_images;
DROP POLICY IF EXISTS insert_own_project_images ON public.project_images;
DROP POLICY IF EXISTS update_own_project_images ON public.project_images;
DROP POLICY IF EXISTS delete_own_project_images ON public.project_images;

CREATE POLICY select_own_project_images ON public.project_images
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.is_allowed_member());

CREATE POLICY insert_own_project_images ON public.project_images
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_allowed_member()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY update_own_project_images ON public.project_images
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.is_allowed_member())
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_allowed_member()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY delete_own_project_images ON public.project_images
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.is_allowed_member());

ALTER FUNCTION public.update_projects_updated_at() SET search_path = '';
ALTER FUNCTION public.update_user_stamina_updated_at() SET search_path = '';
