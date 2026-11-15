/** Vexcel property attributes for a point: parcel, footprint, roof, pool, tree cover, capture date. */
import { NextResponse } from "next/server";
import { hasVexcel, inCoverage, parcel } from "@/lib/vexcel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
  if (!hasVexcel()) return NextResponse.json({ error: "no-key" }, { status: 503 });
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inCoverage(lat, lng)) return NextResponse.json({ error: "out-of-coverage" }, { status: 404 });
  try {
    const p = await parcel(lat, lng);
    if (!p) return NextResponse.json({ error: "not-found" }, { status: 404 });
    const { parcelWkt: _w, ...facts } = p;
    return NextResponse.json({ ok: true, source: "Vexcel API 2.0", ...facts }, { headers: { "cache-control": "public, max-age=86400, s-maxage=2592000" } });
  } catch (e) {
    return NextResponse.json({ error: "vexcel-failed", message: String(e).slice(0, 200) }, { status: 502 });
  }
}
