-- Homebase schema: one row per item, grouped by collection, owned by a signed-in user.
create table public.items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);
alter table public.items enable row level security;
create policy "items_select_own" on public.items for select to authenticated using (user_id = (select auth.uid()));
create policy "items_insert_own" on public.items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "items_update_own" on public.items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "items_delete_own" on public.items for delete to authenticated using (user_id = (select auth.uid()));
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger items_touch before update on public.items for each row execute function public.touch_updated_at();
alter publication supabase_realtime add table public.items;
