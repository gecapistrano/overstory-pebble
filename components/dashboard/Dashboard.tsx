"use client";
/**
 * Brokerage dashboard, in three separate parts:
 *   Sales     - revenue, deals, first-reply time, follow-up saves, revenue + forecast, agents, the broker's-assistant
 *               strategies and the live activity feed
 *   Customers - what shoppers search for, where they look, who they are, the most likely buyers/renters, and a
 *               per-property view for owners
 *   Market    - CoStar market data and the Gemini market recap (both collapsible)
 * App activity updates arrive through the shared browser store; the clock refreshes every 5 seconds.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aiStrategy } from "@/lib/ai";
import { CITIES, change, factsOf, fmtDur, fmtMoney, snapshot, type Fact, type PropertyStats, type Shopper, type Snapshot } from "@/lib/brokerage";
import { localStrategies, type Strategy } from "@/lib/strategy";
import { getState, now, update, useStore } from "@/lib/store";
import { Avatar, Icon, Logo } from "@/components/ui";
import { CostarMarket, MarketRecap } from "@/components/dashboard/MarketIntel";

const TICK = 5000;
const ago = (t: number, at: number) => {
  const s = Math.max(0, Math.round((at - t) / 1000));
  return s < 10 ? "just now" : s < 60 ? `${s} sec ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} hr ago` : `${Math.round(s / 86400)} d ago`;
};

export default function Dashboard() {
  const [city, setCity] = useState<string>(CITIES[0]);
  const [beat, setBeat] = useState(0);
  const leads = useStore((s) => s.leads);
  const views = useStore((s) => s.views?.length || 0);
  const searches = useStore((s) => s.searches?.length || 0);
  const approved = useStore((s) => s.approvedStrategies);
  const dismissed = useStore((s) => s.dismissedStrategies);

  // Keep the displayed clock and relative activity times current.
  useEffect(() => {
    const id = window.setInterval(() => setBeat((b) => b + 1), TICK);
    return () => window.clearInterval(id);
  }, []);
  const snap = useMemo(() => snapshot(getState(), city, now()), [city, beat, leads, views, searches]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* navy top bar, as in the OverStory broker-desk design */}
      <div className="sticky top-0 z-20 bg-navy text-white shadow-[0_4px_18px_-6px_rgba(22,50,90,0.45)]">
        <div className="mx-auto max-w-[1400px] h-[58px] px-4 md:px-8 flex items-stretch gap-4 md:gap-6">
          <Link href="/" className="flex items-center hover:opacity-90" aria-label="Pebble home"><Logo className="text-[17px]" /></Link>
          <nav className="flex items-stretch" role="group" aria-label="City">
            {CITIES.map((c) => (
              <button key={c} onClick={() => setCity(c)} aria-pressed={city === c} className={`border-b-2 px-3 text-[13px] font-medium ${city === c ? "border-[#5FA8FF] text-white" : "border-transparent text-white/60 hover:text-white"}`}>{c}</button>
            ))}
          </nav>
          <div className="flex-1" />
          <nav className="hidden sm:flex items-center gap-2 text-[13px]">
            <Link href="/app" className="rounded-md px-3 py-1.5 text-white/75 hover:text-white">Client app</Link>
            <Link href="/agent" className="rounded-md bg-navy-700 px-3 py-1.5 font-medium hover:bg-navy-500">Agent app</Link>
          </nav>
        </div>
      </div>
      <header className="mx-auto max-w-[1400px] px-4 md:px-8 pt-8 pb-4">
        <h1 className="font-display text-4xl md:text-5xl">Stonebridge Realty</h1>
        <p className="mt-2 text-sm text-stone flex items-center gap-2">
          <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-positive animate-ping opacity-60" /><span className="relative w-2 h-2 rounded-full bg-positive" /></span>
          App activity · synced across tabs in this browser · {new Date(snap.now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · {new Date(snap.now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
        </p>
      </header>

      <nav className="sticky top-0 z-30 bg-canvas/90 backdrop-blur border-b border-line">
        <div className="mx-auto max-w-[1400px] px-4 md:px-8 flex gap-6 text-sm">
          {[["sales", "Sales"], ["customers", "Customers"], ["market", "Market"]].map(([id, label]) => <a key={id} href={`#${id}`} className="py-3 text-stone hover:text-ink">{label}</a>)}
        </div>
      </nav>

      <main className="mx-auto max-w-[1400px] px-4 md:px-8 pb-16">
        <Sales snap={snap} approved={approved} dismissed={dismissed} />
        <Customers snap={snap} />
        <section id="market" className="scroll-mt-16 pt-10">
          <SectionHead title="Market" sub={`CoStar data for ${city}, and what it means for us`} />
          <div className="space-y-4">
            <CostarMarket city={city} />
            <MarketRecap city={city} />
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------------- building blocks ---------------- */

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-3xl">{title}</h2>
      <p className="text-stone">{sub}</p>
    </div>
  );
}
function Panel({ title, sub, right, children, className = "" }: { title: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-card shadow-card p-5 md:p-6 min-w-0 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0"><h3 className="font-display text-xl">{title}</h3>{sub && <p className="text-sm text-stone">{sub}</p>}</div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
/** Change vs the same point last month. `lowerIsBetter` flips the colour. */
function Delta({ cur, prev, label, lowerIsBetter = false, money = false }: { cur: number | null; prev: number | null; label: string; lowerIsBetter?: boolean; money?: boolean }) {
  if (cur == null || prev == null) return <span className="text-xs text-stone">No data for {label} yet</span>;
  const c = change(cur, prev);
  const diff = cur - prev;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const text = c == null ? (money ? fmtMoney(diff) : diff) : `${c > 0 ? "+" : ""}${c}%`;
  return <span className={`text-xs ${diff === 0 ? "text-stone" : good ? "text-positive" : "text-negative"}`}>{diff === 0 ? "Same as" : text + " vs"} {label}</span>;
}
function Kpi({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <article className="rounded-3xl bg-card p-5 shadow-card">
      <p className="text-sm text-stone">{label}</p>
      <p className="mt-3 font-display text-4xl leading-none tabular-nums">{value}</p>
      <div className="mt-3 flex flex-col gap-0.5">{children}</div>
    </article>
  );
}
function Bars({ rows, unit = "" }: { rows: { label: string; value: number; note?: string }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-3 text-sm"><span className="truncate">{r.label}</span><span className="tabular-nums text-stone shrink-0">{r.value}{unit}{r.note ? ` · ${r.note}` : ""}</span></div>
          <div className="mt-1 h-2 rounded-full bg-sand"><div className="h-2 rounded-full bg-sage transition-all duration-700" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
      {!rows.length && <li className="text-sm text-stone">Nothing yet.</li>}
    </ul>
  );
}

/* ---------------- Sales ---------------- */

function Sales({ snap, approved, dismissed }: { snap: Snapshot; approved: string[]; dismissed: string[] }) {
  const s = snap.sales;
  const last = `${snap.prevLabel} 1–${snap.dayOfMonth}`;
  return (
    <section id="sales" className="scroll-mt-16 pt-8">
      <SectionHead title="Sales" sub={`${snap.monthLabel} so far, compared with the same days last month`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <Kpi label="Revenue this month" value={fmtMoney(s.revenue)}>
          <Delta cur={s.revenue} prev={s.revenuePrev} label={last} />
          <span className="text-xs text-stone">On pace for {fmtMoney(s.pace)} · {snap.prevLabel} total {fmtMoney(s.monthTotalPrev)}</span>
        </Kpi>
        <Kpi label="Deals closed" value={String(s.deals)}>
          <Delta cur={s.deals} prev={s.dealsPrev} label={last} />
          <span className="text-xs text-stone">{s.dealsPrev} by this point last month</span>
        </Kpi>
        <Kpi label="Avg. Real Estate Agent response" value={fmtDur(s.responseMs)}>
          <Delta cur={s.responseMs} prev={s.responsePrevMs} label={last} lowerIsBetter />
          <span className="text-xs text-stone">Time to the first reply on a new lead</span>
        </Kpi>
        <Kpi label="Deals saved by follow-ups" value={String(s.saved)}>
          <Delta cur={s.saved} prev={s.savedPrev} label={last} />
          <span className="text-xs text-stone">{fmtMoney(s.savedValue)} in fees after an Agentic Assistant follow-up</span>
        </Kpi>
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <RevenueChart snap={snap} />
        <LiveFeed snap={snap} />
      </div>

      <AgentTable snap={snap} />
      <Strategies snap={snap} approved={approved} dismissed={dismissed} />
    </section>
  );
}

function RevenueChart({ snap }: { snap: Snapshot }) {
  const [how, setHow] = useState(false);
  const data = snap.sales.months.map((m) => ({ ...m, band: m.band ?? null }));
  const next = snap.sales.months.filter((m) => m.key.startsWith("f"));
  return (
    <Panel className="xl:col-span-2" title="Revenue and 3-month forecast" sub="Brokerage fees per month · dashed line is the forecast"
      right={<div className="text-sm text-stone">Next 3 months <span className="font-display text-lg text-ink">{fmtMoney(next.reduce((a, m) => a + (m.forecast || 0), 0))}</span></div>}>
      <div className="h-[260px] md:h-[300px]">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ left: 0, right: 8, top: 10 }}>
            <CartesianGrid vertical={false} stroke="#EDF2F9" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#66758C" }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#66758C" }} tickFormatter={(v) => fmtMoney(Number(v))} width={60} />
            <Tooltip
              contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 10px 30px rgba(22,50,90,.12)", fontSize: 13 }}
              formatter={(v, name) => {
                if (Array.isArray(v)) return [`${fmtMoney(Number(v[0]))} – ${fmtMoney(Number(v[1]))}`, "Likely range"];
                return [fmtMoney(Number(v)), name === "revenue" ? "Revenue" : name === "soFar" ? "So far" : "Forecast"];
              }}
            />
            <Area dataKey="band" stroke="none" fill="#E9EFF8" isAnimationActive={false} connectNulls />
            <Bar dataKey="revenue" fill="#3478F0" radius={[6, 6, 0, 0]} maxBarSize={34} isAnimationActive={false} />
            <Bar dataKey="soFar" fill="#8FB6F5" radius={[6, 6, 0, 0]} maxBarSize={34} isAnimationActive={false} />
            <Line dataKey="forecast" stroke="#16325A" strokeWidth={2.5} strokeDasharray="6 6" dot={{ r: 4, fill: "#16325A", strokeWidth: 0 }} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sage" />Closed fees</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#8FB6F5]" />{snap.monthLabel} so far</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-clay" />Forecast</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-clay-soft" />Likely range</span>
        <button onClick={() => setHow(!how)} className="ml-auto text-sage">How these are counted</button>
      </div>
      {how && <p className="mt-2 text-sm text-stone max-w-3xl">A rental counts one month of rent as our fee, a sale counts 2.5% of the price, and only closed deals count. {snap.sales.forecastMethod}</p>}
    </Panel>
  );
}

function LiveFeed({ snap }: { snap: Snapshot }) {
  const dot = { ai: "bg-violet", agent: "bg-navy", client: "bg-sage", system: "bg-line" } as const;
  return (
    <Panel title="Live activity" sub="Requests, replies, follow-ups and closed deals" right={<span className="w-2 h-2 rounded-full bg-sage animate-pulse" />}>
      <ul className="space-y-3 max-h-[330px] overflow-y-auto no-scrollbar">
        {snap.sales.feed.map((e, i) => (
          <li key={`${e.at}-${i}`} className={`flex gap-3 items-start ${i === 0 ? "rise" : ""}`}>
            <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${dot[e.actor]}`} />
            <div className="min-w-0">
              <p className="text-sm leading-snug"><span className="text-ink">{e.who}</span> <span className="text-stone">{e.text}</span></p>
              <p className="text-xs text-stone">{ago(e.at, snap.now)} · {e.actor === "ai" ? "Agentic Assistant" : e.actor === "agent" ? "Real Estate Agent" : e.actor === "client" ? "Client" : "Pebble"}</p>
            </div>
          </li>
        ))}
        {!snap.sales.feed.length && <li className="text-sm text-stone">Customer and agent app activity will appear here when it happens.</li>}
      </ul>
    </Panel>
  );
}

function AgentTable({ snap }: { snap: Snapshot }) {
  const rows = snap.sales.agents;
  const best = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <Panel className="mt-4" title="Real Estate Agents" sub={`${snap.monthLabel} so far · close rate covers the last 90 days`}>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-stone text-xs"><tr className="text-left">{["Agent", "New leads", "Avg. first reply", "Verified", "Closed", "Revenue", "Saved by follow-ups", "Open / quiet", "Close rate"].map((h) => <th key={h} className="py-2 pr-4 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const c = change(r.revenue, r.revenuePrev);
              const slow = r.avgResponseMs != null && r.avgResponseMs > 5 * 60_000;
              return (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-3 pr-4"><div className="flex items-center gap-2"><Avatar initials={r.initials} color={r.color} size={28} /><span>{r.name}</span></div></td>
                  <td className="pr-4 tabular-nums">{r.leads}</td>
                  <td className={`pr-4 tabular-nums ${slow ? "text-warning" : ""}`}>{fmtDur(r.avgResponseMs)}</td>
                  <td className="pr-4 tabular-nums">{r.verifiedRate}%</td>
                  <td className="pr-4 tabular-nums">{r.closed}</td>
                  <td className="pr-4">
                    <div className="flex items-center gap-2"><span className="tabular-nums w-16">{fmtMoney(r.revenue)}</span><div className="w-20 h-1.5 rounded-full bg-sand"><div className="h-full rounded-full bg-sage" style={{ width: `${(r.revenue / best) * 100}%` }} /></div></div>
                    {c != null && <span className={`text-xs ${c >= 0 ? "text-positive" : "text-negative"}`}>{c > 0 ? "+" : ""}{c}% vs last month</span>}
                  </td>
                  <td className="pr-4 tabular-nums">{r.saved}</td>
                  <td className="pr-4 tabular-nums">{r.active} / <span className={r.quiet ? "text-warning" : ""}>{r.quiet}</span></td>
                  <td className="pr-4 tabular-nums">{r.closeRate90}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ---------------- Strategies (the broker's assistant) ---------------- */

function Strategies({ snap, approved, dismissed }: { snap: Snapshot; approved: string[]; dismissed: string[] }) {
  const [list, setList] = useState<Strategy[] | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [asOf, setAsOf] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [open, setOpen] = useState<Strategy | null>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // the assistant thinks on open, when the city changes, and when asked; it does not rewrite itself every 5 seconds
  const think = async () => {
    const cur = snapRef.current;
    const f = factsOf(cur.signals);
    setThinking(true);
    setFacts(f);
    const agents = cur.sales.agents.map((a) => ({ name: a.name, leads: a.leads, firstReply: fmtDur(a.avgResponseMs), closed: a.closed, revenue: fmtMoney(a.revenue), quiet: a.quiet, closeRate90: `${a.closeRate90}%` }));
    const ai = await aiStrategy(cur.city, f, agents);
    setList(ai && ai.length ? ai : localStrategies(cur.signals));
    setAsOf(cur.now);
    setThinking(false);
  };
  useEffect(() => { void think(); }, [snap.city]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = (list || []).filter((s) => !dismissed.includes(s.id));
  const byGemini = shown.some((s) => s.byGemini);
  return (
    <Panel className="mt-4" title="Strategy suggestions" sub={thinking ? "Going through the numbers…" : `From your assistant${byGemini ? " (Gemini)" : ""} · based on the numbers at ${new Date(asOf || snap.now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · you decide`}
      right={<button onClick={() => void think()} disabled={thinking} className="text-sm text-sage disabled:opacity-50">{thinking ? "Thinking…" : "Think again"}</button>}>
      {thinking && !list ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-56 rounded-3xl shimmer" />)}</div>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${thinking ? "opacity-60" : ""}`}>
          {shown.map((s) => {
            const ok = approved.includes(s.id);
            return (
              <article key={s.id} className={`rounded-3xl p-5 flex flex-col ${ok ? "bg-sage-soft" : "bg-canvas"}`}>
                <h4 className="font-display text-lg leading-snug">{s.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-stone flex-1">{s.summary}</p>
                <p className="mt-3 text-sm text-clay">{s.impact}</p>
                <SuccessMeter value={s.successRate} />
                <div className="mt-4 flex items-center gap-2">
                  {ok ? (
                    <span className="text-sm text-sage flex items-center gap-1"><Icon name="check" className="w-4 h-4" />Approved</span>
                  ) : (
                    <>
                      <button onClick={() => update((st) => void st.approvedStrategies.push(s.id))} className="h-9 px-4 rounded-full bg-sage text-white text-sm">Approve</button>
                      <button onClick={() => update((st) => void st.dismissedStrategies.push(s.id))} className="h-9 px-3 rounded-full text-sm text-stone">Dismiss</button>
                    </>
                  )}
                  <button onClick={() => setOpen(s)} className="ml-auto text-sm text-sage">See more</button>
                </div>
              </article>
            );
          })}
          {!shown.length && <p className="text-sm text-stone">All suggestions handled. Ask the assistant to think again for new ones.</p>}
        </div>
      )}
      {open && <Explain s={open} facts={facts} onClose={() => setOpen(null)} />}
    </Panel>
  );
}

function SuccessMeter({ value }: { value: number }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-stone"><span>Likely to work</span><span className="tabular-nums text-ink">{value}%</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-sand"><div className="h-full rounded-full bg-sage" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function Explain({ s, facts, onClose }: { s: Strategy; facts: Fact[]; onClose: () => void }) {
  const used = s.evidence.map((id) => facts.find((f) => f.id === id)).filter((f): f is Fact => Boolean(f));
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-0 md:p-6 fadein" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-[32px] md:rounded-[32px] bg-card p-6 md:p-8 shadow-card rise" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-sage">{s.byGemini ? "Your assistant · Gemini" : "Your assistant"}</p>
            <h3 className="mt-1 font-display text-2xl leading-snug">{s.title}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-sand grid place-items-center shrink-0"><Icon name="x" className="w-4 h-4" /></button>
        </div>

        <h4 className="mt-6 font-medium">How I got here</h4>
        <ol className="mt-2 space-y-3">
          {s.thinking.map((t, i) => (
            <li key={i} className="flex gap-3"><span className="w-6 h-6 rounded-full bg-sage-soft text-sage-ink text-xs grid place-items-center shrink-0">{i + 1}</span><p className="text-[15px] leading-relaxed">{t}</p></li>
          ))}
        </ol>

        <h4 className="mt-6 font-medium">The numbers I used</h4>
        <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {used.map((f) => (
            <li key={f.id} className="rounded-2xl bg-canvas px-4 py-3">
              <p className="text-xs text-stone">{f.label}</p>
              <p className="text-sm mt-0.5">{f.value}</p>
              <p className={`text-[11px] mt-1 ${f.source === "CoStar" ? "text-[#1F4FA8]" : "text-sage"}`}>{f.source}</p>
            </li>
          ))}
        </ul>

        {s.plan.length > 0 && (
          <>
            <h4 className="mt-6 font-medium">What I'd do</h4>
            <ul className="mt-2 space-y-1.5">{s.plan.map((p) => <li key={p} className="flex gap-2 text-[15px]"><Icon name="check" className="w-4 h-4 text-sage mt-1 shrink-0" />{p}</li>)}</ul>
          </>
        )}

        <div className="mt-6 rounded-3xl bg-sage-soft p-5">
          <h4 className="font-medium text-sage-ink">What to expect</h4>
          <p className="mt-1 text-[15px]">{s.expected}</p>
          <SuccessMeter value={s.successRate} />
          <p className="mt-3 text-sm text-stone">{s.confidence}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Customers ---------------- */

function Customers({ snap }: { snap: Snapshot }) {
  const c = snap.customers;
  const [pick, setPick] = useState<string | null>(null);
  const prop = c.properties.find((p) => p.id === pick) || c.properties[0];
  return (
    <section id="customers" className="scroll-mt-16 pt-10">
      <SectionHead title="Customers" sub="What shoppers search for, where they look and who they are · last 30 days vs the 30 before" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <Kpi label="Active shoppers" value={c.shoppers.toLocaleString()}><Delta cur={c.shoppers} prev={c.shoppersPrev} label="previous 30 days" /></Kpi>
        <Kpi label="Searches" value={c.searches.toLocaleString()}><Delta cur={c.searches} prev={c.searchesPrev} label="previous 30 days" /></Kpi>
        <Kpi label="Avg. time on a listing" value={fmtDur(c.avgViewMs)}><Delta cur={c.avgViewMs} prev={c.avgViewPrevMs} label="previous 30 days" /></Kpi>
        <Kpi label="Avg. shopper age" value={c.avgAge ? String(c.avgAge) : "—"}><span className="text-xs text-stone">From shoppers who shared it</span></Kpi>
        <Kpi label="Likely to buy or rent soon" value={String(c.highIntent)}><span className="text-xs text-stone">Long looks, repeat visits, active lead</span></Kpi>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="What they search for" sub="Tags in shoppers' requests">
          <Bars rows={c.tags.slice(0, 8).map((t) => ({ label: t.tag, value: t.share, note: `${t.count} searches` }))} unit="%" />
        </Panel>
        <Panel title="Where they're looking" sub="Neighborhoods by shoppers · with CoStar prices">
          <ul className="space-y-2.5">
            {c.areas.slice(0, 7).map((a) => (
              <li key={a.name} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm"><span className="truncate">{a.name}</span><span className="text-stone tabular-nums">{a.shoppers} shoppers</span></div>
                  <div className="text-xs text-stone">{a.views} views · avg {fmtDur(a.avgMs)} · CoStar {a.ppsf ? `$${a.ppsf}/sq ft` : "—"}{a.dom != null ? ` · ${a.dom} days on market` : ""}{a.priceCut != null ? ` · ${a.priceCut}% cut price` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Who's looking" sub="Age and where they live now">
          <Bars rows={c.ages.map((a) => ({ label: a.band, value: a.count }))} />
          <div className="mt-4 flex flex-wrap gap-1.5">{c.from.map((f) => <span key={f.name} className="px-2.5 py-1 rounded-full bg-sand text-xs">{f.name} · {f.count}</span>)}</div>
        </Panel>
      </div>

      <HotShoppers snap={snap} />

      <Panel className="mt-4" title="Property insights" sub="For owners: how shoppers engage with each listing (last 30 days)">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ul className="space-y-1.5 lg:max-h-[520px] overflow-y-auto no-scrollbar">
            {c.properties.map((p) => (
              <li key={p.id}>
                <button onClick={() => setPick(p.id)} className={`w-full text-left rounded-2xl px-4 py-3 border transition ${prop?.id === p.id ? "border-sage bg-sage-soft/60" : "border-line hover:bg-canvas"}`}>
                  <div className="flex justify-between gap-2"><span className="text-sm truncate">{p.title}</span><span className="text-xs text-stone shrink-0">{p.views} views</span></div>
                  <div className="text-xs text-stone">{p.neighborhood} · {p.price} · avg {fmtDur(p.avgMs)}</div>
                </button>
              </li>
            ))}
          </ul>
          {prop && <PropertyCard p={prop} />}
        </div>
      </Panel>

      <div className="mt-4 rounded-3xl bg-card shadow-card px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2 text-sage"><span className="w-2 h-2 rounded-full bg-sage animate-pulse" />Right now</span>
        {c.justNow.slice(0, 4).map((v, i) => <span key={`${v.at}-${i}`} className="text-stone"><span className="text-ink">{v.who}</span> viewed {v.title} · {fmtDur(v.ms)} · {ago(v.at, snap.now)}</span>)}
      </div>
    </section>
  );
}

function HotShoppers({ snap }: { snap: Snapshot }) {
  const rows = snap.customers.hot;
  return (
    <Panel className="mt-4" title="Most likely to buy or rent" sub="Ranked by time on listings, repeat visits, searches and lead stage">
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-stone text-xs"><tr className="text-left">{["Shopper", "Email", "Age", "Lives in", "Likelihood", "Homes they keep looking at", "Wants", "Last seen"].map((h) => <th key={h} className="py-2 pr-4 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((s) => <ShopperRow key={s.id} s={s} at={snap.now} />)}
            {!rows.length && <tr><td colSpan={8} className="py-4 text-stone">No high-likelihood shoppers in this market yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
function ShopperRow({ s, at }: { s: Shopper; at: number }) {
  return (
    <tr className="border-t border-line align-top">
      <td className="py-3 pr-4"><div>{s.name}</div><div className="text-xs text-stone">{s.stage === "browsing" ? "Browsing" : `Lead · ${s.stage}`}{s.source === "app" ? " · from the app" : ""}</div></td>
      <td className="py-3 pr-4">{s.email ? <a href={`mailto:${s.email}`} className="text-sage hover:underline">{s.email}</a> : <span className="text-xs text-stone">Not shared (no contact consent)</span>}</td>
      <td className="py-3 pr-4 tabular-nums">{s.age ?? "—"}</td>
      <td className="py-3 pr-4">{s.location || "—"}</td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2"><div className="w-16 h-1.5 rounded-full bg-sand"><div className="h-full rounded-full bg-clay" style={{ width: `${s.score}%` }} /></div><span className="tabular-nums">{s.score}</span></div>
        <div className="text-xs text-stone mt-1 max-w-[220px]">{s.reasons.slice(0, 2).join(" · ")}</div>
      </td>
      <td className="py-3 pr-4"><ul className="space-y-0.5">{s.homes.slice(0, 3).map((h) => <li key={h.id} className="text-xs"><span className="text-ink">{h.title}</span> <span className="text-stone">· {h.looks}× · {fmtDur(h.ms)}</span></li>)}</ul></td>
      <td className="py-3 pr-4"><div className="flex flex-wrap gap-1">{s.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-sage-soft text-sage-ink text-xs">{t}</span>)}</div></td>
      <td className="py-3 pr-4 text-xs text-stone whitespace-nowrap">{ago(s.lastSeen, at)}</td>
    </tr>
  );
}

function PropertyCard({ p }: { p: PropertyStats }) {
  return (
    <div className="lg:col-span-2 rounded-3xl bg-canvas p-5 min-w-0">
      <h4 className="font-display text-2xl leading-snug">{p.title}</h4>
      <p className="text-sm text-stone">{p.neighborhood} · {p.price}</p>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[["Avg. time viewed", fmtDur(p.avgMs)], ["Views", String(p.views)], ["Different shoppers", String(p.viewers)], ["Avg. viewer age", p.avgAge ? String(p.avgAge) : "—"]].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-card px-4 py-3"><div className="text-xs text-stone">{l}</div><div className="font-display text-2xl">{v}</div></div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h5 className="text-sm font-medium">Tags it gets linked to</h5>
          <div className="mt-2"><Bars rows={p.tags.map((t) => ({ label: t.tag, value: t.count }))} /></div>
        </div>
        <div>
          <h5 className="text-sm font-medium">Viewers by age</h5>
          <div className="mt-2"><Bars rows={p.ages.filter((a) => a.count).map((a) => ({ label: a.band, value: a.count }))} /></div>
          <div className="mt-3 flex flex-wrap gap-1.5">{p.from.map((f) => <span key={f.name} className="px-2.5 py-1 rounded-full bg-card text-xs">{f.name} · {f.count}</span>)}</div>
        </div>
      </div>
      <h5 className="mt-5 text-sm font-medium">Interested shoppers <span className="font-normal text-stone">· those who agreed to share with owners</span></h5>
      <ul className="mt-2 space-y-2">
        {p.interested.map((s) => (
          <li key={s.id} className="rounded-2xl bg-card px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>{s.name}{s.age ? `, ${s.age}` : ""} <span className="text-xs text-stone">· {s.location || "—"}</span></span>
              {s.email ? <a href={`mailto:${s.email}`} className="text-sm text-sage hover:underline">{s.email}</a> : <span className="text-xs text-stone">Email not shared</span>}
            </div>
            <div className="mt-1 text-xs text-stone">Also looking at: {s.homes.filter((h) => h.id !== p.id).slice(0, 3).map((h) => h.title).join(" · ") || "only this home"} · likelihood {s.score}</div>
          </li>
        ))}
        {!p.interested.length && <li className="text-sm text-stone">{p.interestedHidden ? "" : "No high-likelihood shoppers on this listing yet."}</li>}
        {p.interestedHidden > 0 && <li className="text-xs text-stone">+ {p.interestedHidden} more interested shopper{p.interestedHidden === 1 ? "" : "s"} who chose not to share their details with owners</li>}
      </ul>
    </div>
  );
}
