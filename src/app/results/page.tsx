"use client";

import React, { useEffect, useState } from "react";
import { 
  getSeasonSchedule, 
  getDrivers, 
  getQualifyingResults, 
  getRaceResults, 
  getSprintResults, 
  Race, 
  Driver, 
  QualiResult, 
  RaceResult 
} from "@/lib/f1Api";
import { useAuth } from "@/context/AuthContext";
import { getSessionDate, isSessionLocked } from "@/lib/predictions";
import Link from "next/link";
import { 
  Award, 
  Calendar, 
  Trophy, 
  Lock, 
  Unlock, 
  Zap, 
  Clock, 
  AlertCircle, 
  Info, 
  ChevronRight, 
  CheckCircle2, 
  HelpCircle,
  TrendingUp,
  Settings
} from "lucide-react";

interface SessionOption {
  key: "fp1" | "fp2" | "fp3" | "sprintQuali" | "sprint" | "quali" | "race";
  name: string;
  dateStr: string;
  timeStr?: string;
  isPractice: boolean;
}

export default function Results() {
  const { isMock } = useAuth();
  
  // States for F1 data
  const [races, setRaces] = useState<Race[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection states
  const [selectedRound, setSelectedRound] = useState<string>("");
  const [activeRace, setActiveRace] = useState<Race | null>(null);
  const [activeSession, setActiveSession] = useState<SessionOption | null>(null);
  
  // Results states
  const [qualiResults, setQualiResults] = useState<QualiResult[]>([]);
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);
  const [mockResults, setMockResults] = useState<{ driverIds: string[]; fastestLapDriverId?: string } | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  // Initialize schedule and drivers list
  useEffect(() => {
    async function init() {
      try {
        const scheduleData = await getSeasonSchedule("2026");
        const driversData = await getDrivers("2026");
        
        setRaces(scheduleData);
        setDrivers(driversData);

        // Default to the first completed round, or active round if all completed
        const now = Date.now();
        const completedRaces = scheduleData.filter(r => {
          const raceTime = getSessionDate(r.date, r.time).getTime();
          return now > raceTime;
        });

        // Use the latest completed round, or default to round 1
        const active = completedRaces.length > 0 
          ? completedRaces[completedRaces.length - 1] 
          : scheduleData[0] || null;

        if (active) {
          setSelectedRound(active.round);
          setActiveRace(active);
          
          // Default active tab to Grand Prix Race
          const sessions = getAvailableSessions(active);
          const defaultSession = sessions.find(s => s.key === "race") || sessions[sessions.length - 1] || null;
          setActiveSession(defaultSession);
        }
      } catch (e) {
        console.error("Error initializing results page:", e);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Update active race when round changes
  useEffect(() => {
    if (!selectedRound || races.length === 0) return;
    const race = races.find(r => r.round === selectedRound) || null;
    setActiveRace(race);
    
    if (race) {
      const sessions = getAvailableSessions(race);
      
      // Preserve current session type selection if available on new race, else default to "race"
      const prevKey = activeSession?.key || "race";
      const nextSession = sessions.find(s => s.key === prevKey) || sessions.find(s => s.key === "race") || sessions[sessions.length - 1] || null;
      setActiveSession(nextSession);
    }
  }, [selectedRound, races]);

  // Load results whenever round or session selection changes
  useEffect(() => {
    if (!selectedRound || !activeSession || !activeRace) return;
    
    setResultsError(null);
    setQualiResults([]);
    setRaceResults([]);
    setMockResults(null);

    const sessionType = activeSession.key;
    const isPractice = activeSession.isPractice || sessionType === "sprintQuali";

    // If it's a practice session, we don't fetch classifications
    if (isPractice) {
      return;
    }

    async function loadSessionResults() {
      setResultsLoading(true);
      try {
        if (isMock) {
          // Load simulated results in mock mode from localStorage
          const resultsKey = "f1_local_results";
          const stored = localStorage.getItem(resultsKey);
          if (stored) {
            const allMockResults = JSON.parse(stored);
            const key = `2026_${selectedRound}_${sessionType === "sprint" ? "sprint" : sessionType === "quali" ? "quali" : "race"}`;
            if (allMockResults[key]) {
              setMockResults(allMockResults[key]);
              setResultsLoading(false);
              return;
            }
          }
          // If no mock data generated yet, show error explaining they need to generate it
          setResultsError("no_mock_data");
        } else {
          // Real mode: fetch from Jolpica API
          if (sessionType === "race") {
            const data = await getRaceResults(selectedRound, "2026");
            if (data && data.length > 0) {
              setRaceResults(data);
            } else {
              setResultsError("empty");
            }
          } else if (sessionType === "quali") {
            const data = await getQualifyingResults(selectedRound, "2026");
            if (data && data.length > 0) {
              setQualiResults(data);
            } else {
              setResultsError("empty");
            }
          } else if (sessionType === "sprint") {
            const data = await getSprintResults(selectedRound, "2026");
            if (data && data.length > 0) {
              setRaceResults(data); // Sprint results share RaceResult format
            } else {
              setResultsError("empty");
            }
          }
        }
      } catch (e) {
        console.error("Error loading results:", e);
        setResultsError("fetch_error");
      } finally {
        setResultsLoading(false);
      }
    }

    loadSessionResults();
  }, [selectedRound, activeSession, isMock, activeRace]);

  // Helper to dynamically build available sessions list
  const getAvailableSessions = (race: Race): SessionOption[] => {
    const list: SessionOption[] = [];
    if (race.FirstPractice) {
      list.push({
        key: "fp1",
        name: "FP1",
        dateStr: race.FirstPractice.date,
        timeStr: race.FirstPractice.time,
        isPractice: true,
      });
    }
    if (race.SecondPractice) {
      list.push({
        key: "fp2",
        name: "FP2",
        dateStr: race.SecondPractice.date,
        timeStr: race.SecondPractice.time,
        isPractice: true,
      });
    }
    if (race.ThirdPractice) {
      list.push({
        key: "fp3",
        name: "FP3",
        dateStr: race.ThirdPractice.date,
        timeStr: race.ThirdPractice.time,
        isPractice: true,
      });
    }
    if (race.SprintQualifying) {
      list.push({
        key: "sprintQuali",
        name: "Sprint Shootout",
        dateStr: race.SprintQualifying.date,
        timeStr: race.SprintQualifying.time,
        isPractice: false, // Standard practice flag doesn't apply to predictions shootout, but we treat it as metadata only
      });
    }
    if (race.Sprint) {
      list.push({
        key: "sprint",
        name: "Sprint Race",
        dateStr: race.Sprint.date,
        timeStr: race.Sprint.time,
        isPractice: false,
      });
    }
    if (race.Qualifying) {
      list.push({
        key: "quali",
        name: "GP Qualifying",
        dateStr: race.Qualifying.date,
        timeStr: race.Qualifying.time,
        isPractice: false,
      });
    }
    list.push({
      key: "race",
      name: "Grand Prix",
      dateStr: race.date,
      timeStr: race.time,
      isPractice: false,
    });
    return list;
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm font-semibold text-muted">Loading Formula 1 Championship Data...</p>
      </div>
    );
  }

  const sessions = activeRace ? getAvailableSessions(activeRace) : [];

  // Find fastest lap driver name in real results
  const fastestLapDriver = raceResults.find(r => r.fastestLap);

  return (
    <div className="space-y-8">
      {/* Header and Round Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-2">
            Championship Results
          </h1>
          <p className="text-muted text-sm mt-1">View official grid placements, final session scores, and fastest lap standings.</p>
        </div>

        {/* Round Selection Dropdown */}
        <div className="flex items-center gap-2.5 bg-surface border border-border px-3 py-1.5 rounded-lg">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-muted uppercase">Select Round:</span>
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

      {activeRace && (
        <div className="space-y-6">
          {/* Active Weekend Meta Information Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface/60 border border-border p-4 rounded-xl">
            <div>
              <h3 className="font-bold text-white text-base">{activeRace.raceName}</h3>
              <p className="text-xs text-muted">
                {activeRace.Circuit.circuitName} — {activeRace.Circuit.Location.locality}, {activeRace.Circuit.Location.country}
              </p>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-bold text-muted uppercase font-mono bg-background border border-border/80 px-3 py-1.5 rounded-md">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>Race Date: {new Date(activeRace.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span>
            </div>
          </div>

          {/* Session Tab Bar Selector */}
          <div className="flex flex-wrap gap-2 border-b border-border/40 pb-1">
            {sessions.map((sess) => {
              const isActive = activeSession?.key === sess.key;
              const isPast = getSessionDate(sess.dateStr, sess.timeStr).getTime() < Date.now();
              let borderClass = "border-transparent text-muted hover:text-white";
              
              if (isActive) {
                if (sess.key === "race") borderClass = "text-primary border-primary bg-primary/5";
                else if (sess.key === "quali") borderClass = "text-secondary border-secondary bg-secondary/5";
                else if (sess.key === "sprint" || sess.key === "sprintQuali") borderClass = "text-sprint border-sprint bg-sprint/5";
                else borderClass = "text-accent border-accent bg-accent/5";
              }

              return (
                <button
                  key={sess.key}
                  onClick={() => setActiveSession(sess)}
                  className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-t-lg border-b-2 transition-all flex items-center gap-1.5 ${borderClass}`}
                >
                  {sess.name}
                  {!isPast && (
                    <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-ping inline-block" title="Upcoming Session" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Main Content Area */}
          {activeSession && (
            <div className="space-y-6">
              {/* Practice Session Detail Box */}
              {activeSession.isPractice || activeSession.key === "sprintQuali" ? (
                <div className="glass-panel p-8 rounded-2xl border border-accent/20 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <Zap className="h-5 w-5 text-accent" />
                      {activeSession.name} Session Details
                    </h3>
                    <div className="flex items-center gap-2">
                      {getSessionDate(activeSession.dateStr, activeSession.timeStr).getTime() < Date.now() ? (
                        <span className="text-[10px] bg-border border border-border-hover px-2.5 py-1 rounded-md text-muted font-bold tracking-wider uppercase">
                          Session Completed
                        </span>
                      ) : (
                        <span className="text-[10px] bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-md text-accent font-bold tracking-wider uppercase animate-pulse">
                          Upcoming Session
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-muted font-mono uppercase">Scheduled Date</span>
                      <p className="text-sm font-semibold text-white">
                        {new Date(activeSession.dateStr).toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric"
                        })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-muted font-mono uppercase">Scheduled Time</span>
                      <p className="text-sm font-semibold text-white">
                        {activeSession.timeStr 
                          ? getSessionDate(activeSession.dateStr, activeSession.timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
                          : "TBD"
                        }
                      </p>
                    </div>
                  </div>

                  {/* Informative Help Banner for practices */}
                  <div className="bg-surface/50 border border-border p-4 rounded-xl flex items-start gap-3">
                    <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-white">Practice Standings Notice</h4>
                      <p className="text-muted text-[11px] leading-relaxed">
                        Free Practice sessions (FP1, FP2, FP3) and the Sprint Shootout standings are used strictly by teams for setup and calibration. Detailed classification classifications and timing spreadsheets are not supported by the Jolpica/Ergast F1 API. Live predictions are unlocked for Sprints, Qualifying, and GP Races.
                      </p>
                    </div>
                  </div>
                </div>
              ) : resultsLoading ? (
                /* Session results loading placeholder */
                <div className="glass-panel p-20 rounded-2xl flex flex-col items-center justify-center gap-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <p className="text-xs font-semibold text-muted">Retrieving standings from official database...</p>
                </div>
              ) : resultsError ? (
                /* Results error / empty states handling */
                <div className="glass-panel p-10 rounded-2xl text-center space-y-4 max-w-xl mx-auto border border-border">
                  <AlertCircle className="h-12 w-12 text-muted mx-auto" />
                  
                  {resultsError === "no_mock_data" ? (
                    <>
                      <h3 className="text-lg font-bold text-white">Results Simulation Required</h3>
                      <p className="text-muted text-xs leading-relaxed">
                        You are currently running in <strong>Mock Mode</strong> (Firebase is not configured). Results for this round have not been generated yet. Go to the Admin Panel to simulate and score this session.
                      </p>
                      <div className="pt-2">
                        <Link
                          href="/admin"
                          className="f1-skew-btn bg-surface hover:bg-surface-hover border border-border px-5 py-2 text-xs font-bold text-white inline-block transition-all active:scale-95"
                        >
                          <span>
                            <Settings className="h-3.5 w-3.5 inline mr-1" />
                            Go to Admin Panel
                          </span>
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-bold text-white">Standings Not Available</h3>
                      {getSessionDate(activeSession.dateStr, activeSession.timeStr).getTime() > Date.now() ? (
                        <p className="text-muted text-xs">
                          This session has not started yet. Official classifications will display here once the session concludes.
                        </p>
                      ) : (
                        <p className="text-muted text-xs leading-relaxed">
                          Official standings for this session have not been published by the F1 API yet. Results are usually updated shortly after the chequered flag is waved.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                /* Standings lists table */
                <div className="space-y-6">
                  {/* GP Race stats summaries: Fastest Lap & Winner */}
                  {activeSession.key === "race" && (fastestLapDriver || (isMock && mockResults?.fastestLapDriverId)) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Winner Showcase Card */}
                      <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-l-4 border-l-yellow-400">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-muted uppercase font-mono">Round Winner</span>
                          <h4 className="text-sm font-extrabold text-white">
                            {isMock ? (
                              (() => {
                                const w = drivers.find(d => d.driverId === mockResults?.driverIds[0]);
                                return w ? `${w.givenName} ${w.familyName}` : "Unknown Driver";
                              })()
                            ) : (
                              raceResults[0] ? raceResults[0].driverName : "N/A"
                            )}
                          </h4>
                          <span className="text-[10px] text-muted font-semibold uppercase">
                            {isMock ? (
                              drivers.find(d => d.driverId === mockResults?.driverIds[0])?.constructorName || ""
                            ) : (
                              raceResults[0] ? raceResults[0].constructorName : ""
                            )}
                          </span>
                        </div>
                        <Trophy className="h-8 w-8 text-yellow-400 opacity-80" />
                      </div>

                      {/* Fastest Lap Showcase Card */}
                      <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-l-4 border-l-purple-500">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-muted uppercase font-mono">Fastest Lap Award</span>
                          <h4 className="text-sm font-extrabold text-white">
                            {isMock ? (
                              (() => {
                                const fl = drivers.find(d => d.driverId === mockResults?.fastestLapDriverId);
                                return fl ? `${fl.givenName} ${fl.familyName}` : "None";
                              })()
                            ) : (
                              fastestLapDriver ? fastestLapDriver.driverName : "N/A"
                            )}
                          </h4>
                          <span className="text-[10px] text-muted font-semibold uppercase">
                            {isMock ? (
                              drivers.find(d => d.driverId === mockResults?.fastestLapDriverId)?.constructorName || ""
                            ) : (
                              fastestLapDriver ? fastestLapDriver.constructorName : ""
                            )}
                          </span>
                        </div>
                        <Zap className="h-8 w-8 text-purple-400 opacity-80 animate-pulse" />
                      </div>
                    </div>
                  )}

                  {/* Standard results grid list */}
                  <div className="glass-panel rounded-2xl overflow-hidden border border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-surface/80 text-xs font-bold uppercase tracking-wider text-muted font-mono">
                            <th className="px-6 py-4 w-20 text-center">Pos</th>
                            <th className="px-6 py-4">Driver</th>
                            <th className="px-6 py-4">Team</th>
                            {activeSession.key === "quali" ? (
                              <>
                                <th className="px-6 py-4 text-center">Q1</th>
                                <th className="px-6 py-4 text-center">Q2</th>
                                <th className="px-6 py-4 text-center">Q3</th>
                              </>
                            ) : (
                              <>
                                <th className="px-6 py-4 text-center">Laps</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4 text-right">Points</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {isMock && mockResults ? (
                            /* RENDER MOCK STANDINGS */
                            mockResults.driverIds.map((driverId, idx) => {
                              const driverObj = drivers.find(d => d.driverId === driverId);
                              const position = idx + 1;
                              const isFastestLap = mockResults.fastestLapDriverId === driverId;
                              
                              // Mock details builder
                              const mockPoints = activeSession.key === "sprint"
                                ? [8, 7, 6, 5, 4, 3, 2, 1][idx] || 0
                                : [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][idx] || 0;

                              return (
                                <tr key={driverId} className="hover:bg-surface/30 transition-all font-medium">
                                  <td className="px-6 py-4 text-center font-mono font-black text-sm text-white">
                                    {position}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div 
                                        className="w-1.5 h-6 rounded-sm shrink-0" 
                                        style={{ backgroundColor: driverObj?.teamColor || "#777777" }}
                                      />
                                      <span className="text-sm font-bold text-white flex items-center gap-1.5">
                                        {driverObj ? `${driverObj.givenName} ${driverObj.familyName}` : driverId}
                                        <span className="font-mono text-xs text-muted">({driverObj?.code})</span>
                                        {isFastestLap && (
                                          <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider flex items-center gap-0.5">
                                            <Zap className="h-2.5 w-2.5" />
                                            FL
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-muted">
                                    {driverObj?.constructorName || "TBD"}
                                  </td>
                                  {activeSession.key === "quali" ? (
                                    <>
                                      <td className="px-6 py-4 text-center text-xs font-mono text-muted">--</td>
                                      <td className="px-6 py-4 text-center text-xs font-mono text-muted">--</td>
                                      <td className="px-6 py-4 text-center text-xs font-mono text-muted">--</td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="px-6 py-4 text-center text-sm text-white font-mono">
                                        {activeSession.key === "sprint" ? "24" : "58"}
                                      </td>
                                      <td className="px-6 py-4 text-center text-xs">
                                        <span className="bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded text-green-400 font-bold uppercase tracking-wider">
                                          Finished
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-right font-mono text-sm font-black text-white">
                                        +{mockPoints + (isFastestLap && activeSession.key === "race" && position <= 10 ? 1 : 0)} PTS
                                      </td>
                                    </>
                                  )}
                                </tr>
                              );
                            })
                          ) : activeSession.key === "quali" ? (
                            /* RENDER QUALIFYING RESULTS */
                            qualiResults.map((result) => {
                              const driverObj = drivers.find(d => d.driverId === result.driverId);
                              return (
                                <tr key={result.driverId} className="hover:bg-surface/30 transition-all font-medium">
                                  <td className="px-6 py-4 text-center font-mono font-black text-sm text-white">
                                    {result.position}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div 
                                        className="w-1.5 h-6 rounded-sm shrink-0" 
                                        style={{ backgroundColor: driverObj?.teamColor || "#777777" }}
                                      />
                                      <span className="text-sm font-bold text-white">
                                        {result.driverName}
                                        {result.code && <span className="font-mono text-xs text-muted ml-1.5">({result.code})</span>}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-muted">
                                    {result.constructorName}
                                  </td>
                                  <td className="px-6 py-4 text-center text-xs font-mono text-white">
                                    {result.q1 || "--"}
                                  </td>
                                  <td className="px-6 py-4 text-center text-xs font-mono text-white">
                                    {result.q2 || "--"}
                                  </td>
                                  <td className="px-6 py-4 text-center text-xs font-mono text-white">
                                    {result.q3 || "--"}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            /* RENDER RACE / SPRINT RESULTS */
                            raceResults.map((result) => {
                              const driverObj = drivers.find(d => d.driverId === result.driverId);
                              const isWinner = result.position === 1;
                              const isFinished = result.status === "Finished" || result.status.startsWith("+");
                              
                              return (
                                <tr key={result.driverId} className="hover:bg-surface/30 transition-all font-medium">
                                  <td className="px-6 py-4 text-center font-mono font-black text-sm text-white">
                                    {result.position}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div 
                                        className="w-1.5 h-6 rounded-sm shrink-0" 
                                        style={{ backgroundColor: driverObj?.teamColor || "#777777" }}
                                      />
                                      <span className="text-sm font-bold text-white flex items-center gap-1.5">
                                        {result.driverName}
                                        {result.code && <span className="font-mono text-xs text-muted">({result.code})</span>}
                                        {result.fastestLap && activeSession.key === "race" && (
                                          <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider flex items-center gap-0.5">
                                            <Zap className="h-2.5 w-2.5" />
                                            FL
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-muted">
                                    {result.constructorName}
                                  </td>
                                  <td className="px-6 py-4 text-center text-sm text-white font-mono">
                                    {result.laps}
                                  </td>
                                  <td className="px-6 py-4 text-center text-xs">
                                    {isFinished ? (
                                      <span className="bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded text-green-400 font-bold uppercase tracking-wider">
                                        {result.status}
                                      </span>
                                    ) : (
                                      <span className="bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded text-red-400 font-bold uppercase tracking-wider" title={result.status}>
                                        DNF
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-right font-mono text-sm font-black text-white">
                                    +{result.points} PTS
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
