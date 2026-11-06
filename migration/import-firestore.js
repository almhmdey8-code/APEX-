"use strict";

const { createClient } = require("@supabase/supabase-js");
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const TABLES = [
  ["public", "apex_admins", "admins", ["user_id"]],
  ["public", "apex_products", "products", ["id"]],
  ["public", "apex_orders", "orders", ["id"]],
  ["public", "apex_banners", "banners", ["id"]],
  ["public", "apex_payment_methods", "paymentMethods", ["id"]],
  ["public", "apex_wallets", "wallets", ["user_id"]],
  ["public", "apex_wallet_transactions", "walletTransactions", ["id"]],
  ["public", "apex_referral_codes", "referralCodes", ["user_id"]],
  ["public", "apex_referral_signups", "referralSignups", ["id"]],
  ["public", "apex_referral_rewards", "referralRewards", ["id"]],
  ["public", "apex_referral_visits", "referralVisits", ["code", "visitor_id"]],
  ["public", "apex_store_settings", "storeSettings", ["setting_key"]],
  ["public", "apex_order_status_history", "orderStatusHistory", ["id"]],
  ["public", "apex_order_refunds", "orderRefunds", ["id"]],
  ["public", "apex_wallet_topups", "walletTopups", ["id"]],
  ["public", "apex_shipping_providers", "shippingProviders", ["id"]],
  ["public", "apex_email_settings", "emailSettings", ["id"]],
  ["public", "apex_email_cron_auth", "emailCronAuth", ["id"]],
  ["public", "apex_security_events", "securityEvents", ["id"]],
  ["private", "apex_gateway_transactions", "privateGatewayTransactions", ["id"]],
  ["private", "apex_payment_webhook_events", "paymentWebhookEvents", ["id"]],
  ["private", "apex_shipping_jobs", "shippingJobs", ["id"]],
];

const snakeToCamel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function mapTopLevel(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) out[snakeToCamel(key)] = value;
  return out;
}
function documentId(row, keys) {
  const parts = keys.map((key) => {
    if (row[key] === undefined || row[key] === null) throw new Error("Missing primary-key field: " + key);
    return String(row[key]);
  });
  if (parts.length === 1 && /^[A-Za-z0-9_-]{1,1500}$/.test(parts[0])) return parts[0];
  return Buffer.from(parts.join("\u001f"), "utf8").toString("base64url");
}
function sanitize(collection, doc) {
  if (collection !== "paymentMethods") return doc;
  const allowed = [
    "id", "name", "instructions", "methodType", "enabled", "sortOrder",
    "createdAt", "updatedAt", "countryCode", "methodCode", "walletTopupEnabled",
    "gatewayProvider", "ordersEnabled", "accountHolder", "accountNumber",
    "accountIban", "publicConfig", "integrationStatus"
  ];
  return Object.fromEntries(Object.entries(doc).filter(([key]) => allowed.includes(key)));
}

async function main() {
  if (!process.argv.includes("--apply")) {
    throw new Error("Dry run only. Re-run with --apply after reviewing this migration.");
  }
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
    throw new Error("Firebase Application Default Credentials are unavailable.");
  }

  initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || "apex-3c12f" });
  const db = getFirestore();
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const summary = [];
  for (const [schema, table, collection, primaryKey] of TABLES) {
    let offset = 0;
    let count = 0;
    while (true) {
      const { data, error } = await supabase.schema(schema).from(table)
        .select("*").range(offset, offset + 399);
      if (error) throw new Error("Read failed for " + schema + "." + table + ": " + error.message);
      if (!data || data.length === 0) break;

      for (let start = 0; start < data.length; start += 400) {
        const batch = db.batch();
        for (const row of data.slice(start, start + 400)) {
          const id = documentId(row, primaryKey);
          const ref = db.collection(collection).doc(id);
          const document = sanitize(collection, mapTopLevel(row));
          document._migration = {
            source: schema + "." + table,
            importedAt: FieldValue.serverTimestamp(),
            sourcePrimaryKey: Object.fromEntries(primaryKey.map((key) => [snakeToCamel(key), row[key]]))
          };
          batch.set(ref, document, { merge: false });
        }
        await batch.commit();
      }
      count += data.length;
      offset += data.length;
      if (data.length < 400) break;
    }
    summary.push({ source: schema + "." + table, destination: collection, imported: count });
    process.stdout.write("Imported " + schema + "." + table + ": " + count + " documents\n");
  }

  const manifest = {
    projectId: "apex-3c12f",
    sourceProject: "ulzxdvtzziydhuvennzw",
    completedAt: new Date().toISOString(),
    collections: summary,
    note: "Data-only import. Auth users, password credentials, Storage objects, functions, secrets, and sequence state are not migrated."
  };
  await db.collection("_migrationControl").doc("supabaseImport").set(manifest, { merge: false });
  process.stdout.write("Migration manifest written. " + JSON.stringify(summary) + "\n");
}

main().catch((error) => {
  process.stderr.write("Migration failed: " + (error?.message || "unknown error") + "\n");
  process.exitCode = 1;
});
