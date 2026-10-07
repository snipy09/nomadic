# Security model

Last updated: 7 October 2026. Details and the full checklist: [`docs/security/SECURITY_CHECKLIST.md`](../docs/security/SECURITY_CHECKLIST.md).

- RLS on every public table; no client policies except read-only published content and active jobs.
- Clients call only allow-listed RPCs, each re-checking `session_token + user_id + device_fingerprint + is_active`.
  New client RPCs must be granted explicitly in a migration and added to the allow-list.
- Service-role-only: `server_secret`, `consume_ai_quota`, `refund_ai_quota`, `request_email_code`, `google_sign_in`.
- Learn v2 client RPCs (028): `learning_save_state`, `learning_pull_state` (session-checked, 512 KB per document).
- Roles/tiers come only from the server (email-based admin grants were removed). Admin actions are server-checked
  RPCs with an append-only audit log.
- Passwords: bcrypt of a client pre-hash; login rate limits; generic credential errors; one active device.
- API keys / SMTP passwords stay on the computer (OS keychain) and are never uploaded; no model keys in builds.
