-- Pick Lists belong to Picking & Scan. The impersonated record guard still
-- checked the old warehouse module, hiding assigned lists from installers.
-- Keep its existing installer ownership check and all other collection rules.
do $$
declare
  source text;
  updated text;
begin
  select pg_get_functiondef(p.oid) into strict source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'impersonated_record_access'
    and pg_get_function_identity_arguments(p.oid) =
      'p_collection text, p_data jsonb, p_action text';

  if position('when ''pickLists'' then ''warehouse''' in source) = 0
     or position('if p_collection in (''pickLists'',''returns'',''productRequests'') then' in source) = 0 then
    raise exception 'Review impersonated record access before updating Pick Lists';
  end if;

  updated := replace(source,
    'when ''pickLists'' then ''warehouse''',
    'when ''pickLists'' then ''picking''');
  updated := replace(updated,
    'when ''picking'' then ''warehouse''',
    'when ''picking'' then ''picking''');
  execute updated;
end $$;
