/**
 * Listing adapter layer.
 *
 * Every listing source (mock data, a partner brokerage API, an MLS / RESO Web API
 * feed, or agent uploads) implements ListingSource and returns normalized Listing
 * objects. The search engine only ever sees Listing[] — so swapping in a real
 * brokerage feed is a one-line change in `activeSources`.
 */
import type { Listing } from "../types";
import { costarSource } from "./costar";
import { agentUploadSource } from "./agentUploads";
import { resoSource } from "./reso";
import { brokerageApiSource } from "./brokerageApi";

export interface ListingSource {
  id: string;
  label: string;
  enabled: () => boolean;
  fetchListings: () => Promise<Listing[]>;
}

export const activeSources: ListingSource[] = [costarSource, agentUploadSource, resoSource, brokerageApiSource];

let cache: Listing[] | null = null;

export async function loadAllListings(force = false): Promise<Listing[]> {
  if (cache && !force) return cache;
  const results = await Promise.all(
    activeSources.filter((s) => s.enabled()).map((s) => s.fetchListings().catch(() => [] as Listing[]))
  );
  const byId = new Map<string, Listing>();
  results.flat().forEach((l) => byId.set(l.id, l));
  cache = [...byId.values()];
  return cache;
}

/** Synchronous access (CoStar listings bundled at build time + local agent uploads). */
export function listingsSync(): Listing[] {
  return [...costarSource.sync(), ...agentUploadSource.sync()];
}

let byId: Map<string, Listing> | null = null;
export function getListing(id: string): Listing | undefined {
  if (!byId) byId = new Map(costarSource.sync().map((l) => [l.id, l]));
  return byId.get(id) || agentUploadSource.sync().find((l) => l.id === id);
}

export { analyzePhotos } from "../vibe";
