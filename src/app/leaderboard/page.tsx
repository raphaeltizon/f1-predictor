"use client";

import React, { useEffect, useState } from "react";
import { getLeaderboard } from "@/lib/predictions";
import { useAuth } from "@/context/AuthContext";
import { Trophy, Medal, Search, Flame, Award } from "lucide-react";

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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm font-semibold text-muted">Loading Championship Standings...</p>
      </div>
    );
  }

  // Filter leaderboard based on search query
  const filteredBoard = board.filter((player) =>
    player.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-2">
            Championship Standings
          </h1>
          <p className="text-muted text-sm mt-1">Live scoreboard of the global prediction competition.</p>
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search players..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border focus:border-secondary pl-10 pr-4 py-2 rounded-lg text-sm text-white outline-none placeholder-muted"
          />
        </div>
      </div>

      {/* Top 3 Podiums visual representation */}
      {filteredBoard.length >= 3 && searchQuery === "" && (
        <section className="grid gap-6 md:grid-cols-3 items-end max-w-3xl mx-auto pt-6 pb-2">
          {/* P2 (Silver) */}
          <div className="order-2 md:order-1 flex flex-col items-center">
            <div className="relative group flex flex-col items-center">
              <img
                src={filteredBoard[1].photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${filteredBoard[1].displayName}`}
                alt="Silver Profile"
                className="h-20 w-20 rounded-full border-4 border-[#c0c0c0] bg-surface object-cover shadow-glass"
              />
              <Medal className="absolute -bottom-1 h-7 w-7 text-[#c0c0c0] drop-shadow-md" />
            </div>
            <div className="glass-panel text-center mt-3 p-4 rounded-xl w-full border-t-2 border-t-[#c0c0c0]">
              <span className="text-[10px] uppercase font-bold text-muted font-mono">P2 - Silver</span>
              <h3 className="font-bold text-white truncate max-w-[150px] mx-auto mt-0.5">{filteredBoard[1].displayName}</h3>
              <p className="text-secondary font-black text-lg font-mono mt-1">{filteredBoard[1].totalPoints} PTS</p>
            </div>
          </div>

          {/* P1 (Gold) */}
          <div className="order-1 md:order-2 flex flex-col items-center md:-translate-y-4">
            <div className="relative group flex flex-col items-center">
              <div className="absolute -top-6 text-yellow-400 animate-bounce">
                <Trophy className="h-6 w-6" />
              </div>
              <img
                src={filteredBoard[0].photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${filteredBoard[0].displayName}`}
                alt="Gold Profile"
                className="h-24 w-24 rounded-full border-4 border-[#ffd700] bg-surface object-cover shadow-glass-secondary scale-105"
              />
              <Medal className="absolute -bottom-1 h-8 w-8 text-[#ffd700] drop-shadow-md" />
            </div>
            <div className="glass-panel text-center mt-3 p-5 rounded-xl w-full border-t-4 border-t-[#ffd700] bg-gradient-to-b from-yellow-950/15 via-surface to-surface">
              <span className="text-[10px] uppercase font-bold text-yellow-400 font-mono tracking-wider">P1 - Champion</span>
              <h3 className="font-extrabold text-white truncate max-w-[155px] mx-auto mt-0.5">{filteredBoard[0].displayName}</h3>
              <p className="text-primary font-black text-2xl font-mono mt-1">{filteredBoard[0].totalPoints} PTS</p>
            </div>
          </div>

          {/* P3 (Bronze) */}
          <div className="order-3 flex flex-col items-center">
            <div className="relative group flex flex-col items-center">
              <img
                src={filteredBoard[2].photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${filteredBoard[2].displayName}`}
                alt="Bronze Profile"
                className="h-20 w-20 rounded-full border-4 border-[#cd7f32] bg-surface object-cover shadow-glass"
              />
              <Medal className="absolute -bottom-1 h-7 w-7 text-[#cd7f32] drop-shadow-md" />
            </div>
            <div className="glass-panel text-center mt-3 p-4 rounded-xl w-full border-t-2 border-t-[#cd7f32]">
              <span className="text-[10px] uppercase font-bold text-muted font-mono">P3 - Bronze</span>
              <h3 className="font-bold text-white truncate max-w-[150px] mx-auto mt-0.5">{filteredBoard[2].displayName}</h3>
              <p className="text-secondary font-black text-lg font-mono mt-1">{filteredBoard[2].totalPoints} PTS</p>
            </div>
          </div>
        </section>
      )}

      {/* Main Leaderboard Table */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/80 text-xs font-bold uppercase tracking-wider text-muted font-mono">
                <th className="px-6 py-4 w-20 text-center">Pos</th>
                <th className="px-6 py-4">Player</th>
                <th className="px-6 py-4 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
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
                        ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary font-semibold" 
                        : "hover:bg-surface/30"
                    }`}
                  >
                    {/* Rank Position */}
                    <td className="px-6 py-4 text-center font-mono font-black text-sm">
                      {position === 1 && <span className="text-[#ffd700]">1</span>}
                      {position === 2 && <span className="text-[#c0c0c0]">2</span>}
                      {position === 3 && <span className="text-[#cd7f32]">3</span>}
                      {position > 3 && <span className="text-muted">{position}</span>}
                    </td>
                    
                    {/* Player Info */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={player.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${player.displayName}`}
                          alt={player.displayName}
                          className="h-8 w-8 rounded-full border border-border object-cover bg-surface"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm text-white flex items-center gap-1.5 leading-tight">
                            {player.displayName}
                            {isCurrentUser && (
                              <span className="text-[9px] bg-primary/20 text-primary border border-primary/20 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">
                                YOU
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Total Points */}
                    <td className="px-6 py-4 text-right font-mono text-sm font-black text-white">
                      {player.totalPoints} PTS
                    </td>
                  </tr>
                );
              })}

              {filteredBoard.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-sm font-semibold text-muted">
                    No players found matching your search.
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
