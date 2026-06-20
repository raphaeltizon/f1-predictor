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

const BASE_URL = "https://api.jolpi.ca/ergast/f1";

// Simple local memory cache
const memoryCache: Record<string, { data: any; expiry: number }> = {};

async function fetchWithCache(url: string, cacheDurationMs: number = 3600000) {
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
      localStorage.setItem(`cache_${url}`, JSON.stringify(cacheObj));
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
        } catch (e) {}
      }
    }
    throw error;
  }
}

export async function getSeasonSchedule(season: string = "2026"): Promise<Race[]> {
  try {
    const url = `${BASE_URL}/${season}.json`;
    const data = await fetchWithCache(url, 86400000); // Cache schedule for 24 hours
    const races = data.MRData.RaceTable.Races || [];
    return races;
  } catch (error) {
    console.error("Failed to get schedule:", error);
    return [];
  }
}

export async function getDrivers(season: string = "2026"): Promise<Driver[]> {
  try {
    // To link drivers with their constructors, we fetch driver standings
    const url = `${BASE_URL}/${season}/driverStandings.json`;
    const data = await fetchWithCache(url, 86400000); // Cache standings for 24 hours
    const lists = data.MRData.StandingsTable.StandingsLists || [];
    
    if (lists.length > 0 && lists[0].DriverStandings) {
      return lists[0].DriverStandings.map((ds: any) => {
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
        };
      });
    }

    // Fallback: fetch general drivers list if standings are not populated yet
    const fallbackUrl = `${BASE_URL}/${season}/drivers.json`;
    const fallbackData = await fetchWithCache(fallbackUrl, 86400000);
    const drivers = fallbackData.MRData.DriverTable.Drivers || [];
    return drivers.map((d: any) => {
      // Create speculative constructor mapping
      return {
        driverId: d.driverId,
        permanentNumber: d.permanentNumber || "0",
        code: d.code || d.familyName.substring(0, 3).toUpperCase(),
        givenName: d.givenName,
        familyName: d.familyName,
        nationality: d.nationality,
        constructorId: "unknown",
        constructorName: "TBD Team",
        teamColor: "#777777",
      };
    });
  } catch (error) {
    console.error("Failed to get drivers:", error);
    // Hardcoded 2026 spec lineup fallback to ensure app always works!
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
    const data = await fetchWithCache(url, 300000); // Cache results for 5 minutes
    const races = data.MRData.RaceTable.Races || [];
    if (races.length > 0 && races[0].QualifyingResults) {
      return races[0].QualifyingResults.map((r: any) => ({
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
    const data = await fetchWithCache(url, 300000); // Cache results for 5 minutes
    const races = data.MRData.RaceTable.Races || [];
    if (races.length > 0 && races[0].Results) {
      return races[0].Results.map((r: any) => ({
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
    const data = await fetchWithCache(url, 300000);
    const races = data.MRData.RaceTable.Races || [];
    if (races.length > 0 && races[0].SprintResults) {
      return races[0].SprintResults.map((r: any) => ({
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

function getFallbackLineup(): Driver[] {
  const lineup = [
    { id: "max_verstappen", first: "Max", last: "Verstappen", code: "VER", constId: "red_bull", constName: "Red Bull Racing" },
    { id: "perez", first: "Sergio", last: "Pérez", code: "PER", constId: "red_bull", constName: "Red Bull Racing" },
    { id: "hamilton", first: "Lewis", last: "Hamilton", code: "HAM", constId: "ferrari", constName: "Ferrari" },
    { id: "leclerc", first: "Charles", last: "Leclerc", code: "LEC", constId: "ferrari", constName: "Ferrari" },
    { id: "norris", first: "Lando", last: "Norris", code: "NOR", constId: "mclaren", constName: "McLaren" },
    { id: "piastri", first: "Oscar", last: "Piastri", code: "PIA", constId: "mclaren", constName: "McLaren" },
    { id: "russell", first: "George", last: "Russell", code: "RUS", constId: "mercedes", constName: "Mercedes" },
    { id: "antonelli", first: "Kimi", last: "Antonelli", code: "ANT", constId: "mercedes", constName: "Mercedes" },
    { id: "alonso", first: "Fernando", last: "Alonso", code: "ALO", constId: "aston_martin", constName: "Aston Martin" },
    { id: "stroll", first: "Lance", last: "Stroll", code: "STR", constId: "aston_martin", constName: "Aston Martin" },
    { id: "gasly", first: "Pierre", last: "Gasly", code: "GAS", constId: "alpine", constName: "Alpine" },
    { id: "doohan", first: "Jack", last: "Doohan", code: "DOO", constId: "alpine", constName: "Alpine" },
    { id: "albon", first: "Alexander", last: "Albon", code: "ALB", constId: "williams", constName: "Williams" },
    { id: "sainz", first: "Carlos", last: "Sainz", code: "SAI", constId: "williams", constName: "Williams" },
    { id: "tsunoda", first: "Yuki", last: "Tsunoda", code: "TSU", constId: "rb", constName: "VCARB" },
    { id: "lawson", first: "Liam", last: "Lawson", code: "LAW", constId: "rb", constName: "VCARB" },
    { id: "hulkenberg", first: "Nico", last: "Hülkenberg", code: "HUL", constId: "kick_sauber", constName: "Kick Sauber" },
    { id: "bortoleto", first: "Gabriel", last: "BOR", code: "BOR", constId: "kick_sauber", constName: "Kick Sauber" },
    { id: "bearman", first: "Oliver", last: "Bearman", code: "BEA", constId: "haas", constName: "Haas F1 Team" },
    { id: "ocon", first: "Esteban", last: "Ocon", code: "OCO", constId: "haas", constName: "Haas F1 Team" },
  ];

  return lineup.map(d => ({
    driverId: d.id,
    permanentNumber: "0",
    code: d.code,
    givenName: d.first,
    familyName: d.last,
    nationality: "Various",
    constructorId: d.constId,
    constructorName: d.constName,
    teamColor: CONSTRUCTOR_COLORS[d.constId] || "#777777",
  }));
}
