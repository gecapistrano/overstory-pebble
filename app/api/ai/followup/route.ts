/**
 * Follow-up AGENT (Gemini function calling).
 * Given a deal that has gone quiet, Gemini decides which tools to call
 * (read the deal history, re-check the listing, look for alternatives),
 * then submits a draft check-in. It never sends anything: the licensed agent
 * reviews the draft and taps Send. AI suggests, a human verifies.
 */
import listings from "@/data/listings.json";
import market from "@/data/market.json";
import { dealLead, num, readBody } from "@/lib/validate";
import type { Lead, Listing } from "@/lib/types";
import { generate, OutOfTimeError, type Content, type FunctionDecl, type Part } from "@/lib/gemini";
import { BUDGET, handle } from "@/lib/ai-server";
import { search } from "@/lib/search";

export const dynamic = "force-dynamic";

const ALL = listings as unknown as Listing[];

const TOOLS: FunctionDecl[] = [
  { name: "get_deal_history", description: "Read the deal's stage, how long the client has been quiet, the messages so far and the timeline.", parameters: { type: "object", properties: {} } },
  { name: "check_listing", description: "Look up a listing in Pebble's dated CoStar snapshot (not a live feed): price, move-in date and pet policy as of the snapshot date, and whether the human agent has confirmed it is still available.", parameters: { type: "object", properties: { listing_id: { type: "string" } }, required: ["listing_id"] } },
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
A client has gone quiet. Investigate with your tools before writing: read the deal history and look up the listing.
Listing data is a dated CoStar snapshot, not live. Unless check_listing says agent_confirmed_available is true, you do NOT know
whether the house is still available: never write that it is "still available", "still on the market" or "hasn't sold".
Instead offer to confirm it ("I can check it's still open and set up a tour"), and quote prices as the listed price.
If it may no longer fit, look for similar houses. Then call submit_draft once, and in "reason" say whether availability still needs checking.
Never invent facts. Never pressure. Never mention protected characteristics. The human agent approves every message.`;

/** Date the CoStar numbers describe: list date + days on market, else the ingest date. Never "now". */
function snapshotDate(l: Listing): string {
  const listed = l.costar?.listDate ? Date.parse(l.costar.listDate) : NaN;
  if (Number.isFinite(listed) && typeof l.costar?.dom === "number") return new Date(listed + l.costar.dom * 86400000).toISOString().slice(0, 10);
  return (market as { generatedAt?: string }).generatedAt || "unknown";
}

/** Phrases that state a house is still on offer. Only allowed once the human agent has confirmed it. */
const CLAIMS_AVAILABLE = /\b(still (available|on the market|listed|open|for (sale|rent))|available (now|today|right now)|(hasn'?t|has not|not yet) (sold|been (sold|rented|taken|leased))|it'?s still (yours|there))\b/gi;
/** "I can check it's still open" is the honest wording we ask for: only a claim not framed as a check counts. */
const HEDGE = /\b(confirm|check|see|verify|make sure|find out|ask|whether|if)\b[^.!?]*$/i;
function claimsAvailability(text: string): boolean {
  for (const m of text.matchAll(CLAIMS_AVAILABLE)) {
    const before = text.slice(0, m.index).split(/[.!?]/).pop() || ""; // same sentence, up to the phrase
    if (!HEDGE.test(before)) return true;
  }
  return false;
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readBody(req);
    const lead = dealLead(body.lead) as unknown as Lead;
    const now = body.now === undefined ? Date.now() : num(body.now, "now");
    // the human agent's own check, from the lead's verification checklist (lib/store.ts setCheck / verifyLead)
    const agentConfirmedAvailable = lead.checklist?.available === true;
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
        // Pebble has no live feed: report what the snapshot said and when, and who (if anyone) confirmed it since.
        return l
          ? {
              found: true, source: "CoStar listing snapshot (not live)", snapshot_date: snapshotDate(l),
              availability: agentConfirmedAvailable ? "confirmed by the human agent on the deal checklist" : "unconfirmed: the snapshot may be out of date and the house may have sold or been rented since",
              agent_confirmed_available: agentConfirmedAvailable,
              title: l.title, price_at_snapshot: l.price, available_from_at_snapshot: l.availableFrom, pets_allowed: l.petFriendly,
              days_on_market_at_snapshot: l.costar?.dom ?? null, original_price: l.costar?.originalPrice ?? null, units_available_at_snapshot: l.costar?.unitsAvailable ?? null,
              plan_units_available_at_snapshot: l.costar?.planUnitsAvailable ?? null, has_3d_tour: Boolean(l.matterportId), neighborhood: l.neighborhood,
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
    // A tool-calling conversation can't switch models halfway, so a run stays on the model of its first step.
    // If that model fails mid-run (quota, overload, timeout), start the run over on the next model, while
    // the request's time budget lasts (lib/gemini.ts withBudget), instead of failing the whole follow-up.
    const failed: string[] = [];
    let model: string | undefined; // the model this run is on (set by its first step)
    /** One run of the agent loop on one model; returns the draft, or null if the model never submits one. */
    const runAgent = async () => {
      for (let step = 0; step < 6; step++) {
        const out = await generate({ system: SYSTEM, contents, tools: TOOLS, model, pin: Boolean(model), exclude: failed });
        model = out.model;
        const { parts, content } = out;
        contents.push(content);
        const calls = parts.filter((p): p is Extract<Part, { functionCall: unknown }> => "functionCall" in p);
        if (!calls.length) return null;
        const responses: Part[] = [];
        for (const c of calls) {
          const { name, args = {} } = c.functionCall;
          if (name === "submit_draft") {
            const draft = String(args.message_english || ""), draftNative = String(args.message_native || "");
            let reason = String(args.reason || "");
            // last line of defence: the model was told not to claim availability, but check its words anyway
            const claims = !agentConfirmedAvailable && claimsAvailability(draft);
            if (claims) reason = `⚠ This draft says the house is still available, but nobody has confirmed that since the CoStar snapshot. Check before sending. ${reason}`;
            trace.push({ tool: name, args: {}, result: claims ? "Draft ready for review (flagged: unconfirmed availability claim)" : "Draft ready for review" });
            return { draft, draftNative, reason, availabilityConfirmed: agentConfirmedAvailable, availabilityClaimFlagged: claims, trace };
          }
          const result = run(name, args);
          trace.push({ tool: name, args, result: JSON.stringify(result).slice(0, 160) });
          responses.push({ functionResponse: { name, response: result } });
        }
        contents.push({ role: "user", parts: responses }); // the request always ends with a user turn
      }
      return null;
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      contents.length = 1; // start over from the opening user turn
      trace.length = 0;
      model = undefined;
      try {
        const done = await runAgent();
        if (done) return done;
        throw new Error("The agent did not submit a draft");
      } catch (e) {
        if (e instanceof OutOfTimeError || !model) throw e; // out of time, or every model already failed on the first step
        failed.push(model);
        console.warn(`[followup] ${model} failed mid-run, restarting on another model:`, String(e).slice(0, 120));
      }
    }
    throw new Error("The agent did not submit a draft");
  }, BUDGET.long);
}
