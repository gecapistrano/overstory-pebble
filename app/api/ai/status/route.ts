import { NextResponse } from "next/server";
import { hasGemini, MODEL } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ gemini: hasGemini(), model: MODEL });
}
