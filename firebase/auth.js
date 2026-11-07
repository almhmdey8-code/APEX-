import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  verifyBeforeUpdateEmail,
  updatePassword
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { getFirebase, firebaseMessage } from "./client.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { requestSignupOtp, completeSignupWithOtp } from "./otp.js";

export async function requestCustomerSignupOtp(email) {
  return requestSignupOtp(email);
}

export async function registerCustomer({ email, password, otp, fullName, phone, country, address, latitude, longitude, marketingOptIn = false }) {
  try {
    const { functions } = getFirebase();
    await httpsCallable(functions, "apexVerifySignupOtp")({ email: email.trim().toLowerCase(), code: String(otp || "") });
    return await completeSignupWithOtp({
      email: email.trim().toLowerCase(),
      password,
      code: String(otp || ""),
      full_name: fullName.trim(),
      phone: phone.trim(),
      country,
      address: address.trim(),
      latitude,
      longitude,
      marketing_opt_in: Boolean(marketingOptIn)
    });
  } catch (error) {
    throw new Error(firebaseMessage(error));
  }
}

export async function loginCustomer(email, password) {
  const { auth } = getFirebase();
  try {
    const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    return result.user;
  } catch (error) {
    throw new Error(firebaseMessage(error));
  }
}

export async function logoutCustomer() {
  const { auth } = getFirebase();
  await signOut(auth);
}

export function watchAuth(callback) {
  const { auth } = getFirebase();
  return onAuthStateChanged(auth, callback);
}

export async function requestPasswordReset(email) {
  const { auth } = getFirebase();
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  } catch (error) {
    throw new Error(firebaseMessage(error));
  }
}

export async function changeCustomerEmail(email) {
  const { auth } = getFirebase();
  if (!auth.currentUser) throw new Error("يجب تسجيل الدخول أولاً.");
  try {
    await verifyBeforeUpdateEmail(auth.currentUser, email.trim().toLowerCase());
  } catch (error) {
    throw new Error(firebaseMessage(error));
  }
}

export async function changeCustomerPassword(password) {
  const { auth } = getFirebase();
  if (!auth.currentUser) throw new Error("يجب تسجيل الدخول أولاً.");
  try {
    await updatePassword(auth.currentUser, password);
  } catch (error) {
    throw new Error(firebaseMessage(error));
  }
}

export async function saveCustomerProfile(profile) {
  const { auth, db } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("يجب تسجيل الدخول أولاً.");
  const allowed = {
    fullName: String(profile.fullName || "").trim().slice(0, 120),
    phone: String(profile.phone || "").trim().slice(0, 30),
    country: profile.country === "YE" ? "YE" : "SA",
    address: String(profile.address || "").trim().slice(0, 500),
    latitude: Number.isFinite(profile.latitude) ? profile.latitude : null,
    longitude: Number.isFinite(profile.longitude) ? profile.longitude : null,
    marketingOptIn: Boolean(profile.marketingOptIn),
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, "customers", user.uid), allowed, { merge: true });
  if (allowed.fullName && allowed.fullName !== user.displayName) {
    await updateProfile(user, { displayName: allowed.fullName });
  }
  return allowed;
}
