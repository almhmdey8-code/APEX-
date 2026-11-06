"use strict";

// Fixed allow-list: never accept a caller-supplied upstream function name.
const ROUTES = Object.freeze({
  apexWalletCheckout: "apex-wallet-checkout",
  apexCreateOrder: "apex-create-order",
  apexAdminCustomers: "apex-admin-customers",
  apexAiGuard: "apex-ai-guard",
  apexEmailCampaign: "apex-email-campaign",
  apexStoreAssistant: "apex-store-assistant",
});

function upstreamUrl(baseUrl, functionName) {
  if (!Object.values(ROUTES).includes(functionName)) {
    throw new Error("Unsupported APEX function");
  }
  return baseUrl.replace(/\\/+$/, "") + "/functions/v1/" + functionName;
}

module.exports = { ROUTES, upstreamUrl };
