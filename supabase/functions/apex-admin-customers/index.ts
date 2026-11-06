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
    if (!token) return json({ error: "يلزم تسجيل دخول المدير" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "جلسة الدخول غير صالحة" }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: adminRow, error: adminError } = await admin
      .from("apex_admins").select("user_id").eq("user_id", authData.user.id).maybeSingle();
    if (adminError) throw adminError;
    if (!adminRow || (authData.user.email || "").toLowerCase() !== "apex.1.shopping@gmail.com") {
      return json({ error: "غير مصرح بعرض حسابات العملاء" }, 403);
    }

    const users: any[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
      if (error) throw error;
      users.push(...(data.users || []));
      if (!data.users || data.users.length < 500) break;
    }
    const { data: orders, error: ordersError } = await admin
      .from("apex_orders")
      .select("user_id,customer_name,phone,status")
      .not("user_id", "is", null);
    if (ordersError) throw ordersError;

    const byUser = new Map<string, any>();
    for (const order of orders || []) {
      const id = order.user_id;
      if (!id) continue;
      const row = byUser.get(id) || { accepted: 0, rejected: 0, pending: 0, total: 0, orderName: "", orderPhone: "" };
      row.total++;
      if (["confirmed", "processing", "shipped", "delivered"].includes(order.status)) row.accepted++;
      else if (order.status === "cancelled") row.rejected++;
      else row.pending++;
      if (order.customer_name && !row.orderName) row.orderName = order.customer_name;
      if (order.phone && !row.orderPhone) row.orderPhone = order.phone;
      byUser.set(id, row);
    }

    const customers = users.map((u) => {
      const stats = byUser.get(u.id) || { accepted: 0, rejected: 0, pending: 0, total: 0, orderName: "", orderPhone: "" };
      const meta = u.user_metadata || {};
      const name = String(meta.full_name || meta.name || meta.display_name || stats.orderName || "عميل APEX").slice(0, 120);
      const phone = String(meta.phone || meta.phone_number || stats.orderPhone || "").slice(0, 40);
      return { id: u.id, name, phone, accepted_orders: stats.accepted, rejected_orders: stats.rejected, pending_orders: stats.pending, total_orders: stats.total };
    });
    customers.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return json({ customers });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "تعذر تحميل حسابات العملاء" }, 400);
  }
});