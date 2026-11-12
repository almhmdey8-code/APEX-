import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const cors = {
  "Access-Control-Allow-Origin": "https://almhmdey8-code.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-apex-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "يلزم تسجيل دخول المدير." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!url || !anon || !service) return json({ error: "backend_not_configured" }, 503);
    if (!geminiKey) return json({ error: "مفتاح Gemini غير مضبوط في أسرار Supabase." }, 503);

    const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ error: "جلسة المدير غير صالحة." }, 401);
    if ((user.email || "").toLowerCase() !== "apex.1.shopping@gmail.com") {
      return json({ error: "هذه العملية مخصصة لمدير APEX." }, 403);
    }

    let jwt: any = null;
    try {
      const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      jwt = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
    } catch { /* invalid payload */ }
    if (jwt?.aal !== "aal2") return json({ error: "أكمل التحقق الثنائي للمدير أولاً." }, 403);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: adminRow, error: adminError } = await admin
      .from("apex_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (adminError) throw adminError;
    if (!adminRow) return json({ error: "حسابك غير مسجل ضمن مديري APEX." }, 403);

    const deviceId = req.headers.get("x-apex-device-id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(deviceId)) {
      return json({ error: "هذا الجهاز غير معتمد. افتح استوديو المنتجات من جهاز مدير موثوق." }, 403);
    }
    const { data: trustedDevice, error: deviceError } = await admin
      .from("apex_admin_trusted_devices").select("device_id")
      .eq("user_id", user.id).eq("device_id", deviceId).maybeSingle();
    if (deviceError) throw deviceError;
    if (!trustedDevice) return json({ error: "هذا الجهاز غير موجود ضمن أجهزة APEX الموثوقة." }, 403);
    const { error: touchError } = await admin.from("apex_admin_trusted_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("device_id", deviceId);
    if (touchError) throw touchError;

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "بيانات الطلب غير صالحة." }, 400); }
    if (!Array.isArray(body?.images) || body.images.length < 1 || body.images.length > 5) {
      return json({ error: "أرفق صورة واحدة إلى خمس صور للمنتج." }, 400);
    }

    const parts: any[] = [];
    for (const item of body.images) {
      const mimeType = String(item?.mimeType || "");
      const data = String(item?.data || "");
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) {
        return json({ error: "نوع صورة غير مدعوم. استخدم JPG أو PNG أو WEBP أو GIF." }, 400);
      }
      if (!data || data.length > 7_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        return json({ error: "حجم إحدى الصور كبير جداً أو ملفها غير صالح. قلّل حجم الصورة ثم أعد المحاولة." }, 400);
      }
      parts.push({ inlineData: { mimeType, data } });
    }

    const requestedCount = body.count === undefined || body.count === null || body.count === "" ? 1 : Number(body.count);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 20) {
      return json({ error: "اختر عدداً صحيحاً من 1 إلى 20." }, 400);
    }

    const kind = String(body.kind || "").slice(0, 100);
    const category = String(body.category || "").slice(0, 120);
    const brand = String(body.brand || "").slice(0, 120);
    const model = String(body.model || "").slice(0, 120);
    const variant = String(body.variant || "").slice(0, 160);
    const specs = String(body.specs || "").slice(0, 3000);
    const sourceUrl = String(body.sourceUrl || "").slice(0, 1000);
    const costSar = body.costSar === null || body.costSar === undefined || body.costSar === ""
      ? null : Number(body.costSar);
    if (costSar !== null && (!Number.isFinite(costSar) || costSar < 0)) {
      return json({ error: "تكلفة المنتج غير صالحة." }, 400);
    }

    const prompt = `أنت خبير إعداد كتالوج التجارة الإلكترونية لمتجر APEX. حلّل الصور وأعد بيانات منتجات عربية دقيقة للمراجعة.
العدد المطلوب كحد أقصى: ${requestedCount}
قالب المنتج: ${kind || "غير محدد"}
القسم المختار: ${category || "اقترح القسم الأنسب"}
العلامة: ${brand || "غير محددة"}
الموديل: ${model || "غير محدد"}
اللون/المقاس/الإصدار: ${variant || "غير محدد"}
مواصفات أكدها المدير: ${specs || "لا توجد"}
رابط المورد: ${sourceUrl || "غير مرفق"}
تكلفة المورد بالريال السعودي: ${costSar === null ? "غير مدخلة" : costSar}
قواعد:
- أعد من منتج واحد إلى ${requestedCount} منتجات فقط، ولا تفرض 20.
- لا تخترع موديلات أو ألواناً أو مقاسات أو مواصفات. إذا كانت الصور تثبت منتجاً واحداً فقط فأعد واحداً فقط.
- افصل المتغيرات فقط إذا كانت ظاهرة بوضوح أو أكدها المدير.
- ضع المعلومات غير المؤكدة في missing_info ولا تعرضها كحقائق.
- لا تخترع أسعاراً أو شحناً أو جمركاً، ولا تدّع التحقق من رابط المورد.
- اكتب وصفاً عربياً واضحاً وصادقاً.
أعد JSON فقط بهذا الشكل:
{"products":[{"name":"اسم المنتج","category":"القسم","brand":"العلامة أو فارغ","model":"الموديل أو فارغ","variant":"النوع أو فارغ","description":"وصف المنتج","specifications":["مواصفة مؤكدة"],"missing_info":["معلومة تحتاج تأكيداً"],"confidence":"high أو medium أو low","review_note":"ملاحظة للمدير"}]}
`;
    parts.push({ text: prompt });
    // Try the primary Flash model, then the stable lower-cost Flash-Lite model.
    // A temporary 404/429/5xx or provider timeout must not end the product workflow immediately.
    const modelCandidates = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
    let result: any = {};
    let selectedModel = "";
    let lastStatus = 0;
    let lastReason = "provider_unavailable";

    for (const model of modelCandidates) {
      try {
        const candidate = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.25, maxOutputTokens: 1400 },
          }),
          signal: AbortSignal.timeout(16000),
        });
        const candidateData = await candidate.json().catch(() => ({}));
        if (candidate.ok) {
          result = candidateData;
          selectedModel = model;
          break;
        }
        lastStatus = candidate.status;
        lastReason = candidateData?.error?.status || "provider_http_" + candidate.status;
        console.warn("APEX product analysis model retry", model, lastReason);
        if ([400, 401, 403].includes(candidate.status)) break;
      } catch (error) {
        lastReason = error instanceof Error ? error.name : "network_failure";
        console.warn("APEX product analysis model retry", model, lastReason);
      }
    }

    if (!selectedModel) {
      console.error("Gemini product analysis unavailable", lastStatus, lastReason);
      if (lastStatus === 429) return json({ error: "وصل استهلاك Gemini إلى الحد المؤقت. انتظر قليلاً ثم أعد المحاولة." }, 429);
      if (lastStatus === 400 || lastStatus === 401 || lastStatus === 403) {
        return json({ error: "تعذر استخدام مفتاح Gemini أو أن الطلب غير مقبول. تحقق من المفتاح وصلاحياته." }, 502);
      }
      return json({ error: "خدمة تحليل الصور مشغولة حالياً. أعد المحاولة بعد قليل؛ لم يتم حفظ أي منتج تلقائياً." }, 502);
    }

    const raw = (result?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
    if (!raw) return json({ error: "لم يرجع Gemini نتيجة قابلة للقراءة." }, 502);
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      try { parsed = JSON.parse(cleaned); } catch { return json({ error: "تعذر قراءة نتيجة التحليل. أعد المحاولة." }, 502); }
    }

    const clean = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
    const list = (v: unknown) => Array.isArray(v) ? v.slice(0, 12).map((x: unknown) => clean(x, 300)).filter(Boolean) : [];
    const rawProducts = Array.isArray(parsed.products) ? parsed.products : [parsed.product || parsed];
    const products = rawProducts.slice(0, requestedCount).map((item: any) => ({
      name: clean(item.name, 180),
      category: clean(item.category, 120),
      brand: clean(item.brand, 120),
      model: clean(item.model, 120),
      variant: clean(item.variant, 160),
      description: clean(item.description, 4000),
      specifications: list(item.specifications),
      missing_info: list(item.missing_info),
      confidence: ["high", "medium", "low"].includes(item.confidence) ? item.confidence : "medium",
      review_note: clean(item.review_note, 500),
    })).filter((item: any) => item.name);
    if (!products.length) return json({ error: "لم يرجع التحليل منتجاً صالحاً. أعد المحاولة." }, 502);
    return json({
      product: products[0],
      products,
      requested_count: requestedCount,
      returned_count: products.length,
      model: selectedModel,
      requires_review: true,
    });
  } catch (error) {
    console.error("APEX product analysis error", error instanceof Error ? error.message : "unknown");
    return json({ error: "حدث خطأ أثناء تحليل المنتج." }, 500);
  }
});