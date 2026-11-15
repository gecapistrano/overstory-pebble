/**
 * Input checks for the /api/ai/* routes (server only).
 * Every route reads its body with `readBody` and checks each field with the helpers below. Bad
 * input is answered with a clear 4xx before any Gemini call, so junk never spends quota and a
 * bug in the caller shows up as "bad-input: lead.recap.summary must be text", not a fake Gemini error.
 * Listings are never trusted from the browser: the route gets an id and looks the listing up here.
 */
import "server-only";
import listings from "@/data/listings.json";
import { MARKETS } from "./markets";
import type { Listing } from "./types";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
const bad = (message: string) => new HttpError(400, "bad-input", message);

/** Parse a JSON object body, refusing anything over `maxBytes` (Vercel's own cap is 4.5 MB). */
export async function readBody(req: Request, maxBytes = 256 * 1024): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > maxBytes) throw new HttpError(413, "too-large", `Request body is over ${Math.round(maxBytes / 1024)} KB`);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new HttpError(413, "too-large", `Request body is over ${Math.round(maxBytes / 1024)} KB`);
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "bad-json", "Request body is not valid JSON");
  }
  if (!isObj(v)) throw bad("Request body must be a JSON object");
  return v;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function obj(v: unknown, name: string): Record<string, unknown> {
  if (!isObj(v)) throw bad(`${name} must be an object`);
  return v;
}

export function str(v: unknown, name: string, o: { max?: number; min?: number } = {}): string {
  if (typeof v !== "string") throw bad(`${name} must be text`);
  const s = v.trim();
  if (s.length < (o.min ?? 1)) throw bad(`${name} is empty`);
  if (s.length > (o.max ?? 2000)) throw bad(`${name} is longer than ${o.max ?? 2000} characters`);
  return s;
}
export const optStr = (v: unknown, name: string, max = 80) => (v === undefined || v === null || v === "" ? undefined : str(v, name, { max }));

export function num(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw bad(`${name} must be a number`);
  return v;
}

export function arr<T>(v: unknown, name: string, o: { max: number; min?: number }, each: (x: unknown, name: string) => T): T[] {
  if (!Array.isArray(v)) throw bad(`${name} must be a list`);
  if (v.length < (o.min ?? 0)) throw bad(`${name} needs at least ${o.min} item${o.min === 1 ? "" : "s"}`);
  if (v.length > o.max) throw bad(`${name} has more than ${o.max} items`);
  return v.map((x, i) => each(x, `${name}[${i}]`));
}
export const optArr = <T>(v: unknown, name: string, o: { max: number }, each: (x: unknown, name: string) => T): T[] =>
  v === undefined || v === null ? [] : arr(v, name, o, each);

// ---------- domain ----------
const ALL = listings as unknown as Listing[];
const byId = new Map(ALL.map((l) => [l.id, l]));

/** The browser may send a whole listing or just its id; either way we use our own copy. */
export function listingRef(v: unknown, name = "listing"): Listing {
  const id = typeof v === "string" ? v : isObj(v) ? v.id : undefined;
  if (typeof id !== "string") throw bad(`${name} must be a listing or a listing id`);
  const l = byId.get(id);
  if (!l) throw new HttpError(404, "unknown-listing", `${name}: no listing with id ${id.slice(0, 40)}`);
  return l;
}

export function city(v: unknown, name = "city"): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const c = str(v, name, { max: 40 });
  if (!MARKETS.some((m) => m.city === c)) throw bad(`${name} must be one of ${MARKETS.map((m) => m.city).join(", ")}`);
  return c;
}

/** Criteria are stringified into prompts, so only check the shape; the overall body cap bounds the size. */
export function criteria(v: unknown, name = "criteria"): Record<string, unknown> {
  if (v === undefined || v === null) return { vibes: [], neighborhoods: [] };
  return obj(v, name);
}

/** The parts of a lead the AI routes read. Unknown extra fields are allowed (the browser sends whole leads). */
export function lead(v: unknown, name = "lead") {
  const l = obj(v, name);
  str(l.clientName, `${name}.clientName`, { max: 120 });
  optStr(l.language, `${name}.language`, 40);
  str(obj(l.recap, `${name}.recap`).summary, `${name}.recap.summary`, { min: 0, max: 1000 }); // may be blank before the AI recap lands
  return l as Record<string, unknown> & { clientName: string; language?: string; recap: { summary: string } };
}

const MSG_FROM = new Set(["client", "agent", "ai"]);
/** A lead with what the follow-up agent needs on top: its deal state and recent messages. */
export function dealLead(v: unknown, name = "lead") {
  const l = lead(v, name);
  str(l.chosenListingId, `${name}.chosenListingId`, { max: 80 });
  str(l.status, `${name}.status`, { max: 40 });
  num(l.lastClientActivity, `${name}.lastClientActivity`);
  criteria(l.criteria, `${name}.criteria`);
  arr(l.messages, `${name}.messages`, { max: 500 }, (m, n) => {
    const o = obj(m, n);
    if (!MSG_FROM.has(o.from as string)) throw bad(`${n}.from must be client, agent or ai`);
    return str(o.text, `${n}.text`, { max: 4000 });
  });
  return l;
}

const IMAGE = /^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,[A-Za-z0-9+/=]+$/;
export function imageDataUrl(v: unknown, name: string): string {
  if (typeof v !== "string" || !IMAGE.test(v)) throw bad(`${name} must be a base64 image data: URL (png, jpeg, webp, gif or heic)`);
  if (v.length > 1.5 * 2 ** 20) throw new HttpError(413, "too-large", `${name} is over 1.5 MB; downscale it first`);
  return v;
}
