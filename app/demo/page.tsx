"use client";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { fastForward, resetDemo } from "@/lib/store";

/* All three surfaces live, side by side. They share one store, so a request
   spoken in the customer app appears instantly for the Real Estate Agent and on the dashboard. */
export default function Demo() {
  const frame = (src: string, w: number, h: number, label: string) => (
    <div className="flex flex-col items-center gap-2">
      <div className="text-[12px] font-semibold text-mute">{label}</div>
      <div className="rounded-[44px] border-[9px] border-ink bg-white overflow-hidden shadow-[0_24px_60px_rgba(80,20,30,.2)]" style={{ width: w + 18, height: h + 18 }}>
        <iframe src={src} width={w} height={h} className="block" title={label} />
      </div>
    </div>
  );
  return (
    <div className="min-h-screen bg-blush p-4 md:p-6">
      <div className="flex items-center gap-4 mb-5">
        <Link href="/"><Logo className="text-[18px]" /></Link>
        <span className="text-[13px] text-mute hidden md:inline">The Agentic Assistant suggests, a Real Estate Agent verifies.</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => { resetDemo(); location.reload(); }} className="h-9 px-4 rounded-full bg-white text-[13px] font-medium shadow-card">Reset</button>
          <button onClick={() => fastForward(50)} className="h-9 px-4 rounded-full bg-white text-[13px] font-medium shadow-card">Fast-forward 2 days</button>
        </div>
      </div>
      {/* Phones: the side-by-side view needs ~1,750px, so offer each app on its own instead. */}
      <div className="lg:hidden max-w-md mx-auto mt-6">
        <div className="rounded-3xl bg-white p-6 shadow-card">
          <div className="font-bold text-[20px]">Best viewed on a laptop</div>
          <p className="mt-2 text-[14px] text-mute">The live demo shows all three apps side by side, which needs a large screen. On this device, open each one on its own. They share the same data.</p>
          <div className="mt-5 space-y-2">
            {[["/app", "Homebuyers app"], ["/agent", "Real Estate Agent app"], ["/dashboard", "Brokerage dashboard"]].map(([href, t]) => (
              <Link key={href} href={href} className="flex items-center justify-between h-12 px-5 rounded-full bg-blush text-[15px] font-semibold">
                {t}<span aria-hidden>→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="hidden lg:flex gap-8 items-start justify-center flex-wrap">
        {frame("/app/", 375, 812, "Homebuyers")}
        {frame("/agent/", 375, 812, "Real Estate Agent")}
        <div className="flex flex-col items-center gap-2">
          <div className="text-[12px] font-semibold text-mute">Brokerage</div>
          <div className="rounded-2xl overflow-hidden shadow-[0_24px_60px_rgba(80,20,30,.2)] bg-white" style={{ width: 900, height: 830 }}>
            <iframe src="/dashboard/" width={1440} height={1328} style={{ transform: "scale(.625)", transformOrigin: "0 0" }} title="Dashboard" />
          </div>
        </div>
      </div>
    </div>
  );
}
