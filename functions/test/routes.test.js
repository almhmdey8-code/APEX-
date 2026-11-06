"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ROUTES, upstreamUrl } = require("../src/routes");

test("all six APEX functions have fixed upstream routes", () => {
  assert.equal(Object.keys(ROUTES).length, 6);
  assert.equal(ROUTES.apexWalletCheckout, "apex-wallet-checkout");
  assert.equal(ROUTES.apexCreateOrder, "apex-create-order");
  assert.equal(ROUTES.apexAdminCustomers, "apex-admin-customers");
  assert.equal(ROUTES.apexAiGuard, "apex-ai-guard");
  assert.equal(ROUTES.apexEmailCampaign, "apex-email-campaign");
  assert.equal(ROUTES.apexStoreAssistant, "apex-store-assistant");
});

test("builds only allow-listed Supabase function URLs", () => {
  assert.equal(
    upstreamUrl("https://example.supabase.co/", "apex-create-order"),
    "https://example.supabase.co/functions/v1/apex-create-order"
  );
  assert.throws(() => upstreamUrl("https://example.supabase.co", "other-function"));
});
