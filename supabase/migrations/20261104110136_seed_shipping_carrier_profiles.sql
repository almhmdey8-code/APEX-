
insert into public.apex_shipping_providers(provider_code,name,country_code,integration_mode,enabled,integration_status)
values
 ('aramex','أرامكس','SA','api',false,'not_configured'),
 ('smsa','سمسا','SA','api',false,'not_configured'),
 ('spl','سبل','SA','api',false,'not_configured'),
 ('naqel','ناقل','SA','api',false,'not_configured')
on conflict(provider_code) do nothing;
