import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDgjJpqGQsT8khvXX7M-th3OVQ-HYXzgzM",
  authDomain: "the-big-classes.firebaseapp.com",
  projectId: "the-big-classes",
  storageBucket: "the-big-classes.firebasestorage.app",
  messagingSenderId: "874746583485",
  appId: "1:874746583485:web:0af64339d97aa82240dad4",
  measurementId: "G-TRF3G4YGTZ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Authorization header for the /api functions, which verify the Firebase ID
 * token with the Admin SDK before doing any work. Tokens are cached by the SDK
 * and refreshed automatically, so calling this per request is cheap.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in to do that");
  }
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}
