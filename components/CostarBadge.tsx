/* CoStar facts for one listing: provenance + the numbers an agent would check first. */
import type { Listing } from "@/lib/types";

export default function CostarBadge({ l, className = "" }: { l: Listing; className?: string }) {
  const c = l.costar;
  if (!c) return null;
  const facts: string[] = [];
  if (c.dataset === "residential-listings") {
    if (c.dom != null) facts.push(`${c.dom} days on market`);
    if (c.pricePerSqft) facts.push(`$${c.pricePerSqft}/sq ft`);
    if (c.originalPrice && c.originalPrice > l.price) facts.push(`cut ${Math.round(((c.originalPrice - l.price) / c.originalPrice) * 100)}% from $${Math.round(c.originalPrice / 1000)}k`);
    if (l.yearBuilt) facts.push(`built ${l.yearBuilt}`);
  } else {
    if (c.planUnitsAvailable) facts.push(`${c.planUnitsAvailable} of this plan open`);
    if (c.unitsAvailable && c.totalUnits) facts.push(`${c.unitsAvailable}/${c.totalUnits} units available`);
    if (c.maxRent && c.maxRent > l.price) facts.push(`up to $${c.maxRent.toLocaleString("en-US")}/mo`);
    if (c.manager) facts.push(c.manager);
  }
  if (l.sqft) facts.push(`${l.sqft.toLocaleString("en-US")} sq ft`);
  return (
    <div className={`rounded-2xl border border-[#E1E7EF] px-3 py-2.5 ${className}`}>
      <div className="text-[11px] font-semibold tracking-wide text-mute uppercase">
        CoStar · {c.dataset === "residential-listings" ? "Homes.com MLS listing" : "Apartments.com community"}
      </div>
      <div className="mt-1 text-[13px] text-[#4A586D] leading-snug">{facts.join(" · ")}</div>
    </div>
  );
}
