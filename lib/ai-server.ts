/** Shared helpers for the /api/ai/* route handlers (server only). */
import "server-only";
import { NextResponse } from "next/server";
import { hasGemini, MODEL } from "./gemini";

export const VIBES = ["cozy", "artsy", "bright", "quiet", "modern", "minimalist", "gothic", "historic", "modern farmhouse", "garden", "industrial", "scandinavian", "victorian", "craftsman"];

export function noKey() {
  return NextResponse.json({ error: "no-key", message: "GEMINI_API_KEY is not set; the app falls back to on-device rules." }, { status: 503 });
}

export async function handle<T>(fn: () => Promise<T>) {
  if (!hasGemini()) return noKey();
  try {
    const data = await fn();
    return NextResponse.json({ ok: true, model: MODEL, ...data });
  } catch (e) {
    return NextResponse.json({ error: "gemini-failed", message: String(e).slice(0, 400) }, { status: 502 });
  }
}
