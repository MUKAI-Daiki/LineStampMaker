/*
# Require a verified Google university identity for membership

## Problem
`is_allowed_member()` / `is_admin_member()` only matched the shape of the JWT
`email` claim, so any Supabase account whose email string ends in `@nua.ac.jp`
passed the gate, including an email/password signup with an unverified address.

## Changes
Both functions become SECURITY DEFINER and read `auth.users` for `auth.uid()`,
requiring the nua.ac.jp domain AND a confirmed email AND a Google identity.
Signatures and names are unchanged, so every existing policy keeps working.
No table, column or row is altered.
*/

CREATE OR REPLACE FUNCTION public.is_allowed_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = auth.uid()
      AND lower(u.email) LIKE '%@nua.ac.jp'
      AND u.email_confirmed_at IS NOT NULL
      AND (
        (u.raw_app_meta_data ->> 'provider') = 'google'
        OR (u.raw_app_meta_data -> 'providers') ? 'google'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = auth.uid()
      AND lower(u.email) = 'd-mukai@nua.ac.jp'
      AND u.email_confirmed_at IS NOT NULL
      AND (
        (u.raw_app_meta_data ->> 'provider') = 'google'
        OR (u.raw_app_meta_data -> 'providers') ? 'google'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_allowed_member() FROM public, anon;
REVOKE ALL ON FUNCTION public.is_admin_member() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_allowed_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_member() TO authenticated;
