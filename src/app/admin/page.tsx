"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { 
  getSeasonSchedule, 
  getDrivers, 
  getAllDriversIncludingInactive,
  getQualifyingResults, 
  getRaceResults, 
  getSprintResults, 
  saveDriverOverride,
  clearAllDriverOverrides,
  autoSyncDriverLineup,
  normalizeConstructorId,
  Race, 
  Driver,
  DriverChangeReport
} from "@/lib/f1Api";
import { useAuth } from "@/context/AuthContext";
import { 
  getPredictionsForRound, 
  calculatePredictionScore, 
  saveUserScore,
  getDriverReplacements,
  saveDriverReplacements,
  clearAllDriverReplacements,
  autoDetectReplacements,
  Prediction,
  ScoreBreakdown
} from "@/lib/predictions";
import { Settings, ShieldAlert, RefreshCw, CheckCircle, AlertTriangle, UserCheck, Users, ArrowRightLeft, Radio, Radar, Eye, EyeOff, RotateCcw } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

/** Shared helper to score a batch of predictions against results and update leaderboard */
async function scoreAndSaveAll(
  predictions: Prediction[],
  officialDriverIds: string[],
  fastestLapDriverId: string | undefined,
  replacements: Record<string, string>,
  season: string,
  round: string,
  sessionType: string,
  addLog: (msg: string) => void
): Promise<number> {
  let scoresComputedCount = 0;

  for (const pred of predictions) {
    const breakdown = calculatePredictionScore(
      pred.driverIds,
      officialDriverIds,
      pred.fastestLapDriverId,
      fastestLapDriverId,
      replacements
    );

    addLog(`Scoring player: ${pred.userName} -> ${breakdown.total} PTS (Exact: ${breakdown.exactMatches}, Off-by-1: ${breakdown.offByOneMatches}, In Top 10: ${breakdown.inTopTenMatches})`);

    await saveUserScore(
      pred.userId,
      pred.userName,
      season,
      round,
      sessionType,
      breakdown.total,
      breakdown
    );
    scoresComputedCount++;
  }

  return scoresComputedCount;
}

export default function Admin() {
  const { user } = useAuth();

  const [schedule, setSchedule] = useState<Race[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]); // Includes inactive
  const [loading, setLoading] = useState(true);

  // Status logging states
  const [activeSyncing, setActiveSyncing] = useState<string | null>(null);
  const [syncingOpenF1, setSyncingOpenF1] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual Entry form states
  const [manualRound, setManualRound] = useState<string>("1");
  const [manualSession, setManualSession] = useState<"quali" | "race" | "sprint" | "sprintQuali">("sprintQuali");
  const [manualGrid, setManualGrid] = useState<string[]>(new Array(10).fill(""));

  // Driver Swap states
  const [swapDriverId, setSwapDriverId] = useState<string>("");
  const [swapConstructorId, setSwapConstructorId] = useState<string>("red_bull");

  // Driver Replacement Mapping states
  const [replacementRound, setReplacementRound] = useState<string>("1");
  const [replacedDriverId, setReplacedDriverId] = useState<string>("");
  const [substituteDriverId, setSubstituteDriverId] = useState<string>("");

  // Auto-detection states
  const [changeReport, setChangeReport] = useState<DriverChangeReport | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const scheduleData = await getSeasonSchedule("2026");
        const driversData = await getDrivers("2026");
        const allDriversData = await getAllDriversIncludingInactive("2026");
        setSchedule(scheduleData);
        setDrivers(driversData);
        setAllDrivers(allDriversData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const constNameMap = useMemo<Record<string, string>>(() => ({
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
  }), []);

  const handleAutoDetect = async () => {
    setAutoDetecting(true);
    setLogs([]);
    setErrorMessage(null);
    addLog("Running automatic lineup detection via OpenF1 API...");
    
    try {
      const report = await autoSyncDriverLineup();
      setChangeReport(report);
      
      if (report.hasChanges) {
        addLog(`✅ Lineup changes detected!`);
        
        for (const transfer of report.teamTransfers) {
          addLog(`[TRANSFER] ${transfer.name}: ${transfer.fromTeam} → ${transfer.toTeam}`);
        }
        for (const absent of report.absentDrivers) {
          addLog(`[ABSENT] ${absent.name} not in session (${absent.team})`);
        }
        for (const newD of report.newDrivers) {
          addLog(`[NEW] ${newD.name} appearing for ${newD.team}`);
        }
        for (const sub of report.substitutions) {
          addLog(`[SUBSTITUTION] ${sub.absentName} → ${sub.substituteName} at ${sub.team}`);
          // Pre-populate the replacement rule form
          setReplacedDriverId(sub.absentDriverId);
          setSubstituteDriverId(sub.substituteDriverId);
        }

        // Auto-create replacement rules for the current round
        const activeRound = schedule.find((r) => {
          const raceTime = new Date(`${r.date}T${r.time || "23:59:59Z"}`).getTime();
          return raceTime + 7200000 > Date.now();
        });
        if (activeRound && report.substitutions.length > 0) {
          const reps = await autoDetectReplacements("2026", activeRound.round, report);
          addLog(`Auto-created replacement scoring rules for Round ${activeRound.round}: ${JSON.stringify(reps)}`);
          setReplacementRound(activeRound.round);
        }

        // Refresh drivers
        const updatedDrivers = await getDrivers("2026");
        const updatedAllDrivers = await getAllDriversIncludingInactive("2026");
        setDrivers(updatedDrivers);
        setAllDrivers(updatedAllDrivers);
        addLog("Driver lineup updated with detected changes.");
      } else {
        addLog("No lineup changes detected. Current grid matches OpenF1 data.");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      addLog(`Auto-detection notice: ${message}`);
      addLog("OpenF1 may not have session data yet. Use manual controls to configure lineup changes.");
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleOpenF1Sync = async () => {
    setSyncingOpenF1(true);
    addLog("Fetching live driver lineups from OpenF1 API...");
    try {
      const report = await autoSyncDriverLineup();
      setChangeReport(report);
      
      if (report.hasChanges) {
        addLog(`OpenF1 sync found ${report.teamTransfers.length} transfers, ${report.absentDrivers.length} absences.`);
      } else {
        addLog("OpenF1 sync complete — no lineup changes detected.");
      }
      
      const updatedDrivers = await getDrivers("2026");
      const updatedAllDrivers = await getAllDriversIncludingInactive("2026");
      setDrivers(updatedDrivers);
      setAllDrivers(updatedAllDrivers);
      addLog("Successfully synchronized active lineups with OpenF1!");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch live session data";
      addLog(`OpenF1 Sync Notice: ${message}`);
    } finally {
      setSyncingOpenF1(false);
    }
  };

  const handleDriverSwap = async () => {
    if (!swapDriverId || !swapConstructorId) {
      setErrorMessage("Please select both a driver and a target constructor.");
      return;
    }
    const targetDriver = allDrivers.find(d => d.driverId === swapDriverId);
    const name = constNameMap[swapConstructorId] || swapConstructorId;
    await saveDriverOverride({
      driverId: swapDriverId,
      code: targetDriver?.code,
      constructorId: swapConstructorId,
      constructorName: name,
    });
    const updatedDrivers = await getDrivers("2026");
    const updatedAllDrivers = await getAllDriversIncludingInactive("2026");
    setDrivers(updatedDrivers);
    setAllDrivers(updatedAllDrivers);
    addLog(`[DRIVER SWAP] Updated ${swapDriverId.toUpperCase()} to ${name}`);
    setErrorMessage(null);
  };

  const handleToggleDriverActive = async (driverId: string, currentlyActive: boolean) => {
    const targetDriver = allDrivers.find(d => d.driverId === driverId);
    await saveDriverOverride({
      driverId,
      code: targetDriver?.code,
      isActive: !currentlyActive,
    });
    const updatedDrivers = await getDrivers("2026");
    const updatedAllDrivers = await getAllDriversIncludingInactive("2026");
    setDrivers(updatedDrivers);
    setAllDrivers(updatedAllDrivers);
    addLog(`[LINEUP] ${targetDriver?.code || driverId.toUpperCase()} marked as ${!currentlyActive ? "ACTIVE" : "INACTIVE"}`);
  };

  const handleSaveReplacementRule = async () => {
    if (!replacementRound || !replacedDriverId || !substituteDriverId) {
      setErrorMessage("Please select a round, replaced driver, and substitute driver.");
      return;
    }
    const existing = await getDriverReplacements("2026", replacementRound);
    const updated = {
      ...existing,
      [replacedDriverId]: substituteDriverId,
    };
    await saveDriverReplacements("2026", replacementRound, updated);
    addLog(`[REPLACEMENT RULE] Round ${replacementRound}: ${replacedDriverId.toUpperCase()} mapped to substitute ${substituteDriverId.toUpperCase()}`);
    setErrorMessage(null);
  };

  const handleResetLineup = async () => {
    await clearAllDriverOverrides();
    await clearAllDriverReplacements();
    setChangeReport(null);
    const updatedDrivers = await getDrivers("2026");
    const updatedAllDrivers = await getAllDriversIncludingInactive("2026");
    setDrivers(updatedDrivers);
    setAllDrivers(updatedAllDrivers);
    addLog("[RESET] All driver overrides and substitute scoring rules have been reset to baseline 2026 lineup.");
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
        officialDriverIds = results.map(r => r.driverId);
        addLog(`Successfully retrieved official Quali Top 3: ${results.slice(0, 3).map(r => `${r.position}. ${r.code}`).join(", ")}`);
      } else if (sessionType === "race") {
        const results = await getRaceResults(round, "2026");
        if (results.length === 0) {
          throw new Error("No race results found from official F1 API yet. Race may not have concluded.");
        }
        officialDriverIds = results.map(r => r.driverId);

        const fl = results.find(r => r.fastestLap);
        fastestLapDriverId = fl?.driverId;
        addLog(`Successfully retrieved official Race Top 3: ${results.slice(0, 3).map(r => `${r.position}. ${r.code}`).join(", ")}`);
        if (fastestLapDriverId) {
          const flDriver = allDrivers.find(d => d.driverId === fastestLapDriverId);
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
        const resRef = doc(db, "results", `2026_${round}_sprintQuali`);
        const resSnap = await getDoc(resRef);
        if (resSnap.exists()) {
          manualDriverIds = resSnap.data().driverIds || [];
        }
        if (manualDriverIds.length === 0) {
          throw new Error("No manually entered results found for Sprint Qualifying. Please use the Manual Entry form first.");
        }
        officialDriverIds = manualDriverIds;
        addLog(`Successfully retrieved manually entered Sprint Quali Results.`);
      }

      // Load replacement driver mappings for this round
      const replacements = await getDriverReplacements("2026", round);
      if (Object.keys(replacements).length > 0) {
        addLog(`Applied Driver Replacement Rules for Round ${round}: ${JSON.stringify(replacements)}`);
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

      // 3. Score using shared helper
      addLog(`Calculating scores...`);
      const scoresComputedCount = await scoreAndSaveAll(
        sessionPredictions,
        officialDriverIds,
        fastestLapDriverId,
        replacements,
        "2026",
        round,
        sessionType,
        addLog
      );

      addLog(`Success! Scored and updated ${scoresComputedCount} players.`);
      addLog(`Leaderboard recalculation finished.`);

    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Failed to synchronize results.";
      setErrorMessage(message);
      addLog(`ERROR: Sync aborted.`);
    } finally {
      setActiveSyncing(null);
    }
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
      const filledDrivers = driverIds.filter(id => id !== "");
      if (filledDrivers.length < 10) {
        throw new Error("Please select all 10 positions for the manual results.");
      }

      addLog(`Saving manual results to database...`);
      const resRef = doc(db, "results", `2026_${round}_${sessionType}`);
      await setDoc(resRef, {
        driverIds: filledDrivers,
        updatedAt: Date.now()
      });

      addLog(`Grid Results saved successfully.`);

      const replacements = await getDriverReplacements("2026", round);
      if (Object.keys(replacements).length > 0) {
        addLog(`Applied Replacement Rules for Round ${round}: ${JSON.stringify(replacements)}`);
      }

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
      const scoresComputedCount = await scoreAndSaveAll(
        sessionPredictions,
        filledDrivers,
        undefined,
        replacements,
        "2026",
        round,
        sessionType,
        addLog
      );

      addLog(`Success! Scored and updated ${scoresComputedCount} players.`);
      addLog(`Leaderboard recalculation finished.`);

    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Failed to synchronize results.";
      setErrorMessage(message);
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
  const isAuthorized = user && (user.isAdmin || user.email === "rgtizon0@gmail.com");
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
          <p className="text-slate-400 text-sm mt-1">Manage championship results synchronization, driver lineup adjustments, and player scoring.</p>
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
                    onClick={() => triggerSync(race.round, race.raceName, "quali")}
                    disabled={activeSyncing !== null}
                    className="flex items-center gap-1.5 bg-surface hover:bg-surface-hover border border-border px-3.5 py-2 rounded-lg text-xs font-mono font-bold text-white active:scale-95 transition-all disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${activeSyncing === `${race.round}_quali` ? "animate-spin text-secondary" : ""}`} />
                    Score Quali
                  </button>

                  {/* Sprint Sync (if sprint weekend) */}
                  {race.Sprint && (
                    <button
                      onClick={() => triggerSync(race.round, race.raceName, "sprint")}
                      disabled={activeSyncing !== null}
                      className="flex items-center gap-1.5 bg-sprint/15 hover:bg-sprint/30 border border-sprint/40 px-3.5 py-2 rounded-lg text-xs font-mono font-bold text-sprint active:scale-95 transition-all disabled:opacity-40"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${activeSyncing === `${race.round}_sprint` ? "animate-spin text-sprint" : ""}`} />
                      Score Sprint
                    </button>
                  )}

                  {/* GP Race Sync */}
                  <button
                    onClick={() => triggerSync(race.round, race.raceName, "race")}
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
                        setManualRound(race.round);
                        setManualSession("sprintQuali");
                        const manualSection = document.getElementById("manual-entry-section");
                        manualSection?.scrollIntoView({ behavior: "smooth" });
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

          {/* Dynamic Lineup & Driver Swap Management Panel */}
          <div className="glass-panel p-6 rounded-2xl border border-secondary/30 space-y-6 mt-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-secondary" />
                  Dynamic Lineup & Driver Swap Manager
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Manage driver team transfers (e.g. Lawson to Red Bull, Tsunoda to RB) and configure substitute driver scoring rules.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Reset Button */}
                <button
                  onClick={handleResetLineup}
                  className="flex items-center gap-1.5 bg-surface hover:bg-red-500/20 border border-border hover:border-red-500/40 text-slate-300 hover:text-red-400 px-3 py-2 rounded-lg text-xs font-mono font-bold transition-all active:scale-95"
                  title="Clear all overrides and substitutions back to baseline"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to Baseline
                </button>

                {/* Auto-Detect Button */}
                <button
                  onClick={handleAutoDetect}
                  disabled={autoDetecting}
                  className="flex items-center gap-2 bg-accent/15 hover:bg-accent/30 border border-accent/40 text-accent px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all disabled:opacity-40"
                >
                  <Radar className={`h-4 w-4 ${autoDetecting ? "animate-spin" : ""}`} />
                  {autoDetecting ? "Detecting..." : "Auto-Detect Changes"}
                </button>

                {/* Live OpenF1 Lineup Sync */}
                <button
                  onClick={handleOpenF1Sync}
                  disabled={syncingOpenF1}
                  className="flex items-center gap-2 bg-secondary/15 hover:bg-secondary/30 border border-secondary/40 text-secondary px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all disabled:opacity-40"
                >
                  <Radio className={`h-4 w-4 ${syncingOpenF1 ? "animate-pulse" : ""}`} />
                  {syncingOpenF1 ? "Syncing OpenF1..." : "Sync OpenF1 Lineup"}
                </button>
              </div>
            </div>

            {/* Auto-Detection Results Banner */}
            {changeReport?.hasChanges && (
              <div className="bg-accent/10 border border-accent/30 p-4 rounded-xl space-y-2 text-xs">
                <div className="flex items-center gap-2 text-accent font-bold text-sm">
                  <Radar className="h-4 w-4" />
                  Detected Lineup Changes
                </div>
                {changeReport.teamTransfers.map((t, i) => (
                  <div key={`t-${i}`} className="text-white">
                    <ArrowRightLeft className="h-3 w-3 inline mr-1 text-sprint" />
                    <strong>{t.name}</strong>: {t.fromTeam} → {t.toTeam}
                  </div>
                ))}
                {changeReport.absentDrivers.map((a, i) => (
                  <div key={`a-${i}`} className="text-white">
                    <EyeOff className="h-3 w-3 inline mr-1 text-primary" />
                    <strong>{a.name}</strong> not participating ({a.team})
                  </div>
                ))}
                {changeReport.substitutions.map((s, i) => (
                  <div key={`s-${i}`} className="text-white">
                    <Users className="h-3 w-3 inline mr-1 text-secondary" />
                    Scoring: <strong>{s.absentName}</strong> → <strong>{s.substituteName}</strong>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              {/* 1. Driver Team Transfer Tool */}
              <div className="bg-surface/50 border border-border p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-secondary" />
                  Driver Team Transfer (Lineup Swap)
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Driver</label>
                    <select
                      value={swapDriverId}
                      onChange={(e) => setSwapDriverId(e.target.value)}
                      className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-white font-semibold focus:border-secondary outline-none cursor-pointer"
                    >
                      <option value="">-- Select Driver --</option>
                      {allDrivers.map(d => (
                        <option key={d.driverId} value={d.driverId}>
                          {d.givenName} {d.familyName} ({d.code}) — Current: {d.constructorName} {d.isActive === false ? " [INACTIVE]" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Target Team / Constructor</label>
                    <select
                      value={swapConstructorId}
                      onChange={(e) => setSwapConstructorId(e.target.value)}
                      className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-white font-semibold focus:border-secondary outline-none cursor-pointer"
                    >
                      {Object.entries(constNameMap).map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleDriverSwap}
                    className="w-full bg-secondary/20 hover:bg-secondary/30 border border-secondary/40 text-secondary font-mono font-bold py-2 rounded-lg text-xs transition-all active:scale-95 shadow-neon-cyan"
                  >
                    Apply Team Transfer
                  </button>
                </div>
              </div>

              {/* 2. Driver Replacement Mapping Tool */}
              <div className="bg-surface/50 border border-border p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-sprint" />
                  Substitute Driver Scoring Rule
                </h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Round</label>
                      <select
                        value={replacementRound}
                        onChange={(e) => setReplacementRound(e.target.value)}
                        className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold focus:border-sprint outline-none cursor-pointer"
                      >
                        {schedule.map(r => (
                          <option key={r.round} value={r.round}>R{r.round} - {r.raceName}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Replaced Driver</label>
                      <select
                        value={replacedDriverId}
                        onChange={(e) => setReplacedDriverId(e.target.value)}
                        className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-white font-semibold focus:border-sprint outline-none cursor-pointer"
                      >
                        <option value="">-- Driver Out --</option>
                        {allDrivers.map(d => (
                          <option key={d.driverId} value={d.driverId}>{d.code} - {d.familyName} {d.isActive === false ? " [INACTIVE]" : ""}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Substitute / Replacement Driver</label>
                    <select
                      value={substituteDriverId}
                      onChange={(e) => setSubstituteDriverId(e.target.value)}
                      className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-white font-semibold focus:border-sprint outline-none cursor-pointer"
                    >
                      <option value="">-- Driver Racing Instead --</option>
                      {allDrivers.map(d => (
                        <option key={d.driverId} value={d.driverId}>{d.code} - {d.givenName} {d.familyName} ({d.constructorName})</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleSaveReplacementRule}
                    className="w-full bg-sprint/20 hover:bg-sprint/30 border border-sprint/40 text-sprint font-mono font-bold py-2 rounded-lg text-xs transition-all active:scale-95"
                  >
                    Save Substitute Scoring Rule
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Driver Active/Inactive Toggle */}
            <div className="border-t border-border/50 pt-4">
              <h4 className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5 mb-3">
                <Eye className="h-3.5 w-3.5 text-accent" />
                Quick Driver Active/Inactive Toggle
              </h4>
              <p className="text-[10px] text-slate-400 mb-3">
                Mark drivers as inactive to hide them from prediction pools. Use this when a driver is not participating in a race weekend.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {allDrivers.map(d => (
                  <button
                    key={d.driverId}
                    onClick={() => handleToggleDriverActive(d.driverId, d.isActive !== false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                      d.isActive !== false
                        ? "bg-surface border-border text-white hover:border-red-500/40 hover:text-red-400"
                        : "bg-red-500/10 border-red-500/30 text-red-400 hover:border-secondary/40 hover:text-secondary"
                    }`}
                  >
                    {d.isActive !== false ? (
                      <Eye className="h-3.5 w-3.5 text-secondary shrink-0" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    )}
                    <div
                      className="w-1.5 h-5 rounded-sm shrink-0"
                      style={{ backgroundColor: d.teamColor }}
                    />
                    <span className="truncate">{d.code} - {d.familyName}</span>
                    {d.isActive === false && (
                      <span className="text-[9px] font-mono bg-red-500/20 px-1 rounded">OFF</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
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
                  onChange={(e) => setManualSession(e.target.value as "quali" | "race" | "sprint" | "sprintQuali")}
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
                      {allDrivers.map(d => (
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
                <span>Connected to <strong>Firebase Cloud Firestore</strong>. Official Jolpica/Ergast API sync enabled.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
