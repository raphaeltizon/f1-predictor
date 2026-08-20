import { db } from "./firebase";
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc } from "firebase/firestore";

export interface Circuit {
  circuitId: string;
  circuitName: string;
  Location: {
    locality: string;
    country: string;
  };
}

export interface F1Session {
  date: string;
  time: string;
}

export interface Race {
  season: string;
  round: string;
  raceName: string;
  Circuit: Circuit;
  date: string; // GP Race Date
  time: string; // GP Race Time
  FirstPractice?: F1Session;
  SecondPractice?: F1Session;
  ThirdPractice?: F1Session;
  Qualifying: F1Session;
  Sprint?: F1Session;
  SprintQualifying?: F1Session;
}

export interface Driver {
  driverId: string;
  permanentNumber: string;
  code: string;
  givenName: string;
  familyName: string;
  nationality: string;
  constructorId: string;
  constructorName: string;
  teamColor: string;
  isActive?: boolean;
}

export interface DriverOverride {
  driverId: string;
  code?: string;
  givenName?: string;
  familyName?: string;
  constructorId?: string;
  constructorName?: string;
  teamColor?: string;
  isActive?: boolean;
}

/** Describes detected driver changes between baseline and live lineups */
export interface DriverChangeReport {
  teamTransfers: { driverId: string; code: string; name: string; fromTeam: string; toTeam: string; fromConstructorId: string; toConstructorId: string }[];
  absentDrivers: { driverId: string; code: string; name: string; team: string; constructorId: string }[];
  newDrivers: { driverId: string; code: string; name: string; team: string; constructorId: string }[];
  substitutions: { absentDriverId: string; absentName: string; substituteDriverId: string; substituteName: string; team: string; constructorId: string }[];
  hasChanges: boolean;
  detectedAt: number;
}

const CONSTRUCTOR_COLORS: Record<string, string> = {
  red_bull: "#3671C6",
  ferrari: "#F91536",
  mclaren: "#FF8000",
  mercedes: "#27F4D2",
  aston_martin: "#229971",
  alpine: "#0093CC",
  williams: "#64C4FF",
  haas: "#B6BABD",
  sauber: "#52e252",
  kick_sauber: "#52e252",
  audi: "#52e252",
  rb: "#6692FF",
  vcarb: "#6692FF",
  racing_bulls: "#6692FF",
};

const CONSTRUCTOR_DISPLAY_NAMES: Record<string, string> = {
  red_bull: "Red Bull Racing",
  ferrari: "Ferrari",
  mclaren: "McLaren",
  mercedes: "Mercedes",
  aston_martin: "Aston Martin",
  alpine: "Alpine",
  williams: "Williams",
  haas: "Haas F1 Team",
  kick_sauber: "Kick Sauber",
  rb: "Racing Bulls",
};

const BASE_URL = "https://api.jolpi.ca/ergast/f1";

/**
 * Normalize a team name string to a canonical constructor ID.
 * Shared between OpenF1 parsing, Ergast parsing, and admin tools.
 */
export function normalizeConstructorId(teamName: string): string {
  const lower = teamName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  if (lower.includes("red_bull") && !lower.includes("rb") && !lower.includes("racing_bulls")) return "red_bull";
  if (lower.includes("ferrari")) return "ferrari";
  if (lower.includes("mclaren")) return "mclaren";
  if (lower.includes("mercedes")) return "mercedes";
  if (lower.includes("aston")) return "aston_martin";
  if (lower.includes("alpine")) return "alpine";
  if (lower.includes("williams")) return "williams";
  if (lower.includes("haas")) return "haas";
  if (lower.includes("sauber") || lower.includes("audi")) return "kick_sauber";
  if (lower.includes("rb") || lower.includes("vcarb") || lower.includes("racing_bulls")) return "rb";
  return lower;
}

const OVERRIDES_STORAGE_KEY = "f1_driver_overrides";

export function getDriverAliases(identifier: { driverId?: string; code?: string; familyName?: string; givenName?: string }): string[] {
  const aliases = new Set<string>();
  if (identifier.driverId) {
    aliases.add(identifier.driverId);
    aliases.add(identifier.driverId.toLowerCase());
  }
  if (identifier.code) {
    aliases.add(identifier.code.toLowerCase());
    aliases.add(identifier.code.toUpperCase());
  }

  // Check fallback lineup for known mappings (e.g. doo <-> doohan, had <-> hadjar)
  const fallback = getFallbackLineup();
  const match = fallback.find(f => {
    const dId = identifier.driverId?.toLowerCase();
    const fId = f.driverId.toLowerCase();
    const codeMatch = identifier.code && f.code.toUpperCase() === identifier.code.toUpperCase();
    const familyMatch = identifier.familyName && f.familyName.toLowerCase() === identifier.familyName.toLowerCase();
    const idMatch = dId && (fId === dId || (fId.length >= 3 && dId.length >= 3 && (fId.startsWith(dId) || dId.startsWith(fId))));
    return codeMatch || familyMatch || idMatch;
  });

  if (match) {
    aliases.add(match.driverId);
    aliases.add(match.driverId.toLowerCase());
    aliases.add(match.code.toLowerCase());
    aliases.add(match.code.toUpperCase());
  }

  return Array.from(aliases);
}

export async function getDriverOverrides(): Promise<Record<string, DriverOverride>> {
  let localOverrides: Record<string, DriverOverride> = {};
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(OVERRIDES_STORAGE_KEY);
      if (stored) {
        localOverrides = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to read driver overrides from localStorage:", e);
    }
  }

  const res: Record<string, DriverOverride> = {};

  const processOverrideData = (data: DriverOverride) => {
    const aliases = getDriverAliases(data);
    if (data.driverId) aliases.push(data.driverId);

    aliases.forEach(alias => {
      const existing = res[alias];
      if (existing) {
        res[alias] = {
          ...existing,
          ...data,
          isActive: (data.isActive === false || existing.isActive === false) 
            ? false 
            : (data.isActive ?? existing.isActive),
        };
      } else {
        res[alias] = { ...data };
      }
    });
  };

  // 1. First, try reading from results/lineup_overrides (publicly accessible by all users)
  try {
    const publicDocRef = doc(db, "results", "lineup_overrides");
    const publicSnap = await getDoc(publicDocRef);
    if (publicSnap.exists()) {
      const publicData = publicSnap.data();
      const overridesMap = (publicData.overrides || {}) as Record<string, DriverOverride>;
      Object.values(overridesMap).forEach(ov => {
        if (ov && typeof ov === "object") {
          processOverrideData(ov);
        }
      });
    }
  } catch (e) {
    console.warn("Reading results/lineup_overrides notice:", e);
  }

  // 2. Also try reading from driver_overrides collection if accessible
  try {
    const colRef = collection(db, "driver_overrides");
    const snap = await getDocs(colRef);
    snap.docs.forEach(docSnap => {
      const data = docSnap.data() as DriverOverride;
      processOverrideData({ ...data, driverId: data.driverId || docSnap.id });
    });
  } catch (e) {
    // If permission-denied (non-admin), results/lineup_overrides already provided the data!
  }

  // 3. Merge in local overrides if not yet present
  Object.keys(localOverrides).forEach(key => {
    if (!res[key]) {
      res[key] = localOverrides[key];
    }
  });

  if (typeof window !== "undefined" && Object.keys(res).length > 0) {
    try {
      localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(res));
    } catch (e) { /* ignore */ }
  }

  return res;
}

export async function saveDriverOverride(override: DriverOverride): Promise<void> {
  const aliases = getDriverAliases(override);
  if (override.driverId && !aliases.includes(override.driverId)) {
    aliases.push(override.driverId);
  }

  let fullOverridesMap: Record<string, DriverOverride> = {};

  // 1. Immediately write to localStorage across all aliases & dispatch custom sync event
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(OVERRIDES_STORAGE_KEY);
      const existing: Record<string, DriverOverride> = stored ? JSON.parse(stored) : {};
      
      const prev = existing[override.driverId] || {};
      const merged: DriverOverride = { ...prev, ...override };

      aliases.forEach(alias => {
        existing[alias] = merged;
        existing[alias.toLowerCase()] = merged;
      });

      localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(existing));
      fullOverridesMap = existing;
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("f1_overrides_updated", { detail: existing }));
    } catch (e) {
      console.warn("Failed to write driver override to localStorage:", e);
    }
  }

  // 2. Persist to results/lineup_overrides (publicly readable collection)
  try {
    const publicDocRef = doc(db, "results", "lineup_overrides");
    const currentDoc = await getDoc(publicDocRef);
    const existingMap = currentDoc.exists() ? (currentDoc.data().overrides || {}) : {};
    
    const canonicalKey = override.driverId.toLowerCase();
    existingMap[canonicalKey] = override;
    aliases.forEach(a => {
      existingMap[a.toLowerCase()] = { ...override, driverId: a.toLowerCase() };
    });

    await setDoc(publicDocRef, {
      overrides: existingMap,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (e) {
    console.warn("Firebase save to results/lineup_overrides failed:", e);
  }

  // 3. Also persist to driver_overrides collection for redundancy
  try {
    const docIdsToSave = new Set<string>();
    docIdsToSave.add(override.driverId);
    docIdsToSave.add(override.driverId.toLowerCase());
    if (override.code) {
      docIdsToSave.add(override.code.toLowerCase());
    }

    const fallbackMatch = getFallbackLineup().find(f => 
      (override.code && f.code.toUpperCase() === override.code.toUpperCase()) ||
      (override.familyName && f.familyName.toLowerCase() === override.familyName.toLowerCase()) ||
      f.driverId.toLowerCase() === override.driverId.toLowerCase()
    );
    if (fallbackMatch) {
      docIdsToSave.add(fallbackMatch.driverId.toLowerCase());
    }

    const savePromises = Array.from(docIdsToSave).map(id => {
      const docRef = doc(db, "driver_overrides", id);
      return setDoc(docRef, { ...override, driverId: id }, { merge: true });
    });

    await Promise.all(savePromises);
  } catch (e) {
    console.warn("Firebase save driver override failed (saved locally):", e);
  }
}

export async function clearAllDriverOverrides(): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(OVERRIDES_STORAGE_KEY);
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("f1_overrides_updated", { detail: {} }));
    } catch (e) {
      console.warn("Failed to clear localStorage driver overrides:", e);
    }
  }

  try {
    const publicDocRef = doc(db, "results", "lineup_overrides");
    await setDoc(publicDocRef, { overrides: {}, updatedAt: Date.now() });
  } catch (e) {
    console.warn("Firebase clear results/lineup_overrides failed:", e);
  }

  try {
    const colRef = collection(db, "driver_overrides");
    const snap = await getDocs(colRef);
    const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  } catch (e) {
    console.warn("Firebase clear driver overrides failed:", e);
  }
}

/**
 * Helper to find an override for a driver across different ID schemes
 * (e.g. OpenF1 code "doo" vs Ergast/Fallback "doohan").
 */
export function findDriverOverride(
  driver: { driverId: string; code?: string; familyName?: string; givenName?: string },
  overrides: Record<string, DriverOverride>
): DriverOverride | undefined {
  if (!overrides || Object.keys(overrides).length === 0) return undefined;

  const driverIdLower = driver.driverId.toLowerCase();
  const codeLower = driver.code?.toLowerCase();
  const codeUpper = driver.code?.toUpperCase();

  const matches: DriverOverride[] = [];

  const checkMatch = (ov: DriverOverride, key?: string) => {
    if (!ov) return false;
    const ovIdLower = (ov.driverId || key || "").toLowerCase();
    const ovCodeUpper = (ov.code || "").toUpperCase();
    const ovCodeLower = (ov.code || "").toLowerCase();

    if (ovIdLower === driverIdLower) return true;
    if (codeLower && (ovIdLower === codeLower || ovCodeLower === codeLower || ovCodeUpper === codeUpper)) return true;
    if (codeUpper && (ovCodeUpper === codeUpper || ovIdLower === codeLower)) return true;

    if (driver.familyName) {
      const familyLower = driver.familyName.toLowerCase();
      if (ovIdLower === familyLower || familyLower.includes(ovIdLower) || ovIdLower.includes(familyLower)) {
        return true;
      }
    }

    if (ovIdLower.length >= 3 && driverIdLower.length >= 3) {
      if (driverIdLower.startsWith(ovIdLower) || ovIdLower.startsWith(driverIdLower)) {
        return true;
      }
    }

    return false;
  };

  // Direct lookups
  if (overrides[driver.driverId]) matches.push(overrides[driver.driverId]);
  if (overrides[driverIdLower] && !matches.includes(overrides[driverIdLower])) matches.push(overrides[driverIdLower]);
  if (codeLower && overrides[codeLower] && !matches.includes(overrides[codeLower])) matches.push(overrides[codeLower]);
  if (codeUpper && overrides[codeUpper] && !matches.includes(overrides[codeUpper])) matches.push(overrides[codeUpper]);

  // Comprehensive iteration for cross-ID aliases
  for (const key in overrides) {
    const ov = overrides[key];
    if (ov && !matches.includes(ov) && checkMatch(ov, key)) {
      matches.push(ov);
    }
  }

  if (matches.length === 0) return undefined;

  // Merge attributes across matches
  const merged: DriverOverride = Object.assign({}, ...matches);

  // CRITICAL: If ANY matching record specifies isActive: false, this driver MUST be considered inactive
  if (matches.some(m => m.isActive === false)) {
    merged.isActive = false;
  } else if (matches.some(m => m.isActive === true)) {
    merged.isActive = true;
  }

  return merged;
}

export async function getOpenF1LatestDrivers(): Promise<Driver[]> {
  try {
    const url = "https://api.openf1.org/v1/drivers?session_key=latest";
    const data = await fetchWithCache(url, 1800000); // 30 mins cache
    if (!Array.isArray(data) || data.length === 0) return [];

    const uniqueDrivers = new Map<string, Record<string, unknown>>();
    data.forEach((d: Record<string, unknown>) => {
      const acronym = d.name_acronym as string | undefined;
      if (acronym && !uniqueDrivers.has(acronym)) {
        uniqueDrivers.set(acronym, d);
      }
    });

    return Array.from(uniqueDrivers.values()).map((d) => {
      const code = (d.name_acronym as string) || "";
      const driverId = code.toLowerCase();

      const teamName = (d.team_name as string) || "Unknown Team";
      const constId = normalizeConstructorId(teamName);
      const teamColor = d.team_colour ? `#${d.team_colour}` : (CONSTRUCTOR_COLORS[constId] || "#777777");
      const fullName = (d.full_name as string) || "";

      return {
        driverId,
        permanentNumber: String(d.driver_number || "0"),
        code,
        givenName: (d.first_name as string) || fullName.split(" ")[0] || "",
        familyName: (d.last_name as string) || fullName.split(" ").slice(1).join(" ") || code,
        nationality: "F1",
        constructorId: constId,
        constructorName: teamName,
        teamColor,
        isActive: true,
      };
    });
  } catch (e) {
    console.warn("OpenF1 API drivers fetch failed or unavailable:", e);
    return [];
  }
}

// Simple local memory cache
const memoryCache: Record<string, { data: unknown; expiry: number }> = {};

async function fetchWithCache(url: string, cacheDurationMs: number = 3600000): Promise<unknown> {
  const now = Date.now();
  if (memoryCache[url] && memoryCache[url].expiry > now) {
    return memoryCache[url].data;
  }

  // Double cache with localStorage
  if (typeof window !== "undefined") {
    const localVal = localStorage.getItem(`cache_${url}`);
    if (localVal) {
      try {
        const parsed = JSON.parse(localVal);
        if (parsed.expiry > now) {
          memoryCache[url] = parsed;
          return parsed.data;
        }
      } catch (e) {
        // ignore JSON parse error
      }
    }
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();

    const cacheObj = { data, expiry: now + cacheDurationMs };
    memoryCache[url] = cacheObj;

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`cache_${url}`, JSON.stringify(cacheObj));
      } catch (e) {
        // localStorage might be full, silently fail
        console.warn("localStorage cache write failed:", e);
      }
    }

    return data;
  } catch (error) {
    console.error(`Error fetching URL ${url}:`, error);
    // If request fails but we have expired local cache, return it as fallback
    if (typeof window !== "undefined") {
      const localVal = localStorage.getItem(`cache_${url}`);
      if (localVal) {
        try {
          return JSON.parse(localVal).data;
        } catch (e) { /* ignore parse error */ }
      }
    }
    throw error;
  }
}

export async function getSeasonSchedule(season: string = "2026"): Promise<Race[]> {
  try {
    const url = `${BASE_URL}/${season}.json`;
    const data = await fetchWithCache(url, 86400000) as Record<string, any>; // Cache schedule for 24 hours
    const races = data.MRData.RaceTable.Races || [];
    return races;
  } catch (error) {
    console.error("Failed to get schedule:", error);
    return [];
  }
}

export async function getDrivers(season: string = "2026"): Promise<Driver[]> {
  try {
    const overrides = await getDriverOverrides();
    let baseDrivers: Driver[] = [];

    // 1. Try fetching OpenF1 live drivers
    const openF1Drivers = await getOpenF1LatestDrivers();
    if (openF1Drivers.length > 0) {
      baseDrivers = openF1Drivers;
    }

    // 2. Fetch driver standings from Jolpica/Ergast if OpenF1 empty
    if (baseDrivers.length === 0) {
      try {
        const url = `${BASE_URL}/${season}/driverStandings.json`;
        const data = await fetchWithCache(url, 86400000) as Record<string, any>; // Cache standings for 24 hours
        const lists = data.MRData.StandingsTable.StandingsLists || [];

        if (lists.length > 0 && lists[0].DriverStandings) {
          baseDrivers = lists[0].DriverStandings.map((ds: Record<string, any>) => {
            const driver = ds.Driver;
            const constructor = ds.Constructors[0] || { constructorId: "unknown", name: "Unknown" };
            const constId = constructor.constructorId;
            return {
              driverId: driver.driverId,
              permanentNumber: driver.permanentNumber || "0",
              code: driver.code || driver.familyName.substring(0, 3).toUpperCase(),
              givenName: driver.givenName,
              familyName: driver.familyName,
              nationality: driver.nationality,
              constructorId: constId,
              constructorName: constructor.name,
              teamColor: CONSTRUCTOR_COLORS[constId] || "#777777",
              isActive: true,
            };
          });
        }
      } catch (e) {
        console.warn("Ergast driver standings fetch failed:", e);
      }
    }

    // 3. Fallback lineup if no external API returns data
    if (baseDrivers.length === 0) {
      baseDrivers = getFallbackLineup();
    } else {
      // Ensure all fallback drivers exist in array
      const fallbackList = getFallbackLineup();
      fallbackList.forEach((fd) => {
        if (!baseDrivers.some((bd) => bd.driverId === fd.driverId || bd.code === fd.code)) {
          baseDrivers.push(fd);
        }
      });
    }

    // 4. Apply Overrides & filter inactive
    const withOverrides = baseDrivers.map((d) => {
      const ov = findDriverOverride(d, overrides);
      if (ov) {
        const constId = ov.constructorId || d.constructorId;
        return {
          ...d,
          constructorId: constId,
          constructorName: ov.constructorName || d.constructorName,
          teamColor: ov.teamColor || CONSTRUCTOR_COLORS[constId] || d.teamColor,
          isActive: ov.isActive !== undefined ? ov.isActive : d.isActive !== false,
        };
      }
      return {
        ...d,
        teamColor: CONSTRUCTOR_COLORS[d.constructorId] || d.teamColor || "#777777",
        isActive: d.isActive !== false,
      };
    });

    // 5. Filter out inactive drivers so they don't appear in prediction pools
    return withOverrides.filter(d => d.isActive !== false);

  } catch (error) {
    console.error("Failed to get drivers:", error);
    return getFallbackLineup();
  }
}

/**
 * Get the full driver list WITHOUT filtering inactive — used by admin tools
 * to show all drivers (including deactivated ones) for management purposes.
 */
export async function getAllDriversIncludingInactive(season: string = "2026"): Promise<Driver[]> {
  try {
    const overrides = await getDriverOverrides();
    let baseDrivers: Driver[] = [];

    const openF1Drivers = await getOpenF1LatestDrivers();
    if (openF1Drivers.length > 0) {
      baseDrivers = openF1Drivers;
    }

    if (baseDrivers.length === 0) {
      baseDrivers = getFallbackLineup();
    } else {
      const fallbackList = getFallbackLineup();
      fallbackList.forEach((fd) => {
        if (!baseDrivers.some((bd) => bd.driverId === fd.driverId || bd.code === fd.code)) {
          baseDrivers.push(fd);
        }
      });
    }

    return baseDrivers.map((d) => {
      const ov = findDriverOverride(d, overrides);
      if (ov) {
        const constId = ov.constructorId || d.constructorId;
        return {
          ...d,
          constructorId: constId,
          constructorName: ov.constructorName || d.constructorName,
          teamColor: ov.teamColor || CONSTRUCTOR_COLORS[constId] || d.teamColor,
          isActive: ov.isActive !== undefined ? ov.isActive : d.isActive !== false,
        };
      }
      return {
        ...d,
        teamColor: CONSTRUCTOR_COLORS[d.constructorId] || d.teamColor || "#777777",
        isActive: d.isActive !== false,
      };
    });
  } catch (error) {
    console.error("Failed to get all drivers:", error);
    return getFallbackLineup();
  }
}

// Qualifying Results Structure
export interface QualiResult {
  position: number;
  driverId: string;
  driverName: string;
  code: string;
  constructorName: string;
  q1?: string;
  q2?: string;
  q3?: string;
}

// Race & Sprint Results Structure
export interface RaceResult {
  position: number;
  driverId: string;
  driverName: string;
  code: string;
  constructorName: string;
  points: number;
  laps: number;
  status: string;
  fastestLap?: boolean;
}

export async function getQualifyingResults(round: string, season: string = "2026"): Promise<QualiResult[]> {
  try {
    const url = `${BASE_URL}/${season}/${round}/qualifying.json`;
    const data = await fetchWithCache(url, 300000) as Record<string, any>; // Cache results for 5 minutes
    const races = data.MRData.RaceTable.Races || [];
    if (races.length > 0 && races[0].QualifyingResults) {
      return races[0].QualifyingResults.map((r: Record<string, any>) => ({
        position: parseInt(r.position),
        driverId: r.Driver.driverId,
        driverName: `${r.Driver.givenName} ${r.Driver.familyName}`,
        code: r.Driver.code || "",
        constructorName: r.Constructor.name,
        q1: r.Q1,
        q2: r.Q2,
        q3: r.Q3,
      }));
    }
    return [];
  } catch (error) {
    console.error("Failed to get qualifying results:", error);
    return [];
  }
}

export async function getRaceResults(round: string, season: string = "2026"): Promise<RaceResult[]> {
  try {
    const url = `${BASE_URL}/${season}/${round}/results.json`;
    const data = await fetchWithCache(url, 300000) as Record<string, any>; // Cache results for 5 minutes
    const races = data.MRData.RaceTable.Races || [];
    if (races.length > 0 && races[0].Results) {
      return races[0].Results.map((r: Record<string, any>) => ({
        position: parseInt(r.position),
        driverId: r.Driver.driverId,
        driverName: `${r.Driver.givenName} ${r.Driver.familyName}`,
        code: r.Driver.code || "",
        constructorName: r.Constructor.name,
        points: parseFloat(r.points || "0"),
        laps: parseInt(r.laps || "0"),
        status: r.status,
        fastestLap: r.FastestLap?.rank === "1",
      }));
    }
    return [];
  } catch (error) {
    console.error("Failed to get race results:", error);
    return [];
  }
}

export async function getSprintResults(round: string, season: string = "2026"): Promise<RaceResult[]> {
  try {
    const url = `${BASE_URL}/${season}/${round}/sprint.json`;
    const data = await fetchWithCache(url, 300000) as Record<string, any>;
    const races = data.MRData.RaceTable.Races || [];
    if (races.length > 0 && races[0].SprintResults) {
      return races[0].SprintResults.map((r: Record<string, any>) => ({
        position: parseInt(r.position),
        driverId: r.Driver.driverId,
        driverName: `${r.Driver.givenName} ${r.Driver.familyName}`,
        code: r.Driver.code || "",
        constructorName: r.Constructor.name,
        points: parseFloat(r.points || "0"),
        laps: parseInt(r.laps || "0"),
        status: r.status,
      }));
    }
    return [];
  } catch (error) {
    console.error("Failed to get sprint results:", error);
    return [];
  }
}

/**
 * Detect differences between the baseline (fallback) lineup and the live OpenF1 lineup.
 * Returns a structured report of team transfers, absent drivers, new drivers, and inferred substitutions.
 */
export function detectDriverChanges(baselineDrivers: Driver[], liveDrivers: Driver[]): DriverChangeReport {
  const report: DriverChangeReport = {
    teamTransfers: [],
    absentDrivers: [],
    newDrivers: [],
    substitutions: [],
    hasChanges: false,
    detectedAt: Date.now(),
  };

  if (liveDrivers.length === 0) return report;

  const baselineMap = new Map(baselineDrivers.map(d => [d.driverId, d]));
  const liveMap = new Map(liveDrivers.map(d => [d.driverId, d]));

  // Also create code-based maps for fuzzy matching (OpenF1 may use different driverIds)
  const baselineByCode = new Map(baselineDrivers.map(d => [d.code, d]));
  const liveByCode = new Map(liveDrivers.map(d => [d.code, d]));

  // Detect team transfers: driver exists in both but with different constructorId
  liveByCode.forEach((liveDriver, code) => {
    const baselineDriver = baselineByCode.get(code);
    if (baselineDriver && baselineDriver.constructorId !== liveDriver.constructorId) {
      report.teamTransfers.push({
        driverId: baselineDriver.driverId,
        code: baselineDriver.code,
        name: `${baselineDriver.givenName} ${baselineDriver.familyName}`,
        fromTeam: CONSTRUCTOR_DISPLAY_NAMES[baselineDriver.constructorId] || baselineDriver.constructorName,
        toTeam: CONSTRUCTOR_DISPLAY_NAMES[liveDriver.constructorId] || liveDriver.constructorName,
        fromConstructorId: baselineDriver.constructorId,
        toConstructorId: liveDriver.constructorId,
      });
    }
  });

  // Detect absent drivers: in baseline but NOT in live
  baselineByCode.forEach((baselineDriver, code) => {
    if (!liveByCode.has(code)) {
      report.absentDrivers.push({
        driverId: baselineDriver.driverId,
        code: baselineDriver.code,
        name: `${baselineDriver.givenName} ${baselineDriver.familyName}`,
        team: CONSTRUCTOR_DISPLAY_NAMES[baselineDriver.constructorId] || baselineDriver.constructorName,
        constructorId: baselineDriver.constructorId,
      });
    }
  });

  // Detect new drivers: in live but NOT in baseline
  liveByCode.forEach((liveDriver, code) => {
    if (!baselineByCode.has(code)) {
      report.newDrivers.push({
        driverId: liveDriver.driverId,
        code: liveDriver.code,
        name: `${liveDriver.givenName} ${liveDriver.familyName}`,
        team: CONSTRUCTOR_DISPLAY_NAMES[liveDriver.constructorId] || liveDriver.constructorName,
        constructorId: liveDriver.constructorId,
      });
    }
  });

  // Infer substitutions: if a driver is absent from team X, and a new driver appeared on team X
  for (const absent of report.absentDrivers) {
    const substitute = report.newDrivers.find(n => n.constructorId === absent.constructorId);
    if (substitute) {
      report.substitutions.push({
        absentDriverId: absent.driverId,
        absentName: absent.name,
        substituteDriverId: substitute.driverId,
        substituteName: substitute.name,
        team: absent.team,
        constructorId: absent.constructorId,
      });
    }
  }

  // Also check team transfers as a substitution chain:
  // If driver A left team X → team Y, and driver B was absent from team Y, then A replaces B
  for (const transfer of report.teamTransfers) {
    const absentFromTargetTeam = report.absentDrivers.find(a => a.constructorId === transfer.toConstructorId);
    if (absentFromTargetTeam) {
      // Check if this substitution wasn't already inferred
      const alreadyInferred = report.substitutions.some(
        s => s.absentDriverId === absentFromTargetTeam.driverId && s.constructorId === transfer.toConstructorId
      );
      if (!alreadyInferred) {
        report.substitutions.push({
          absentDriverId: absentFromTargetTeam.driverId,
          absentName: absentFromTargetTeam.name,
          substituteDriverId: transfer.driverId,
          substituteName: `${transfer.name}`,
          team: CONSTRUCTOR_DISPLAY_NAMES[transfer.toConstructorId] || transfer.toTeam,
          constructorId: transfer.toConstructorId,
        });
      }
    }
  }

  report.hasChanges = report.teamTransfers.length > 0 || report.absentDrivers.length > 0 ||
    report.newDrivers.length > 0 || report.substitutions.length > 0;

  return report;
}

/**
 * Orchestrates fetching OpenF1 data, comparing it to baseline, and applying overrides.
 * Returns the change report for display/logging.
 * This runs automatically but respects the 30-minute cache, so it won't hit the API excessively.
 */
export async function autoSyncDriverLineup(): Promise<DriverChangeReport> {
  const baseline = getFallbackLineup();
  const liveDrivers = await getOpenF1LatestDrivers();
  const report = detectDriverChanges(baseline, liveDrivers);

  if (report.hasChanges) {
    // Auto-apply team transfers as driver overrides
    for (const transfer of report.teamTransfers) {
      await saveDriverOverride({
        driverId: transfer.driverId,
        code: transfer.code,
        constructorId: transfer.toConstructorId,
        constructorName: CONSTRUCTOR_DISPLAY_NAMES[transfer.toConstructorId] || transfer.toTeam,
        teamColor: CONSTRUCTOR_COLORS[transfer.toConstructorId],
        isActive: true,
      });
    }

    // Mark absent drivers as inactive
    for (const absent of report.absentDrivers) {
      await saveDriverOverride({
        driverId: absent.driverId,
        code: absent.code,
        isActive: false,
      });
    }

    // Mark new/substitute drivers as active
    for (const newDriver of report.newDrivers) {
      await saveDriverOverride({
        driverId: newDriver.driverId,
        code: newDriver.code,
        constructorId: newDriver.constructorId,
        constructorName: CONSTRUCTOR_DISPLAY_NAMES[newDriver.constructorId] || newDriver.team,
        teamColor: CONSTRUCTOR_COLORS[newDriver.constructorId],
        isActive: true,
      });
    }
  }

  return report;
}

function getFallbackLineup(): Driver[] {
  // Accurate 2026 F1 grid
  const lineup = [
    { id: "max_verstappen", first: "Max", last: "Verstappen", code: "VER", num: "1", constId: "red_bull", constName: "Red Bull Racing" },
    { id: "hadjar", first: "Isack", last: "Hadjar", code: "HAD", num: "20", constId: "red_bull", constName: "Red Bull Racing" },
    { id: "hamilton", first: "Lewis", last: "Hamilton", code: "HAM", num: "44", constId: "ferrari", constName: "Ferrari" },
    { id: "leclerc", first: "Charles", last: "Leclerc", code: "LEC", num: "16", constId: "ferrari", constName: "Ferrari" },
    { id: "norris", first: "Lando", last: "Norris", code: "NOR", num: "4", constId: "mclaren", constName: "McLaren" },
    { id: "piastri", first: "Oscar", last: "Piastri", code: "PIA", num: "81", constId: "mclaren", constName: "McLaren" },
    { id: "russell", first: "George", last: "Russell", code: "RUS", num: "63", constId: "mercedes", constName: "Mercedes" },
    { id: "antonelli", first: "Kimi", last: "Antonelli", code: "ANT", num: "12", constId: "mercedes", constName: "Mercedes" },
    { id: "alonso", first: "Fernando", last: "Alonso", code: "ALO", num: "14", constId: "aston_martin", constName: "Aston Martin" },
    { id: "stroll", first: "Lance", last: "Stroll", code: "STR", num: "18", constId: "aston_martin", constName: "Aston Martin" },
    { id: "gasly", first: "Pierre", last: "Gasly", code: "GAS", num: "10", constId: "alpine", constName: "Alpine" },
    { id: "doohan", first: "Jack", last: "Doohan", code: "DOO", num: "7", constId: "alpine", constName: "Alpine" },
    { id: "colapinto", first: "Franco", last: "Colapinto", code: "COL", num: "43", constId: "alpine", constName: "Alpine" },
    { id: "albon", first: "Alexander", last: "Albon", code: "ALB", num: "23", constId: "williams", constName: "Williams" },
    { id: "sainz", first: "Carlos", last: "Sainz", code: "SAI", num: "55", constId: "williams", constName: "Williams" },
    { id: "tsunoda", first: "Yuki", last: "Tsunoda", code: "TSU", num: "22", constId: "rb", constName: "Racing Bulls" },
    { id: "lawson", first: "Liam", last: "Lawson", code: "LAW", num: "30", constId: "rb", constName: "Racing Bulls" },
    { id: "hulkenberg", first: "Nico", last: "Hülkenberg", code: "HUL", num: "27", constId: "kick_sauber", constName: "Kick Sauber" },
    { id: "bortoleto", first: "Gabriel", last: "Bortoleto", code: "BOR", num: "5", constId: "kick_sauber", constName: "Kick Sauber" },
    { id: "bearman", first: "Oliver", last: "Bearman", code: "BEA", num: "87", constId: "haas", constName: "Haas F1 Team" },
    { id: "ocon", first: "Esteban", last: "Ocon", code: "OCO", num: "31", constId: "haas", constName: "Haas F1 Team" },
  ];

  return lineup.map(d => ({
    driverId: d.id,
    permanentNumber: d.num,
    code: d.code,
    givenName: d.first,
    familyName: d.last,
    nationality: "Various",
    constructorId: d.constId,
    constructorName: d.constName,
    teamColor: CONSTRUCTOR_COLORS[d.constId] || "#777777",
    isActive: true,
  }));
}
