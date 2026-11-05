-- Hide only incomplete or duplicate demo products; preserve their records for admin correction.
update public.apex_products
set active=false, updated_at=now()
where id=2
  and name='سماعات لاسلكية'
  and price is null;

update public.apex_products p
set active=false, updated_at=now()
where p.id=21
  and p.name='حقيبة ظهر'
  and exists (
    select 1 from public.apex_products original
    where original.id=6
      and original.name=p.name
      and original.price=p.price
      and original.image_url=p.image_url
  );
