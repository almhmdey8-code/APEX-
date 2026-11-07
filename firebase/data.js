import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-storage.js";
import { getFirebase } from "./client.js";

async function readCollection(path, constraints = []) {
  const { db } = getFirebase();
  const snapshot = await getDocs(query(collection(db, path), ...constraints));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function loadProducts() {
  const { db } = getFirebase();
  const snapshot = await getDocs(query(
    collection(db, "products"),
    where("active", "==", true),
    orderBy("sortOrder", "asc"),
    limit(200)
  ));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function loadBanners() {
  return readCollection("banners", [where("active", "==", true), orderBy("sortOrder", "asc"), limit(20)]);
}

export async function loadPublicPaymentMethods() {
  const rows = await readCollection("paymentMethods", [
    where("enabled", "==", true),
    where("ordersEnabled", "==", true),
    orderBy("sortOrder", "asc")
  ]);
  const publicKeys = [
    "id", "name", "instructions", "methodType", "countryCode", "accountHolder",
    "accountNumber", "accountIban", "sortOrder", "enabled", "ordersEnabled"
  ];
  return rows.map((row) => Object.fromEntries(publicKeys.filter((key) =>
    Object.hasOwn(row, key)
  ).map((key) => [key, row[key]])));
}

export async function loadCustomerProfile(uid) {
  const { db } = getFirebase();
  const snapshot = await getDoc(doc(db, "customers", uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function loadCustomerOrders(uid) {
  return readCollection("orders", [
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
    limit(100)
  ]);
}

export async function callApexFunction(name, payload = {}) {
  const allowed = new Set([
    "apexCreateOrder", "apexWalletCheckout", "apexAdminCustomers",
    "apexAiGuard", "apexEmailCampaign", "apexStoreAssistant"
  ]);
  if (!allowed.has(name)) throw new Error("APEX function is not allow-listed.");
  const { functions } = getFirebase();
  const callable = httpsCallable(functions, name);
  const result = await callable(payload);
  return result.data;
}

export async function uploadStoreImage(file, folder = "store") {
  const { storage, auth } = getFirebase();
  if (!auth.currentUser) throw new Error("يجب تسجيل الدخول أولاً.");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    throw new Error("الملف المحدد ليس صورة صالحة.");
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("الحد الأقصى للصورة 8 ميجابايت.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
  const objectRef = ref(storage, `${folder}/${auth.currentUser.uid}/${Date.now()}-${safeName}`);
  await uploadBytes(objectRef, file, { contentType: file.type });
  return getDownloadURL(objectRef);
}

export async function saveCustomerPreferences(uid, preferences) {
  const { db, auth } = getFirebase();
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error("غير مصرح بتحديث هذه البيانات.");
  }
  await setDoc(doc(db, "customers", uid), {
    preferences: {
      language: preferences.language === "en" ? "en" : "ar",
      currency: preferences.currency === "YER" ? "YER" : "SAR"
    },
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function loadStoreCurrencySettings() {
  const { db } = getFirebase();
  const snapshot = await getDoc(doc(db, "storeSettings", "currency"));
  return snapshot.exists() ? snapshot.data() : null;
}
