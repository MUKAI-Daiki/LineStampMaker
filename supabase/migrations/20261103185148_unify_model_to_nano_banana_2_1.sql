-- Unify all image generation to gemini-nano-banana-2.1 with flat stamina cost of 2.
-- Old model entries are removed; the fallback default is 2 (was 1).
CREATE OR REPLACE FUNCTION public.stamina_cost(p_model text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_model
    WHEN 'gemini-nano-banana-2.1' THEN 2
    ELSE 2
  END;
$$;
