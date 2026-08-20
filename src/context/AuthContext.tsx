"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  subscribeToAuth, 
  signInWithGoogle, 
  logoutUser, 
  db
} from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  totalPoints?: number;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;

    const unsubscribeAuth = subscribeToAuth((currentUser) => {
      if (currentUser) {
        const baseUser: AppUser = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
        };
        setUser(baseUser);
        setLoading(false);

        // Listen to the Firestore user document for real-time score updates and admin permissions
        if (db) {
          if (unsubscribeFirestore) unsubscribeFirestore();
          
          const userRef = doc(db, "users", currentUser.uid);
          unsubscribeFirestore = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const userData = docSnap.data();
              setUser((prevUser) => {
                if (!prevUser) return null;
                return {
                  ...prevUser,
                  totalPoints: userData.totalPoints ?? 0,
                  isAdmin: userData.isAdmin ?? false,
                  displayName: userData.displayName || prevUser.displayName,
                };
              });
            }
          }, (error) => {
            console.error("Firestore onSnapshot error:", error);
          });
        }
      } else {
        setUser(null);
        setLoading(false);
        if (unsubscribeFirestore) {
          unsubscribeFirestore();
          unsubscribeFirestore = null;
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, []);

  const login = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      console.error("Login error:", e);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await logoutUser();
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

