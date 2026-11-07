import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../index.js", import.meta.url), "utf8");

test("all six required APEX callable backends are exported", () => {
  for (const name of ["apexCreateOrder","apexWalletCheckout","apexAdminCustomers","apexAiGuard","apexEmailCampaign","apexStoreAssistant"]) {
    assert.match(source, new RegExp("export const "+name+"\\s*="));
  }
});

test("financial paths use Firestore transactions and server-side prices", () => {
  assert.match(source, /async function makeOrder[\\s\\S]*?runTransaction/);
  assert.match(source, /apexWalletCheckout[\\s\\S]*?makeOrder\\(request,true\\)/);
  assert.match(source, /checkoutRequests\\//);
  assert.match(source, /unit_price_sar/);
});

test("admin callable checks active server-managed admin membership", () => {
  assert.match(source, /async function requireAdmin[\\s\\S]*?admins\\/\"\\+auth\\.uid/);
  assert.match(source, /snap\\.get\\(\"active\"\\) !== true/);
});

test("public payment projection is allow-listed and excludes gateway secrets", () => {
  const start = source.indexOf("export const apexGetPublicPaymentMethods");
  assert.notEqual(start, -1);
  const block = source.slice(start);
  assert.match(block, /const allowed=\\[/);
  assert.match(block, /methodType===\"manual\"/);
  assert.doesNotMatch(block, /secretKeyNames|privateKey|apiSecret/);
});

test("signup OTP is time limited, attempt limited and one-time", () => {
  assert.match(source, /expiresAtMs:now\+10\*60\*1000/);
  assert.match(source, /attempts\)\|\|0\)>=5/);
  assert.match(source, /verified:true/);
});
