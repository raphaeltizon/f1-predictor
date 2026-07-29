"use client";

import React, { useEffect, useState } from "react";
import { getSeasonSchedule, getDrivers, getQualifyingResults, getRaceResults, getSprintResults, Race, Driver } from "@/lib/f1Api";
import { useAuth } from "@/context/AuthContext";
import { getPredictionsForRound, calculatePredictionScore, saveUserScore } from "@/lib/predictions";
import { Settings, ShieldAlert, RefreshCw, Award, CheckCircle, AlertTriangle, UserCheck } from "lucide-react";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

export default function Admin() {
  const { user, isMock } = useAuth();

  const [schedule, setSchedule] = useState<Race[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  // Status logging states
  const [activeSyncing, setActiveSyncing] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual Entry form states
  const [manualRound, setManualRound] = useState<string>("1");
  const [manualSession, setManualSession] = useState<"quali" | "race" | "sprint" | "sprintQuali">("sprintQuali");
  const [manualGrid, setManualGrid] = useState<string[]>(new Array(10).fill(""));

  useEffect(() => {
    async function loadData() {
      try {
        const scheduleData = await getSeasonSchedule("2026");
        const driversData = await getDrivers("2026");
        setSchedule(scheduleData);
        setDrivers(driversData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const triggerSync = async (
    round: string,
    raceName: string,
    sessionType: "quali" | "race" | "sprint" | "sprintQuali"
  ) => {
    const key = `${round}_${sessionType}`;
    setActiveSyncing(key);
    setErrorMessage(null);
    setLogs([]);

    addLog(`Starting sync for ${raceName} - ${sessionType.toUpperCase()}`);

    try {
      let officialDriverIds: string[] = [];
      let fastestLapDriverId: string | undefined = undefined;

      addLog(`Fetching official results from Jolpica API...`);

      // 1. Fetch official results based on session type
      if (sessionType === "quali") {
        const results = await getQualifyingResults(round, "2026");
        if (results.length === 0) {
          throw new Error("No qualifying results found from official F1 API yet. Session may not have concluded.");
        }
        // Map to driver IDs
        officialDriverIds = results.map(r => r.driverId);
        addLog(`Successfully retrieved official Quali Top 3: ${results.slice(0, 3).map(r => `${r.position}. ${r.code}`).join(", ")}`);
      } else if (sessionType === "race") {
        const results = await getRaceResults(round, "2026");
        if (results.length === 0) {
          throw new Error("No race results found from official F1 API yet. Race may not have concluded.");
        }
        officialDriverIds = results.map(r => r.driverId);

        // Find fastest lap driver
        const fl = results.find(r => r.fastestLap);
        fastestLapDriverId = fl?.driverId;
        addLog(`Successfully retrieved official Race Top 3: ${results.slice(0, 3).map(r => `${r.position}. ${r.code}`).join(", ")}`);
        if (fastestLapDriverId) {
          const flDriver = drivers.find(d => d.driverId === fastestLapDriverId);
          addLog(`Fastest Lap: ${flDriver?.code || fastestLapDriverId}`);
        }
      } else if (sessionType === "sprint") {
        const results = await getSprintResults(round, "2026");
        if (results.length === 0) {
          throw new Error("No sprint results found from official F1 API yet. Sprint may not have concluded.");
        }
        officialDriverIds = results.map(r => r.driverId);
        addLog(`Successfully retrieved official Sprint Top 3: ${results.slice(0, 3).map(r => `${r.position}. ${r.code}`).join(", ")}`);
      } else if (sessionType === "sprintQuali") {
        addLog(`Retrieving manually entered Sprint Shootout results...`);
        let manualDriverIds: string[] = [];
        if (isFirebaseConfigured && db) {
          const resRef = doc(db, "results", `2026_${round}_sprintQuali`);
          const resSnap = await getDoc(resRef);
          if (resSnap.exists()) {
            manualDriverIds = resSnap.data().driverIds || [];
          }
        }
        if (manualDriverIds.length === 0) {
          // Fallback to local storage
          const resultsKey = "f1_local_results";
          const stored = localStorage.getItem(resultsKey);
          if (stored) {
            const allResults = JSON.parse(stored);
            const key = `2026_${round}_sprintQuali`;
            if (allResults[key]) {
              manualDriverIds = allResults[key].driverIds || [];
            }
          }
        }
        if (manualDriverIds.length === 0) {
          throw new Error("No manually entered results found for Sprint Qualifying. Please use the Manual Entry form first.");
        }
        officialDriverIds = manualDriverIds;
        addLog(`Successfully retrieved manually entered Sprint Quali Results.`);
      }

      // 2. Load all user predictions for this round + session
      addLog(`Retrieving player predictions...`);
      const predictions = await getPredictionsForRound("2026", round);

      const sessionPredictions = predictions.filter(p => p.sessionType === sessionType);

      addLog(`Found ${sessionPredictions.length} player submissions for this session.`);

      if (sessionPredictions.length === 0) {
        addLog(`No player predictions to score.`);
        addLog(`Sync completed.`);
        setActiveSyncing(null);
        return;
      }

      // 3. Score each user and update database
      addLog(`Calculating scores...`);
      let scoresComputedCount = 0;

      for (const pred of sessionPredictions) {
        const breakdown = calculatePredictionScore(
          pred.driverIds,
          officialDriverIds,
          pred.fastestLapDriverId,
          fastestLapDriverId
        );

        addLog(`Scoring player: ${pred.userName} -> ${breakdown.total} PTS (Exact: ${breakdown.exactMatches}, Off-by-1: ${breakdown.offByOneMatches}, In Top 10: ${breakdown.inTopTenMatches})`);

        await saveUserScore(
          pred.userId,
          pred.userName,
          "2026",
          round,
          sessionType,
          breakdown.total,
          breakdown
        );
        scoresComputedCount++;
      }

      // Force storage synchronization event for Mock Mode
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("storage"));
      }

      addLog(`Success! Scored and updated ${scoresComputedCount} players.`);
      addLog(`Leaderboard recalculation finished.`);

    } catch (e: any) {
      console.error(e);
      setErrorMessage(e.message || "Failed to synchronize results.");
      addLog(`ERROR: Sync aborted.`);
    } finally {
      setActiveSyncing(null);
    }
  };

  // Mock-mode scoring generator (generates results and scores mock users and current user)
  const triggerMockGenerate = async (round: string, raceName: string, sessionType: "quali" | "race" | "sprint" | "sprintQuali") => {
    const key = `${round}_${sessionType}`;
    setActiveSyncing(key);
    setErrorMessage(null);
    setLogs([]);

    addLog(`[MOCK MODE] Simulating session closure for ${raceName}...`);

    const shuffledDrivers = [...drivers].sort(() => Math.random() - 0.5);
    const mockOfficialIds = shuffledDrivers.slice(0, 10).map(d => d.driverId);
    const mockFastestLapId = shuffledDrivers[Math.floor(Math.random() * 10)].driverId;

    // Save generated results to localStorage so Results page can display them
    if (typeof window !== "undefined") {
      const resultsKey = "f1_local_results";
      const existingResults = localStorage.getItem(resultsKey);
      let localResults: Record<string, any> = {};
      if (existingResults) {
        try { localResults = JSON.parse(existingResults); } catch (e) { }
      }
      localResults[`2026_${round}_${sessionType}`] = {
        driverIds: mockOfficialIds,
        fastestLapDriverId: sessionType === "race" ? mockFastestLapId : undefined
      };
      localStorage.setItem(resultsKey, JSON.stringify(localResults));
    }

    addLog(`Mock Grid Results Top 3: P1: ${shuffledDrivers[0].code}, P2: ${shuffledDrivers[1].code}, P3: ${shuffledDrivers[2].code}`);

    // Create predictions for mock users if none exist, so players have opponents to score
    addLog(`Simulating opponent predictions...`);
    const opponents = [
      { userId: "opponent-1", userName: "Charles Leclerc" },
      { userId: "opponent-2", userName: "Max Verstappen" },
      { userId: "opponent-3", userName: "Lando Norris" },
      { userId: "opponent-4", userName: "Lewis Hamilton" },
    ];

    // Load user prediction (the real player)
    let playerPred = await getPredictionsForRound("2026", round);
    let sessionPlayerPreds = playerPred.filter(p => p.sessionType === sessionType);

    // If real player didn't predict, make a random one for them so they see scoring in action
    if (sessionPlayerPreds.length === 0 && user) {
      addLog(`Real player did not submit predictions. Generating a speculative submission...`);
      const userRandomIds = [...drivers].sort(() => Math.random() - 0.5).slice(0, 10).map(d => d.driverId);
      const userPredObj = {
        userId: user.uid,
        userName: user.displayName || "Racer",
        season: "2026",
        round,
        sessionType,
        driverIds: userRandomIds,
        fastestLapDriverId: sessionType === "race" ? userRandomIds[0] : undefined,
        submittedAt: Date.now()
      };
      sessionPlayerPreds = [userPredObj];
    }

    const allSubmissions = [...sessionPlayerPreds];

    // Build random predictions for opponents
    opponents.forEach(opp => {
      const oppRandomIds = [...drivers].sort(() => Math.random() - 0.5).slice(0, 10).map(d => d.driverId);
      allSubmissions.push({
        userId: opp.userId,
        userName: opp.userName,
        season: "2026",
        round,
        sessionType,
        driverIds: oppRandomIds,
        fastestLapDriverId: sessionType === "race" ? oppRandomIds[0] : undefined,
        submittedAt: Date.now()
      });
    });

    addLog(`Calculating points for ${allSubmissions.length} active players...`);

    for (const pred of allSubmissions) {
      const breakdown = calculatePredictionScore(
        pred.driverIds,
        mockOfficialIds,
        pred.fastestLapDriverId,
        mockFastestLapId
      );

      addLog(`Scored ${pred.userName} -> ${breakdown.total} PTS (Exact: ${breakdown.exactMatches})`);

      await saveUserScore(
        pred.userId,
        pred.userName,
        "2026",
        round,
        sessionType,
        breakdown.total,
        breakdown
      );
    }

    // Force storage event
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"));
    }

    addLog(`[MOCK MODE] Simulation finished successfully.`);
    setActiveSyncing(null);
  };

  const triggerManualScore = async (
    round: string,
    raceName: string,
    sessionType: "quali" | "race" | "sprint" | "sprintQuali",
    driverIds: string[]
  ) => {
    const key = `${round}_${sessionType}`;
    setActiveSyncing(key);
    setErrorMessage(null);
    setLogs([]);

    addLog(`[MANUAL ENTRY] Starting scoring for ${raceName} - ${sessionType.toUpperCase()}`);

    try {
      // Validate grid
      const filledDrivers = driverIds.filter(id => id !== "");
      if (filledDrivers.length < 10) {
        throw new Error("Please select all 10 positions for the manual results.");
      }

      // Save results to Firestore/localStorage
      addLog(`Saving manual results to database...`);
      if (isFirebaseConfigured && db) {
        const resRef = doc(db, "results", `2026_${round}_${sessionType}`);
        await setDoc(resRef, {
          driverIds: filledDrivers,
          updatedAt: Date.now()
        });
      }

      // Always save to local storage as well for results preview & fallback
      if (typeof window !== "undefined") {
        const resultsKey = "f1_local_results";
        const existingResults = localStorage.getItem(resultsKey);
        let localResults: Record<string, any> = {};
        if (existingResults) {
          try { localResults = JSON.parse(existingResults); } catch (e) {}
        }
        localResults[`2026_${round}_${sessionType}`] = {
          driverIds: filledDrivers
        };
        localStorage.setItem(resultsKey, JSON.stringify(localResults));
      }

      addLog(`Grid Results saved successfully.`);

      // Score each user and update database
      addLog(`Retrieving player predictions...`);
      const predictions = await getPredictionsForRound("2026", round);
      const sessionPredictions = predictions.filter(p => p.sessionType === sessionType);

      addLog(`Found ${sessionPredictions.length} player submissions for this session.`);

      if (sessionPredictions.length === 0) {
        addLog(`No player predictions to score.`);
        addLog(`Sync completed.`);
        setActiveSyncing(null);
        return;
      }

      addLog(`Calculating scores...`);
      let scoresComputedCount = 0;

      for (const pred of sessionPredictions) {
        const breakdown = calculatePredictionScore(
          pred.driverIds,
          filledDrivers,
          undefined, // no fastest lap in sprint qualifying
          undefined
        );

        addLog(`Scoring player: ${pred.userName} -> ${breakdown.total} PTS`);

        await saveUserScore(
          pred.userId,
          pred.userName,
          "2026",
          round,
          sessionType,
          breakdown.total,
          breakdown
        );
        scoresComputedCount++;
      }

      // Force storage synchronization event for Mock Mode
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("storage"));
      }

      addLog(`Success! Scored and updated ${scoresComputedCount} players.`);
      addLog(`Leaderboard recalculation finished.`);

    } catch (e: any) {
      console.error(e);
      setErrorMessage(e.message || "Failed to synchronize results.");
      addLog(`ERROR: Sync aborted.`);
    } finally {
      setActiveSyncing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm font-semibold text-muted">Loading Admin Controls...</p>
      </div>
    );
  }

  // Double check admin page permissions
  const isAuthorized = user && (user.isAdmin || user.email === "rgtizon0@gmail.com" || isMock);
  if (!isAuthorized) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center max-w-xl mx-auto border border-red-500/20 space-y-4">
        <ShieldAlert className="h-12 w-12 text-red-500 mx-auto" />
        <h2 className="text-2xl font-extrabold text-white">Access Denied</h2>
        <p className="text-muted text-sm">
          You do not have administrative privileges to access this panel.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="border-b border-border/80 pb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-black text-white flex items-center gap-3">
            <Settings className="h-8 w-8 text-primary" />
            Admin Telemetry Command Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage championship results synchronization, mock data simulation, and player scoring tables.</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Sync Controls Table */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
            Championship Season Rounds
          </h3>

          <div className="space-y-3">
            {schedule.map((race) => (
              <div
                key={race.round}
                className="glass-panel p-5 rounded-xl border border-border/80 space-y-4 shadow-sm hover:border-slate-400 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-display text-[10px] text-slate-400 font-bold uppercase tracking-widest">Round {race.round}</span>
                    <h4 className="font-bold text-white text-base leading-tight">{race.raceName}</h4>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-300">{race.Circuit.Location.locality}</span>
                </div>

                {/* Session Scoring Buttons */}
                <div className="flex flex-wrap gap-2 pt-3 border-t border-border/50">
                  {/* GP Quali Sync */}
                  <button
                    onClick={() => isMock
                      ? triggerMockGenerate(race.round, race.raceName, "quali")
                      : triggerSync(race.round, race.raceName, "quali")
                    }
                    disabled={activeSyncing !== null}
                    className="flex items-center gap-1.5 bg-surface hover:bg-surface-hover border border-border px-3.5 py-2 rounded-lg text-xs font-mono font-bold text-white active:scale-95 transition-all disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${activeSyncing === `${race.round}_quali` ? "animate-spin text-secondary" : ""}`} />
                    Score Quali
                  </button>

                  {/* Sprint Sync (if sprint weekend) */}
                  {race.Sprint && (
                    <button
                      onClick={() => isMock
                        ? triggerMockGenerate(race.round, race.raceName, "sprint")
                        : triggerSync(race.round, race.raceName, "sprint")
                      }
                      disabled={activeSyncing !== null}
                      className="flex items-center gap-1.5 bg-sprint/15 hover:bg-sprint/30 border border-sprint/40 px-3.5 py-2 rounded-lg text-xs font-mono font-bold text-sprint active:scale-95 transition-all disabled:opacity-40"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${activeSyncing === `${race.round}_sprint` ? "animate-spin text-sprint" : ""}`} />
                      Score Sprint
                    </button>
                  )}

                  {/* GP Race Sync */}
                  <button
                    onClick={() => isMock
                      ? triggerMockGenerate(race.round, race.raceName, "race")
                      : triggerSync(race.round, race.raceName, "race")
                    }
                    disabled={activeSyncing !== null}
                    className="flex items-center gap-1.5 bg-primary/15 hover:bg-primary/30 border border-primary/40 px-3.5 py-2 rounded-lg text-xs font-mono font-bold text-primary active:scale-95 transition-all disabled:opacity-40 shadow-neon-red"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${activeSyncing === `${race.round}_race` ? "animate-spin text-primary" : ""}`} />
                    Score GP Race
                  </button>

                  {/* Sprint Shootout (if sprint weekend) */}
                  {race.SprintQualifying && (
                    <button
                      onClick={() => {
                        if (isMock) {
                          triggerMockGenerate(race.round, race.raceName, "sprintQuali");
                        } else {
                          setManualRound(race.round);
                          setManualSession("sprintQuali");
                          const manualSection = document.getElementById("manual-entry-section");
                          manualSection?.scrollIntoView({ behavior: "smooth" });
                        }
                      }}
                      disabled={activeSyncing !== null}
                      className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/40 px-3.5 py-2 rounded-lg text-xs font-mono font-bold text-amber-400 active:scale-95 transition-all disabled:opacity-40"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${activeSyncing === `${race.round}_sprintQuali` ? "animate-spin text-amber-400" : ""}`} />
                      Score Shootout
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Manual Entry Form */}
          <div id="manual-entry-section" className="glass-panel p-6 rounded-2xl border border-border/80 space-y-6 mt-8">
            <div>
              <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                Manual Classification Override
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Manually record position classifications for Sprint Shootout or override official session data.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-mono font-bold text-slate-400 uppercase mb-1.5">Round</label>
                <select
                  value={manualRound}
                  onChange={(e) => setManualRound(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-primary"
                >
                  {schedule.map(r => (
                    <option key={r.round} value={r.round}>Round {r.round} - {r.raceName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-slate-400 uppercase mb-1.5">Session Type</label>
                <select
                  value={manualSession}
                  onChange={(e) => setManualSession(e.target.value as any)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-primary"
                >
                  <option value="sprintQuali">Sprint Shootout (sprintQuali)</option>
                  <option value="sprint">Sprint Race (sprint)</option>
                  <option value="quali">GP Qualifying (quali)</option>
                  <option value="race">GP Race (race)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    const race = schedule.find(r => r.round === manualRound);
                    triggerManualScore(manualRound, race?.raceName || `Round ${manualRound}`, manualSession, manualGrid);
                  }}
                  disabled={activeSyncing !== null}
                  className="w-full f1-skew-btn bg-primary hover:bg-primary-hover border border-primary/20 text-white font-display font-bold py-2 px-4 text-xs tracking-wider uppercase active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-neon-red"
                >
                  <span>
                    <CheckCircle className="h-4 w-4 inline mr-1" />
                    Save & Score
                  </span>
                </button>
              </div>
            </div>

            {/* Drivers select list grid */}
            <div className="space-y-3 pt-4 border-t border-border/50">
              <h4 className="font-display text-xs font-bold text-slate-300 uppercase tracking-wider">P1 - P10 Grid Results</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 10 }).map((_, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-8 text-right font-mono font-black text-xs text-slate-400">P{idx + 1}</span>
                    <select
                      value={manualGrid[idx]}
                      onChange={(e) => {
                        const newGrid = [...manualGrid];
                        newGrid[idx] = e.target.value;
                        setManualGrid(newGrid);
                      }}
                      className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary font-semibold cursor-pointer"
                    >
                      <option value="">-- Select Driver --</option>
                      {drivers.map(d => (
                        <option key={d.driverId} value={d.driverId}>
                          {d.code} - {d.givenName} {d.familyName} ({d.constructorName})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sync Logs Terminal Display */}
        <div className="space-y-4">
          <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
            Execution Console Log
          </h3>

          <div className="glass-panel p-5 rounded-2xl border border-border/80 min-h-[400px] flex flex-col justify-between shadow-lg">
            <div className="space-y-2.5 font-mono text-[11px] max-h-[420px] overflow-y-auto pr-1">
              {logs.map((log, idx) => (
                <div key={idx} className="text-secondary leading-relaxed font-mono">
                  {log}
                </div>
              ))}

              {logs.length === 0 && (
                <div className="text-slate-500 text-center py-24 italic font-mono">
                  &gt; Execute session scoring to view console logs...
                </div>
              )}
            </div>

            {/* Error Message banner */}
            {errorMessage && (
              <div className="mt-4 flex items-center gap-2 bg-red-500/15 border border-red-500/30 text-primary p-3.5 rounded-xl text-xs font-mono font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Admin notification panel */}
            <div className="mt-4 bg-surface/80 border border-border/80 p-4 rounded-xl flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-secondary shrink-0" />
              <div className="text-xs text-slate-300 font-medium">
                {isMock ? (
                  <span>Running in <strong>Mock Mode</strong>. Scoring calculates using locally simulated grid data.</span>
                ) : (
                  <span>Connected to <strong>Firebase Server</strong>. Real Ergast API sync enabled.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

