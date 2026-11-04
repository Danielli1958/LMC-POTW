-- LMC (elementary school) Problem of the Week
--
-- This Supabase project is shared with the high-school POTW app, which uses the
-- unprefixed tables (problems, profiles, submissions, problem_solutions). This app
-- gets its own lmc_* copies with the same behavior, so the two apps never share
-- problems, points, leaderboards, or admins. Auth users are shared.
--
-- Nothing here touches the high-school tables or functions, or the old potm_* tables.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lmc_problems (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  points INTEGER NOT NULL DEFAULT 10,
  week_number INTEGER NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  hint TEXT,
  correct_answer TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  -- Whether the problem was ever made active; drafts never become "past problems".
  was_published BOOLEAN NOT NULL DEFAULT false,
  -- Users in submission order; used as a leaderboard tie-breaker.
  submitted_user_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lmc_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  total_points INTEGER NOT NULL DEFAULT 0,
  problems_solved INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  all_time_points INTEGER NOT NULL DEFAULT 0,
  all_time_problems_solved INTEGER NOT NULL DEFAULT 0,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lmc_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES public.lmc_problems(id) ON DELETE CASCADE,
  selected_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  points_earned INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, problem_id)
);

-- Solutions live in their own table so they can't be read before the due date
-- (row-level security can't hide a single column of an open problem).
CREATE TABLE IF NOT EXISTS public.lmc_problem_solutions (
  problem_id UUID PRIMARY KEY REFERENCES public.lmc_problems(id) ON DELETE CASCADE,
  solution TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lmc_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lmc_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lmc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lmc_problem_solutions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Helper functions
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so policies can call it without recursing through lmc_profiles RLS.
CREATE OR REPLACE FUNCTION public.is_lmc_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lmc_profiles
    WHERE user_id = auth.uid() AND is_admin = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_lmc_admin() TO authenticated;

-- Auth users are shared with the high-school app, so an LMC profile is created
-- the first time a user opens this app rather than by a trigger on auth.users.
CREATE OR REPLACE FUNCTION public.ensure_lmc_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.lmc_profiles (user_id, display_name)
  SELECT u.id, COALESCE(NULLIF(u.raw_user_meta_data->>'display_name', ''), 'Student')
  FROM auth.users u
  WHERE u.id = auth.uid()
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_lmc_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_lmc_profile() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Remember whether a problem was ever published.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lmc_mark_problem_published()
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

DROP TRIGGER IF EXISTS lmc_problems_mark_published ON public.lmc_problems;
CREATE TRIGGER lmc_problems_mark_published
  BEFORE INSERT OR UPDATE ON public.lmc_problems
  FOR EACH ROW
  EXECUTE FUNCTION public.lmc_mark_problem_published();

-- ---------------------------------------------------------------------------
-- 4. Update the student's LMC profile and the problem's submission order
--    whenever an answer is submitted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lmc_update_profile_on_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lmc_profiles
  SET
    total_points = total_points + NEW.points_earned,
    all_time_points = all_time_points + NEW.points_earned,
    problems_solved = CASE WHEN NEW.is_correct THEN problems_solved + 1 ELSE problems_solved END,
    all_time_problems_solved = CASE WHEN NEW.is_correct THEN all_time_problems_solved + 1 ELSE all_time_problems_solved END,
    updated_at = now()
  WHERE user_id = NEW.user_id;

  -- Earlier submissions get lower indices.
  UPDATE public.lmc_problems
  SET submitted_user_ids = CASE
    WHEN NEW.user_id = ANY(submitted_user_ids) THEN submitted_user_ids
    ELSE array_append(submitted_user_ids, NEW.user_id)
  END
  WHERE id = NEW.problem_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lmc_on_submission_created ON public.lmc_submissions;
CREATE TRIGGER lmc_on_submission_created
  AFTER INSERT ON public.lmc_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.lmc_update_profile_on_submission();

-- ---------------------------------------------------------------------------
-- 5. Start a new school year (admin only): zero the yearly leaderboard,
--    keep all-time totals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_lmc_yearly_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_lmc_admin() THEN
    RAISE EXCEPTION 'Only admins can reset the leaderboard';
  END IF;

  -- `WHERE true` is required: Supabase's `safeupdate` extension rejects any
  -- UPDATE without a WHERE clause.
  UPDATE public.lmc_profiles
  SET
    total_points = 0,
    problems_solved = 0,
    current_streak = 0,
    updated_at = now()
  WHERE true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_lmc_yearly_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_lmc_yearly_leaderboard() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Deactivate problems once their due date passes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_expired_lmc_problems()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.lmc_problems
  SET is_active = false, updated_at = now()
  WHERE is_active AND due_date <= now();
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_expired_lmc_problems() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- cron.schedule replaces an existing job with the same name.
SELECT cron.schedule(
  'deactivate-expired-lmc-problems',
  '* * * * *',
  $$SELECT public.deactivate_expired_lmc_problems()$$
);

-- ---------------------------------------------------------------------------
-- 7. Row-level security policies
-- ---------------------------------------------------------------------------

-- Problems. The time checks make a problem close exactly at its due date,
-- even between cron runs.
DROP POLICY IF EXISTS "Anyone can view current problems" ON public.lmc_problems;
CREATE POLICY "Anyone can view current problems"
  ON public.lmc_problems
  FOR SELECT
  USING (is_active AND NOT is_archived AND due_date > now());

DROP POLICY IF EXISTS "Anyone can view past problems" ON public.lmc_problems;
CREATE POLICY "Anyone can view past problems"
  ON public.lmc_problems
  FOR SELECT
  USING (was_published AND NOT is_archived AND due_date <= now());

DROP POLICY IF EXISTS "Admins can manage problems" ON public.lmc_problems;
CREATE POLICY "Admins can manage problems"
  ON public.lmc_problems
  FOR ALL
  TO authenticated
  USING (public.is_lmc_admin())
  WITH CHECK (public.is_lmc_admin());

-- Profiles: readable by everyone (leaderboard). No client INSERT/UPDATE policy:
-- profiles are created by ensure_lmc_profile() and changed only by the
-- SECURITY DEFINER functions above, so students can't edit their own points
-- or make themselves admins.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.lmc_profiles;
CREATE POLICY "Profiles are viewable by everyone"
  ON public.lmc_profiles
  FOR SELECT
  USING (true);

-- Submissions.
DROP POLICY IF EXISTS "Users can view their own submissions" ON public.lmc_submissions;
CREATE POLICY "Users can view their own submissions"
  ON public.lmc_submissions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own submissions" ON public.lmc_submissions;
CREATE POLICY "Users can create their own submissions"
  ON public.lmc_submissions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.lmc_problems p
      WHERE p.id = problem_id
        AND p.is_active
        AND p.due_date > now()
    )
  );

-- Solutions: admins manage them; students can read them after the due date.
DROP POLICY IF EXISTS "Admins can manage solutions" ON public.lmc_problem_solutions;
CREATE POLICY "Admins can manage solutions"
  ON public.lmc_problem_solutions
  FOR ALL
  TO authenticated
  USING (public.is_lmc_admin())
  WITH CHECK (public.is_lmc_admin());

DROP POLICY IF EXISTS "Solutions are visible after the due date" ON public.lmc_problem_solutions;
CREATE POLICY "Solutions are visible after the due date"
  ON public.lmc_problem_solutions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lmc_problems p
      WHERE p.id = problem_id
        AND p.was_published
        AND NOT p.is_archived
        AND p.due_date <= now()
    )
  );
