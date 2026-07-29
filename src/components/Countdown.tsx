"use client";

import React, { useState, useEffect } from "react";
import { Clock, ShieldAlert, Timer } from "lucide-react";

interface CountdownProps {
  targetDate: Date;
  sessionName: string;
  onExpire?: () => void;
}

export const Countdown: React.FC<CountdownProps> = ({ targetDate, sessionName, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = targetDate.getTime() - Date.now();
      
      if (difference <= 0) {
        setTimeLeft(prev => {
          if (!prev.isExpired && onExpire) {
            onExpire();
          }
          return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
        });
        return;
      }

      setTimeLeft({
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
        isExpired: false,
      });
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [targetDate, onExpire]);

  if (timeLeft.isExpired) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs font-mono font-bold text-red-400">
        <ShieldAlert className="h-4 w-4 text-primary animate-pulse" />
        <span>LOCKDOWN: {sessionName.toUpperCase()} LOCKED</span>
      </div>
    );
  }

  const timeBlocks = [
    { label: "DAYS", value: timeLeft.days },
    { label: "HRS", value: timeLeft.hours },
    { label: "MIN", value: timeLeft.minutes },
    { label: "SEC", value: timeLeft.seconds },
  ];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
        <Timer className="h-4 w-4 text-secondary animate-spin" style={{ animationDuration: '4s' }} />
        TIME TO LOCK {sessionName.toUpperCase()}
      </span>
      <div className="flex gap-2 items-center">
        {timeBlocks.map((block, idx) => (
          <div key={idx} className="flex items-center">
            <div className="flex flex-col items-center justify-center rounded-lg border border-secondary/30 bg-surface/90 px-3 py-2 min-w-[54px] shadow-glass-secondary">
              <span className="font-mono text-xl font-black text-white leading-none tracking-wider">
                {block.value.toString().padStart(2, "0")}
              </span>
              <span className="text-[9px] font-mono font-bold text-secondary mt-1 leading-none tracking-widest">{block.label}</span>
            </div>
            {idx < timeBlocks.length - 1 && (
              <span className="mx-1 font-mono text-lg font-black text-slate-500">:</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

