"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { fastForward, resetDemo } from "@/lib/store";

/* All three surfaces live, side by side. They share one store, so a request
   spoken in the customer app appears instantly for the Real Estate Agent and on the dashboard.

   Every screen is drawn at its natural size and scaled to fit the window:
   - laptop / desktop: all three in one row, sized to fit the screen height too
   - tablet: the two phones on one row, the dashboard below
   - phone: stacked, each as wide as the screen
   The iframes are positioned absolutely so changing layout never reloads them. */

const PHONE = { w: 375 + 18, h: 812 + 18 }; // iframe + 9px bezel each side
const DASH = { w: 900, h: 830 }; // 1440x1328 dashboard at .625
const GAP = 32; // natural gap between screens
const LABEL = 22; // label height above each screen (not scaled)
const ROW_GAP = 28; // vertical gap between rows (not scaled)

type Item = { key: string; label: string; w: number; h: number };
const ITEMS: Item[] = [
  { key: "app", label: "Homebuyers", ...PHONE },
  { key: "agent", label: "Real Estate Agent", ...PHONE },
  { key: "dash", label: "Brokerage", ...DASH },
];

type Box = { x: number; y: number; s: number };

function layout(cw: number, vh: number): { boxes: Record<string, Box>; height: number } {
  const rowW = (items: Item[]) => items.reduce((a, it) => a + it.w, 0) + GAP * (items.length - 1);
  const maxH = Math.max(320, vh - LABEL - 16); // keep each screen within the viewport height
  const [a, b, c] = ITEMS;

  // pick the layout with the fewest rows that still keeps things readable
  let rows: Item[][];
  if (Math.min(cw / rowW(ITEMS), maxH / DASH.h) >= 0.5) rows = [ITEMS];
  else if (cw / rowW([a, b]) >= 0.7) rows = [[a, b], [c]];
  else rows = [[a], [b], [c]];

  const boxes: Record<string, Box> = {};
  let y = 0;
  for (const row of rows) {
    const natH = Math.max(...row.map((it) => it.h));
    const s = Math.min(1, cw / rowW(row), maxH / natH);
    let x = (cw - rowW(row) * s) / 2;
    for (const it of row) {
      boxes[it.key] = { x, y, s };
      x += (it.w + GAP) * s;
    }
    y += LABEL + natH * s + ROW_GAP;
  }
  return { boxes, height: y - ROW_GAP };
}

export default function Demo() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ cw: number; vh: number } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      setSize({ cw: el.clientWidth, vh: window.innerHeight - top - 16 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const { boxes, height } = size ? layout(size.cw, size.vh) : { boxes: {} as Record<string, Box>, height: 0 };

  const screen = (it: Item, inner: ReactNode) => {
    const b = boxes[it.key] ?? { x: 0, y: 0, s: 1 };
    return (
      <div key={it.key} className="absolute" style={{ left: b.x, top: b.y, width: it.w * b.s }}>
        <div className="text-center text-[12px] font-semibold text-mute truncate" style={{ height: LABEL }}>{it.label}</div>
        <div style={{ width: it.w * b.s, height: it.h * b.s }}>
          <div style={{ width: it.w, height: it.h, transform: `scale(${b.s})`, transformOrigin: "0 0" }}>{inner}</div>
        </div>
      </div>
    );
  };

  const phone = (src: string, title: string) => (
    <div className="rounded-[44px] border-[9px] border-ink bg-white overflow-hidden shadow-[0_24px_60px_rgba(22,50,90,.2)]" style={{ width: PHONE.w, height: PHONE.h }}>
      <iframe src={src} width={375} height={812} className="block" title={title} />
    </div>
  );

  return (
    <div className="min-h-screen bg-blush p-4 md:p-6 overflow-x-hidden">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Link href="/"><Logo className="text-[18px]" /></Link>
        <span className="text-[13px] text-mute hidden md:inline">The Agentic Assistant suggests, a Real Estate Agent verifies.</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => { resetDemo(); location.reload(); }} className="h-9 px-4 rounded-full bg-white text-[13px] font-medium shadow-card">Reset</button>
          <button onClick={() => fastForward(50)} className="h-9 px-4 rounded-full bg-white text-[13px] font-medium shadow-card whitespace-nowrap">Fast-forward 2 days</button>
        </div>
      </div>
      <div ref={stageRef} className="relative w-full" style={{ height, opacity: size ? 1 : 0 }}>
        {screen(ITEMS[0], phone("/app/", "Homebuyers"))}
        {screen(ITEMS[1], phone("/agent/", "Real Estate Agent"))}
        {screen(ITEMS[2], (
          <div className="rounded-2xl overflow-hidden shadow-[0_24px_60px_rgba(22,50,90,.2)] bg-white" style={{ width: DASH.w, height: DASH.h }}>
            <iframe src="/dashboard/" width={1440} height={1328} style={{ transform: "scale(.625)", transformOrigin: "0 0" }} title="Dashboard" />
          </div>
        ))}
      </div>
    </div>
  );
}
