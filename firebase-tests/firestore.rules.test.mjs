import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const projectId = "apex-firestore-rules-test";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "products", "101"), { legacyId: 101, name: "APEX Ultra", active: true });
    await setDoc(doc(db, "products", "102"), { legacyId: 102, name: "Hidden", active: false });
    await setDoc(doc(db, "orders", "order-1"), { userId: "customer-1", status: "new" });
    await setDoc(doc(db, "wallets", "customer-1"), { balanceSar: 25 });
    await setDoc(doc(db, "wallets", "customer-2"), { balanceSar: 90 });
    await setDoc(doc(db, "paymentMethods", "bank"), {
      name: "تحويل بنكي", instructions: "بيانات التحويل", enabled: true,
      methodType: "manual", ordersEnabled: true, countryCode: "SA"
    });
    await setDoc(doc(db, "paymentMethods", "unsafe"), {
      name: "Unsafe", enabled: true, publicConfig: { apiSecret: "must-never-be-readable" }
    });
    await setDoc(doc(db, "paymentWebhookEvents", "event-1"), { eventId: "evt-1" });
  });
});

after(async () => {
  await env.cleanup();
});

test("public can read active products only", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "products", "101")));
  await assertFails(getDoc(doc(db, "products", "102")));
  await assertFails(setDoc(doc(db, "products", "103"), { active: true }));
});

test("product list queries must constrain active products", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(query(collection(db, "products"), where("active", "==", true))));
  await assertFails(getDocs(collection(db, "products")));
});

test("customer can read only their own order and wallet", async () => {
  const db = env.authenticatedContext("customer-1").firestore();
  await assertSucceeds(getDoc(doc(db, "orders", "order-1")));
  await assertSucceeds(getDoc(doc(db, "wallets", "customer-1")));
  await assertFails(getDoc(doc(db, "wallets", "customer-2")));
});

test("customers cannot create or mutate orders or wallet balances", async () => {
  const db = env.authenticatedContext("customer-1").firestore();
  await assertFails(setDoc(doc(db, "orders", "forged"), { userId: "customer-1", totalSar: 1 }));
  await assertFails(updateDoc(doc(db, "wallets", "customer-1"), { balanceSar: 999999 }));
});

test("customer profile is owner-only and restricted to approved fields", async () => {
  const owner = env.authenticatedContext("customer-1").firestore();
  const other = env.authenticatedContext("customer-2").firestore();
  await assertSucceeds(setDoc(doc(owner, "customers", "customer-1"), {
    fullName: "Test Customer", phone: "0500000000", country: "SA"
  }));
  await assertFails(getDoc(doc(other, "customers", "customer-1")));
  await assertFails(setDoc(doc(owner, "customers", "customer-1"), {
    fullName: "Test Customer", admin: true
  }));
});

test("payment methods expose only safe whitelisted documents", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "paymentMethods", "bank")));
  await assertFails(getDoc(doc(db, "paymentMethods", "unsafe")));
});

test("payment webhooks remain private; admin claim is required", async () => {
  const customer = env.authenticatedContext("customer-1").firestore();
  const admin = env.authenticatedContext("admin-1", { admin: true }).firestore();
  await assertFails(getDoc(doc(customer, "paymentWebhookEvents", "event-1")));
  await assertFails(getDoc(doc(admin, "paymentWebhookEvents", "event-1")));
  await assertFails(setDoc(doc(admin, "paymentWebhookEvents", "event-2"), { eventId: "evt-2" }));
  await assertSucceeds(setDoc(doc(admin, "products", "103"), { active: true, name: "Admin product" }));
});
