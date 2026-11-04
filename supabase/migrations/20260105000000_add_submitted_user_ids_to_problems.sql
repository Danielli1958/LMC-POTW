-- Add submitted_user_ids array column to problems table
ALTER TABLE public.problems 
ADD COLUMN IF NOT EXISTS submitted_user_ids UUID[] DEFAULT '{}';

-- Update the function to append user_id to the problem's submitted_user_ids array
CREATE OR REPLACE FUNCTION public.update_profile_on_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update user profile
  UPDATE public.profiles
  SET 
    total_points = total_points + NEW.points_earned,
    problems_solved = CASE WHEN NEW.is_correct THEN problems_solved + 1 ELSE problems_solved END,
    updated_at = now()
  WHERE user_id = NEW.user_id;
  
  -- Append user_id to the problem's submitted_user_ids array if not already present
  -- This maintains submission order: earlier submissions have lower indices
  UPDATE public.problems
  SET submitted_user_ids = CASE 
    WHEN NEW.user_id = ANY(submitted_user_ids) THEN submitted_user_ids
    ELSE array_append(submitted_user_ids, NEW.user_id)
  END
  WHERE id = NEW.problem_id;
  
  RETURN NEW;
END;
$$;
