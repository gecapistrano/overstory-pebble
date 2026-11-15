/**
 * Vibe model interface: analyzePhotos(images) -> tags.
 *
 * Primary: Gemini vision via /api/ai/vibe (see app/api/ai/vibe/route.ts).
 * Offline fallback (this file): a fast on-device color + light analysis that
 * runs in a <canvas>. It estimates light, warmth, saturation and hue variety,
 * then maps them to style / material / color / ambience tags.
 */
import type { VibeTags } from "./types";
import { aiVibe } from "./ai";

type Img = string | HTMLImageElement | File | Blob;

const NAMED: [string, [number, number, number]][] = [
  ["white", [242, 240, 236]], ["cream", [236, 226, 204]], ["sand", [214, 196, 165]], ["warm grey", [168, 160, 152]],
  ["charcoal", [58, 58, 62]], ["black", [22, 22, 24]], ["terracotta", [196, 98, 66]], ["red brick", [150, 62, 48]],
  ["mustard", [214, 170, 58]], ["olive", [118, 122, 66]], ["sage", [156, 174, 142]], ["moss", [86, 104, 70]],
  ["teal", [46, 128, 130]], ["navy", [36, 52, 92]], ["blush", [232, 190, 190]], ["walnut", [104, 72, 50]], ["oak", [186, 148, 104]],
];

function nearest(r: number, g: number, b: number) {
  let best = NAMED[0][0], d = Infinity;
  for (const [n, [R, G, B]] of NAMED) {
    const dd = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    if (dd < d) { d = dd; best = n; }
  }
  return best;
}

async function toImage(src: Img): Promise<HTMLImageElement> {
  const url = typeof src === "string" ? src : src instanceof HTMLImageElement ? src.src : URL.createObjectURL(src);
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}

export function tagsFromPixels(px: Uint8ClampedArray): VibeTags {
  let lum = 0, sat = 0, warm = 0, green = 0, n = 0;
  const hueBins = new Array(12).fill(0);
  const colorCount = new Map<string, number>();
  for (let i = 0; i < px.length; i += 16) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 510;
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    lum += l; sat += s; n++;
    if (r > b + 18) warm++;
    if (g > r + 8 && g > b + 8) green++;
    if (s > 0.25) {
      let h = 0;
      if (mx === r) h = ((g - b) / (mx - mn)) % 6; else if (mx === g) h = (b - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4;
      hueBins[Math.floor(((h * 60 + 360) % 360) / 30)]++;
    }
    const name = nearest(r, g, b);
    colorCount.set(name, (colorCount.get(name) || 0) + 1);
  }
  lum /= n; sat /= n;
  const warmth = warm / n, greenery = green / n;
  const hueVariety = hueBins.filter((c) => c > n * 0.03).length;
  const colors = [...colorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);

  const ambience: string[] = [];
  const style: string[] = [];
  const materials: string[] = [];
  if (lum > 0.62) ambience.push("bright");
  if (lum < 0.38) ambience.push("moody");
  if (warmth > 0.45 && lum < 0.75) ambience.push("cozy");
  if (sat < 0.18) ambience.push("calm");
  if (greenery > 0.2) ambience.push("leafy");
  if (hueVariety >= 4 && sat > 0.28) { style.push("artsy"); ambience.push("creative"); }
  if (sat < 0.15 && lum > 0.65) style.push("minimalist", "scandinavian");
  if (lum < 0.4 && sat < 0.25) style.push("gothic");
  if (warmth > 0.5 && sat > 0.2 && sat < 0.45) style.push("craftsman");
  if (!style.length) style.push("contemporary");
  if (colors.some((c) => ["walnut", "oak", "sand"].includes(c))) materials.push("wood");
  if (colors.some((c) => ["red brick", "terracotta"].includes(c))) materials.push("brick");
  if (colors.some((c) => ["warm grey", "charcoal"].includes(c))) materials.push("stone");
  if (colors.includes("white")) materials.push("plaster");
  return { style, materials, colors, ambience: [...new Set(ambience)], light: +lum.toFixed(2) };
}

/** Downscales any image to a small JPEG data URL for upload to the vision model. */
async function toDataUrl(src: Img, max = 768): Promise<string> {
  const im = await toImage(src);
  const k = Math.min(1, max / Math.max(im.width, im.height));
  const c = document.createElement("canvas");
  c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
  c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

/** analyzePhotos(images) -> tags. Gemini vision first; on-device analysis if Gemini is unavailable. */
export async function analyzePhotos(images: Img[]): Promise<VibeTags> {
  try {
    const urls = await Promise.all(images.slice(0, 4).map((i) => toDataUrl(i)));
    const tags = await aiVibe(urls);
    if (tags) return { style: tags.style || [], materials: tags.materials || [], colors: tags.colors || [], ambience: tags.ambience || [], light: tags.light ?? 0.5 };
  } catch {
    /* fall back to on-device */
  }
  const merged: VibeTags = { style: [], materials: [], colors: [], ambience: [], light: 0 };
  for (const src of images) {
    const im = await toImage(src);
    const c = document.createElement("canvas");
    c.width = 96; c.height = Math.max(1, Math.round((96 * im.height) / im.width));
    const ctx = c.getContext("2d")!;
    ctx.drawImage(im, 0, 0, c.width, c.height);
    const t = tagsFromPixels(ctx.getImageData(0, 0, c.width, c.height).data);
    merged.style.push(...t.style); merged.materials.push(...t.materials); merged.colors.push(...t.colors); merged.ambience.push(...t.ambience);
    merged.light += t.light / images.length;
  }
  const uniq = (a: string[]) => [...new Set(a)].slice(0, 4);
  return { style: uniq(merged.style), materials: uniq(merged.materials), colors: uniq(merged.colors), ambience: uniq(merged.ambience), light: +merged.light.toFixed(2) };
}
