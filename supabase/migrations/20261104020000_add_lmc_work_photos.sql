-- Students must upload a photo of their work with every LMC submission.
--
-- Photos live in a private Storage bucket at <user id>/<problem id>/<file>.
-- Students can upload into and view only their own folder; LMC admins can view all.
-- Run after 20261104000000_create_lmc_tables.sql.

-- ---------------------------------------------------------------------------
-- 1. Bucket (private; images only; 10 MB max)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lmc-work-photos',
  'lmc-work-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "LMC students can upload their own work photos" ON storage.objects;
CREATE POLICY "LMC students can upload their own work photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lmc-work-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "LMC students and admins can view work photos" ON storage.objects;
CREATE POLICY "LMC students and admins can view work photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lmc-work-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_lmc_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Submissions reference their photo
-- ---------------------------------------------------------------------------
ALTER TABLE public.lmc_submissions
  ADD COLUMN IF NOT EXISTS work_photo_path TEXT;

-- New submissions must point at a photo the student actually uploaded, in their
-- own folder, for this problem.
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
    AND work_photo_path IS NOT NULL
    AND split_part(work_photo_path, '/', 1) = auth.uid()::text
    AND split_part(work_photo_path, '/', 2) = problem_id::text
    AND EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'lmc-work-photos'
        AND o.name = work_photo_path
    )
  );

-- Admins review everyone's submissions (and their photos).
DROP POLICY IF EXISTS "Admins can view all submissions" ON public.lmc_submissions;
CREATE POLICY "Admins can view all submissions"
  ON public.lmc_submissions
  FOR SELECT
  TO authenticated
  USING (public.is_lmc_admin());
