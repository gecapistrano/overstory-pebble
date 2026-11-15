/** Which listings have a drone-captured exterior 3D model (see scripts/link-exteriors.mjs). */
import data from "@/data/exteriors.json";

const map = data as Record<string, { sid: string; lat: number; lng: number }>;
export const exteriorOf = (listingId: string) => map[listingId];
export const hasExterior = (listingId: string) => listingId in map;
