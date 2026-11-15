"use client";
import { useEffect, useMemo, useState } from "react";
import { aiStrategy } from "@/lib/ai";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { agentById } from "@/lib/recap";
import { now, update, useStore } from "@/lib/store";
import { Avatar, Icon, Logo } from "@/components/ui";
import MarketIntel from "@/components/dashboard/MarketIntel";
import { cityMarket, MARKET } from "@/lib/market";

/* ---------- Demo data (clearly labeled in the UI) ---------- */
const MONTHS = ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
const REVENUE = [92, 88, 97, 108, 121, 138, 152, 171, 214, 176, 158, 186].map((k) => k * 1000);
const RESPONSE_MIN = [190, 172, 160, 95, 48, 30, 21, 14, 11, 9, 7, 6];

/** Forecast: least-squares trend × last-year seasonality (demo). */
function forecast(series: number[], n = 3) {
  const N = series.length;
  const xs = series.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b) / N, my = series.reduce((a, b) => a + b) / N;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (series[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const season = [0.86, 0.84, 0.9]; // Dec–Feb seasonal index from prior years
  return [...Array(n)].map((_, k) => Math.round((my + slope * (N + k - mx)) * season[k] / 1000) * 1000);
}

const STRATEGIES = [
  { id: "s1", title: "Pre-verify 20 homes before the August rush", why: "Forecast shows relocation leads +38% in Jul–Aug. Verified homes close 2.4× faster.", impact: "+$31k est. Aug revenue" },
  { id: "s2", title: "Add a Saturday on-call Real Estate Agent", why: "Weekend leads wait 3.1× longer for a first reply and cancel 22% more often.", impact: "−9% weekend cancellations" },
  { id: "s3", title: "Ask owners for natural-light photos", why: "“Bright” and “artsy” are the most-asked vibes in the Heights; listings tagged bright get 2.1× more tours.", impact: "+14% tour requests" },
];

export default function Dashboard() {
  const leads = useStore((s) => s.leads);
  const approved = useStore((s) => s.approvedStrategies);
  const dismissed = useStore((s) => s.dismissedStrategies);
  const [strategies, setStrategies] = useState(STRATEGIES);
  const [byGemini, setByGemini] = useState(false);
  useEffect(() => {
    aiStrategy({
      month: "November 2026", revenueByMonth: Object.fromEntries(MONTHS.map((m, i) => [m, REVENUE[i]])), forecastNext3: forecast(REVENUE),
      avgAgentResponseMinutesByMonth: RESPONSE_MIN, funnel: { voiceRequests: 412, qualified: 142, verified: 97, toured: 61, applications: 34, closed: 21 },
      weekendFirstReplyMultiple: 3.1, weekendCancellationGapPct: 22, mostAskedVibesInHeights: ["bright", "artsy", "cozy"], toursBrightVsOther: 2.1, dealsRescuedByFollowups: 7,
      costarMarket: { city: MARKET.demo.city, ...(({ residential, apartments, neighborhoods }) => ({ residential, apartments: { availabilityPct: apartments.availabilityPct, medianAskingRent: apartments.medianAskingRent }, demoNeighborhood: neighborhoods.find((h) => h.name === MARKET.demo.neighborhood) }))(cityMarket(MARKET.demo.city)) },
    }).then((s) => { if (s?.length) { setStrategies(s.slice(0, 3).map((x, i) => ({ ...x, id: `g${i + 1}` }))); setByGemini(true); } });
  }, []);

  const live = useMemo(() => {
    const active = leads.filter((l) => !l.archived);
    const closed = leads.filter((l) => l.status === "closed");
    return {
      verified: active.filter((l) => l.status !== "new").length,
      qualified: active.length,
      closed: closed.length,
      closedValue: closed.reduce((a, l) => a + l.dealValue, 0),
      rescued: leads.filter((l) => l.rescuedByNudge).length,
      rescuedValue: leads.filter((l) => l.rescuedByNudge).reduce((a, l) => a + l.dealValue, 0),
    };
  }, [leads]);

  const fc = forecast(REVENUE);
  const revData = [
    ...MONTHS.map((m, i) => ({ m, actual: i === 11 ? REVENUE[i] + live.closedValue : REVENUE[i], forecast: i === 11 ? REVENUE[i] + live.closedValue : null as number | null, lo: null as number | null, hi: null as number | null })),
    ...["Dec", "Jan", "Feb"].map((m, k) => ({ m: m + "*", actual: null, forecast: fc[k], lo: fc[k] * 0.88, hi: fc[k] * 1.12 })),
  ];
  const revenueNow = REVENUE[11] + live.closedValue;
  const funnel = [
    { s: "Voice requests", v: 412 + leads.length },
    { s: "Qualified by Agentic Assistant", v: 142 + live.qualified },
    { s: "Verified by Real Estate Agents", v: 97 + live.verified },
    { s: "Toured", v: 61 + leads.filter((l) => ["touring", "application", "closed"].includes(l.status)).length },
    { s: "Application / offer", v: 34 + leads.filter((l) => ["application", "closed"].includes(l.status)).length },
    { s: "Closed", v: 21 + live.closed },
  ];
  const events = leads.flatMap((l) => l.events.map((e) => ({ ...e, who: l.clientName }))).sort((a, b) => b.at - a.at).slice(0, 9);
  const agentRows = [
    { id: "maya", closed: 7, rev: 58200, resp: 3, ver: 96 },
    { id: "priya", closed: 6, rev: 49800, resp: 5, ver: 92 },
    { id: "marcus", closed: 4, rev: 44100, resp: 8, ver: 88 },
    { id: "daniel", closed: 4, rev: 21300, resp: 6, ver: 90 },
    { id: "elena", closed: 2, rev: 13000, resp: 9, ver: 85 },
  ];

  return (
    <div className="min-h-screen bg-[#FBF5F5] text-ink">
      <header className="h-16 px-4 md:px-8 flex items-center gap-2 md:gap-4 bg-white border-b border-[#f0e4e4]">
        <Logo className="text-[18px] shrink-0" />
        <span className="text-mute hidden sm:inline">/</span>
        <span className="font-semibold truncate hidden sm:inline">Stonebridge Realty</span>
        <span className="sm:ml-2 px-2 py-0.5 rounded-md bg-[#FFF4D6] text-[#8A6A12] text-[11px] font-semibold shrink-0">SALES: DEMO DATA</span>
        <span className="px-2 py-0.5 rounded-md bg-[#E8F0FB] text-[#2B5797] text-[11px] font-semibold shrink-0 hidden md:inline">LISTINGS & MARKET: COSTAR</span>
        <div className="ml-auto flex items-center gap-2 text-[13px] shrink-0">
          <span className="px-3 py-1.5 rounded-full bg-blush font-medium hidden md:inline">November 2026</span>
          <Avatar initials="OM" color="#1D1A1C" size={32} />
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-[1440px] mx-auto space-y-4 md:space-y-6">
        {/* data-flow strip */}
        <div className="rounded-3xl bg-white shadow-card px-6 py-4 flex items-center gap-2 text-[13px] overflow-x-auto">
          {[["mic", "Client speaks", funnel[0].v], ["spark", "Agentic Assistant parses & recaps", funnel[1].v], ["home", "Vibe search · top 3", funnel[1].v], ["users", "Real Estate Agent verifies", funnel[2].v], ["chat", "Real Estate Agent contacts", funnel[3].v], ["key", "Closed", funnel[5].v]].map(([ic, t, v], i, a) => (
            <div key={t as string} className="flex items-center gap-2 shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${i === 1 || i === 2 ? "bg-coral-soft text-coral" : i === 3 || i === 4 ? "bg-ink text-white" : "bg-blush text-ink"}`}><Icon name={ic as string} className="w-4 h-4" /></div>
              <div><div className="font-semibold leading-tight">{t}</div><div className="text-[11px] text-mute">{(v as number).toLocaleString()} this month</div></div>
              {i < a.length - 1 && <div className="w-8 h-px bg-[#e9d9da] mx-1" />}
            </div>
          ))}
          <div className="ml-auto shrink-0 text-[11px] text-mute flex items-center gap-3"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-coral" />Agentic Assistant suggests</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ink" />Real Estate Agent verifies</span></div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          <Kpi label="Revenue this month" value={`$${(revenueNow / 1000).toFixed(1)}k`} delta="+18% vs Oct" spark={REVENUE.slice(-8)} />
          <Kpi label="Deals closed" value={`${21 + live.closed}`} delta="+6 vs Oct" />
          <Kpi label="Avg. Real Estate Agent response" value={`${RESPONSE_MIN[11]} min`} delta="was 3.2 h before Pebble" spark={RESPONSE_MIN.slice(-8)} good="down" />
          <Kpi label="Qualified → verified" value={`${142 + live.qualified} → ${97 + live.verified}`} delta={`${Math.round(((97 + live.verified) / (142 + live.qualified)) * 100)}% verified by Real Estate Agents`} />
          <Kpi label="Deals rescued by Agentic Assistant follow-ups" value={`${7 + live.rescued}`} delta={`$${(32.4 + live.rescuedValue / 1000).toFixed(1)}k saved revenue`} accent />
        </div>

        <MarketIntel />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <section className="lg:col-span-2 rounded-3xl bg-white shadow-card p-5 md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div><h2 className="font-semibold text-[16px]">Revenue & forecast</h2><p className="text-[12px] text-mute">Commission revenue, last 12 months · dashed = Agentic Assistant forecast (trend × seasonality)</p></div>
              <div className="text-[12px] text-mute">Q1 forecast <b className="text-ink">${((fc[0] + fc[1] + fc[2]) / 1000).toFixed(0)}k</b></div>
            </div>
            <div className="h-[220px] md:h-[280px] mt-3">
              <ResponsiveContainer>
                <ComposedChart data={revData} margin={{ left: 0, right: 8, top: 10 }}>
                  <defs><linearGradient id="rv" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#E5322D" stopOpacity={0.22} /><stop offset="1" stopColor="#E5322D" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="#f2e8e8" />
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#8A8285" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#8A8285" }} tickFormatter={(v) => `$${v / 1000}k`} width={52} />
                  <Tooltip formatter={(v) => `$${(Number(v) / 1000).toFixed(1)}k`} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 8px 24px rgba(60,20,25,.12)" }} />
                  <Area dataKey="hi" stroke="none" fill="#F6E4E5" isAnimationActive={false} />
                  <Area dataKey="lo" stroke="none" fill="#fff" isAnimationActive={false} />
                  <Area dataKey="actual" stroke="#E5322D" strokeWidth={2.5} fill="url(#rv)" dot={false} isAnimationActive={false} />
                  <Line dataKey="forecast" stroke="#1D1A1C" strokeWidth={2} strokeDasharray="6 5" dot={{ r: 4, fill: "#fff", strokeWidth: 2, strokeDasharray: "0" }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-3xl bg-white shadow-card p-5 md:p-6">
            <h2 className="font-semibold text-[16px]">Pipeline funnel</h2>
            <p className="text-[12px] text-mute">This month, all Real Estate Agents</p>
            <div className="mt-4 space-y-2.5">
              {funnel.map((f, i) => (
                <div key={f.s}>
                  <div className="flex justify-between text-[12px]"><span>{f.s}</span><span className="font-semibold">{f.v}</span></div>
                  <div className="h-2.5 mt-1 rounded-full bg-[#f6eded] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(f.v / funnel[0].v) * 100}%`, background: i < 2 ? "#F08C88" : i < 5 ? "#E5322D" : "#1D1A1C" }} /></div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[12px] text-mute">Request → close: <b className="text-ink">{((funnel[5].v / funnel[0].v) * 100).toFixed(1)}%</b> (industry avg. ~2%)</div>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <section className="lg:col-span-2 rounded-3xl bg-white shadow-card p-5 md:p-6 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><Icon name="spark" className="w-5 h-5 text-coral" /><h2 className="font-semibold text-[16px]">Agentic Assistant strategy suggestions</h2><span className="text-[12px] text-mute">— you decide{byGemini ? " · written by Gemini from this month\u2019s numbers" : ""}</span></div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {strategies.filter((s) => !dismissed.includes(s.id)).map((s) => {
                const ok = approved.includes(s.id);
                return (
                  <div key={s.id} className={`rounded-2xl p-4 flex flex-col ${ok ? "bg-[#EDF7F1]" : "bg-blush"}`}>
                    <div className="font-semibold text-[14px] leading-snug">{s.title}</div>
                    <p className="text-[12px] text-[#5b5357] mt-1.5 leading-snug flex-1">{s.why}</p>
                    <div className="text-[12px] font-semibold text-coral mt-2">{s.impact}</div>
                    {ok ? (
                      <div className="mt-3 text-[12px] font-semibold text-[#1F7A4C] flex items-center gap-1"><Icon name="check" className="w-4 h-4" />Approved by you · assigned</div>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => update((st) => void st.approvedStrategies.push(s.id))} className="flex-1 h-9 rounded-full bg-ink text-white text-[12px] font-semibold">Approve</button>
                        <button onClick={() => update((st) => void st.dismissedStrategies.push(s.id))} className="h-9 px-3 rounded-full border border-[#e6d6d7] text-[12px] text-mute">Dismiss</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <h3 className="font-semibold text-[14px] mt-6 mb-2">Top Real Estate Agents</h3>
            <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[540px] text-[13px]">
              <thead><tr className="text-left text-mute text-[11px]"><th className="font-medium py-1.5">Real Estate Agent</th><th className="font-medium">Closed</th><th className="font-medium">Revenue</th><th className="font-medium">Avg. response</th><th className="font-medium">Verification rate</th></tr></thead>
              <tbody>
                {agentRows.map((r) => {
                  const a = agentById(r.id);
                  return (
                    <tr key={r.id} className="border-t border-[#f3eaea]">
                      <td className="py-2"><div className="flex items-center gap-2"><Avatar initials={a.initials} color={a.color} size={26} /><span className="font-medium">{a.name}</span></div></td>
                      <td>{r.closed + (r.id === "maya" ? live.closed - 2 > 0 ? live.closed - 2 : 0 : 0)}</td>
                      <td>${r.rev.toLocaleString()}</td>
                      <td>{r.resp} min</td>
                      <td><div className="flex items-center gap-2"><div className="w-20 h-1.5 rounded-full bg-[#f3e9e9]"><div className="h-full rounded-full bg-coral" style={{ width: `${r.ver}%` }} /></div>{r.ver}%</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </section>

          <section className="rounded-3xl bg-white shadow-card p-5 md:p-6">
            <h2 className="font-semibold text-[16px] flex items-center gap-2">Live activity<span className="w-2 h-2 rounded-full bg-coral animate-pulse" /></h2>
            <p className="text-[12px] text-mute">Every request, Agentic Assistant step and Real Estate Agent decision</p>
            <div className="mt-4 space-y-3">
              {events.map((e, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${e.actor === "ai" ? "bg-coral" : e.actor === "agent" ? "bg-ink" : e.actor === "client" ? "bg-[#F08C88]" : "bg-[#C9B9BB]"}`} />
                  <div className="flex-1 min-w-0"><div className="text-[13px] leading-tight"><b className="font-semibold">{e.who}</b> · {e.label}</div><div className="text-[11px] text-mute">{(() => { const m = Math.max(0, Math.round((now() - e.at) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; })()} · {e.actor === "ai" ? "Agentic Assistant" : e.actor === "agent" ? "Real Estate Agent" : e.actor === "client" ? "Client" : "Pebble"}</div></div>
                </div>
              ))}
            </div>
            <div className="mt-5 h-[90px]">
              <div className="text-[11px] text-mute mb-1">Real Estate Agent response time (min) · 12 months</div>
              <ResponsiveContainer>
                <BarChart data={RESPONSE_MIN.map((v, i) => ({ m: MONTHS[i], v }))}>
                  <Bar dataKey="v" fill="#E5322D" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Tooltip cursor={{ fill: "#fbf0f0" }} formatter={(v) => `${v} min`} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
        <p className="text-center text-[11px] text-mute pb-4">Revenue, pipeline and agent figures are demo data; listings, market numbers and 3D tours are live CoStar data (Houston & Los Angeles). Live leads from the customer and Real Estate Agent apps update this page in real time.</p>
      </main>
    </div>
  );
}

function Kpi({ label, value, delta, spark, accent, good }: { label: string; value: string; delta: string; spark?: number[]; accent?: boolean; good?: "down" }) {
  return (
    <div className={`rounded-3xl p-5 shadow-card ${accent ? "bg-ink text-white sm:col-span-2 lg:col-span-1" : "bg-white"}`}>
      <div className={`text-[12px] ${accent ? "text-white/70" : "text-mute"}`}>{label}</div>
      <div className="text-[28px] font-bold tracking-tight mt-1">{value}</div>
      <div className="flex items-end justify-between gap-2">
        <div className={`text-[12px] font-medium ${accent ? "text-[#FF8A85]" : "text-[#1F7A4C]"}`}>{delta}</div>
        {spark && (
          <div className="w-20 h-8">
            <ResponsiveContainer><AreaChart data={spark.map((v) => ({ v }))}><Area dataKey="v" stroke={good === "down" ? "#1F7A4C" : "#E5322D"} fill={good === "down" ? "#E4F4EA" : "#FCE3E1"} strokeWidth={2} isAnimationActive={false} /></AreaChart></ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
