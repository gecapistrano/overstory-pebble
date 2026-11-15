// Generates realistic mock listings around Princeton, NJ -> data/listings.json
// Deterministic (seeded) so the demo is reproducible. Run: npm run data
import { writeFileSync } from "node:fs";

let seed = 20261115;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);

const CAMPUS = { lat: 40.3487, lng: -74.6593 }; // Nassau Hall

const HOODS = {
  "Downtown Princeton": [40.3502, -74.6596, ["Nassau St", "Witherspoon St", "Chambers St", "Spring St", "Palmer Sq W"]],
  "Western Section": [40.3478, -74.6712, ["Library Pl", "Hodge Rd", "Bayard Ln", "Boudinot St", "Cleveland Ln"]],
  "Witherspoon-Jackson": [40.3548, -74.6628, ["John St", "Birch Ave", "Leigh Ave", "Jackson St", "Lytle St"]],
  Riverside: [40.3352, -74.6431, ["Riverside Dr", "Prospect Ave", "Edgehill St", "Hartley Ave"]],
  Littlebrook: [40.3388, -74.6305, ["Snowden Ln", "Magnolia Ln", "Hawthorne Ave", "Hamilton Ave"]],
  Jugtown: [40.3561, -74.6475, ["Harrison St", "Evelyn Pl", "Linden Ln", "Chestnut St"]],
  "Princeton Junction": [40.3172, -74.6231, ["Alexander Rd", "Station Dr", "Cranbury Rd", "Wallace Rd"]],
  "West Windsor": [40.2992, -74.6168, ["Clarksville Rd", "Rabbit Hill Rd", "Village Rd E"]],
  Lawrenceville: [40.2971, -74.7296, ["Main St", "Gordon Ave", "Craven Ln"]],
  Kingston: [40.3772, -74.6152, ["Laurel Ave", "Heathcote Rd", "Main St"]],
  "Rocky Hill": [40.3995, -74.6391, ["Washington St", "Princeton Ave", "Crescent Ave"]],
  Plainsboro: [40.3334, -74.5902, ["Scudders Mill Rd", "Hunters Glen Dr", "Plainsboro Rd"]],
  Hopewell: [40.3891, -74.7621, ["Broad St", "Model Ave", "Greenwood Ave"]],
  Pennington: [40.3283, -74.7908, ["Main St", "Burd St", "Delaware Ave"]],
  Montgomery: [40.4142, -74.6881, ["Burnt Hill Rd", "Cherry Valley Rd", "Province Line Rd"]],
};

const AGENTS = ["maya", "daniel", "priya", "marcus", "elena"];

const STYLE_TAGS = {
  gothic: { materials: ["stone", "slate", "dark wood"], colors: ["charcoal", "moss"], ambience: ["quiet", "historic"] },
  minimalist: { materials: ["concrete", "glass", "white oak"], colors: ["white", "warm grey"], ambience: ["bright", "calm"] },
  artsy: { materials: ["reclaimed wood", "brick", "terrazzo"], colors: ["terracotta", "mustard", "teal"], ambience: ["creative", "bright"] },
  "modern farmhouse": { materials: ["board and batten", "black steel", "pine"], colors: ["white", "black"], ambience: ["cozy", "airy"] },
  colonial: { materials: ["brick", "clapboard", "hardwood"], colors: ["red brick", "cream"], ambience: ["classic", "quiet"] },
  victorian: { materials: ["painted wood", "stained glass"], colors: ["sage", "blush"], ambience: ["cozy", "charming"] },
  industrial: { materials: ["exposed brick", "steel", "concrete"], colors: ["rust", "graphite"], ambience: ["urban", "lofty"] },
  craftsman: { materials: ["cedar shingle", "stone", "oak"], colors: ["olive", "cream"], ambience: ["cozy", "warm"] },
  contemporary: { materials: ["glass", "fiber cement", "walnut"], colors: ["slate", "white"], ambience: ["bright", "sleek"] },
  scandinavian: { materials: ["birch", "linen", "white oak"], colors: ["white", "sand"], ambience: ["bright", "calm", "cozy"] },
};

function commute(lat, lng) {
  const dLat = (lat - CAMPUS.lat) * 111;
  const dLng = (lng - CAMPUS.lng) * 85;
  const km = Math.sqrt(dLat * dLat + dLng * dLng) * 1.2;
  if (km <= 2.6) return { minutes: Math.max(3, Math.round((km / 5) * 60)), mode: "walk" };
  return { minutes: Math.round((km / 38) * 60 + 4), mode: "drive" };
}

function jitter([lat, lng]) {
  return [+(lat + between(-0.004, 0.004)).toFixed(5), +(lng + between(-0.005, 0.005)).toFixed(5)];
}

const listings = [];
let n = 1;
function add(o) {
  const [lat, lng] = o.coords || jitter(HOODS[o.neighborhood]);
  const street = o.street || pick(HOODS[o.neighborhood][2]);
  const st = STYLE_TAGS[o.style] || { materials: [], colors: [], ambience: [] };
  const c = commute(lat, lng);
  const ambience = [...new Set([...(o.ambience || []), ...st.ambience])];
  listings.push({
    id: `pb-${String(n).padStart(3, "0")}`,
    title: o.title,
    kind: o.kind,
    propertyType: o.propertyType,
    price: o.price,
    beds: o.beds ?? 0,
    baths: o.baths ?? 0,
    sqft: o.sqft ?? 0,
    neighborhood: o.neighborhood,
    address: `${o.num ?? Math.floor(between(10, 380))} ${street}, ${o.town || (["Princeton Junction", "West Windsor", "Lawrenceville", "Kingston", "Rocky Hill", "Plainsboro", "Hopewell", "Pennington", "Montgomery"].includes(o.neighborhood) ? o.neighborhood : "Princeton")}, NJ`,
    lat, lng,
    minutesToCampus: c.minutes,
    commuteMode: c.mode,
    petFriendly: o.pets ?? rnd() > 0.45,
    availableFrom: o.available || pick(["2027-06-01", "2027-07-01", "2027-08-01", "2027-08-15", "2027-09-01", "Now"]),
    style: o.style,
    materials: o.materials || st.materials,
    colors: o.colors || st.colors,
    ambience,
    light: o.light ?? (ambience.includes("bright") ? 0.85 : between(0.35, 0.7)),
    description: o.description,
    highlights: o.highlights || [],
    agentId: o.agent || pick(AGENTS),
    yearBuilt: o.year || Math.floor(between(1890, 2023)),
    artSeed: n * 7919,
    source: "mock",
  });
  n++;
}

// ---- Hand-picked hero listings (used in the demo story) ----
add({ title: "Sunlit Artist Loft", kind: "rent", propertyType: "loft", price: 2850, beds: 2, baths: 1, sqft: 1080, neighborhood: "Witherspoon-Jackson", street: "Witherspoon St", num: 214, style: "artsy", ambience: ["bright", "creative", "airy"], light: 0.97, pets: true, available: "2027-08-01", agent: "maya", year: 1912,
  description: "A converted print shop with 12-foot windows, terrazzo floors, and a gallery wall. Morning light floods the open studio; a fenced courtyard is perfect for a dog.",
  highlights: ["12-ft windows", "Fenced courtyard", "Gallery wall"] });
add({ title: "Ivy Cottage on John St", kind: "rent", propertyType: "house", price: 2950, beds: 2, baths: 1.5, sqft: 1150, neighborhood: "Witherspoon-Jackson", street: "John St", num: 58, style: "victorian", ambience: ["cozy", "quiet"], light: 0.62, pets: true, available: "2027-08-01", agent: "maya", year: 1898,
  description: "A sage-green Victorian cottage with a reading nook, gas fireplace, and a small garden. Eight minutes on foot to Nassau Hall.",
  highlights: ["Fireplace", "Garden", "Reading nook"] });
add({ title: "Chestnut Street Flat", kind: "rent", propertyType: "apartment", price: 2700, beds: 2, baths: 1, sqft: 960, neighborhood: "Jugtown", street: "Chestnut St", num: 31, style: "craftsman", ambience: ["cozy", "warm"], light: 0.55, pets: true, available: "2027-08-15", agent: "daniel", year: 1924,
  description: "Second-floor flat in a cedar-shingle craftsman. Built-in bookshelves, oak floors, and a porch swing out front.",
  highlights: ["Built-in shelves", "Porch", "Dog-friendly"] });
add({ title: "Palmer Square Studio Loft", kind: "rent", propertyType: "loft", price: 3200, beds: 1, baths: 1, sqft: 820, neighborhood: "Downtown Princeton", street: "Palmer Sq W", num: 12, style: "industrial", ambience: ["urban", "bright"], light: 0.8, pets: false, available: "Now", agent: "priya",
  description: "Exposed brick loft above the square. Walk to everything.", highlights: ["Exposed brick", "Above the square"] });
add({ title: "Gothic Revival Carriage House", kind: "rent", propertyType: "house", price: 3400, beds: 2, baths: 2, sqft: 1300, neighborhood: "Western Section", street: "Library Pl", num: 9, style: "gothic", ambience: ["quiet", "historic"], light: 0.4, pets: true, available: "2027-07-01", agent: "maya", year: 1887,
  description: "Stone carriage house with pointed-arch windows and a private lane, steps from the Seminary.", highlights: ["Pointed-arch windows", "Private lane"] });
add({ title: "Bright Scandinavian Two-Bed", kind: "rent", propertyType: "apartment", price: 2600, beds: 2, baths: 1, sqft: 900, neighborhood: "Riverside", street: "Riverside Dr", num: 141, style: "scandinavian", ambience: ["bright", "calm", "cozy"], light: 0.9, pets: true, available: "2027-08-01", agent: "elena",
  description: "White oak, linen, and a wall of south-facing windows. Lake Carnegie trail at the corner.", highlights: ["South-facing", "Near the lake trail"] });
add({ title: "Modern Farmhouse on Snowden", kind: "buy", propertyType: "house", price: 1295000, beds: 4, baths: 3, sqft: 2900, neighborhood: "Littlebrook", street: "Snowden Ln", num: 187, style: "modern farmhouse", ambience: ["cozy", "airy", "family"], light: 0.75, pets: true, agent: "marcus",
  description: "Board-and-batten farmhouse on half an acre, walk to Littlebrook Elementary.", highlights: ["Half-acre lot", "Top-rated schools"] });
add({ title: "Hopewell Meadow Parcel", kind: "land", propertyType: "land", price: 385000, sqft: 217800, neighborhood: "Hopewell", street: "Greenwood Ave", style: "land", ambience: ["open", "quiet"], light: 1, pets: true, agent: "marcus",
  description: "Five gently rolling acres, perc-tested, with mature oaks along the road. Zoned residential.", highlights: ["5 acres", "Perc-tested", "Zoned R-1"] });
add({ title: "Nassau Inn Garden Suite", kind: "stay", propertyType: "suite", price: 289, beds: 1, baths: 1, sqft: 520, neighborhood: "Downtown Princeton", street: "Palmer Sq E", num: 10, style: "colonial", ambience: ["cozy", "classic"], light: 0.6, pets: false, agent: "priya", available: "Now",
  description: "A short stay for house-hunting weekends. Breakfast included, a block from campus.", highlights: ["Breakfast", "Weekly rates"] });
add({ title: "Witherspoon Retail Corner", kind: "commercial", propertyType: "office", price: 6800, sqft: 1800, neighborhood: "Downtown Princeton", street: "Witherspoon St", num: 120, style: "contemporary", ambience: ["bright", "busy"], light: 0.85, pets: false, agent: "elena",
  description: "Glass-front retail or studio space with high foot traffic.", highlights: ["Corner storefront", "High foot traffic"] });

// ---- Procedural listings for breadth ----
const RENT_TITLES = {
  gothic: ["Stone Arch Apartment", "Cloister Lane Flat"], minimalist: ["Quiet White Two-Bed", "Concrete & Glass Flat", "Minimal Garden Unit"],
  artsy: ["Painted Door Duplex", "Mural House Apartment"], "modern farmhouse": ["Barn-Style Townhome"], colonial: ["Brick Colonial Half-House", "Shuttered Colonial Flat"],
  victorian: ["Porch-Front Victorian Unit", "Turret Room Apartment"], industrial: ["Mill Loft", "Warehouse Loft"], craftsman: ["Bungalow Rental", "Cedar Porch Flat"],
  contemporary: ["Glass Corner Apartment", "Sleek Garden Condo"], scandinavian: ["Birch & Linen Apartment", "Nordic Light Flat"],
};
const BUY_TITLES = {
  gothic: ["Gothic Revival Manor"], minimalist: ["Minimalist Courtyard House"], artsy: ["Collector's Studio House"], "modern farmhouse": ["Farmhouse on the Ridge", "White Barn Residence"],
  colonial: ["Center-Hall Colonial", "Georgian Brick Colonial"], victorian: ["Queen Anne Victorian"], industrial: ["Converted Mill Condo"], craftsman: ["Arts & Crafts Bungalow"],
  contemporary: ["Glass Pavilion House", "Contemporary Townhouse"], scandinavian: ["Nordic Saltbox"],
};
const near = ["Downtown Princeton", "Western Section", "Witherspoon-Jackson", "Riverside", "Littlebrook", "Jugtown"];
const far = ["Princeton Junction", "West Windsor", "Lawrenceville", "Kingston", "Rocky Hill", "Plainsboro", "Hopewell", "Pennington", "Montgomery"];
const styles = Object.keys(STYLE_TAGS);

for (let i = 0; i < 20; i++) {
  const style = styles[i % styles.length];
  const neighborhood = i % 3 === 0 ? pick(far) : pick(near);
  const beds = pick([0, 1, 1, 2, 2, 2, 3, 3, 4]);
  const base = neighborhood && far.includes(neighborhood) ? 1500 : 1900;
  const price = Math.round((base + beds * 520 + between(-150, 650)) / 25) * 25;
  add({ title: pick(RENT_TITLES[style]), kind: "rent", propertyType: beds === 0 ? "studio" : pick(["apartment", "apartment", "townhouse", "house"]), price, beds, baths: Math.max(1, Math.ceil(beds / 2)), sqft: 450 + beds * 330 + Math.floor(between(0, 200)), neighborhood, style,
    description: `A ${style} ${beds === 0 ? "studio" : beds + "-bedroom"} in ${neighborhood} with ${STYLE_TAGS[style].materials.join(", ")} details.` });
}
for (let i = 0; i < 12; i++) {
  const style = styles[(i * 3) % styles.length];
  const neighborhood = i % 2 ? pick(far) : pick(near);
  const beds = pick([2, 3, 3, 4, 4, 5]);
  const price = Math.round((far.includes(neighborhood) ? 420000 : 690000) + beds * 165000 + between(-60000, 240000), -3);
  add({ title: pick(BUY_TITLES[style]), kind: "buy", propertyType: pick(["house", "house", "townhouse", "condo"]), price: Math.round(price / 1000) * 1000, beds, baths: beds - 1 + (rnd() > 0.5 ? 0.5 : 0), sqft: 1100 + beds * 520 + Math.floor(between(0, 600)), neighborhood, style,
    description: `For sale: a ${style} home in ${neighborhood}. ${STYLE_TAGS[style].materials.join(", ")} throughout.` });
}
for (const [t, h, p, ac] of [["Kingston Canal Lot", "Kingston", 245000, 1.2], ["Montgomery Orchard Land", "Montgomery", 620000, 9], ["Rocky Hill Ridge Lot", "Rocky Hill", 199000, 0.8]])
  add({ title: t, kind: "land", propertyType: "land", price: p, sqft: Math.round(ac * 43560), neighborhood: h, style: "land", ambience: ["open", "quiet"], light: 1, description: `${ac} acres of buildable land in ${h}.` });
for (const [t, h, p, s] of [["Palmer Square Guest Flat", "Downtown Princeton", 219, "scandinavian"], ["Lake Carnegie Cottage Stay", "Riverside", 245, "craftsman"], ["Junction Station Suites", "Princeton Junction", 159, "contemporary"]])
  add({ title: t, kind: "stay", propertyType: "suite", price: p, beds: 1, baths: 1, sqft: 480, neighborhood: h, style: s, available: "Now", description: `Short stay in ${h} — ideal while you house-hunt.` });
add({ title: "Route 1 Office Suite", kind: "commercial", propertyType: "office", price: 4200, sqft: 1400, neighborhood: "West Windsor", street: "Village Rd E", style: "contemporary", pets: false, description: "Flexible office suite near Route 1 and the train." });

writeFileSync(new URL("../data/listings.json", import.meta.url), JSON.stringify(listings, null, 1));
console.log(`Wrote ${listings.length} listings`);
