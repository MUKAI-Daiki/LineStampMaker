/*
# User retention: 3-month inactivity auto-deletion + admin manual deletion

## Problem
User data (projects, images, variations, stamina) is stored indefinitely.
The app needs time-limited retention: delete all user data when either
(a) the user has not been active for 3 months, or
(b) an admin explicitly deletes the user.

## Changes

### 1. New column: `user_stamina.last_seen_at`
- `timestamptz NOT NULL DEFAULT now()` — records the last time the user
  accessed the app. Refreshed by the gemini-image edge function on every
  generation, and by `touch_last_seen()` RPC on page load.
- This is the single source of truth for "when was the user last active?"

### 2. New function: `public.touch_last_seen()`
- SECURITY DEFINER, callable by `authenticated`.
- Updates `last_seen_at = now()` for the caller's row, creating it if needed.

### 3. Internal helper: `public._delete_user_data(p_user_id uuid)`
- SECURITY DEFINER, service_role only.
- Deletes a user's Storage files, projects (+ cascade), variations, stamina, and auth row.

### 4. New function: `public.cleanup_inactive_users()`
- SECURITY DEFINER, service_role only (called by pg_cron).
- Finds users whose `last_seen_at` (or `created_at` for never-active users)
  is older than 3 months, and deletes all their data.
- Returns the count of deleted users.

### 5. New function: `public.admin_delete_user(p_user_id uuid)`
- SECURITY DEFINER, service_role only (called by admin edge function).
- Same deletion logic for a specific user, regardless of activity.

### 6. pg_cron job
- `cleanup_inactive_users` runs daily at 03:00 UTC.

### Security
- `touch_last_seen()` is the only function callable by `authenticated`.
- `cleanup_inactive_users()`, `admin_delete_user()`, `_delete_user_data()` are service_role only.
- All functions use `search_path = ''` and SECURITY DEFINER.
*/

-- 1. Add last_seen_at column
ALTER TABLE public.user_stamina
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

-- 2. touch_last_seen — called by authenticated users on page load / generation
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.user_stamina (user_id, stamina, last_login_at, last_seen_at)
  VALUES (v_uid, 50, now(), now())
  ON CONFLICT (user_id)
  DO UPDATE SET last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_seen() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

-- 3. Internal helper: delete a single user's data completely
CREATE OR REPLACE FUNCTION public._delete_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid user id';
  END IF;

  -- Delete Storage files (character-images bucket, user folder)
  DELETE FROM storage.objects
  WHERE name LIKE p_user_id::text || '/%';

  -- Delete projects (cascades to project_images and character_variations via FK ON DELETE CASCADE)
  DELETE FROM public.projects WHERE user_id = p_user_id;

  -- Delete any remaining rows not tied to a project (safety net)
  DELETE FROM public.character_variations WHERE user_id = p_user_id;
  DELETE FROM public.project_images WHERE user_id = p_user_id;

  -- Delete stamina row
  DELETE FROM public.user_stamina WHERE user_id = p_user_id;

  -- Delete the auth user (cascades any remaining FK references)
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public._delete_user_data(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._delete_user_data(uuid) TO service_role;

-- 4. cleanup_inactive_users — called by pg_cron daily
CREATE OR REPLACE FUNCTION public.cleanup_inactive_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
  v_user_id uuid;
  v_threshold timestamptz := now() - interval '3 months';
BEGIN
  FOR v_user_id IN
    SELECT u.id
    FROM auth.users u
    LEFT JOIN public.user_stamina s ON s.user_id = u.id
    WHERE coalesce(s.last_seen_at, u.created_at) < v_threshold
  LOOP
    PERFORM public._delete_user_data(v_user_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_inactive_users() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_inactive_users() TO service_role;

-- 5. admin_delete_user — called by admin edge function
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._delete_user_data(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO service_role;

-- 6. pg_cron: run cleanup daily at 03:00 UTC
SELECT cron.schedule(
  'cleanup-inactive-users-daily',
  '0 3 * * *',
  $$SELECT public.cleanup_inactive_users()$$
);
