-- Run once in the Supabase SQL editor (after schema.sql)
alter table subscriptions add column if not exists cancel_at_period_end boolean default false;
alter table donations add column if not exists stripe_session_id text unique;
-- Private bucket for winner proof screenshots. No public/client policies: only the server (service role) can read or write.
insert into storage.buckets (id, name, public) values ('proofs', 'proofs', false) on conflict (id) do nothing;
