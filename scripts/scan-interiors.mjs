/**
 * Interior vibe scan: reads every listing's Matterport 3D scan and has Gemini vision decide
 * what the house feels like inside, room by room. That's the layer CoStar doesn't have.
 *
 *   npm run scan                      # every listing with a scan (skips ones already done)
 *   npm run scan -- --limit 5         # first 5 models
 *   npm run scan -- --only hGppiYg9kMu,abc123
 *   npm run scan -- --force           # rescan even if already in data/interiors.json
 *   npm run scan -- --export          # just rewrite data/interiors.json + data/interiors.lite.json
 *
 * Per model:
 *  1. Matterport Model API (GraphQL): rooms with their AI room labels, dimensions and panoramas.
 *  2. Pick up to 5 rooms that carry the style (living, kitchen, dining, primary bed/bath, office).
 *  3. For each room, take the middle panorama's 4 horizontal cube faces (skip ceiling and floor)
 *     and stitch them into one 360° strip.
 *  4. One Gemini vision call over all strips -> styles (lib/styles.ts taxonomy) with confidence,
 *     materials, palette, light, feel, a one-line evidence note and the best view per room.
 *  5. Save that best view as the evidence frame: public/scans/<model>/<room>.jpg
 *  6. Merge into data/interiors.json (written after every model, so a run can stop and resume).
 *
 * Keys stay server-side in .env.local; output never prints them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { STYLES, CUES, FEELS, toStyle } from "../lib/styles.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "interiors.json");
const FRAMES = path.join(ROOT, "public", "scans");

// ---------- args ----------
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const LIMIT = Number(arg("--limit")) || Infinity;
const ONLY = arg("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const FORCE = argv.includes("--force");
const CONCURRENCY = Number(arg("--concurrency")) || 3;
const MAX_ROOMS = 5;

const { MATTERPORT_API_KEY, MATTERPORT_API_TOKEN, GEMINI_API_KEY } = process.env;
const GRAPH = process.env.MATTERPORT_GRAPH_URL || "https://api.matterport.com/api/models/graph";
const GEMINI_BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
// a one-time batch, so default to the stronger vision model rather than the app's (possibly lite) GEMINI_MODEL
// falls back to the app's GEMINI_MODEL if the key has no quota for it
let MODEL = process.env.GEMINI_SCAN_MODEL || "gemini-3.8-flash";
const FALLBACK_MODEL = process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== MODEL ? process.env.GEMINI_MODEL : null;
if (!MATTERPORT_API_KEY || !MATTERPORT_API_TOKEN) throw new Error("MATTERPORT_API_KEY / MATTERPORT_API_TOKEN are not set (.env.local)");
if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set (.env.local)");

// ---------- throttle: Matterport keys are shared, stay well under ~10 req/s ----------
let last = 0;
const gate = async () => {
  const wait = Math.max(0, last + 120 - Date.now());
  last = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const AUTH = "Basic " + Buffer.from(`${MATTERPORT_API_KEY}:${MATTERPORT_API_TOKEN}`).toString("base64");
async function graph(query, variables) {
  for (let attempt = 0; ; attempt++) {
    await gate();
    const r = await fetch(GRAPH, { method: "POST", headers: { authorization: AUTH, "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await sleep(1500 * 2 ** attempt); continue; }
    if (r.status === 401 || r.status === 403) throw new Error(`Matterport rejected the credentials (HTTP ${r.status})`);
    if (!r.ok) throw new Error(`Matterport HTTP ${r.status}`);
    const body = await r.json();
    if (!body.data?.model) throw new Error("GraphQL: " + String(body.errors?.[0]?.message).slice(0, 200));
    return body.data.model;
  }
}
async function download(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await gate();
    const r = await fetch(url); // signed URL, no auth header
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    await sleep(800 * (attempt + 1));
  }
  return null;
}

const Q_ROOMS = `query Rooms($id: ID!) { model(id: $id) { id name
  rooms { id classifications { label confidence } dimensions(units: imperial) { areaFloor height }
    panoLocations { id skybox(resolution: "high") { status children } } } } }`;

// ---------- room selection ----------
const SKIP = /void|hall|stair|closet|garage|laundry|utility|mechanical|storage|pantry|entry|foyer|outdoor|balcony|patio|porch|yard|exterior|elevator|lobby/i;
const RANK = [
  [/living|family|great|lounge|den/i, 0], [/kitchen/i, 1], [/dining/i, 2], [/bedroom/i, 3], [/bath/i, 4], [/office|study/i, 5],
];
function pickRooms(model) {
  const rooms = (model.rooms || [])
    .map((r) => ({
      id: r.id,
      label: r.classifications?.[0]?.label || "",
      conf: r.classifications?.[0]?.confidence ?? 0,
      sqft: r.dimensions?.areaFloor ?? null,
      ceilingFt: r.dimensions?.height ?? null,
      panos: (r.panoLocations || []).filter((p) => p.skybox?.status === "available" && p.skybox.children?.length >= 6),
    }))
    .filter((r) => r.panos.length && !SKIP.test(r.label));
  // an unlabeled big room with many panos is almost always the main living space
  const unlabeled = rooms.filter((r) => !r.label && (r.sqft ?? 0) > 150).sort((a, b) => b.panos.length - a.panos.length || (b.sqft ?? 0) - (a.sqft ?? 0));
  if (unlabeled[0] && !rooms.some((r) => /living|family|great/i.test(r.label))) unlabeled[0].label = "Living area";
  const named = rooms.filter((r) => r.label);
  const rank = (r) => (RANK.find(([re]) => re.test(r.label))?.[1] ?? 6);
  const chosen = [];
  for (const r of named.sort((a, b) => rank(a) - rank(b) || (b.sqft ?? 0) - (a.sqft ?? 0))) {
    if (chosen.length >= MAX_ROOMS) break;
    const k = rank(r);
    if (k === 6 && chosen.length >= 3) continue; // odd rooms only if we have little else
    if (chosen.some((c) => rank(c) === k) && k !== 6) continue; // one of each kind: the largest
    chosen.push(r);
  }
  for (const r of chosen) {
    if (/^bedroom$/i.test(r.label) && named.filter((x) => /bedroom/i.test(x.label)).length > 1) r.label = "Primary bedroom";
    if (/^bathroom$/i.test(r.label) && named.filter((x) => /bath/i.test(x.label)).length > 1) r.label = "Primary bathroom";
  }
  return chosen;
}

// ---------- images ----------
const FACE = 448;
async function roomStrip(room) {
  const pano = room.panos[Math.floor(room.panos.length / 2)];
  const faces = [];
  for (const i of [1, 2, 3, 4]) faces.push(await download(pano.skybox.children[i])); // 0 = ceiling, 5 = floor
  const ok = faces.map((b, i) => [b, i]).filter(([b]) => b);
  if (ok.length < 2) return null;
  const tiles = await Promise.all(ok.map(([b]) => sharp(b).resize(FACE, FACE).jpeg({ quality: 80 }).toBuffer()));
  const strip = await sharp({ create: { width: FACE * tiles.length, height: FACE, channels: 3, background: "#000" } })
    .composite(tiles.map((input, i) => ({ input, left: i * FACE, top: 0 })))
    .jpeg({ quality: 78 })
    .toBuffer();
  return { strip, faces: ok.map(([b]) => b) };
}

// ---------- Gemini ----------
const SYSTEM = `You are an interior-design analyst reading Matterport 3D scans of homes for a real-estate search engine.
Each image is ONE room shown as a 360° strip of 4 side-by-side views (view 1..4, left to right).
Classify each room's design style using ONLY these styles (cues in brackets):
${STYLES.map((s) => `- "${s}" [${CUES[s]}]`).join("\n")}
Rules:
- Judge fixed finishes first (cabinets, floors, trim, fixtures, ceilings, windows), then furniture. Rooms are often staged or empty; an empty room still has a style from its finishes.
- Give 1-3 styles per room with confidence 0..1; only list a second style if it is clearly present. Be honest: builder-grade beige is "transitional" or "contemporary", not "modern".
- "feel" uses only: ${JSON.stringify(FEELS)}.
- "note" = one short sentence of visible evidence (the things that make it that style). Never describe people or personal items like photos or documents.
- "bestView" = the view number (1-4) that best shows the style.
- "shows" = what the strip actually shows in 1-3 words (e.g. "Kitchen", "Open living and dining", "Stairs", "Backyard"); scan room labels are automatic and can be wrong.
- "isInterior" = false if the strip is mostly outdoors, a garage, a hallway/stairs only, or too dark/blurry to judge. Base "overall" only on interior rooms.
- light = natural light 0..1.
Reply ONLY with JSON:
{"rooms":[{"index":number,"shows":string,"isInterior":boolean,"styles":[{"name":string,"confidence":number}],"materials":[up to 4],"palette":[up to 4 color names],"light":number,"feel":[up to 3],"note":string,"bestView":number}],
 "overall":{"styles":[{"name":string,"confidence":number}] (1-3, the house as a whole),"summary":"one sentence a home buyer would understand, e.g. 'Warm Japandi calm: oak floors, linen tones, low furniture and soft daylight.'","feel":[up to 4],"palette":[up to 4],"materials":[up to 5],"light":number,"consistency":"cohesive"|"mixed","isHomeInterior":boolean (false if these are offices, retail, a leasing office or amenity spaces)}}`;

async function gemini(parts) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const r = await fetch(`${GEMINI_BASE}/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json" } }),
        signal: ctrl.signal,
      });
      if (r.status === 429) {
        const msg = await r.text();
        if (/exceeded your current quota/i.test(msg) && FALLBACK_MODEL && MODEL !== FALLBACK_MODEL) {
          console.log(`  (no quota for ${MODEL}; switching to ${FALLBACK_MODEL})`);
          MODEL = FALLBACK_MODEL;
          continue;
        }
        if (attempt < 5) { await sleep(3000 * 2 ** attempt); continue; }
        throw new Error(`Gemini 429: ${msg.slice(0, 160)}`);
      }
      if (r.status >= 500 && attempt < 5) { await sleep(3000 * 2 ** attempt); continue; }
      if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      const m = text.match(/\{[\s\S]*\}/);
      return JSON.parse(m ? m[0] : text);
    } catch (e) {
      if (attempt < 3 && (e.name === "AbortError" || e instanceof SyntaxError)) continue;
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------- normalize model output onto the taxonomy ----------
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const r2 = (n) => Math.round(n * 100) / 100;
function styles(list) {
  const out = new Map();
  for (const s of list || []) {
    const k = toStyle(s?.name);
    if (k && !out.has(k)) out.set(k, r2(clamp01(s.confidence ?? 0.6)));
  }
  return [...out].map(([name, confidence]) => ({ name, confidence })).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
const feels = (l) => (l || []).map((x) => String(x).toLowerCase()).filter((x) => FEELS.includes(x));
const words = (l, n) => (l || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean).slice(0, n);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function scan(modelId) {
  const model = await graph(Q_ROOMS, { id: modelId });
  const rooms = pickRooms(model);
  if (!rooms.length) throw new Error("no usable rooms with panoramas");
  const shots = [];
  for (const r of rooms) {
    const s = await roomStrip(r);
    if (s) shots.push({ room: r, ...s });
  }
  if (!shots.length) throw new Error("could not download panoramas");

  const parts = [];
  shots.forEach((s, i) => {
    const dims = [s.room.sqft && `~${Math.round(s.room.sqft)} sq ft`, s.room.ceilingFt && `${s.room.ceilingFt.toFixed(1)} ft ceiling`].filter(Boolean).join(", ");
    parts.push({ text: `Image ${i}: ${s.room.label}${dims ? ` (${dims})` : ""}` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: s.strip.toString("base64") } });
  });
  parts.push({ text: `Classify these ${shots.length} rooms and the home overall.` });
  const ai = await gemini(parts);

  fs.rmSync(path.join(FRAMES, modelId), { recursive: true, force: true });
  fs.mkdirSync(path.join(FRAMES, modelId), { recursive: true });
  const outRooms = [];
  for (const [i, s] of shots.entries()) {
    const a = (ai.rooms || []).find((x) => x.index === i) || ai.rooms?.[i];
    if (!a || a.isInterior === false) continue;
    const label = String(a.shows || s.room.label).trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 40);
    const view = Math.min(s.faces.length, Math.max(1, Number(a.bestView) || 1)) - 1;
    const file = `${slug(label)}-${i}.jpg`;
    await sharp(s.faces[view]).resize(640, 640).jpeg({ quality: 72, mozjpeg: true }).toFile(path.join(FRAMES, modelId, file));
    outRooms.push({
      room: label,
      scanLabel: s.room.label,
      sqft: s.room.sqft ? Math.round(s.room.sqft) : null,
      ceilingFt: s.room.ceilingFt ? Math.round(s.room.ceilingFt * 10) / 10 : null,
      styles: styles(a.styles),
      materials: words(a.materials, 4),
      palette: words(a.palette, 4),
      light: r2(clamp01(a.light)),
      feel: feels(a.feel).slice(0, 3),
      note: String(a.note || "").slice(0, 200),
      frame: `/scans/${modelId}/${file}`,
    });
  }
  if (!outRooms.length) throw new Error("no interior rooms in the scan");
  const o = ai.overall || {};
  return {
    modelId,
    scannedAt: new Date().toISOString().slice(0, 10),
    styles: styles(o.styles),
    summary: String(o.summary || "").slice(0, 240),
    feel: feels(o.feel).slice(0, 4),
    palette: words(o.palette, 4),
    materials: words(o.materials, 5),
    light: r2(clamp01(o.light)),
    consistency: o.consistency === "mixed" ? "mixed" : "cohesive",
    homeInterior: o.isHomeInterior !== false,
    rooms: outRooms,
  };
}

// ---------- run ----------
const listings = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "listings.json"), "utf8"));
const HOOD = process.env.HOOD || "Greater Heights";
const ordered = [...listings].sort((a, b) => (b.neighborhood === HOOD) - (a.neighborhood === HOOD) || (a.kind === "buy" ? -1 : 1) - (b.kind === "buy" ? -1 : 1));
let ids = [...new Set(ordered.map((l) => l.matterportId).filter(Boolean))];
if (ONLY) ids = ids.filter((id) => ONLY.includes(id)).concat(ONLY.filter((id) => !ids.includes(id)));

const db = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const todo = ids.filter((id) => FORCE || !db[id]).slice(0, LIMIT);
console.log(`scan-interiors: ${ids.length} models, ${Object.keys(db).length} already scanned, ${todo.length} to do (model ${MODEL})`);

/** Slim copy bundled into the app (lib/adapters/costar.ts); the full file is for server-side tools. */
const lite = (p) => ({
  modelId: p.modelId, scannedAt: p.scannedAt, styles: p.styles, summary: p.summary, feel: p.feel, palette: p.palette,
  materials: p.materials, light: p.light, consistency: p.consistency, homeInterior: p.homeInterior,
  rooms: p.rooms.map((r) => ({ room: r.room, styles: r.styles.slice(0, 1), materials: [], palette: [], light: r.light, feel: [], note: r.note, frame: r.frame })),
});
const writeAtomic = (file, obj) => {
  fs.writeFileSync(file + ".tmp", JSON.stringify(obj));
  fs.renameSync(file + ".tmp", file);
};
const save = () => {
  const keys = Object.keys(db).sort();
  writeAtomic(OUT, Object.fromEntries(keys.map((k) => [k, db[k]])));
  writeAtomic(OUT.replace(/\.json$/, ".lite.json"), Object.fromEntries(keys.map((k) => [k, lite(db[k])])));
};
if (argv.includes("--export")) { save(); console.log(`exported ${Object.keys(db).length} scans`); process.exit(0); }

let done = 0, failed = 0;
const queue = [...todo];
await Promise.all([...Array(CONCURRENCY)].map(async () => {
  while (queue.length) {
    const id = queue.shift();
    const t = Date.now();
    try {
      db[id] = await scan(id);
      save();
      done++;
      const p = db[id];
      console.log(`  ${id}  ${p.styles.map((s) => `${s.name} ${s.confidence}`).join(", ") || "?"}  ·  ${p.rooms.length} rooms  ·  ${((Date.now() - t) / 1000).toFixed(1)}s${p.homeInterior ? "" : "  (not a home interior)"}`);
    } catch (e) {
      failed++;
      console.log(`  ${id}  FAILED  ${String(e.message || e).slice(0, 160)}`);
    }
  }
}));
console.log(`done: ${done} scanned, ${failed} failed, ${Object.keys(db).length} total in data/interiors.json`);
