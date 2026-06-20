"use client";

import React, { useEffect, useState } from "react";
import { getSeasonSchedule, getDrivers, Race, Driver } from "@/lib/f1Api";
import { useAuth } from "@/context/AuthContext";
import { savePrediction, getPrediction, isSessionLocked, getSessionDate } from "@/lib/predictions";
import { 
  ChevronUp, 
  ChevronDown, 
  Trash2, 
  Save, 
  Lock, 
  Unlock, 
  Zap, 
  Calendar, 
  Check, 
  AlertTriangle,
  HelpCircle
} from "lucide-react";

export default function Predictions() {
  const { user, login } = useAuth();
  
  // F1 static/fetched states
  const [races, setRaces] = useState<Race[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection states
  const [selectedRound, setSelectedRound] = useState<string>("");
  const [activeRace, setActiveRace] = useState<Race | null>(null);
  const [activeSession, setActiveSession] = useState<"quali" | "race" | "sprintQuali" | "sprint">("quali");

  // Prediction states
  const [predictedTop10, setPredictedTop10] = useState<string[]>(new Array(10).fill(""));
  const [predictedFastestLap, setPredictedFastestLap] = useState<string>("");
  
  // UI states
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error" | null; msg: string }>({ type: null, msg: "" });
  const [sessionLocked, setSessionLocked] = useState(false);

  // Load schedule and drivers
  useEffect(() => {
    async function init() {
      try {
        const scheduleData = await getSeasonSchedule("2026");
        const driversData = await getDrivers("2026");
        
        setRaces(scheduleData);
        setDrivers(driversData);

        // Find active/next round to default to
        const now = Date.now();
        const active = scheduleData.find((r) => {
          const raceTime = getSessionDate(r.date, r.time).getTime();
          return raceTime + 7200000 > now; // Active until 2 hours post-race
        }) || scheduleData[0] || null;

        if (active) {
          setSelectedRound(active.round);
          setActiveRace(active);
          
          // Determine default session tab
          if (active.SprintQualifying && !isSessionLocked(active.SprintQualifying.date, active.SprintQualifying.time)) {
            setActiveSession("sprintQuali");
          } else if (active.Sprint && !isSessionLocked(active.Sprint.date, active.Sprint.time)) {
            setActiveSession("sprint");
          } else if (!isSessionLocked(active.Qualifying.date, active.Qualifying.time)) {
            setActiveSession("quali");
          } else {
            setActiveSession("race");
          }
        }
      } catch (e) {
        console.error("Initialization error:", e);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Fetch prediction when round/session/user changes
  useEffect(() => {
    if (!selectedRound || !activeRace) return;
    
    // Update active race object based on selectedRound
    const race = races.find(r => r.round === selectedRound) || null;
    setActiveRace(race);
    
    // Compute lock status of the selected session
    checkSessionLock(race, activeSession);

    if (!user) {
      // Reset prediction array for guests
      setPredictedTop10(new Array(10).fill(""));
      setPredictedFastestLap("");
      return;
    }

    async function loadUserPrediction() {
      if (!user) return;
      try {
        const pred = await getPrediction(user.uid, "2026", selectedRound, activeSession);
        if (pred) {
          // Fill prediction values
          const updatedList = [...pred.driverIds];
          while (updatedList.length < 10) updatedList.push("");
          setPredictedTop10(updatedList);
          setPredictedFastestLap(pred.fastestLapDriverId || "");
        } else {
          // Clear
          setPredictedTop10(new Array(10).fill(""));
          setPredictedFastestLap("");
        }
      } catch (e) {
        console.error("Error loading predictions:", e);
      }
    }
    loadUserPrediction();
    setSaveStatus({ type: null, msg: "" });
  }, [selectedRound, activeSession, user, races]);

  const checkSessionLock = (race: Race | null, session: string) => {
    if (!race) {
      setSessionLocked(true);
      return;
    }
    let dateStr = "";
    let timeStr = "";

    switch (session) {
      case "sprintQuali":
        dateStr = race.SprintQualifying?.date || "";
        timeStr = race.SprintQualifying?.time || "";
        break;
      case "sprint":
        dateStr = race.Sprint?.date || "";
        timeStr = race.Sprint?.time || "";
        break;
      case "quali":
        dateStr = race.Qualifying.date;
        timeStr = race.Qualifying.time;
        break;
      case "race":
        dateStr = race.date;
        timeStr = race.time;
        break;
    }

    if (!dateStr) {
      setSessionLocked(true);
    } else {
      setSessionLocked(isSessionLocked(dateStr, timeStr));
    }
  };

  // Session selector handler
  const handleSessionChange = (session: "quali" | "race" | "sprintQuali" | "sprint") => {
    setActiveSession(session);
  };

  // Add driver to the next available spot in predictions
  const selectDriver = (driverId: string) => {
    if (sessionLocked) return;
    
    // Check if driver is already in prediction list
    if (predictedTop10.includes(driverId)) return;

    // Find first empty index
    const firstEmptyIdx = predictedTop10.indexOf("");
    if (firstEmptyIdx !== -1) {
      const newList = [...predictedTop10];
      newList[firstEmptyIdx] = driverId;
      setPredictedTop10(newList);
    }
  };

  // Remove driver from predictions
  const removeDriver = (index: number) => {
    if (sessionLocked) return;
    const newList = [...predictedTop10];
    newList[index] = "";
    setPredictedTop10(newList);
  };

  // Move driver position up or down
  const moveDriver = (index: number, direction: "up" | "down") => {
    if (sessionLocked) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === 9) return;

    const swapIdx = direction === "up" ? index - 1 : index + 1;
    const newList = [...predictedTop10];
    
    // Swap
    const temp = newList[index];
    newList[index] = newList[swapIdx];
    newList[swapIdx] = temp;
    
    setPredictedTop10(newList);
  };

  // Fill in remaining empty spots with highest ranked remaining drivers
  const autoFillRemaining = () => {
    if (sessionLocked) return;
    const newList = [...predictedTop10];
    const availableDrivers = drivers.filter(d => !newList.includes(d.driverId));
    
    let avIdx = 0;
    for (let i = 0; i < 10; i++) {
      if (newList[i] === "" && avIdx < availableDrivers.length) {
        newList[i] = availableDrivers[avIdx].driverId;
        avIdx++;
      }
    }
    setPredictedTop10(newList);
  };

  // Clear all prediction inputs
  const clearAll = () => {
    if (sessionLocked) return;
    setPredictedTop10(new Array(10).fill(""));
    setPredictedFastestLap("");
  };

  // Save prediction handler
  const handleSave = async () => {
    if (!user) {
      setSaveStatus({ type: "error", msg: "Please sign in to save predictions." });
      return;
    }
    if (sessionLocked) {
      setSaveStatus({ type: "error", msg: "This session is locked. Predictions cannot be saved." });
      return;
    }

    // Check if top 10 is fully filled
    if (predictedTop10.some(id => !id)) {
      setSaveStatus({ type: "error", msg: "Please fill in all top 10 positions before saving." });
      return;
    }

    // Check if fastest lap is filled for GP Race
    if (activeSession === "race" && !predictedFastestLap) {
      setSaveStatus({ type: "error", msg: "Please select a driver for the Fastest Lap." });
      return;
    }

    setSaving(true);
    setSaveStatus({ type: null, msg: "" });

    try {
      await savePrediction({
        userId: user.uid,
        userName: user.displayName || "Racer",
        season: "2026",
        round: selectedRound,
        sessionType: activeSession,
        driverIds: predictedTop10,
        fastestLapDriverId: activeSession === "race" ? predictedFastestLap : undefined,
        submittedAt: Date.now(),
      });
      setSaveStatus({ type: "success", msg: "Predictions saved successfully!" });
      setTimeout(() => setSaveStatus({ type: null, msg: "" }), 3000);
    } catch (e) {
      console.error(e);
      setSaveStatus({ type: "error", msg: "Failed to save predictions. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm font-semibold text-muted">Loading Drivers and Sessions...</p>
      </div>
    );
  }

  // Helper variables
  const selectedDriverObjects = predictedTop10.map(id => drivers.find(d => d.driverId === id) || null);
  const remainingDrivers = drivers.filter(d => !predictedTop10.includes(d.driverId));

  return (
    <div className="space-y-8">
      {/* Header with round selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-2">
            Race Weekend Predictions
          </h1>
          <p className="text-muted text-sm mt-1">Submit your grid predictions before session start times.</p>
        </div>

        {/* Round Select Dropdown */}
        <div className="flex items-center gap-2.5 bg-surface border border-border px-3 py-1.5 rounded-lg">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-muted uppercase">Grand Prix:</span>
          <select
            value={selectedRound}
            onChange={(e) => setSelectedRound(e.target.value)}
            className="bg-transparent text-sm font-semibold text-white outline-none cursor-pointer"
          >
            {races.map((r) => (
              <option key={r.round} value={r.round} className="bg-surface text-white">
                Round {r.round}: {r.raceName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main predictions board */}
      {!user ? (
        // Non-logged in banner
        <div className="glass-panel p-8 rounded-2xl text-center space-y-4 max-w-xl mx-auto border border-primary/20">
          <Lock className="h-12 w-12 text-primary mx-auto animate-pulse" />
          <h2 className="text-2xl font-extrabold text-white">Sign In to Predict</h2>
          <p className="text-muted text-sm">
            You must be logged in to submit predictions, join standings, and compete in the predictor championship.
          </p>
          <button
            onClick={login}
            className="f1-skew-btn bg-primary hover:bg-primary-hover px-6 py-3 font-bold text-white text-sm shadow-glass-primary inline-block"
          >
            <span>Sign In with Google</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Race Info & Lock Banner */}
          {activeRace && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface/60 border border-border p-4 rounded-xl">
              <div>
                <h3 className="font-bold text-white text-base">{activeRace.raceName}</h3>
                <p className="text-xs text-muted">
                  {activeRace.Circuit.circuitName} — {activeRace.Circuit.Location.locality}, {activeRace.Circuit.Location.country}
                </p>
              </div>

              {sessionLocked ? (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider">
                  <Lock className="h-4 w-4 text-red-500" />
                  Locked (Session Started)
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-secondary/10 border border-secondary/20 text-secondary px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider animate-pulse-glow-cyan">
                  <Unlock className="h-4 w-4 text-secondary" />
                  Accepting Predictions
                </div>
              )}
            </div>
          )}

          {/* Session Tabs Selector */}
          {activeRace && (
            <div className="flex flex-wrap gap-2 border-b border-border/40 pb-1">
              {activeRace.SprintQualifying && (
                <button
                  onClick={() => handleSessionChange("sprintQuali")}
                  className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
                    activeSession === "sprintQuali"
                      ? "text-sprint border-sprint bg-sprint/5"
                      : "text-muted border-transparent hover:text-white"
                  }`}
                >
                  Sprint Shootout
                </button>
              )}
              {activeRace.Sprint && (
                <button
                  onClick={() => handleSessionChange("sprint")}
                  className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
                    activeSession === "sprint"
                      ? "text-sprint border-sprint bg-sprint/5"
                      : "text-muted border-transparent hover:text-white"
                  }`}
                >
                  Sprint Race
                </button>
              )}
              <button
                onClick={() => handleSessionChange("quali")}
                className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
                  activeSession === "quali"
                    ? "text-secondary border-secondary bg-secondary/5"
                    : "text-muted border-transparent hover:text-white"
                }`}
              >
                GP Qualifying
              </button>
              <button
                onClick={() => handleSessionChange("race")}
                className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
                  activeSession === "race"
                    ? "text-primary border-primary bg-primary/5"
                    : "text-muted border-transparent hover:text-white"
                }`}
              >
                Grand Prix Race
              </button>
            </div>
          )}

          {/* Interactive Predictor Grid layout */}
          <div className="grid gap-8 lg:grid-cols-5">
            {/* Top 10 Predictions Box */}
            <div className="lg:col-span-3 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-lg flex items-center gap-2">
                  <span>Your Predicted Top 10</span>
                </h3>
                
                {/* Control Action Buttons */}
                {!sessionLocked && (
                  <div className="flex gap-2">
                    <button
                      onClick={autoFillRemaining}
                      className="px-3 py-1 rounded bg-surface border border-border text-xs font-bold text-secondary hover:border-secondary transition-all"
                    >
                      Auto-Fill
                    </button>
                    <button
                      onClick={clearAll}
                      className="px-3 py-1 rounded bg-surface border border-border text-xs font-bold text-muted hover:border-red-500 hover:text-red-400 transition-all flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Grid Slots */}
              <div className="space-y-2.5">
                {predictedTop10.map((driverId, idx) => {
                  const driverObj = selectedDriverObjects[idx];
                  return (
                    <div 
                      key={idx} 
                      className="flex items-center gap-3 bg-surface/50 border border-border/80 px-4 py-2.5 rounded-xl leaderboard-row"
                    >
                      {/* Position Label */}
                      <span className="font-mono text-base font-black w-6 text-muted">
                        P{(idx + 1).toString().padStart(2, "0")}
                      </span>

                      {/* Driver Card slot */}
                      {driverObj ? (
                        <div className="flex-1 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Color bar */}
                            <div 
                              className="w-1.5 h-7 rounded-sm"
                              style={{ backgroundColor: driverObj.teamColor }}
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-white leading-tight">
                                {driverObj.givenName} {driverObj.familyName}
                              </span>
                              <span className="text-[10px] text-muted font-semibold uppercase">
                                {driverObj.constructorName}
                              </span>
                            </div>
                          </div>

                          {/* Quick sorting and deletion controls */}
                          {!sessionLocked && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => moveDriver(idx, "up")}
                                disabled={idx === 0}
                                className="p-1 rounded hover:bg-white/5 text-muted hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => moveDriver(idx, "down")}
                                disabled={idx === 9}
                                className="p-1 rounded hover:bg-white/5 text-muted hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => removeDriver(idx)}
                                className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex-1 py-1.5 flex items-center justify-center border border-dashed border-border/60 rounded-lg text-xs font-semibold text-muted/50 select-none">
                          {!sessionLocked ? "Click a driver on the right to place here" : "No prediction submitted"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Fastest Lap selection for Grand Prix Race */}
              {activeSession === "race" && (
                <div className="bg-surface/50 border border-border p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 mt-6">
                  <div className="space-y-1">
                    <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-sprint" />
                      Fastest Lap Prediction
                    </h4>
                    <p className="text-muted text-xs">Nominate the driver who will record the fastest lap of the GP (+5 PTS).</p>
                  </div>

                  {sessionLocked ? (
                    <div className="bg-background border border-border px-4 py-2.5 rounded-lg text-sm text-white font-bold flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-muted" />
                      {drivers.find(d => d.driverId === predictedFastestLap)
                        ? `${drivers.find(d => d.driverId === predictedFastestLap)?.givenName} ${drivers.find(d => d.driverId === predictedFastestLap)?.familyName}`
                        : "None Nominated"}
                    </div>
                  ) : (
                    <select
                      value={predictedFastestLap}
                      onChange={(e) => setPredictedFastestLap(e.target.value)}
                      className="bg-background text-sm font-semibold text-white px-3.5 py-2.5 rounded-lg border border-border focus:border-secondary outline-none w-full md:w-56"
                    >
                      <option value="">-- Choose Driver --</option>
                      {drivers.map((d) => (
                        <option key={d.driverId} value={d.driverId}>
                          {d.code} - {d.givenName} {d.familyName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Save prediction button and alerts */}
              <div className="pt-4 flex flex-col gap-3">
                {saveStatus.type && (
                  <div 
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold border ${
                      saveStatus.type === "success" 
                        ? "bg-green-500/10 border-green-500/20 text-green-400" 
                        : "bg-red-500/10 border-red-500/20 text-red-400"
                    }`}
                  >
                    {saveStatus.type === "success" ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {saveStatus.msg}
                  </div>
                )}
                
                {!sessionLocked && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full f1-skew-btn bg-primary hover:bg-primary-hover px-6 py-3 font-bold text-white text-sm shadow-glass-primary flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <span>
                      <Save className="h-4 w-4 inline mr-1" />
                      {saving ? "Saving Predictions..." : "Save Predictions"}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Drivers Selection Pool */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                Available Drivers
              </h3>
              
              {sessionLocked ? (
                <div className="glass-panel p-5 rounded-xl text-center text-xs text-muted flex flex-col gap-2">
                  <Lock className="h-6 w-6 text-muted mx-auto" />
                  <span>Pool is locked because this session has already started.</span>
                </div>
              ) : (
                <div className="glass-panel p-4 rounded-xl space-y-3">
                  <p className="text-muted text-[11px] leading-relaxed">
                    Click drivers to place them into the next available prediction slot (P1 down to P10).
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2 max-h-[500px] overflow-y-auto pr-1">
                    {drivers.map((driver) => {
                      const isSelected = predictedTop10.includes(driver.driverId);
                      return (
                        <button
                          key={driver.driverId}
                          onClick={() => selectDriver(driver.driverId)}
                          disabled={isSelected}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs font-semibold transition-all ${
                            isSelected
                              ? "bg-border/30 border-border/40 text-muted opacity-40 cursor-not-allowed"
                              : "bg-surface hover:bg-surface-hover border-border hover:border-border-hover text-white active:scale-95"
                          }`}
                        >
                          <div 
                            className="w-1 h-5 rounded-sm shrink-0" 
                            style={{ backgroundColor: driver.teamColor }}
                          />
                          <div className="flex flex-col truncate">
                            <span className="font-bold text-white font-mono leading-none">{driver.code}</span>
                            <span className="text-[10px] text-muted truncate leading-relaxed">
                              {driver.familyName}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
