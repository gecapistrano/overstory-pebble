/**
 * CoStar market intelligence: data/market.json (built by `npm run costar` from residential
 * listings, apartment listings, commercial sale comps, tenancies and companies) plus a scorer
 * that turns individual CoStar listings into "opportunities" with reasons an agent can check.
 * Used by the dashboard (deterministic fallback) and by /api/ai/market (Gemini context).
 */
import marketData from "@/data/market.json";
import type { Lead, Listing } from "./types";

export interface HoodStats {
  name: string;
  activeForSale: number;
  medianListPrice: number | null;
  medianPricePerSqft: number | null;
  medianDaysOnMarket: number | null;
  priceCutSharePct: number | null;
  medianPriceCutPct: number | null;
  soldLast12m: number;
  medianSoldPrice: number | null;
  medianLastAskOfSold: number | null;
  medianDaysToSell: number | null;
  leasedLast12m: number;
  medianLeasedRent: number | null;
  activeForRent: number;
  medianHomeRent: number | null;
}
export interface CityMarket {
  anchor: string;
  residential: Omit<HoodStats, "name">;
  neighborhoods: HoodStats[];
  apartments: {
    communities: number; totalUnits: number; unitsAvailable: number; availabilityPct: number | null;
    medianAskingRent: Record<string, number | null>; newCommunitiesSince2020: number; topManagers: { name: string; communities: number }[];
  };
  commercialSales24m: { count: number; confirmedVolume: number; medianPrice: number | null };
  employersNearAnchor: { name: string; employees: number }[];
  pebbleInventory: { listings: number; forSale: number; forRent: number; with3DTour: number };
}
export interface MarketData { generatedAt: string; source: string; demo: { city: string; neighborhood: string }; cities: Record<string, CityMarket> }

export const MARKET = marketData as unknown as MarketData;
export const cityMarket = (city: string) => MARKET.cities[city] || MARKET.cities[MARKET.demo.city];

export interface Opportunity {
  listing: Listing;
  score: number;
  reasons: string[]; // each cites a CoStar number
  matchedLeads: string[]; // lead ids whose budget/beds/intent fit
}

const bedKey = (b: number) => (b <= 0 ? "studio" : `${Math.min(b, 3)}bed`);
const k = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);

function fitsLead(l: Listing, lead: Lead) {
  const c = lead.criteria;
  if (lead.archived || lead.status === "closed") return false;
  const intent = c.intent || (l.kind === "buy" ? undefined : "rent");
  if (intent && intent !== l.kind) return false;
  if (c.budgetMax && l.price > c.budgetMax * 1.05) return false;
  if (c.bedsMin !== undefined && l.beds < c.bedsMin) return false;
  if (c.city && l.city && c.city !== l.city) return false;
  return Boolean(c.budgetMax || c.bedsMin !== undefined || c.intent);
}

/** Rank one market's CoStar listings by how worth an agent's call they are this week. */
export function opportunities(all: Listing[], city: string, leads: Lead[] = [], n = 8): Opportunity[] {
  const m = cityMarket(city);
  const hood = new Map(m.neighborhoods.map((h) => [h.name, h]));
  const out: Opportunity[] = [];
  for (const l of all) {
    if (l.city !== city || !l.costar) continue;
    const reasons: string[] = [];
    let s = 0;
    const c = l.costar;
    if (l.kind === "buy") {
      const h = hood.get(l.neighborhood);
      const ppsf = c.pricePerSqft;
      const ref = h?.medianPricePerSqft ?? m.residential.medianPricePerSqft;
      if (ppsf && ref && ppsf < ref * 0.9) { s += 2.2 * (1 - ppsf / ref) * 5; reasons.push(`$${ppsf}/sq ft vs ${h ? l.neighborhood : city} median $${ref}`); }
      if (c.originalPrice && c.originalPrice > l.price) { const cut = ((c.originalPrice - l.price) / c.originalPrice) * 100; s += Math.min(3, cut / 3); reasons.push(`price cut ${cut.toFixed(1)}% (from ${k(c.originalPrice)})`); }
      const domRef = h?.medianDaysOnMarket ?? m.residential.medianDaysOnMarket;
      if (c.dom != null && domRef && c.dom > domRef * 1.5) { s += 1.2; reasons.push(`${c.dom} days on market vs ${domRef}-day median: seller may negotiate`); }
      if (c.dom != null && c.dom <= 7) { s += 0.8; reasons.push(`new this week (${c.dom} days on market)`); }
    } else {
      const ref = m.apartments.medianAskingRent[bedKey(l.beds)];
      if (ref && l.price < ref * 0.92) { s += 2 * (1 - l.price / ref) * 6; reasons.push(`$${l.price.toLocaleString("en-US")}/mo vs ${city} ${l.beds ? l.beds + "-bed" : "studio"} median $${ref.toLocaleString("en-US")}`); }
      if (c.planUnitsAvailable && c.planUnitsAvailable >= 3) { s += 0.8; reasons.push(`${c.planUnitsAvailable} units of this plan open now`); }
      if (c.vacancyPercent != null && m.apartments.availabilityPct && c.vacancyPercent > m.apartments.availabilityPct * 1.3) { s += 0.6; reasons.push(`${c.vacancyPercent}% vacancy: room to ask for concessions`); }
    }
    if (l.neighborhood === MARKET.demo.neighborhood && city === MARKET.demo.city) s += 0.7;
    if (l.matterportId) s += 0.3;
    const matchedLeads = leads.filter((ld) => fitsLead(l, ld)).map((ld) => ld.id);
    if (matchedLeads.length) { s += 1.5 * Math.min(2, matchedLeads.length); reasons.push(`fits ${matchedLeads.length} open lead${matchedLeads.length > 1 ? "s" : ""} in the pipeline`); }
    if (reasons.length) out.push({ listing: l, score: s, reasons, matchedLeads });
  }
  out.sort((a, b) => b.score - a.score);
  // keep a mix: at least a third rentals and a third for sale when both exist
  const buys = out.filter((o) => o.listing.kind === "buy"), rents = out.filter((o) => o.listing.kind === "rent");
  const mixed: Opportunity[] = [];
  while (mixed.length < n && (buys.length || rents.length)) {
    const next = (mixed.length % 2 === 0 ? buys.shift() || rents.shift() : rents.shift() || buys.shift())!;
    mixed.push(next);
  }
  return mixed;
}

/** Deterministic recap used when Gemini is unavailable (and as Gemini's factual anchor). */
export function fallbackRecap(city: string, opps: Opportunity[]) {
  const m = cityMarket(city);
  const r = m.residential, a = m.apartments;
  const demoHood = m.neighborhoods.find((h) => h.name === MARKET.demo.neighborhood);
  const recap = [
    `${city}: ${r.activeForSale} active homes for sale at a ${k(r.medianListPrice || 0)} median ($${r.medianPricePerSqft}/sq ft), ${r.medianDaysOnMarket} median days on market; ${r.priceCutSharePct}% have cut their price.`,
    `Rentals: ${a.unitsAvailable.toLocaleString("en-US")} of ${a.totalUnits.toLocaleString("en-US")} apartment units are open (${a.availabilityPct}%), with 1-bed asking rents around $${(a.medianAskingRent["1bed"] || 0).toLocaleString("en-US")}.`,
    demoHood && city === MARKET.demo.city ? `${demoHood.name} is the tighter submarket: ${demoHood.medianDaysOnMarket} days on market and only ${demoHood.priceCutSharePct}% price cuts, at $${demoHood.medianPricePerSqft}/sq ft.` : "",
  ].filter(Boolean).join(" ");
  const insights = [
    { title: "Price cuts are common", detail: `${r.priceCutSharePct}% of ${city} sale listings cut their price (median cut ${r.medianPriceCutPct}%).`, metric: `${r.priceCutSharePct}%` },
    { title: "Renters have choice", detail: `${a.availabilityPct}% of apartment units are available across ${a.communities} communities.`, metric: `${a.availabilityPct}%` },
    { title: "Relocation demand nearby", detail: `Top employers near ${m.anchor}: ${m.employersNearAnchor.slice(0, 3).map((e) => e.name).join(", ")}.`, metric: `${m.employersNearAnchor.length} employers` },
  ];
  const suggestions = opps.slice(0, 5).map((o) => ({ listingId: o.listing.id, headline: o.listing.title, why: o.reasons.slice(0, 2).join("; "), action: o.matchedLeads.length ? "Send to matched leads with the 3D tour" : o.listing.kind === "buy" ? "Pitch to buyers; open with the price history" : "Offer to renters; ask about move-in specials" }));
  return { recap, insights, suggestions };
}
