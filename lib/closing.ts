/**
 * Demo: the deal closing, fast-forwarded.
 *
 * In the demo there is no real Real Estate Agent on the other end, so once a homebuyer sends a home, the agent
 * "accepts" it after 2 seconds and the whole closing plays out as a conversation: about a dozen messages in
 * ~10 seconds, each stamped with the day it would really happen (tour, offer or application, inspection,
 * signing, keys). Every step is written to the shared store, so the agent app and the dashboard follow along.
 *
 * The step counter lives on the lead (`lead.sim.step`), so the run survives navigating around the app or a
 * reload, and two open tabs can't apply the same step twice.
 */
"use client";
import type { DealType, Lead, LeadStatus, Listing } from "./types";
import { getListing } from "./adapters";
import { agentById, price } from "./recap";
import { getState, now, update } from "./store";

const DAY = 86_400_000;

export const DEAL: Record<DealType, { label: string; verb: string; done: string; owned: string; since: string; congrats: string }> = {
  buy: { label: "Buy", verb: "Buy it", done: "Bought", owned: "You own this home", since: "Owner since", congrats: "It's yours!" },
  rent: { label: "Rent", verb: "Rent it", done: "Renting", owned: "You're renting this home", since: "Renting since", congrats: "You're moving in!" },
  lease: { label: "Lease", verb: "Lease it", done: "Leased", owned: "Your lease is signed", since: "Lease signed", congrats: "Your lease is signed!" },
};

/** Which deals make sense for a listing. Rentals can be rented flexibly or leased for a fixed term. */
export function dealOptions(l: Pick<Listing, "kind">): DealType[] {
  if (l.kind === "buy" || l.kind === "land") return ["buy"];
  if (l.kind === "commercial") return ["lease"];
  return ["lease", "rent"];
}
export function dealTypeOf(lead: Pick<Lead, "dealType" | "chosenListingId">): DealType {
  if (lead.dealType) return lead.dealType;
  const l = getListing(lead.chosenListingId);
  return l ? dealOptions(l)[0] : "rent";
}
/** The deal a listing defaults to, honoring what the buyer said they want when it fits. */
export function defaultDeal(l: Pick<Listing, "kind">, want?: DealType | null): DealType {
  const opts = dealOptions(l);
  return want && opts.includes(want) ? want : opts[0];
}

type Step = { day: number; time: string; from: "agent" | "client" | "milestone"; text: string; status?: LeadStatus };

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const kUsd = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);

/** The conversation for this deal, day by day. Day 0 is the day the buyer sent the home. */
export function closingScript(lead: Lead, l: Listing): Step[] {
  const first = lead.clientName.replace(/^The /, "").split(" ")[0];
  const agent = agentById(lead.agentId);
  const me = agent.name.split(" ")[0];
  const start = lead.createdAt;
  const day = (d: number) => new Date(start + d * DAY).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const wd = (d: number) => new Date(start + d * DAY).toLocaleDateString("en-US", { weekday: "long" });
  const home = l.title;
  const street = l.address.split(",")[0] || home;
  const deal = dealTypeOf(lead);

  if (deal === "buy") {
    const offer = Math.round((l.price * 0.975) / 1000) * 1000;
    const pps = l.sqft ? usd(offer / l.sqft) : "";
    return [
      { day: 0, time: "9:12 AM", from: "agent", status: "verified", text: `Hi ${first}, it's ${agent.name} from Stonebridge Realty. I checked ${home} this morning: still on the market at ${price(l)}, and the sellers are motivated. Want to see it ${wd(2)}?` },
      { day: 0, time: "9:40 AM", from: "client", text: `Yes! ${wd(2)} morning works for us.` },
      { day: 2, time: "10:00 AM", from: "milestone", status: "touring", text: `Toured ${street}` },
      { day: 2, time: "2:15 PM", from: "client", text: "We loved it. The light in the living room is exactly what I was hoping for. What should we offer?" },
      { day: 2, time: "3:30 PM", from: "agent", text: `Recent sales nearby closed around ${pps || "the same"}${pps ? "/sq ft" : ""}. I'd offer ${kUsd(offer)} with a 10-day inspection period and ask for help with closing costs. Want me to write it up?` },
      { day: 3, time: "8:05 AM", from: "client", text: "Let's do it. Sending you the lender's pre-approval letter now." },
      { day: 4, time: "11:40 AM", from: "milestone", status: "application", text: `Offer accepted · under contract at ${kUsd(offer)}` },
      { day: 4, time: "11:42 AM", from: "agent", text: `They accepted! Earnest money goes to the title company by ${wd(7)}, and I booked the inspection for ${day(8)}.` },
      { day: 9, time: "4:20 PM", from: "agent", text: "Inspection report is in: only small items (a GFCI outlet and an old AC filter). The sellers agreed to a $2,500 repair credit." },
      { day: 17, time: "1:05 PM", from: "agent", text: `Appraisal came in at value and your lender issued clear to close. Final walkthrough ${day(23)}, signing the next morning at 10.` },
      { day: 24, time: "11:30 AM", from: "client", text: "All signed at the title office! Is that really it?" },
      { day: 24, time: "2:10 PM", from: "agent", text: `That's it. Funds are wired and the deed is recorded. Congratulations, ${first}: the keys are yours!` },
      { day: 24, time: "2:10 PM", from: "milestone", status: "closed", text: "Deal closed · keys handed over" },
    ];
  }

  if (deal === "lease" && l.kind === "commercial") {
    const rent = l.price;
    return [
      { day: 0, time: "9:20 AM", from: "agent", status: "verified", text: `Hi ${first}, ${agent.name} here. ${home} is available at ${price(l)}. The landlord is open to a 3 or 5-year term. Can you walk it ${wd(1)}?` },
      { day: 0, time: "10:02 AM", from: "client", text: `${wd(1)} at 4 works. I'll bring my contractor.` },
      { day: 1, time: "4:00 PM", from: "milestone", status: "touring", text: `Site visit at ${street}` },
      { day: 1, time: "6:30 PM", from: "client", text: "The space works. We'd need a small build-out for the front counter. Can we ask for help with that?" },
      { day: 3, time: "10:15 AM", from: "agent", text: `I sent a letter of intent: 5-year term at ${usd(rent)}/mo, 3% yearly increases, 2 months free and a $15/sq ft improvement allowance.` },
      { day: 6, time: "3:45 PM", from: "agent", text: "Landlord countered: 1 month free, $12/sq ft allowance, everything else accepted. I think that's a fair deal." },
      { day: 6, time: "5:10 PM", from: "client", text: "Agreed. Let's move forward." },
      { day: 7, time: "9:00 AM", from: "milestone", status: "application", text: "Letter of intent signed · lease drafting" },
      { day: 13, time: "2:30 PM", from: "agent", text: "The lease draft is back from the landlord's attorney. Your attorney approved it with two small edits, which they accepted." },
      { day: 15, time: "11:00 AM", from: "client", text: "Signed and the security deposit is sent!" },
      { day: 15, time: "3:20 PM", from: "agent", text: `Fully executed. Your build-out can start ${day(20)}. Congratulations on the new space, ${first}!` },
      { day: 15, time: "3:20 PM", from: "milestone", status: "closed", text: "Lease signed · keys handed over" },
    ];
  }

  // residential rentals: a fixed-term lease, or flexible month-to-month renting
  const term = deal === "lease" ? "12-month lease" : "month-to-month rental";
  return [
    { day: 0, time: "9:05 AM", from: "agent", status: "verified", text: `Hi ${first}, it's ${agent.name} from Stonebridge Realty. ${home} is available ${l.availableFrom === "Now" ? "now" : `from ${l.availableFrom}`} at ${price(l)}${l.petFriendly ? ", and pets are welcome" : ""}. Want to tour it ${wd(1)}?` },
    { day: 0, time: "9:31 AM", from: "client", text: `Yes please! ${wd(1)} after work, around 6?` },
    { day: 1, time: "6:00 PM", from: "milestone", status: "touring", text: `Toured ${street}` },
    { day: 1, time: "8:15 PM", from: "client", text: `It's perfect. How do I apply for the ${term}?` },
    { day: 1, time: "8:40 PM", from: "agent", text: `I sent you the application. It's a $50 fee, a photo ID and proof of income (about 3x the rent). ${deal === "lease" ? "I'll also ask them to lock this rent for the full 12 months." : "Month-to-month is a bit more per month but you can leave with 30 days' notice."}` },
    { day: 2, time: "7:50 AM", from: "milestone", status: "application", text: "Application submitted" },
    { day: 4, time: "1:15 PM", from: "agent", text: "Good news: you're approved! Background and income checks came back clean." },
    { day: 4, time: "1:30 PM", from: "client", text: "Amazing!! What's next?" },
    { day: 5, time: "10:00 AM", from: "agent", text: `The ${term} is in your inbox to e-sign. Move-in costs are the first month's rent plus a ${usd(l.price)} deposit.` },
    { day: 5, time: "9:45 PM", from: "client", text: "Signed and paid!" },
    { day: 8, time: "11:00 AM", from: "agent", text: `Keys are ready at the leasing office on ${day(8)}. Welcome home, ${first}!` },
    { day: 8, time: "11:00 AM", from: "milestone", status: "closed", text: deal === "lease" ? "Lease signed · keys handed over" : "Rental agreement signed · keys handed over" },
  ];
}

/** When a step "happened": day N after the lead came in, at the step's clock time. */
function stampOf(lead: Lead, s: Step): number {
  const m = /^(\d+):(\d+) (AM|PM)$/.exec(s.time);
  const mins = m ? ((+m[1] % 12) + (m[3] === "PM" ? 12 : 0)) * 60 + +m[2] : 9 * 60;
  // day 0 is "today": the script's clock reads as minutes after the home was sent (9:12 AM → 12 min later)
  if (s.day === 0) return lead.createdAt + Math.max(1, mins - 9 * 60) * 60_000;
  const d = new Date(lead.createdAt + s.day * DAY);
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d.getTime();
}

function apply(id: string, expected: number) {
  update((s) => {
    const lead = s.leads.find((x) => x.id === id);
    const l = lead && getListing(lead.chosenListingId);
    if (!lead || !l || (lead.sim?.step ?? 0) !== expected) return;
    const step = closingScript(lead, l)[expected];
    if (!step) return;
    const at = stampOf(lead, step);
    if (step.from === "milestone") lead.messages.push({ from: "ai", text: step.text, at, milestone: true });
    else lead.messages.push({ from: step.from, text: step.text, at });
    if (step.from === "client") lead.lastClientActivity = now();
    if (step.status) {
      lead.status = step.status;
      if (step.status === "verified") {
        lead.checklist = { available: true, price: true, fits: true, legal: true };
        lead.events.push({ at: now(), label: `Verified by ${agentById(lead.agentId).name}`, actor: "agent" });
      } else if (step.status === "closed") {
        lead.closedAt = at;
        lead.events.push({ at: now(), label: "Deal closed", actor: "agent" });
      } else lead.events.push({ at: now(), label: step.text, actor: "system" });
    }
    lead.sim = { step: expected + 1 };
  });
}

const running = new Set<string>();
const ACCEPT_MS = 2000; // the agent "accepts" the home 2 seconds after it's sent
const STEP_MS = 700; // then one message every 0.7s: about 10 seconds to close

/** Plays (or resumes) the fast-forwarded closing for a lead the homebuyer sent. Safe to call repeatedly. */
export function runClosing(id: string) {
  if (running.has(id)) return;
  const lead0 = getState().leads.find((x) => x.id === id);
  if (!lead0?.sim || lead0.status === "closed" || lead0.status === "cancelled") return;
  running.add(id);
  const tick = () => {
    const lead = getState().leads.find((x) => x.id === id);
    const l = lead && getListing(lead.chosenListingId);
    const i = lead?.sim?.step ?? 0;
    if (!lead || !l || lead.status === "closed" || lead.status === "cancelled" || i >= closingScript(lead, l).length) {
      running.delete(id);
      return;
    }
    apply(id, i);
    setTimeout(tick, STEP_MS);
  };
  setTimeout(tick, (lead0.sim.step ?? 0) === 0 ? ACCEPT_MS : 500);
}

/** True while the closing is still playing (the UI shows a typing indicator and the fast-forward date). */
export const closingLive = (lead: Lead) => Boolean(lead.sim) && lead.status !== "closed" && lead.status !== "cancelled";

export const fmtDay = (t: number) => new Date(t).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
