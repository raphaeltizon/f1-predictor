"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  subscribeToAuth, 
  signInWithGoogle, 
  logoutUser, 
  setMockProfile,
  isFirebaseConfigured
} from "@/lib/firebase";
import { syncLocalPredictionsToFirestore } from "@/lib/predictions";

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
    // Listen for auth changes (Firebase or Mock)
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        syncLocalPredictionsToFirestore();
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
      unsubscribe();
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
