-- Keep supplier contacts alongside the existing supplier catalogue used by
-- product variants and purchase orders. No new customer or supplier table.
alter table public.suppliers
  add column if not exists contact_name text;

create unique index if not exists suppliers_contact_email_unique
  on public.suppliers (lower(btrim(email)))
  where nullif(btrim(email), '') is not null;

create unique index if not exists suppliers_contact_phone_unique
  on public.suppliers (regexp_replace(phone, '[^0-9]', '', 'g'))
  where nullif(regexp_replace(phone, '[^0-9]', '', 'g'), '') is not null;
