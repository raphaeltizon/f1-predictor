"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getSeasonSchedule, Race } from "@/lib/f1Api";
import { useAuth } from "@/context/AuthContext";
import { Countdown } from "@/components/Countdown";
import { getSessionDate, isSessionLocked } from "@/lib/predictions";
import Link from "next/link";
import { CalendarDays, Flag, MapPin, Zap, ChevronRight, UserPlus, Trophy, Award, Lock, CheckCircle2, Flame, Gauge, ShieldCheck } from "lucide-react";

export default function Home() {
  const { user, login } = useAuth();
  const [schedule, setSchedule] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRound, setActiveRound] = useState<Race | null>(null);
  const [nextSession, setNextSession] = useState<{ name: string; date: Date } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getSeasonSchedule("2026");
        setSchedule(data);

        // Find the current or next race weekend
        const now = Date.now();
        const upcoming = data.find((r) => {
          const raceTime = getSessionDate(r.date, r.time).getTime();
          // Keep a round active until 2 hours after the race ends
          return raceTime + 7200000 > now;
        });

        const active = upcoming || data[data.length - 1] || null;
        setActiveRound(active);

        if (active) {
          determineNextSession(active);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const determineNextSession = useCallback((race: Race) => {
    const sessions: { name: string; dateStr: string; timeStr?: string }[] = [];
    
    if (race.SprintQualifying) sessions.push({ name: "Sprint Shootout", dateStr: race.SprintQualifying.date, timeStr: race.SprintQualifying.time });
    if (race.Sprint) sessions.push({ name: "Sprint Race", dateStr: race.Sprint.date, timeStr: race.Sprint.time });
    if (race.Qualifying) sessions.push({ name: "Grand Prix Qualifying", dateStr: race.Qualifying.date, timeStr: race.Qualifying.time });
    sessions.push({ name: "Grand Prix Race", dateStr: race.date, timeStr: race.time });

    const now = Date.now();
    const next = sessions.find((s) => {
      const time = getSessionDate(s.dateStr, s.timeStr).getTime();
      return time > now;
    });

    if (next) {
      setNextSession({
        name: next.name,
        date: getSessionDate(next.dateStr, next.timeStr),
      });
    } else {
      setNextSession(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-neon-red"></div>
        <p className="font-display text-sm font-bold tracking-widest text-slate-400 uppercase">CALIBRATING F1 TELEMETRY...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Hero Welcome Banner */}
      {!user && (
        <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-red-950/60 via-surface to-background p-8 md:p-12 shadow-glass-primary">
          <div className="absolute right-0 top-0 -z-10 h-full w-1/2 opacity-20 carbon-overlay" />
          <div className="max-w-2xl space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/20 border border-primary/40 px-3.5 py-1 text-xs font-mono font-bold text-primary tracking-wide">
              <Zap className="h-3.5 w-3.5 animate-pulse text-primary" />
              2026 F1 PREDICTION CHAMPIONSHIP
            </span>
            <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
              PROVE YOUR <span className="text-primary italic underline decoration-primary/40">RACING INTEL</span>
            </h1>
            <p className="text-slate-300 text-base leading-relaxed">
              Predict Qualifying grids, Sprint Races, and final Grand Prix finishing orders. Compete with motorsport fans worldwide and climb the global constructor & driver standings!
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <button
                onClick={login}
                className="f1-skew-btn flex items-center gap-2 bg-primary hover:bg-primary-hover px-6 py-3.5 font-display font-extrabold text-white text-sm uppercase tracking-wider shadow-neon-red"
              >
                <span>
                  <UserPlus className="h-4 w-4 inline mr-1" />
                  Join the Grid
                </span>
              </button>
              <Link
                href="/leaderboard"
                className="flex items-center gap-2 border border-border bg-surface/40 px-6 py-3.5 rounded-lg text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/10 hover:border-slate-500 transition-all"
              >
                View Championship Table
                <ChevronRight className="h-4 w-4 text-secondary" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Main Active Weekend Telemetry Command Center */}
      {activeRound && (
        <section className="grid gap-6 md:grid-cols-3">
          {/* Race Weekend Card */}
          <div className="md:col-span-2 glass-panel p-6 md:p-8 rounded-2xl flex flex-col justify-between relative overflow-hidden border border-border/80">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-black tracking-widest text-primary uppercase bg-primary/10 border border-primary/20 px-3 py-1 rounded">
                  ROUND {activeRound.round}
                </span>
                {activeRound.Sprint && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-sprint/15 border border-sprint/40 px-3 py-1 text-xs font-mono font-bold text-sprint shadow-sm">
                    <Zap className="h-3.5 w-3.5" />
                    SPRINT WEEKEND
                  </span>
                )}
              </div>
              <div>
                <h2 className="font-display text-3xl md:text-4xl font-extrabold text-white leading-tight tracking-wide">
                  {activeRound.raceName}
                </h2>
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300 mt-2.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <MapPin className="h-4 w-4 text-secondary" />
                    {activeRound.Circuit.Location.locality}, {activeRound.Circuit.Location.country}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    {new Date(activeRound.date).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              
              <div className="pt-3">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <span>CIRCUIT: {activeRound.Circuit.circuitName}</span>
                  <span className="text-secondary">TELEMETRY ONLINE</span>
                </div>
                <div className="w-full h-1.5 bg-surface border border-border rounded-full overflow-hidden">
                  <div className="h-full w-3/4 bg-gradient-to-r from-primary via-secondary to-sprint rounded-full shadow-neon-cyan" />
                </div>
              </div>
            </div>

            {/* Next session countdown */}
            {nextSession ? (
              <div className="mt-8 border-t border-border/80 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <Countdown targetDate={nextSession.date} sessionName={nextSession.name} />
                <Link
                  href="/predictions"
                  className="f1-skew-btn bg-secondary hover:bg-secondary-hover px-6 py-3 font-display font-extrabold text-black text-sm uppercase tracking-wider shadow-glass-secondary shrink-0"
                >
                  <span>Lock In Predictions</span>
                </Link>
              </div>
            ) : (
              <div className="mt-8 border-t border-border/80 pt-6 text-sm font-semibold text-slate-300 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-secondary" />
                <span>Predictions closed — Grand Prix session completed!</span>
              </div>
            )}
          </div>

          {/* Session Times List Card */}
          <div className="glass-panel p-6 rounded-2xl space-y-4 border border-border/80 flex flex-col justify-between">
            <div>
              <h3 className="font-display text-lg font-bold text-white flex items-center gap-2 border-b border-border/60 pb-3">
                <CalendarDays className="h-5 w-5 text-primary" />
                Session Schedule
              </h3>
              
              <div className="divide-y divide-border/50">
                {/* FP1 */}
                {activeRound.FirstPractice && (
                  <div className="py-3 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-200">Practice 1 (FP1)</span>
                      <span className="text-[11px] text-slate-400">
                        {getSessionDate(activeRound.FirstPractice.date, activeRound.FirstPractice.time).toLocaleDateString()}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-300">
                      {getSessionDate(activeRound.FirstPractice.date, activeRound.FirstPractice.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {/* Sprint Quali (if applicable) */}
                {activeRound.SprintQualifying && (
                  <div className="py-3 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-sprint">Sprint Shootout</span>
                      <span className="text-[11px] text-slate-400">
                        {getSessionDate(activeRound.SprintQualifying.date, activeRound.SprintQualifying.time).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-white">
                        {getSessionDate(activeRound.SprintQualifying.date, activeRound.SprintQualifying.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isSessionLocked(activeRound.SprintQualifying.date, activeRound.SprintQualifying.time) ? (
                        <Lock className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-secondary animate-ping" />
                      )}
                    </div>
                  </div>
                )}

                {/* Sprint Race (if applicable) */}
                {activeRound.Sprint && (
                  <div className="py-3 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-sprint">Sprint Race</span>
                      <span className="text-[11px] text-slate-400">
                        {getSessionDate(activeRound.Sprint.date, activeRound.Sprint.time).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-white">
                        {getSessionDate(activeRound.Sprint.date, activeRound.Sprint.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isSessionLocked(activeRound.Sprint.date, activeRound.Sprint.time) ? (
                        <Lock className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-secondary animate-ping" />
                      )}
                    </div>
                  </div>
                )}

                {/* GP Quali */}
                <div className="py-3 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-200">Qualifying Session</span>
                    <span className="text-[11px] text-slate-400">
                      {getSessionDate(activeRound.Qualifying.date, activeRound.Qualifying.time).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white">
                      {getSessionDate(activeRound.Qualifying.date, activeRound.Qualifying.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isSessionLocked(activeRound.Qualifying.date, activeRound.Qualifying.time) ? (
                      <Lock className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-secondary animate-ping" />
                    )}
                  </div>
                </div>

                {/* GP Race */}
                <div className="py-3 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-primary">Grand Prix Race</span>
                    <span className="text-[11px] text-slate-400">
                      {getSessionDate(activeRound.date, activeRound.time).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white">
                      {getSessionDate(activeRound.date, activeRound.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isSessionLocked(activeRound.date, activeRound.time) ? (
                      <Lock className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-secondary animate-ping" />
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="pt-3 border-t border-border/50 text-[11px] text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-secondary shrink-0" />
              <span>Session locks automatically at official start time.</span>
            </div>
          </div>
        </section>
      )}

      {/* Scoring Guide Section */}
      <section className="space-y-6">
        <div className="border-l-4 border-primary pl-4">
          <h2 className="font-display text-2xl font-black uppercase text-white tracking-wide">Prediction Scoring System</h2>
          <p className="text-slate-400 text-sm mt-0.5">Points awarded based on exact finish predictions and proximity metrics.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-panel p-5 rounded-xl space-y-2 border-t-2 border-t-primary hover:scale-[1.02] transition-transform">
            <div className="flex items-center justify-between text-white font-bold text-base">
              <span>Exact Match</span>
              <span className="font-mono text-2xl font-black text-primary">+10</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Predicting a driver in their exact finish position (e.g. predicting P1 and driver finishes P1).
            </p>
          </div>

          <div className="glass-panel p-5 rounded-xl space-y-2 border-t-2 border-t-secondary hover:scale-[1.02] transition-transform">
            <div className="flex items-center justify-between text-white font-bold text-base">
              <span>Proximity (+/- 1)</span>
              <span className="font-mono text-2xl font-black text-secondary">+5</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Predicting a driver who finishes 1 position away (e.g., predicting P3 and driver finishes P2 or P4).
            </p>
          </div>

          <div className="glass-panel p-5 rounded-xl space-y-2 border-t-2 border-t-accent hover:scale-[1.02] transition-transform">
            <div className="flex items-center justify-between text-white font-bold text-base">
              <span>Top 10 Presence</span>
              <span className="font-mono text-2xl font-black text-accent">+2</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Predicting a driver who finishes in the top 10, but more than 1 spot away from your prediction.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-xl space-y-2 border-t-2 border-t-sprint hover:scale-[1.02] transition-transform">
            <div className="flex items-center justify-between text-white font-bold text-base">
              <span>Fastest Lap</span>
              <span className="font-mono text-2xl font-black text-sprint">+5</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Correctly predicting which driver sets the official Fastest Lap during the Grand Prix Race.
            </p>
          </div>
        </div>
      </section>

      {/* Grid Season Schedule List */}
      <section className="space-y-6">
        <div className="border-l-4 border-secondary pl-4">
          <h2 className="font-display text-2xl font-black uppercase text-white tracking-wide">2026 Championship Calendar</h2>
          <p className="text-slate-400 text-sm mt-0.5">Full season race calendar synced with official Ergast / Jolpica F1 APIs.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schedule.map((race) => {
            const hasStarted = getSessionDate(race.date, race.time).getTime() < Date.now();
            return (
              <div 
                key={race.round} 
                className={`glass-panel p-5 rounded-xl flex items-center justify-between border transition-all ${
                  activeRound?.round === race.round ? "border-primary bg-primary/10 shadow-glass-primary" : "border-border/60 hover:border-slate-500"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      ROUND {race.round}
                    </span>
                    {race.Sprint && (
                      <span className="text-[9px] bg-sprint/20 text-sprint border border-sprint/40 px-1.5 py-0.2 rounded font-mono font-bold uppercase">
                        Sprint
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-white text-sm truncate max-w-[200px]">{race.raceName}</h3>
                  <span className="text-xs text-slate-400 block">
                    {new Date(race.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[11px] text-slate-300 font-mono font-semibold">
                    {race.Circuit.Location.locality}
                  </span>
                  {hasStarted ? (
                    <span className="text-[9px] bg-border px-2 py-0.5 rounded text-slate-400 font-mono font-bold tracking-wider uppercase">
                      Completed
                    </span>
                  ) : (
                    <span className="text-[9px] bg-primary/20 border border-primary/40 px-2 py-0.5 rounded text-primary font-mono font-bold tracking-wider uppercase shadow-neon-red">
                      Upcoming
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

