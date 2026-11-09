
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('apex-store','apex-store',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Public reads APEX store images" on storage.objects;
create policy "Public reads APEX store images" on storage.objects for select to anon,authenticated using (bucket_id='apex-store');
drop policy if exists "Admins upload APEX store images" on storage.objects;
create policy "Admins upload APEX store images" on storage.objects for insert to authenticated with check (bucket_id='apex-store' and exists(select 1 from public.apex_admins a where a.user_id=(select auth.uid())));
drop policy if exists "Admins update APEX store images" on storage.objects;
create policy "Admins update APEX store images" on storage.objects for update to authenticated using (bucket_id='apex-store' and exists(select 1 from public.apex_admins a where a.user_id=(select auth.uid()))) with check (bucket_id='apex-store' and exists(select 1 from public.apex_admins a where a.user_id=(select auth.uid())));
drop policy if exists "Admins delete APEX store images" on storage.objects;
create policy "Admins delete APEX store images" on storage.objects for delete to authenticated using (bucket_id='apex-store' and exists(select 1 from public.apex_admins a where a.user_id=(select auth.uid())));
