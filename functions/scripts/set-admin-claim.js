import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const uid = process.argv[2];
if (!uid) {
  console.error("Usage: node functions/scripts/set-admin-claim.js FIREBASE_AUTH_UID");
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId: "apex-3c12f" });
const auth = getAuth();
const user = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), admin: true });
console.log("Admin claim enabled for:", uid);
