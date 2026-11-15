/** Vexcel oblique image of the parcel at ?lat=&lng= (JPEG, parcel outlined in gold). */
import { hasVexcel, inCoverage, oblique } from "@/lib/vexcel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
  if (!hasVexcel() || !Number.isFinite(lat) || !Number.isFinite(lng) || !inCoverage(lat, lng)) return new Response(null, { status: 404 });
  try {
    const img = await oblique(lat, lng);
    if (!img) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(img), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=604800, s-maxage=2592000" } });
  } catch {
    return new Response(null, { status: 502 });
  }
}
