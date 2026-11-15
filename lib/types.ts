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
  styles?: string[]; // every design style seen (taxonomy in lib/styles.ts), strongest first
  interior?: InteriorProfile; // AI read of the Matterport scan (scripts/scan-interiors.mjs)
}

/** One room as the vision model saw it in the Matterport scan. */
export interface RoomVibe {
  room: string; // e.g. "Kitchen", "Living room", "Primary bedroom"
  sqft?: number | null;
  ceilingFt?: number | null;
  styles: { name: string; confidence: number }[]; // taxonomy keys, strongest first
  materials: string[];
  palette: string[];
  light: number; // 0..1 natural light
  feel: string[]; // FEELS words
  note: string; // one sentence of evidence, e.g. "white shaker cabinets, black fixtures, butcher-block island"
  frame?: string; // /scans/<model>/<room>.jpg: the view that shows it
}

/** The whole interior: what the house feels like inside, with the evidence per room. */
export interface InteriorProfile {
  modelId: string;
  scannedAt: string;
  styles: { name: string; confidence: number }[];
  summary: string; // one sentence a client would understand
  feel: string[];
  palette: string[];
  materials: string[];
  light: number;
  consistency: "cohesive" | "mixed"; // do the rooms share one look?
  rooms: RoomVibe[];
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
  customerId?: string; // links the lead to the customer's searches and views
  tourOptions?: string[];
  tourDeclined?: boolean;
  cancelledBy?: "client" | "agent";
}

export interface Agent {
  id: string;
  name: string;
  title: string;
  initials: string;
  color: string;
}

/** What a photo actually shows, decided before any style tagging. "unknown" = the vision model was unavailable. */
export type PhotoSubject = "interior" | "exterior" | "floor_plan" | "decor" | "other_space" | "not_home" | "unknown";

export interface VibeTags {
  subject?: PhotoSubject;
  relevant?: boolean; // true only when the photo is a home (or home-like space) the model is confident about
  subjectConfidence?: number;
  description?: string; // what is in the photo, in English
  message?: string; // one sentence for the user, in their language
  beds?: number; // bedrooms counted on a floor plan
  style: string[]; // taxonomy keys from lib/styles.ts
  styleConfidence?: Record<string, number>;
  materials: string[];
  colors: string[];
  ambience: string[];
  light: number;
}

/** Customer-side activity, recorded by the homebuyer app and read by the brokerage dashboard. */
export interface CustomerProfile {
  id: string;
  name?: string;
  email?: string;
  age?: number;
  location?: string; // where the customer lives now, e.g. "Austin, TX"
  phone?: string;
  updatedAt: number;
  createdAt?: number;
  // account (demo: kept in the browser store; production: an auth provider + database)
  passwordHash?: string; // salted SHA-256, never the password itself
  salt?: string;
  consent?: Consent;
  interestedHomes?: { listingId: string; at: number }[];
}
/** What the customer agreed to. Only `terms` is required to have an account; everything else is opt-in. */
export interface Consent {
  version: string; // privacy notice version they agreed to
  terms: number | null; // when they accepted the Terms and Privacy Notice
  activity: boolean; // save searches + listing views to improve matches, and use them (in aggregate) in brokerage insights
  contact: boolean; // a Real Estate Agent may email/call about homes they show interest in
  shareWithOwners: boolean; // owners of homes they look at may see their name, age and email
  updatedAt: number;
}
export interface SearchEvent { customerId: string; at: number; text: string; tags: string[]; neighborhoods: string[]; city?: string; intent?: ListingKind; budgetMax?: number }
export interface ViewEvent { customerId: string; at: number; listingId: string; ms: number }
