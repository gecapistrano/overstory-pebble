# Pebble

**Describe the house. Find your home.**

Pebble is your brokerage's AI concierge: it **listens to your clients, then briefs your agents.** Clients describe the house they want in their own words and language; licensed agents verify, call, and close. Our promise on every screen: **AI suggests, a human verifies.**

Built for HackPrinceton 2026, Business & Enterprise track.

**Live demo:** https://overstory-pebble.vercel.app

---

## The problem

Picture it from both sides. **The person searching** moves to a new city, scrolls through hundreds of listings, and still isn't sure which house is the one. **The agent on the other side** watches that client hesitate, stop replying, and drift away. That's not bad luck. That's revenue walking out the door.

Three numbers:

| | Finding | Source |
| --- | --- | --- |
| **56%** | of buyers say the hardest part of buying a home is simply finding the right property | National Association of Realtors, 2025 Profile of Home Buyers and Sellers |
| **~7× vs 42 hours** | firms that reply within an hour are nearly 7 times more likely to qualify a lead, yet the average reply took 42 hours | Harvard Business Review, "The Short Life of Online Sales Leads" (2011) |
| **1 in 5** | people in the US speaks a language other than English at home. Most property tools act like they don't exist | US Census Bureau, American Community Survey 2018–2022 |

## The solution: one journey

**Listen → understand → verify → close.**

1. **Listen.** A client taps once and just talks, rambling is fine. Pebble keeps listening, then answers in **one spoken sentence with three houses**. For the 1 in 5 who speak another language at home, Pebble notices, **asks in English and in their language** before switching, and the agent still reads English.
2. **Understand.** Pebble pulls out budget, bedrooms, timing, pets, and the *feeling*. **Vibe search** reads every listing photo for style, materials, colors and light, so "more artsy, with lots of light" just works. Say "cheaper" or "closer" and it **refines within the conversation** instead of starting over.
3. **Verify.** The client taps **Interested!** A licensed agent gets the lead instantly with an **AI recap** (needs, budget, timeline, must-haves) and checks availability, price, fit, and **fair housing** before anything is confirmed. AI suggests, a human verifies.
4. **Close.** If either side goes quiet, Pebble's **follow-up agent** investigates the deal and drafts a check-in; the agent sends it with one tap, all the way to the signed papers. That's the moment **a house becomes a home.**

Wording rule used across the product: it's a **house** while the client is searching, and a **home** only once they've bought it or signed for it.

### Three surfaces

| Surface | Who uses it | What it does |
| --- | --- | --- |
| Client app (mobile) | Home seekers | One-tap voice, typed or photo search, three houses with a reason each, map, 3D tour, Interested!, deal status |
| Agent app (mobile) | Licensed agents | New-lead alerts, AI recap, AI-suggested houses, verification checklist, AI-drafted messages, follow-up agent, pipeline (cancelled deals archived), listing upload with automatic photo tagging |
| Brokerage dashboard (web) | Owners and managers | Revenue, deals closed, response time, qualified vs verified leads, deals rescued by follow-ups, AI forecast, funnel, top agents, AI strategy ideas a manager approves |

## Who it's for

**The brokerage is our customer.** It pays per agent seat, planned at **$49 per agent per month**.

- **Agents** get pre-qualified leads with a recap, instant replies to clients around the clock and in their language, and follow-ups that rescue stalled deals.
- **Owners** get one dashboard: revenue, response time, a forecast, and strategy ideas they approve or dismiss.
- **It pays for itself:** one extra closed deal covers a seat for years. A typical rental fee is about one month's rent, versus $588 a year per seat.
- **The brokerage owns it:** the clients, the data and the relationship stay with the brokerage, not a lead marketplace.

## Where we start

The working prototype focuses on **Houston and Los Angeles**, starting with the listing data we have today. The engine reads listings through adapters, so any market's feed plugs in the same way: from these two cities, to the rest of the US, to **global**.

## Respecting client data

Trust is part of the product, not an add-on.

- Pebble never asks about or uses race, religion, national origin, sex, disability or familial status (fair housing), and the AI prompts say so explicitly.
- A client's request reaches an agent only after the client taps **Interested!**
- The AI key and AI calls stay on the server; the browser never sees the key.
- In progress for the next build: **sign-in for clients, agents and managers**, and a **plain-language consent screen** before the first use of the microphone, photos or location, with a separate switch for each purpose. Voice recordings won't be kept by default, only the text, and clients will be able to download or delete their data. Built with California's CCPA/CPRA and Texas's Data Privacy and Security Act in mind.

## AI: Gemini API

Pebble's AI runs on the **Gemini API** (default model `gemini-3.8-flash`).

| Step | What Gemini does | Route |
| --- | --- | --- |
| Listen | Understands the request in any language, merges refinements, detects the language and writes the bilingual "switch language?" question | `/api/ai/parse` |
| Understand | Re-ranks the shortlist by fit and vibe, writes a "why it fits" line per house and the one-sentence spoken reply in English and the client's language | `/api/ai/parse` |
| Understand | Vibe model: tags listing photos and client photos (style, materials, colors, light) | `/api/ai/vibe` |
| Listen | Translates the whole interface into languages without a built-in dictionary | `/api/ai/translate` |
| Verify | Writes the agent's AI recap from the client's own words | `/api/ai/recap` |
| Verify | Drafts the agent's first message, with a translation for the client | `/api/ai/draft` |
| Close | **Follow-up agent** (Gemini function calling): reads the deal history, re-checks the listing, looks for similar houses, then submits a draft that the agent reviews and sends | `/api/ai/followup` |
| Dashboard | Strategy ideas from the month's numbers, approved or dismissed by a manager | `/api/ai/strategy` |

Every AI step has an on-device fallback, so a live demo keeps working if the network drops.

## CoStar data

Listings and market numbers come from the CoStar data kit (Houston + Los Angeles). The demo focuses on **Greater Heights, Houston**; commute times are to Downtown Houston (Downtown LA for LA).

```bash
# COSTAR_DUMP_PATH in .env.local points at the kit (…/costar-hackathon-kit)
npm run costar   # rebuilds data/listings.json + data/market.json (~5 s)
```

- `scripts/ingest-costar.mjs` joins residential listings + listing features, apartment listings + commercial property records, and `commercial-properties.csv` (Matterport model ids). Vibe tags (style, materials, light) are derived from CoStar remarks, feature lines and photo alt text.
- `data/market.json` layers: active/sold/leased residential stats per city and neighborhood, apartment asking rents by bedroom and availability, commercial sale comps (24 months), and the largest employers near downtown (tenancies + company records).
- `lib/market.ts` scores listings into opportunities (below-median $/sq ft or rent, price cuts, days on market, open units, fit with open leads); Gemini picks and explains them on the dashboard, with an on-device fallback.
- 3D tours embed each listing's Matterport scan (`components/MatterportTour.tsx`); photos use the Matterport scan thumbnail first, then CoStar photos.
- Texas does not disclose sale prices, so Houston "sold" stats use the last asking price.

## Demo-proof AI (Gemini quotas)

Free-tier Gemini keys have small daily limits per model (e.g. 500 requests/day for `gemini-3.5-flash-lite`, 20 for `gemini-3.8-flash`). `lib/gemini.ts` keeps the app working when one runs out:

- **Fallback chain**: `GEMINI_MODEL`, then `GEMINI_FALLBACK_MODELS`. Each model has its own quota.
- **Quota memory**: a model that answers 429 is skipped until its quota resets, so requests go straight to one that works.
- **Response cache**: identical requests are answered from `.cache/gemini` (instant, no quota).
- **Follow-up agent**: picks a working model on its first step and stays on it.
- `GET /api/ai/status` shows which models are ready right now.

Before a demo (with the app running):

```bash
BASE=http://localhost:3001 npm run ai:check -- --warm   # quota per model + pre-caches the scripted demo lines
```

Then rehearse the demo once: every AI answer it produces is cached and replays instantly on stage. Run only one dev server (several servers reloading pages burn quota fast).

## Maps: 2D / 3D, terrain and exterior 3D

- **Layers**: every map has a **Map / Aerial / Terrain** switch. Terrain is OpenTopoMap shaded relief + contours in 2D; in 3D it is real relief from AWS Terrain Tiles (exaggerated ×4 so Houston's gentle bayou relief reads at street scale).
- **2D / 3D** (agent full-screen map): 3D is MapLibre GL over OpenFreeMap's vector style with OpenStreetMap buildings extruded to height (`components/MapView3D.tsx`).
- **Exterior 3D**: 232 Matterport models have a drone-trained Gaussian splat of the outside. `npm run exteriors` joins `models_index.csv` to the listings and writes `data/exteriors.json` (53 listings today). `/api/exterior/{sid}` streams the first ~96 MB of the 200–550 MB `splat.ply` (Gaussians are stored in random order, so that is a fair sample), keeps what is within 32 m of the house, packs it into the 32-byte `.splat` layout (~4–5 MB) and caches it in `.cache/exterior/`. `components/ExteriorView.tsx` renders it with `@mkkellogg/gaussian-splats-3d`.
- **CoStar facts** on the agent's map card: days on market, price per sqft, change vs. original list price, HOA, units open and vacancy.

## Vexcel aerial imagery

The key stays on the server; every call goes through `/api/vexcel/*` (`lib/vexcel.ts`) and is cached on disk in `.cache/vexcel/`.

- **Aerial map layer**: every map has a Map / Aerial switch. Tiles come from Vexcel `ortho/extract` via `/api/vexcel/tile/{z}/{x}/{y}` (zoom 11+, Houston and LA). The dashboard map opens in aerial.
- **Per-listing aerial view** (`components/AerialView.tsx`): a bird's-eye oblique and a top-down ortho with the parcel outlined in gold. Shown on the client listing page, the agent's lead screen (remote check before verifying) and the dashboard.
- **Property attributes from Vexcel's imagery AI**: footprint, roof material/shape, roof discoloration, pool, tree cover, capture date. Gemini receives them with the dashboard suggestions, so it can say things like "use the 63% roof discoloration in negotiation".
- Warm the cache before a demo (with the app running): `BASE=http://localhost:3000 npm run vexcel:warm` (about 580 requests, around 1 minute).

## Run it

```bash
npm install
cp .env.example .env.local   # paste your key after GEMINI_API_KEY=
npm run dev                  # http://localhost:3000
```

The home page shows whether Gemini is connected. To deploy, use any Node host that runs Next.js (for example Vercel) and set `GEMINI_API_KEY` in its environment variables. Voice uses the Web Speech API, which works best in Chrome; without it, type instead or tap "Try an example".

Pages:

- `/` home
- `/app` client app · `/agent` agent app · `/dashboard` brokerage dashboard
- `/demo` all three live side by side: a request spoken in the client app reaches the agent and the dashboard in real time
- `/gallery` the listing catalog with the vibe tags search uses

## Current build status

| Area | Status |
| --- | --- |
| Gemini AI across client, agent and dashboard | Built; tested end to end against a local stand-in for the API. First run with a live key still to do. |
| Listings | **Live CoStar data**: 460 Houston + LA listings (Homes.com MLS for sale/rent + Apartments.com communities), each with a Matterport 3D tour (`lib/adapters/costar.ts`) |
| Market intelligence | **Live CoStar data** layered from residential listings & sales, apartment rents/availability, commercial sale comps and tenant employers (`data/market.json`); Gemini writes the dashboard recap and suggestions (`/api/ai/market`) |
| Sign-in and consent screen | Next build (see "Respecting client data") |
| Dashboard revenue, pipeline, agents | Demo data (mock sales records) |

## Architecture

```
voice / text / photo
   │  lib/speech.ts (Web Speech API, continuous)      lib/i18n.ts (language: detect, ask, translate)
   ▼
lib/ai.ts ──── Gemini (/api/ai) ─┐
lib/parse.ts ── rules (fallback) ┴─► Criteria { intent, beds, budget, commute, pets, vibes, move-in }
   ▼
lib/search.ts  hard filters + vibe scoring ◄── listings from lib/adapters/*
   ▼                                              mock.ts         (sample listings, data/listings.json)
3 houses + one-sentence reply                     reso.ts         (MLS / RESO Web API)
   ▼                                              brokerageApi.ts (brokerage or data-partner feed)
"Interested!" → lead + AI recap                   agentUploads.ts (agent uploads, auto-tagged)
   ▼                                              lib/vibe.ts     analyzePhotos(images) -> tags
lib/store.ts  shared lead records (browser storage in the demo; brokerage CRM / backend in production)
   ▼                    ▼                          ▼
agent app          client status              dashboard
```

Stack: Next.js 15 + TypeScript + Tailwind, Gemini API (server routes), Web Speech API, Leaflet + OpenStreetMap, three.js for the 3D tour, Recharts.

## Roadmap

- Live Houston and LA listings, then more US markets and international
- Sign-in, consent controls, and a "My data" page (download / delete)
- Home sales, land and short stays as first-class flows (the engine already handles them)
- Long-term preference memory across sessions, with the client's consent
- More languages; agent messages delivered in the client's language
- Scheduling, e-signature hand-off, and commission tracking in the dashboard
