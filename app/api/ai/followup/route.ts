/**
 * Follow-up AGENT (Gemini function calling).
 * Given a deal that has gone quiet, Gemini decides which tools to call
 * (read the deal history, re-check the listing, look for alternatives),
 * then submits a draft check-in. It never sends anything: the licensed agent
 * reviews the draft and taps Send. AI suggests, a human verifies.
 */
import listings from "@/data/listings.json";
import type { Lead, Listing } from "@/lib/types";
import { generate, type Content, type FunctionDecl, type Part } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";
import { search } from "@/lib/search";

export const dynamic = "force-dynamic";

const ALL = listings as unknown as Listing[];

const TOOLS: FunctionDecl[] = [
  { name: "get_deal_history", description: "Read the deal's stage, how long the client has been quiet, the messages so far and the timeline.", parameters: { type: "object", properties: {} } },
  { name: "check_listing", description: "Re-check a listing right now: still available, current price, move-in date, pet policy.", parameters: { type: "object", properties: { listing_id: { type: "string" } }, required: ["listing_id"] } },
  { name: "find_similar_houses", description: "Find up to 2 similar houses in case the client's pick no longer fits.", parameters: { type: "object", properties: { listing_id: { type: "string" }, max_price: { type: "number" } }, required: ["listing_id"] } },
  {
    name: "submit_draft",
    description: "Finish: submit the check-in message for the human agent to review. Call exactly once, last.",
    parameters: {
      type: "object",
      properties: {
        message_english: { type: "string", description: "Max 45 words, warm, specific, ends with one easy question. Call it a house, not a home." },
        message_native: { type: "string", description: "The same message in the client's language (English if English)." },
        reason: { type: "string", description: "One sentence for the agent: why this follow-up, why now." },
      },
      required: ["message_english", "message_native", "reason"],
    },
  },
];

const SYSTEM = `You are Pebble's follow-up agent working for a licensed real-estate agent.
A client has gone quiet. Investigate with your tools before writing: read the deal history and re-check the listing.
If the listing changed or is gone, look for similar houses. Then call submit_draft once.
Never invent facts. Never pressure. Never mention protected characteristics. The human agent approves every message.`;

export async function POST(req: Request) {
  const { lead, now } = (await req.json()) as { lead: Lead; now: number };
  return handle(async () => {
    const trace: { tool: string; args: Record<string, unknown>; result: string }[] = [];
    const contents: Content[] = [{ role: "user", parts: [{ text: `Deal for client ${lead.clientName} (language: ${lead.language || "English"}), listing ${lead.chosenListingId}, stage ${lead.status}. Investigate and draft the follow-up.` }] }];
    const run = (name: string, args: Record<string, unknown>): Record<string, unknown> => {
      if (name === "get_deal_history") {
        return {
          stage: lead.status, tour: lead.tourSlot || null,
          hours_since_client_replied: Math.round((now - lead.lastClientActivity) / 3600000),
          messages: lead.messages.slice(-5).map((m) => ({ from: m.from, text: m.text })),
          recap: lead.recap.summary,
        };
      }
      if (name === "check_listing") {
        const l = ALL.find((x) => x.id === args.listing_id);
        return l
          ? {
              found: true, source: "CoStar listing snapshot", title: l.title, still_listed_active: true, price: l.price, available_from: l.availableFrom, pets_allowed: l.petFriendly,
              days_on_market: l.costar?.dom ?? null, original_price: l.costar?.originalPrice ?? null, units_available: l.costar?.unitsAvailable ?? null,
              plan_units_available: l.costar?.planUnitsAvailable ?? null, has_3d_tour: Boolean(l.matterportId), neighborhood: l.neighborhood,
            }
          : { found: false };
      }
      if (name === "find_similar_houses") {
        const l = ALL.find((x) => x.id === args.listing_id);
        if (!l) return { results: [] };
        const res = search(ALL, { ...lead.criteria, intent: l.kind, budgetMax: (args.max_price as number) || lead.criteria.budgetMax }, [l.id]).slice(0, 2);
        return { results: res.map((r) => ({ id: r.listing.id, title: r.listing.title, price: r.listing.price, neighborhood: r.listing.neighborhood })) };
      }
      return { ok: true };
    };
    let model: string | undefined; // chosen on the first step (with fallback), then kept for the whole run
    for (let step = 0; step < 6; step++) {
      const out = await generate({ system: SYSTEM, contents, tools: TOOLS, model, pin: Boolean(model) });
      model = out.model;
      const { parts, content } = out;
      contents.push(content);
      const calls = parts.filter((p): p is Extract<Part, { functionCall: unknown }> => "functionCall" in p);
      if (!calls.length) break;
      const responses: Part[] = [];
      for (const c of calls) {
        const { name, args = {} } = c.functionCall;
        if (name === "submit_draft") {
          trace.push({ tool: name, args: {}, result: "Draft ready for review" });
          return { draft: String(args.message_english || ""), draftNative: String(args.message_native || ""), reason: String(args.reason || ""), trace };
        }
        const result = run(name, args);
        trace.push({ tool: name, args, result: JSON.stringify(result).slice(0, 160) });
        responses.push({ functionResponse: { name, response: result } });
      }
      contents.push({ role: "user", parts: responses }); // the request always ends with a user turn
    }
    throw new Error("The agent did not submit a draft");
  });
}
