"use client";
import Link from "next/link";
import { Icon, Logo } from "@/components/ui";

export default function Hub() {
  const cards = [
    { href: "/app", t: "Homebuyers app", d: "Tap and talk to describe, or just upload a reference photo.", tag: "Home seekers" },
    { href: "/agent", t: "Real Estate Agent app", d: "Agentic Assistant recap, you verify and contact until the deal is closed.", tag: "Licensed Real Estate Agents" },
    { href: "/dashboard", t: "Brokerage dashboard", d: "See how data turns into useful information. Revenue, sales forecast, and strategies.", tag: "Brokerage owners" },
  ];
  return (
    <div className="min-h-screen bg-blush">
      <div className="max-w-5xl mx-auto px-6 py-14">
        <Logo className="text-[22px]" />
        <h1 className="mt-10 text-[44px] md:text-[56px] leading-[1.02] font-bold tracking-tight">Say the house.<br />Find your home.</h1>
        <p className="mt-4 text-[18px] text-[#5b5357] max-w-xl">Pebble is a voice-first property concierge for brokerages, powered by an Agentic Assistant. <b className="text-ink">The Agentic Assistant suggests, a Real Estate Agent verifies.</b> We help brokerages close.</p>
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="group rounded-3xl bg-white p-6 shadow-card hover:-translate-y-1 transition">
              <div className="text-[12px] font-semibold text-coral">{c.tag}</div>
              <div className="text-[20px] font-bold mt-0.5">{c.t}</div>
              <p className="text-[14px] text-mute mt-1">{c.d}</p>
              <div className="mt-4 text-[13px] font-semibold flex items-center gap-1">Open <Icon name="chev" className="w-4 h-4 group-hover:translate-x-1 transition" /></div>
            </Link>
          ))}
        </div>
        <Link href="/demo" className="mt-4 flex items-center justify-between rounded-3xl bg-ink text-white p-6">
          <div><div className="font-bold text-[18px]">Live demo — all three side by side</div><div className="text-white/70 text-[14px]">Watch a lead flow from the customer to the Real Estate Agent to the dashboard in real time.</div></div>
          <Icon name="chev" />
        </Link>
      </div>
    </div>
  );
}
