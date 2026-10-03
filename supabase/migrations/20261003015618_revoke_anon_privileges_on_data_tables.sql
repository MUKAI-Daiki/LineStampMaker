/*
# Remove leftover anonymous privileges on the data tables

The `anon` role still held SELECT/INSERT/UPDATE/DELETE on `projects` and
`project_images` and SELECT on `user_stamina` from the original schema, before
the owner-scoped rewrite. RLS blocks those callers today, but the grants would
become an open table the moment a policy named `anon` or RLS were toggled off.
The browser always operates as `authenticated`, so nothing in the app relies on
them. No table, column or row is altered.
*/

REVOKE ALL ON TABLE public.projects FROM anon;
REVOKE ALL ON TABLE public.project_images FROM anon;
REVOKE ALL ON TABLE public.user_stamina FROM anon;
