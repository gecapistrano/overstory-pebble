import { NextResponse } from "next/server";
import { geminiHealth, hasGemini, MODEL } from "@/lib/gemini";

export const dynamic = "force-dynamic";

/** AI health: which Gemini models are usable right now (quota memory) and the primary model. */
export async function GET() {
  return NextResponse.json({ gemini: hasGemini(), model: MODEL, models: hasGemini() ? geminiHealth() : [] });
}
