/**
 * Server-only Gemini API client (REST, generateContent).
 * The API key never reaches the browser: set GEMINI_API_KEY in .env.local
 * (or your host's environment). GEMINI_MODEL overrides the default model.
 *
 * Built so a live demo does not fail when a free-tier quota runs out:
 * - Fallback chain: GEMINI_MODEL, then GEMINI_FALLBACK_MODELS in order. Free-tier quotas are per
 *   model, so every extra model is extra daily capacity.
 * - Quota memory: a model that answers 429 is skipped until its quota resets (the API's own
 *   retryDelay), so later calls go straight to a model that works instead of paying a round trip.
 * - Response cache: one-shot JSON calls are cached on disk (.cache/gemini) by their exact input,
 *   so a rehearsed demo replays instantly and spends no quota. GEMINI_CACHE=off disables it.
 * - Tool-calling runs (the follow-up agent) pick a working model on their first step and stay on
 *   it for the rest of the run (a conversation can't switch models halfway).
 *
 * Notes for current Gemini models: sampling params (temperature/top_p/top_k)
 * are deprecated, and a request must not end with a "model" turn, so every
 * call here ends with a user turn (or a user turn carrying functionResponses).
 */
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
export const FAST_MODEL = process.env.GEMINI_FAST_MODEL || MODEL;
/** Tried in order when a model is out of quota, overloaded, slow or unknown. Each has its own free-tier quota. */
const DEFAULT_FALLBACKS = ["gemini-3.1-flash-lite", "gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.5-flash", "gemini-3.6-flash"];
export const FALLBACKS = (process.env.GEMINI_FALLBACK_MODELS ? process.env.GEMINI_FALLBACK_MODELS.split(",") : DEFAULT_FALLBACKS).map((m) => m.trim()).filter(Boolean);
/** Gemma models on the Gemini API take no system instruction, JSON mode or tools: fold them into the prompt. */
const isGemma = (m: string) => m.startsWith("gemma");
const CACHE_ON = !/^(0|off|false|no)$/i.test(process.env.GEMINI_CACHE || "");
const CACHE_DIR = path.join(process.cwd(), ".cache", "gemini");

export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY);

// ---------- request time budget ----------
// The browser stops waiting after a fixed time (lib/ai.ts) and falls back to on-device rules. Every
// Gemini call made while handling one request shares that request's budget, so the fallback chain
// gives up (and stops spending quota) before the browser does, instead of answering into the void.
type Budget = { deadline: number; perModelMs: number };
const budgetStore = new AsyncLocalStorage<Budget>();
/** Run `fn` with a total time budget for all its Gemini calls (see lib/ai-server.ts handle). */
export function withBudget<T>(totalMs: number, perModelMs: number, fn: () => Promise<T>): Promise<T> {
  return budgetStore.run({ deadline: Date.now() + totalMs, perModelMs }, fn);
}
/** Below this, another model attempt can't finish in time; stop and let the browser fall back. */
const MIN_ATTEMPT_MS = 2500;
export class OutOfTimeError extends Error {
  constructor() { super("Gemini ran out of time for this request"); }
}

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
export interface Content { role: "user" | "model"; parts: Part[] }
export interface FunctionDecl { name: string; description: string; parameters: Record<string, unknown> }

// ---------- quota memory ----------
type Cooldown = { until: number; why: string };
const g = globalThis as unknown as { __geminiCooldown?: Map<string, Cooldown>; __geminiStats?: Record<string, { ok: number; fail: number }> };
const cooldown = (g.__geminiCooldown ??= new Map()); // survives dev hot reloads
const stats = (g.__geminiStats ??= {});
const bump = (m: string, k: "ok" | "fail") => ((stats[m] ??= { ok: 0, fail: 0 })[k]++);

class GeminiError extends Error {
  constructor(public status: number, public body: string, model: string) {
    super(`Gemini ${status} (${model}): ${body.slice(0, 300)}`);
  }
}

/** Remember why a model failed and for how long to skip it. */
function cool(model: string, e: unknown) {
  const now = Date.now();
  if (e instanceof GeminiError) {
    if (e.status === 429) {
      const delay = Number(e.body.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)?.[1]);
      const daily = /PerDay/.test(e.body);
      const ms = Number.isFinite(delay) && delay > 0 ? delay * 1000 : daily ? 60 * 60 * 1000 : 60 * 1000;
      cooldown.set(model, { until: now + ms, why: daily ? "daily quota used up" : "rate limited" });
    } else if (e.status === 404) cooldown.set(model, { until: Infinity, why: "model not available to this key" });
    else if (e.status >= 500) cooldown.set(model, { until: now + 30 * 1000, why: `server error ${e.status}` });
  } else cooldown.set(model, { until: now + 30 * 1000, why: "timed out / network error" });
}
const usable = (m: string) => (cooldown.get(m)?.until ?? 0) <= Date.now();

/** Which models are usable right now (for /api/ai/status and the pre-demo check). */
export function geminiHealth() {
  const now = Date.now();
  return [MODEL, ...FALLBACKS.filter((m) => m !== MODEL)].map((m) => {
    const c = cooldown.get(m);
    const down = c && c.until > now;
    return { model: m, ready: !down, ...(down ? { why: c!.why, retryInMin: c!.until === Infinity ? null : Math.ceil((c!.until - now) / 60000) } : {}), ...stats[m] };
  });
}

// ---------- calls ----------
export async function generate(opts: {
  contents: Content[];
  system?: string;
  json?: boolean;
  tools?: FunctionDecl[];
  model?: string;
  /** stay on `model` (no fallback): used for the later steps of a tool-calling run */
  pin?: boolean;
  /** models to skip (e.g. ones that already failed this tool-calling run) */
  exclude?: string[];
  timeoutMs?: number;
}): Promise<{ parts: Part[]; content: Content; model: string }> {
  if (!hasGemini()) throw new Error("GEMINI_API_KEY is not set");
  const first = opts.model || MODEL;
  const chain = opts.pin
    ? [first]
    : [first, ...FALLBACKS.filter((m) => m !== first)].filter((m) => !(opts.tools?.length && isGemma(m)) && !opts.exclude?.includes(m));
  if (!chain.length) throw new Error("No Gemini model left to try");
  // try models that are not cooling down first; if every one is, still try them all (a quota may have reset)
  const order = [...chain.filter(usable), ...chain.filter((m) => !usable(m))];
  const budget = budgetStore.getStore();
  let lastErr: unknown = null;
  for (const [i, model] of order.entries()) {
    const normal = opts.timeoutMs ?? budget?.perModelMs ?? (i === 0 ? 20000 : 15000);
    const left = budget ? budget.deadline - Date.now() : Infinity;
    if (left < MIN_ATTEMPT_MS) throw lastErr instanceof GeminiError ? lastErr : new OutOfTimeError();
    const timeout = Math.min(normal, left);
    try {
      const out = await call(model, opts, timeout);
      bump(model, "ok");
      if (cooldown.get(model)?.until !== Infinity) cooldown.delete(model);
      return { ...out, model };
    } catch (e) {
      lastErr = e;
      bump(model, "fail");
      // a 400 is usually about this request (bad image, too long), not the model: don't cool the model for it.
      // A timeout we cut short to fit the budget isn't the model's fault either.
      const cutShort = !(e instanceof GeminiError) && timeout < normal;
      if (!(e instanceof GeminiError && e.status === 400) && !cutShort) cool(model, e);
      if (opts.pin) break;
      console.warn(`[gemini] ${model} failed (${e instanceof GeminiError ? e.status : "network/timeout"}), trying the next model`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini failed");
}

async function call(model: string, opts: { contents: Content[]; system?: string; json?: boolean; tools?: FunctionDecl[] }, timeoutMs: number) {
  let contents = opts.contents;
  const body: Record<string, unknown> = {};
  if (isGemma(model)) {
    const pre = [opts.system, opts.json ? "Reply with JSON only, no other text." : ""].filter(Boolean).join("\n\n");
    if (pre) contents = [{ role: "user", parts: [{ text: pre }, ...(contents[0]?.parts || [])] }, ...contents.slice(1)];
  } else {
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    if (opts.json) body.generationConfig = { responseMimeType: "application/json" };
  }
  body.contents = contents;
  if (opts.tools?.length) body.tools = [{ functionDeclarations: opts.tools }];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new GeminiError(res.status, await res.text(), model);
    const j = await res.json();
    const content: Content = j.candidates?.[0]?.content || { role: "model", parts: [] };
    return { parts: content.parts || [], content: { role: "model" as const, parts: content.parts || [] } };
  } finally {
    clearTimeout(timer);
  }
}

export function textOf(parts: Part[]) {
  return parts.map((p) => ("text" in p ? p.text : "")).join("");
}

export function parseJSON<T>(s: string): T {
  const m = s.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : s) as T;
}

// ---------- response cache ----------
const keyOf = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function cacheGet<T>(key: string): Promise<T | undefined> {
  if (!CACHE_ON) return undefined;
  try { return JSON.parse(await fs.readFile(path.join(CACHE_DIR, `${key}.json`), "utf8")).value as T; } catch { return undefined; }
}
async function cachePut(key: string, value: unknown, model: string) {
  if (!CACHE_ON) return;
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify({ model, at: new Date().toISOString(), value }));
  } catch {}
}

/** One-shot JSON call: system prompt + user parts -> parsed object. Cached by exact input; a reply
 *  that is not valid JSON counts as a failure and moves on to the next model. */
export async function generateJSON<T>(system: string, parts: Part[], model?: string): Promise<T> {
  const key = keyOf({ system, parts });
  const hit = await cacheGet<T>(key);
  if (hit !== undefined) return hit;
  let first = model;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await generate({ system, contents: [{ role: "user", parts }], json: true, model: first });
    try {
      const value = parseJSON<T>(textOf(out.parts));
      await cachePut(key, value, out.model);
      return value;
    } catch {
      console.warn(`[gemini] ${out.model} returned invalid JSON, retrying on another model`);
      first = [MODEL, ...FALLBACKS].find((m) => m !== out.model && usable(m));
      if (!first) break;
    }
  }
  throw new Error("Gemini returned invalid JSON");
}

export function dataUrlToPart(dataUrl: string): Part {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error("expected a data: URL");
  return { inlineData: { mimeType: m[1], data: m[2] } };
}
