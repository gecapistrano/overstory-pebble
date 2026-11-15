/**
 * Shared demo store. All three surfaces (customer app, agent app, brokerage
 * dashboard) read and write the same lead records. In the demo this lives in
 * localStorage and syncs across tabs/iframes via BroadcastChannel; in
 * production it is the brokerage's CRM / Pebble backend.
 */
"use client";
import { useEffect, useState } from "react";
import type { Consent, Criteria, DealType, CustomerProfile, Lead, LeadStatus, Listing, SearchEvent, ViewEvent } from "./types";
import { dealValue, leadRecap } from "./recap";
import { getListing } from "./adapters";

const KEY = "pebble.state.v3-costar";
const LEGACY_LIVE_KEY = "pebble.live.v1";
const SEEDED_LEAD_IDS = new Set(["ld-101", "ld-102", "ld-103", "ld-104", "ld-105", "ld-106", "ld-107", "ld-108", "ld-109"]);
const H = 3600_000;

export interface PebbleState {
  leads: Lead[];
  approvedStrategies: string[];
  dismissedStrategies: string[];
  clockOffset: number; // demo "fast-forward"
  // customer activity from the homebuyer app (older saved states may not have it)
  searches?: SearchEvent[];
  views?: ViewEvent[];
  profiles?: Record<string, CustomerProfile>;
}

export const now = () => Date.now() + (read().clockOffset || 0);

function initial(): PebbleState {
  return { leads: [], approvedStrategies: [], dismissedStrategies: [], clockOffset: 0 };
}

let mem: PebbleState | null = null;
let clearedLegacyLive = false;
function read(): PebbleState {
  if (typeof window === "undefined") return mem || (mem = initial());
  if (!clearedLegacyLive) {
    try { localStorage.removeItem(LEGACY_LIVE_KEY); } catch {}
    clearedLegacyLive = true;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const state = JSON.parse(raw) as PebbleState;
      const storedLeads = Array.isArray(state.leads) ? state.leads : [];
      const leads = storedLeads.filter((lead) => !SEEDED_LEAD_IDS.has(lead.id));
      if (!Array.isArray(state.leads) || leads.length !== storedLeads.length) {
        state.leads = leads;
        write(state, false);
      } else {
        mem = state;
      }
      return state;
    }
  } catch {}
  const s = initial();
  write(s, false);
  return s;
}

let chan: BroadcastChannel | null = null;
const listeners = new Set<() => void>();
function channel() {
  if (typeof window === "undefined") return null;
  if (!chan && "BroadcastChannel" in window) {
    chan = new BroadcastChannel("pebble");
    chan.onmessage = () => listeners.forEach((f) => f());
    window.addEventListener("storage", (e) => e.key === KEY && listeners.forEach((f) => f()));
  }
  return chan;
}

function write(s: PebbleState, notify = true) {
  mem = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
  if (notify) {
    channel()?.postMessage("update");
    listeners.forEach((f) => f());
  }
}

export function getState() {
  return read();
}
export function update(fn: (s: PebbleState) => void) {
  const s = structuredClone(read());
  fn(s);
  write(s);
}
export function resetDemo() {
  write(initial());
}

export function useStore<T>(sel: (s: PebbleState) => T): T {
  const [v, setV] = useState<T>(() => sel(read()));
  useEffect(() => {
    channel();
    const f = () => setV(sel(read()));
    listeners.add(f);
    f();
    return () => void listeners.delete(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

const ev = (lead: Lead, label: string, actor: Lead["events"][0]["actor"]) => lead.events.push({ at: now(), label, actor });
function withLead(id: string, fn: (l: Lead) => void) {
  update((s) => {
    const l = s.leads.find((x) => x.id === id);
    if (l) fn(l);
  });
}
function cancelLead(l: Lead, cancelledBy: "client" | "agent") {
  if (l.status === "closed" || l.status === "cancelled") return;
  l.status = "cancelled";
  l.cancelledBy = cancelledBy;
  l.archived = true;
  l.tourSlot = undefined;
  l.tourOptions = [];
  l.tourDeclined = false;
  if (cancelledBy === "client") l.lastClientActivity = now();
  const message = cancelledBy === "client" ? "The customer cancelled this request." : "This request was cancelled by the agent.";
  l.messages.push({ from: cancelledBy, text: message, at: now() });
  ev(l, cancelledBy === "client" ? "Request cancelled by the customer" : "Deal cancelled · archived", cancelledBy);
}

// ---------- Customer actions ----------
export function createLead(p: { dealType?: DealType; language?: string; clientName: string; transcript: string[]; criteria: Criteria; suggestions: Listing[]; chosen: Listing }): string {
  const id = "ld-" + Math.floor(now() / 1000).toString(36);
  const t = now();
  const lead: Lead = {
    id,
    clientName: p.clientName,
    customerId: sessionId() || undefined,
    dealType: p.dealType,
    sim: { step: 0 },
    clientPhone: "(713) 555-0142",
    language: p.language,
    createdAt: t,
    transcript: p.transcript,
    criteria: p.criteria,
    recap: leadRecap(p.criteria, p.transcript),
    suggestions: [p.chosen.id, ...p.suggestions.map((s) => s.id).filter((x) => x !== p.chosen.id)].slice(0, 3),
    chosenListingId: p.chosen.id,
    status: "new",
    checklist: { available: false, price: false, fits: false, legal: false },
    agentId: p.chosen.agentId === "maya" || p.criteria.who === "new hire" ? "maya" : p.chosen.agentId,
    messages: [],
    lastClientActivity: t,
    nudgesSent: 0,
    rescuedByNudge: false,
    dealValue: dealValue(p.chosen),
    events: [
      { at: t - 9000, label: "Voice request received", actor: "client" },
      { at: t - 8000, label: "Agentic Assistant parsed needs, budget, timeline", actor: "ai" },
      { at: t - 7000, label: "Agentic Assistant matched 3 homes by vibe", actor: "ai" },
      ...(p.language ? [{ at: t - 6000, label: `Auto-translated from ${p.language}`, actor: "ai" as const }] : []),
      { at: t, label: `Client is interested in ${p.chosen.title}`, actor: "client" },
      { at: t + 500, label: "Lead routed to licensed Real Estate Agent", actor: "system" },
    ],
  };
  update((s) => void s.leads.unshift(lead));
  return id;
}
export function setLeadRecap(id: string, recap: Lead["recap"]) {
  withLead(id, (l) => {
    l.recap = recap;
    ev(l, "Agentic Assistant recap written for the Real Estate Agent", "ai");
  });
}
export function bookTour(id: string, slot: string) {
  withLead(id, (l) => {
    l.status = "touring";
    l.tourSlot = slot;
    l.tourDeclined = false;
    l.lastClientActivity = now();
    l.messages.push({ from: "client", text: `Tour booked · ${slot}`, at: now() });
    ev(l, `Tour booked · ${slot}`, "client");
  });
}
export function cancelTour(id: string) {
  withLead(id, (l) => {
    l.status = "verified";
    l.tourSlot = undefined;
    l.tourDeclined = false;
    l.lastClientActivity = now();
    l.messages.push({ from: "client", text: "Cancelled the scheduled tour", at: now() });
    ev(l, "Client cancelled the scheduled tour", "client");
  });
}
export function cancelRequest(id: string) {
  withLead(id, (l) => cancelLead(l, "client"));
}
export function sendTourOptions(id: string, options: string[]) {
  const clean = [...new Set(options.map((option) => option.trim()).filter(Boolean))];
  if (!clean.length || clean.length > 3) throw new Error("Send between one and three tour times.");
  withLead(id, (l) => {
    l.tourOptions = clean;
    l.tourDeclined = false;
    l.messages.push({ from: "agent", text: `Available tour times: ${clean.join(" · ")}`, at: now() });
    ev(l, `Tour times sent · ${clean.join(", ")}`, "agent");
  });
}
export function declineTour(id: string) {
  withLead(id, (l) => {
    l.tourDeclined = true;
    l.lastClientActivity = now();
    l.messages.push({ from: "client", text: "No tour for now", at: now() });
    ev(l, "Client declined the offered tour times", "client");
  });
}
export function submitApplication(id: string) {
  withLead(id, (l) => {
    l.status = "application";
    l.lastClientActivity = now();
    if (l.nudgesSent > 0) l.rescuedByNudge = true;
    l.messages.push({ from: "client", text: "Yes please — I'm applying now!", at: now() });
    ev(l, "Application submitted", "client");
  });
}

// ---------- Agent actions ----------
export function setCheck(id: string, k: keyof Lead["checklist"], v: boolean) {
  withLead(id, (l) => void (l.checklist[k] = v));
}
export function verifyLead(id: string) {
  withLead(id, (l) => {
    l.checklist = { available: true, price: true, fits: true, legal: true };
    if (l.status === "new") l.status = "verified";
    ev(l, `Verified by ${l.agentId === "maya" ? "Maya Chen" : "Real Estate Agent"}`, "agent");
  });
}
export function contactClient(id: string, text: string) {
  withLead(id, (l) => {
    l.messages.push({ from: "agent", text, at: now() });
    ev(l, "Real Estate Agent contacted client", "agent");
  });
}
export function sendNudge(id: string, text: string) {
  withLead(id, (l) => {
    l.messages.push({ from: "agent", text, at: now() });
    l.nudgesSent++;
    ev(l, "Agentic Assistant follow-up sent (approved by Real Estate Agent)", "ai");
  });
}
export function setStatus(id: string, status: LeadStatus) {
  withLead(id, (l) => {
    if (status === "cancelled") {
      cancelLead(l, "agent");
      return;
    }
    l.status = status;
    ev(l, status === "closed" ? "Deal closed" : `Moved to ${status}`, "agent");
  });
}
export function fastForward(hours: number) {
  update((s) => {
    s.clockOffset = (s.clockOffset || 0) + hours * H;
  });
}

// ---------- AI follow-up nudges ----------
export function nudgeFor(l: Lead): { text: string; draft: string } | null {
  if (!["verified", "touring", "application"].includes(l.status) || l.archived) return null;
  const idle = now() - l.lastClientActivity;
  if (idle < 36 * H) return null;
  const lastMsg = l.messages[l.messages.length - 1];
  if (lastMsg?.from === "agent" && now() - lastMsg.at < 24 * H) return null;
  const days = Math.max(2, Math.round(idle / (24 * H)));
  const first = l.clientName.replace(/^The /, "").split(" ")[0];
  const home = getListing(l.chosenListingId);
  const draft =
    l.status === "touring"
      ? `Hi ${first}! Loved showing you ${home?.title ?? "the home"}. The leasing office can hold the ${home?.availableFrom === "Now" ? "move-in date" : "start date"} until Friday. Want me to send the application?`
      : l.status === "application"
      ? `Hi ${first}, just checking in — your application is almost done. Only the income letter is missing. Want me to walk you through it?`
      : `Hi ${first}, ${home?.title ?? "the home"} is verified and still available. Would you like to book a tour this week?`;
  return { text: `${first} hasn't replied in ${days} days. Send this check-in?`, draft };
}

// ---------- Customer accounts + activity (homebuyer app → brokerage dashboard) ----------
// Demo: accounts live in this browser's store with no real authentication (any input works). Production: an auth provider and a
// database (see the pebble-production-data note). Activity is only recorded for signed-in customers who opted in.
export const PRIVACY_VERSION = "2026-11-15";
const SESSION = "pebble.session";

export function sessionId(): string | null {
  try { return localStorage.getItem(SESSION); } catch { return null; }
}
export function currentAccount(): CustomerProfile | null {
  const id = sessionId();
  return id ? read().profiles?.[id] || null : null;
}
export function useAccount(): CustomerProfile | null {
  const [, force] = useState(0);
  const acc = useStore((s) => { const id = sessionId(); return id ? s.profiles?.[id] || null : null; });
  useEffect(() => {
    const f = (e: StorageEvent) => e.key === SESSION && force((n) => n + 1);
    window.addEventListener("storage", f);
    return () => window.removeEventListener("storage", f);
  }, []);
  return acc;
}
/** The id that ties searches, views and leads together: the signed-in account. */
export function customerId(): string {
  return sessionId() || "guest";
}

// Demo accounts: no real authentication. Any input works; blank fields fall back to a demo profile.
const DEMO = { name: "Sarah Kim", email: "sarah.kim@example.com", age: 29, location: "Austin, TX", phone: "(713) 555-0142" };
const normEmail = (e: string) => e.trim().toLowerCase();
const findByEmail = (email: string) => Object.values(read().profiles || {}).find((p) => p.email && normEmail(p.email) === normEmail(email));
const startSession = (id: string) => {
  try { localStorage.setItem(SESSION, id); } catch {}
  update(() => undefined); // let every screen pick up the new session
};

export async function signUp(p: { name?: string; email?: string; password?: string; age?: number; location?: string; phone?: string; consent: Omit<Consent, "version" | "updatedAt" | "terms"> & { terms: boolean } }): Promise<{ ok: true }> {
  const email = normEmail(p.email || "") || DEMO.email;
  const existing = findByEmail(email);
  if (existing) { startSession(existing.id); return { ok: true }; }
  const id = `cu-${Math.random().toString(36).slice(2, 10)}`;
  const t = now();
  const consent: Consent = { version: PRIVACY_VERSION, terms: t, activity: p.consent.activity, contact: p.consent.contact, shareWithOwners: p.consent.shareWithOwners, updatedAt: t };
  update((s) => {
    s.profiles = { ...(s.profiles || {}), [id]: { id, name: p.name?.trim() || DEMO.name, email, age: p.age ?? (p.name?.trim() ? undefined : DEMO.age), location: p.location?.trim() || (p.name?.trim() ? undefined : DEMO.location), phone: p.phone?.trim() || DEMO.phone, consent, createdAt: t, updatedAt: t } };
  });
  startSession(id);
  return { ok: true };
}
/** Demo log-in: signs into the account with that email, or into a demo account if there is none. */
export async function logIn(email: string, _password?: string): Promise<{ ok: true }> {
  const acc = findByEmail(email || DEMO.email);
  if (acc) { startSession(acc.id); return { ok: true }; }
  return signUp({ email: email || DEMO.email, consent: { terms: true, activity: true, contact: true, shareWithOwners: false } });
}
export function logOut() {
  try { localStorage.removeItem(SESSION); } catch {}
  update(() => undefined);
}
export function updateAccount(p: Partial<Pick<CustomerProfile, "name" | "age" | "location" | "phone">>) {
  const id = sessionId();
  if (!id) return;
  update((s) => { const a = s.profiles?.[id]; if (a) s.profiles![id] = { ...a, ...p, updatedAt: now() }; });
}
export function recordInterest(listingId: string) {
  const id = sessionId();
  if (!id) return;
  update((s) => {
    const account = s.profiles?.[id];
    if (!account) return;
    account.interestedHomes = [
      ...(account.interestedHomes || []).filter((home) => home.listingId !== listingId),
      { listingId, at: now() },
    ];
    account.updatedAt = now();
  });
}
export function updateConsent(c: Partial<Pick<Consent, "activity" | "contact" | "shareWithOwners">>) {
  const id = sessionId();
  if (!id) return;
  update((s) => {
    const a = s.profiles?.[id];
    if (!a?.consent) return;
    a.consent = { ...a.consent, ...c, updatedAt: now() };
    // turning activity off also removes what was saved
    if (c.activity === false) { s.searches = (s.searches || []).filter((x) => x.customerId !== id); s.views = (s.views || []).filter((x) => x.customerId !== id); }
  });
}
/** Everything we hold about the signed-in customer, as JSON (right of access). */
export function exportMyData(): string {
  const id = sessionId();
  const s = read();
  const a = id ? s.profiles?.[id] : undefined;
  if (!id || !a) return "{}";
  const { passwordHash: _h, salt: _s, ...account } = a;
  return JSON.stringify({ account, interestedHomes: a.interestedHomes || [], searches: (s.searches || []).filter((x) => x.customerId === id), views: (s.views || []).filter((x) => x.customerId === id), leads: s.leads.filter((l) => l.customerId === id) }, null, 2);
}
/** Deletes the account, its activity, and anonymizes its leads (right to erasure). */
export function deleteAccount() {
  const id = sessionId();
  if (!id) return;
  update((s) => {
    if (s.profiles) delete s.profiles[id];
    s.searches = (s.searches || []).filter((x) => x.customerId !== id);
    s.views = (s.views || []).filter((x) => x.customerId !== id);
    for (const l of s.leads) if (l.customerId === id) { l.clientName = "Deleted customer"; l.clientPhone = ""; l.customerId = undefined; }
  });
  logOut();
}

const cap = <T,>(a: T[], n: number) => (a.length > n ? a.slice(a.length - n) : a);
const tracking = () => Boolean(currentAccount()?.consent?.activity);
export function recordSearch(e: Omit<SearchEvent, "customerId" | "at">) {
  if (!tracking()) return;
  update((s) => void (s.searches = cap([...(s.searches || []), { ...e, customerId: customerId(), at: now() }], 500)));
}
export function recordView(listingId: string, ms: number) {
  if (ms < 1500 || !tracking()) return; // a bounce, not a look
  update((s) => void (s.views = cap([...(s.views || []), { listingId, ms: Math.round(ms), customerId: customerId(), at: now() }], 1000)));
}
