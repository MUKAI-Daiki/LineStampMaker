/*
# Server-side enforcement of generation credits (stamina)

## Problem
`user_stamina` granted INSERT/UPDATE on all columns to the `authenticated` role,
so any signed-in user could set `stamina` back to the maximum, or rewrite
`last_login_at` so the browser-side recovery pass credited them a full balance.
The consume path was also a read-then-write race.

## Changes
1. Helper functions
   - `public.is_allowed_member()` — verified email from the signed JWT ends with @nua.ac.jp
   - `public.is_admin_member()` — the single operator account
   - `public.stamina_cost(text)` — server-side cost table (was a browser constant)
2. `public.init_stamina()` — SECURITY DEFINER: creates the row on first use and
   applies hourly recovery using the server clock, returns the balance.
3. `public.consume_stamina(text)` — SECURITY DEFINER: atomic conditional decrement,
   returns the new balance or -1 when the caller cannot afford the model.
4. Client write access removed: policies `insert_own_stamina` / `update_own_stamina`
   dropped and INSERT/UPDATE/DELETE revoked from anon + authenticated.
   SELECT is deliberately preserved so the balance display keeps working.

## Security
- Both functions are SECURITY DEFINER with `search_path = ''` and are EXECUTE-able
  only by `authenticated`; each re-derives the caller from `auth.uid()`.
- No data is dropped or altered; only privileges change.
*/

CREATE OR REPLACE FUNCTION public.is_allowed_member()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(lower(auth.jwt() ->> 'email') LIKE '%@nua.ac.jp', false);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_member()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(lower(auth.jwt() ->> 'email') = 'd-mukai@nua.ac.jp', false);
$$;

CREATE OR REPLACE FUNCTION public.stamina_cost(p_model text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_model
    WHEN 'gemini-3.1-flash-image' THEN 2
    WHEN 'gemini-3.1-flash-lite-image' THEN 1
    ELSE 1
  END;
$$;

CREATE OR REPLACE FUNCTION public.init_stamina()
RETURNS TABLE (stamina integer, max_stamina integer, is_admin boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_stamina integer;
  v_last timestamptz;
  v_hours integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_allowed_member() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF public.is_admin_member() THEN
    RETURN QUERY SELECT 50, 50, true;
    RETURN;
  END IF;

  SELECT s.stamina, s.last_login_at INTO v_stamina, v_last
  FROM public.user_stamina s WHERE s.user_id = v_uid;

  IF NOT FOUND THEN
    INSERT INTO public.user_stamina (user_id, stamina, last_login_at)
    VALUES (v_uid, 50, now())
    ON CONFLICT (user_id) DO NOTHING;
    SELECT s.stamina INTO v_stamina FROM public.user_stamina s WHERE s.user_id = v_uid;
  ELSE
    v_hours := greatest(floor(extract(epoch FROM (now() - v_last)) / 3600)::integer, 0);
    IF v_hours > 0 THEN
      UPDATE public.user_stamina s
      SET stamina = least(s.stamina + v_hours, 50), last_login_at = now()
      WHERE s.user_id = v_uid
      RETURNING s.stamina INTO v_stamina;
    END IF;
  END IF;

  RETURN QUERY SELECT coalesce(v_stamina, 0), 50, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_stamina(p_model text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer;
  v_new integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_allowed_member() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF public.is_admin_member() THEN
    RETURN 50;
  END IF;

  v_cost := public.stamina_cost(p_model);

  UPDATE public.user_stamina s
  SET stamina = s.stamina - v_cost
  WHERE s.user_id = v_uid AND s.stamina >= v_cost
  RETURNING s.stamina INTO v_new;

  IF v_new IS NULL THEN
    RETURN -1;
  END IF;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.is_allowed_member() FROM public, anon;
REVOKE ALL ON FUNCTION public.is_admin_member() FROM public, anon;
REVOKE ALL ON FUNCTION public.stamina_cost(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.init_stamina() FROM public, anon;
REVOKE ALL ON FUNCTION public.consume_stamina(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.is_allowed_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.init_stamina() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stamina(text) TO authenticated;

DROP POLICY IF EXISTS insert_own_stamina ON public.user_stamina;
DROP POLICY IF EXISTS update_own_stamina ON public.user_stamina;

DROP POLICY IF EXISTS select_own_stamina ON public.user_stamina;
CREATE POLICY select_own_stamina ON public.user_stamina
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.is_allowed_member());

REVOKE INSERT, UPDATE, DELETE ON public.user_stamina FROM anon, authenticated;
