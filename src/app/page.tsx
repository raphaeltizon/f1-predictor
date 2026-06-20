"use client";

import React, { useEffect, useState } from "react";
import { getSeasonSchedule, Race } from "@/lib/f1Api";
import { useAuth } from "@/context/AuthContext";
import { Countdown } from "@/components/Countdown";
import { getSessionDate, isSessionLocked } from "@/lib/predictions";
import Link from "next/link";
import { CalendarDays, Flag, MapPin, Zap, ChevronRight, UserPlus, Trophy, Award, Lock, CheckCircle2 } from "lucide-react";

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
        // Find the first race where GP date/time is in the future, or close to current time
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

  const determineNextSession = (race: Race) => {
    const sessions: { name: string; dateStr: string; timeStr?: string }[] = [];
    
    // Add all sessions to list
    if (race.SprintQualifying) sessions.push({ name: "Sprint Qualifying", dateStr: race.SprintQualifying.date, timeStr: race.SprintQualifying.time });
    if (race.Sprint) sessions.push({ name: "Sprint Race", dateStr: race.Sprint.date, timeStr: race.Sprint.time });
    if (race.Qualifying) sessions.push({ name: "Grand Prix Qualifying", dateStr: race.Qualifying.date, timeStr: race.Qualifying.time });
    sessions.push({ name: "Grand Prix Race", dateStr: race.date, timeStr: race.time });

    // Find the first session that has NOT started yet
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
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm font-semibold text-muted">Loading Formula 1 Calendar...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Hero Welcome Banner */}
      {!user && (
        <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-red-950/40 via-background to-surface p-8 md:p-12 shadow-glass-primary">
          <div className="absolute right-0 top-0 -z-10 h-full w-1/3 opacity-15 carbon-overlay" />
          <div className="max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/30 px-3 py-1 text-xs font-semibold text-primary">
              <Zap className="h-3 w-3 animate-pulse" />
              Championship Predictions Season 2026
            </span>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
              PROVE YOUR <span className="text-primary italic">F1 KNOWLEDGE</span>
            </h1>
            <p className="text-muted text-base">
              Predict Qualifying grids, Sprint Races, and final Grand Prix finishing orders. Compete with players worldwide and climb to the top of the constructors and drivers standings!
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <button
                onClick={login}
                className="f1-skew-btn flex items-center gap-2 bg-primary hover:bg-primary-hover px-6 py-3 font-bold text-white text-sm shadow-glass-primary"
              >
                <span>
                  <UserPlus className="h-4 w-4 inline mr-1" />
                  Join the Grid Now
                </span>
              </button>
              <Link
                href="/leaderboard"
                className="flex items-center gap-1.5 border border-border px-6 py-3 rounded-lg text-sm font-semibold text-muted hover:text-white hover:bg-white/5 transition-all"
              >
                View Standings
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Main Active Weekend Widget */}
      {activeRound && (
        <section className="grid gap-6 md:grid-cols-3">
          {/* Race Weekend Card */}
          <div className="md:col-span-2 glass-panel p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-primary">
                  ROUND {activeRound.round}
                </span>
                {activeRound.Sprint && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-sprint/10 border border-sprint/30 px-2.5 py-0.5 text-xs font-bold text-sprint">
                    <Zap className="h-3 w-3" />
                    SPRINT WEEKEND
                  </span>
                )}
              </div>
              <div>
                <h2 className="text-3xl font-extrabold text-white leading-tight">
                  {activeRound.raceName}
                </h2>
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted mt-2">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-secondary" />
                    {activeRound.Circuit.Location.locality}, {activeRound.Circuit.Location.country}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    {new Date(activeRound.date).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              
              <div className="pt-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">Track: {activeRound.Circuit.circuitName}</p>
                <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                  <div className="h-full w-2/3 bg-gradient-to-r from-primary to-secondary rounded-full" />
                </div>
              </div>
            </div>

            {/* Next session countdown */}
            {nextSession ? (
              <div className="mt-8 border-t border-border/60 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <Countdown targetDate={nextSession.date} sessionName={nextSession.name} />
                <Link
                  href="/predictions"
                  className="f1-skew-btn bg-secondary hover:bg-secondary-hover px-5 py-2.5 font-bold text-black text-sm shadow-glass-secondary shrink-0"
                >
                  <span>Predict Now</span>
                </Link>
              </div>
            ) : (
              <div className="mt-8 border-t border-border/60 pt-6 text-sm font-semibold text-muted flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-secondary" />
                <span>Predictions are fully closed. Race weekend is underway/completed!</span>
              </div>
            )}
          </div>

          {/* Session Times List Card */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Session Schedule
            </h3>
            
            <div className="divide-y divide-border/60">
              {/* FP1 */}
              {activeRound.FirstPractice && (
                <div className="py-2.5 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-white">First Practice (FP1)</span>
                    <span className="text-xs text-muted">
                      {getSessionDate(activeRound.FirstPractice.date, activeRound.FirstPractice.time).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="text-xs font-bold font-mono text-muted">
                    {getSessionDate(activeRound.FirstPractice.date, activeRound.FirstPractice.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              {/* Sprint Quali (if applicable) */}
              {activeRound.SprintQualifying && (
                <div className="py-2.5 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-sprint">Sprint Shootout</span>
                    <span className="text-xs text-muted">
                      {getSessionDate(activeRound.SprintQualifying.date, activeRound.SprintQualifying.time).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-white">
                      {getSessionDate(activeRound.SprintQualifying.date, activeRound.SprintQualifying.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isSessionLocked(activeRound.SprintQualifying.date, activeRound.SprintQualifying.time) ? (
                      <Lock className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full bg-secondary animate-ping" />
                    )}
                  </div>
                </div>
              )}

              {/* Sprint Race (if applicable) */}
              {activeRound.Sprint && (
                <div className="py-2.5 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-sprint">Sprint Race</span>
                    <span className="text-xs text-muted">
                      {getSessionDate(activeRound.Sprint.date, activeRound.Sprint.time).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-white">
                      {getSessionDate(activeRound.Sprint.date, activeRound.Sprint.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isSessionLocked(activeRound.Sprint.date, activeRound.Sprint.time) ? (
                      <Lock className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full bg-secondary animate-ping" />
                    )}
                  </div>
                </div>
              )}

              {/* GP Quali */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white">Qualifying Session</span>
                  <span className="text-xs text-muted">
                    {getSessionDate(activeRound.Qualifying.date, activeRound.Qualifying.time).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono text-white">
                    {getSessionDate(activeRound.Qualifying.date, activeRound.Qualifying.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isSessionLocked(activeRound.Qualifying.date, activeRound.Qualifying.time) ? (
                    <Lock className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-secondary animate-ping" />
                  )}
                </div>
              </div>

              {/* GP Race */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-primary">Grand Prix Race</span>
                  <span className="text-xs text-muted">
                    {getSessionDate(activeRound.date, activeRound.time).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono text-white">
                    {getSessionDate(activeRound.date, activeRound.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isSessionLocked(activeRound.date, activeRound.time) ? (
                    <Lock className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-secondary animate-ping" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Instructions / How it works section */}
      <section className="space-y-6">
        <div className="border-l-4 border-primary pl-4">
          <h2 className="text-2xl font-black uppercase text-white tracking-tight">How Predictions Scoring Works</h2>
          <p className="text-muted text-sm mt-1">Get rewarded for exact rankings and proximity points.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-panel p-5 rounded-xl space-y-2 border-t-2 border-t-primary">
            <div className="flex items-center justify-between text-white font-extrabold text-lg">
              <span>Exact Match</span>
              <span className="text-primary font-mono text-2xl font-black">+10</span>
            </div>
            <p className="text-muted text-xs leading-relaxed">
              Predicting a driver in their exact finish position (e.g. predicting P1 and the driver finishes P1).
            </p>
          </div>

          <div className="glass-panel p-5 rounded-xl space-y-2 border-t-2 border-t-secondary">
            <div className="flex items-center justify-between text-white font-extrabold text-lg">
              <span>Proximity (Off by 1)</span>
              <span className="text-secondary font-mono text-2xl font-black">+5</span>
            </div>
            <p className="text-muted text-xs leading-relaxed">
              Predicting a driver who finishes exactly one spot away (e.g., predicting P3 and the driver finishes P2 or P4).
            </p>
          </div>

          <div className="glass-panel p-5 rounded-xl space-y-2 border-t-2 border-t-accent">
            <div className="flex items-center justify-between text-white font-extrabold text-lg">
              <span>Top 10 Presence</span>
              <span className="text-accent font-mono text-2xl font-black">+2</span>
            </div>
            <p className="text-muted text-xs leading-relaxed">
              Predicting a driver who finishes in the top 10, but further than 1 position away from your prediction.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-xl space-y-2 border-t-2 border-t-sprint">
            <div className="flex items-center justify-between text-white font-extrabold text-lg">
              <span>Fastest Lap Match</span>
              <span className="text-sprint font-mono text-2xl font-black">+5</span>
            </div>
            <p className="text-muted text-xs leading-relaxed">
              Correctly predicting which driver sets the official Fastest Lap during the Grand Prix Race.
            </p>
          </div>
        </div>
      </section>

      {/* Grid Season Schedule List */}
      <section className="space-y-6">
        <div className="border-l-4 border-secondary pl-4">
          <h2 className="text-2xl font-black uppercase text-white tracking-tight">2026 Season Schedule</h2>
          <p className="text-muted text-sm mt-1">Full season calendar automatically updated from official sources.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schedule.map((race) => {
            const hasStarted = getSessionDate(race.date, race.time).getTime() < Date.now();
            return (
              <div 
                key={race.round} 
                className={`glass-panel p-5 rounded-xl flex items-center justify-between border ${
                  activeRound?.round === race.round ? "border-primary bg-primary/5" : "border-border/60"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-widest">
                      ROUND {race.round}
                    </span>
                    {race.Sprint && (
                      <span className="text-[8px] bg-sprint/10 text-sprint border border-sprint/20 px-1 py-0.2 rounded font-bold uppercase">
                        Sprint
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-white truncate max-w-[200px]">{race.raceName}</h3>
                  <span className="text-xs text-muted block">
                    {new Date(race.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[10px] text-muted font-bold font-mono">
                    {race.Circuit.Location.locality}
                  </span>
                  {hasStarted ? (
                    <span className="text-[9px] bg-border px-2 py-0.5 rounded text-muted font-bold tracking-wider uppercase">
                      Completed
                    </span>
                  ) : (
                    <span className="text-[9px] bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-primary font-bold tracking-wider uppercase animate-pulse-glow">
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
