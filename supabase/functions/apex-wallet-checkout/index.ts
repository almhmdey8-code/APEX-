import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "يجب تسجيل الدخول" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userData.user) return new Response(JSON.stringify({ error: "جلسة الدخول غير صالحة" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json();
    const name = String(body.customer_name || "").trim();
    const phone = String(body.phone || "").trim();
    const address = String(body.address || "").trim();
    const notes = String(body.notes || "").slice(0, 1000);
    const shipping = String(body.shipping_method || "توصيل إلى المنزل").slice(0, 100);
    const requestId = String(body.request_id || "");
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!name || !phone || rawItems.length < 1 || rawItems.length > 40 || !/^[0-9a-f-]{36}$/i.test(requestId)) {
      return new Response(JSON.stringify({ error: "بيانات الطلب غير مكتملة" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const items = rawItems.map((x: any) => ({ id: Number(x.id ?? x.product_id), quantity: Math.max(1, Math.min(20, Math.floor(Number(x.quantity) || 1))) }));
    if (items.some((x: any) => !Number.isSafeInteger(x.id) || x.id <= 0)) return new Response(JSON.stringify({ error: "قائمة المنتجات غير صالحة" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: orderId, error } = await admin.rpc("apex_wallet_checkout_backend", {
      p_user_id: userData.user.id,
      p_customer_name: name,
      p_phone: phone,
      p_address: address,
      p_notes: notes,
      p_items: items,
      p_shipping_method: shipping,
      p_request_id: requestId,
    });
    if (error) throw error;
    return new Response(JSON.stringify({ success: true, order_id: orderId }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "تعذر إتمام الشراء" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});