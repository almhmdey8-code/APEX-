do $$
declare
  pol record;
  anon_guard text := '((select auth.jwt() ->> ''is_anonymous'') is distinct from ''true'')';
  new_using text;
  new_check text;
begin
  for pol in
    select n.nspname as schema_name,
           c.relname as table_name,
           p.polname as policy_name,
           p.polcmd as command,
           pg_get_expr(p.polqual, p.polrelid) as using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]
      and coalesce(pg_get_expr(p.polqual, p.polrelid), '') not ilike '%is_anonymous%'
      and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not ilike '%is_anonymous%'
  loop
    new_using := case
      when pol.using_expr is null then null
      else '(' || pol.using_expr || ') and ' || anon_guard
    end;
    new_check := case
      when pol.check_expr is null then null
      else '(' || pol.check_expr || ') and ' || anon_guard
    end;

    if pol.command = 'r' then
      execute format('alter policy %I on %I.%I using (%s)',
        pol.policy_name, pol.schema_name, pol.table_name, new_using);
    elsif pol.command = 'a' then
      execute format('alter policy %I on %I.%I with check (%s)',
        pol.policy_name, pol.schema_name, pol.table_name, new_check);
    elsif pol.command = 'w' then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
        pol.policy_name, pol.schema_name, pol.table_name, new_using, new_check);
    elsif pol.command = 'd' then
      execute format('alter policy %I on %I.%I using (%s)',
        pol.policy_name, pol.schema_name, pol.table_name, new_using);
    elsif pol.command = '*' then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
        pol.policy_name, pol.schema_name, pol.table_name, new_using, new_check);
    end if;
  end loop;
end $$;
