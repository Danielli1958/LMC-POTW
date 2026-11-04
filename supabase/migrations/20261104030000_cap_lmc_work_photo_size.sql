-- The app compresses every work photo to ~300 KB before upload. Cap the bucket at
-- 1 MB as a hard backstop so no large file can ever be stored, even if a client
-- skips compression.
UPDATE storage.buckets
SET file_size_limit = 1048576
WHERE id = 'lmc-work-photos';
