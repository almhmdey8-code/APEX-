import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { signInWithCustomToken } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirebase } from "./client.js";

export async function requestSignupOtp(email) {
  const { functions } = getFirebase();
  const call = httpsCallable(functions, "apexRequestSignupOtp");
  return (await call({ email: String(email || "").trim().toLowerCase() })).data;
}

export async function completeSignupWithOtp(payload) {
  const { functions, auth } = getFirebase();
  const call = httpsCallable(functions, "apexCompleteSignup");
  const result = (await call(payload)).data;
  if (!result?.customToken) throw new Error("تعذر إكمال إنشاء الحساب.");
  return signInWithCustomToken(auth, result.customToken);
}
