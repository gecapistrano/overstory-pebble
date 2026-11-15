"use client";
import type { ReactNode } from "react";
import Mascot, { type MascotState } from "@/components/Mascot";

const paths: Record<string, ReactNode> = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  send: <path d="M4 12l16-8-6 16-2-7-8-1z" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
  map: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  back: <path d="M15 18l-6-6 6-6" />,
  chev: <path d="M9 18l6-6-6-6" />,
  check: <path d="M5 12l5 5L20 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></>,
  spark: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />,
  phone: <path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  chat: <path d="M21 12a8 8 0 0 1-12 7l-5 1 1-4a8 8 0 1 1 16-4z" />,
  upload: <><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></>,
  cube: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>,
  pin: <><path d="M12 22s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  bed: <><path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-8v3" /><circle cx="7" cy="10.5" r="1.5" /></>,
  walk: <><circle cx="13" cy="4" r="2" /><path d="M10 21l2-6 3 3v3M8 12l3-4 4 2 2 3M11 8l-2 5" /></>,
  paw: <><circle cx="7" cy="9" r="2" /><circle cx="12" cy="6" r="2" /><circle cx="17" cy="9" r="2" /><path d="M8 17c0-3 2-5 4-5s4 2 4 5-2 3-4 3-4 0-4-3z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  edit: <path d="M4 20h4L20 8l-4-4L4 16v4z" />,
  speaker: <><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v11h14V9M10 13h4" /></>,
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="3" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
};

export function Icon({ name, className = "w-5 h-5", stroke = 2 }: { name: string; className?: string; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

/** On desktop, mobile surfaces render inside a phone frame; on a phone they go full-screen. */
export function PhoneShell({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[radial-gradient(900px_420px_at_50%_-10%,#F5F7FA,#DCE4EF)] md:py-8">
      <div className="phone relative w-full md:w-[390px] h-[100dvh] md:h-[844px] md:rounded-[54px] md:border-[10px] md:border-[#16325A] md:shadow-[0_30px_80px_rgba(22,50,90,.25)] overflow-hidden bg-canvas">
        <div className="hidden md:block absolute top-2 left-1/2 -translate-x-1/2 w-[110px] h-[30px] rounded-full bg-[#16325A] z-50" />
        <div className={`absolute inset-0 overflow-hidden ${dark ? "bg-ink" : "bg-canvas"}`}>{children}</div>
      </div>
    </div>
  );
}

export function Avatar({ initials, color, size = 36 }: { initials: string; color: string; size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center text-white font-semibold shrink-0" style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

/** Pebble wordmark: the mascot stone + product name, as on the teammate's navy top bar. */
export function Logo({ className = "", mood = "idle" }: { className?: string; mood?: MascotState }) {
  return (
    <div className={`flex items-center gap-2 font-semibold tracking-[0.01em] ${className}`}>
      <Mascot state={mood} sparkle={false} className="w-[1.6em] h-[1.6em]" />
      <span>Pebble</span>
    </div>
  );
}
