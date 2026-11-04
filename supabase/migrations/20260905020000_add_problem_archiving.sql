-- Let admins archive old problems (e.g. from previous school years) instead
-- of deleting them.
ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
