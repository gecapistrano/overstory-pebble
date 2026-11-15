/**
 * Pebble's design-style taxonomy: the "vibe" layer CoStar doesn't have.
 * One source of truth for the vision model (Matterport interior scans, listing / client photos),
 * the request parser, the matcher and the UI. Keys are lowercase; LABEL gives the display name.
 *
 * Plain TS with no TS-only runtime syntax, so `node scripts/scan-interiors.mjs` can import it directly.
 */

export const STYLES = [
  "modern", "contemporary", "minimalist", "scandinavian", "japandi", "industrial", "mid-century modern",
  "traditional", "transitional", "bohemian", "modern farmhouse", "coastal", "rustic", "art deco",
] as const;
export type Style = (typeof STYLES)[number];

export const LABEL: Record<Style, string> = {
  modern: "Modern", contemporary: "Contemporary", minimalist: "Minimalist", scandinavian: "Scandinavian",
  japandi: "Japandi", industrial: "Industrial", "mid-century modern": "Mid-Century Modern", traditional: "Traditional",
  transitional: "Transitional", bohemian: "Bohemian (Boho)", "modern farmhouse": "Farmhouse / Modern Farmhouse",
  coastal: "Coastal", rustic: "Rustic", "art deco": "Art Deco",
};

/** What each style looks like, so the vision model and the people reading its output agree on the words. */
export const CUES: Record<Style, string> = {
  modern: "clean lines, flat-panel cabinetry, black/white/grey, glass and metal, little ornament",
  contemporary: "current-trend finishes, mixed neutrals, statement lighting, open plan, quartz, large-format tile",
  minimalist: "very few objects, hidden storage, monochrome, bare surfaces, open floor space",
  scandinavian: "white walls, pale oak or birch floors, light textiles, hygge warmth, lots of daylight",
  japandi: "warm natural wood, low furniture, muted earth tones, paper/linen/rattan, calm and uncluttered",
  industrial: "exposed brick, ductwork or concrete, metal, Edison bulbs, high ceilings, loft feel",
  "mid-century modern": "1950s–60s lines, tapered legs, teak/walnut, graphic accents, low-slung pieces, globe lights",
  traditional: "crown molding, raised-panel doors, rich wood, symmetry, classic patterns, formal rooms",
  transitional: "traditional bones with modern simplicity, greige palette, shaker cabinets, soft lines",
  bohemian: "layered rugs and textiles, plants, global patterns, saturated mixed colors, collected look",
  "modern farmhouse": "shiplap, shaker cabinets, farmhouse sink, black fixtures, white and wood, barn doors",
  coastal: "white and sand with blue accents, whitewashed wood, rattan, breezy and light",
  rustic: "rough-hewn beams, reclaimed or knotty wood, stone, warm and heavy textures",
  "art deco": "geometric patterns, brass/gold, velvet, bold contrast, glamour, curved statement pieces",
};

/** Feel words: not a style, but what people say about how a place feels. */
export const FEELS = ["cozy", "bright", "airy", "calm", "quiet", "warm", "moody", "creative", "luxurious", "leafy", "historic", "urban"] as const;

/** How people say it, mapped to a style key. Used by the offline parser and to normalize model output. */
export const STYLE_WORDS: [RegExp, Style][] = [
  [/\bjapandi\b|japanese[- ]scandi|wabi[- ]sabi|\bzen\b/, "japandi"],
  [/\bmid[- ]?century|\bmcm\b|\bretro\b|\b(19)?[56]0s\b|eames/, "mid-century modern"],
  [/\bscandi(navian)?\b|\bnordic\b|\bhygge\b/, "scandinavian"],
  [/\bminimal(ist)?\b|clean lines|clutter[- ]free|\bsimple\b/, "minimalist"],
  [/\bindustrial\b|\bloft\b|exposed brick|concrete floors?/, "industrial"],
  [/\bboho\b|\bbohemian\b|\beclectic\b/, "bohemian"],
  [/\bfarmhouse\b|\bshiplap\b|barn doors?/, "modern farmhouse"],
  [/\bcoastal\b|\bbeachy?\b|\bnautical\b|\bhamptons\b/, "coastal"],
  [/\brustic\b|\bcabin\b|reclaimed wood|\blodge\b/, "rustic"],
  [/\bart[- ]deco\b|\bdeco\b|\bgatsby\b/, "art deco"],
  [/\btransitional\b/, "transitional"],
  [/\btraditional\b|\bclassic(al)?\b|\bvictorian\b|\bcolonial\b|\bcraftsman\b|\bbungalow\b|\bgothic\b/, "traditional"],
  [/\bcontemporary\b/, "contemporary"],
  [/\bmodern\b|\bsleek\b/, "modern"],
];

/** Older Pebble tags (and free-form model output) mapped onto the taxonomy. */
const LEGACY: Record<string, Style> = {
  colonial: "traditional", victorian: "traditional", craftsman: "traditional", gothic: "traditional", historic: "traditional",
  artsy: "bohemian", boho: "bohemian", farmhouse: "modern farmhouse", "mid century modern": "mid-century modern",
  "mid-century": "mid-century modern", midcentury: "mid-century modern", scandi: "scandinavian",
};

export function toStyle(s: string | null | undefined): Style | null {
  if (!s) return null;
  const k = s.toLowerCase().replace(/\s*\(.*\)\s*/g, "").replace(/\s*\/.*$/, "").trim();
  if ((STYLES as readonly string[]).includes(k)) return k as Style;
  if (LEGACY[k]) return LEGACY[k];
  for (const [re, st] of STYLE_WORDS) if (re.test(k)) return st;
  return null;
}

export const isStyle = (s: string): s is Style => (STYLES as readonly string[]).includes(s);
