-- Past problems + solutions
--
-- * Problems close automatically at their due date (hidden from the "current problem"
--   view immediately, and flagged inactive by a cron job every minute).
-- * Closed problems that were actually published become readable as "past problems".
-- * Solutions live in their own table so they can't be read before the due date.
--   (Row-level security can't hide a single column, and the problems row itself is
--   readable while the problem is open.)

-- ---------------------------------------------------------------------------
-- 1. Remember whether a problem was ever published, so drafts that were never
--    made active don't show up as past problems.
-- ---------------------------------------------------------------------------
ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS was_published BOOLEAN NOT NULL DEFAULT false;

UPDATE public.problems p
SET was_published = true
WHERE p.is_active
   OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.problem_id = p.id);

CREATE OR REPLACE FUNCTION public.mark_problem_published()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Once published, always published.
    NEW.was_published := OLD.was_published OR NEW.was_published OR NEW.is_active;
  ELSE
    NEW.was_published := NEW.was_published OR NEW.is_active;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS problems_mark_published ON public.problems;
CREATE TRIGGER problems_mark_published
  BEFORE INSERT OR UPDATE ON public.problems
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_problem_published();

-- ---------------------------------------------------------------------------
-- 2. Deactivate problems once their due date passes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_expired_problems()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.problems
  SET is_active = false, updated_at = now()
  WHERE is_active AND due_date <= now();
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_expired_problems() FROM PUBLIC, anon, authenticated;

SELECT public.deactivate_expired_problems();

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- cron.schedule replaces an existing job with the same name.
SELECT cron.schedule(
  'deactivate-expired-problems',
  '* * * * *',
  $$SELECT public.deactivate_expired_problems()$$
);

-- ---------------------------------------------------------------------------
-- 3. Who can read problems.
--    The time checks here make a problem close exactly at its due date, even
--    between cron runs.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view active problems" ON public.problems;
DROP POLICY IF EXISTS "Anyone can view current problems" ON public.problems;
DROP POLICY IF EXISTS "Anyone can view past problems" ON public.problems;

CREATE POLICY "Anyone can view current problems"
  ON public.problems
  FOR SELECT
  USING (is_active AND NOT is_archived AND due_date > now());

CREATE POLICY "Anyone can view past problems"
  ON public.problems
  FOR SELECT
  USING (was_published AND NOT is_archived AND due_date <= now());

-- ---------------------------------------------------------------------------
-- 4. No submissions after the due date.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create their own submissions" ON public.submissions;

CREATE POLICY "Users can create their own submissions"
  ON public.submissions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.problems p
      WHERE p.id = problem_id
        AND p.is_active
        AND p.due_date > now()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Solutions, readable by students only after the due date.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.problem_solutions (
  problem_id UUID PRIMARY KEY REFERENCES public.problems(id) ON DELETE CASCADE,
  solution TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.problem_solutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage solutions" ON public.problem_solutions;
CREATE POLICY "Admins can manage solutions"
  ON public.problem_solutions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "Solutions are visible after the due date" ON public.problem_solutions;
CREATE POLICY "Solutions are visible after the due date"
  ON public.problem_solutions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.problems p
      WHERE p.id = problem_id
        AND p.was_published
        AND NOT p.is_archived
        AND p.due_date <= now()
    )
  );
