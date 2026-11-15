/** Strategy ideas for the brokerage, written by Gemini from the dashboard's numbers. A manager approves or dismisses. */
import { generateJSON } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";

export const dynamic = "force-dynamic";

const SYSTEM = `You advise a residential real-estate brokerage. From the metrics given, propose exactly 3 concrete actions for next month.
Reply ONLY with JSON: {"strategies":[{"id":"s1","title":"max 8 words","why":"1 sentence citing a number from the metrics","impact":"short estimated effect"}]}.
Use only the numbers given. Never suggest targeting or excluding people by protected characteristics.`;

export async function POST(req: Request) {
  const { metrics } = (await req.json()) as { metrics: Record<string, unknown> };
  return handle(async () => generateJSON<{ strategies: { id: string; title: string; why: string; impact: string }[] }>(SYSTEM, [{ text: JSON.stringify(metrics) }]));
}
