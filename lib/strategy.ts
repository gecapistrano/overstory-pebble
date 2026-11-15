/**
 * Strategy suggestions for the broker. Each one is written like a personal assistant would: what I looked at,
 * what I noticed, what I'd do, and what to expect. Every number comes from `factsOf(signals)`, and every
 * suggestion lists the fact ids it relies on, so the dashboard can show the evidence next to it.
 * Gemini writes these when it is available (app/api/ai/strategy); this file is the on-device version.
 */
import { fmtMoney, type Fact, type Signals } from "./brokerage";

export interface Strategy {
  id: string;
  title: string;
  summary: string; // one or two sentences, shown on the card
  impact: string; // short expected effect, shown on the card
  successRate: number; // 0-100: how likely the plan delivers the expected result
  thinking: string[]; // first-person reasoning steps
  evidence: string[]; // fact ids from factsOf()
  plan: string[];
  expected: string;
  confidence: string; // why that success rate
  byGemini?: boolean;
}

const idOf = (t: string) => "st-" + t.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
/** Bigger samples and bigger gaps earn more confidence; never certain. */
const sure = (n: number, gap: number) => Math.max(35, Math.min(85, Math.round(45 + Math.min(25, n / 8) + Math.min(15, gap / 2))));

export function localStrategies(s: Signals): Strategy[] {
  const out: Strategy[] = [];
  const first = (name?: string) => name?.split(" ")[0] || "the team";

  // 1) speed to first reply
  const gap = s.fastCloseRate - s.slowCloseRate;
  if (s.slowest && gap > 0) {
    const extra = Math.max(1, Math.round(s.slowLeadsPerMonth * (gap / 100)));
    out.push({
      id: idOf("first-reply"),
      title: "Get every first reply under 5 minutes",
      summary: `Leads we answer within 5 minutes close at ${s.fastCloseRate}%, slower ones at ${s.slowCloseRate}%. ${first(s.slowest.name)} is averaging ${s.slowest.responseMin} min right now.`,
      impact: `≈ +${extra} deals / month · ${fmtMoney(extra * s.avgFee)}`,
      successRate: sure(s.fastN + s.slowN, gap),
      thinking: [
        `I went back through every settled lead from the last few months and split them by how fast an agent first replied.`,
        `The ones answered within 5 minutes closed ${s.fastCloseRate}% of the time (${s.fastN} leads). The slower ones closed ${s.slowCloseRate}% (${s.slowN} leads). That's a ${gap}-point gap, and it holds across a decent number of leads, so I don't think it's luck.`,
        `Then I checked who is slow this month. ${s.slowest.name} is at ${s.slowest.responseMin} min across ${s.slowest.leads} leads${s.fastest ? `, while ${s.fastest.name} is at ${s.fastest.responseMin} min` : ""}.`,
        `About ${s.slowLeadsPerMonth} leads a month land in the slow group. If they closed like the fast group, that's roughly ${extra} more deals at our ${fmtMoney(s.avgFee)} average fee.`,
      ],
      evidence: ["fast", "slow", "slowest", "fastest", "resp", "fee"],
      plan: [
        `Turn on instant routing: a new lead goes to whichever agent is free, not only the listing agent.`,
        `Give ${first(s.slowest.name)} a phone alert with the Agentic Assistant's recap, so a first reply takes one tap.`,
        `Review the average reply time with the team every Monday.`,
      ],
      expected: `About +${extra} closed deals a month (${fmtMoney(extra * s.avgFee)} in fees), and the team's average first reply below 5 minutes within two weeks.`,
      confidence: `I'm fairly confident. The gap shows up across ${s.fastN + s.slowN} leads, and routing is fully in our hands. What could lower it: fast replies help most when the home is still available, and that part we don't control.`,
    });
  }

  // 2) quiet clients + follow-ups
  if (s.quietNow > 0 && s.rescueRate > s.unnudgedCloseRate) {
    const back = Math.max(1, Math.round(s.quietNow * (s.rescueRate / 100)));
    out.push({
      id: idOf("quiet-clients"),
      title: s.quietNow === 1 ? `Follow up with ${s.quietNames[0] || "the quiet client"} today` : `Follow up with the ${s.quietNow} quiet clients today`,
      summary: `${s.quietNow} clients have gone quiet after a tour. When we follow up, ${s.rescueRate}% of quiet clients still close. Without one, ${s.unnudgedCloseRate}% do.`,
      impact: `≈ ${back} saved deals · ${fmtMoney(back * s.avgFee)}`,
      successRate: sure(s.rescueN, s.rescueRate - s.unnudgedCloseRate),
      thinking: [
        `I looked for clients who toured a home and then stopped replying for 2 days or more. Right now there are ${s.quietNow}${s.quietNames.length ? `, including ${s.quietNames.slice(0, 3).join(", ")}` : ""}.`,
        `In the past, quiet clients who got a follow-up from the Agentic Assistant closed ${s.rescueRate}% of the time (${s.rescueN} cases). Those who got nothing closed ${s.unnudgedCloseRate}%.`,
        `So the follow-up is the difference. It already saved ${s.saved} deal${s.saved === 1 ? "" : "s"} this month (${fmtMoney(s.savedValue)}).`,
        `${s.quietNow} quiet clients × ${s.rescueRate}% is about ${back} deal${back === 1 ? "" : "s"} we can still win back.`,
      ],
      evidence: ["quiet", "rescue", "norescue", "saved", "fee"],
      plan: [
        `Approve the drafted follow-ups in the agent app now. Each one is already written from the client's own words.`,
        `For anyone still silent 48 hours later, have the agent call instead of texting.`,
        `Make same-day follow-ups the default for every quiet client.`,
      ],
      expected: `About ${back} of the ${s.quietNow} quiet clients come back and close (${fmtMoney(back * s.avgFee)}).`,
      confidence: `Based on ${s.rescueN} past quiet clients. It's a smaller sample than reply times, so I'm keeping the estimate modest.`,
    });
  }

  // 3) where customers are looking, cross-checked with CoStar
  if (s.topArea) {
    const a = s.topArea;
    const tags = s.topTags.slice(0, 2).map((t) => t.tag);
    const wins = Math.max(1, Math.round(s.topAreaHot * (s.hotCloseRate / 100)));
    out.push({
      id: idOf("area-" + a.name),
      title: `Put ${a.name} listings in front of hot shoppers`,
      summary: `${a.shoppers} shoppers looked at ${a.name} this month, ${s.topAreaHot} of them likely to buy or rent soon.${a.dom != null ? ` CoStar: ${a.dom} median days on market${a.priceCut != null ? `, ${a.priceCut}% with a price cut` : ""}.` : ""}`,
      impact: `≈ ${wins} deals from ${s.topAreaHot} hot shoppers`,
      successRate: sure(a.shoppers, 10),
      thinking: [
        `I checked where our customers spend their time. ${a.name} leads with ${a.shoppers} shoppers and ${a.views} listing views in the last 30 days.`,
        tags.length ? `What they ask for most is ${tags.join(" and ")}, so I'd pick homes there with those features.` : `I matched that against what they search for.`,
        a.dom != null && a.dom <= 14
          ? `CoStar says ${a.name} homes go in a median ${a.dom} days${a.ppsf ? ` at $${a.ppsf}/sq ft` : ""}${a.priceCut != null ? `, and only ${a.priceCut}% have cut their price` : ""}. Homes there move fast, so whoever tours first wins.`
          : a.priceCut != null && a.priceCut >= 25
            ? `CoStar says ${a.name} homes sit ${a.dom ?? "—"} days on market${a.ppsf ? ` at a median $${a.ppsf}/sq ft` : ""}, and ${a.priceCut}% have already cut their price. Sellers there are motivated, so there's room to negotiate for our buyers.`
            : `CoStar says ${a.name} homes sit ${a.dom ?? "—"} days on market${a.ppsf ? ` at a median $${a.ppsf}/sq ft` : ""}${a.priceCut != null ? `, with ${a.priceCut}% of listings cutting their price` : ""}. That's a steady market where good matches matter more than discounts.`,
        `${s.topAreaHot} high-likelihood shoppers are already looking there. Once a client tours, we close ${s.hotCloseRate}% of the time, so getting them to a tour is the lever.`,
      ],
      evidence: ["area", "tags", "hot", "areadom", "areacut", "areappsf", "tourclose"],
      plan: [
        `Send the ${s.topAreaHot} hot shoppers a short list of ${a.name} homes that match their tags, with the 3D tour link.`,
        `Offer each of them a tour slot this weekend.`,
        a.dom != null && a.dom <= 14 ? `Book tours within 48 hours; at ${a.dom} days on market, waiting loses the home.` : `For listings with a price cut, lead with that in the message.`,
      ],
      expected: `If even the hot shoppers tour, about ${wins} deal${wins === 1 ? "" : "s"} from ${a.name} over the next month.`,
      confidence: `Demand comes from our own customer data and the price picture from CoStar, so both halves are measured. The unknown is how many will book a tour.`,
    });
  }
  // 4) city-wide: motivated sellers (CoStar) for buyers we already have
  if (out.length < 3 && s.market.priceCutSharePct != null) {
    const cut = s.market.priceCutSharePct, dom = s.market.medianDaysOnMarket;
    out.push({
      id: idOf("price-cuts-" + s.city),
      title: `Use ${s.city}'s price cuts to win buyers`,
      summary: `CoStar shows ${cut}% of ${s.city} listings have cut their price and homes sit ${dom ?? "—"} days on market. Buyers have leverage right now.`,
      impact: `More offers accepted · ${fmtMoney(s.avgFee)} per deal`,
      successRate: sure(s.market.activeForSale || 0, cut / 3),
      thinking: [
        `I looked at the whole ${s.city} market in CoStar: ${s.market.activeForSale ?? "—"} homes for sale, ${cut}% of them with a price cut, ${dom ?? "—"} median days on market.`,
        `When that many sellers have already cut, they're usually open to offers below asking.`,
        `Once our clients tour, we close ${s.hotCloseRate}% of the time, so the job is getting buyers to tours of these homes and coaching their offers.`,
      ],
      evidence: ["cut", "dom", "tourclose", "fee"],
      plan: [`Have agents pull the price-cut listings that match each active buyer.`, `Open offers 2–3% under asking where the home has sat longer than ${dom ?? 30} days.`],
      expected: `A higher share of offers accepted on homes that have sat a while, at our ${fmtMoney(s.avgFee)} average fee per deal.`,
      confidence: `The market numbers are measured by CoStar; how each seller responds is not in our control, so I'm moderate on this one.`,
    });
  }
  return out.slice(0, 3);
}

/** Drops anything a model invented: unknown fact ids, missing reasoning, out-of-range rates. */
export function cleanStrategies(raw: unknown, facts: Fact[]): Strategy[] {
  const ids = new Set(facts.map((f) => f.id));
  const list = Array.isArray(raw) ? raw : [];
  return list.map((x) => x as Partial<Strategy>).filter((x) => x.title && x.summary && Array.isArray(x.thinking) && x.thinking.length >= 2).map((x) => ({
    id: idOf(String(x.title)),
    title: String(x.title).slice(0, 80),
    summary: String(x.summary).slice(0, 320),
    impact: String(x.impact || "").slice(0, 80),
    successRate: Math.max(5, Math.min(95, Math.round(Number(x.successRate) || 50))),
    thinking: (x.thinking as unknown[]).map(String).slice(0, 6),
    evidence: (Array.isArray(x.evidence) ? x.evidence.map(String) : []).filter((e) => ids.has(e)),
    plan: (Array.isArray(x.plan) ? x.plan.map(String) : []).slice(0, 5),
    expected: String(x.expected || ""),
    confidence: String(x.confidence || ""),
    byGemini: true,
  })).filter((x) => x.evidence.length >= 2).slice(0, 3);
}
