"use client";

import React, { useEffect, useState } from "react";
import { getLeaderboard } from "@/lib/predictions";
import { useAuth } from "@/context/AuthContext";
import { Trophy, Medal, Search, Flame, Award, ShieldCheck, Crown } from "lucide-react";

interface LeaderboardUser {
  userId: string;
  displayName: string;
  photoURL: string;
  totalPoints: number;
}

export default function Leaderboard() {
  const { user } = useAuth();
  const [board, setBoard] = useState<LeaderboardUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBoard() {
      try {
        const list = await getLeaderboard("2026");
        setBoard(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadBoard();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-neon-red"></div>
        <p className="font-display text-sm font-bold tracking-widest text-slate-400 uppercase">CALCULATING CHAMPIONSHIP STANDINGS...</p>
      </div>
    );
  }

  // Filter leaderboard based on search query
  const filteredBoard = board.filter((player) =>
    player.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-black text-white flex items-center gap-3">
            <Trophy className="h-8 w-8 text-podium-gold" />
            2026 Championship Standings
          </h1>
          <p className="text-slate-400 text-sm mt-1">Global player ranking and constructor standings leaderboard.</p>
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search racers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border focus:border-secondary pl-10 pr-4 py-2.5 rounded-xl text-xs font-semibold text-white outline-none placeholder-slate-500 shadow-sm"
          />
        </div>
      </div>

      {/* Top 3 Podiums visual representation */}
      {filteredBoard.length >= 3 && searchQuery === "" && (
        <section className="grid gap-6 md:grid-cols-3 items-end max-w-3xl mx-auto pt-4 pb-2">
          {/* P2 (Silver) */}
          <div className="order-2 md:order-1 flex flex-col items-center">
            <div className="relative group flex flex-col items-center">
              <img
                src={filteredBoard[1].photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${filteredBoard[1].displayName}`}
                alt="Silver Profile"
                className="h-20 w-20 rounded-full border-4 border-podium-silver bg-surface object-cover shadow-glass"
              />
              <Medal className="absolute -bottom-1 h-7 w-7 text-podium-silver drop-shadow-md" />
            </div>
            <div className="glass-panel text-center mt-3 p-5 rounded-2xl w-full border-t-2 border-t-podium-silver">
              <span className="font-display text-[10px] uppercase font-black text-podium-silver tracking-widest">P2 - SILVER</span>
              <h3 className="font-bold text-white truncate max-w-[150px] mx-auto mt-1 text-sm">{filteredBoard[1].displayName}</h3>
              <p className="text-secondary font-black text-xl font-mono mt-1">{filteredBoard[1].totalPoints} PTS</p>
            </div>
          </div>

          {/* P1 (Gold) */}
          <div className="order-1 md:order-2 flex flex-col items-center md:-translate-y-4">
            <div className="relative group flex flex-col items-center">
              <div className="absolute -top-7 text-podium-gold animate-bounce">
                <Crown className="h-7 w-7 fill-podium-gold" />
              </div>
              <img
                src={filteredBoard[0].photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${filteredBoard[0].displayName}`}
                alt="Gold Profile"
                className="h-24 w-24 rounded-full border-4 border-podium-gold bg-surface object-cover shadow-glass-gold scale-105"
              />
              <Medal className="absolute -bottom-1 h-8 w-8 text-podium-gold drop-shadow-md" />
            </div>
            <div className="glass-panel-gold text-center mt-3 p-6 rounded-2xl w-full border-t-4 border-t-podium-gold bg-gradient-to-b from-amber-950/20 via-surface to-surface">
              <span className="font-display text-[11px] uppercase font-black text-podium-gold tracking-widest">P1 - CHAMPION</span>
              <h3 className="font-extrabold text-white truncate max-w-[155px] mx-auto mt-1 text-base">{filteredBoard[0].displayName}</h3>
              <p className="text-primary font-black text-2xl font-mono mt-1">{filteredBoard[0].totalPoints} PTS</p>
            </div>
          </div>

          {/* P3 (Bronze) */}
          <div className="order-3 flex flex-col items-center">
            <div className="relative group flex flex-col items-center">
              <img
                src={filteredBoard[2].photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${filteredBoard[2].displayName}`}
                alt="Bronze Profile"
                className="h-20 w-20 rounded-full border-4 border-podium-bronze bg-surface object-cover shadow-glass"
              />
              <Medal className="absolute -bottom-1 h-7 w-7 text-podium-bronze drop-shadow-md" />
            </div>
            <div className="glass-panel text-center mt-3 p-5 rounded-2xl w-full border-t-2 border-t-podium-bronze">
              <span className="font-display text-[10px] uppercase font-black text-podium-bronze tracking-widest">P3 - BRONZE</span>
              <h3 className="font-bold text-white truncate max-w-[150px] mx-auto mt-1 text-sm">{filteredBoard[2].displayName}</h3>
              <p className="text-secondary font-black text-xl font-mono mt-1">{filteredBoard[2].totalPoints} PTS</p>
            </div>
          </div>
        </section>
      )}

      {/* Main Leaderboard Table */}
      <section className="glass-panel rounded-2xl overflow-hidden border border-border/80">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/90 text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-4 w-24 text-center">POS</th>
                <th className="px-6 py-4">RACER / PLAYER</th>
                <th className="px-6 py-4 text-right">TOTAL POINTS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredBoard.map((player, idx) => {
                const isCurrentUser = user && user.uid === player.userId;
                const position = idx + 1;
                
                let pClass = "leaderboard-row";
                if (position === 1) pClass += " leaderboard-row-p1";
                else if (position === 2) pClass += " leaderboard-row-p2";
                else if (position === 3) pClass += " leaderboard-row-p3";

                return (
                  <tr 
                    key={player.userId}
                    className={`${pClass} ${
                      isCurrentUser 
                        ? "bg-primary/10 hover:bg-primary/15 border-l-4 border-l-primary font-semibold" 
                        : "hover:bg-surface/40"
                    }`}
                  >
                    {/* Rank Position */}
                    <td className="px-6 py-4 text-center font-mono font-black text-sm">
                      {position === 1 && <span className="font-display text-podium-gold font-extrabold text-base">P1</span>}
                      {position === 2 && <span className="font-display text-podium-silver font-extrabold text-base">P2</span>}
                      {position === 3 && <span className="font-display text-podium-bronze font-extrabold text-base">P3</span>}
                      {position > 3 && <span className="text-slate-400">P{position.toString().padStart(2, "0")}</span>}
                    </td>
                    
                    {/* Player Info */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={player.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${player.displayName}`}
                          alt={player.displayName}
                          className="h-9 w-9 rounded-full border border-border/80 object-cover bg-surface shadow-sm"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white flex items-center gap-2 leading-tight">
                            {player.displayName}
                            {isCurrentUser && (
                              <span className="text-[9px] bg-primary/20 text-primary border border-primary/40 px-2 py-0.2 rounded font-mono font-bold uppercase tracking-wider">
                                YOU
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Total Points */}
                    <td className="px-6 py-4 text-right font-mono text-base font-black text-white">
                      {player.totalPoints} PTS
                    </td>
                  </tr>
                );
              })}

              {filteredBoard.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-xs font-mono font-semibold text-slate-400">
                    No racers found matching search query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

