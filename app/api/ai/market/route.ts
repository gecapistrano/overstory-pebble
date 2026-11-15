/**
 * Smart market recap for the brokerage dashboard, written by Gemini from layered CoStar data:
 * market.json (residential listings + sales, apartment rents/availability, commercial sale comps,
 * employers near the commute anchor) + the scored CoStar opportunities + the live lead pipeline.
 * Gemini may only suggest listings from the candidate list, and must cite the numbers given.
 */
import listings from "@/data/listings.json";
import type { Lead, Listing } from "@/lib/types";
import { generateJSON, FAST_MODEL } from "@/lib/gemini";
import { BUDGET, handle } from "@/lib/ai-server";
import { city as checkCity, obj, optArr, readBody } from "@/lib/validate";
import { MARKET, cityMarket, opportunities } from "@/lib/market";
import { hasVexcel, parcel } from "@/lib/vexcel";

export const dynamic = "force-dynamic";

interface Out {
  recap: string;
  insights: { title: string; detail: string; metric: string }[];
  suggestions: { listingId: string; headline: string; why: string; action: string }[];
}

const SYSTEM = `You are the market analyst for a residential real-estate brokerage. Data comes from CoStar (Homes.com MLS listings, Apartments.com rents, commercial sale comps, tenant employers) and Vexcel aerial imagery AI (roof material/condition, footprint, pool, tree cover per parcel).
When a candidate has Vexcel facts, use them where they matter (e.g. a roof showing heavy discoloration is a negotiation point or a repair question; a pool is a selling point).
Write for the brokerage owner. Use ONLY the numbers provided; cite them. Texas does not disclose sale prices, so never claim Houston sold prices.
Reply ONLY with JSON:
{"recap": 3 sentences max: what the market is doing and what it means for this brokerage this week,
 "insights": exactly 3 items [{"title": max 6 words, "detail": 1 sentence with a number, "metric": the headline number, short}],
 "suggestions": 4-5 items chosen ONLY from the candidate listings [{"listingId": exact id, "headline": max 8 words, "why": 1 sentence citing CoStar numbers, "action": what the agent should do, max 10 words}]}.
Never target or exclude people by race, religion, national origin, sex, disability or familial status.`;

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readBody(req, 2 * 2 ** 20); // the whole pipeline of leads rides along
    const city = checkCity(body.city) ?? MARKET.demo.city;
    const leads = optArr(body.leads, "leads", { max: 1000 }, (l, n) => obj(l, n)) as unknown as Lead[];
    const m = cityMarket(city);
    const opps = opportunities(listings as unknown as Listing[], city, leads, 10);
    // layer Vexcel parcel attributes onto the top candidates (cached on disk; skipped if Vexcel is slow or down)
    const aerial = hasVexcel()
      ? await Promise.all(opps.slice(0, 6).map((o) => Promise.race([parcel(o.listing.lat, o.listing.lng).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 6000))])))
      : [];
    const candidates = opps.map((o, i) => ({
      id: o.listing.id, title: o.listing.title, kind: o.listing.kind, price: o.listing.price, beds: o.listing.beds,
      neighborhood: o.listing.neighborhood, minutesToDowntown: o.listing.minutesToCampus, has3DTour: Boolean(o.listing.matterportId), costarSignals: o.reasons,
      vexcelAerial: aerial[i] ? { footprintSqft: aerial[i]!.footprintSqft, roof: [aerial[i]!.roofShape, aerial[i]!.roofMaterial].filter(Boolean).join(" ") || null, roofDiscolorationPct: aerial[i]!.roofDiscolorationPct, pool: aerial[i]!.pool, treeCoverPct: aerial[i]!.treeCoverPct, imageryDate: aerial[i]!.captured } : undefined,
    }));
    const pipeline = leads.filter((l) => !l.archived).map((l) => ({ status: l.status, budget: l.recap?.budget, summary: l.recap?.summary }));
    const out = await generateJSON<Out>(SYSTEM, [
      { text: `City: ${city} (commute anchor ${m.anchor}). Demo focus neighborhood: ${MARKET.demo.neighborhood}.\nCoStar market data: ${JSON.stringify(m)}\nOpen pipeline: ${JSON.stringify(pipeline)}\nCandidate listings: ${JSON.stringify(candidates)}` },
    ], FAST_MODEL);
    const ids = new Set(candidates.map((c) => c.id));
    const suggestions = (out.suggestions || []).filter((s) => ids.has(s.listingId)).slice(0, 5);
    return { recap: out.recap, insights: (out.insights || []).slice(0, 3), suggestions };
  }, BUDGET.long);
}
