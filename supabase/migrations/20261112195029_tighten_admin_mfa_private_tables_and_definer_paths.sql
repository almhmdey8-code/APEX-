-- Enforce MFA as a RESTRICTIVE policy on all remaining admin-managed tables.
-- Customer/public policies remain the row filters; admin rows/actions additionally require AAL2.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['apex_catalog_categories','apex_product_import_jobs','apex_shipping_settings']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','APEX admins require MFA AAL2',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (((SELECT auth.jwt()->>''aal'') = ''aal2'') OR (NOT EXISTS (SELECT 1 FROM public.apex_admins a WHERE a.user_id = (SELECT auth.uid())))) WITH CHECK (((SELECT auth.jwt()->>''aal'') = ''aal2'') OR (NOT EXISTS (SELECT 1 FROM public.apex_admins a WHERE a.user_id = (SELECT auth.uid()))))',
      'APEX admins require MFA AAL2', t
    );
  END LOOP;
END $$;

-- Internal credential/invite tables intentionally have no client policies.
-- Explicitly deny API roles and force RLS for non-bypass table owners.
REVOKE ALL ON TABLE public.apex_admin_device_invites, public.apex_admin_trusted_devices, public.apex_email_cron_auth FROM PUBLIC, anon, authenticated;
ALTER TABLE public.apex_admin_device_invites FORCE ROW LEVEL SECURITY;
ALTER TABLE public.apex_admin_trusted_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.apex_email_cron_auth FORCE ROW LEVEL SECURITY;

-- Remove mutable exposed schemas from SECURITY DEFINER function search paths.
ALTER FUNCTION public.apex_admin_require_aal2() SET search_path = '';
ALTER FUNCTION public.apex_admin_list_trusted_devices() SET search_path = '';
ALTER FUNCTION public.apex_admin_revoke_trusted_device(uuid) SET search_path = '';

CREATE OR REPLACE FUNCTION public.apex_admin_claim_device_invite(
  p_token text,
  p_device_id uuid,
  p_device_label text DEFAULT 'جهاز مدير جديد'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_invite public.apex_admin_device_invites%rowtype;
BEGIN
  v_uid := public.apex_admin_require_aal2();
  IF p_token IS NULL OR length(p_token) <> 64 THEN
    RAISE EXCEPTION 'invalid_or_expired_device_invite' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_invite
  FROM public.apex_admin_device_invites
  WHERE user_id = v_uid
    AND token_hash = encode(extensions.digest(pg_catalog.convert_to(p_token,'UTF8'),'sha256'),'hex')
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_or_expired_device_invite' USING ERRCODE='22023';
  END IF;
  UPDATE public.apex_admin_device_invites SET used_at = now() WHERE id = v_invite.id;
  INSERT INTO public.apex_admin_trusted_devices(user_id,device_id,device_label)
  VALUES(v_uid,p_device_id,left(coalesce(nullif(trim(p_device_label),''),v_invite.device_label),80))
  ON CONFLICT(user_id,device_id) DO UPDATE
    SET device_label=excluded.device_label,last_seen_at=now();
  RETURN jsonb_build_object('ok',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.apex_admin_create_device_invite(
  p_device_label text DEFAULT 'جهاز مدير جديد'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_token text;
BEGIN
  v_uid := public.apex_admin_require_trusted_device();
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO public.apex_admin_device_invites(user_id,token_hash,device_label,expires_at)
  VALUES(
    v_uid,
    encode(extensions.digest(pg_catalog.convert_to(v_token,'UTF8'),'sha256'),'hex'),
    left(coalesce(nullif(trim(p_device_label),''),'جهاز مدير جديد'),80),
    now()+interval '10 minutes'
  );
  RETURN jsonb_build_object('token',v_token,'expires_at',now()+interval '10 minutes');
END;
$$;

-- Acknowledging a security event is an administrative action: require MFA + trusted device.
CREATE OR REPLACE FUNCTION public.apex_ack_security_event(p_event_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := public.apex_admin_require_trusted_device();
  UPDATE public.apex_security_events
  SET acknowledged_at = now(), acknowledged_by = v_uid
  WHERE id = p_event_id AND acknowledged_at IS NULL;
  RETURN FOUND;
END;
$$;
