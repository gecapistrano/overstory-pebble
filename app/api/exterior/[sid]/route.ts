/** Exterior 3D of a listing: /api/exterior/{sid} → compact .splat (see lib/exterior.ts). Disk-cached. */
import { exteriorSplat, isExteriorSid } from "@/lib/exterior";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(_req: Request, ctx: { params: Promise<{ sid: string }> }) {
  const { sid } = await ctx.params;
  if (!isExteriorSid(sid)) return new Response(null, { status: 404 });
  try {
    const data = await exteriorSplat(sid);
    return new Response(new Uint8Array(data), {
      headers: { "content-type": "application/octet-stream", "content-length": String(data.length), "cache-control": "public, max-age=604800, immutable" },
    });
  } catch (e) {
    console.warn("exterior splat", sid, e);
    return new Response(null, { status: 502 });
  }
}
