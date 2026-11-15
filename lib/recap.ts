import type { Agent, Criteria, Listing, LeadRecap } from "./types";
import { marketOf, anchorShort } from "./markets";

export const AGENTS: Agent[] = [
  { id: "maya", name: "Maya Chen", title: "Licensed Real Estate Agent · Relocation", initials: "MC", color: "#E5322D" },
  { id: "daniel", name: "Daniel Okafor", title: "Licensed Real Estate Agent · Rentals", initials: "DO", color: "#3B6FD8" },
  { id: "priya", name: "Priya Raman", title: "Licensed Real Estate Agent · Downtown", initials: "PR", color: "#2E9E6A" },
  { id: "marcus", name: "Marcus Bell", title: "Broker associate · Homes & land", initials: "MB", color: "#C98A1B" },
  { id: "elena", name: "Elena Russo", title: "Licensed Real Estate Agent · Commercial", initials: "ER", color: "#8B5BD6" },
];
export const agentById = (id: string) => AGENTS.find((a) => a.id === id) || AGENTS[0];

export function price(l: Pick<Listing, "price" | "kind">) {
  const p = l.price;
  if (l.kind === "buy" || l.kind === "land") return p >= 1_000_000 ? `$${(p / 1_000_000).toFixed(2).replace(/0$/, "")}M` : `$${Math.round(p / 1000)}k`;
  if (l.kind === "stay") return `$${p}/night`;
  return `$${p.toLocaleString("en-US")}/mo`;
}
export const commute = (l: Listing) => `${l.minutesToCampus} min ${l.commuteMode === "walk" ? "walk" : "drive"} to ${anchorShort(l.city)}`;
export const bedsBaths = (l: Listing) =>
  l.kind === "land" ? `${(l.sqft / 43560).toFixed(1)} acres` : l.kind === "commercial" ? `${l.sqft.toLocaleString()} sq ft` : `${l.beds === 0 ? "Studio" : l.beds + " bd"} · ${l.baths} ba`;

/** The one vibe tag shown on a card: the listing tag that best matches what was asked. */
export function vibeTag(l: Listing, c?: Criteria): string {
  const tags = [l.style, ...l.ambience];
  const wanted = c?.vibes || [];
  for (const v of wanted) {
    if (v === "bright" && (l.light > 0.8 || tags.includes("bright"))) return "Full of light";
    if (tags.includes(v)) return cap(v);
  }
  return cap(l.style === "land" ? "open land" : l.style);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function phrase(c: Criteria): string {
  const parts: string[] = [];
  const v = c.vibes.slice(0, 2).map((x) => (x === "bright" ? "light-filled" : x)).join(", ");
  const beds = c.bedsMin === undefined ? "" : c.bedsMin === 0 ? "studio" : `${["", "one", "two", "three", "four", "five"][c.bedsMin] || c.bedsMin}-bed`;
  const kind = c.intent === "buy" ? "home to buy" : c.intent === "land" ? "piece of land" : c.intent === "stay" ? "short stay" : c.intent === "commercial" ? "commercial space" : "rental";
  parts.push([v, beds, kind].filter(Boolean).join(" "));
  if (c.budgetMax) parts.push(`under $${c.budgetMax >= 100000 ? Math.round(c.budgetMax / 1000) + "k" : c.budgetMax.toLocaleString("en-US")}`);
  if (c.neighborhoods?.length) parts.push(`in ${c.neighborhoods.slice(0, 2).join(" or ")}`);
  if (c.walkable) parts.push(`walkable to ${anchorShort(c.city)}`);
  else if (c.maxMinutes) parts.push(`within ${c.maxMinutes} min of ${anchorShort(c.city)}`);
  if (c.pets) parts.push("dog-friendly");
  if (c.moveIn) parts.push(`from ${c.moveIn}`);
  return parts.join(", ");
}

/** ONE short spoken sentence: recap + hand-off to the three cards. */
export function spokenRecap(c: Criteria, prev?: Criteria): string {
  if (prev && prev.vibes.length && c.vibes[0] !== prev.vibes[0]) {
    const lead = c.vibes.slice(0, 2).map((x) => (x === "bright" ? "full of light" : x)).join(" and ");
    return `More ${lead}, same budget${c.pets ? ", still dog-friendly" : ""} — here's your new top three.`;
  }
  if (prev && c.sortCheaper && !prev.sortCheaper) return `Cheaper options, everything else the same — here are three.`;
  if (prev && c.maxMinutes !== prev.maxMinutes) return `Closer to ${anchorShort(c.city)} — here are three houses with a shorter commute.`;
  return `Got it: a ${phrase(c)}. Here are my top three.`;
}

export function leadRecap(c: Criteria, transcript: string[]): LeadRecap {
  const city = marketOf(c.city).city;
  const who = c.who === "new hire" ? `Relocating new hire starting in ${city}` : c.who === "student" ? `Incoming student in ${city}` : c.who === "family" ? `Family relocating to ${city}` : `Home seeker in ${city}`;
  const want = phrase({ ...c, budgetMax: undefined, moveIn: undefined, pets: undefined });
  const mustHaves = [
    c.bedsMin !== undefined ? (c.bedsMin === 0 ? "Studio or larger" : `${c.bedsMin}+ bedrooms`) : "",
    c.pets ? "Dog-friendly" : "",
    c.walkable ? `Walk to ${anchorShort(c.city)} (≤ ${c.maxMinutes ?? 25} min)` : c.maxMinutes ? `≤ ${c.maxMinutes} min to ${anchorShort(c.city)}` : "",
    c.neighborhoods?.length ? c.neighborhoods.join(" / ") : "",
  ].filter(Boolean);
  const niceToHaves = c.vibes.map((v) => (v === "bright" ? "Lots of natural light" : cap(v)));
  return {
    summary: `${who}${c.moveIn ? ` in ${c.moveIn}` : ""}. Wants ${/^[aeiou]/i.test(want) ? "an" : "a"} ${want}${c.pets ? "; has a dog" : ""}.`,
    budget: c.budgetMax ? (c.intent === "buy" || c.intent === "land" ? `Up to $${Math.round(c.budgetMax / 1000)}k` : `Up to $${c.budgetMax.toLocaleString("en-US")}/mo`) : "Not stated",
    timeline: c.moveIn ? `Move-in ${c.moveIn} 2027` : "Flexible",
    mustHaves,
    niceToHaves,
  };
}

/** Commission estimate used for pipeline value (demo assumptions). */
export function dealValue(l: Listing) {
  if (l.kind === "rent" || l.kind === "commercial") return Math.round(l.price * 1); // one month's rent fee
  if (l.kind === "stay") return Math.round(l.price * 5 * 0.12);
  return Math.round(l.price * 0.025);
}
