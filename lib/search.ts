/**
 * Matching engine: hard filters (intent, budget, beds, pets) + soft "vibe"
 * scoring against tags produced by the vibe model. Relaxes filters gracefully
 * so the user always gets three homes.
 */
import type { Criteria, Listing } from "./types";
import { DEMO_CITY } from "./markets";

const VIBE_SYNONYMS: Record<string, string[]> = {
  cozy: ["cozy", "warm", "charming"],
  artsy: ["artsy", "creative"],
  bright: ["bright", "airy"],
  quiet: ["quiet", "calm"],
  modern: ["contemporary", "minimalist", "sleek"],
  minimalist: ["minimalist", "calm"],
  gothic: ["gothic"],
  historic: ["historic", "victorian", "gothic", "craftsman"],
  urban: ["urban", "industrial"],
  luxury: ["resort", "sleek"],
  "modern farmhouse": ["modern farmhouse"],
  garden: ["leafy", "garden"],
  industrial: ["industrial", "lofty", "urban"],
  scandinavian: ["scandinavian"],
  victorian: ["victorian"],
  craftsman: ["craftsman"],
};

export function vibeScore(l: Listing, vibe: string): number {
  const tags = [l.style, ...l.ambience, ...l.materials];
  const syn = VIBE_SYNONYMS[vibe] || [vibe];
  let s = syn.some((x) => tags.includes(x)) ? 1 : 0;
  if (vibe === "bright") s = Math.max(s * 0.6, l.light) ;
  return s;
}

export interface Scored { listing: Listing; score: number }

export function search(all: Listing[], c: Criteria, exclude: string[] = []): Scored[] {
  const intent = c.intent ?? "rent";
  const city = c.city || DEMO_CITY;
  const attempt = (relax: number) =>
    all
      .filter((l) => l.kind === intent && !exclude.includes(l.id) && (!l.city || l.city === city))
      .filter((l) => !c.budgetMax || l.price <= c.budgetMax * (1 + relax * 0.12))
      .filter((l) => c.bedsMin === undefined || relax >= 2 || l.beds >= c.bedsMin)
      .filter((l) => !c.pets || relax >= 3 || l.petFriendly)
      .filter((l) => !c.neighborhoods.length || relax >= 1 || c.neighborhoods.includes(l.neighborhood));

  let pool = attempt(0);
  for (let r = 1; pool.length < 3 && r <= 4; r++) pool = attempt(r);

  const scored = pool.map((l) => {
    let s = 0;
    c.vibes.forEach((v, i) => (s += vibeScore(l, v) * (i === 0 ? 3 : i === 1 ? 2 : 1.2)));
    if (c.maxMinutes) {
      const min = c.walkable && l.commuteMode === "drive" ? l.minutesToCampus * 4 : l.minutesToCampus;
      s += min <= c.maxMinutes ? 2 - min / (c.maxMinutes * 2) : -1;
    }
    if (c.walkable && l.commuteMode === "drive") s -= 1.5;
    if (c.bedsMin !== undefined && l.beds === c.bedsMin) s += 0.6;
    if (c.budgetMax) s += 0.8 * (1 - Math.abs(c.budgetMax * 0.92 - l.price) / c.budgetMax);
    if (c.sortCheaper && c.budgetMax) s += (c.budgetMax - l.price) / c.budgetMax * 3;
    if (c.pets && l.petFriendly) s += 1;
    if (c.neighborhoods.length && c.neighborhoods.includes(l.neighborhood)) s += 1.5;
    return { listing: l, score: s };
  });
  return scored.sort((a, b) => b.score - a.score);
}

export function topThree(all: Listing[], c: Criteria, exclude: string[] = []) {
  return search(all, c, exclude).slice(0, 3).map((s) => s.listing);
}
