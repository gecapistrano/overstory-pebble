/**
 * Server-only Vexcel API 2.0 client (aerial imagery + property attributes, Houston & LA).
 * The key stays on the server (X-API-KEY header); the browser only sees /api/vexcel/* URLs.
 * Every response is cached on disk under .cache/vexcel so a demo never re-pays for a call,
 * and calls are throttled to stay well under the shared key's ~10 requests/s.
 */
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const BASE = (process.env.VEXCEL_BASE_URL || "https://api.vexcelgroup.com/v2").replace(/\/$/, "");
const LAYERS = "urban,urban-r,wide-area,urban-g";
// Vercel/serverless file systems are read-only except /tmp; CDN caching (s-maxage on the routes) does the heavy lifting there.
const CACHE = process.env.VERCEL ? path.join("/tmp", "vexcel") : path.join(process.cwd(), ".cache", "vexcel");
const GOLD = "rgb(255,204,0)";

export const hasVexcel = () => Boolean(process.env.VEXCEL_API_KEY);

// ---------- throttle: at most 6 in flight, >= 110 ms between starts ----------
let inFlight = 0;
let lastStart = 0;
const waiters: (() => void)[] = [];
async function slot() {
  while (inFlight >= 6) await new Promise<void>((r) => waiters.push(r));
  inFlight++;
  const wait = Math.max(0, lastStart + 110 - Date.now());
  lastStart = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}
function release() {
  inFlight--;
  waiters.shift()?.();
}

async function call(method: "GET" | "POST", p: string, opts: { params?: Record<string, string>; body?: unknown }): Promise<Response> {
  if (!hasVexcel()) throw new Error("VEXCEL_API_KEY is not set");
  const url = `${BASE}/${p}${opts.params ? "?" + new URLSearchParams(opts.params) : ""}`;
  for (let attempt = 0; ; attempt++) {
    await slot();
    let r: Response;
    try {
      r = await fetch(url, {
        method,
        headers: { "X-API-KEY": process.env.VEXCEL_API_KEY!, ...(opts.body ? { "content-type": "application/json" } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(60000),
      });
    } finally {
      release();
    }
    if (r.status !== 429 || attempt >= 4) return r;
    await new Promise((res) => setTimeout(res, Math.min(2 ** attempt * 500, 8000) + Math.random() * 300));
  }
}

/** 2xx -> image; "no imagery here" (4xx) -> null (cached); throttling / server errors throw (not cached). */
async function imageOrNull(r: Response): Promise<Buffer | null> {
  if (r.ok) return Buffer.from(await r.arrayBuffer());
  if (r.status === 429 || r.status >= 500) throw new Error(`Vexcel ${r.status}`);
  return null;
}

// ---------- disk cache ----------
const keyOf = (parts: unknown) => crypto.createHash("sha1").update(JSON.stringify(parts)).digest("hex");
async function cached<T extends Buffer | object>(kind: string, parts: unknown, ext: "jpg" | "json", make: () => Promise<T | null>): Promise<T | null> {
  const f = path.join(CACHE, kind, `${keyOf(parts)}.${ext}`);
  try {
    const raw = await fs.readFile(f);
    if (ext === "json") return JSON.parse(raw.toString("utf8")) as T;
    return (raw.length ? raw : null) as T | null; // empty file = cached "no imagery"
  } catch {}
  const v = await make();
  try {
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, ext === "json" ? JSON.stringify(v) : (v as Buffer | null) || Buffer.alloc(0));
  } catch {
    /* read-only or full disk: serve without caching */
  }
  return v;
}

// ---------- geometry (WKT is lon lat) ----------
export const r5 = (n: number) => Math.round(n * 1e5) / 1e5; // ~1 m: stable cache keys
function square(lat: number, lng: number, halfM: number) {
  const dLat = halfM / 111320, dLng = halfM / (111320 * Math.cos((lat * Math.PI) / 180));
  return bboxWkt(lng - dLng, lat - dLat, lng + dLng, lat + dLat);
}
const bboxWkt = (w: number, s: number, e: number, n: number) => `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`;
function toWkt(g: { type: string; coordinates: number[][][] | number[][][][] }) {
  const ring = (r: number[][]) => "(" + r.map((p) => `${p[0]} ${p[1]}`).join(",") + ")";
  if (g.type === "Polygon") return "POLYGON(" + ring((g.coordinates as number[][][])[0]) + ")";
  return "MULTIPOLYGON(" + (g.coordinates as number[][][][]).map((p) => "(" + ring(p[0]) + ")").join(",") + ")";
}
export function tileBounds(z: number, x: number, y: number) {
  const n = 2 ** z;
  const lng = (i: number) => (i / n) * 360 - 180;
  const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return { w: lng(x), e: lng(x + 1), n: lat(y), s: lat(y + 1) };
}
/** Vexcel coverage on this key: Houston and Los Angeles metros. */
export function inCoverage(lat: number, lng: number) {
  const hou = lat > 29.3 && lat < 30.3 && lng > -96.0 && lng < -94.9;
  const la = lat > 33.6 && lat < 34.5 && lng > -118.8 && lng < -117.6;
  return hou || la;
}

// ---------- public API ----------
export interface ParcelFacts {
  parcel: boolean;
  parcelWkt: string;
  captured: string | null; // ortho capture date
  collection: string | null;
  gsdCm: number | null; // ground resolution
  structures: number | null;
  footprintSqft: number | null;
  roofMaterial: string | null;
  roofShape: string | null;
  roofCondition: number | null; // Vexcel condition score (lower = better)
  roofDiscolorationPct: number | null;
  pool: boolean;
  treeCoverPct: number | null;
  solar: boolean | null;
  elevationFt: number | null;
}

export function parcel(lat: number, lng: number): Promise<ParcelFacts | null> {
  lat = r5(lat); lng = r5(lng);
  return cached<ParcelFacts>("parcel", [lat, lng], "json", async () => {
    const r = await call("GET", "property/extract", {
      params: { wkt: `POINT(${lng} ${lat})`, srid: "4326", layer: LAYERS, latest: "true", include: "precomputed", "unit-system": "imperial" },
    });
    if (r.status === 404) {
      return { parcel: false, parcelWkt: square(lat, lng, 30), captured: null, collection: null, gsdCm: null, structures: null, footprintSqft: null, roofMaterial: null, roofShape: null, roofCondition: null, roofDiscolorationPct: null, pool: false, treeCoverPct: null, solar: null, elevationFt: null };
    }
    if (!r.ok) throw new Error(`Vexcel property/extract ${r.status}`);
    const j = await r.json();
    const f = j.features?.[0];
    if (!f) return null;
    const p = f.properties || {};
    const prim = (p.structures || []).find((s: Record<string, unknown>) => s["primary-structure"]) || p.structures?.[0] || {};
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      parcel: true,
      parcelWkt: toWkt(f.geometry),
      captured: typeof p["metadata.ortho-date-estimate"] === "string" ? p["metadata.ortho-date-estimate"].slice(0, 10) : null,
      collection: p["metadata.collection"] ?? null,
      gsdCm: num(p["metadata.gsd"]) != null ? Math.round(p["metadata.gsd"] * 1000) / 10 : null,
      structures: num(p["structure.count"]),
      footprintSqft: num(prim["footprint.area"]) != null ? Math.round(prim["footprint.area"]) : null,
      roofMaterial: prim["roof-characteristics.material.class"] ?? null,
      roofShape: prim["roof-characteristics.shape.value"] ?? null,
      roofCondition: num(prim["roof-characteristics.condition"]),
      roofDiscolorationPct: num(prim["roof-defects.discoloration.percent"]),
      pool: Boolean(p["pool.detected"]),
      treeCoverPct: num(p["parcel-tree-cover.percent"]),
      solar: typeof prim["solar-panel.detected"] === "boolean" ? prim["solar-panel.detected"] : null,
      elevationFt: num(prim["ground-elevation.value"]),
    };
  });
}

/** Top-down ortho of the parcel, outlined in gold. */
export async function orthoParcel(lat: number, lng: number, size = 640): Promise<Buffer | null> {
  const p = await parcel(lat, lng);
  const wkt = p?.parcelWkt || square(lat, lng, 30);
  return cached<Buffer>("ortho", [r5(lat), r5(lng), size], "jpg", async () => {
    const r = await call("POST", "ortho/extract", {
      body: { wkt, srid: 4326, layer: LAYERS, "buffer-meter": 25, crop: "bounding_box", "image-format": "jpeg", "destination-dimensions": `${size},${size}`, drawing: [{ wkt, "outline-width": 4, "outline-color": GOLD }] },
    });
    return imageOrNull(r);
  });
}

/** Bird's-eye oblique (45°) of the parcel, when Vexcel has one. */
export async function oblique(lat: number, lng: number): Promise<Buffer | null> {
  const p = await parcel(lat, lng);
  const wkt = p?.parcelWkt || square(lat, lng, 30);
  return cached<Buffer>("oblique", [r5(lat), r5(lng)], "jpg", async () => {
    const c = await call("GET", "oriented/collections", { params: { wkt, srid: "4326", layer: "urban", "product-type": "oblique", include: "product-type,collection,last-capture-date" } });
    if (c.status === 429 || c.status >= 500) throw new Error(`Vexcel ${c.status}`);
    if (!c.ok) return null;
    const feats: { properties: Record<string, string> }[] = (await c.json()).features || [];
    if (!feats.length) return null;
    const newest = feats.map((f) => f.properties["last-capture-date"]).sort().pop();
    const have = new Set(feats.filter((f) => f.properties["last-capture-date"] === newest).map((f) => f.properties["product-type"]));
    const dir = ["oblique-south", "oblique-north", "oblique-east", "oblique-west"].find((d) => have.has(d));
    if (!dir) return null;
    const r = await call("POST", "oriented/extract", {
      body: { wkt, srid: 4326, layer: "urban", "product-type": dir, rotation: "natural", "buffer-meter": 25, crop: "bbox", "image-format": "jpeg", drawing: [{ wkt, "outline-width": 4, "outline-color": "255,204,0" }] },
    });
    return imageOrNull(r);
  });
}

/** One 256 px web-mercator map tile of Vexcel ortho imagery. */
export function tile(z: number, x: number, y: number): Promise<Buffer | null> {
  const b = tileBounds(z, x, y);
  return cached<Buffer>(`tiles/${z}`, [x, y], "jpg", async () => {
    if (!inCoverage((b.n + b.s) / 2, (b.w + b.e) / 2)) return null;
    const r = await call("POST", "ortho/extract", {
      body: { wkt: bboxWkt(b.w, b.s, b.e, b.n), srid: 4326, layer: LAYERS, crop: "bounding_box", "image-format": "jpeg", "destination-dimensions": "256,256" },
    });
    return imageOrNull(r);
  });
}
