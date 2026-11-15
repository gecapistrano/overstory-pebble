/**
 * Shared demo store. All three surfaces (customer app, agent app, brokerage
 * dashboard) read and write the same lead records. In the demo this lives in
 * localStorage and syncs across tabs/iframes via BroadcastChannel; in
 * production it is the brokerage's CRM / Pebble backend.
 */
"use client";
import { useEffect, useState } from "react";
import type { Criteria, Lead, LeadStatus, Listing } from "./types";
import { dealValue, leadRecap } from "./recap";
import { getListing } from "./adapters";

const KEY = "pebble.state.v3-costar";
const H = 3600_000;

export interface PebbleState {
  leads: Lead[];
  approvedStrategies: string[];
  dismissedStrategies: string[];
  clockOffset: number; // demo "fast-forward"
}

export const now = () => Date.now() + (read().clockOffset || 0);

function seedLeads(): Lead[] {
  const t = Date.now();
  const mk = (p: Partial<Lead> & { id: string; clientName: string; status: LeadStatus; listing: string; agentId: string; ageH: number; idleH: number; summary: string; budget: string }): Lead => {
    const l = getListing(p.listing)!;
    return {
      id: p.id,
      clientName: p.clientName,
      clientPhone: "(713) 555-01" + p.id.slice(-2),
      createdAt: t - p.ageH * H,
      transcript: [],
      criteria: { vibes: [], neighborhoods: [] },
      recap: { summary: p.summary, budget: p.budget, timeline: "Within 60 days", mustHaves: [], niceToHaves: [] },
      suggestions: [p.listing],
      chosenListingId: p.listing,
      status: p.status,
      checklist: { available: p.status !== "new", price: p.status !== "new", fits: p.status !== "new", legal: p.status !== "new" },
      agentId: p.agentId,
      messages: [],
      lastClientActivity: t - p.idleH * H,
      nudgesSent: p.nudgesSent || 0,
      rescuedByNudge: p.rescuedByNudge || false,
      dealValue: l ? dealValue(l) : 0,
      events: [{ at: t - p.ageH * H, label: "Voice request received", actor: "client" }],
      archived: p.status === "cancelled",
    };
  };
  return [
    // Mock CRM pipeline (demo) on real CoStar listings in Houston
    mk({ id: "ld-101", clientName: "James Liu", status: "new", listing: "cs-a14510408-0", agentId: "maya", ageH: 0.4, idleH: 0.4, summary: "Incoming Rice PhD student. Wants a quiet studio in the Heights, short ride downtown, no car.", budget: "Up to $1,400/mo" }),
    mk({ id: "ld-102", clientName: "Ana Morales", status: "verified", listing: "cs-a184655-2", agentId: "elena", ageH: 20, idleH: 5, summary: "Engineer relocating from Madrid to Downtown Houston. Bright 2-bed near the bayou trails.", budget: "Up to $1,900/mo" }),
    mk({ id: "ld-103", clientName: "The Okonkwo family", status: "touring", listing: "cs-r233681209", agentId: "marcus", ageH: 70, idleH: 8, summary: "Family of four. 3-bed Heights bungalow with a yard, near Hogg Middle School.", budget: "Up to $450k" }),
    mk({ id: "ld-104", clientName: "Dev Mehta", status: "touring", listing: "cs-a176459-2", agentId: "maya", ageH: 96, idleH: 50, summary: "New hire at an energy firm downtown. Loft-style 2-bed, loves light.", budget: "Up to $2,100/mo" }),
    mk({ id: "ld-105", clientName: "Tom Becker", status: "application", listing: "cs-a815594-1", agentId: "daniel", ageH: 120, idleH: 10, summary: "Nurse at the Medical Center with a beagle. Pet-friendly 1-bed.", budget: "Up to $1,500/mo", nudgesSent: 1, rescuedByNudge: true }),
    mk({ id: "ld-106", clientName: "Kofi Mensah", status: "verified", listing: "cs-r239719430", agentId: "marcus", ageH: 40, idleH: 12, summary: "First-time buyer. Modern townhouse within 15 minutes of downtown.", budget: "Up to $400k" }),
    mk({ id: "ld-107", clientName: "Lena Fischer", status: "closed", listing: "cs-r237029003", agentId: "priya", ageH: 300, idleH: 100, summary: "Bought a light-filled condo on Heights Blvd.", budget: "Up to $380k", nudgesSent: 2, rescuedByNudge: true }),
    mk({ id: "ld-108", clientName: "Mei Tanaka", status: "closed", listing: "cs-a294077-1", agentId: "priya", ageH: 150, idleH: 100, summary: "Signed a 12-month lease on a Heights 1-bed.", budget: "Up to $1,250/mo" }),
    mk({ id: "ld-109", clientName: "Hannah Wright", status: "cancelled", listing: "cs-a451420-2", agentId: "daniel", ageH: 200, idleH: 150, summary: "Decided to stay in Dallas.", budget: "Up to $2,500/mo" }),
  ];
}

function initial(): PebbleState {
  return { leads: seedLeads(), approvedStrategies: [], dismissedStrategies: [], clockOffset: 0 };
}

let mem: PebbleState | null = null;
function read(): PebbleState {
  if (typeof window === "undefined") return mem || (mem = initial());
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return (mem = JSON.parse(raw));
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

// ---------- Customer actions ----------
export function createLead(p: { language?: string; clientName: string; transcript: string[]; criteria: Criteria; suggestions: Listing[]; chosen: Listing }): string {
  const id = "ld-" + Math.floor(now() / 1000).toString(36);
  const t = now();
  const lead: Lead = {
    id,
    clientName: p.clientName,
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
    l.lastClientActivity = now();
    ev(l, `Tour booked · ${slot}`, "client");
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
    l.status = status;
    if (status === "cancelled") l.archived = true;
    ev(l, status === "closed" ? "Deal closed" : status === "cancelled" ? "Deal cancelled · archived" : `Moved to ${status}`, "agent");
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
