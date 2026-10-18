-- Recreate the Super Admin (annasabbas01@gmail.com). Run manually in the Supabase SQL editor.
-- Does NOT touch public.owner_portal_access() or any other function/policy.
--
-- STEP 1: run section 1 (deletes every Super Admin account, including annasabbas01).
-- STEP 2: in the dashboard: Authentication > Users > Add user > Create new user.
--         Email: annasabbas01@gmail.com, set a password, tick "Auto Confirm User".
-- STEP 3: run section 3 (gives that user the active super_admin role).

-- ===== SECTION 1: delete all Super Admin accounts =====
delete from auth.users
 where id in (
   select p.id from public.profiles p
   join public.roles r on r.id = p.role_id
   where r.key = 'super_admin'
 )
    or lower(email) = 'annasabbas01@gmail.com';

select count(*) as remaining_super_admins
from public.profiles p join public.roles r on r.id = p.role_id
where r.key = 'super_admin';   -- expect 0

-- ===== SECTION 3: run AFTER creating the user in the dashboard =====
update public.profiles
   set role_id = (select id from public.roles where key = 'super_admin'),
       status = 'active',
       full_name = 'Anna Abbas'
 where lower(email) = 'annasabbas01@gmail.com';

select p.email, r.key as role, p.status
from public.profiles p join public.roles r on r.id = p.role_id
where lower(p.email) = 'annasabbas01@gmail.com';   -- expect super_admin / active
