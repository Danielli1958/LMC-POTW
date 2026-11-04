-- One-time copy of the high-school POTW admins into the LMC app.
--
-- Only the admin flag and display name are copied; LMC points and stats start at 0.
-- After this, admins are managed separately: making someone an admin in one app
-- does not affect the other.
--
-- Run after 20261104000000_create_lmc_tables.sql. Safe to run more than once.

INSERT INTO public.lmc_profiles (user_id, display_name, is_admin)
SELECT p.user_id, p.display_name, true
FROM public.profiles p
WHERE p.is_admin = true
ON CONFLICT (user_id) DO UPDATE
SET is_admin = true,
    updated_at = now();
