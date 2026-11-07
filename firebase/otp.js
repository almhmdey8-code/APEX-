import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { signInWithCustomToken } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirebase, firebaseMessage } from "./client.js";

export async function requestSignupOtp(email) {
  const { functions } = getFirebase();
  try {
    const call = httpsCallable(functions, "apexRequestSignupOtp");
    return (await call({ email: String(email || "").trim().toLowerCase() })).data;
  } catch (error) {
    throw new Error(firebaseMessage(error));
  }
}

export async function completeSignupWithOtp(payload) {
  const { functions, auth } = getFirebase();
  try {
    const call = httpsCallable(functions, "apexCompleteSignup");
    const result = (await call(payload)).data;
    if (!result?.customToken) throw new Error("لم يكتمل إنشاء الحساب.");
    const credential = await signInWithCustomToken(auth, result.customToken);
    return credential.user;
  } catch (error) {
    throw new Error(firebaseMessage(error));
  }
}
