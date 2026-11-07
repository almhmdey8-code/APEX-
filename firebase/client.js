// APEX Firebase client bootstrap. Firebase SDK version is pinned intentionally.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

const REQUIRED_CONFIG = ["apiKey", "authDomain", "projectId", "storageBucket", "appId"];
const config = globalThis.APEX_FIREBASE_CONFIG;

export function isFirebaseConfigured() {
  return Boolean(config && REQUIRED_CONFIG.every((key) =>
    typeof config[key] === "string" &&
    config[key].trim() &&
    !config[key].startsWith("REPLACE_")
  ));
}

export function requireFirebaseConfig() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase web configuration is missing. Add firebase/runtime-config.js from the example file.");
  }
  if (config.projectId !== "apex-3c12f") {
    throw new Error("Unexpected Firebase project. APEX development is pinned to apex-3c12f.");
  }
  return config;
}

let services;
export function getFirebase() {
  if (services) return services;
  const appConfig = requireFirebaseConfig();
  const app = getApps().length ? getApp() : initializeApp(appConfig);
  services = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
    functions: getFunctions(app, "us-central1")
  };
  return services;
}

export function firebaseMessage(error) {
  const code = String(error?.code || "");
  const messages = {
    "auth/invalid-credential": "بيانات الدخول غير صحيحة.",
    "auth/email-already-in-use": "هذا البريد مسجل مسبقاً.",
    "auth/weak-password": "كلمة المرور ضعيفة؛ استخدم 8 أحرف على الأقل.",
    "auth/too-many-requests": "محاولات كثيرة؛ انتظر قليلاً ثم أعد المحاولة.",
    "auth/network-request-failed": "تعذر الاتصال. تحقق من الإنترنت.",
    "permission-denied": "ليس لديك صلاحية لتنفيذ هذه العملية."
  };
  return messages[code] || error?.message || "حدث خطأ غير متوقع.";
}
