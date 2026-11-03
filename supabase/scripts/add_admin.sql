-- ============================================================================
-- Make an existing account an admin, by email.
--
-- 1. The account must exist first, either:
--      - they sign up in the app (Request access), or
--      - you create it: Authentication → Users → Add user, and tick
--        "Auto Confirm User" so they can sign in straight away.
-- 2. Change the email on the line marked "CHANGE THIS".
-- 3. Paste this file into the Supabase SQL editor and run it.
--
-- Safe to run twice. Being an admin also approves them as a member (the
-- members SQL does that automatically).
-- ============================================================================

begin;

do $$
declare
  v_email text := 'new.admin@example.com';  -- CHANGE THIS
  v_user  uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(trim(v_email));
  if v_user is null then
    raise exception 'No account with email "%". Create it first (step 1 at the top of this file).', v_email;
  end if;
  insert into admins (user_id) values (v_user) on conflict (user_id) do nothing;
end $$;

commit;

-- Result: everyone who is an admin now. The new one should be listed, with
-- member_status "approved".
select u.email, a.added_at, m.status as member_status
from admins a
join auth.users u on u.id = a.user_id
left join members m on m.user_id = a.user_id
order by a.added_at;
