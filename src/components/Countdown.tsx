"use client";

import React, { useState, useEffect } from "react";
import { Clock, ShieldAlert } from "lucide-react";

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
      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400">
        <ShieldAlert className="h-4 w-4 text-red-500 animate-pulse" />
        <span>Predictions Locked for {sessionName}</span>
      </div>
    );
  }

  const timeBlocks = [
    { label: "D", value: timeLeft.days },
    { label: "H", value: timeLeft.hours },
    { label: "M", value: timeLeft.minutes },
    { label: "S", value: timeLeft.seconds },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
        <Clock className="h-3.5 w-3.5 text-secondary" />
        Time to lock {sessionName}
      </span>
      <div className="flex gap-2">
        {timeBlocks.map((block, idx) => (
          <div key={idx} className="flex items-center">
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 min-w-[50px] shadow-md">
              <span className="font-mono text-lg font-black text-white leading-none">
                {block.value.toString().padStart(2, "0")}
              </span>
              <span className="text-[10px] font-bold text-muted mt-1 leading-none">{block.label}</span>
            </div>
            {idx < timeBlocks.length - 1 && (
              <span className="mx-1 font-mono text-xl font-bold text-muted/30">:</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
