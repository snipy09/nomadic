# Security model

Last updated: 8 October 2026. Details and the full checklist: [`docs/security/SECURITY_CHECKLIST.md`](../docs/security/SECURITY_CHECKLIST.md).

- RLS on every public table; no client policies except read-only published content and active jobs.
- Clients call only allow-listed RPCs, each re-checking `session_token + user_id + device_fingerprint + is_active`.
  New client RPCs must be granted explicitly in a migration and added to the allow-list.
- Service-role-only: `server_secret`, `consume_ai_quota`, `refund_ai_quota`, `request_email_code`, `google_sign_in`.
- Learn v2 client RPCs (028): `learning_save_state`, `learning_pull_state` (session-checked, 512 KB per document).
- UPI payment RPCs (035): `billing_upi_create_order`, `billing_upi_submit_utr`, `billing_upi_list_orders` (session-checked, daily order cap, UTR unique) and `admin_list_upi_orders`, `admin_review_upi_order` (admin-checked, reason required, audit-logged). The merchant UPI ID lives only in `upi_settings` (set by SQL), never in the repo.
- Coupons (037): `billing_coupons` is deny-all and stores only the sha256 of each upper-cased code; codes are added in the SQL editor and never written in the repo, docs or app. One coupon per account, only for accounts on Free that never paid; re-checked on UTR submit and on approval; a cap of redemptions per code.
- In-app review RPCs (034): `app_review_status`, `app_review_submit` (session-checked, one review per user, answers validated server side).
- Roles/tiers come only from the server (email-based admin grants were removed). Admin actions are server-checked
  RPCs with an append-only audit log.
- Passwords: bcrypt of a client pre-hash; login rate limits; generic credential errors; one active device.
- API keys / SMTP passwords stay on the computer (OS keychain) and are never uploaded; no model keys in builds.
