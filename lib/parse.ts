/**
 * Rule-based request parser (offline fallback). Turns a rambling spoken
 * request into structured Criteria, merging with what we already know so
 * follow-ups like "cheaper" or "more artsy" refine instead of restart.
 */
import type { Criteria, ListingKind } from "./types";
import { listingsSync } from "./adapters";

export const emptyCriteria = (): Criteria => ({ vibes: [], neighborhoods: [] });

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const VIBE_WORDS: [RegExp, string][] = [
  [/\b(cozy|cosy|homey|homely|snug|warm)\b/, "cozy"],
  [/\b(arts?y|artistic|creative|arty|eclectic|bohemian|boho)\b/, "artsy"],
  [/\b(lots of light|natural light|bright|sunny|sunlit|light[- ]filled|airy|big windows)\b/, "bright"],
  [/\b(quiet|peaceful|calm|tranquil)\b/, "quiet"],
  [/\b(modern|contemporary|sleek)\b/, "modern"],
  [/\b(minimal|minimalist|clean lines)\b/, "minimalist"],
  [/\b(gothic|stone)\b/, "gothic"],
  [/\b(historic|old[- ]world|character|charming|classic)\b/, "historic"],
  [/\bfarmhouse\b/, "modern farmhouse"],
  [/\b(garden|yard|green|leafy)\b/, "garden"],
  [/\b(loft|industrial|exposed brick)\b/, "industrial"],
  [/\b(scandi|scandinavian|nordic)\b/, "scandinavian"],
  [/\bvictorian\b/, "victorian"],
  [/\bcraftsman|bungalow\b/, "craftsman"],
];

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Neighbourhood names come from the CoStar listings themselves (plus common short forms). */
let hoods: string[] | null = null;
const HOOD_ALIASES: [RegExp, string][] = [[/\b(the )?heights\b/, "Greater Heights"], [/\bmontrose\b/, "Montrose"], [/\b(galleria|uptown)\b/, "Uptown-Galleria District"], [/\bmidtown\b/, "Midtown"], [/\bdtla\b/, "Downtown LA"], [/\bhighland park\b/, "Highland Park"]];
function HOODS(): string[] {
  if (!hoods) hoods = [...new Set(listingsSync().map((l) => l.neighborhood).filter(Boolean))];
  return hoods;
}

function money(raw: string, unit?: string): number {
  let v = parseFloat(raw.replace(/,/g, ""));
  const u = (unit || "").toLowerCase();
  if (u.startsWith("k") || u.startsWith("thousand") || u.startsWith("grand")) v *= 1000;
  if (u.startsWith("m")) v *= 1_000_000;
  return v;
}

export function parseRequest(input: string, prev: Criteria = emptyCriteria()): Criteria {
  const t = " " + input.toLowerCase().replace(/[’']/g, "'") + " ";
  const c: Criteria = { ...prev, vibes: [...prev.vibes], neighborhoods: [...prev.neighborhoods] };

  // intent
  let intent: ListingKind | undefined;
  if (/\b(short stay|hotel|a few nights|weekend stay|airbnb|per night|nightly|place to stay)\b/.test(t)) intent = "stay";
  else if (/\b(land|lot|acre|acres|build my own)\b/.test(t)) intent = "land";
  else if (/\b(office|retail|storefront|commercial|studio space for my business)\b/.test(t)) intent = "commercial";
  else if (/\b(buy|purchase|own|mortgage|for sale)\b/.test(t)) intent = "buy";
  else if (/\b(rent|rental|lease|apartment|a month|per month|\/mo|monthly)\b/.test(t)) intent = "rent";
  if (intent) c.intent = intent;

  // bedrooms
  const b = t.match(/\b(\d|one|two|three|four|five|six)[- ]?(bed|beds|bedroom|bedrooms|br|bd)\b/);
  if (b) c.bedsMin = NUM[b[1]] ?? parseInt(b[1]);
  if (/\bstudio\b/.test(t)) c.bedsMin = 0;

  // budget
  const bud = t.match(/(?:under|below|max(?:imum)?|up to|less than|no more than|budget(?: of| is)?|around|about)\s*\$?\s*([\d.,]+)\s*(k|thousand|grand|m|million)?/);
  const plain = t.match(/\$\s*([\d.,]+)\s*(k|thousand|m|million)?/);
  const m = bud || plain;
  if (m) {
    const v = money(m[1], m[2]);
    if (v > 0) c.budgetMax = v;
    if (!c.intent && v > 50000) c.intent = "buy";
  }
  if (/\bcheaper|less expensive|lower (the )?price|more affordable\b/.test(t)) {
    c.sortCheaper = true;
    if (c.budgetMax) c.budgetMax = Math.round(c.budgetMax * 0.92);
  }

  // market
  if (/\b(los angeles|l\.a\.|la|dtla|hollywood|silver lake|santa monica)\b/.test(t)) c.city = "Los Angeles";
  else if (/\b(houston|heights|montrose|galleria|htx)\b/.test(t)) c.city = "Houston";

  // commute (to the market's downtown anchor)
  if (/\b(walk(able|ing)?( distance)?( to)? (work|the office|downtown|campus)|walk to (work|campus|class|the office)|walkable)\b/.test(t)) {
    c.walkable = true;
    c.maxMinutes = c.maxMinutes ?? 25;
  }
  if (/\b(near|close to|short commute to) (downtown|work|the office|dtla)\b/.test(t)) c.maxMinutes = c.maxMinutes ?? 20;
  if (/\b(closer to (downtown|campus|work)|closer)\b/.test(t)) {
    c.maxMinutes = Math.max(8, (c.maxMinutes ?? 25) - 8);
  }
  const mins = t.match(/(\d+)\s*min(ute)?s?/);
  if (mins) c.maxMinutes = parseInt(mins[1]);

  // pets
  if (/\b(dog|dogs|cat|cats|pet|pets|puppy|kitten)\b/.test(t)) c.pets = true;

  // vibes — newest first so refinements like "more artsy" take priority
  const found: string[] = [];
  for (const [re, v] of VIBE_WORDS) if (re.test(t)) found.push(v);
  if (found.length) {
    const replacing = /\b(more|instead|rather|actually)\b/.test(t);
    c.vibes = replacing ? [...found, ...c.vibes.filter((v) => !found.includes(v))] : [...new Set([...c.vibes, ...found])];
  }

  // timeline & who
  const mo = MONTHS.find((x) => t.includes(" " + x));
  if (mo) c.moveIn = mo[0].toUpperCase() + mo.slice(1);
  if (/\b(asap|right away|immediately|next week)\b/.test(t)) c.moveIn = "ASAP";
  if (/\b(job|new hire|starting work|postdoc|faculty|professor|hired|position)\b/.test(t)) c.who = "new hire";
  else if (/\b(student|grad school|phd|master'?s|undergrad)\b/.test(t)) c.who = "student";
  else if (/\b(kids|family|children|school district)\b/.test(t)) c.who = "family";

  for (const h of HOODS()) if (h.length > 3 && t.includes(h.toLowerCase())) c.neighborhoods = [...new Set([...c.neighborhoods, h])];
  for (const [re, h] of HOOD_ALIASES) if (re.test(t)) c.neighborhoods = [...new Set([...c.neighborhoods, h])];
  if (!c.intent && c.who === "new hire") c.intent = "rent";
  return c;
}

/** Quick-reply chips map onto the same parser. */
export const CHIPS = ["Cheaper", "Closer to downtown", "Pet friendly", "More light", "Quieter street"];
