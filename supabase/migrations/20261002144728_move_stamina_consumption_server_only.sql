/*
# Move stamina consumption behind the image-generation edge function

## Problem
`init_stamina()` and `consume_stamina(text)` were SECURITY DEFINER functions any
signed-in user could call through the data API. Worse, the `gemini-image` edge
function never checked stamina, so a user could call it directly and generate
images without limit. Stamina was only enforced by the browser.

## Changes
1. New server-only functions (EXECUTE granted to `service_role` only):
   - `public.consume_stamina_for(p_user uuid, p_model text)` — creates the row on
     first use, applies hourly recovery (keeping partial-hour progress), then
     atomically decrements by the model cost. Returns the new balance, or -1 when
     the user cannot afford the model.
   - `public.refund_stamina_for(p_user uuid, p_model text)` — gives the cost back
     (capped at 50) when generation fails upstream.
2. EXECUTE on `init_stamina()` and `consume_stamina(text)` revoked from
   `authenticated` (and public/anon). The functions are left in place, unused.
3. The browser now only READS `user_stamina` (existing owner-scoped SELECT policy)
   and computes the displayed balance from `stamina` + hours since `last_login_at`.

## Security
- Only the edge function (running with the service role, after verifying the
  caller's session and nua.ac.jp email) can change stamina.
- No tables, columns, or rows are dropped or altered.
*/

CREATE OR REPLACE FUNCTION public.consume_stamina_for(p_user uuid, p_model text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cost integer := public.stamina_cost(p_model);
  v_stamina integer;
  v_last timestamptz;
  v_hours integer;
  v_new_last timestamptz;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'invalid user';
  END IF;

  INSERT INTO public.user_stamina (user_id, stamina, last_login_at)
  VALUES (p_user, 50, now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT s.stamina, s.last_login_at INTO v_stamina, v_last
  FROM public.user_stamina s WHERE s.user_id = p_user
  FOR UPDATE;

  v_hours := greatest(floor(extract(epoch FROM (now() - v_last)) / 3600)::integer, 0);
  v_new_last := v_last;
  IF v_hours > 0 THEN
    v_stamina := least(v_stamina + v_hours, 50);
    v_new_last := CASE WHEN v_stamina >= 50 THEN now()
                       ELSE v_last + make_interval(hours => v_hours) END;
  END IF;

  IF v_stamina < v_cost THEN
    UPDATE public.user_stamina s
    SET stamina = v_stamina, last_login_at = v_new_last
    WHERE s.user_id = p_user;
    RETURN -1;
  END IF;

  UPDATE public.user_stamina s
  SET stamina = v_stamina - v_cost, last_login_at = v_new_last
  WHERE s.user_id = p_user;

  RETURN v_stamina - v_cost;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_stamina_for(p_user uuid, p_model text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.user_stamina s
  SET stamina = least(s.stamina + public.stamina_cost(p_model), 50)
  WHERE s.user_id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stamina_for(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_stamina_for(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stamina_for(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_stamina_for(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.init_stamina() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_stamina(text) FROM public, anon, authenticated;
