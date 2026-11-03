-- ============================================================================
-- Members-only site with admin-approved sign-ups
--
-- STATUS: PROPOSED. NOT APPLIED. Nothing here has been run against the live
-- project. Review it, then paste the whole file into the Supabase SQL editor
-- and run it once. It is wrapped in a transaction: if any statement fails,
-- nothing changes.
--
-- What it does:
--   1. Adds a `members` table: one row per account, status pending /
--      approved / rejected.
--   2. Every new sign-up gets a pending row automatically.
--   3. Existing accounts are added: admins as approved, everyone else pending.
--   4. Making someone an admin also approves their membership.
--   5. Viewing becomes members-only. The anonymous (signed-out) role can no
--      longer read players, games or entries. Approved members and admins can
--      read finalized games. Admins keep full read/write access, as before.
--   6. Admins can see and decide on every member; a member can see only
--      their own row (to know whether they're approved yet).
--
-- What it does NOT change: the existing tables' columns, the balance and
-- lock triggers, the admin write policies, or the player_stats view (it is
-- security_invoker, so it follows the new read policies by itself).
--
-- To undo: see the "Rollback" block at the bottom.
-- ============================================================================

begin;

-- 1. Members -----------------------------------------------------------------

create table members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text,
  -- The name they typed when signing up, so admins know who "zr88@…" is.
  display_name text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references auth.users (id) on delete set null
);

create index members_status_idx on members (status);

alter table members enable row level security;

-- Stamp who decided and when, whenever the status changes. Done in the
-- database so the browser's clock and claims don't matter.
create or replace function members_stamp_decision()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.decided_at := now();
    new.decided_by := auth.uid();
  end if;
  return new;
end; $$;

create trigger trg_members_decision
  before update on members for each row
  execute function members_stamp_decision();

-- 2. New sign-ups start as pending -------------------------------------------

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.members (user_id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), '')
  )
  on conflict (user_id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users for each row
  execute function handle_new_user();

-- 3. Existing accounts -------------------------------------------------------

insert into members (user_id, email, status, decided_at)
select
  u.id,
  u.email,
  case when exists (select 1 from admins a where a.user_id = u.id) then 'approved' else 'pending' end,
  case when exists (select 1 from admins a where a.user_id = u.id) then now() end
from auth.users u
on conflict (user_id) do nothing;

-- 4. Admins are always approved members --------------------------------------

create or replace function admins_approve_member()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  update members set status = 'approved' where user_id = new.user_id;
  return new;
end; $$;

create trigger trg_admins_approve_member
  after insert on admins for each row
  execute function admins_approve_member();

-- 5. Members-only reads ------------------------------------------------------

-- True for admins and approved members. security definer so it can read
-- `members` regardless of the caller's own access to that table.
create or replace function is_member()
returns boolean language sql stable security definer
set search_path = public as $$
  select is_admin() or exists (
    select 1 from members where user_id = auth.uid() and status = 'approved'
  );
$$;

drop policy players_public_read on players;
create policy players_member_read on players
  for select to authenticated using (is_member());

drop policy games_public_read on games;
create policy games_member_read on games
  for select to authenticated using (status = 'final' and is_member());

drop policy entries_public_read on game_entries;
create policy entries_member_read on game_entries
  for select to authenticated
  using (is_member() and exists (select 1 from games g
                                 where g.id = game_entries.game_id and g.status = 'final'));

-- 6. Who can see and change membership --------------------------------------

create policy members_self_read on members
  for select to authenticated using (user_id = auth.uid());

create policy members_admin_read on members
  for select to authenticated using (is_admin());

create policy members_admin_update on members
  for update to authenticated using (is_admin()) with check (is_admin());

-- Admins can see who the other admins are (the Members screen labels them).
create policy admins_admin_read on admins
  for select to authenticated using (is_admin());

commit;

-- ============================================================================
-- Rollback (only if you need to undo the above; run as one block)
-- ============================================================================
-- begin;
-- drop policy admins_admin_read on admins;
-- drop policy entries_member_read on game_entries;
-- drop policy games_member_read on games;
-- drop policy players_member_read on players;
-- create policy players_public_read on players
--   for select to anon, authenticated using (true);
-- create policy games_public_read on games
--   for select to anon, authenticated using (status = 'final');
-- create policy entries_public_read on game_entries
--   for select to anon, authenticated
--   using (exists (select 1 from games g
--                  where g.id = game_entries.game_id and g.status = 'final'));
-- drop trigger trg_admins_approve_member on admins;
-- drop trigger on_auth_user_created on auth.users;
-- drop function admins_approve_member();
-- drop function handle_new_user();
-- drop function is_member();
-- drop table members;            -- also drops its trigger and policies
-- drop function members_stamp_decision();
-- commit;
