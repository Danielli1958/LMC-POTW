-- Supabase's Postgres enables the `safeupdate` extension, which rejects any
-- UPDATE/DELETE lacking a syntactic WHERE clause (SQLSTATE 21000) -- even an
-- intentional full-table one. Add `WHERE true` so the yearly reset can run.
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

  UPDATE public.profiles
  SET
    total_points = 0,
    problems_solved = 0,
    current_streak = 0,
    updated_at = now()
  WHERE true;
END;
$$;
