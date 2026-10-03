-- 017: Supabase security advisor fix: pin search_path on the legacy matcher (not client-callable).
ALTER FUNCTION public.match_jobs_for_user(uuid) SET search_path = public;
