/**
 * CoStar listing source.
 * data/listings.json is generated from the CoStar data kit by `npm run costar`
 * (scripts/ingest-costar.mjs): Homes.com residential listings + Apartments.com
 * communities in Houston and Los Angeles, each with a Matterport 3D model.
 */
import data from "@/data/listings.json";
import type { Listing } from "../types";

const listings = data as unknown as Listing[];

export const costarSource = {
  id: "costar",
  label: "CoStar (Homes.com + Apartments.com) · Houston & Los Angeles",
  enabled: () => true,
  fetchListings: async () => listings,
  sync: () => listings,
};
