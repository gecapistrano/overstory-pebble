/** Message drafts for the agent (first contact). The agent edits and sends; nothing is sent automatically. */
import { generateJSON } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";
import type { Lead, Listing } from "@/lib/types";

export const dynamic = "force-dynamic";

const SYSTEM = `Draft a short, warm text message from a licensed real-estate agent to a client (max 45 words).
Use only facts provided. Call it a "house" (it becomes a "home" only after they buy or sign).
Reply ONLY with JSON: {"english": the message in English, "native": the same message in the client's language (or the English text if English)}.`;

export async function POST(req: Request) {
  const { lead, listing, agentName, purpose } = (await req.json()) as { lead: Lead; listing: Listing; agentName: string; purpose: "contact" };
  return handle(async () => {
    const d = await generateJSON<{ english: string; native: string }>(SYSTEM, [
      { text: `Purpose: ${purpose} after verifying the listing.\nAgent: ${agentName}, Stonebridge Realty.\nClient: ${lead.clientName} (language: ${lead.language || "English"}).\nClient recap: ${lead.recap.summary}\nHouse: ${listing.title}, $${listing.price}${listing.kind === "rent" ? "/mo" : ""}, available ${listing.availableFrom}, pets ${listing.petFriendly ? "allowed" : "not allowed"}.\nOffer a tour this Saturday.` },
    ]);
    return d;
  });
}
