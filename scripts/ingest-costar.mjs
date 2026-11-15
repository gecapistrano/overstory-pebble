/**
 * CoStar → Pebble ingest.
 *
 * Reads the CoStar data kit (JSON Lines, Houston + Los Angeles) and writes:
 *   data/listings.json  Pebble listings built from real CoStar records
 *                        - residential-listings.jsonl   (Homes.com MLS listings: for sale + for rent)
 *                        - residential-listing-features.jsonl (feature text → highlights + vibe tags)
 *                        - apartment-listing.jsonl      (Apartments.com communities: live rents + availability)
 *                        - commercial-property.jsonl    (apartment building photos, captions, coordinates)
 *                        - commercial-properties.csv    (Matterport 3D model ids per property)
 *   data/market.json    Market intelligence layered from the same kit + sale comps, tenancies and companies,
 *                        used by Gemini for the dashboard recap and suggestions.
 *
 * Usage:  npm run costar            (reads COSTAR_DUMP_PATH from .env.local)
 *         COSTAR_DUMP_PATH=/path/to/costar-hackathon-kit node scripts/ingest-costar.mjs
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------- config ----------
function envFile() {
  const f = path.join(ROOT, ".env.local");
  if (!fs.existsSync(f)) return {};
  const out = {};
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const ENV = { ...envFile(), ...process.env };
const KIT = path.resolve(ROOT, ENV.COSTAR_DUMP_PATH || "../CoStar/backend/data/costar-hackathon-kit");
const DATA = path.join(KIT, "data");
if (!fs.existsSync(DATA)) {
  console.error(`CoStar kit not found at ${KIT}. Set COSTAR_DUMP_PATH in .env.local.`);
  process.exit(1);
}

/** Commute anchors (one per market). The Houston demo centres on the Heights, next to Downtown. */
const MARKETS = {
  Houston: { anchor: "Downtown Houston", lat: 29.7589, lng: -95.3677, demoHood: "Greater Heights", caps: { buy: 170, rent: 150 } },
  "Los Angeles": { anchor: "Downtown LA", lat: 34.0522, lng: -118.2437, demoHood: "Downtown LA", caps: { buy: 70, rent: 70 } },
};
const AGENT_IDS = ["maya", "daniel", "priya", "marcus", "elena"];
const MP_REF = new Set([36, 234]); // MatterportScan, MatterportStreamingKey

// ---------- helpers ----------
async function* stream(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DATA, file), { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}
const median = (a) => {
  const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const km = (a, b, c, d) => {
  const R = 6371, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(c - a), dLng = toR(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const cityOf = (c) => (!c ? null : /^houston$/i.test(c) ? "Houston" : /^los angeles$/i.test(c) ? "Los Angeles" : null);
const titleCase = (s) => (s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const mpThumb = (id) => `https://my.matterport.com/api/v1/player/models/${id}/thumb?width=1200&dpr=1`;
const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

function commute(city, lat, lng) {
  const m = MARKETS[city];
  const d = km(m.lat, m.lng, lat, lng);
  if (d <= 1.8) return { minutes: Math.max(4, Math.round((d * 1.25 * 60) / 5)), mode: "walk", km: d };
  return { minutes: Math.round((d * 1.3 * 60) / 38 + 5), mode: "drive", km: d };
}

// ---------- vibe tags derived from CoStar text (remarks, feature lines, photo alt text, style) ----------
const STYLE_RULES = [
  [/farmhouse/, "modern farmhouse"],
  [/craftsman|bungalow/, "craftsman"],
  [/victorian|queen anne/, "victorian"],
  [/\bloft\b|industrial|exposed (brick|duct|concrete)|warehouse/, "industrial"],
  [/mid[- ]century|contemporary|modern/, "contemporary"],
  [/minimalis|clean lines/, "minimalist"],
  [/scandi|nordic/, "scandinavian"],
  [/gothic|tudor/, "gothic"],
  [/colonial|traditional|georgian|cape cod|ranch|french/, "colonial"],
  [/\bart\b|artist|gallery|eclectic|bohemian|mural/, "artsy"],
];
const MATERIALS = [
  [/hardwood|wood floor|oak floor/, "hardwood"], [/brick/, "brick"], [/stone/, "stone"], [/granite/, "granite"], [/quartz/, "quartz"],
  [/marble/, "marble"], [/tile/, "tile"], [/concrete/, "concrete"], [/shiplap/, "shiplap"], [/stucco/, "stucco"], [/stainless/, "stainless steel"],
  [/vinyl plank|lvp|luxury vinyl/, "vinyl plank"], [/carpet/, "carpet"], [/glass/, "glass"],
];
const COLORS = ["white", "gray", "grey", "beige", "cream", "blue", "navy", "green", "black", "brown", "tan", "red", "yellow", "teal", "sage"];
const AMBIENCE = [
  [/natural light|sunlit|sun-filled|light-filled|bright|abundant light|lots of light|skylight|large windows|walls of windows|floor-to-ceiling/, "bright"],
  [/high ceiling|vaulted|open floor|open concept|spacious|soaring/, "airy"],
  [/fireplace|cozy|cosy|charming|warm/, "cozy"],
  [/quiet|peaceful|cul-de-sac|tranquil|serene|private/, "quiet"],
  [/garden|yard|landscap|trees|greenbelt|backyard|patio/, "leafy"],
  [/historic|original|character|charm|vintage/, "historic"],
  [/walkable|walk to|downtown|urban|city view|skyline|nightlife/, "urban"],
  [/modern|sleek|updated|renovated|new construction|remodel/, "sleek"],
  [/pool|spa|resort/, "resort"],
  [/calm|zen|spa-like/, "calm"],
  [/creative|studio|art/, "creative"],
];
function vibes(text, yearBuilt, styleHint) {
  const t = text.toLowerCase();
  let style = null;
  for (const [re, s] of STYLE_RULES) if (re.test((styleHint || "").toLowerCase())) { style = s; break; }
  if (!style) for (const [re, s] of STYLE_RULES) if (re.test(t)) { style = s; break; }
  if (!style) style = yearBuilt && yearBuilt < 1945 ? "craftsman" : yearBuilt && yearBuilt >= 2005 ? "contemporary" : "colonial";
  const materials = MATERIALS.filter(([re]) => re.test(t)).map(([, m]) => m).slice(0, 4);
  const colors = [...new Set(COLORS.filter((c) => new RegExp(`\\b${c}\\b`).test(t)).map((c) => (c === "grey" ? "gray" : c)))].slice(0, 3);
  const ambience = AMBIENCE.filter(([re]) => re.test(t)).map(([, a]) => a);
  if (yearBuilt && yearBuilt < 1950 && !ambience.includes("historic")) ambience.push("historic");
  if (style === "artsy" && !ambience.includes("creative")) ambience.push("creative");
  const lightHits = (t.match(/natural light|sunlit|sun-filled|light-filled|bright|skylight|large windows|walls of windows|floor-to-ceiling|abundant light/g) || []).length;
  const light = Math.min(0.98, 0.45 + lightHits * 0.14 + (ambience.includes("airy") ? 0.08 : 0));
  return { style, materials: materials.length ? materials : ["drywall"], colors: colors.length ? colors : ["neutral"], ambience: ambience.slice(0, 5), light: round(light, 2) };
}

// ---------- 1. Matterport ids per commercial property ----------
const mpByProperty = new Map();
for (const line of fs.readFileSync(path.join(KIT, "commercial-properties.csv"), "utf8").split(/\r?\n/).slice(1)) {
  const [pid, model] = line.split(",");
  if (pid && model) (mpByProperty.get(+pid) || mpByProperty.set(+pid, []).get(+pid)).push(model);
}

// ---------- 2. Residential listing features ----------
console.log("Reading residential-listing-features…");
const features = new Map();
for await (const f of stream("residential-listing-features.jsonl")) {
  features.set(f.id, {
    highlights: (f.highlights || []).map((h) => h.text).filter(Boolean),
    lines: (f.sections || []).flatMap((s) => s.lines || []),
  });
}

// ---------- 3. Residential listings ----------
console.log("Reading residential-listings…");
const residential = []; // candidate Pebble listings
const resStats = { Houston: [], "Los Angeles": [] }; // every listing, for market.json
for await (const d of stream("residential-listings.jsonl")) {
  const p = d.property || {};
  const a = p.address || {};
  const city = cityOf(a.city);
  if (!city) continue;
  const hood = (a.areas || []).find((x) => x.enterpriseEntityType === 5 && x.isPreferred)?.name || null;
  const sqft = p.sqftMax || p.sqftMin || null;
  resStats[city].push({
    hood, status: d.listingStatus, forSale: d.forSaleStatus, tx: d.transactionType, price: d.currentPrice, orig: d.originalPrice,
    sqft, dom: d.dom, beds: p.bedsMax, lat: a.latitude, lng: a.longitude,
    closeDate: d.closeDate || d.offMarketDate || null, listDate: d.listDate || null,
    closePrice: d.closePrice ?? null, lastAsk: d.resoValues?.listPrice ?? d.currentPrice ?? null,
  });
  if (d.listingStatus !== 1 || !a.latitude || !a.longitude) continue;
  if (!d.currentPrice || d.currentPrice < (d.transactionType === 2 ? 300 : 10000)) continue; // skip placeholder prices ($1 etc.)
  const media = d.media || [];
  const mp = media.find((m) => m.videoKey && (MP_REF.has(m.externalReferenceType) || MP_REF.has(m.threeDimensionalScanType)))?.videoKey;
  if (!mp) continue;
  const photos = media.filter((m) => m.type === 4 && m.uri).sort((x, y) => (x.displayOrder ?? 99) - (y.displayOrder ?? 99));
  const feat = features.get(d.id) || { highlights: [], lines: [] };
  const rv = d.resoValues || {};
  const yearBuilt = p.yearBuilt || rv.structure?.yearBuilt || 0;
  const text = [d.remarks, ...feat.highlights, ...feat.lines, ...photos.map((m) => m.altText || ""), rv.structure?.architecturalStyle].join(" ");
  const v = vibes(text, yearBuilt, rv.structure?.architecturalStyle);
  const kind = d.transactionType === 2 ? "rent" : "buy";
  const typeLabel = (p.mlsPropertyType || "").toLowerCase().includes("condo") ? "condo" : (p.mlsPropertyType || "").toLowerCase().includes("townho") ? "townhouse" : "house";
  const cm = commute(city, a.latitude, a.longitude);
  const beds = p.bedsMax ?? p.bedsMin ?? 0;
  const baths = (p.bathsFull || p.bathsMax || 1) + (p.bathsHalf ? 0.5 : 0);
  const street = clean(a.fullStreetAddress) || "Address on request";
  const styleWord = v.style === "colonial" ? "Traditional" : v.style === "contemporary" ? "Modern" : titleCase(v.style);
  residential.push({
    city, hood, kmToAnchor: cm.km,
    listing: {
      id: `cs-r${d.id}`,
      title: `${beds ? beds + "-Bed " : ""}${styleWord} ${titleCase(typeLabel)} on ${titleCase(a.streetName || street)}${a.streetSuffix ? " " + a.streetSuffix : ""}`,
      kind,
      propertyType: typeLabel,
      price: Math.round(d.currentPrice),
      beds, baths, sqft: sqft || 0,
      neighborhood: hood || p.subdivision || city,
      address: `${street}, ${a.city}, ${a.state} ${a.zip || ""}`.trim(),
      lat: a.latitude, lng: a.longitude,
      minutesToCampus: cm.minutes, commuteMode: cm.mode,
      petFriendly: kind === "buy" ? true : Boolean(rv.isPetFriendly),
      availableFrom: "Now",
      ...v,
      description: clean(d.remarks).slice(0, 480).replace(/\s\S*$/, "…"),
      highlights: feat.highlights.slice(0, 5),
      agentId: AGENT_IDS[hash(d.id) % AGENT_IDS.length],
      yearBuilt,
      artSeed: hash(d.id) % 10000,
      source: "costar",
      photos: [mpThumb(mp), ...photos.slice(0, 4).map((m) => m.uri)],
      city, anchor: MARKETS[city].anchor, matterportId: mp,
      costar: {
        dataset: "residential-listings", listingId: d.id, propertyId: d.propertyId ?? null, dom: d.dom ?? null,
        originalPrice: d.originalPrice ?? null, listDate: (d.listDate || "").slice(0, 10) || null,
        pricePerSqft: sqft && kind === "buy" ? Math.round(d.currentPrice / sqft) : null,
        hoa: rv.hoa?.fee ?? null, homesUrl: p.url ? `https://www.homes.com/property/${p.url.toLowerCase()}` : null,
      },
    },
  });
}

// ---------- 4. Apartment listings + their commercial property records ----------
console.log("Reading apartment-listing…");
const apartments = [];
const aptIds = new Set();
for await (const a of stream("apartment-listing.jsonl")) {
  const city = cityOf(a.address?.city);
  if (!city) continue;
  apartments.push({ ...a, city });
  aptIds.add(a.propertyId);
}
console.log("Reading commercial-property (≈190 MB)…");
const propGeo = new Map(); // id -> {city, lat, lng}
const aptProp = new Map(); // apartment properties: captions/photos/vacancy
for await (const p of stream("commercial-property.jsonl")) {
  const a = p.primaryAddress || {};
  propGeo.set(p.id, { city: cityOf(a.city), lat: a.latitude, lng: a.longitude, type: p.propertyType, name: p.buildingName });
  if (aptIds.has(p.id)) {
    const att = p.attachments || [];
    aptProp.set(p.id, {
      photos: att.filter((x) => (x.attachmentType === 3 || x.attachmentType === 4) && x.attachmentUri).slice(0, 5).map((x) => ({ uri: x.attachmentUri, caption: x.caption || "" })),
      tourCaptions: att.filter((x) => MP_REF.has(x.videoExternalReferenceType)).map((x) => x.caption || ""),
      mpAttach: att.filter((x) => MP_REF.has(x.videoExternalReferenceType)).map((x) => x.videoKey).filter(Boolean),
      vacancy: p.propertyApartment?.vacancyPercent ?? null,
      stories: p.numStoriesAboveGrade ?? null,
    });
  }
}

// neighbourhood names for apartments: nearest named residential listing
const named = Object.values(resStats).flat().filter((r) => r.hood && r.lat);
const nearestHood = (lat, lng) => {
  let best = null, bd = Infinity;
  for (const r of named) {
    const d = (r.lat - lat) ** 2 + (r.lng - lng) ** 2;
    if (d < bd) { bd = d; best = r.hood; }
  }
  return best;
};

const rentals = [];
for (const a of apartments) {
  const ad = a.address || {};
  if (!ad.latitude || !(a.numUnitsAvailable > 0)) continue;
  const prop = aptProp.get(a.propertyId) || { photos: [], tourCaptions: [], mpAttach: [] };
  const models = mpByProperty.get(a.propertyId) || prop.mpAttach;
  if (!models?.length) continue;
  const hood = nearestHood(ad.latitude, ad.longitude);
  const captions = [...prop.photos.map((x) => x.caption), ...prop.tourCaptions].join(" ");
  const cm = commute(a.city, ad.latitude, ad.longitude);
  // one Pebble listing per bedroom count, cheapest available floor plan
  const byBeds = new Map();
  for (const m of a.apartmentModels || []) {
    if (!(m.numUnitsAvailable > 0) || !m.minRent || m.numBeds == null || m.numBeds > 4) continue;
    const cur = byBeds.get(m.numBeds);
    if (!cur || m.minRent < cur.minRent) byBeds.set(m.numBeds, m);
  }
  const plans = [...byBeds.values()].sort((x, y) => x.numBeds - y.numBeds).slice(0, 2);
  const street = [ad.streetNumber, ad.streetName, ad.streetType].filter(Boolean).join(" ");
  const pet = /\bpet|dog|bark\b/i.test(captions);
  plans.forEach((m, i) => {
    const text = `${a.buildingName || ""} ${captions} ${a.yearBuilt >= 2015 ? "modern updated" : ""} ${m.name || ""}`;
    const v = vibes(text, a.yearBuilt, a.yearBuilt >= 2010 ? "contemporary" : "");
    const mp = models[i % models.length];
    const name = a.buildingName || street;
    rentals.push({
      city: a.city, hood, kmToAnchor: cm.km,
      listing: {
        id: `cs-a${a.id}-${m.numBeds}`,
        title: `${name} · ${m.numBeds === 0 ? "Studio" : m.numBeds + "-Bed"}`,
        kind: "rent",
        propertyType: "apartment",
        price: Math.round(m.minRent),
        beds: m.numBeds, baths: m.numBaths || 1, sqft: m.minSquareFeet || m.maxSquareFeet || 0,
        neighborhood: hood || a.city,
        address: `${street}, ${ad.city}, ${ad.state} ${(ad.postCode || "").slice(0, 5)}`.trim(),
        lat: ad.latitude, lng: ad.longitude,
        minutesToCampus: cm.minutes, commuteMode: cm.mode,
        petFriendly: pet,
        availableFrom: "Now",
        ...v,
        description: `${a.totalNumUnits ? a.totalNumUnits + "-unit " : ""}apartment community${a.yearBuilt ? ` built in ${a.yearBuilt}` : ""}${a.propertyManagementCompanyName ? `, managed by ${a.propertyManagementCompanyName}` : ""}. ${a.numUnitsAvailable} units available now across the community; the ${/[a-z]_?\d/i.test(m.name || "") ? "" : (m.name || "") + " "}${m.minSquareFeet ? m.minSquareFeet + " sq ft " : ""}${m.numBeds ? m.numBeds + "-bed" : "studio"} plan rents from $${Math.round(m.minRent).toLocaleString("en-US")}${m.maxRent && m.maxRent !== m.minRent ? ` to $${Math.round(m.maxRent).toLocaleString("en-US")}` : ""}/mo with ${m.numUnitsAvailable} available.`,
        highlights: [...new Set(prop.photos.map((x) => x.caption).filter((c) => c && !/primary photo|^building|^\d/i.test(c)))].slice(0, 4),
        agentId: AGENT_IDS[hash(a.id + m.numBeds) % AGENT_IDS.length],
        yearBuilt: a.yearBuilt || 0,
        artSeed: hash(a.id) % 10000,
        source: "costar",
        photos: [mpThumb(mp), ...(a.primaryPhoto?.attachmentUri ? [a.primaryPhoto.attachmentUri] : []), ...prop.photos.map((x) => x.uri)].slice(0, 5),
        city: a.city, anchor: MARKETS[a.city].anchor, matterportId: mp,
        costar: {
          dataset: "apartment-listing", listingId: a.id, propertyId: a.propertyId, floorPlan: m.name || null,
          unitsAvailable: a.numUnitsAvailable, totalUnits: a.totalNumUnits || a.totalActiveUnits || null,
          planUnitsAvailable: m.numUnitsAvailable, maxRent: m.maxRent || null, manager: a.propertyManagementCompanyName || null,
          vacancyPercent: prop.vacancy,
        },
      },
    });
  });
}

// ---------- 5. Select the demo inventory ----------
const pick = (rows, city, cap) => {
  const demoHood = MARKETS[city].demoHood;
  const mine = rows.filter((r) => r.city === city);
  const demo = mine.filter((r) => r.hood === demoHood);
  const rest = mine.filter((r) => r.hood !== demoHood).sort((x, y) => x.kmToAnchor - y.kmToAnchor);
  return [...demo, ...rest].slice(0, cap).map((r) => r.listing);
};
const listings = [];
for (const city of Object.keys(MARKETS)) {
  const { buy, rent } = MARKETS[city].caps;
  listings.push(...pick(residential.filter((r) => r.listing.kind === "buy"), city, buy));
  const resRent = residential.filter((r) => r.listing.kind === "rent" && r.city === city).map((r) => r.listing);
  listings.push(...resRent, ...pick(rentals, city, rent - resRent.length));
}
fs.writeFileSync(path.join(ROOT, "data", "listings.json"), JSON.stringify(listings));
console.log(`Wrote data/listings.json: ${listings.length} CoStar listings`);

// ---------- 6. Market intelligence (layers multiple CoStar datasets) ----------
console.log("Building market intelligence…");
const now = new Date("2026-11-15");
const yearAgo = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1);
const twoYears = new Date(now); twoYears.setFullYear(now.getFullYear() - 2);

function residentialBlock(rows) {
  const active = rows.filter((r) => r.status === 1 && r.tx === 1 && r.price >= 10000);
  const sold = rows.filter((r) => r.status === 4 && r.tx === 1 && r.closeDate && new Date(r.closeDate) >= yearAgo);
  const leased = rows.filter((r) => r.status === 4 && r.tx === 2 && r.closeDate && new Date(r.closeDate) >= yearAgo);
  const daysToSell = sold.filter((r) => r.listDate).map((r) => (new Date(r.closeDate) - new Date(r.listDate)) / 864e5).filter((x) => x >= 0);
  const rentActive = rows.filter((r) => r.status === 1 && r.tx === 2 && r.price >= 300);
  const cut = active.filter((r) => r.orig && r.price < r.orig);
  return {
    activeForSale: active.length,
    medianListPrice: round(median(active.map((r) => r.price))),
    medianPricePerSqft: round(median(active.filter((r) => r.sqft).map((r) => r.price / r.sqft))),
    medianDaysOnMarket: round(median(active.map((r) => r.dom))),
    priceCutSharePct: active.length ? round((cut.length / active.length) * 100) : null,
    medianPriceCutPct: round(median(cut.map((r) => ((r.orig - r.price) / r.orig) * 100)), 1),
    soldLast12m: sold.length,
    medianSoldPrice: round(median(sold.map((r) => r.closePrice).filter(Boolean))), // null in Texas (non-disclosure)
    medianLastAskOfSold: round(median(sold.map((r) => r.lastAsk).filter(Boolean))),
    medianDaysToSell: round(median(daysToSell)),
    leasedLast12m: leased.length,
    medianLeasedRent: round(median(leased.map((r) => r.closePrice || r.lastAsk).filter(Boolean))),
    activeForRent: rentActive.length,
    medianHomeRent: round(median(rentActive.map((r) => r.price))),
  };
}

const market = { generatedAt: new Date().toISOString().slice(0, 10), source: "CoStar data kit (Houston + Los Angeles)", demo: { city: "Houston", neighborhood: MARKETS.Houston.demoHood }, cities: {} };

// sale comps → city (via commercial property)
const comps = { Houston: [], "Los Angeles": [] };
for await (const c of stream("commercial-sale-comp.jsonl")) {
  if (!c.soldDate || new Date(c.soldDate) < twoYears) continue;
  const pid = (c.entities || []).map((e) => e.propertyId).find((id) => propGeo.has(id));
  const g = pid && propGeo.get(pid);
  if (!g?.city) continue;
  comps[g.city].push({ price: c.soldForPrice, confirmed: c.salePriceStatus === 3, date: c.soldDate.slice(0, 10) });
}

// current tenancies near the anchor → top employers (company-detail)
console.log("Reading location-occupancy + company-detail…");
const nearAnchor = new Map(); // tenantLocationId -> {city, propertyId}
for await (const o of stream("location-occupancy.jsonl")) {
  if (o.toDate || !o.tenantLocationId) continue;
  const g = propGeo.get(o.propertyId);
  if (!g?.city || !g.lat) continue;
  if (km(MARKETS[g.city].lat, MARKETS[g.city].lng, g.lat, g.lng) > 6) continue;
  nearAnchor.set(o.tenantLocationId, { city: g.city, building: g.name });
}
const employers = { Houston: [], "Los Angeles": [] };
for await (const c of stream("company-detail.jsonl")) {
  const n = nearAnchor.get(c.id);
  if (n && c.numEmployees) employers[n.city].push({ name: c.name, employees: c.numEmployees, building: n.building || null });
}

for (const city of Object.keys(MARKETS)) {
  const rows = resStats[city];
  const hoods = {};
  for (const r of rows) if (r.hood) (hoods[r.hood] ||= []).push(r);
  const hoodBlocks = Object.entries(hoods)
    .map(([name, rs]) => ({ name, ...residentialBlock(rs) }))
    .filter((h) => h.activeForSale >= 4)
    .sort((x, y) => y.activeForSale - x.activeForSale)
    .slice(0, 12);

  const apts = apartments.filter((a) => a.city === city);
  const units = apts.reduce((s, a) => s + (a.totalNumUnits || a.totalActiveUnits || 0), 0);
  const avail = apts.reduce((s, a) => s + (a.numUnitsAvailable || 0), 0);
  const rentByBeds = {};
  for (const b of [0, 1, 2, 3]) {
    const r = apts.flatMap((a) => (a.apartmentModels || []).filter((m) => m.numBeds === b && m.minRent).map((m) => m.minRent));
    rentByBeds[b === 0 ? "studio" : `${b}bed`] = round(median(r));
  }
  const managers = {};
  for (const a of apts) if (a.propertyManagementCompanyName) managers[a.propertyManagementCompanyName] = (managers[a.propertyManagementCompanyName] || 0) + 1;

  const cc = comps[city];
  const empMap = new Map();
  for (const e of employers[city]) {
    const k = e.name.replace(/,?\s+(inc|llc|lp|corp|corporation|co)\.?$/i, "");
    empMap.set(k, Math.max(empMap.get(k) || 0, e.employees));
  }
  const inv = listings.filter((l) => l.city === city);
  market.cities[city] = {
    anchor: MARKETS[city].anchor,
    residential: residentialBlock(rows),
    neighborhoods: hoodBlocks,
    apartments: {
      communities: apts.length, totalUnits: units, unitsAvailable: avail,
      availabilityPct: units ? round((avail / units) * 100, 1) : null,
      medianAskingRent: rentByBeds,
      newCommunitiesSince2020: apts.filter((a) => a.yearBuilt >= 2020).length,
      topManagers: Object.entries(managers).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([name, n]) => ({ name, communities: n })),
    },
    commercialSales24m: {
      count: cc.length,
      confirmedVolume: cc.filter((c) => c.confirmed && c.price).reduce((s, c) => s + c.price, 0),
      medianPrice: round(median(cc.filter((c) => c.price).map((c) => c.price))),
    },
    employersNearAnchor: [...empMap.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([name, employees]) => ({ name, employees })),
    pebbleInventory: {
      listings: inv.length, forSale: inv.filter((l) => l.kind === "buy").length, forRent: inv.filter((l) => l.kind === "rent").length,
      with3DTour: inv.filter((l) => l.matterportId).length,
    },
  };
}
fs.writeFileSync(path.join(ROOT, "data", "market.json"), JSON.stringify(market, null, 1));
console.log("Wrote data/market.json");
for (const [c, m] of Object.entries(market.cities)) console.log(c, JSON.stringify(m.pebbleInventory), "median list", m.residential.medianListPrice);
