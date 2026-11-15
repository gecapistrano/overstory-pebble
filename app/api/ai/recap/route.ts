/** AI recap for the agent: Gemini summarizes the client's needs, budget, timeline and must-haves (in English). */
import { generateJSON } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";
import type { LeadRecap } from "@/lib/types";
import { arr, criteria as checkCriteria, listingRef, optStr, readBody, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

const SYSTEM = `Write a lead recap for a licensed real-estate agent, in English, from the client's own words.
Reply ONLY with JSON: {"summary": 1-2 sentences, "budget": short, "timeline": short, "mustHaves": up to 4 short items, "niceToHaves": up to 4 short items}.
Facts only from the client. Never mention race, religion, national origin, sex, disability or familial status.`;

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readBody(req);
    const criteria = checkCriteria(body.criteria);
    const transcript = arr(body.transcript, "transcript", { max: 50 }, (t, n) => str(t, n, { max: 4000 }));
    const listing = listingRef(body.listing);
    const language = optStr(body.language, "language", 40);
    const recap = await generateJSON<LeadRecap>(SYSTEM, [
      { text: `Client's words (original language${language ? `: ${language}` : ""}): ${JSON.stringify(transcript)}\nParsed criteria: ${JSON.stringify(criteria)}\nHouse they're interested in: ${listing.title}, ${listing.price} (${listing.kind}), ${listing.neighborhood}` },
    ]);
    return { recap };
  });
}
