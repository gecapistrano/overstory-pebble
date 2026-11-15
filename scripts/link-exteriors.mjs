/**
 * Link Pebble listings to the exterior 3D captures of the Matterport hackathon set.
 *
 * 232 Matterport models also have a drone-trained 3D Gaussian splat of the outside of the
 * property. `models_index.csv` (shipped with the Matterport quickstart) lists every model with
 * its lat/lon, CoStar property id, Homes.com listing id and `splat = yes|no`. This joins it to
 * data/listings.json and writes data/exteriors.json: { [listingId]: { sid, lat, lng } }.
 *
 * Match order: same Matterport model id → CoStar property id → Homes listing id.
 *
 * Usage:  npm run exteriors
 *         MATTERPORT_INDEX_PATH=/path/to/models_index.csv node scripts/link-exteriors.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
const envFile = path.join(ROOT, ".env.local");
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const INDEX = path.resolve(ROOT, process.env.MATTERPORT_INDEX_PATH || env.MATTERPORT_INDEX_PATH || "../CoStar/backend/data/models_index.csv");
if (!fs.existsSync(INDEX)) {
  console.error(`models_index.csv not found at ${INDEX}. Set MATTERPORT_INDEX_PATH in .env.local.`);
  process.exit(1);
}

/** Minimal RFC 4180 CSV parser (quoted fields may hold commas, quotes and newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const splats = parseCsv(fs.readFileSync(INDEX, "utf8")).filter((r) => r.splat === "yes" && r.sid);
const bySid = new Map(splats.map((r) => [r.sid, r]));
const byProp = new Map(splats.filter((r) => r.costar_property_id).map((r) => [String(r.costar_property_id), r]));
const byHomes = new Map(splats.filter((r) => r.homes_listing_id).map((r) => [String(r.homes_listing_id), r]));

const listings = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "listings.json"), "utf8"));
const out = {};
for (const l of listings) {
  const r = bySid.get(l.matterportId) || byProp.get(String(l.costar?.propertyId ?? "")) || byHomes.get(String(l.costar?.listingId ?? ""));
  if (r) out[l.id] = { sid: r.sid, lat: +r.lat || l.lat, lng: +r.lon || l.lng };
}
fs.writeFileSync(path.join(ROOT, "data", "exteriors.json"), JSON.stringify(out, null, 1) + "\n");
const byAgent = {};
for (const id of Object.keys(out)) { const a = listings.find((l) => l.id === id)?.agentId; byAgent[a] = (byAgent[a] || 0) + 1; }
console.log(`${splats.length} exterior splats in the index; ${Object.keys(out).length} of ${listings.length} listings linked`, byAgent);
