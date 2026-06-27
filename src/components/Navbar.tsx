"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Trophy, Calendar, ClipboardCheck, Settings, LogIn, LogOut, Menu, X, Award, AlertCircle } from "lucide-react";

export const Navbar: React.FC = () => {
  const { user, login, logout, isMock } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "Dashboard", href: "/", icon: Calendar },
    { name: "Predictions", href: "/predictions", icon: ClipboardCheck },
    { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
  ];

  // Show Admin panel if user is admin (Mock user has isAdmin: true, or Firebase can be configured)
  if (user && (user.isAdmin || user.email === "rgtizon0@gmail.com" || isMock)) {
    navLinks.push({ name: "Admin Panel", href: "/admin", icon: Settings });
  }

  const isActive = (path: string) => pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/80 backdrop-blur-md">
      {/* Mock Mode Alert Banner */}
      {isMock && (
        <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-yellow-600 px-4 py-1.5 text-center text-xs font-semibold text-white">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Running in Mock Mode. Connect Firebase in <code>.env.local</code> to persist data and enable real authentication.</span>
        </div>
      )}

      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand/Logo */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="bg-primary px-3 py-1 font-black text-white italic tracking-wider transform skew-x-12 group-hover:scale-105 transition-transform duration-200">
              F1
            </span>
            <span className="font-extrabold tracking-tight text-xl text-white group-hover:text-primary transition-colors duration-200">
              PREDICTOR
            </span>
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
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-250 ${active
                      ? "text-primary bg-primary/10 border-b-2 border-primary rounded-b-none"
                      : "text-muted hover:text-white hover:bg-white/5"
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  {link.name}
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
                <span className="text-sm font-semibold text-white">{user.displayName || "Racer"}</span>
                <span className="flex items-center gap-1 text-xs text-secondary justify-end font-medium">
                  <Award className="h-3.5 w-3.5" />
                  {user.totalPoints ?? 0} PTS
                </span>
              </div>
              <img
                src={user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.displayName}`}
                alt="Profile"
                className="h-9 w-9 rounded-full border border-border bg-surface object-cover"
              />
              <button
                onClick={logout}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-white hover:border-white/20 transition-all"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="f1-skew-btn flex items-center gap-2 bg-primary hover:bg-primary-hover px-5 py-2 text-sm font-bold text-white shadow-glass-primary"
            >
              <span>
                <LogIn className="h-4 w-4 inline mr-1" />
                Sign In
              </span>
            </button>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-2">
              <span className="bg-surface border border-border px-2.5 py-1 text-xs font-bold text-secondary flex items-center gap-1 rounded-md">
                <Award className="h-3 w-3" />
                {user.totalPoints ?? 0} PTS
              </span>
              <img
                src={user.photoURL || ""}
                alt="Profile"
                className="h-7 w-7 rounded-full border border-border bg-surface object-cover"
              />
            </div>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-muted hover:text-white p-1 rounded-lg focus:outline-none"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-surface px-4 py-3 space-y-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all ${active
                    ? "text-primary bg-primary/10 border-l-4 border-primary"
                    : "text-muted hover:text-white hover:bg-white/5"
                  }`}
              >
                <Icon className="h-5 w-5" />
                {link.name}
              </Link>
            );
          })}
          <div className="pt-4 border-t border-border/50 flex flex-col gap-2">
            {user ? (
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-semibold text-muted hover:text-white"
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
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-white"
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
