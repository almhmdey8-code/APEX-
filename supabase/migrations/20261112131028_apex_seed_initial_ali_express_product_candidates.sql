
alter table public.apex_products
  add column if not exists supplier_product_id text,
  add column if not exists supplier_source_url text,
  add column if not exists supplier_price_usd numeric,
  add column if not exists supplier_name text,
  add column if not exists supplier_positive_feedback numeric,
  add column if not exists supplier_sold_count bigint,
  add column if not exists supplier_checked_at timestamptz,
  add column if not exists sourcing_status text not null default 'manual',
  add column if not exists shipping_allowance_sar numeric not null default 25,
  add column if not exists target_profit_sar numeric not null default 20;

alter table public.apex_products
  drop constraint if exists apex_products_sourcing_status_check;
alter table public.apex_products
  add constraint apex_products_sourcing_status_check
  check (sourcing_status in ('manual','awaiting_shipping_check','ready_to_publish','published','rejected'));

create unique index if not exists apex_products_supplier_product_id_uidx
  on public.apex_products(supplier_product_id) where supplier_product_id is not null;

insert into public.apex_products
(name,category,description,image_url,price,active,stock,supplier_product_id,supplier_source_url,supplier_price_usd,supplier_name,supplier_positive_feedback,supplier_sold_count,supplier_checked_at,sourcing_status,shipping_allowance_sar,target_profit_sar)
values
('كابل شحن USB-C نايلون 240W','إلكترونيات وجوالات','كابل شحن USB-C بقدرة معلنة 240W مع شاشة رقمية؛ يجب التحقق من القدرة الفعلية وتوافق الأجهزة قبل النشر.','https://ae-pic-a1.aliexpress-media.com/kf/Sa67c2331a7554c178f16eaa952cf45a0x.jpg',null,false,0,'1005010225246671','https://dipscout.com/product/240w-nylon-usb-type-c-super-fast-charging-cable-for-samsung-xiaomi-huawei-honor-led-digita-i1005010225246671',1.68,'Cohai Store',90.3,112429,now(),'awaiting_shipping_check',25,20),
('مجموعة تنظيف منافذ وسماعات الجوال','إلكترونيات وجوالات','أدوات تنظيف صغيرة لمنافذ الشحن والسماعات والهواتف؛ يلزم فحص محتويات العبوة والخيارات قبل النشر.','https://ae-pic-a1.aliexpress-media.com/kf/S076e3a103e9849ce81b230e396ee08aer.jpg',null,false,0,'1005009983850790','https://dipscout.com/product/mobile-phone-speaker-charging-port-cleaning-set-dust-plug-for-iphone-16-15-14-earphones-cl-i1005009983850790',0.66,'Shop1105129671 Store',91.1,69919,now(),'awaiting_shipping_check',25,20),
('منظم أسلاك وكابلات مرن 1 إلى 5 متر','إلكترونيات وجوالات','منظم مرن لترتيب أسلاك الشحن وسماعات الرأس ومكتب العمل؛ السعر والكمية النهائية حسب الخيار المختار.','https://ae-pic-a1.aliexpress-media.com/kf/Se585916348c745159ee242c598574736y.jpg',null,false,0,'1005007097094437','https://dipscout.com/product/1-5m-cable-organizer-cable-management-wire-winder-tape-earphone-mouse-cord-management-ties-i1005007097094437',1.13,'Stone''s Store',98,62825,now(),'awaiting_shipping_check',25,20),
('حامل جوال مكتبي قابل للطي','إلكترونيات وجوالات','حامل مكتبي قابل للطي للهواتف والأجهزة اللوحية؛ يجب التحقق من المقاس والخامة وخيارات الشحن.','https://ae-pic-a1.aliexpress-media.com/kf/Sd9b12244f18f456e90fa0e220164a0ced.jpg',null,false,0,'1005012655734119','https://dipscout.com/product/universal-foldable-desk-phone-holder-mount-stand-for-samsung-s20-plus-ultra-note-10-iphone-i1005012655734119',1.97,'Stone''s Store',98,58553,now(),'awaiting_shipping_check',25,20)
on conflict (supplier_product_id) where supplier_product_id is not null
do update set
  name=excluded.name,category=excluded.category,description=excluded.description,
  image_url=excluded.image_url,supplier_source_url=excluded.supplier_source_url,
  supplier_price_usd=excluded.supplier_price_usd,supplier_name=excluded.supplier_name,
  supplier_positive_feedback=excluded.supplier_positive_feedback,
  supplier_sold_count=excluded.supplier_sold_count,supplier_checked_at=now(),
  sourcing_status='awaiting_shipping_check',active=false,price=null;

