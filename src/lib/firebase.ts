import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Check if firebase configuration is completed
export const isFirebaseConfigured = 
  !!firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "your_firebase_api_key" &&
  !!firebaseConfig.projectId;

if (typeof window !== "undefined") {
  console.log("Firebase config detected in browser:", {
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
    isFirebaseConfigured
  });
}

let app;
let auth: any = null;
let db: any = null;
let googleProvider: any = null;

if (typeof window !== "undefined") {
  if (isFirebaseConfigured) {
    try {
      app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      auth = getAuth(app);
      db = getFirestore(app);
      googleProvider = new GoogleAuthProvider();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
    }
  } else {
    console.warn("Firebase is not configured. Running in Mock Mode with local storage.");
  }
}

export { auth, db };

// Mock auth interface for local storage fallback
export interface MockUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  totalPoints?: number;
  isAdmin?: boolean;
}

// Global state for mock authentication callbacks
let mockAuthCallbacks: ((user: MockUser | null) => void)[] = [];
let currentMockUser: MockUser | null = null;

// Load initial mock user from localStorage on client side
if (typeof window !== "undefined" && !isFirebaseConfigured) {
  const stored = localStorage.getItem("f1_mock_user");
  if (stored) {
    try {
      currentMockUser = JSON.parse(stored);
    } catch (e) {
      currentMockUser = null;
    }
  }
}

export const subscribeToAuth = (callback: (user: any | null) => void) => {
  if (isFirebaseConfigured && auth) {
    return onAuthStateChanged(auth, callback);
  } else {
    mockAuthCallbacks.push(callback);
    // Fire immediately with current mock value
    callback(currentMockUser);
    return () => {
      mockAuthCallbacks = mockAuthCallbacks.filter(cb => cb !== callback);
    };
  }
};

export const signInWithGoogle = async (): Promise<any> => {
  if (isFirebaseConfigured && auth && googleProvider) {
    return signInWithPopup(auth, googleProvider);
  } else {
    // Generate mock user
    const mockUser: MockUser = {
      uid: "mock-user-123",
      email: "checo.perez@f1.com",
      displayName: "Sergio Perez",
      photoURL: "https://upload.wikimedia.org/wikipedia/commons/4/4c/Sergio_P%C3%A9rez_2022.jpg",
      totalPoints: 120,
      isAdmin: true, // Let mock user be admin to test admin functions!
    };
    currentMockUser = mockUser;
    localStorage.setItem("f1_mock_user", JSON.stringify(mockUser));
    mockAuthCallbacks.forEach(cb => cb(mockUser));
    return { user: mockUser };
  }
};

export const logoutUser = async (): Promise<void> => {
  if (isFirebaseConfigured && auth) {
    return signOut(auth);
  } else {
    currentMockUser = null;
    localStorage.removeItem("f1_mock_user");
    mockAuthCallbacks.forEach(cb => cb(null));
  }
};

export const setMockProfile = (displayName: string, email: string) => {
  if (!isFirebaseConfigured) {
    const updatedUser = {
      ...currentMockUser,
      uid: currentMockUser?.uid || "mock-user-123",
      displayName,
      email,
      photoURL: currentMockUser?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${displayName}`,
      isAdmin: true
    };
    currentMockUser = updatedUser;
    localStorage.setItem("f1_mock_user", JSON.stringify(updatedUser));
    mockAuthCallbacks.forEach(cb => cb(updatedUser));
  }
};
