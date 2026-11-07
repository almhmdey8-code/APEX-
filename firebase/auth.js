import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  verifyBeforeUpdateEmail,
  updatePassword
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { getFirebase, firebaseMessage } from "./client.js";

export async function registerCustomer({ email, password, fullName, phone, country, address, latitude, longitude, marketingOptIn = false }) {
  const { auth, db } = getFirebase();
  try {
    const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    await updateProfile(credential.user, { displayName: fullName.trim() });
    await setDoc(doc(db, "customers", credential.user.uid), {
      uid: credential.user.uid,
      fullName: fullName.trim(),
      phone: phone.trim(),
      country,
      address: address.trim(),
      latitude,
      longitude,
      marketingOptIn: Boolean(marketingOptIn),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await sendEmailVerification(credential.user);
    return credential.user;
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
