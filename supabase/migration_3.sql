-- Run once in the Supabase SQL editor (after schema.sql and migration_2.sql)
alter table winners add column if not exists rejection_reason text;
-- Tables without RLS are readable/writable with the public anon key. Turn it on everywhere.
alter table charities enable row level security;
alter table draws enable row level security;
alter table donations enable row level security;
drop policy if exists charities_public_read on charities;
create policy charities_public_read on charities for select using (true);   -- directory is public, writes are server-only
drop policy if exists own_donations on donations;
create policy own_donations on donations for select using (auth.uid() = user_id);
-- scores, subscriptions, winners, draws, storage.objects: RLS on with no policies = no direct client access; only the server (service role) reads or writes them.
