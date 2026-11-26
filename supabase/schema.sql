-- Bomb site — shared opportunity tracker schema
-- Run once in Supabase SQL Editor. Replace workspace/member seed details if desired.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

do $$ begin
  create type public.opportunity_type as enum (
    'Scholarship', 'Internship', 'Fellowship', 'Grant', 'Competition',
    'Conference', 'Volunteer', 'Other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.progress_status as enum (
    'not_started', 'in_progress', 'submitted', 'response', 'not_interested'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id text not null check (member_id in ('imran', 'elijah')),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null unique,
  created_at timestamptz not null default now(),
  primary key (workspace_id, member_id)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  organization text,
  type public.opportunity_type not null default 'Other',
  deadline date,
  link text,
  location text,
  notes text,
  created_by text not null check (created_by in ('imran', 'elijah')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trackers (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  member_id text not null check (member_id in ('imran', 'elijah')),
  status public.progress_status not null default 'not_started',
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  date_applied date,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  outcome text check (outcome is null or outcome in ('Offer', 'Rejected', 'Interview', 'Waitlisted', 'Other')),
  response_note text,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, member_id),
  check (
    (status = 'response' and locked = true and outcome is not null)
    or (status <> 'response' and locked = false)
  ),
  check (status <> 'response' or outcome <> 'Rejected' or nullif(btrim(response_note), '') is not null)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  author_id text not null check (author_id in ('imran', 'elijah')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities(id) on delete set null,
  actor_id text not null check (actor_id in ('imran', 'elijah')),
  action text not null check (action in ('created', 'edited', 'deleted', 'status_changed', 'response_logged', 'commented')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The workspace and allowed emails are intentionally fixed for this two-person board.
insert into public.workspaces (id, name)
values ('e72ec8e1-640b-4e58-b474-902691a1c3df', 'Bomb site')
on conflict (name) do nothing;

-- Security-definer helpers are kept in a non-exposed schema.
create or replace function private.is_bomb_site_member()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and lower(u.email) in ('ogungbayiimran@gmail.com', 'oloyedeelijah23@gmail.com')
      and exists (
        select 1 from public.workspace_members wm
        where wm.user_id = u.id
          and wm.workspace_id = 'e72ec8e1-640b-4e58-b474-902691a1c3df'::uuid
      )
  );
$$;
revoke all on function private.is_bomb_site_member() from public, anon;
grant execute on function private.is_bomb_site_member() to authenticated;

create or replace function private.current_member_id()
returns text
language sql stable security definer
set search_path = ''
as $$
  select wm.member_id from public.workspace_members wm
  where wm.user_id = (select auth.uid())
    and wm.workspace_id = 'e72ec8e1-640b-4e58-b474-902691a1c3df'::uuid
  limit 1;
$$;
revoke all on function private.current_member_id() from public, anon;
grant execute on function private.current_member_id() to authenticated;

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.prevent_response_unlock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.locked then
    raise exception 'Confirmed responses are locked and cannot be changed';
  end if;
  if new.status = 'response' then
    new.locked := true;
    if new.outcome is null then
      raise exception 'Choose an outcome before confirming a response';
    end if;
    if new.outcome = 'Rejected' and nullif(btrim(new.response_note), '') is null then
      raise exception 'A rejection reason is required';
    end if;
  else
    new.locked := false;
    new.outcome := null;
    new.response_note := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.guard_activity_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.actor_id <> private.current_member_id() then
    raise exception 'Activity actor must be the signed-in member';
  end if;
  return new;
end;
$$;

-- Automatically add exactly one progress row per member when an opportunity is created.
create or replace function private.create_default_trackers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trackers (opportunity_id, member_id)
  values (new.id, 'imran'), (new.id, 'elijah')
  on conflict (opportunity_id, member_id) do nothing;
  return new;
end;
$$;

-- Attach signed-in users by their hardcoded email. No client-side password or service key.
create or replace function public.join_bomb_site()
returns table(member_id text, display_name text, workspace_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_member text;
  v_name text;
  v_workspace uuid := 'e72ec8e1-640b-4e58-b474-902691a1c3df'::uuid;
begin
  select lower(u.email) into v_email from auth.users u where u.id = (select auth.uid());
  if v_email = 'ogungbayiimran@gmail.com' then
    v_member := 'imran'; v_name := 'Imran';
  elsif v_email = 'oloyedeelijah23@gmail.com' then
    v_member := 'elijah'; v_name := 'Elijah';
  else
    raise exception 'This account is not on the Bomb site member list';
  end if;
  insert into public.workspace_members (workspace_id, member_id, user_id, display_name, email)
  values (v_workspace, v_member, (select auth.uid()), v_name, v_email)
  on conflict (workspace_id, member_id) do update
    set user_id = excluded.user_id, display_name = excluded.display_name, email = excluded.email;
  return query select v_member, v_name, v_workspace;
end;
$$;
revoke all on function public.join_bomb_site() from public, anon;
grant execute on function public.join_bomb_site() to authenticated;

-- RLS on every exposed table.
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.opportunities enable row level security;
alter table public.trackers enable row level security;
alter table public.comments enable row level security;
alter table public.activity enable row level security;

-- Membership records are private; members can see their own row only.
drop policy if exists "members read own membership" on public.workspace_members;
create policy "members read own membership" on public.workspace_members
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "members read workspace" on public.workspaces;
create policy "members read workspace" on public.workspaces
for select to authenticated using ((select private.is_bomb_site_member()) and id = 'e72ec8e1-640b-4e58-b474-902691a1c3df'::uuid);

-- Shared opportunity cards: both members can add/edit/delete.
drop policy if exists "members read opportunities" on public.opportunities;
create policy "members read opportunities" on public.opportunities
for select to authenticated using ((select private.is_bomb_site_member()) and workspace_id = 'e72ec8e1-640b-4e58-b474-902691a1c3df'::uuid);
drop policy if exists "members add opportunities" on public.opportunities;
create policy "members add opportunities" on public.opportunities
for insert to authenticated with check ((select private.is_bomb_site_member()) and workspace_id = 'e72ec8e1-640b-4e58-b474-902691a1c3df'::uuid and created_by = (select private.current_member_id()));
drop policy if exists "members edit opportunities" on public.opportunities;
create policy "members edit opportunities" on public.opportunities
for update to authenticated using ((select private.is_bomb_site_member()) and workspace_id = 'e72ec8e1-640b-4e58-b474-902691a1c3df'::uuid)
with check ((select private.is_bomb_site_member()) and workspace_id = 'e72ec8e1-640b-4e58-b474-902691a1c3df'::uuid);
drop policy if exists "members delete opportunities" on public.opportunities;
create policy "members delete opportunities" on public.opportunities
for delete to authenticated using ((select private.is_bomb_site_member()) and workspace_id = 'e72ec8e1-640b-4e58-b474-902691a1c3df'::uuid);

-- Both may see and update either person's progress, matching the shared-board agreement.
-- Locked rows remain protected by the database trigger.
drop policy if exists "members read trackers" on public.trackers;
create policy "members read trackers" on public.trackers
for select to authenticated using ((select private.is_bomb_site_member()));
drop policy if exists "members edit trackers" on public.trackers;
create policy "members edit trackers" on public.trackers
for update to authenticated using ((select private.is_bomb_site_member())) with check ((select private.is_bomb_site_member()));

-- Comments and activity are shared and visible to both members.
drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments
for select to authenticated using ((select private.is_bomb_site_member()));
drop policy if exists "members add comments as self" on public.comments;
create policy "members add comments as self" on public.comments
for insert to authenticated with check ((select private.is_bomb_site_member()) and author_id = (select private.current_member_id()));
drop policy if exists "members read activity" on public.activity;
create policy "members read activity" on public.activity
for select to authenticated using ((select private.is_bomb_site_member()));
drop policy if exists "members add activity as self" on public.activity;
create policy "members add activity as self" on public.activity
for insert to authenticated with check ((select private.is_bomb_site_member()) and actor_id = (select private.current_member_id()));

-- Keep internal tables available via Data API but constrained by RLS.
grant select on public.workspaces, public.workspace_members, public.opportunities, public.trackers, public.comments, public.activity to authenticated;
grant insert, update, delete on public.opportunities to authenticated;
grant update on public.trackers to authenticated;
grant insert on public.comments, public.activity to authenticated;

-- Trigger housekeeping.
drop trigger if exists opportunities_touch on public.opportunities;
create trigger opportunities_touch before update on public.opportunities
for each row execute function private.touch_updated_at();
drop trigger if exists opportunities_default_trackers on public.opportunities;
create trigger opportunities_default_trackers after insert on public.opportunities
for each row execute function private.create_default_trackers();
drop trigger if exists trackers_guard_response on public.trackers;
create trigger trackers_guard_response before update on public.trackers
for each row execute function private.prevent_response_unlock();
drop trigger if exists activity_guard_actor on public.activity;
create trigger activity_guard_actor before insert on public.activity
for each row execute function private.guard_activity_actor();

-- Realtime publication (skip if tables are already members).
do $$ declare t text; begin
  foreach t in array array['opportunities','trackers','comments','activity'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
