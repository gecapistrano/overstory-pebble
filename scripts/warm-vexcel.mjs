/**
 * Pre-fetch Vexcel imagery for the demo so it loads instantly (results are disk-cached by the server).
 * Needs the app running:  BASE=http://localhost:3000 npm run vexcel:warm
 * Warms: aerial tiles z11–16 over the demo area (Greater Heights + Downtown Houston) and the
 * parcel facts, ortho and oblique for every listing in the demo neighbourhood.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const HOOD = process.env.HOOD || "Greater Heights";
const BOX = { s: 29.745, n: 29.815, w: -95.43, e: -95.345 }; // Heights → Downtown

const tileXY = (z, lat, lng) => {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
};
const urls = [];
for (let z = 11; z <= 16; z++) {
  const [x0, y0] = tileXY(z, BOX.n, BOX.w), [x1, y1] = tileXY(z, BOX.s, BOX.e);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.push(`/api/vexcel/tile/${z}/${x}/${y}/`);
}
const listings = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "listings.json"), "utf8")).filter((l) => l.neighborhood === HOOD);
for (const l of listings) for (const k of ["parcel", "ortho", "oblique"]) urls.push(`/api/vexcel/${k}/?lat=${l.lat}&lng=${l.lng}`);

let done = 0, ok = 0;
const worker = async () => {
  while (urls.length) {
    const u = urls.shift();
    try { const r = await fetch(BASE + u); ok += r.ok; await r.arrayBuffer(); } catch {}
    if (++done % 25 === 0) console.log(`${done} requests, ${ok} with imagery…`);
  }
};
console.log(`Warming ${urls.length} Vexcel requests (${listings.length} ${HOOD} listings) against ${BASE}`);
await Promise.all([...Array(5)].map(worker));
console.log(`Done: ${done} requests, ${ok} with imagery.`);
