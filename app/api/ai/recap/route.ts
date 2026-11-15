/** AI recap for the agent: Gemini summarizes the client's needs, budget, timeline and must-haves (in English). */
import { generateJSON } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";
import type { Criteria, LeadRecap, Listing } from "@/lib/types";

export const dynamic = "force-dynamic";

const SYSTEM = `Write a lead recap for a licensed real-estate agent, in English, from the client's own words.
Reply ONLY with JSON: {"summary": 1-2 sentences, "budget": short, "timeline": short, "mustHaves": up to 4 short items, "niceToHaves": up to 4 short items}.
Facts only from the client. Never mention race, religion, national origin, sex, disability or familial status.`;

export async function POST(req: Request) {
  const { criteria, transcript, listing, language } = (await req.json()) as { criteria: Criteria; transcript: string[]; listing: Listing; language?: string };
  return handle(async () => {
    const recap = await generateJSON<LeadRecap>(SYSTEM, [
      { text: `Client's words (original language${language ? `: ${language}` : ""}): ${JSON.stringify(transcript)}\nParsed criteria: ${JSON.stringify(criteria)}\nHouse they're interested in: ${listing.title}, ${listing.price} (${listing.kind}), ${listing.neighborhood}` },
    ]);
    return { recap };
  });
}
