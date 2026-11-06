"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const { ROUTES, upstreamUrl } = require("./routes");

const SUPABASE_URL = defineString("SUPABASE_URL");
const SUPABASE_ANON_KEY = defineString("SUPABASE_ANON_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function proxy(functionName) {
  return onRequest(
    { region: "us-central1", timeoutSeconds: 60, memory: "256MiB", maxInstances: 20 },
    async (req, res) => {
      for (const [key, value] of Object.entries(corsHeaders)) res.set(key, value);
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const authorization = req.get("authorization");
      if (!authorization || !/^Bearer\\s+\\S+$/i.test(authorization)) {
        return res.status(401).json({ error: "يجب تسجيل الدخول" });
      }

      try {
        const baseUrl = SUPABASE_URL.value();
        const anonKey = SUPABASE_ANON_KEY.value();
        if (!baseUrl || !anonKey) {
          return res.status(503).json({ error: "Backend bridge is not configured" });
        }

        const upstream = await fetch(upstreamUrl(baseUrl, functionName), {
          method: "POST",
          headers: {
            "Authorization": authorization,
            "apikey": req.get("apikey") || anonKey,
            "Content-Type": req.get("content-type") || "application/json",
            "x-client-info": req.get("x-client-info") || "apex-firebase-bridge",
          },
          body: JSON.stringify(req.body ?? {}),
          signal: AbortSignal.timeout(55000),
        });
        const contentType = upstream.headers.get("content-type");
        if (contentType) res.set("content-type", contentType);
        const payload = await upstream.text();
        return res.status(upstream.status).send(payload);
      } catch (error) {
        console.error("APEX upstream request failed", functionName, error?.name || "Error");
        return res.status(502).json({ error: "تعذر الاتصال بخدمة المتجر" });
      }
    }
  );
}

// Firebase HTTPS endpoints; request auth is forwarded to the existing Supabase
// Auth verifier. No service-role key or payment secret is exposed to clients.
exports.apexWalletCheckout = proxy(ROUTES.apexWalletCheckout);
exports.apexCreateOrder = proxy(ROUTES.apexCreateOrder);
exports.apexAdminCustomers = proxy(ROUTES.apexAdminCustomers);
exports.apexAiGuard = proxy(ROUTES.apexAiGuard);
exports.apexEmailCampaign = proxy(ROUTES.apexEmailCampaign);
exports.apexStoreAssistant = proxy(ROUTES.apexStoreAssistant);
