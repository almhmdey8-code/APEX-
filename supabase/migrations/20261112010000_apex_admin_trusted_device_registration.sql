create extension if not exists pgcrypto;

create table if not exists public.apex_admin_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  device_label text not null default 'جهاز المدير',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(user_id, device_id)
);
alter table public.apex_admin_trusted_devices enable row level security;
revoke all on public.apex_admin_trusted_devices from anon, authenticated;

create table if not exists public.apex_admin_device_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  device_label text not null default 'جهاز مدير جديد',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.apex_admin_device_invites enable row level security;
revoke all on public.apex_admin_device_invites from anon, authenticated;

create or replace function public.apex_admin_require_aal2()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'admin_aal2_required' using errcode='42501';
  end if;
  if not exists (select 1 from public.apex_admins a where a.user_id=v_uid) then
    raise exception 'admin_access_required' using errcode='42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public.apex_admin_register_device(p_device_id uuid, p_device_label text default 'جهاز المدير')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_uid uuid;
begin
  v_uid := public.apex_admin_require_aal2();
  insert into public.apex_admin_trusted_devices(user_id,device_id,device_label)
  values(v_uid,p_device_id,left(coalesce(nullif(trim(p_device_label),''),'جهاز المدير'),80))
  on conflict(user_id,device_id) do update
    set device_label=excluded.device_label,last_seen_at=now();
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.apex_admin_create_device_invite(p_device_label text default 'جهاز مدير جديد')
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare v_uid uuid; v_token text;
begin
  v_uid := public.apex_admin_require_aal2();
  v_token := encode(gen_random_bytes(32),'hex');
  insert into public.apex_admin_device_invites(user_id,token_hash,device_label,expires_at)
  values(v_uid,encode(digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),
    left(coalesce(nullif(trim(p_device_label),''),'جهاز مدير جديد'),80),now()+interval '10 minutes');
  return jsonb_build_object('token',v_token,'expires_at',now()+interval '10 minutes');
end;
$$;

create or replace function public.apex_admin_claim_device_invite(p_token text, p_device_id uuid, p_device_label text default 'جهاز مدير جديد')
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare v_uid uuid; v_invite public.apex_admin_device_invites%rowtype;
begin
  v_uid := public.apex_admin_require_aal2();
  if p_token is null or length(p_token) <> 64 then
    raise exception 'invalid_or_expired_device_invite' using errcode='22023';
  end if;
  select * into v_invite
  from public.apex_admin_device_invites
  where user_id=v_uid
    and token_hash=encode(digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
    and used_at is null and expires_at>now()
  for update;
  if not found then
    raise exception 'invalid_or_expired_device_invite' using errcode='22023';
  end if;
  update public.apex_admin_device_invites set used_at=now() where id=v_invite.id;
  insert into public.apex_admin_trusted_devices(user_id,device_id,device_label)
  values(v_uid,p_device_id,left(coalesce(nullif(trim(p_device_label),''),v_invite.device_label),80))
  on conflict(user_id,device_id) do update set device_label=excluded.device_label,last_seen_at=now();
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.apex_admin_list_trusted_devices()
returns table(id uuid, device_id uuid, device_label text, created_at timestamptz, last_seen_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_uid uuid;
begin
  v_uid := public.apex_admin_require_aal2();
  return query select d.id,d.device_id,d.device_label,d.created_at,d.last_seen_at
    from public.apex_admin_trusted_devices d
    where d.user_id=v_uid order by d.last_seen_at desc;
end;
$$;

create or replace function public.apex_admin_revoke_trusted_device(p_device_row_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_uid uuid;
begin
  v_uid := public.apex_admin_require_aal2();
  delete from public.apex_admin_trusted_devices
  where id=p_device_row_id and user_id=v_uid;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.apex_admin_require_aal2() from public, anon, authenticated;
revoke all on function public.apex_admin_register_device(uuid,text) from public, anon;
revoke all on function public.apex_admin_create_device_invite(text) from public, anon;
revoke all on function public.apex_admin_claim_device_invite(text,uuid,text) from public, anon;
revoke all on function public.apex_admin_list_trusted_devices() from public, anon;
revoke all on function public.apex_admin_revoke_trusted_device(uuid) from public, anon;
grant execute on function public.apex_admin_register_device(uuid,text) to authenticated;
grant execute on function public.apex_admin_create_device_invite(text) to authenticated;
grant execute on function public.apex_admin_claim_device_invite(text,uuid,text) to authenticated;
grant execute on function public.apex_admin_list_trusted_devices() to authenticated;
grant execute on function public.apex_admin_revoke_trusted_device(uuid) to authenticated;
