/** Shared helpers for the /api/ai/* route handlers (server only). */
import "server-only";
import { NextResponse } from "next/server";
import { hasGemini, MODEL, OutOfTimeError, withBudget } from "./gemini";
import { STYLES } from "./styles";
import { HttpError } from "./validate";

/** What a client can ask for: the design styles (lib/styles.ts) plus feel words. */
export const VIBES: string[] = [...STYLES, "cozy", "bright", "quiet", "artsy", "historic", "garden", "luxury", "urban"];

export function noKey() {
  return NextResponse.json({ error: "no-key", message: "GEMINI_API_KEY is not set; the app falls back to on-device rules." }, { status: 503 });
}

/**
 * Time budgets, kept a few seconds under how long the browser waits (lib/ai.ts `post` timeouts),
 * so the server answers or gives up before the screen does.
 *  - quick: browser waits 25 s (parse, recap, draft, translate, vibe)
 *  - long:  browser waits 40-45 s (market, strategy, follow-up agent)
 */
export const BUDGET = {
  quick: { totalMs: 21000, perModelMs: 10000 },
  long: { totalMs: 36000, perModelMs: 15000 },
} as const;

export async function handle<T>(fn: () => Promise<T>, budget: { totalMs: number; perModelMs: number } = BUDGET.quick) {
  if (!hasGemini()) return noKey();
  try {
    const data = await withBudget(budget.totalMs, budget.perModelMs, fn);
    return NextResponse.json({ ok: true, model: MODEL, ...data });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    if (e instanceof OutOfTimeError) return NextResponse.json({ error: "gemini-timeout", message: e.message }, { status: 504 });
    return NextResponse.json({ error: "gemini-failed", message: String(e).slice(0, 400) }, { status: 502 });
  }
}
