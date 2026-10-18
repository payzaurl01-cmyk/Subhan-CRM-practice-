-- TEST USERS (run manually in the Supabase SQL editor). Delete them when testing is finished:
--   delete from auth.users where email in ('crm.test.manager@example.com','crm.test.installer@example.com');
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  u record;
  uid uuid;
begin
  for u in
    select * from (values
      ('crm.test.manager@example.com',   'Test Manager',   'manager',   'Mgr-Test-7Qx4!vLp29'),
      ('crm.test.installer@example.com', 'Test Installer', 'installer', 'Ins-Test-5Rk8!wNz63')
    ) as t(email, full_name, role_key, pw)
  loop
    select id into uid from auth.users where email = u.email;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        u.email, extensions.crypt(u.pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name),
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true),
        'email', now(), now(), now());
    else
      -- User already exists: reset the password and make sure the email is confirmed.
      update auth.users
         set encrypted_password = extensions.crypt(u.pw, extensions.gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             banned_until = null, deleted_at = null
       where id = uid;
    end if;
    update public.profiles
       set role_id = (select id from public.roles where key = u.role_key),
           status = 'active', full_name = u.full_name
     where id = uid;
  end loop;
end $$;

select p.email, r.key as role, p.status
from public.profiles p join public.roles r on r.id = p.role_id
where p.email like 'crm.test.%';
