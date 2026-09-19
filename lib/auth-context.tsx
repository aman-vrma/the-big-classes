import React, { createContext, useContext, useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "student";
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /**
   * True while an account is being created. Creating an account briefly signs the
   * new user in (Firebase needs an authenticated session to write their profile
   * document), and this flag keeps the app shell hidden until we sign back out.
   */
  signupInProgress: boolean;
  // login now returns the account's REAL stored role, so the UI can verify
  // the person clicked the correct Faculty/Student card.
  login: (email: string, password: string) => Promise<"teacher" | "student">;
  signup: (name: string, email: string, password: string, role: "teacher" | "student") => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchUserProfile(uid: string): Promise<{ name?: string; role?: "teacher" | "student" } | null> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? (snap.data() as { name?: string; role?: "teacher" | "student" }) : null;
  } catch (e) {
    console.error("Failed to fetch user profile:", e);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signupInProgress, setSignupInProgress] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const profile = await fetchUserProfile(firebaseUser.uid);
        setUser({
          id: firebaseUser.uid,
          name: profile?.name || firebaseUser.displayName || firebaseUser.email || "User",
          email: firebaseUser.email || "",
          role: profile?.role || "student",
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<"teacher" | "student"> => {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const profile = await fetchUserProfile(credential.user.uid);
    return profile?.role || "student";
  };

  const signup = async (name: string, email: string, password: string, role: "teacher" | "student") => {
    setSignupInProgress(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: name });

      // Firestore only lets an authenticated user write their own profile doc, so
      // the account has to be signed in for this one write.
      await setDoc(doc(db, "users", credential.user.uid), {
        name,
        email: email.trim(),
        role,
      });

      // ...and then immediately signed back out, so a brand new account has to
      // log in deliberately the first time instead of dropping straight in.
      await signOut(auth);
      setUser(null);
    } finally {
      setSignupInProgress(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signupInProgress, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
