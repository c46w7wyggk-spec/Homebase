-- Keys for the dayboard-feed Edge Function. Only a SHA-256 hash of each key is stored.
-- RLS is on with no policies, so only the service role (used inside the Edge Function) can read it.
create table public.dayboard_feed_keys (
  key_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);
alter table public.dayboard_feed_keys enable row level security;
revoke all on public.dayboard_feed_keys from anon, authenticated;
