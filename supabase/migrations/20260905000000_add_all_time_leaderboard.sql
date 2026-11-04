-- Add all-time point/solve tracking that survives yearly leaderboard resets
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS all_time_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_time_problems_solved INTEGER NOT NULL DEFAULT 0;

-- Backfill all-time totals from existing (current year) totals
UPDATE public.profiles
SET
  all_time_points = total_points,
  all_time_problems_solved = problems_solved
WHERE all_time_points = 0 AND all_time_problems_solved = 0;

-- Update the submission trigger to accumulate all-time totals alongside
-- the current-year totals
CREATE OR REPLACE FUNCTION public.update_profile_on_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    total_points = total_points + NEW.points_earned,
    all_time_points = all_time_points + NEW.points_earned,
    problems_solved = CASE WHEN NEW.is_correct THEN problems_solved + 1 ELSE problems_solved END,
    all_time_problems_solved = CASE WHEN NEW.is_correct THEN all_time_problems_solved + 1 ELSE all_time_problems_solved END,
    updated_at = now()
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- Admin-only function to start a new school year: zeroes out the
-- current-year leaderboard fields while preserving all-time totals
CREATE OR REPLACE FUNCTION public.reset_yearly_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can reset the leaderboard';
  END IF;

  -- `WHERE true` is required: Supabase's Postgres enables the `safeupdate`
  -- extension, which rejects any UPDATE lacking a syntactic WHERE clause.
  UPDATE public.profiles
  SET
    total_points = 0,
    problems_solved = 0,
    current_streak = 0,
    updated_at = now()
  WHERE true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_yearly_leaderboard() TO authenticated;
