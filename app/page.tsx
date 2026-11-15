"use client";
import Link from "next/link";
import { Icon, Logo } from "@/components/ui";

const STATS = [
  {
    side: "The buyer",
    n: "56%",
    claim: "of buyers say the hardest part of buying a home is simply finding the right property.",
    src: "National Association of Realtors, 2025 Profile of Home Buyers and Sellers",
    href: "https://www.nar.realtor/news/economists-outlook/top-10-takeaways-from-nars-2025-profile-of-home-buyers-and-sellers",
  },
  {
    side: "The agent",
    n: "7×",
    claim: "more likely to qualify a lead when a firm replies within an hour. Yet the average first reply took 42 hours.",
    src: "Oldroyd, McElheran & Elkington, “The Short Life of Online Sales Leads”, Harvard Business Review, March 2011 (audit of 2,241 US firms)",
    href: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads",
  },
  {
    side: "The language gap",
    n: "1 in 5",
    claim: "people in the US (21.7%, age 5+) speak a language other than English at home. Most property tools act like they don’t exist.",
    src: "US Census Bureau, American Community Survey 5-year estimates, 2018–2022",
    href: "https://www.census.gov/newsroom/press-releases/2023/language-at-home-acs-5-year.html",
  },
];

export default function Hub() {
  const cards = [
    { href: "/app", t: "Homebuyers app", d: "Tap and talk to describe, or just upload a reference photo.", tag: "Home seekers" },
    { href: "/agent", t: "Real Estate Agent app", d: "Agentic Assistant recap, you verify and contact until the deal is closed.", tag: "Licensed Real Estate Agents" },
    { href: "/dashboard", t: "Brokerage dashboard", d: "See how data turns into useful information. Revenue, sales forecast, and strategies.", tag: "Brokerage owners · Web" },
  ];
  return (
    <div className="min-h-screen bg-blush">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
        <Logo className="text-[22px]" />
        <h1 className="mt-10 text-[44px] md:text-[56px] leading-[1.02] font-bold tracking-tight">Describe the house.<br />Find your home.</h1>
        <p className="mt-4 text-[18px] text-[#4A586D] max-w-xl">Pebble is a voice-first property concierge for brokerages, powered by an Agentic Assistant. <b className="text-ink">The Agentic Assistant suggests, a Real Estate Agent verifies.</b> We help brokerages close.</p>

        {/* The problem */}
        <details className="group mt-10 rounded-3xl bg-white shadow-card">
          <summary className="flex items-center justify-between gap-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden p-5 sm:p-6">
            <div>
              <div className="text-[12px] font-semibold text-coral uppercase tracking-wider">Why Pebble?</div>
              <div className="text-[17px] sm:text-[18px] font-bold">The problem, in 3 numbers</div>
            </div>
            <Icon name="chev" className="w-5 h-5 shrink-0 rotate-90 group-open:-rotate-90 transition" />
          </summary>
        <section className="px-5 sm:px-6 pb-6" aria-labelledby="problem">
          <h2 id="problem" className="text-[24px] md:text-[30px] leading-tight font-bold tracking-tight max-w-3xl">The buyer is lost in listings. The agent is losing the client.</h2>
          <p className="mt-3 text-[16px] text-[#4A586D] max-w-3xl">Someone moves to a new city and scrolls through hundreds of listings, still unsure which house is the one. On the other side, an agent watches that client hesitate, stop replying, and drift away. That isn’t bad luck. It’s revenue walking out the door.</p>
          <div className="mt-6 grid md:grid-cols-3 gap-4">
            {STATS.map((s) => (
              <figure key={s.n} className="rounded-3xl bg-blush p-6 flex flex-col">
                <div className="text-[12px] font-semibold text-mute">{s.side}</div>
                <div className="mt-1 text-[48px] leading-none font-bold tracking-tight text-coral tabular-nums">{s.n}</div>
                <p className="mt-3 text-[15px] leading-snug text-ink">{s.claim}</p>
                <figcaption className="mt-auto pt-4 text-[12px] leading-snug text-mute">
                  Source:{" "}
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="underline decoration-[#CDD6E3] underline-offset-2 hover:text-ink">{s.src}</a>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-5 text-[15px] text-[#4A586D] max-w-3xl"><b className="text-ink">Pebble’s answer:</b> listen → understand → verify → close. Clients just talk, in their own language. Licensed agents get the lead instantly with a recap, verify it, and follow up until the house becomes a home. Live today on CoStar listings in <b className="text-ink">Houston</b> and <b className="text-ink">Los Angeles</b>.</p>
        </section>
        </details>

        {/* The walkthrough */}
        <section className="mt-12" aria-labelledby="walkthrough">
          <div className="text-[12px] font-semibold text-coral uppercase tracking-wider">The walkthrough</div>
          <h2 id="walkthrough" className="mt-1 text-[28px] md:text-[34px] leading-tight font-bold tracking-tight">From “find me a house” to “welcome home”.</h2>
          <Link href="/demo" className="mt-6 flex items-center justify-between gap-4 rounded-3xl bg-navy text-white p-6">
            <div><div className="font-bold text-[18px]">Live demo — all three side by side</div><div className="text-white/70 text-[14px]">Search for a house, tap Interested!, and watch the lead reach the Real Estate Agent and the dashboard in real time, all the way to a closed deal.</div></div>
            <Icon name="chev" />
          </Link>
          <div className="mt-4 grid md:grid-cols-3 gap-4">
            {cards.map((c) => (
              <Link key={c.href} href={c.href} className="group rounded-3xl bg-white p-6 shadow-card hover:-translate-y-1 transition">
                <div className="text-[12px] font-semibold text-coral">{c.tag}</div>
                <div className="text-[20px] font-bold mt-0.5">{c.t}</div>
                <p className="text-[14px] text-mute mt-1">{c.d}</p>
                <div className="mt-4 text-[13px] font-semibold flex items-center gap-1">Open <Icon name="chev" className="w-4 h-4 group-hover:translate-x-1 transition" /></div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
