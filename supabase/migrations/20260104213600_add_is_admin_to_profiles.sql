-- Add is_admin column to profiles table
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Create a policy to allow admins to view all profiles
create policy "Admins can view all profiles"
on public.profiles for select
to authenticated
using (auth.uid() in (
  select user_id from public.profiles where is_admin = true
));

-- Create a policy to allow users to view their own profile
create policy "Users can view their own profile"
on public.profiles for select
to authenticated
using (auth.uid() = user_id);

-- Create a policy to allow admins to update any profile
-- create policy "Admins can update any profile"
-- on public.profiles for update
-- to authenticated
-- using (auth.uid() in (
--   select user_id from public.profiles where is_admin = true
-- ));

-- Create a policy to allow users to update their own profile
-- create policy "Users can update their own profile"
-- on public.profiles for update
-- to authenticated
-- using (auth.uid() = user_id);
