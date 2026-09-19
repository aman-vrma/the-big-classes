import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Underscore-prefixed filename so Vercel does NOT expose this as its own
// /api/_firebase-admin route — it's a shared helper for the other functions.

export function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("Server is missing FIREBASE_SERVICE_ACCOUNT_KEY");
  }

  const serviceAccount = JSON.parse(raw);

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}