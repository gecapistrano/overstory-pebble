/**
 * Listen -> understand -> search, powered by Gemini.
 * 1) Gemini reads the client's words (any language) and returns structured criteria,
 *    the detected language and a one-sentence spoken reply (English + the client's language).
 * 2) The search engine filters every listing by the hard constraints.
 * 3) Gemini re-ranks the shortlist by fit and vibe and writes a short "why it fits" per pick.
 */
import listings from "@/data/listings.json";
import type { Criteria, Listing } from "@/lib/types";
import { generateJSON, FAST_MODEL } from "@/lib/gemini";
import { handle, VIBES } from "@/lib/ai-server";
import { search } from "@/lib/search";
import { cityMarket } from "@/lib/market";
import { DEMO_CITY } from "@/lib/markets";
import { spokenRecap } from "@/lib/recap";
import { HttpError, criteria as checkCriteria, optArr, readBody, str } from "@/lib/validate";

const ALL = listings as unknown as Listing[];
const HOODS = [...new Set(ALL.map((l) => `${l.city}: ${l.neighborhood}`))];

export const dynamic = "force-dynamic";

interface ParseOut {
  language: string; // ISO 639-1, e.g. "en", "es", "vi"
  languageName: string; // English name, e.g. "Vietnamese"
  languageNative: string; // e.g. "Tiếng Việt"
  englishText: string;
  criteria: Criteria;
  switchQuestion?: { native: string; yes: string; no: string };
}
interface RankOut {
  picks: { id: string; why: string; whyNative?: string }[];
  replyEnglish: string;
  replyNative: string;
}

const PARSE_SYSTEM = `You are Pebble, a home-search concierge for a real-estate brokerage in Houston and Los Angeles (listings from CoStar).
Read what the client said (any language, may ramble) and extract search criteria.
Merge with the previous criteria: keep earlier constraints unless the client changes them.
Refinements like "cheaper", "closer", "more artsy" adjust the previous criteria instead of restarting.
Reply ONLY with JSON:
{"language": ISO-639-1 code of the client's message, "languageName": English name, "languageNative": the language's own name,
 "englishText": faithful English translation of the message,
 "switchQuestion": only when the language is not English: {"native": "It looks like you speak <language>. Switch Pebble to <language>?" written in that language, "yes": "yes" in that language, "no": "no" in that language},
 "criteria": {"intent": "rent"|"buy"|"land"|"stay"|"commercial", "bedsMin": number, "budgetMax": number (USD; monthly for rent, total for buy, nightly for stay),
   "city": "Houston"|"Los Angeles" (default Houston unless they mention LA), "maxMinutes": number (minutes to downtown / their office downtown), "walkable": boolean, "pets": boolean,
   "vibes": string[] ordered by importance, newest request first, chosen from ${JSON.stringify(VIBES)},
   "moveIn": month name or "ASAP", "who": "new hire"|"student"|"family"|"", "neighborhoods": string[] using exact names from this list when the client names an area (e.g. "the Heights" = "Greater Heights"): ${JSON.stringify(HOODS)}, "sortCheaper": boolean}}
Omit unknown fields. Never ask about or infer race, religion, national origin, sex, disability or familial status (fair housing).`;

const RANK_SYSTEM = `You are Pebble's matching step. Pick the best 3 listings for this client from the candidates.
Weigh hard needs first (budget, bedrooms, pets, commute, neighborhood), then the feeling they described (vibe tags, light, style).
For style, trust interiorFromScan (read from the home's Matterport 3D scan) over "style" (guessed from listing text); when you cite a style, name the room evidence (e.g. "Japandi kitchen: oak and linen").
Candidates are real CoStar listings; use the CoStar facts and market context (e.g. below-median rent, price cut, units available) when they help the client. Never invent facts: only call a house within budget / big enough / in their neighborhood / pet-friendly when its withinBudget / meetsBedrooms / inRequestedNeighborhood / pets field is true. If a pick misses a need, say so honestly (e.g. "1-bed, one short of what you asked, but…").
Reply ONLY with JSON: {"picks":[{"id":..., "why": "max 8 words, client-friendly, English", "whyNative": same in the client's language}],
"replyEnglish": ONE short spoken sentence that recaps what you heard and hands off to three houses (call them houses, not homes),
"replyNative": the same sentence in the client's language}.`;

const brief = (l: Listing, c: Criteria) => ({
  id: l.id, title: l.title, price: l.price, kind: l.kind, beds: l.beds, baths: l.baths, sqft: l.sqft, neighborhood: l.neighborhood, city: l.city,
  minutesToDowntown: l.minutesToCampus, commute: l.commuteMode, pets: l.petFriendly, available: l.availableFrom,
  style: l.style, ambience: l.ambience, materials: l.materials, colors: l.colors, light: l.light, description: l.description.slice(0, 300),
  highlights: l.highlights, has3DTour: Boolean(l.matterportId),
  // what the Matterport scan actually shows inside (verified style), vs. style guessed from listing text
  interiorFromScan: l.interior
    ? { styles: l.interior.styles, summary: l.interior.summary, feel: l.interior.feel, rooms: l.interior.rooms.map((r) => `${r.room}: ${r.styles[0]?.name ?? "?"}, ${r.note}`) }
    : null,
  withinBudget: c.budgetMax ? l.price <= c.budgetMax : null, meetsBedrooms: c.bedsMin !== undefined ? l.beds >= c.bedsMin : null, inRequestedNeighborhood: c.neighborhoods.length ? c.neighborhoods.includes(l.neighborhood) : null,
  costar: l.costar && { daysOnMarket: l.costar.dom, originalPrice: l.costar.originalPrice, pricePerSqft: l.costar.pricePerSqft, unitsAvailable: l.costar.planUnitsAvailable, manager: l.costar.manager },
});

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readBody(req);
    const imageTags = optArr(body.imageTags, "imageTags", { max: 20 }, (t, n) => str(t, n, { max: 40 }));
    const text = body.text === undefined || body.text === "" ? "" : str(body.text, "text", { max: 2000 });
    if (!text && !imageTags.length) throw new HttpError(400, "bad-input", "Send text, imageTags, or both");
    const prev = checkCriteria(body.prev, "prev") as unknown as Criteria;
    const parsed = await generateJSON<ParseOut>(
      PARSE_SYSTEM,
      [{ text: `Previous criteria: ${JSON.stringify(prev || {})}\nTags from a photo the client shared: ${JSON.stringify(imageTags || [])}\nClient said: """${text}"""` }],
      FAST_MODEL
    );
    const c = { ...(parsed.criteria || {}) } as Criteria;
    c.vibes = (c.vibes || []).filter((v) => VIBES.includes(v));
    c.neighborhoods = (c.neighborhoods || []).map((n) => n.replace(/^(Houston|Los Angeles):\s*/, ""));
    if (c.city !== "Los Angeles") c.city = c.city === "Houston" ? "Houston" : DEMO_CITY;
    const shortlist = search(ALL, c).slice(0, 10).map((s) => s.listing);
    const mk = cityMarket(c.city);
    const context = { city: c.city, medianRentByBeds: mk.apartments.medianAskingRent, apartmentAvailabilityPct: mk.apartments.availabilityPct, medianListPrice: mk.residential.medianListPrice, medianPricePerSqft: mk.residential.medianPricePerSqft };
    // The re-rank is a nice-to-have: if it fails or runs out of time, keep Gemini's understanding of the
    // client and show the search engine's own top 3, rather than throwing the whole answer away.
    const ranked = await generateJSON<RankOut>(
      RANK_SYSTEM,
      [{ text: `Client language: ${parsed.languageName}\nClient said (English): ${parsed.englishText}\nCriteria: ${JSON.stringify(c)}\nCoStar market context: ${JSON.stringify(context)}\nCandidates: ${JSON.stringify(shortlist.map((l) => brief(l, c)))}` }],
      FAST_MODEL
    ).catch((e): RankOut => {
      console.warn("[parse] re-rank skipped:", String(e).slice(0, 120));
      return { picks: [], replyEnglish: "", replyNative: "" };
    });
    const ids = new Set(shortlist.map((l) => l.id));
    const picks = (ranked.picks || []).filter((p) => ids.has(p.id)).slice(0, 3);
    for (const l of shortlist) if (picks.length < 3 && !picks.find((p) => p.id === l.id)) picks.push({ id: l.id, why: "" });
    // re-rank skipped: say the same on-device recap the app uses offline (the app shows English when native is empty)
    if (!ranked.replyEnglish) ranked.replyEnglish = spokenRecap(c, prev?.vibes?.length || prev?.budgetMax ? prev : undefined);
    return { switchQuestion: parsed.switchQuestion, language: parsed.language, languageName: parsed.languageName, languageNative: parsed.languageNative, englishText: parsed.englishText, criteria: c, picks, replyEnglish: ranked.replyEnglish, replyNative: ranked.replyNative };
  });
}
