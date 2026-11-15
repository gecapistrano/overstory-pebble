"use client";
// The OverStory "broker desk" chrome for the homebuyer app on wider screens: the same navy top bar
// (Pebble + name + tagline), with the map filling the page and the app in a frosted panel (see CustomerApp).
// Phones keep the full-screen app.
import { useEffect, useState } from "react";
import Mascot from "@/components/Mascot";

const DESK = "(min-width: 768px)";

export function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(DESK).matches);
  useEffect(() => {
    const m = window.matchMedia(DESK);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export function DeskBar({ onLogo, account, onAccount }: { onLogo: () => void; account: { initials: string; name: string } | null; onAccount: () => void }) {
  return (
    <header className="relative z-20 flex h-[52px] shrink-0 items-stretch gap-6 bg-navy-900 px-5 text-white shadow-[0_4px_18px_-6px_rgba(22,50,90,0.45)]">
      <button className="flex items-center gap-2 rounded-md hover:opacity-90" onClick={onLogo} aria-label="Pebble: start a new search">
        <Mascot className="h-8 w-8" sparkle={false} />
        <span className="text-[17px] font-semibold tracking-[0.01em]">Pebble</span>
        <span className="hidden border-l border-white/20 pl-2.5 text-[12px] text-white/60 lg:inline">find the home you&apos;re picturing</span>
      </button>
      <div className="flex-1" />
      <button className="my-auto flex items-center gap-2 rounded-md bg-navy-700 px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-navy-500" onClick={onAccount}>
        {account ? (
          <>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[10px]">{account.initials}</span>
            {account.name.split(" ")[0] || "Profile"}
          </>
        ) : (
          "Log in"
        )}
      </button>
    </header>
  );
}
