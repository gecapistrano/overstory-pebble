/**
 * Strategy suggestions for the broker, written by Gemini as the broker's personal assistant.
 * The dashboard sends a list of facts (each with an id, a value and its source: Pebble sales, Pebble customers or CoStar).
 * Gemini may only use those numbers, must cite the fact ids it relied on, and explains its thinking step by step.
 * Suggestions that cite unknown facts or skip the reasoning are dropped (lib/strategy.ts cleanStrategies).
 */
import { generateJSON, MODEL } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";
import type { Fact } from "@/lib/brokerage";
import { cleanStrategies } from "@/lib/strategy";

export const dynamic = "force-dynamic";

const SYSTEM = `You are the personal assistant of a residential real-estate broker. You look after the numbers so the broker doesn't have to.
You get a list of FACTS about the brokerage this month. Each fact has an id, a label, a value and a source (Pebble sales, Pebble customers, or CoStar market data).

Propose exactly 3 actions that would grow revenue or save deals in the next month. For each one, think it through like a sharp, warm human assistant would explain it to their boss over coffee: plain words, first person ("I looked at…", "What stood out…", "So I'd…"), no jargon, no hype.

Hard rules:
- Use ONLY numbers that appear in the facts. Do any arithmetic yourself and show it in the thinking (e.g. "12 quiet clients × 38% ≈ 5 deals").
- Every suggestion must cite at least 2 fact ids in "evidence", and its thinking must actually use them.
- "successRate" is your honest estimate (0-100) that the plan delivers the expected result. Explain it in "confidence": sample sizes, what is in our control, what could go wrong.
- Never suggest targeting, excluding or steering people by age, race, religion, national origin, sex, disability or family status.
- Each suggestion should be different (e.g. one about speed, one about follow-ups, one about where demand is), unless the facts clearly point elsewhere.

Reply ONLY with JSON:
{"strategies":[{
 "title": "imperative, max 9 words",
 "summary": "1-2 sentences with the key numbers",
 "impact": "short expected effect, e.g. '≈ +3 deals / month · $14.2k'",
 "successRate": number,
 "thinking": ["3-5 short first-person steps showing how you got there"],
 "evidence": ["fact ids"],
 "plan": ["2-4 concrete steps the broker can approve"],
 "expected": "1 sentence: the result if implemented",
 "confidence": "1-2 sentences on why that success rate"
}]}`;

export async function POST(req: Request) {
  const { city, facts = [], agents = [] } = (await req.json().catch(() => ({}))) as { city?: string; facts?: Fact[]; agents?: unknown[] };
  return handle(async () => {
    const out = await generateJSON<{ strategies: unknown[] }>(SYSTEM, [
      { text: `Market: ${city}\nFACTS:\n${facts.map((f) => `[${f.id}] ${f.label}: ${f.value} (source: ${f.source})`).join("\n")}\nAGENTS THIS MONTH: ${JSON.stringify(agents)}` },
    ], MODEL);
    return { strategies: cleanStrategies(out.strategies, facts) };
  });
}
