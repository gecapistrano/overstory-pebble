/** Listings uploaded by agents from the agent app. Stored locally in the demo. */
import type { Listing } from "../types";

const KEY = "pebble.uploads.v1";

function read(): Listing[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveUpload(l: Listing) {
  const all = read().filter((x) => x.id !== l.id);
  all.unshift(l);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full (large photos) — keep in memory only */
  }
}

export const agentUploadSource = {
  id: "agent-uploads",
  label: "Real Estate Agent uploads",
  enabled: () => true,
  fetchListings: async () => read(),
  sync: () => read(),
};
