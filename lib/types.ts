export type ListingKind = "rent" | "buy" | "land" | "stay" | "commercial";

export interface Listing {
  id: string;
  title: string;
  kind: ListingKind;
  propertyType: string;
  price: number; // monthly (rent/commercial), total (buy/land), nightly (stay)
  beds: number;
  baths: number;
  sqft: number;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  minutesToCampus: number; // minutes to the market's commute anchor (e.g. Downtown Houston)
  commuteMode: "walk" | "drive";
  petFriendly: boolean;
  availableFrom: string;
  style: string;
  materials: string[];
  colors: string[];
  ambience: string[];
  light: number; // 0..1, from the vibe model
  description: string;
  highlights: string[];
  agentId: string;
  yearBuilt: number;
  artSeed: number;
  source: "mock" | "mls" | "brokerage" | "agent-upload" | "costar";
  photos?: string[]; // real photo URLs/data URLs when available (agent uploads, MLS, CoStar)
  city?: string; // "Houston" | "Los Angeles"
  anchor?: string; // commute anchor name, e.g. "Downtown Houston"
  matterportId?: string; // Matterport 3D model id (CoStar media / attachments)
  costar?: CostarMeta;
}

/** Provenance + extra facts straight from the CoStar data kit. */
export interface CostarMeta {
  dataset: "residential-listings" | "apartment-listing";
  listingId: number;
  propertyId?: number | null;
  dom?: number | null;
  originalPrice?: number | null;
  listDate?: string | null;
  pricePerSqft?: number | null;
  hoa?: number | null;
  homesUrl?: string | null;
  floorPlan?: string | null;
  unitsAvailable?: number;
  totalUnits?: number | null;
  planUnitsAvailable?: number;
  maxRent?: number | null;
  manager?: string | null;
  vacancyPercent?: number | null;
}

/** What the home seeker asked for. Built by the parser (rules or LLM). */
export interface Criteria {
  intent?: ListingKind;
  bedsMin?: number;
  budgetMax?: number;
  budgetMin?: number;
  maxMinutes?: number;
  walkable?: boolean;
  pets?: boolean;
  vibes: string[]; // e.g. cozy, artsy, bright, quiet, modern...
  moveIn?: string; // "August"
  who?: string; // "new hire", "student", "family"
  neighborhoods: string[];
  sortCheaper?: boolean;
  city?: string; // "Houston" (default) | "Los Angeles"
}

export type LeadStatus = "new" | "verified" | "touring" | "application" | "closed" | "cancelled";

export interface LeadRecap {
  summary: string;
  budget: string;
  timeline: string;
  mustHaves: string[];
  niceToHaves: string[];
}

export interface LeadEvent {
  at: number;
  label: string;
  actor: "client" | "ai" | "agent" | "system";
}

export interface Lead {
  id: string;
  clientName: string;
  clientPhone: string;
  createdAt: number;
  transcript: string[];
  criteria: Criteria;
  recap: LeadRecap;
  suggestions: string[]; // listing ids (AI top 3)
  chosenListingId: string;
  status: LeadStatus;
  checklist: { available: boolean; price: boolean; fits: boolean; legal: boolean };
  agentId: string;
  messages: { from: "client" | "agent" | "ai"; text: string; at: number }[];
  lastClientActivity: number;
  nudgesSent: number;
  rescuedByNudge: boolean;
  dealValue: number; // brokerage commission in USD
  tourSlot?: string;
  events: LeadEvent[];
  archived?: boolean;
  language?: string; // client language when not English (auto-translated)
}

export interface Agent {
  id: string;
  name: string;
  title: string;
  initials: string;
  color: string;
}

export interface VibeTags {
  style: string[];
  materials: string[];
  colors: string[];
  ambience: string[];
  light: number;
}
