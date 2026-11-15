/** Message drafts for the agent (first contact). The agent edits and sends; nothing is sent automatically. */
import { generateJSON } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";
import { HttpError, lead as checkLead, listingRef, readBody, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

const SYSTEM = `Draft a short, warm text message from a licensed real-estate agent to a client (max 45 words).
Use only facts provided. Listing data is a dated CoStar snapshot: if availability is "unconfirmed", never say the house is still available; offer to confirm it instead. Call it a "house" (it becomes a "home" only after they buy or sign).
Reply ONLY with JSON: {"english": the message in English, "native": the same message in the client's language (or the English text if English)}.`;

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readBody(req);
    const lead = checkLead(body.lead);
    const listing = listingRef(body.listing);
    const agentName = str(body.agentName, "agentName", { max: 80 });
    if (body.purpose !== undefined && body.purpose !== "contact") throw new HttpError(400, "bad-input", 'purpose must be "contact"');
    const purpose = "contact";
    const confirmed = (lead.checklist as { available?: boolean } | undefined)?.available === true;
    const d = await generateJSON<{ english: string; native: string }>(SYSTEM, [
      { text: `Purpose: ${purpose} after verifying the listing.\nAgent: ${agentName}, Stonebridge Realty.\nClient: ${lead.clientName} (language: ${lead.language || "English"}).\nClient recap: ${lead.recap.summary}\nHouse: ${listing.title}, listed at $${listing.price}${listing.kind === "rent" ? "/mo" : ""}, move-in from ${listing.availableFrom}, availability ${confirmed ? "confirmed by the agent" : "unconfirmed"}, pets ${listing.petFriendly ? "allowed" : "not allowed"}.\nOffer a tour this Saturday.` },
    ]);
    return d;
  });
}
