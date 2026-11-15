/**
 * Browser-side client for Pebble's Gemini routes (/api/ai/*).
 * Every call returns null when Gemini is unavailable (no key, offline, timeout),
 * and the caller falls back to the on-device rules, so the demo never breaks.
 */
"use client";
import type { Criteria, Lead, LeadRecap, Listing, VibeTags } from "./types";
import type { Fact } from "./brokerage";
import type { Strategy } from "./strategy";

export interface AIParse {
  language: string;
  languageName: string;
  languageNative: string;
  englishText: string;
  criteria: Criteria;
  picks: { id: string; why: string; whyNative?: string }[];
  replyEnglish: string;
  replyNative: string;
  switchQuestion?: { native: string; yes: string; no: string };
}

async function post<T>(path: string, body: unknown, timeoutMs = 25000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`/api/ai/${path}/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let statusCache: Promise<{ gemini: boolean; model: string }> | null = null;
export function aiStatus() {
  if (!statusCache)
    statusCache = fetch("/api/ai/status/")
      .then((r) => (r.ok ? r.json() : { gemini: false, model: "" }))
      .catch(() => ({ gemini: false, model: "" }));
  return statusCache;
}

/** Any-language speech to text (Gemini hears which language was spoken). */
export const aiTranscribe = (audio: string) => post<{ text: string; language: string }>("transcribe", { audio }, 30000);
export const aiParse = (text: string, prev: Criteria, imageTags?: string[]) => post<AIParse>("parse", { text, prev, imageTags });
export const aiVibe = async (images: string[], language?: string) => (await post<{ tags: VibeTags }>("vibe", { images, language }))?.tags ?? null;
export const aiRecap = async (criteria: Criteria, transcript: string[], listing: Listing, language?: string) =>
  (await post<{ recap: LeadRecap }>("recap", { criteria, transcript, listing, language }))?.recap ?? null;
export const aiDraft = (lead: Lead, listing: Listing, agentName: string) => post<{ english: string; native: string }>("draft", { lead, listing, agentName, purpose: "contact" });
export const aiFollowup = (lead: Lead, now: number) =>
  post<{ draft: string; draftNative: string; reason: string; trace: { tool: string; args: Record<string, unknown>; result: string }[] }>("followup", { lead, now }, 45000);
/** Broker's-assistant strategies; each cites fact ids from lib/brokerage.ts factsOf(). */
export const aiStrategy = async (city: string, facts: Fact[], agents: unknown[]) =>
  (await post<{ strategies: Strategy[] }>("strategy", { city, facts, agents }, 45000))?.strategies ?? null;
export interface AIMarket {
  recap: string;
  insights: { title: string; detail: string; metric: string }[];
  suggestions: { listingId: string; headline: string; why: string; action: string }[];
  model?: string;
}
export const aiMarket = (city: string, leads: Lead[]) => post<AIMarket>("market", { city, leads }, 40000);
export const aiTranslate =async (language: string, strings: Record<string, string>) =>
  (await post<{ strings: Record<string, string> }>("translate", { language, strings }))?.strings ?? null;
