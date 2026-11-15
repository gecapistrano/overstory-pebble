"use client";
/* Market section of the brokerage dashboard, both parts collapsible:
   - CostarMarket: the real CoStar numbers for the city (Homes.com listings & sales, Apartments.com rents,
     neighborhood stats, commercial sale comps, employers near the commute anchor, Pebble's CoStar inventory)
   - MarketRecap: Gemini's smart recap + insights + suggested listings (asked only when opened), with the map,
     the Vexcel aerial and the Matterport 3D tour of the picked listing. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aiMarket, type AIMarket } from "@/lib/ai";
import { listingsSync, getListing } from "@/lib/adapters";
import { cityMarket, fallbackRecap, opportunities } from "@/lib/market";
import { price, bedsBaths, commute } from "@/lib/recap";
import { useStore } from "@/lib/store";
import type { Listing } from "@/lib/types";
import MapView from "@/components/MapView";
import MatterportTour from "@/components/MatterportTour";
import CostarBadge from "@/components/CostarBadge";
import HomeArt from "@/components/HomeArt";
import AerialView from "@/components/AerialView";
import { Icon } from "@/components/ui";

const k = (n?: number | null) => (n == null ? "—" : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);
const num = (n?: number | null, suffix = "") => (n == null ? "—" : `${n.toLocaleString()}${suffix}`);

export function Collapsible({ title, sub, open, onToggle, children }: { title: string; sub: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-card shadow-card">
      <button onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-3 p-5 md:p-6 text-left">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl">{title}</h3>
          <p className="text-sm text-stone">{sub}</p>
        </div>
        <span className="shrink-0 text-sm text-sage">{open ? "Hide" : "Show"}</span>
        <Icon name="chev" className={`w-4 h-4 text-sage transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="px-5 md:px-6 pb-6 fadein">{children}</div>}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-canvas px-4 py-3">
      <div className="text-xs text-stone">{label}</div>
      <div className="font-display text-2xl leading-tight mt-1">{value}</div>
      <div className="text-xs text-stone truncate">{sub}</div>
    </div>
  );
}

export function CostarMarket({ city }: { city: string }) {
  const [open, setOpen] = useState(false);
  const m = cityMarket(city);
  const r = m.residential, a = m.apartments;
  const hoods = [...m.neighborhoods].filter((h) => h.activeForSale > 0).sort((x, y) => y.activeForSale - x.activeForSale);
  const chart = hoods.filter((h) => h.medianPricePerSqft).slice(0, 10).map((h) => ({ name: h.name.replace(" District", ""), v: h.medianPricePerSqft!, dom: h.medianDaysOnMarket, n: h.activeForSale }));
  return (
    <Collapsible title="CoStar market data" sub={`${city}: listings, sales, rents and neighborhoods from CoStar`} open={open} onToggle={() => setOpen(!open)}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <Stat label="Active homes for sale" value={num(r.activeForSale)} sub={`median ${k(r.medianListPrice)}`} />
        <Stat label="Median price / sq ft" value={r.medianPricePerSqft ? `$${r.medianPricePerSqft}` : "—"} sub={`${num(r.medianDaysOnMarket)} days on market`} />
        <Stat label="Listings with a price cut" value={num(r.priceCutSharePct, "%")} sub={`median cut ${num(r.medianPriceCutPct, "%")}`} />
        <Stat label="Sold, last 12 months" value={num(r.soldLast12m)} sub={r.medianSoldPrice ? `median ${k(r.medianSoldPrice)}` : `last ask ${k(r.medianLastAskOfSold)}`} />
        <Stat label="Apartment units open" value={num(a.availabilityPct, "%")} sub={`${num(a.unitsAvailable)} of ${num(a.totalUnits)} units`} />
        <Stat label="Homes leased, 12 months" value={num(r.leasedLast12m)} sub={`median ${r.medianLeasedRent ? `$${r.medianLeasedRent.toLocaleString()}` : "—"}/mo`} />
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-3 min-w-0">
          <h4 className="font-medium">Neighborhoods</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-stone text-xs"><tr className="text-left">{["Neighborhood", "For sale", "Median price", "$/sq ft", "Days on market", "Price cut", "Sold 12 mo", "Leased 12 mo"].map((h) => <th key={h} className="py-2 pr-3 font-normal">{h}</th>)}</tr></thead>
              <tbody>
                {hoods.slice(0, 14).map((h) => (
                  <tr key={h.name} className="border-t border-line">
                    <td className="py-2 pr-3">{h.name}</td>
                    <td className="pr-3">{h.activeForSale}</td>
                    <td className="pr-3">{k(h.medianListPrice)}</td>
                    <td className="pr-3">{h.medianPricePerSqft ? `$${h.medianPricePerSqft}` : "—"}</td>
                    <td className="pr-3">{num(h.medianDaysOnMarket)}</td>
                    <td className="pr-3">{num(h.priceCutSharePct, "%")}</td>
                    <td className="pr-3">{h.soldLast12m}</td>
                    <td className="pr-3">{h.leasedLast12m}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="xl:col-span-2 min-w-0 space-y-5">
          <div>
            <h4 className="font-medium">Median price per sq ft</h4>
            <div className="h-[200px] mt-1">
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 10, fill: "#66758C" }} tickFormatter={(v: string) => (v.length > 10 ? v.slice(0, 9) + "…" : v)} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#66758C" }} tickFormatter={(v) => `$${v}`} width={44} />
                  <Tooltip cursor={{ fill: "#F5F7FA" }} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 30px rgba(22,50,90,.12)", fontSize: 12 }} formatter={(v, _n, p) => [`$${v}/sq ft · ${p.payload.dom ?? "—"} days on market · ${p.payload.n} listings`, p.payload.name]} labelFormatter={() => ""} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false}>{chart.map((h) => <Cell key={h.name} fill="#3478F0" />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h4 className="font-medium">Apartment asking rents</h4>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {Object.entries(a.medianAskingRent).map(([bed, v]) => (
                <div key={bed} className="rounded-2xl bg-canvas px-3 py-2"><div className="text-xs text-stone">{bed === "studio" ? "Studio" : bed.replace("bed", " bed")}</div><div className="font-display text-lg">{v ? `$${v.toLocaleString()}` : "—"}</div></div>
              ))}
            </div>
            <p className="mt-2 text-xs text-stone">{a.communities} communities · {a.newCommunitiesSince2020} new since 2020 · top managers: {a.topManagers.slice(0, 3).map((x) => x.name).join(", ")}</p>
          </div>
          <div className="text-sm">
            <h4 className="font-medium">Around {m.anchor}</h4>
            <p className="mt-1 text-stone">Largest employers: {m.employersNearAnchor.slice(0, 5).map((e) => `${e.name} (${e.employees.toLocaleString()})`).join(" · ")}</p>
            <p className="mt-1 text-stone">Commercial sales, 24 months: {m.commercialSales24m.count} deals · {k(m.commercialSales24m.confirmedVolume)} confirmed volume</p>
            <p className="mt-1 text-stone">Our CoStar inventory: {m.pebbleInventory.listings} listings ({m.pebbleInventory.forSale} for sale, {m.pebbleInventory.forRent} for rent) · {m.pebbleInventory.with3DTour} with a 3D tour</p>
          </div>
        </div>
      </div>
    </Collapsible>
  );
}

export function MarketRecap({ city }: { city: string }) {
  const leads = useStore((s) => s.leads);
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState<(AIMarket & { byGemini: boolean }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [tour, setTour] = useState<Listing | null>(null);

  const opps = useMemo(() => opportunities(listingsSync(), city, leads, 8), [city, leads]);
  const fallback = useMemo(() => fallbackRecap(city, opps), [city, opps]);

  // ask Gemini only once the section is opened (and again when the city changes)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setAi(null);
    setSelected(undefined);
    aiMarket(city, leads).then((r) => {
      if (!alive) return;
      setAi(r && r.recap ? { ...r, byGemini: true } : null);
      setLoading(false);
    });
    return () => void (alive = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, open]);

  const view = ai || { ...fallback, byGemini: false };
  const suggested = (view.suggestions.length ? view.suggestions : fallback.suggestions)
    .map((s) => ({ ...s, listing: getListing(s.listingId) }))
    .filter((s): s is typeof s & { listing: Listing } => Boolean(s.listing));
  const pins = suggested.map((s) => s.listing);
  const sel = pins.find((l) => l.id === selected) || pins[0];

  return (
    <Collapsible title="Gemini market recap" sub={`What the ${city} market means for us this week, and which listings to push`} open={open} onToggle={() => setOpen(!open)}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 min-w-0">
          <div className="rounded-3xl bg-sage-soft p-4">
            <div className="text-xs text-sage-ink">{view.byGemini ? `Gemini${ai?.model ? ` · ${ai.model}` : ""}` : loading ? "Asking Gemini…" : "Pebble assistant"} · {city}</div>
            {loading && !ai ? (
              <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-3.5 rounded bg-sage/15 animate-pulse" style={{ width: `${95 - i * 15}%` }} />)}</div>
            ) : (
              <p className="mt-2 font-display text-lg leading-snug">{view.recap}</p>
            )}
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
            {view.insights.map((i) => (
              <div key={i.title} className="rounded-2xl bg-canvas p-3">
                <div className="font-display text-xl">{i.metric}</div>
                <div className="text-sm leading-tight mt-0.5">{i.title}</div>
                <div className="text-xs text-stone mt-1 leading-snug">{i.detail}</div>
              </div>
            ))}
          </div>
          <h4 className="font-medium mt-5 mb-2">Listings to push this week</h4>
          <div className="space-y-2">
            {suggested.map((s, i) => (
              <button key={s.listingId} onClick={() => setSelected(s.listingId)} className={`w-full text-left flex gap-3 p-2 rounded-2xl border transition ${sel?.id === s.listingId ? "border-sage bg-sage-soft/50" : "border-line hover:bg-canvas"}`}>
                <div className="relative w-16 h-14 rounded-xl overflow-hidden shrink-0"><HomeArt listing={s.listing} className="w-full h-full" /><span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-sage text-white text-[11px] grid place-items-center">{i + 1}</span></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2"><span className="font-display">{price(s.listing)}</span><span className="text-xs truncate">{s.headline}</span></div>
                  <div className="text-xs text-stone leading-snug mt-0.5">{s.why}</div>
                  <div className="text-xs text-clay mt-0.5">→ {s.action}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 min-w-0 flex flex-col gap-3">
          <div className="relative h-[340px] md:h-[400px] rounded-3xl overflow-hidden">
            <MapView key={city} city={city} listings={pins} selected={sel?.id} onSelect={setSelected} numbered aerial className="absolute inset-0" />
            <div className="absolute top-3 left-3 z-[400] px-3 py-1.5 rounded-full bg-card/95 shadow-card text-xs">Vexcel aerial · tap a pin</div>
          </div>
          {sel && (
            <div className="flex flex-col sm:flex-row gap-3 p-3 rounded-3xl bg-canvas">
              <div className="relative w-full sm:w-44 h-32 rounded-2xl overflow-hidden shrink-0"><HomeArt listing={sel} className="w-full h-full" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2"><span className="font-display text-xl">{price(sel)}</span><span className="text-xs text-stone">{bedsBaths(sel)} · {commute(sel)}</span></div>
                <div className="text-sm truncate">{sel.title}</div>
                <div className="text-xs text-stone truncate">{sel.address}</div>
                <CostarBadge l={sel} className="mt-2 bg-card" />
                {sel.matterportId && <button onClick={() => setTour(sel)} className="mt-2 h-9 px-4 rounded-full bg-clay text-white text-sm flex items-center gap-1.5"><Icon name="cube" className="w-4 h-4" />Open 3D tour</button>}
              </div>
            </div>
          )}
          {sel && <AerialView l={sel} compact className="rounded-3xl bg-card border border-line p-3" />}
        </div>
      </div>

      {tour && tour.matterportId && (
        <div className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-3 md:p-8 fadein" onClick={() => setTour(null)}>
          <div className="relative w-full max-w-[1100px] h-[80vh] rounded-3xl overflow-hidden bg-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <MatterportTour modelId={tour.matterportId} title={tour.title} className="absolute inset-0" />
            <div className="absolute top-3 left-3 right-3 flex items-center gap-2 pointer-events-none">
              <div className="px-3 py-1.5 rounded-full bg-card/95 shadow-card text-xs truncate">{tour.title} · {price(tour)}</div>
              <button onClick={() => setTour(null)} className="pointer-events-auto ml-auto w-9 h-9 rounded-full bg-card/95 shadow-card grid place-items-center" aria-label="Close tour"><Icon name="x" className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}
    </Collapsible>
  );
}

export default CostarMarket;
