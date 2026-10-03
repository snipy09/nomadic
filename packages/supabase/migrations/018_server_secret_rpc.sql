-- 018: Edge Functions (service_role) read allow-listed Vault secrets through the exposed API.
-- private.get_vault_secret (015) is not reachable over PostgREST; this wrapper is, but only for
-- service_role and only for the named secrets. anon/authenticated cannot execute it.
CREATE OR REPLACE FUNCTION public.server_secret(p_name TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN p_name IN ('resend_api_key', 'gemini_api_key', 'email_from', 'google_oauth_client_id')
              THEN private.get_vault_secret(p_name) END;
$$;
REVOKE ALL ON FUNCTION public.server_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_secret(TEXT) TO service_role;
