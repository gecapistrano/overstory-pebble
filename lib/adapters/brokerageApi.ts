/**
 * Partner brokerage listing API adapter (stub).
 * A brokerage exposes its inventory as JSON; set NEXT_PUBLIC_BROKERAGE_API to enable.
 * Expected shape: Listing[] (or map it here).
 */
import type { Listing } from "../types";

const API = process.env.NEXT_PUBLIC_BROKERAGE_API;

export const brokerageApiSource = {
  id: "brokerage",
  label: "Partner brokerage API",
  enabled: () => Boolean(API),
  fetchListings: async (): Promise<Listing[]> => {
    const res = await fetch(`${API}/listings`);
    const rows = (await res.json()) as Listing[];
    return rows.map((r) => ({ ...r, source: "brokerage" as const }));
  },
};
