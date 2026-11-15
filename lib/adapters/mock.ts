/** Legacy Princeton demo listings (kept for reference; no longer an active source). */
import data from "@/data/legacy/princeton-listings.json";
import type { Listing } from "../types";

const listings = data as Listing[];

export const mockSource = {
  id: "mock",
  label: "Pebble demo listings (Princeton, NJ) — legacy",
  enabled: () => false,
  fetchListings: async () => listings,
  sync: () => listings,
};
