/**
 * Brokerage book: the numbers behind the dashboard.
 *
 * Listings, prices, neighborhoods and market figures are real CoStar data (data/listings.json, data/market.json).
 * Sales, leads and customer activity are not available from CoStar, so they come from three layers that all have
 * the same shape and go through the same calculations:
 *   1. book  - 14 months of generated leads, deals and customer activity on the real CoStar listings
 *              (deterministic: the same history on every load)
 *   2. live  - a running layer that adds new requests, replies, views and the odd closed deal every 5 seconds
 *   3. app   - real leads, searches and listing views recorded by the homebuyer and agent apps
 * Every KPI, change, chart, agent row and customer figure is computed from these records, so they always agree.
 */
import listingsData from "@/data/listings.json";
import type { Lead, Listing, LeadEvent } from "./types";
import type { PebbleState } from "./store";
import { AGENTS, dealValue } from "./recap";
import { cityMarket } from "./market";

export const LISTINGS = listingsData as unknown as Listing[];
const BY_ID = new Map(LISTINGS.map((l) => [l.id, l]));
export const listingById = (id: string) => BY_ID.get(id);
export const CITIES = ["Houston", "Los Angeles"] as const;
export type City = (typeof CITIES)[number];

const MIN = 60_000, H = 60 * MIN, D = 24 * H;

/* ---------------- records ---------------- */

export interface Deal {
  id: string;
  source: "book" | "live" | "app";
  city: string;
  agentId: string;
  listingId: string;
  client: string;
  customerId: string;
  value: number; // brokerage fee in USD (rent: one month, sale: 2.5%, stay: 5 nights x 12%)
  createdAt: number;
  respondedAt?: number;
  verifiedAt?: number;
  touredAt?: number;
  quietAt?: number;
  nudgedAt?: number;
  appliedAt?: number;
  closedAt?: number;
  lostAt?: number;
  rescued: boolean; // came back after an Agentic Assistant follow-up
  events?: LeadEvent[]; // app leads carry their own event log
}
/** contact: may an agent / the brokerage reach them; owners: may owners of homes they view see their details (customer consent). */
export interface Customer { id: string; name: string; email: string; age?: number; location?: string; city: string; source: Deal["source"]; contact: boolean; owners: boolean }
export interface View { customerId: string; listingId: string; at: number; ms: number }
export interface Search { customerId: string; at: number; tags: string[]; neighborhoods: string[]; city: string }

interface Layer { deals: Deal[]; customers: Customer[]; views: View[]; searches: Search[] }

/* ---------------- deterministic helpers ---------------- */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
type R = () => number;
const pick = <T,>(r: R, a: readonly T[]) => a[Math.floor(r() * a.length)];
const weighted = <T,>(r: R, a: readonly (readonly [T, number])[]) => {
  let x = r() * a.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of a) if ((x -= w) <= 0) return v;
  return a[a.length - 1][0];
};
const normal = (r: R) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

const FIRST = ["Sarah", "Daniel", "Aisha", "Marco", "Emily", "Kenji", "Lucía", "Omar", "Grace", "Ravi", "Chloe", "Mateo", "Hannah", "Jamal", "Mei", "Lukas", "Priya", "Noah", "Zoe", "Tunde", "Elena", "Sam", "Isabel", "Ethan", "Nadia", "Leo", "Fatima", "Ben", "Ana", "Kwame", "Julia", "Arjun"];
const LAST = ["Kim", "Nguyen", "Garcia", "Patel", "Johnson", "Okafor", "Rossi", "Chen", "Williams", "Haddad", "Silva", "Brown", "Tanaka", "Martinez", "Mensah", "Fischer", "Lopez", "Ali", "Cohen", "Park", "Davis", "Moreno", "Singh", "Walker", "Costa", "Ibrahim", "Reyes", "Wright"];
const FROM_OUT = ["Austin, TX", "Dallas, TX", "Chicago, IL", "New York, NY", "San Francisco, CA", "Denver, CO", "Atlanta, GA", "Phoenix, AZ", "Seattle, WA", "San Diego, CA", "Miami, FL", "Madrid, Spain", "Mexico City, Mexico", "Seoul, South Korea", "Lagos, Nigeria", "Mumbai, India", "London, UK", "Toronto, Canada"];
const LOCAL: Record<string, string> = { Houston: "Houston, TX", "Los Angeles": "Los Angeles, CA" };

// agent mix per market and how they work (mean first-reply seconds, close-rate edge)
const TEAM: Record<string, readonly (readonly [string, number])[]> = {
  Houston: [["maya", 0.3], ["priya", 0.25], ["daniel", 0.25], ["marcus", 0.2]],
  "Los Angeles": [["elena", 0.55], ["priya", 0.45]],
};
const STYLE: Record<string, { resp: number; edge: number }> = {
  maya: { resp: 140, edge: 0.06 }, priya: { resp: 230, edge: 0.04 }, daniel: { resp: 320, edge: 0 }, marcus: { resp: 560, edge: 0.03 }, elena: { resp: 380, edge: -0.02 },
};
const VOLUME: Record<string, number> = { Houston: 165, "Los Angeles": 80 };
const SEASON = [0.82, 0.86, 0.95, 1, 1.06, 1.18, 1.26, 1.3, 1.08, 0.98, 0.92, 0.84];
const SPAN = 16; // months generated before the current one (the first 4 only warm up the pipeline)
const ADOPTED = 9; // month index when the brokerage switched to Pebble (about 7 months ago)

const cityListings = new Map<string, Listing[]>();
const inCity = (city: string) => {
  if (!cityListings.has(city)) cityListings.set(city, LISTINGS.filter((l) => (l.city || "Houston") === city && (l.kind === "rent" || l.kind === "buy")));
  return cityListings.get(city)!;
};

/** What a customer looking at this home would have asked for. */
function tagsFor(l: Listing, r: R): string[] {
  const t = new Set<string>();
  if (l.style) t.add(l.style.toLowerCase());
  for (const a of l.ambience.slice(0, 2)) if (r() < 0.7) t.add(a.toLowerCase());
  if (l.light > 0.7 && r() < 0.8) t.add("bright");
  if (l.petFriendly && r() < 0.55) t.add("pet friendly");
  if (l.minutesToCampus <= 15 && r() < 0.6) t.add("close to downtown");
  if (l.beds >= 3 && r() < 0.6) t.add("room for a family");
  if (l.kind === "buy" && r() < 0.25) t.add("yard");
  return [...t].slice(0, 4);
}

function person(r: R, city: string, kind: Listing["kind"], idPrefix: string, source: Deal["source"]): Customer {
  const first = pick(r, FIRST), last = pick(r, LAST);
  const age = Math.round(Math.max(21, Math.min(72, kind === "buy" ? 38 + normal(r) * 9 : 29 + normal(r) * 6)));
  return {
    id: `${idPrefix}-${Math.floor(r() * 1e9).toString(36)}`,
    name: `${first} ${last}`,
    email: `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[^a-z.]/g, "") + "@example.com",
    age,
    location: r() < 0.42 ? LOCAL[city] : pick(r, FROM_OUT),
    city,
    source,
    contact: r() < 0.82,
    owners: r() < 0.4,
  };
}

/* ---------------- layer 1: the book ---------------- */

function genMonth(city: string, y: number, m: number, i: number, out: Layer) {
  const r = rng(hash(`${city}:${y}:${m}`));
  const start = new Date(y, m, 1).getTime(), end = new Date(y, m + 1, 1).getTime();
  const volume = Math.round(VOLUME[city] * SEASON[m] * (0.7 + 0.022 * i));
  const pebble = i >= ADOPTED;
  const recent = i >= SPAN - 3; // customer activity is kept for the last few months
  const pool = inCity(city);
  for (let j = 0; j < volume; j++) {
    const listing = pick(r, pool);
    const agentId = weighted(r, TEAM[city]);
    const st = STYLE[agentId];
    const createdAt = start + r() * (end - start);
    const slow = pebble ? 1 + Math.max(0, SPAN - 4 - i) * 0.08 : 3.6 - i * 0.28;
    const respSec = Math.max(25, st.resp * slow * Math.exp(normal(r) * 0.55));
    const c = person(r, city, listing.kind, "bk", "book");
    const d: Deal = {
      id: `bk-${hash(`${city}${y}${m}${j}`).toString(36)}`, source: "book", city, agentId, listingId: listing.id, client: c.name, customerId: c.id,
      value: dealValue(listing), createdAt, respondedAt: createdAt + respSec * 1000, rescued: false,
    };
    progress(d, r, { fast: respSec < 300, edge: st.edge, nudgeP: pebble ? 0.86 : 0.22, buy: listing.kind === "buy", scale: 1 });
    out.deals.push(d);
    if (recent) {
      out.customers.push(c);
      const searchAt = createdAt - (2 + r() * 70) * H;
      out.searches.push({ customerId: c.id, at: searchAt, tags: tagsFor(listing, r), neighborhoods: [listing.neighborhood], city });
      const looks = 1 + Math.floor(r() * 3);
      for (let k = 0; k < looks; k++) out.views.push({ customerId: c.id, listingId: listing.id, at: searchAt + r() * (createdAt - searchAt + 2 * D), ms: (40 + r() * 380) * 1000 });
      const others = 2 + Math.floor(r() * 4);
      for (let k = 0; k < others; k++) {
        const o = pick(r, pool);
        out.views.push({ customerId: c.id, listingId: o.id, at: searchAt + r() * (createdAt - searchAt), ms: (8 + r() * 150) * 1000 });
      }
    }
  }
  if (!recent) return;
  // shoppers who browse but have not asked for an agent yet
  const browsers = Math.round(volume * 1.2);
  for (let j = 0; j < browsers; j++) {
    const first = pick(r, pool);
    const c = person(r, city, first.kind, "bk", "book");
    const at = start + r() * (end - start);
    out.customers.push(c);
    out.searches.push({ customerId: c.id, at, tags: tagsFor(first, r), neighborhoods: [first.neighborhood], city });
    const looks = 1 + Math.floor(r() * 5);
    for (let k = 0; k < looks; k++) {
      const l = k === 0 ? first : r() < 0.5 ? first : pick(r, pool);
      out.views.push({ customerId: c.id, listingId: l.id, at: at + k * (5 + r() * 600) * MIN / 10, ms: (6 + r() * 170) * 1000 });
    }
  }
}

/** Walks a lead through the pipeline. `scale` compresses time (1 = real time, live layer uses seconds). */
function progress(d: Deal, r: R, o: { fast: boolean; edge: number; nudgeP: number; buy: boolean; scale: number }) {
  const u = (ms: number) => ms * o.scale;
  let t = d.respondedAt!;
  if (r() > 0.6 + (o.fast ? 0.16 : 0) + o.edge) { d.lostAt = t + u((1 + r() * 48) * H); return; }
  d.verifiedAt = t = t + u((0.3 + r() * 6) * H);
  if (r() > 0.56 + o.edge) { d.lostAt = t + u((1 + r() * 4) * D); return; }
  d.touredAt = t = t + u((1 + r() * 4) * D);
  if (r() < 0.32) {
    d.quietAt = t = t + u((2 + r() * 2) * D);
    if (r() < o.nudgeP) {
      d.nudgedAt = t = t + u((2 + r() * 20) * H);
      if (r() < 0.42) d.rescued = true;
      else { d.lostAt = t + u(5 * D); return; }
    } else { d.lostAt = t + u(6 * D); return; }
  }
  if (r() > 0.55 + (o.fast ? 0.08 : 0)) { d.lostAt = t + u((1 + r() * 5) * D); return; }
  d.appliedAt = t = t + u((0.5 + r() * 3) * D);
  if (r() > (o.buy ? 0.64 : 0.78)) { d.lostAt = t + u((3 + r() * 10) * D); return; }
  d.closedAt = t + u((o.buy ? 18 + r() * 22 : 2 + r() * 7) * D);
}

let bookCache: { key: number; layer: Layer } | null = null;
function book(now: number): Layer {
  const n = new Date(now);
  const key = new Date(n.getFullYear(), n.getMonth(), 1).getTime();
  if (bookCache?.key === key) return bookCache.layer;
  const layer: Layer = { deals: [], customers: [], views: [], searches: [] };
  for (const city of CITIES) for (let i = 0; i <= SPAN; i++) {
    const d = new Date(n.getFullYear(), n.getMonth() - SPAN + i, 1);
    genMonth(city, d.getFullYear(), d.getMonth(), i, layer);
  }
  bookCache = { key, layer };
  return layer;
}

/* ---------------- layer 2: live activity ---------------- */

const LKEY = "pebble.live.v1";
interface Live extends Layer { day: string; last: number }
let liveMem: Live | null = null;
const today = (t: number) => new Date(t).toDateString();

function loadLive(now: number): Live {
  if (liveMem && liveMem.day === today(now)) return liveMem;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LKEY) : null;
    if (raw) {
      const s = JSON.parse(raw) as Live;
      if (s.day === today(now)) return (liveMem = s);
    }
  } catch {}
  return (liveMem = { day: today(now), last: now, deals: [], customers: [], views: [], searches: [] });
}
function saveLive(s: Live) {
  const cap = <T,>(a: T[], n: number) => (a.length > n ? a.slice(a.length - n) : a);
  s.deals = cap(s.deals, 160); s.customers = cap(s.customers, 400); s.views = cap(s.views, 1500); s.searches = cap(s.searches, 600);
  try { localStorage.setItem(LKEY, JSON.stringify(s)); } catch {}
}

/** Advances the live layer by one 5-second beat (catching up a few beats after a pause). */
export function tickLive(now: number) {
  const s = loadLive(now);
  const beats = Math.min(6, Math.floor((now - s.last) / 5000));
  if (beats < 1) return;
  const r = Math.random;
  const recentBook = book(now).customers.slice(-400);
  for (let b = 0; b < beats; b++) {
    const t = s.last + (b + 1) * 5000;
    const city = r() < 0.66 ? "Houston" : "Los Angeles";
    const pool = inCity(city);
    if (r() < 0.14) {
      // a new request that becomes a lead (mostly rentals, so live fees stay realistic)
      const rentals = pool.filter((l) => l.kind === "rent");
      const listing = r() < 0.75 && rentals.length ? pick(r, rentals) : pick(r, pool);
      const agentId = weighted(r, TEAM[city]);
      const c = person(r, city, listing.kind, "lv", "live");
      const respSec = 20 + r() * 130 * (STYLE[agentId].resp / 230);
      const d: Deal = { id: `lv-${Math.floor(r() * 1e9).toString(36)}`, source: "live", city, agentId, listingId: listing.id, client: c.name, customerId: c.id, value: dealValue(listing), createdAt: t, respondedAt: t + respSec * 1000, rescued: false };
      progress(d, r, { fast: respSec < 300, edge: STYLE[agentId].edge + 0.1, nudgeP: 0.9, buy: false, scale: 1 / 2400 }); // ~1 day of pipeline per 36 seconds
      s.deals.push(d);
      s.customers.push(c);
      s.searches.push({ customerId: c.id, at: t - 60_000, tags: tagsFor(listing, r), neighborhoods: [listing.neighborhood], city });
      s.views.push({ customerId: c.id, listingId: listing.id, at: t - 30_000, ms: (60 + r() * 300) * 1000 });
    }
    if (r() < 0.55) {
      // someone looking at a home right now
      const known = [...s.customers.filter((c) => c.city === city), ...recentBook.filter((c) => c.city === city)];
      const c = known.length && r() < 0.7 ? pick(r, known) : null;
      const who = c || person(r, city, "rent", "lv", "live");
      if (!c) { s.customers.push(who); s.searches.push({ customerId: who.id, at: t, tags: tagsFor(pick(r, pool), r), neighborhoods: [pick(r, pool).neighborhood], city }); }
      s.views.push({ customerId: who.id, listingId: pick(r, pool).id, at: t, ms: (8 + r() * 240) * 1000 });
    }
    if (r() < 0.25) {
      const l = pick(r, pool);
      const c = person(r, city, l.kind, "lv", "live");
      s.customers.push(c);
      s.searches.push({ customerId: c.id, at: t, tags: tagsFor(l, r), neighborhoods: [l.neighborhood], city });
    }
  }
  s.last += beats * 5000;
  saveLive(s);
}

/* ---------------- layer 3: real app data ---------------- */

function firstAt(l: Lead, test: (e: LeadEvent) => boolean) { return l.events.find(test)?.at; }
function appLayer(st: PebbleState): Layer {
  const deals: Deal[] = st.leads.map((l) => {
    const listing = listingById(l.chosenListingId);
    const reply = Math.min(...[l.messages.find((m) => m.from === "agent")?.at, firstAt(l, (e) => e.actor === "agent")].filter((x): x is number => typeof x === "number"));
    return {
      id: l.id, source: "app", city: listing?.city || "Houston", agentId: l.agentId, listingId: l.chosenListingId, client: l.clientName, customerId: l.customerId || `app-${l.id}`,
      value: l.dealValue, createdAt: l.createdAt, respondedAt: Number.isFinite(reply) ? reply : undefined,
      verifiedAt: firstAt(l, (e) => /verified/i.test(e.label)) ?? (l.status !== "new" ? l.createdAt + H : undefined),
      touredAt: firstAt(l, (e) => /tour booked/i.test(e.label)) ?? (["touring", "application", "closed"].includes(l.status) ? l.createdAt + D : undefined),
      appliedAt: firstAt(l, (e) => /application submitted/i.test(e.label)) ?? (["application", "closed"].includes(l.status) ? l.createdAt + 2 * D : undefined),
      closedAt: l.status === "closed" ? firstAt(l, (e) => /deal closed/i.test(e.label)) ?? l.lastClientActivity : undefined,
      lostAt: l.status === "cancelled" ? firstAt(l, (e) => /cancelled/i.test(e.label)) ?? l.lastClientActivity : undefined,
      nudgedAt: firstAt(l, (e) => /follow-up sent/i.test(e.label)),
      rescued: l.rescuedByNudge, events: l.events,
    };
  });
  const views = (st.views || []).map((v) => ({ ...v }));
  const searches: Search[] = (st.searches || []).map((s) => ({ customerId: s.customerId, at: s.at, tags: s.tags, neighborhoods: s.neighborhoods, city: s.city || "Houston" }));
  const ids = new Set([...views.map((v) => v.customerId), ...searches.map((s) => s.customerId), ...deals.map((d) => d.customerId)]);
  const customers: Customer[] = [...ids].map((id) => {
    const p = st.profiles?.[id];
    const lead = st.leads.find((l) => (l.customerId || `app-${l.id}`) === id);
    const city = searches.find((s) => s.customerId === id)?.city || listingById(views.find((v) => v.customerId === id)?.listingId || lead?.chosenListingId || "")?.city || "Houston";
    return { id, name: p?.name || lead?.clientName || "Guest shopper", email: p?.email || "", age: p?.age, location: p?.location, city, source: "app", contact: Boolean(p?.consent?.contact), owners: Boolean(p?.consent?.shareWithOwners) };
  });
  return { deals, customers, views, searches };
}

/* ---------------- calculations ---------------- */

export const fmtMoney = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : Math.abs(n) >= 10_000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n).toLocaleString()}`);
export const fmtDur = (ms?: number | null) => {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} sec`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h} hr ${mm} min` : `${h} hr`;
};
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const change = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);

export type Stage = "new" | "verified" | "touring" | "application" | "closed" | "lost" | "quiet";
export function stageAt(d: Deal, t: number): Stage {
  if (d.closedAt && d.closedAt <= t) return "closed";
  if (d.lostAt && d.lostAt <= t) return "lost";
  if (d.appliedAt && d.appliedAt <= t) return "application";
  if (d.quietAt && d.quietAt <= t && !(d.nudgedAt && d.rescued && d.nudgedAt <= t)) return "quiet";
  if (d.touredAt && d.touredAt <= t) return "touring";
  if (d.verifiedAt && d.verifiedAt <= t) return "verified";
  return "new";
}

export interface Feed { at: number; who: string; text: string; actor: "client" | "ai" | "agent" | "system"; city: string }
function dealEvents(d: Deal, now: number): Feed[] {
  const l = listingById(d.listingId);
  const title = l?.title || "a home";
  const agent = AGENTS.find((a) => a.id === d.agentId)?.name.split(" ")[0] || "The agent";
  if (d.events) return d.events.filter((e) => e.at <= now).map((e) => ({ at: e.at, who: d.client, text: e.label, actor: e.actor, city: d.city }));
  const out: Feed[] = [{ at: d.createdAt, who: d.client, text: `asked about ${title} in ${l?.neighborhood || d.city}`, actor: "client", city: d.city }];
  if (d.respondedAt) out.push({ at: d.respondedAt, who: d.client, text: `${agent} replied in ${fmtDur(d.respondedAt - d.createdAt)}`, actor: "agent", city: d.city });
  if (d.verifiedAt) out.push({ at: d.verifiedAt, who: d.client, text: `${agent} verified ${title}`, actor: "agent", city: d.city });
  if (d.touredAt) out.push({ at: d.touredAt, who: d.client, text: `toured ${title}`, actor: "client", city: d.city });
  if (d.quietAt) out.push({ at: d.quietAt, who: d.client, text: "went quiet", actor: "system", city: d.city });
  if (d.nudgedAt) out.push({ at: d.nudgedAt, who: d.client, text: "got a follow-up from the Agentic Assistant", actor: "ai", city: d.city });
  if (d.appliedAt) out.push({ at: d.appliedAt, who: d.client, text: l?.kind === "buy" ? `made an offer on ${title}` : `applied for ${title}`, actor: "client", city: d.city });
  if (d.closedAt) out.push({ at: d.closedAt, who: d.client, text: `closed on ${title} · ${fmtMoney(d.value)} fee${d.rescued ? " · saved by a follow-up" : ""}`, actor: "agent", city: d.city });
  if (d.lostAt) out.push({ at: d.lostAt, who: d.client, text: "dropped out", actor: "system", city: d.city });
  return out.filter((e) => e.at <= now);
}

export interface AgentRow {
  id: string; name: string; initials: string; color: string;
  leads: number; avgResponseMs: number | null; verifiedRate: number; closed: number; revenue: number; revenuePrev: number; saved: number; active: number; quiet: number; closeRate90: number;
}
export interface MonthPoint { key: string; label: string; revenue: number | null; deals: number | null; soFar?: number | null; forecast?: number | null; band?: [number, number] | null }
export interface TagCount { tag: string; count: number; share: number }
export interface AreaRow { name: string; views: number; searches: number; shoppers: number; avgMs: number | null; ppsf: number | null; dom: number | null; priceCut: number | null; active: number | null }
export interface Shopper {
  id: string; name: string; email: string; contact: boolean; owners: boolean; age?: number; location?: string; score: number; reasons: string[]; homes: { id: string; title: string; ms: number; looks: number }[]; lastSeen: number; stage: Stage | "browsing"; tags: string[]; source: Deal["source"];
}
export interface PropertyStats {
  id: string; title: string; neighborhood: string; price: string; views: number; viewers: number; avgMs: number | null; totalMs: number;
  tags: TagCount[]; avgAge: number | null; ages: { band: string; count: number }[]; from: { name: string; count: number }[]; interested: Shopper[]; interestedHidden: number;
}

export interface Snapshot {
  city: string; now: number; monthLabel: string; prevLabel: string; dayOfMonth: number;
  sales: {
    revenue: number; revenuePrev: number; deals: number; dealsPrev: number; responseMs: number | null; responsePrevMs: number | null;
    saved: number; savedPrev: number; savedValue: number; pace: number; monthTotalPrev: number;
    months: MonthPoint[]; forecastMethod: string;
    agents: AgentRow[];
    feed: Feed[];
  };
  customers: {
    shoppers: number; shoppersPrev: number; searches: number; searchesPrev: number; avgViewMs: number | null; avgViewPrevMs: number | null; avgAge: number | null; highIntent: number;
    tags: TagCount[]; areas: AreaRow[]; ages: { band: string; count: number }[]; from: { name: string; count: number }[];
    hot: Shopper[]; properties: PropertyStats[]; justNow: { at: number; who: string; title: string; ms: number }[];
  };
  signals: Signals;
}

/** Raw numbers the strategy assistant reasons over. Every suggestion must cite these. */
export interface Signals {
  city: string; month: string;
  revenue: number; revenuePrev: number; pace: number; forecastNext: number[]; deals: number; dealsPrev: number;
  responseMin: number | null; responsePrevMin: number | null; saved: number; savedValue: number;
  fastCloseRate: number; fastN: number; slowCloseRate: number; slowN: number;
  slowest: { name: string; responseMin: number; leads: number } | null; fastest: { name: string; responseMin: number; leads: number } | null;
  slowLeadsPerMonth: number; avgFee: number;
  quietNow: number; quietValue: number; quietNames: string[]; rescueRate: number; rescueN: number; unnudgedCloseRate: number;
  topTags: TagCount[]; topArea: AreaRow | null; topAreaHot: number; hotCloseRate: number;
  market: { priceCutSharePct: number | null; medianDaysOnMarket: number | null; medianListPrice: number | null; aptAvailabilityPct: number | null; rent1bed: number | null; activeForSale: number | null };
}

const AGE_BANDS: [string, number, number][] = [["18–24", 18, 24], ["25–34", 25, 34], ["35–44", 35, 44], ["45–54", 45, 54], ["55+", 55, 200]];
const ageBands = (ages: number[]) => AGE_BANDS.map(([band, a, b]) => ({ band, count: ages.filter((x) => x >= a && x <= b).length }));
function countTags(searches: Search[]): TagCount[] {
  const m = new Map<string, number>();
  for (const s of searches) for (const t of s.tags) m.set(t, (m.get(t) || 0) + 1);
  const total = searches.length || 1;
  return [...m].map(([tag, count]) => ({ tag, count, share: Math.round((count / total) * 100) })).sort((a, b) => b.count - a.count);
}
const topN = (items: (string | undefined)[], n: number) => {
  const m = new Map<string, number>();
  for (const x of items) if (x) m.set(x, (m.get(x) || 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n);
};

function linear(ys: number[]) {
  const n = ys.length, xs = ys.map((_, i) => i);
  const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / (xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1);
  const at = (x: number) => my + slope * (x - mx);
  const sd = Math.sqrt(ys.reduce((a, y, i) => a + (y - at(i)) ** 2, 0) / Math.max(1, n - 2));
  return { at, sd, slope };
}

export function snapshot(st: PebbleState, city: string, now: number): Snapshot {
  const b = book(now), lv = loadLive(now), app = appLayer(st);
  const all: Layer = {
    deals: [...b.deals, ...lv.deals, ...app.deals].filter((d) => d.city === city && d.createdAt <= now),
    customers: [...b.customers, ...lv.customers, ...app.customers].filter((c) => c.city === city),
    views: [...b.views, ...lv.views, ...app.views].filter((v) => v.at <= now && (listingById(v.listingId)?.city || "Houston") === city),
    searches: [...b.searches, ...lv.searches, ...app.searches].filter((s) => s.at <= now && s.city === city),
  };
  const n = new Date(now);
  const mStart = new Date(n.getFullYear(), n.getMonth(), 1).getTime();
  const mEnd = new Date(n.getFullYear(), n.getMonth() + 1, 1).getTime();
  const pStart = new Date(n.getFullYear(), n.getMonth() - 1, 1).getTime();
  const pSame = Math.min(mStart, pStart + (now - mStart)); // same point in last month
  const label = (t: number, o: Intl.DateTimeFormatOptions = { month: "short" }) => new Date(t).toLocaleDateString("en-US", o);

  const closed = (a: number, z: number) => all.deals.filter((d) => d.closedAt && d.closedAt >= a && d.closedAt < z && d.closedAt <= now);
  const replied = (a: number, z: number) => all.deals.filter((d) => d.respondedAt && d.respondedAt >= a && d.respondedAt < z && d.respondedAt <= now);
  const sum = (ds: Deal[]) => ds.reduce((s, d) => s + d.value, 0);
  const cur = closed(mStart, now + 1), prev = closed(pStart, pSame);
  const respMs = mean(replied(mStart, now + 1).map((d) => d.respondedAt! - d.createdAt));
  const respPrevMs = mean(replied(pStart, pSame).map((d) => d.respondedAt! - d.createdAt));

  // months: 12 full months + this month so far + 3-month forecast
  const months: MonthPoint[] = [];
  const full: number[] = [];
  for (let k = -12; k <= -1; k++) {
    const a = new Date(n.getFullYear(), n.getMonth() + k, 1).getTime(), z = new Date(n.getFullYear(), n.getMonth() + k + 1, 1).getTime();
    const ds = closed(a, z);
    full.push(sum(ds));
    months.push({ key: `m${k}`, label: label(a), revenue: sum(ds), deals: ds.length });
  }
  const fit = linear(full);
  const revenue = sum(cur);
  // "on pace for": fees closed so far + deals already at application/offer, weighted by how often that stage closes
  const appliedSettled = all.deals.filter((d) => d.appliedAt && d.appliedAt < now - 45 * D && ["closed", "lost"].includes(stageAt(d, now)));
  const appCloseRate = appliedSettled.length ? appliedSettled.filter((d) => stageAt(d, now) === "closed").length / appliedSettled.length : 0.7;
  const inApplication = all.deals.filter((d) => stageAt(d, now) === "application");
  const share = Math.max(0, Math.min(1, (mEnd - now) / (30 * D))); // part of the open pipeline that can still close this month
  const pace = Math.round(revenue + sum(inApplication) * appCloseRate * share);
  const z80 = 1.28;
  months[months.length - 1].forecast = months[months.length - 1].revenue; // the dashed line starts at the last full month
  months.push({ key: "m0", label: label(mStart), revenue: null, deals: cur.length, soFar: revenue, forecast: pace, band: [Math.max(0, pace - z80 * fit.sd), pace + z80 * fit.sd] });
  const forecastNext: number[] = [];
  for (let k = 1; k <= 3; k++) {
    const v = Math.max(0, Math.round(fit.at(11 + k + 1) + (pace - fit.at(12)) * 0.5 ** k)); // trend, nudged by this month's pace
    forecastNext.push(v);
    months.push({ key: `f${k}`, label: label(new Date(n.getFullYear(), n.getMonth() + k, 1).getTime()), revenue: null, deals: null, forecast: v, band: [Math.max(0, v - z80 * fit.sd * Math.sqrt(1 + k / 6)), v + z80 * fit.sd * Math.sqrt(1 + k / 6)] });
  }

  // agents
  const d90 = now - 90 * D;
  const agentIds = [...new Set(all.deals.map((d) => d.agentId))];
  const agents: AgentRow[] = agentIds.map((id) => {
    const a = AGENTS.find((x) => x.id === id)!;
    const mine = all.deals.filter((d) => d.agentId === id);
    const created = mine.filter((d) => d.createdAt >= mStart);
    const responded = mine.filter((d) => d.respondedAt && d.respondedAt >= mStart && d.respondedAt <= now);
    const c = mine.filter((d) => d.closedAt && d.closedAt >= mStart && d.closedAt <= now);
    const cp = mine.filter((d) => d.closedAt && d.closedAt >= pStart && d.closedAt < pSame);
    const done90 = mine.filter((d) => d.createdAt >= d90 - 60 * D && d.createdAt < d90 + 30 * D);
    const settled = done90.filter((d) => ["closed", "lost"].includes(stageAt(d, now)));
    return {
      id, name: a.name, initials: a.initials, color: a.color,
      leads: created.length,
      avgResponseMs: mean(responded.map((d) => d.respondedAt! - d.createdAt)),
      verifiedRate: pct(created.filter((d) => d.verifiedAt && d.verifiedAt <= now).length, created.filter((d) => stageAt(d, now) !== "new").length || created.length),
      closed: c.length, revenue: sum(c), revenuePrev: sum(cp), saved: c.filter((d) => d.rescued).length,
      active: mine.filter((d) => ["new", "verified", "touring", "application"].includes(stageAt(d, now))).length,
      quiet: mine.filter((d) => stageAt(d, now) === "quiet").length,
      closeRate90: pct(settled.filter((d) => stageAt(d, now) === "closed").length, settled.length),
    };
  }).sort((x, y) => y.revenue - x.revenue);

  const latest = (d: Deal) => Math.max(...[d.createdAt, d.respondedAt, d.verifiedAt, d.touredAt, d.quietAt, d.nudgedAt, d.appliedAt, d.closedAt, d.lostAt].filter((t): t is number => typeof t === "number" && t <= now));
  const feed = all.deals.filter((d) => d.source !== "book" || now - latest(d) < 5 * D)
    .flatMap((d) => dealEvents(d, now)).sort((x, y) => y.at - x.at).slice(0, 14);

  // ---------- customers (last 30 days vs the 30 before) ----------
  const c30 = now - 30 * D, c60 = now - 60 * D;
  const views30 = all.views.filter((v) => v.at >= c30), viewsPrev = all.views.filter((v) => v.at >= c60 && v.at < c30);
  const searches30 = all.searches.filter((s) => s.at >= c30), searchesPrev = all.searches.filter((s) => s.at >= c60 && s.at < c30);
  const active30 = new Set([...views30.map((v) => v.customerId), ...searches30.map((s) => s.customerId)]);
  const activePrev = new Set([...viewsPrev.map((v) => v.customerId), ...searchesPrev.map((s) => s.customerId)]);
  const custById = new Map(all.customers.map((c) => [c.id, c]));
  const people = [...active30].map((id) => custById.get(id)).filter((c): c is Customer => Boolean(c));
  const knownAges = people.map((c) => c.age).filter((x): x is number => typeof x === "number");
  const dealByCustomer = new Map(all.deals.map((d) => [d.customerId, d]));

  const viewsBy = new Map<string, View[]>();
  for (const v of views30) (viewsBy.get(v.customerId) || viewsBy.set(v.customerId, []).get(v.customerId)!).push(v);
  const searchesBy = new Map<string, Search[]>();
  for (const s of searches30) (searchesBy.get(s.customerId) || searchesBy.set(s.customerId, []).get(s.customerId)!).push(s);

  const shopperOf = (c: Customer): Shopper => {
    const vs = viewsBy.get(c.id) || [], ss = searchesBy.get(c.id) || [];
    const homes = new Map<string, { ms: number; looks: number }>();
    for (const v of vs) { const h = homes.get(v.listingId) || { ms: 0, looks: 0 }; h.ms += v.ms; h.looks++; homes.set(v.listingId, h); }
    const list = [...homes].map(([id, h]) => ({ id, title: listingById(id)?.title || id, ...h })).sort((a, b) => b.ms - a.ms);
    const totalMin = vs.reduce((s, v) => s + v.ms, 0) / MIN;
    const repeat = Math.max(0, ...list.map((h) => h.looks - 1));
    const lastSeen = Math.max(0, ...vs.map((v) => v.at), ...ss.map((s) => s.at));
    const deal = dealByCustomer.get(c.id);
    const stage = deal ? stageAt(deal, now) : "browsing";
    let score = Math.min(30, totalMin * 4) + Math.min(24, repeat * 12) + Math.min(12, ss.length * 4) + (now - lastSeen < 2 * D ? 15 : now - lastSeen < 7 * D ? 8 : 0);
    score += stage === "new" ? 10 : stage === "verified" ? 18 : stage === "touring" ? 25 : stage === "application" ? 30 : stage === "quiet" ? 5 : stage === "lost" ? -25 : 0;
    const reasons = [
      list[0] && `${fmtDur(list[0].ms)} on ${list[0].title}`,
      repeat > 0 && `came back ${repeat + 1}× to the same home`,
      ss.length > 1 && `${ss.length} searches`,
      stage !== "browsing" && stage !== "lost" && `lead: ${stage}`,
    ].filter(Boolean) as string[];
    return { id: c.id, name: c.name, email: c.contact ? c.email : "", contact: c.contact, owners: c.owners, age: c.age, location: c.location, score: Math.max(0, Math.min(99, Math.round(score))), reasons, homes: list.slice(0, 4), lastSeen, stage, tags: [...new Set(ss.flatMap((s) => s.tags))].slice(0, 4), source: c.source };
  };
  const shoppers = people.map(shopperOf);
  const hotAll = shoppers.filter((s) => s.score >= 60 && s.stage !== "closed").sort((a, b) => b.score - a.score || b.lastSeen - a.lastSeen);

  const tags = countTags(searches30).slice(0, 10);
  const m = cityMarket(city);
  const hood = new Map(m.neighborhoods.map((h) => [h.name, h]));
  const areaMap = new Map<string, { views: number; searches: number; who: Set<string>; ms: number[] }>();
  const area = (name: string) => areaMap.get(name) || areaMap.set(name, { views: 0, searches: 0, who: new Set(), ms: [] }).get(name)!;
  for (const v of views30) { const l = listingById(v.listingId); if (!l) continue; const a = area(l.neighborhood); a.views++; a.who.add(v.customerId); a.ms.push(v.ms); }
  for (const s of searches30) for (const h of s.neighborhoods) { const a = area(h); a.searches++; a.who.add(s.customerId); }
  const areas: AreaRow[] = [...areaMap].map(([name, a]) => {
    const h = hood.get(name);
    return { name, views: a.views, searches: a.searches, shoppers: a.who.size, avgMs: mean(a.ms), ppsf: h?.medianPricePerSqft ?? null, dom: h?.medianDaysOnMarket ?? null, priceCut: h?.priceCutSharePct ?? null, active: h?.activeForSale ?? null };
  }).sort((x, y) => y.shoppers - x.shoppers).slice(0, 10);

  // properties (owner view)
  const propMap = new Map<string, View[]>();
  for (const v of views30) (propMap.get(v.listingId) || propMap.set(v.listingId, []).get(v.listingId)!).push(v);
  const shopperById = new Map(shoppers.map((s) => [s.id, s]));
  const properties: PropertyStats[] = [...propMap].sort((x, y) => y[1].length - x[1].length).slice(0, 12).map(([id, vs]) => {
    const l = listingById(id)!;
    const who = [...new Set(vs.map((v) => v.customerId))];
    const viewers = who.map((w) => custById.get(w)).filter((c): c is Customer => Boolean(c));
    const ages = viewers.map((c) => c.age).filter((x): x is number => typeof x === "number");
    return {
      id, title: l.title, neighborhood: l.neighborhood, price: l.kind === "rent" ? `$${l.price.toLocaleString()}/mo` : fmtMoney(l.price),
      views: vs.length, viewers: who.length, avgMs: mean(vs.map((v) => v.ms)), totalMs: vs.reduce((s, v) => s + v.ms, 0),
      tags: countTags(who.flatMap((w) => searchesBy.get(w) || [])).slice(0, 6),
      avgAge: ages.length ? Math.round(mean(ages)!) : null, ages: ageBands(ages),
      from: topN(viewers.map((c) => c.location), 4),
      // owners only see shoppers who agreed to share their details with owners
      interested: who.map((w) => shopperById.get(w)).filter((s): s is Shopper => Boolean(s && s.owners && s.score >= 50 && s.stage !== "closed")).sort((a, b) => b.score - a.score).slice(0, 5),
      interestedHidden: who.map((w) => shopperById.get(w)).filter((s) => s && !s.owners && s.score >= 50 && s.stage !== "closed").length,
    };
  });

  const justNow = [...all.views].sort((a, b) => b.at - a.at).slice(0, 6).map((v) => ({ at: v.at, who: custById.get(v.customerId)?.name || "A shopper", title: listingById(v.listingId)?.title || "a home", ms: v.ms }));

  // ---------- signals for the strategy assistant ----------
  const settled = all.deals.filter((d) => d.createdAt >= now - 150 * D && d.createdAt < now - 30 * D && d.respondedAt && ["closed", "lost"].includes(stageAt(d, now)));
  const fast = settled.filter((d) => d.respondedAt! - d.createdAt < 5 * MIN), slow = settled.filter((d) => d.respondedAt! - d.createdAt >= 5 * MIN);
  const rate = (ds: Deal[]) => pct(ds.filter((d) => stageAt(d, now) === "closed").length, ds.length);
  const nudged = settled.filter((d) => d.quietAt && d.nudgedAt), unnudged = settled.filter((d) => d.quietAt && !d.nudgedAt);
  const withResp = agents.filter((a) => a.avgResponseMs != null && a.leads >= 3);
  const slowest = withResp.length ? withResp.reduce((a, x) => (x.avgResponseMs! > a.avgResponseMs! ? x : a)) : null;
  const fastest = withResp.length ? withResp.reduce((a, x) => (x.avgResponseMs! < a.avgResponseMs! ? x : a)) : null;
  const quiet = all.deals.filter((d) => stageAt(d, now) === "quiet");
  const closed90 = all.deals.filter((d) => d.closedAt && d.closedAt >= d90 && d.closedAt <= now);
  const topArea = areas[0] || null;
  const hotSettled = settled.length ? rate(settled.filter((d) => d.touredAt)) : 0;
  const r = m.residential, apt = m.apartments;

  const signals: Signals = {
    city, month: label(mStart, { month: "long", year: "numeric" }),
    revenue, revenuePrev: sum(prev), pace, forecastNext, deals: cur.length, dealsPrev: prev.length,
    responseMin: respMs == null ? null : +(respMs / MIN).toFixed(1), responsePrevMin: respPrevMs == null ? null : +(respPrevMs / MIN).toFixed(1),
    saved: cur.filter((d) => d.rescued).length, savedValue: sum(cur.filter((d) => d.rescued)),
    fastCloseRate: rate(fast), fastN: fast.length, slowCloseRate: rate(slow), slowN: slow.length,
    slowest: slowest ? { name: slowest.name, responseMin: +(slowest.avgResponseMs! / MIN).toFixed(1), leads: slowest.leads } : null,
    fastest: fastest ? { name: fastest.name, responseMin: +(fastest.avgResponseMs! / MIN).toFixed(1), leads: fastest.leads } : null,
    slowLeadsPerMonth: Math.round(slow.length / 4),
    avgFee: Math.round(mean(closed90.map((d) => d.value)) || 0),
    quietNow: quiet.length, quietValue: sum(quiet), quietNames: quiet.slice(0, 4).map((d) => d.client),
    rescueRate: rate(nudged), rescueN: nudged.length, unnudgedCloseRate: rate(unnudged),
    topTags: tags.slice(0, 5), topArea, topAreaHot: topArea ? hotAll.filter((s) => s.homes.some((h) => listingById(h.id)?.neighborhood === topArea.name)).length : 0,
    hotCloseRate: hotSettled,
    market: { priceCutSharePct: r.priceCutSharePct, medianDaysOnMarket: r.medianDaysOnMarket, medianListPrice: r.medianListPrice, aptAvailabilityPct: apt.availabilityPct, rent1bed: apt.medianAskingRent["1bed"] ?? null, activeForSale: r.activeForSale },
  };

  return {
    city, now, monthLabel: label(mStart, { month: "long" }), prevLabel: label(pStart, { month: "short" }), dayOfMonth: n.getDate(),
    sales: {
      revenue, revenuePrev: sum(prev), deals: cur.length, dealsPrev: prev.length, responseMs: respMs, responsePrevMs: respPrevMs,
      saved: signals.saved, savedPrev: prev.filter((d) => d.rescued).length, savedValue: signals.savedValue, pace, monthTotalPrev: full[full.length - 1],
      months, forecastMethod: `This month: fees closed so far plus the ${inApplication.length} deals at application or offer, weighted by how often that stage closes (${Math.round(appCloseRate * 100)}%). Next months: a straight-line trend through the last 12 full months, nudged by this month. The shaded band is the range 8 in 10 months have fallen in around that trend.`,
      agents, feed,
    },
    customers: {
      shoppers: active30.size, shoppersPrev: activePrev.size, searches: searches30.length, searchesPrev: searchesPrev.length,
      avgViewMs: mean(views30.map((v) => v.ms)), avgViewPrevMs: mean(viewsPrev.map((v) => v.ms)),
      avgAge: knownAges.length ? Math.round(mean(knownAges)!) : null, highIntent: hotAll.length,
      tags, areas, ages: ageBands(knownAges), from: topN(people.map((c) => c.location), 6),
      hot: hotAll.slice(0, 12), properties, justNow,
    },
    signals,
  };
}

/* ---------------- strategy: the facts an AI suggestion may cite ---------------- */

export interface Fact { id: string; label: string; value: string; source: "Pebble sales" | "Pebble customers" | "CoStar" }
export function factsOf(s: Signals): Fact[] {
  const f: Fact[] = [];
  const add = (id: string, label: string, value: string, source: Fact["source"]) => f.push({ id, label, value, source });
  add("rev", `Revenue so far in ${s.month}`, `${fmtMoney(s.revenue)} (same point last month: ${fmtMoney(s.revenuePrev)})`, "Pebble sales");
  add("pace", "On pace for this month", fmtMoney(s.pace), "Pebble sales");
  add("fc", "Forecast, next 3 months", s.forecastNext.map(fmtMoney).join(" · "), "Pebble sales");
  add("deals", "Deals closed this month", `${s.deals} (same point last month: ${s.dealsPrev})`, "Pebble sales");
  if (s.responseMin != null) add("resp", "Average first reply this month", `${s.responseMin} min (last month: ${s.responsePrevMin ?? "—"} min)`, "Pebble sales");
  add("fast", "Close rate when first reply < 5 min", `${s.fastCloseRate}% of ${s.fastN} leads`, "Pebble sales");
  add("slow", "Close rate when first reply ≥ 5 min", `${s.slowCloseRate}% of ${s.slowN} leads`, "Pebble sales");
  if (s.slowest) add("slowest", "Slowest first replies this month", `${s.slowest.name}: ${s.slowest.responseMin} min over ${s.slowest.leads} leads`, "Pebble sales");
  if (s.fastest) add("fastest", "Fastest first replies this month", `${s.fastest.name}: ${s.fastest.responseMin} min over ${s.fastest.leads} leads`, "Pebble sales");
  add("fee", "Average fee per closed deal (90 days)", fmtMoney(s.avgFee), "Pebble sales");
  add("quiet", "Clients quiet for 2+ days right now", `${s.quietNow} (${fmtMoney(s.quietValue)} in possible fees)${s.quietNames.length ? `: ${s.quietNames.join(", ")}` : ""}`, "Pebble sales");
  add("rescue", "Quiet clients who closed after a follow-up", `${s.rescueRate}% of ${s.rescueN}`, "Pebble sales");
  add("norescue", "Quiet clients who closed with no follow-up", `${s.unnudgedCloseRate}%`, "Pebble sales");
  add("saved", "Deals saved by follow-ups this month", `${s.saved} (${fmtMoney(s.savedValue)})`, "Pebble sales");
  if (s.topTags.length) add("tags", "Most-searched tags (30 days)", s.topTags.map((t) => `${t.tag} ${t.share}%`).join(" · "), "Pebble customers");
  if (s.topArea) add("area", "Area customers look at most (30 days)", `${s.topArea.name}: ${s.topArea.shoppers} shoppers, ${s.topArea.views} listing views`, "Pebble customers");
  add("hot", `High-likelihood shoppers looking in ${s.topArea?.name || s.city}`, String(s.topAreaHot), "Pebble customers");
  add("tourclose", "Close rate once a client has toured", `${s.hotCloseRate}%`, "Pebble sales");
  if (s.topArea?.dom != null) add("areadom", `${s.topArea.name}: median days on market`, `${s.topArea.dom} days`, "CoStar");
  if (s.topArea?.priceCut != null) add("areacut", `${s.topArea.name}: listings with a price cut`, `${s.topArea.priceCut}%`, "CoStar");
  if (s.topArea?.ppsf != null) add("areappsf", `${s.topArea.name}: median price per sq ft`, `$${s.topArea.ppsf}`, "CoStar");
  if (s.market.priceCutSharePct != null) add("cut", `${s.city}: listings with a price cut`, `${s.market.priceCutSharePct}%`, "CoStar");
  if (s.market.medianDaysOnMarket != null) add("dom", `${s.city}: median days on market`, `${s.market.medianDaysOnMarket} days`, "CoStar");
  if (s.market.aptAvailabilityPct != null) add("apt", `${s.city}: apartment units open`, `${s.market.aptAvailabilityPct}%`, "CoStar");
  if (s.market.rent1bed != null) add("rent", `${s.city}: median 1-bed asking rent`, `$${s.market.rent1bed.toLocaleString()}`, "CoStar");
  return f;
}
