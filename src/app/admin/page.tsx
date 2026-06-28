"use client";

import React, { useEffect, useState } from "react";
import { getSeasonSchedule, getDrivers, getQualifyingResults, getRaceResults, getSprintResults, Race, Driver } from "@/lib/f1Api";
import { useAuth } from "@/context/AuthContext";
import { getPredictionsForRound, calculatePredictionScore, saveUserScore } from "@/lib/predictions";
import { Settings, ShieldAlert, RefreshCw, Award, CheckCircle, AlertTriangle, UserCheck } from "lucide-react";

export default function Admin() {
  const { user, isMock } = useAuth();

  const [schedule, setSchedule] = useState<Race[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  // Status logging states
  const [activeSyncing, setActiveSyncing] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    sessionType: "quali" | "race" | "sprint"
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
  const triggerMockGenerate = async (round: string, raceName: string, sessionType: "quali" | "race" | "sprint") => {
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
        try { localResults = JSON.parse(existingResults); } catch (e) {}
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
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-border/60 pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-2">
            <Settings className="h-8 w-8 text-primary" />
            Admin Control Center
          </h1>
          <p className="text-muted text-sm mt-1">Manage championship results sync and player scoring tables.</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Sync Controls Table */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Championship Season Rounds
          </h3>

          <div className="space-y-3">
            {schedule.slice(0, 8).map((race) => (
              <div
                key={race.round}
                className="glass-panel p-5 rounded-xl border border-border/60 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-muted font-bold font-mono uppercase">Round {race.round}</span>
                    <h4 className="font-bold text-white text-sm">{race.raceName}</h4>
                  </div>
                  <span className="text-xs font-mono text-muted">{race.Circuit.Location.locality}</span>
                </div>

                {/* Session Scoring Buttons */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
                  {/* GP Quali Sync */}
                  <button
                    onClick={() => isMock
                      ? triggerMockGenerate(race.round, race.raceName, "quali")
                      : triggerSync(race.round, race.raceName, "quali")
                    }
                    disabled={activeSyncing !== null}
                    className="flex items-center gap-1 bg-surface hover:bg-surface-hover border border-border px-3 py-1.5 rounded text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3 w-3 ${activeSyncing === `${race.round}_quali` ? "animate-spin" : ""}`} />
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
                      className="flex items-center gap-1 bg-sprint/10 hover:bg-sprint/20 border border-sprint/20 px-3 py-1.5 rounded text-xs font-bold text-sprint active:scale-95 transition-all disabled:opacity-40"
                    >
                      <RefreshCw className={`h-3 w-3 ${activeSyncing === `${race.round}_sprint` ? "animate-spin" : ""}`} />
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
                    className="flex items-center gap-1 bg-primary/10 hover:bg-primary/20 border border-primary/20 px-3 py-1.5 rounded text-xs font-bold text-primary active:scale-95 transition-all disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3 w-3 ${activeSyncing === `${race.round}_race` ? "animate-spin" : ""}`} />
                    Score GP Race
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sync Logs Display */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Execution Output Log
          </h3>

          <div className="glass-panel p-5 rounded-xl border border-border min-h-[350px] flex flex-col justify-between">
            <div className="space-y-3 font-mono text-xs">
              {logs.map((log, idx) => (
                <div key={idx} className="text-muted leading-relaxed">
                  {log}
                </div>
              ))}

              {logs.length === 0 && (
                <div className="text-muted/40 text-center py-20 italic">
                  Run a session score command to see execution logs...
                </div>
              )}
            </div>

            {/* Error Message banner */}
            {errorMessage && (
              <div className="mt-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Admin notification panel */}
            <div className="mt-4 bg-surface/50 border border-border/80 p-3.5 rounded-lg flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-secondary" />
              <div className="text-[11px] text-muted">
                {isMock ? (
                  <span>Running in <strong>Mock Admin Mode</strong>. Scoring computes automatically on fake simulation results.</span>
                ) : (
                  <span>Connected to <strong>Firebase Server</strong>. Action triggers official API calls and updates DB.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
