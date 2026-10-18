-- 036: fix the UPI ID check of 035.
--
-- 035's CHECK on upi_settings.vpa used the repetition count {2,256}; PostgreSQL regular expressions allow at most
-- 255, so every UPDATE that set a UPI ID failed with "invalid repetition count(s)". The row was only ever inserted
-- with vpa NULL, so 035 itself applied cleanly.

ALTER TABLE public.upi_settings DROP CONSTRAINT IF EXISTS upi_settings_vpa_check;
ALTER TABLE public.upi_settings ADD CONSTRAINT upi_settings_vpa_check
  CHECK (vpa IS NULL OR (length(vpa) <= 320 AND vpa ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9.-]{1,63}$'));
