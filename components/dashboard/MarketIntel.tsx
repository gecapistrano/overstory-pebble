"use client";
/* CoStar market intelligence for the brokerage dashboard:
   - Gemini "smart recap" + insights + suggested listings, layered from multiple CoStar datasets
   - KPI tiles from market.json (real CoStar numbers)
   - Map overview of the suggested properties; tapping a pin opens the Matterport 3D interior tour. */
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aiMarket, type AIMarket } from "@/lib/ai";
import { listingsSync, getListing } from "@/lib/adapters";
import { cityMarket, fallbackRecap, opportunities, MARKET } from "@/lib/market";
import { MARKETS } from "@/lib/markets";
import { price, bedsBaths, commute } from "@/lib/recap";
import { useStore } from "@/lib/store";
import type { Listing } from "@/lib/types";
import MapView from "@/components/MapView";
import MatterportTour from "@/components/MatterportTour";
import CostarBadge from "@/components/CostarBadge";
import HomeArt from "@/components/HomeArt";
import { Icon } from "@/components/ui";

const k = (n?: number | null) => (n == null ? "—" : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);

export default function MarketIntel() {
  const leads = useStore((s) => s.leads);
  const [city, setCity] = useState(MARKET.demo.city);
  const [ai, setAi] = useState<(AIMarket & { byGemini: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | undefined>();
  const [tour, setTour] = useState<Listing | null>(null);
  const m = cityMarket(city);

  const opps = useMemo(() => opportunities(listingsSync(), city, leads, 8), [city, leads]);
  const fallback = useMemo(() => fallbackRecap(city, opps), [city, opps]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setAi(null);
    aiMarket(city, leads).then((r) => {
      if (!alive) return;
      setAi(r && r.recap ? { ...r, byGemini: true } : null);
      setLoading(false);
    });
    return () => void (alive = false);
    // re-run on city change only; leads change often during a live demo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  const view = ai || { ...fallback, byGemini: false };
  const suggested = (view.suggestions.length ? view.suggestions : fallback.suggestions)
    .map((s) => ({ ...s, listing: getListing(s.listingId) }))
    .filter((s): s is typeof s & { listing: Listing } => Boolean(s.listing));
  const pins = suggested.map((s) => s.listing);
  const sel = pins.find((l) => l.id === selected) || pins[0];

  const hoods = m.neighborhoods.filter((h) => h.medianPricePerSqft).slice(0, 8).map((h) => ({ name: h.name.replace(" District", ""), v: h.medianPricePerSqft!, dom: h.medianDaysOnMarket, n: h.activeForSale, demo: h.name === MARKET.demo.neighborhood }));
  const r = m.residential, a = m.apartments;

  return (
    <section className="rounded-3xl bg-white shadow-card p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Icon name="spark" className="w-5 h-5 text-coral" />
        <h2 className="font-semibold text-[16px]">Market intelligence</h2>
        <span className="px-2 py-0.5 rounded-md bg-[#E8F0FB] text-[#2B5797] text-[11px] font-semibold">LIVE COSTAR DATA</span>
        <span className="text-[12px] text-mute">Homes.com listings & sales · Apartments.com rents · sale comps · tenant employers</span>
        <div className="ml-auto flex p-1 rounded-full bg-blush">
          {MARKETS.map((mk) => (
            <button key={mk.city} onClick={() => { setCity(mk.city); setSelected(undefined); }} className={`px-3 h-8 rounded-full text-[12px] font-semibold ${city === mk.city ? "bg-white shadow" : "text-mute"}`}>{mk.city}</button>
          ))}
        </div>
      </div>

      {/* KPI tiles: real CoStar numbers */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <Stat label="Active homes for sale" value={r.activeForSale.toLocaleString()} sub={`median ${k(r.medianListPrice)}`} />
        <Stat label="Median price / sq ft" value={`$${r.medianPricePerSqft}`} sub={`${r.medianDaysOnMarket} days on market`} />
        <Stat label="Listings with a price cut" value={`${r.priceCutSharePct}%`} sub={`median cut ${r.medianPriceCutPct}%`} />
        <Stat label="Sold, last 12 months" value={r.soldLast12m.toLocaleString()} sub={r.medianSoldPrice ? `median ${k(r.medianSoldPrice)}` : `last ask ${k(r.medianLastAskOfSold)} · TX non-disclosure`} />
        <Stat label="Apartment units open" value={`${a.availabilityPct}%`} sub={`${a.unitsAvailable.toLocaleString()} of ${a.totalUnits.toLocaleString()} units`} />
        <Stat label="1-bed asking rent" value={`$${(a.medianAskingRent["1bed"] || 0).toLocaleString()}`} sub={`2-bed $${(a.medianAskingRent["2bed"] || 0).toLocaleString()}`} />
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
        {/* recap + insights + suggestions */}
        <div className="lg:col-span-2 min-w-0">
          <div className="rounded-2xl bg-ink text-white p-4">
            <div className="flex items-center gap-2 text-[12px] text-white/70">
              <Icon name="spark" className="w-4 h-4 text-coral" />Smart recap · {view.byGemini ? `Gemini${ai?.model ? ` (${ai.model})` : ""}` : loading ? "asking Gemini…" : "on-device (Gemini offline)"} · {city}
            </div>
            {loading && !ai ? (
              <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-3.5 rounded bg-white/10 animate-pulse" style={{ width: `${95 - i * 15}%` }} />)}</div>
            ) : (
              <p className="mt-2 text-[14px] leading-relaxed">{view.recap}</p>
            )}
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
            {view.insights.map((i) => (
              <div key={i.title} className="rounded-2xl bg-blush p-3">
                <div className="text-[18px] font-bold tracking-tight">{i.metric}</div>
                <div className="text-[12px] font-semibold leading-tight mt-0.5">{i.title}</div>
                <div className="text-[11px] text-[#5b5357] mt-1 leading-snug">{i.detail}</div>
              </div>
            ))}
          </div>
          <h3 className="font-semibold text-[14px] mt-5 mb-2">Suggested properties to push this week</h3>
          <div className="space-y-2">
            {suggested.map((s, i) => (
              <button key={s.listingId} onClick={() => setSelected(s.listingId)} className={`w-full text-left flex gap-3 p-2 rounded-2xl border transition ${sel?.id === s.listingId ? "border-coral bg-coral-soft/40" : "border-[#f0e4e4] hover:bg-blush"}`}>
                <div className="relative w-16 h-14 rounded-xl overflow-hidden shrink-0"><HomeArt listing={s.listing} className="w-full h-full" /><span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-ink text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2"><span className="font-bold text-[14px]">{price(s.listing)}</span><span className="text-[12px] font-medium truncate">{s.headline}</span></div>
                  <div className="text-[11px] text-[#5b5357] leading-snug mt-0.5">{s.why}</div>
                  <div className="text-[11px] font-semibold text-coral mt-0.5">→ {s.action}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* map overview + selected property */}
        <div className="lg:col-span-3 min-w-0 flex flex-col gap-3">
          <div className="relative h-[340px] md:h-[400px] rounded-2xl overflow-hidden">
            <MapView key={city} city={city} listings={pins} selected={sel?.id} onSelect={setSelected} numbered className="absolute inset-0" />
            <div className="absolute top-3 left-3 z-[400] px-3 py-1.5 rounded-full bg-white/95 shadow-card text-[12px] font-medium">Tap a pin · open the 3D interior</div>
          </div>
          {sel && (
            <div className="flex flex-col sm:flex-row gap-3 p-3 rounded-2xl bg-blush">
              <div className="relative w-full sm:w-44 h-32 rounded-xl overflow-hidden shrink-0"><HomeArt listing={sel} className="w-full h-full" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2"><span className="text-[20px] font-bold">{price(sel)}</span><span className="text-[12px] text-mute">{bedsBaths(sel)} · {commute(sel)}</span></div>
                <div className="font-semibold text-[14px] truncate">{sel.title}</div>
                <div className="text-[12px] text-mute truncate">{sel.address}</div>
                <CostarBadge l={sel} className="mt-2 bg-white" />
                {sel.matterportId && (
                  <button onClick={() => setTour(sel)} className="mt-2 h-9 px-4 rounded-full bg-coral text-white text-[13px] font-semibold flex items-center gap-1.5"><Icon name="cube" className="w-4 h-4" />Open 3D tour</button>
                )}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold text-[14px]">Median price per sq ft by neighborhood</h3>
              <span className="text-[11px] text-mute">active for-sale listings · darker bar = demo area</span>
            </div>
            <div className="h-[170px] mt-1">
              <ResponsiveContainer>
                <BarChart data={hoods} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 10, fill: "#8A8285" }} tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 11) + "…" : v)} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8A8285" }} tickFormatter={(v) => `$${v}`} width={44} />
                  <Tooltip cursor={{ fill: "#fbf0f0" }} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 8px 24px rgba(60,20,25,.12)", fontSize: 12 }} formatter={(v, _n, p) => [`$${v}/sq ft · ${p.payload.dom} days on market · ${p.payload.n} listings`, p.payload.name]} labelFormatter={() => ""} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                    {hoods.map((h) => <Cell key={h.name} fill={h.demo && city === MARKET.demo.city ? "#1D1A1C" : "#E5322D"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="text-[11px] text-mute">
            Employers near {m.anchor} (CoStar tenancies): {m.employersNearAnchor.slice(0, 5).map((e) => `${e.name} (${e.employees.toLocaleString()})`).join(" · ")}
          </div>
        </div>
      </div>

      {tour && tour.matterportId && (
        <div className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-3 md:p-8 fadein" onClick={() => setTour(null)}>
          <div className="relative w-full max-w-[1100px] h-[80vh] rounded-3xl overflow-hidden bg-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <MatterportTour modelId={tour.matterportId} title={tour.title} className="absolute inset-0" />
            <div className="absolute top-3 left-3 right-3 flex items-center gap-2 pointer-events-none">
              <div className="px-3 py-1.5 rounded-full bg-white/95 shadow-card text-[12px] font-semibold truncate">{tour.title} · {price(tour)} · Matterport scan via CoStar</div>
              <button onClick={() => setTour(null)} className="pointer-events-auto ml-auto w-9 h-9 rounded-full bg-white/95 shadow-card flex items-center justify-center" aria-label="Close tour"><Icon name="x" className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-blush px-3.5 py-3">
      <div className="text-[11px] text-mute">{label}</div>
      <div className="text-[22px] font-bold tracking-tight leading-tight mt-0.5">{value}</div>
      <div className="text-[11px] text-[#5b5357] truncate">{sub}</div>
    </div>
  );
}
