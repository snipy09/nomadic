-- 015: read server-side secrets (e.g. the Resend API key) from Supabase Vault.
-- The secret itself is created out of band and never committed:
--   select vault.create_secret('<key>', 'resend_api_key', 'Resend API key used by the send-email Edge Function');
-- Only service_role (Edge Functions) may read it; anon/authenticated cannot.
SET check_function_bodies = false; -- vault exists on Supabase; plain PostgreSQL rehearsals lack it.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION private.get_vault_secret(p_name TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.get_vault_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_vault_secret(TEXT) TO service_role;
