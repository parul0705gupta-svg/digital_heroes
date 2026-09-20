-- Run in Supabase SQL editor (new project)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text, full_name text,
  role text not null default 'subscriber' check (role in ('subscriber','admin')),
  charity_id uuid, charity_pct int not null default 10 check (charity_pct >= 10 and charity_pct <= 100),
  stripe_customer_id text, created_at timestamptz default now()
);
create table charities (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text, image_url text,
  events jsonb default '[]', featured boolean default false, created_at timestamptz default now()
);
alter table profiles add foreign key (charity_id) references charities(id);
create table subscriptions (
  user_id uuid primary key references profiles(id) on delete cascade,
  plan text check (plan in ('monthly','yearly')), status text default 'inactive'
    check (status in ('active','inactive','cancelled','lapsed')),
  monthly_amount numeric default 0, current_period_end timestamptz, stripe_sub_id text
);
create table scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  score int not null check (score between 1 and 45),
  played_on date not null, created_at timestamptz default now(),
  unique (user_id, played_on)
);
-- Rolling window: keep only the latest 5 scores per user
create function keep_latest_5() returns trigger language plpgsql as $$
begin
  delete from scores where user_id = new.user_id and id not in (
    select id from scores where user_id = new.user_id order by played_on desc, created_at desc limit 5);
  return null;
end $$;
create trigger trg_keep_5 after insert on scores for each row execute function keep_latest_5();
create table draws (
  id uuid primary key default gen_random_uuid(),
  month text not null, mode text check (mode in ('random','algorithmic')),
  numbers int[] not null, status text default 'simulated' check (status in ('simulated','published')),
  pool jsonb, jackpot_carry numeric default 0, created_at timestamptz default now()
);
create table winners (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid references draws(id) on delete cascade, user_id uuid references profiles(id),
  tier int check (tier in (3,4,5)), amount numeric not null,
  proof_url text, verification text default 'awaiting' check (verification in ('awaiting','submitted','approved','rejected')),
  payment text default 'pending' check (payment in ('pending','paid'))
);
create table donations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id), charity_id uuid references charities(id),
  amount numeric not null, created_at timestamptz default now()
);
-- Server uses the service-role key; block direct client access
alter table profiles enable row level security; alter table scores enable row level security;
alter table subscriptions enable row level security; alter table winners enable row level security;
create policy own_profile on profiles for select using (auth.uid() = id);
