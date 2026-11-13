import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "يرجى تسجيل الدخول لإرسال الطلب" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error: authError } = await auth.auth.getUser(token);
    if (authError || !data.user) return json({ error: "جلسة الدخول غير صالحة" }, 401);

    const body = await req.json();
    const name = String(body.customer_name || "").trim();
    const phone = String(body.phone || "").trim();
    const address = String(body.address || "").trim();
    const deliveryCountry = String(body.delivery_country || "").trim().toUpperCase();
    let notes = String(body.notes || "").slice(0, 700);
    const location = body.delivery_location;
    if (location != null) {
      const lat = Number(location.latitude);
      const lng = Number(location.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return json({ error: "إحداثيات موقع التوصيل غير صالحة" }, 400);
      }
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      // Stable machine-readable marker for APEX apps/admin and fulfillment workflows.
      notes = (notes + "\nAPEX_GEO_V1=" + JSON.stringify({ lat, lng, maps_url: mapsUrl })).slice(0, 1000);
    }
    const shipping = String(body.shipping_method || "").slice(0, 100);
    const requestId = String(body.request_id || "");
    const methodId = Number(body.payment_method_id);
    const raw = Array.isArray(body.items) ? body.items : [];
    if (!name || !phone || !["SA", "YE"].includes(deliveryCountry) || !Number.isSafeInteger(methodId) || methodId <= 0 ||
        raw.length < 1 || raw.length > 40 || !/^[0-9a-f-]{36}$/i.test(requestId)) {
      return json({ error: "بيانات الطلب غير مكتملة" }, 400);
    }
    const items = raw.map((x: any) => ({ id: Number(x.id ?? x.product_id), quantity: Number(x.quantity) }));
    if (items.some((x: any) => !Number.isSafeInteger(x.id) || x.id <= 0 ||
        !Number.isSafeInteger(x.quantity) || x.quantity < 1 || x.quantity > 20)) {
      return json({ error: "قائمة المنتجات غير صالحة" }, 400);
    }
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: orderId, error } = await admin.rpc("apex_create_order_backend_v2", {
      p_user_id: data.user.id,
      p_customer_name: name,
      p_phone: phone,
      p_address: address,
      p_delivery_country: deliveryCountry,
      p_notes: notes,
      p_items: items,
      p_shipping_method: shipping,
      p_payment_method_id: methodId,
      p_request_id: requestId,
    });
    if (error) throw error;
    return json({ success: true, order_id: orderId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "تعذر إنشاء الطلب" }, 400);
  }
});