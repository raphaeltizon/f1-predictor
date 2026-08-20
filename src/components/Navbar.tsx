"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Trophy, Calendar, ClipboardCheck, Settings, LogIn, LogOut, Menu, X, Award, AlertCircle, Radio } from "lucide-react";

export const Navbar: React.FC = () => {
  const { user, login, logout } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = useMemo(() => {
    const links = [
      { name: "Dashboard", href: "/", icon: Calendar },
      { name: "Predictions", href: "/predictions", icon: ClipboardCheck },
      { name: "Results", href: "/results", icon: Award },
      { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
    ];

    if (user && (user.isAdmin || user.email === "rgtizon0@gmail.com")) {
      links.push({ name: "Admin Panel", href: "/admin", icon: Settings });
    }

    return links;
  }, [user]);

  const isActive = (path: string) => pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand/Logo */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="font-display bg-primary px-3 py-1 font-black text-white italic tracking-wider rounded-sm -skew-x-12 group-hover:scale-105 group-hover:bg-primary-hover transition-all duration-200 shadow-neon-red">
              F1
            </span>
            <div className="flex flex-col leading-none">
              <span className="font-display font-extrabold tracking-wider text-lg text-white group-hover:text-primary transition-colors duration-200">
                PREDICTOR
              </span>
              <span className="text-[9px] font-mono tracking-widest text-slate-400 uppercase flex items-center gap-1">
                <Radio className="h-2.5 w-2.5 text-secondary animate-pulse" />
                TELEMETRY 2026
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 ${
                    active
                      ? "text-white bg-primary/10 border-b-2 border-primary"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-slate-400"}`} />
                  <span>{link.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Info / Actions */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <div className="flex flex-col text-right">
                <span className="text-xs font-bold text-slate-200">{user.displayName || "Racer"}</span>
                <span className="flex items-center gap-1 text-xs font-mono font-bold text-secondary justify-end">
                  <Award className="h-3.5 w-3.5 text-podium-gold" />
                  {user.totalPoints ?? 0} PTS
                </span>
              </div>
              <img
                src={user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.displayName}`}
                alt="Profile"
                className="h-9 w-9 rounded-full border-2 border-secondary/40 bg-surface object-cover shadow-glass"
              />
              <button
                onClick={logout}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:border-slate-500 transition-all"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="f1-skew-btn flex items-center gap-2 bg-primary hover:bg-primary-hover px-5 py-2 text-xs font-display font-bold uppercase tracking-wider text-white shadow-glass-primary"
            >
              <span>
                <LogIn className="h-4 w-4 inline mr-1" />
                Sign In Grid
              </span>
            </button>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2">
              <span className="bg-surface border border-border px-2.5 py-1 text-xs font-mono font-bold text-secondary flex items-center gap-1 rounded-md">
                <Award className="h-3 w-3 text-podium-gold" />
                {user.totalPoints ?? 0} PTS
              </span>
            </div>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-slate-400 hover:text-white p-2 rounded-lg bg-surface border border-border"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-surface/95 backdrop-blur-xl px-4 py-4 space-y-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                  active
                    ? "text-white bg-primary/20 border-l-4 border-primary"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-slate-400"}`} />
                {link.name}
              </Link>
            );
          })}
          <div className="pt-4 border-t border-border/60 flex flex-col gap-2">
            {user ? (
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-semibold text-slate-300 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            ) : (
              <button
                onClick={() => {
                  login();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-xs font-display uppercase tracking-wider font-bold text-white shadow-neon-red"
              >
                <LogIn className="h-4 w-4" />
                Sign In with Google
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

