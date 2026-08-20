import { db } from "./firebase";
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  query, 
  where,
  deleteDoc
} from "firebase/firestore";
import type { DriverChangeReport } from "./f1Api";

export interface Prediction {
  userId: string;
  userName: string;
  season: string;
  round: string;
  sessionType: "quali" | "race" | "sprintQuali" | "sprint";
  driverIds: string[]; // Length 10
  fastestLapDriverId?: string;
  submittedAt: number;
}

export interface ScoreBreakdown {
  total: number;
  exactMatches: number;
  offByOneMatches: number;
  inTopTenMatches: number;
  fastestLapMatched: boolean;
  pointsByPosition: number[];
}

// Convert F1 API date + time strings to a unified Date object
export function getSessionDate(dateStr: string, timeStr?: string): Date {
  if (!dateStr) return new Date(0); // Safety: return epoch if no date provided
  if (!timeStr) return new Date(`${dateStr}T23:59:59Z`); // End of day fallback
  // Handle case where time has 'Z' already or is just 'HH:MM:SS'
  const timeFormatted = timeStr.endsWith("Z") ? timeStr : `${timeStr}Z`;

  // Format: "YYYY-MM-DDTHH:MM:SSZ"
  const result = new Date(`${dateStr}T${timeFormatted.replace("ZZ", "Z")}`);
  
  // Validate parsed date
  if (isNaN(result.getTime())) {
    console.warn(`Invalid date parsed from: ${dateStr} ${timeStr}`);
    return new Date(`${dateStr}T23:59:59Z`);
  }
  return result;
}

// Check if a session has started (and predictions should be locked)
export function isSessionLocked(dateStr: string, timeStr?: string): boolean {
  const sessionTime = getSessionDate(dateStr, timeStr).getTime();
  const now = Date.now();
  return now >= sessionTime;
}

// Driver Replacement mapping functions (e.g. { "hadjar": "lawson" })
const REPLACEMENTS_STORAGE_KEY = "f1_driver_replacements";

export async function saveDriverReplacements(
  season: string,
  round: string,
  replacements: Record<string, string>
): Promise<void> {
  const docId = `${season}_${round}`;

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(REPLACEMENTS_STORAGE_KEY);
      const existing = stored ? JSON.parse(stored) : {};
      existing[docId] = replacements;
      localStorage.setItem(REPLACEMENTS_STORAGE_KEY, JSON.stringify(existing));
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("f1_replacements_updated", { detail: { docId, replacements } }));
    } catch (e) {
      console.warn("Failed to write driver replacements to localStorage:", e);
    }
  }

  // 1. Persist to results/lineup_replacements (publicly accessible)
  try {
    const publicDocRef = doc(db, "results", "lineup_replacements");
    const snap = await getDoc(publicDocRef);
    const existingReps = snap.exists() ? (snap.data().rounds || {}) : {};
    existingReps[docId] = replacements;
    await setDoc(publicDocRef, { rounds: existingReps, updatedAt: Date.now() }, { merge: true });
  } catch (e) {
    console.warn("Firebase save to results/lineup_replacements failed:", e);
  }

  // 2. Also try driver_replacements collection
  try {
    const docRef = doc(db, "driver_replacements", docId);
    await setDoc(docRef, { season, round, replacements, updatedAt: Date.now() });
  } catch (e) {
    // ignore
  }
}

export async function getDriverReplacements(
  season: string,
  round: string
): Promise<Record<string, string>> {
  const docId = `${season}_${round}`;
  let localReps: Record<string, string> = {};

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(REPLACEMENTS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed[docId]) {
          localReps = parsed[docId];
        }
      }
    } catch (e) { /* ignore */ }
  }

  // 1. Try reading from results/lineup_replacements (publicly accessible)
  try {
    const publicDocRef = doc(db, "results", "lineup_replacements");
    const publicSnap = await getDoc(publicDocRef);
    if (publicSnap.exists()) {
      const rounds = publicSnap.data().rounds || {};
      if (rounds[docId]) {
        return rounds[docId];
      }
    }
  } catch (e) {
    console.warn("Reading results/lineup_replacements notice:", e);
  }

  // 2. Try reading from driver_replacements collection
  try {
    const docRef = doc(db, "driver_replacements", docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data().replacements || {};
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem(REPLACEMENTS_STORAGE_KEY);
          const existing = stored ? JSON.parse(stored) : {};
          existing[docId] = data;
          localStorage.setItem(REPLACEMENTS_STORAGE_KEY, JSON.stringify(existing));
        } catch (e) { /* ignore */ }
      }
      return data;
    }
  } catch (e) {
    // If permission-denied (non-admin), results/lineup_replacements already provided the data!
  }
  return localReps;
}

export async function clearAllDriverReplacements(): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(REPLACEMENTS_STORAGE_KEY);
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("f1_replacements_updated", { detail: {} }));
    } catch (e) {
      console.warn("Failed to clear localStorage driver replacements:", e);
    }
  }

  try {
    const publicDocRef = doc(db, "results", "lineup_replacements");
    await setDoc(publicDocRef, { rounds: {}, updatedAt: Date.now() });
  } catch (e) {
    // ignore
  }

  try {
    const colRef = collection(db, "driver_replacements");
    const snap = await getDocs(colRef);
    const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  } catch (e) {
    console.warn("Firebase clear driver replacements failed:", e);
  }
}

/**
 * Automatically create replacement scoring rules from a DriverChangeReport.
 * For each detected substitution (e.g. Hadjar absent → Lawson taking his seat),
 * this creates a mapping so predictions for Hadjar score as if they were for Lawson.
 */
export async function autoDetectReplacements(
  season: string,
  round: string,
  changeReport: DriverChangeReport
): Promise<Record<string, string>> {
  if (!changeReport.hasChanges || changeReport.substitutions.length === 0) {
    return {};
  }

  const existing = await getDriverReplacements(season, round);
  const updated = { ...existing };
  let changed = false;

  for (const sub of changeReport.substitutions) {
    // Only add if not already mapped
    if (!updated[sub.absentDriverId]) {
      updated[sub.absentDriverId] = sub.substituteDriverId;
      changed = true;
    }
  }

  if (changed) {
    await saveDriverReplacements(season, round, updated);
  }

  return updated;
}

// Scoring logic
export function calculatePredictionScore(
  predictedDriverIds: string[],
  actualDriverIds: string[],
  predictedFastestLapId?: string,
  actualFastestLapId?: string,
  driverReplacements?: Record<string, string>
): ScoreBreakdown {
  // Apply driver replacement mapping if driver got replaced for this round (e.g. hadjar -> lawson)
  const mappedPredictedDriverIds = predictedDriverIds.map((id) => {
    if (driverReplacements && driverReplacements[id]) {
      return driverReplacements[id];
    }
    return id;
  });

  const mappedFastestLapId =
    predictedFastestLapId && driverReplacements && driverReplacements[predictedFastestLapId]
      ? driverReplacements[predictedFastestLapId]
      : predictedFastestLapId;

  let total = 0;
  let exactMatches = 0;
  let offByOneMatches = 0;
  let inTopTenMatches = 0;
  let fastestLapMatched = false;
  const pointsByPosition = new Array(10).fill(0);

  // Take top 10 from actual results
  const actualTop10 = actualDriverIds.slice(0, 10);

  for (let i = 0; i < Math.min(mappedPredictedDriverIds.length, 10); i++) {
    const predId = mappedPredictedDriverIds[i];
    if (!predId) continue;

    const actualIdx = actualTop10.indexOf(predId);

    if (actualIdx === i) {
      // Exact Match
      pointsByPosition[i] = 10;
      exactMatches++;
    } else if (actualIdx !== -1 && Math.abs(actualIdx - i) === 1) {
      // Off by exactly 1 position
      pointsByPosition[i] = 5;
      offByOneMatches++;
    } else if (actualIdx !== -1) {
      // Present in Top 10 but further off
      pointsByPosition[i] = 2;
      inTopTenMatches++;
    } else {
      pointsByPosition[i] = 0;
    }

    total += pointsByPosition[i];
  }

  // Calculate Fastest Lap points
  if (mappedFastestLapId && actualFastestLapId && mappedFastestLapId === actualFastestLapId) {
    total += 5;
    fastestLapMatched = true;
  }

  return {
    total,
    exactMatches,
    offByOneMatches,
    inTopTenMatches,
    fastestLapMatched,
    pointsByPosition,
  };
}

// Save prediction to Firestore
export async function savePrediction(prediction: Prediction): Promise<void> {
  const docId = `${prediction.userId}_${prediction.season}_${prediction.round}_${prediction.sessionType}`;
  const predRef = doc(db, "predictions", docId);
  // Clean up undefined fields to prevent Firestore from throwing errors
  const cleanPrediction = { ...prediction };
  Object.keys(cleanPrediction).forEach((key) => {
    if (cleanPrediction[key as keyof Prediction] === undefined) {
      delete cleanPrediction[key as keyof Prediction];
    }
  });
  await setDoc(predRef, cleanPrediction);
}

// Get user prediction for a round + session
export async function getPrediction(
  userId: string,
  season: string,
  round: string,
  sessionType: string
): Promise<Prediction | null> {
  const docId = `${userId}_${season}_${round}_${sessionType}`;
  try {
    const predRef = doc(db, "predictions", docId);
    const snapshot = await getDoc(predRef);
    if (snapshot.exists()) {
      return snapshot.data() as Prediction;
    }
  } catch (e) {
    console.error("Firebase get prediction failed:", e);
  }
  return null;
}

// Get all user predictions for a season and round (Admin scoring)
export async function getPredictionsForRound(
  season: string,
  round: string
): Promise<Prediction[]> {
  try {
    const predCollection = collection(db, "predictions");
    const q = query(
      predCollection, 
      where("season", "==", season), 
      where("round", "==", round)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Prediction);
  } catch (e) {
    console.error("Firebase get predictions for round failed:", e);
    return [];
  }
}

// Get all user predictions for a season
export async function getUserPredictions(
  userId: string,
  season: string = "2026"
): Promise<Prediction[]> {
  try {
    const predCollection = collection(db, "predictions");
    const q = query(
      predCollection,
      where("userId", "==", userId),
      where("season", "==", season)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Prediction);
  } catch (e) {
    console.error("Firebase get user predictions failed:", e);
    return [];
  }
}

// Save User score and update leaderboard standings
export async function saveUserScore(
  userId: string,
  userName: string,
  season: string,
  round: string,
  sessionType: string,
  score: number,
  breakdown: ScoreBreakdown
): Promise<void> {
  const scoreId = `${userId}_${season}_${round}_${sessionType}`;
  
  // Save round score document
  const scoreRef = doc(db, "scores", scoreId);
  await setDoc(scoreRef, {
    userId,
    userName,
    season,
    round,
    sessionType,
    score,
    breakdown,
    updatedAt: Date.now()
  });

  // Re-sum user's total score across all scored sessions
  const userRef = doc(db, "users", userId);
  const allUserScoresQuery = query(
    collection(db, "scores"),
    where("userId", "==", userId),
    where("season", "==", season)
  );
  const scoresSnap = await getDocs(allUserScoresQuery);
  let newTotal = 0;
  scoresSnap.docs.forEach(doc => {
    newTotal += doc.data().score || 0;
  });

  await setDoc(userRef, {
    uid: userId,
    displayName: userName,
    totalPoints: newTotal,
    updatedAt: Date.now()
  }, { merge: true });
}

// Get global leaderboard list from Firestore
export async function getLeaderboard(season: string = "2026"): Promise<{ userId: string; displayName: string; photoURL: string; totalPoints: number }[]> {
  try {
    const usersCol = collection(db, "users");
    const snap = await getDocs(usersCol);
    const list = snap.docs.map(doc => {
      const d = doc.data();
      return {
        userId: d.uid || doc.id,
        displayName: d.displayName || "Unknown Driver",
        photoURL: d.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${d.displayName || doc.id}`,
        totalPoints: d.totalPoints || 0
      };
    });
    return list.sort((a, b) => b.totalPoints - a.totalPoints);
  } catch (e) {
    console.error("Firebase get leaderboard failed:", e);
    return [];
  }
}

