import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../index.js", import.meta.url), "utf8");

test("all six required APEX callable backends are exported", () => {
  for (const name of ["apexCreateOrder","apexWalletCheckout","apexAdminCustomers","apexAiGuard","apexEmailCampaign","apexStoreAssistant"]) {
    assert.ok(source.includes("export const "+name+"=onCall"), name+" export missing");
  }
});

test("financial paths use transactions, server prices and idempotency", () => {
  assert.ok(source.includes("async function makeOrder"));
  assert.ok(source.includes("await db.runTransaction"));
  assert.ok(source.includes("checkoutRequests/"));
  assert.ok(source.includes("unit_price_sar"));
  assert.ok(source.includes("balanceSar:money(Number(walletSnap.get(\"balanceSar\"))-total)"));
});

test("admin access checks the active server-managed admin registry", () => {
  assert.ok(source.includes('db.doc("admins/"+auth.uid).get()'));
  assert.ok(source.includes('snap.get("active") !== true'));
});

test("public payment methods use a narrow manual-only projection", () => {
  const start=source.indexOf("export const apexGetPublicPaymentMethods");
  assert.notEqual(start,-1);
  const block=source.slice(start);
  assert.ok(block.includes('const allowed=["legacyId","name","instructions"'));
  assert.ok(block.includes('row.methodType==="manual"'));
  assert.ok(!block.includes("secretKeyNames"));
});

test("signup OTP is time limited, attempt limited and one-time", () => {
  assert.ok(source.includes("expiresAtMs:now+10*60*1000"));
  assert.ok(source.includes('snap.get("attempts")||0)>=5'));
  assert.ok(source.includes("verified:true"));
});

test("assistant resolves short legacy order numbers from prior user turns and limits details to the owner", () => {
  assert.ok(source.includes("for(const message of [...cleanMessages].reverse())"));
  assert.ok(source.includes("(\\d{1,15})"));
  assert.ok(source.includes('order.get("userId")===auth.uid'));
  assert.ok(source.includes('collection("orderStatusHistory")'));
  assert.ok(source.includes("tracking_number:o.trackingNumber"));
});
