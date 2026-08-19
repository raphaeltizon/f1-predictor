import { db, isFirebaseConfigured } from "./firebase";
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  query, 
  where,
  writeBatch
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
  // Some API returns may have time formatted like "15:00:00" and date "2026-03-02"
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
export async function saveDriverReplacements(
  season: string,
  round: string,
  replacements: Record<string, string>
): Promise<void> {
  const docId = `${season}_${round}`;
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, "driver_replacements", docId);
      await setDoc(docRef, { season, round, replacements, updatedAt: Date.now() });
    } catch (e) {
      console.error("Firebase save driver replacements failed:", e);
    }
  }

  if (typeof window !== "undefined") {
    const key = "f1_driver_replacements";
    const stored = localStorage.getItem(key);
    let existing: Record<string, Record<string, unknown>> = {};
    if (stored) {
      try { existing = JSON.parse(stored); } catch (e) { /* ignore parse error */ }
    }
    existing[docId] = { season, round, replacements, updatedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(existing));
    window.dispatchEvent(new Event("storage"));
  }
}

export async function getDriverReplacements(
  season: string,
  round: string
): Promise<Record<string, string>> {
  const docId = `${season}_${round}`;
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, "driver_replacements", docId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data().replacements || {};
      }
    } catch (e) {
      console.error("Firebase get driver replacements failed:", e);
    }
  }

  if (typeof window !== "undefined") {
    const key = "f1_driver_replacements";
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const existing = JSON.parse(stored);
        if (existing[docId]) {
          return existing[docId].replacements || {};
        }
      } catch (e) { /* ignore parse error */ }
    }
  }
  return {};
}

export async function clearAllDriverReplacements(): Promise<void> {
  if (typeof window !== "undefined") {
    localStorage.removeItem("f1_driver_replacements");
    window.dispatchEvent(new Event("storage"));
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

// Save prediction (firebase with local storage backup/fallback)
export async function savePrediction(prediction: Prediction): Promise<void> {
  const docId = `${prediction.userId}_${prediction.season}_${prediction.round}_${prediction.sessionType}`;
  
  if (isFirebaseConfigured && db) {
    try {
      const predRef = doc(db, "predictions", docId);
      // Clean up undefined fields to prevent Firestore from throwing errors
      const cleanPrediction = { ...prediction };
      Object.keys(cleanPrediction).forEach((key) => {
        if (cleanPrediction[key as keyof Prediction] === undefined) {
          delete cleanPrediction[key as keyof Prediction];
        }
      });
      await setDoc(predRef, cleanPrediction);
      return;
    } catch (e) {
      console.error("Firebase save prediction failed, saving locally:", e);
    }
  }

  // Local storage save
  if (typeof window !== "undefined") {
    const key = "f1_local_predictions";
    const existing = localStorage.getItem(key);
    let preds: Record<string, Prediction> = {};
    if (existing) {
      try { preds = JSON.parse(existing); } catch (e) { /* ignore parse error */ }
    }
    preds[docId] = prediction;
    localStorage.setItem(key, JSON.stringify(preds));
  }
}

// Sync local predictions to Firestore using batch writes for better performance
export async function syncLocalPredictionsToFirestore(): Promise<void> {
  if (!isFirebaseConfigured || !db || typeof window === "undefined") return;

  const key = "f1_local_predictions";
  const existing = localStorage.getItem(key);
  if (!existing) return;

  try {
    const localPreds = JSON.parse(existing) as Record<string, Prediction>;
    const keys = Object.keys(localPreds);
    if (keys.length === 0) return;

    console.log(`Syncing ${keys.length} local predictions to Firestore...`);
    
    // Use batch writes for better performance (Firestore batch limit is 500)
    const batchSize = 500;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = keys.slice(i, i + batchSize);
      
      for (const docId of chunk) {
        const prediction = localPreds[docId];
        const predRef = doc(db, "predictions", docId);
        
        const cleanPrediction = { ...prediction };
        Object.keys(cleanPrediction).forEach((k) => {
          if (cleanPrediction[k as keyof Prediction] === undefined) {
            delete cleanPrediction[k as keyof Prediction];
          }
        });

        batch.set(predRef, cleanPrediction);
      }
      
      await batch.commit();
    }
    
    localStorage.removeItem(key);
    console.log("Local predictions successfully synced and cleared from local storage.");
  } catch (error) {
    console.error("Failed to sync local predictions to Firestore:", error);
  }
}

// Get user prediction for a round + session
export async function getPrediction(
  userId: string,
  season: string,
  round: string,
  sessionType: string
): Promise<Prediction | null> {
  const docId = `${userId}_${season}_${round}_${sessionType}`;

  if (isFirebaseConfigured && db) {
    try {
      const predRef = doc(db, "predictions", docId);
      const snapshot = await getDoc(predRef);
      if (snapshot.exists()) {
        return snapshot.data() as Prediction;
      }
    } catch (e) {
      console.error("Firebase get prediction failed, checking local:", e);
    }
  }

  // Local storage get
  if (typeof window !== "undefined") {
    const key = "f1_local_predictions";
    const existing = localStorage.getItem(key);
    if (existing) {
      try {
        const preds = JSON.parse(existing);
        return preds[docId] || null;
      } catch (e) { /* ignore parse error */ }
    }
  }
  return null;
}

// Get all user predictions for a season and round (Admin scoring)
export async function getPredictionsForRound(
  season: string,
  round: string
): Promise<Prediction[]> {
  if (isFirebaseConfigured && db) {
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
      console.error("Firebase get predictions for round failed, checking local:", e);
    }
  }

  // Local storage get
  if (typeof window !== "undefined") {
    const key = "f1_local_predictions";
    const existing = localStorage.getItem(key);
    if (existing) {
      try {
        const preds = JSON.parse(existing) as Record<string, Prediction>;
        return Object.values(preds).filter(p => p.season === season && p.round === round);
      } catch (e) { /* ignore parse error */ }
    }
  }
  return [];
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
  
  if (isFirebaseConfigured && db) {
    try {
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

      // Update total points in user doc
      const userRef = doc(db, "users", userId);
      // Re-sum user's total score (safer than increment)
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

      return;
    } catch (e) {
      console.error("Firebase save user score failed, updating locally:", e);
    }
  }

  // Local storage save
  if (typeof window !== "undefined") {
    // Save score
    const scoresKey = "f1_local_scores";
    const scoresExisting = localStorage.getItem(scoresKey);
    let localScores: Record<string, Record<string, unknown>> = {};
    if (scoresExisting) {
      try { localScores = JSON.parse(scoresExisting); } catch (e) { /* ignore parse error */ }
    }
    localScores[scoreId] = {
      userId,
      userName,
      season,
      round,
      sessionType,
      score,
      breakdown,
    };
    localStorage.setItem(scoresKey, JSON.stringify(localScores));

    // Update user points in mock user info
    const userKey = "f1_mock_user";
    const userVal = localStorage.getItem(userKey);
    if (userVal) {
      try {
        const u = JSON.parse(userVal);
        if (u.uid === userId) {
          // Recompute total score from local scores
          const calculatedTotal = Object.values(localScores)
            .filter((s) => s.userId === userId && s.season === season)
            .reduce((sum: number, s) => sum + (s.score as number || 0), 0);

          u.totalPoints = calculatedTotal;
          localStorage.setItem(userKey, JSON.stringify(u));
          
          // Dispatch custom event to let navbar know points updated
          window.dispatchEvent(new Event("storage"));
        }
      } catch (e) { /* ignore parse error */ }
    }
  }
}

// Get global leaderboard list
export async function getLeaderboard(season: string = "2026"): Promise<{ userId: string; displayName: string; photoURL: string; totalPoints: number }[]> {
  if (isFirebaseConfigured && db) {
    try {
      const usersCol = collection(db, "users");
      const snap = await getDocs(usersCol);
      const list = snap.docs.map(doc => {
        const d = doc.data();
        return {
          userId: d.uid,
          displayName: d.displayName || "Unknown Driver",
          photoURL: d.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${d.displayName}`,
          totalPoints: d.totalPoints || 0
        };
      });
      return list.sort((a, b) => b.totalPoints - a.totalPoints);
    } catch (e) {
      console.error("Firebase get leaderboard failed:", e);
    }
  }

  // Local storage leaderboard
  if (typeof window !== "undefined") {
    const list: { userId: string; displayName: string; photoURL: string; totalPoints: number }[] = [];
    const mockUserVal = localStorage.getItem("f1_mock_user");
    if (mockUserVal) {
      try {
        const u = JSON.parse(mockUserVal);
        list.push({
          userId: u.uid,
          displayName: u.displayName || "You (Sergio Perez)",
          photoURL: u.photoURL || "",
          totalPoints: u.totalPoints || 0
        });
      } catch (e) { /* ignore parse error */ }
    }

    // Add some mock opponents to compete against!
    const defaultOpponents = [
      { userId: "opponent-1", displayName: "Charles Leclerc", photoURL: "https://upload.wikimedia.org/wikipedia/commons/e/ee/Charles_Leclerc_Ferrari_Austria_2022.jpg", totalPoints: 145 },
      { userId: "opponent-2", displayName: "Max Verstappen", photoURL: "https://upload.wikimedia.org/wikipedia/commons/7/75/Max_Verstappen_2017.jpg", totalPoints: 180 },
      { userId: "opponent-3", displayName: "Lando Norris", photoURL: "https://upload.wikimedia.org/wikipedia/commons/f/f6/Lando_Norris_British_GP_2022.jpg", totalPoints: 162 },
      { userId: "opponent-4", displayName: "Lewis Hamilton", photoURL: "https://upload.wikimedia.org/wikipedia/commons/1/18/Lewis_Hamilton_2021_Austrian_GP.jpg", totalPoints: 95 }
    ];

    // Recompute mock opponent scores based on local storage scores if there's any
    const scoresKey = "f1_local_scores";
    const scoresExisting = localStorage.getItem(scoresKey);
    let localScores: Record<string, unknown>[] = [];
    if (scoresExisting) {
      try { localScores = Object.values(JSON.parse(scoresExisting)); } catch (e) { /* ignore parse error */ }
    }

    defaultOpponents.forEach(opp => {
      // Find matches for this opponent
      const oppScores = localScores.filter((s: Record<string, unknown>) => s.userId === opp.userId && s.season === season);
      const oppTotal = oppScores.reduce((sum: number, s: Record<string, unknown>) => sum + (s.score as number || 0), 0);
      
      list.push({
        userId: opp.userId,
        displayName: opp.displayName,
        photoURL: opp.photoURL,
        totalPoints: opp.totalPoints + oppTotal // Base + added points
      });
    });

    return list.sort((a, b) => b.totalPoints - a.totalPoints);
  }
  
  return [];
}
