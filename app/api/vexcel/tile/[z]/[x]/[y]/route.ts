/** Vexcel aerial map tiles (proxy): /api/vexcel/tile/{z}/{x}/{y}. Key stays on the server; tiles are disk-cached. */
import { hasVexcel, tile } from "@/lib/vexcel";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await ctx.params;
  const Z = parseInt(z), X = parseInt(x), Y = parseInt(y.replace(/\.\w+$/, ""));
  if (!hasVexcel() || !(Z >= 11 && Z <= 21) || ![X, Y].every(Number.isInteger)) return new Response(null, { status: 404 });
  try {
    const img = await tile(Z, X, Y);
    if (!img) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400, s-maxage=2592000" } });
    return new Response(new Uint8Array(img), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=604800, s-maxage=2592000, immutable" } });
  } catch {
    return new Response(null, { status: 502 });
  }
}
