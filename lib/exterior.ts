import "server-only";
/**
 * Exterior 3D (drone Gaussian splats) for listings in the Matterport hackathon set.
 *
 * The hackathon site serves each model's `splat.ply` (INRIA layout, 68 bytes per Gaussian,
 * Z up, metres, origin at the property) through a short-lived signed CDN link. The files are
 * 200–550 MB and the CDN ignores Range, so we stream the file and stop after a byte budget:
 * Gaussians are stored in no spatial order, so the first slice is a fair sample of the scene.
 * We keep the ones within ~32 m of the property, drop near-transparent ones, re-centre on the
 * ground, and pack them in the compact 32-byte ".splat" layout the browser viewer reads
 * (~5 MB). The result is cached on disk under .cache/exterior, so each model is paid for once.
 */
import fs from "node:fs/promises";
import path from "node:path";
import exteriors from "@/data/exteriors.json";

const SITE = (process.env.HACKATHON_SITE || "https://beta-app.matterport.com/2026-princeton-hackathon").replace(/\/$/, "");
// Vercel/serverless file systems are read-only except /tmp (same rule as lib/vexcel.ts); the CDN
// (s-maxage on the route) keeps a built model, so a function rebuilds it only on a CDN miss.
const CACHE = process.env.VERCEL ? path.join("/tmp", "exterior") : path.join(process.cwd(), ".cache", "exterior");
const CACHE_VERSION = "v2"; // bump when the output format or size cap changes, so stale files are rebuilt
const BUDGET = 96 * 2 ** 20; // bytes of PLY to read (~1.4 M Gaussians)
const RADIUS = 32; // metres kept around the property
const MIN_ALPHA = 0.06;
/** Vercel Functions can return at most 4.5 MB; at 32 bytes per Gaussian, 4 MB keeps ~131k of them. */
export const MAX_SPLATS = Math.floor((4 * 2 ** 20) / 32);
const SH_C0 = 0.28209479177387814;

const known = new Set(Object.values(exteriors as Record<string, { sid: string }>).map((e) => e.sid));
export const isExteriorSid = (sid: string) => /^[A-Za-z0-9]{6,20}$/.test(sid) && known.has(sid);

const inflight = new Map<string, Promise<Buffer>>();
export function exteriorSplat(sid: string): Promise<Buffer> {
  if (!inflight.has(sid)) inflight.set(sid, load(sid).finally(() => inflight.delete(sid)));
  return inflight.get(sid)!;
}

async function load(sid: string): Promise<Buffer> {
  const f = path.join(CACHE, `${sid}.${CACHE_VERSION}.splat`);
  try { return await fs.readFile(f); } catch {}
  const out = await build(sid);
  try {
    await fs.mkdir(CACHE, { recursive: true });
    await fs.writeFile(f + ".tmp", out);
    await fs.rename(f + ".tmp", f);
  } catch (e) {
    console.warn("exterior cache write failed; serving uncached", sid, e); // never fail a built model over the cache
  }
  return out;
}

async function build(sid: string): Promise<Buffer> {
  const res = await fetch(`${SITE}/resources/${sid}/splat/splat.ply`);
  if (!res.ok || !res.body) throw new Error(`splat ${sid}: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  try {
    while (got < BUDGET) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
    }
  } finally {
    reader.cancel().catch(() => {}); // stop the download once the budget is read
  }
  return toSplat(Buffer.concat(chunks));
}

/** INRIA PLY (possibly cut short) → cropped, re-centred 32-byte .splat records. */
export function toSplat(buf: Buffer): Buffer {
  const end = buf.indexOf("end_header\n");
  if (end < 0) throw new Error("not a PLY file");
  const header = buf.subarray(0, end).toString("latin1");
  if (!header.includes("binary_little_endian")) throw new Error("unsupported PLY encoding");
  const props = header.split("\n").filter((l) => l.startsWith("property float ")).map((l) => l.trim().split(" ")[2]);
  const ix = (p: string) => {
    const i = props.indexOf(p);
    if (i < 0) throw new Error(`PLY lacks ${p}`);
    return i * 4;
  };
  const [X, Y, Z, R, G, B, O, S0, S1, S2, Q0, Q1, Q2, Q3] = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"].map(ix);
  const stride = props.length * 4;
  const body = end + "end_header\n".length;
  const n = Math.floor((buf.length - body) / stride);

  // pass 1: keep Gaussians near the property that are not almost transparent
  let keep: number[] = [];
  const alpha: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = body + i * stride;
    const x = buf.readFloatLE(o + X), y = buf.readFloatLE(o + Y), z = buf.readFloatLE(o + Z);
    if (x * x + y * y > RADIUS * RADIUS || z < -40 || z > 60) continue;
    const a = 1 / (1 + Math.exp(-buf.readFloatLE(o + O)));
    if (a < MIN_ALPHA) continue;
    keep.push(o);
    alpha.push(a);
    if (zs.length < 50000) zs.push(z);
  }
  // over the response-size cap: keep the most opaque Gaussians (solid surfaces), drop the faint haze first
  if (keep.length > MAX_SPLATS) {
    const order = keep.map((_, k) => k).sort((p, q) => alpha[q] - alpha[p]).slice(0, MAX_SPLATS);
    keep = order.map((k) => keep[k]);
  }
  // ground ≈ low percentile of heights near the property; put it at z = 0
  zs.sort((a, b) => a - b);
  const ground = zs.length ? zs[Math.floor(zs.length * 0.08)] : 0;

  // pass 2: pack (position f32×3, scale f32×3, rgba u8×4, quaternion u8×4)
  const out = Buffer.alloc(keep.length * 32);
  const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  keep.forEach((o, k) => {
    const w = k * 32;
    out.writeFloatLE(buf.readFloatLE(o + X), w);
    out.writeFloatLE(buf.readFloatLE(o + Y), w + 4);
    out.writeFloatLE(buf.readFloatLE(o + Z) - ground, w + 8);
    out.writeFloatLE(Math.exp(buf.readFloatLE(o + S0)), w + 12);
    out.writeFloatLE(Math.exp(buf.readFloatLE(o + S1)), w + 16);
    out.writeFloatLE(Math.exp(buf.readFloatLE(o + S2)), w + 20);
    out[w + 24] = u8((0.5 + SH_C0 * buf.readFloatLE(o + R)) * 255);
    out[w + 25] = u8((0.5 + SH_C0 * buf.readFloatLE(o + G)) * 255);
    out[w + 26] = u8((0.5 + SH_C0 * buf.readFloatLE(o + B)) * 255);
    out[w + 27] = u8(255 / (1 + Math.exp(-buf.readFloatLE(o + O))));
    const q = [Q0, Q1, Q2, Q3].map((p) => buf.readFloatLE(o + p));
    const len = Math.hypot(...q) || 1;
    q.forEach((v, j) => (out[w + 28 + j] = u8((v / len) * 128 + 128)));
  });
  return out;
}
