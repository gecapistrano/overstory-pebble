/**
 * Pre-demo AI check:  npm run ai:check            (quota check only)
 *                     npm run ai:check -- --warm  (also warms the cache through the running app)
 *
 * 1. Pings every model in the chain (GEMINI_MODEL + GEMINI_FALLBACK_MODELS) with one tiny request and
 *    reports which are ready and which are out of quota (and when they reset). Free-tier quotas are
 *    per model, so the app keeps working as long as at least one is ready.
 * 2. --warm: sends the scripted demo requests (the "Try an example" sentence, the voiceover lines and
 *    the "a bit cheaper, more artsy" refinement) to the running app, exactly as the browser does, so
 *    their answers are cached in .cache/gemini and replay instantly with no quota during the demo.
 *    BASE=http://localhost:3001 to point at the dev server (default http://localhost:3000).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); // later lines win, like Next.js
}
const KEY = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY is not set in .env.local"); process.exit(1); }
const API = "https://generativelanguage.googleapis.com/v1beta";
const primary = process.env.GEMINI_MODEL || env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || env.GEMINI_FALLBACK_MODELS || "gemini-3.1-flash-lite,gemini-3.1-flash-lite-preview,gemini-3-flash-preview,gemini-3.5-flash,gemini-3.6-flash").split(",").map((s) => s.trim()).filter(Boolean);
const chain = [primary, ...fallbacks.filter((m) => m !== primary)];

console.log("Gemini models (in the order the app tries them):");
let ready = 0;
for (const m of chain) {
  const t = Date.now();
  let line;
  try {
    const r = await fetch(`${API}/models/${m}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with: ok" }] }] }), signal: AbortSignal.timeout(20000),
    });
    const body = await r.text();
    if (r.ok) { ready++; line = `  READY      ${m}  (${Date.now() - t} ms)`; }
    else if (r.status === 429) {
      const daily = body.match(/PerDay[^"]*"[^}]*?"quotaValue":\s*"(\d+)"/)?.[1] || body.match(/"quotaValue":\s*"(\d+)"/)?.[1];
      const wait = Number(body.match(/"retryDelay":\s*"(\d+)/)?.[1]);
      line = `  NO QUOTA   ${m}  (${/PerDay/.test(body) ? `daily limit ${daily ?? "?"} used up` : "rate limited"}${wait ? `, resets in ~${Math.ceil(wait / 60)} min` : ""})`;
    } else line = `  ERROR ${r.status}  ${m}  ${body.slice(0, 120).replace(/\s+/g, " ")}`;
  } catch (e) { line = `  TIMEOUT    ${m}  (${e.name})`; }
  console.log(line);
}
console.log(ready ? `\n${ready} of ${chain.length} models ready.` : "\nNo model has quota right now: AI features will use their offline fallbacks.");

if (process.argv.includes("--warm")) {
  const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
  const post = async (route, body) => {
    const t = Date.now();
    const r = await fetch(`${BASE}/api/ai/${route}/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    console.log(`  ${r.ok ? "ok  " : "FAIL"} ${route.padEnd(6)} ${String(Date.now() - t).padStart(5)} ms  ${String(body.text || "").slice(0, 70)}`);
    return r.ok ? j : null;
  };
  // the same requests the client sends: process(text) -> aiParse(text, prev, []) and prev = the last criteria
  const crit = (ai) => ({ ...ai.criteria, vibes: ai.criteria.vibes || [], neighborhoods: ai.criteria.neighborhoods || [] });
  const conversations = [
    ["I'm starting a job in downtown Houston in January, looking for a bright 1-bedroom in the Heights under $1,600, close to downtown, I have a dog", "a bit cheaper, more artsy"],
    ["I'm starting a job downtown. Two bedrooms, under two thousand a month, I have a dog, and I want lots of light, maybe near the Heights.", "a bit cheaper, more artsy"],
  ];
  console.log(`\nWarming the demo cache through ${BASE} …`);
  for (const turns of conversations) {
    let prev = { vibes: [], neighborhoods: [] };
    for (const text of turns) {
      const ai = await post("parse", { text, prev, imageTags: [] });
      if (!ai?.criteria) break;
      prev = crit(ai);
    }
  }
  console.log("Done. Run it again: every line should now answer in a few ms (served from .cache/gemini).");
}
