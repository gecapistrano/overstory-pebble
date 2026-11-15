/**
 * MLS / RESO Web API adapter (stub, ready to plug in).
 * Set NEXT_PUBLIC_RESO_URL and NEXT_PUBLIC_RESO_TOKEN to enable.
 * Maps RESO Data Dictionary fields onto Pebble's Listing shape.
 */
import type { Listing } from "../types";

const URL_ = process.env.NEXT_PUBLIC_RESO_URL;
const TOKEN = process.env.NEXT_PUBLIC_RESO_TOKEN;

interface ResoProperty {
  ListingKey: string;
  UnparsedAddress?: string;
  ListPrice?: number;
  LeaseAmount?: number;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  LivingArea?: number;
  Latitude?: number;
  Longitude?: number;
  PropertyType?: string;
  PublicRemarks?: string;
  ArchitecturalStyle?: string[];
  PetsAllowed?: string[];
  SubdivisionName?: string;
  YearBuilt?: number;
  Media?: { MediaURL: string }[];
}

export function fromReso(p: ResoProperty): Listing {
  const isLease = p.PropertyType?.toLowerCase().includes("lease");
  return {
    id: `mls-${p.ListingKey}`,
    title: p.UnparsedAddress || "MLS listing",
    kind: isLease ? "rent" : p.PropertyType === "Land" ? "land" : "buy",
    propertyType: p.PropertyType || "house",
    price: (isLease ? p.LeaseAmount : p.ListPrice) || 0,
    beds: p.BedroomsTotal || 0,
    baths: p.BathroomsTotalInteger || 0,
    sqft: p.LivingArea || 0,
    neighborhood: p.SubdivisionName || "",
    address: p.UnparsedAddress || "",
    lat: p.Latitude || 0,
    lng: p.Longitude || 0,
    minutesToCampus: 0,
    commuteMode: "drive",
    petFriendly: !(p.PetsAllowed || []).includes("No"),
    availableFrom: "Now",
    style: (p.ArchitecturalStyle || ["contemporary"])[0].toLowerCase(),
    materials: [],
    colors: [],
    ambience: [], // filled by analyzePhotos() on ingest
    light: 0.5,
    description: p.PublicRemarks || "",
    highlights: [],
    agentId: "maya",
    yearBuilt: p.YearBuilt || 0,
    artSeed: 1,
    source: "mls",
    photos: (p.Media || []).map((m) => m.MediaURL),
  };
}

export const resoSource = {
  id: "reso",
  label: "MLS (RESO Web API)",
  enabled: () => Boolean(URL_ && TOKEN),
  fetchListings: async (): Promise<Listing[]> => {
    const res = await fetch(`${URL_}/Property?$top=200`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const json = await res.json();
    return (json.value || []).map(fromReso);
  },
};
