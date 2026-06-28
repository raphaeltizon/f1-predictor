"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  subscribeToAuth, 
  signInWithGoogle, 
  logoutUser, 
  setMockProfile,
  isFirebaseConfigured,
  db
} from "@/lib/firebase";
import { syncLocalPredictionsToFirestore } from "@/lib/predictions";
import { doc, onSnapshot } from "firebase/firestore";

interface AuthContextType {
  user: any | null;
  loading: boolean;
  isMock: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updateMockProfile: (name: string, email: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;

    // Listen for auth changes (Firebase or Mock)
    const unsubscribeAuth = subscribeToAuth((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
        syncLocalPredictionsToFirestore();

        // If Firebase is configured, listen to the Firestore user document for real-time score updates
        if (isFirebaseConfigured && db) {
          if (unsubscribeFirestore) unsubscribeFirestore();
          
          const userRef = doc(db, "users", currentUser.uid);
          unsubscribeFirestore = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const userData = docSnap.data();
              setUser((prevUser: any) => {
                if (!prevUser) return null;
                return {
                  ...prevUser,
                  totalPoints: userData.totalPoints,
                  isAdmin: userData.isAdmin,
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

    // Also listen to storage events to sync user points/name changes in Mock Mode
    const handleStorageChange = () => {
      if (!isFirebaseConfigured) {
        const stored = localStorage.getItem("f1_mock_user");
        if (stored) {
          try {
            setUser(JSON.parse(stored));
          } catch (e) {}
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
      window.removeEventListener("storage", handleStorageChange);
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

  const updateMockProfile = (name: string, email: string) => {
    setMockProfile(name, email);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isMock: !isFirebaseConfigured,
        login,
        logout,
        updateMockProfile
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
