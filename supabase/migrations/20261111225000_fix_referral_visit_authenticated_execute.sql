-- The referral visit function intentionally supports anonymous tracking.
-- Signed-in customers also call it when opening referral links, so grant both roles.
GRANT EXECUTE ON FUNCTION public.apex_track_referral_visit(text, text, text) TO authenticated;
