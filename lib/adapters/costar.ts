/**
 * CoStar listing source.
 * data/listings.json is generated from the CoStar data kit by `npm run costar`
 * (scripts/ingest-costar.mjs): Homes.com residential listings + Apartments.com
 * communities in Houston and Los Angeles, each with a Matterport 3D model.
 *
 * data/interiors.json comes from `npm run scan` (scripts/scan-interiors.mjs): Gemini vision's
 * read of each listing's Matterport scan, room by room. When a listing has one, its design style,
 * feel, palette and light come from what the scan shows instead of the guess from listing text.
 */
import data from "@/data/listings.json";
import interiors from "@/data/interiors.lite.json";
import type { InteriorProfile, Listing } from "../types";
import { toStyle } from "../styles";

const scans = interiors as unknown as Record<string, InteriorProfile & { homeInterior?: boolean }>;

function enrich(l: Listing): Listing {
  const guessed = toStyle(l.style) || "transitional"; // ingest tagged styles from listing text; put them on the taxonomy
  const scan = l.matterportId ? scans[l.matterportId] : undefined;
  if (!scan || scan.homeInterior === false || !scan.styles.length) return { ...l, style: guessed, styles: [guessed] };
  return {
    ...l,
    style: scan.styles[0].name,
    styles: scan.styles.map((s) => s.name),
    ambience: [...new Set([...scan.feel, ...l.ambience])].slice(0, 6),
    materials: scan.materials.length ? scan.materials : l.materials,
    colors: scan.palette.length ? scan.palette : l.colors,
    light: scan.light || l.light,
    interior: scan,
  };
}

const listings = (data as unknown as Listing[]).map(enrich);

export const costarSource = {
  id: "costar",
  label: "CoStar (Homes.com + Apartments.com) · Houston & Los Angeles · interiors read from Matterport scans",
  enabled: () => true,
  fetchListings: async () => listings,
  sync: () => listings,
};
