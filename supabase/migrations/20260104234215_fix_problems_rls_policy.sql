-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Enable all for admins" ON public.problems;

-- Create new policy
CREATE POLICY "Enable all for admins" ON public.problems
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Enable RLS if not already enabled
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
