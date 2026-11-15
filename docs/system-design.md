# Pebble — System Design

> **Describe the house. Find your home.**
> Pebble is a brokerage's AI concierge: it listens to clients, then briefs agents.
> Core promise, enforced in code: **AI suggests, a human verifies.**

This document is the source of truth for the backbone: tech stack, architecture, data model, AI pipeline, APIs, security, and privacy. The frontend will change; the contracts below should not.

> **Build notes for Cursor (read first)**
> 1. **An existing listing database is already working.** It belongs to our listing data partner and is reached through the partner's API. It is the **source of truth for listings** (houses, prices, photos, locations, status). Do **not** redesign it, replace it, or bulk-copy it into a new listings database. Find the existing API client/config in the repo, keep it working, and build Pebble on top of it through one adapter (`server/listings/partner.ts`).
> 2. **The map and every listing screen read from that database** (via our server, never directly from the mobile app or the browser). Before building new features, add a health check (`GET /api/listings/health`) and confirm the map loads real Houston and Los Angeles listings from it.
> 3. Pebble's own database stores only **Pebble data**: users, consents, search sessions, leads, messages, verifications, nudges, strategies, metrics, AI runs, and **listing enrichment** (vibe tags + embeddings) keyed by the partner's listing ID.
> 4. Partner credentials stay server-side (`LISTINGS_PARTNER_*` env vars). Never name the partner company in code, comments, UI, logs or commits.
> 5. Gemini API for all AI; every AI step needs a fallback. Build the backbone (data, APIs, AI pipeline, auth, consent) before polishing UI.
> 6. **Platforms:** the client and agent experiences ship as a native **iOS and Android app** (Expo / React Native, one app, role-based after sign-in). The brokerage dashboard is a **web app** (Next.js), which also hosts the API. Mobile and web share types, schemas and the API client from `packages/shared`.

---

## 0. Ground rules (apply to code, UI copy, prompts and docs)

| Rule | What it means in practice |
| --- | --- |
| Name | The product is **Pebble**. Don't use earlier working names. |
| House vs. home | It's a **house** while the client is searching. It becomes a **home** only after the deal closes (bought or lease signed). UI strings, AI prompts and notifications follow this. |
| Human verification | No listing is shown to a client as "verified", no message is sent to a client, and no strategy is applied unless a human approved it. The AI only drafts. |
| Fair housing | Never ask for, store, infer or filter on protected characteristics (race, color, religion, sex, national origin, familial status, disability, plus state/local classes such as California's). Enforced in prompts AND in a server-side filter. |
| Data partner | Listings come from an **existing, working database** owned by a **listing data partner**, accessed through the partner's API. It is the source of truth for listings; Pebble integrates with it and never replaces it. The partner's name is confidential: never name it in UI, code identifiers, comments, logs, commits or docs. Use `partner` / `LISTINGS_PARTNER_*`. |
| Markets | Launch markets: **Houston, TX** and **Los Angeles, CA**. Everything market-specific is data, not code, so new markets (US, then global) are configuration. |
| AI provider | **Gemini API** for all AI. Every AI step has a deterministic fallback so the product degrades instead of breaking. |
| Privacy | Consent before collection, least data necessary, client can download or delete their data. |

---

## 1. Users and roles

| Role | Surface | Can do |
| --- | --- | --- |
| `client` | Pebble mobile app, client mode (iOS + Android) | Search by voice, text or photo; see 3 houses; tour; tap **Interested!**; book tours; apply; message their agent; manage consent and data |
| `agent` | Pebble mobile app, agent mode (iOS + Android) | Receive leads, read AI recap, verify, contact client, manage pipeline, approve AI follow-ups, edit/upload listings |
| `manager` | Brokerage dashboard (desktop web) | See KPIs, forecast, funnel, agents; approve/dismiss AI strategy ideas; manage agents and seats |
| `brokerage_admin` | Dashboard settings | Billing (seats), markets, data-partner connection, retention settings |
| `pebble_admin` | Internal | Support, feature flags; no access to client PII without a support grant (audited) |

Multi-tenant: every row that belongs to a brokerage carries `brokerage_id`. A client may talk to more than one brokerage; client data is shared with a brokerage only after the client taps **Interested!** on that brokerage's listing.

---

## 2. Tech stack

| Layer | Choice (default) | Why / notes |
| --- | --- | --- |
| Repo | **Monorepo** (pnpm workspaces + Turborepo): `apps/mobile`, `apps/web`, `packages/shared` | One place for types, Zod schemas, API client and i18n strings used by both apps. |
| Mobile app (iOS + Android) | **Expo (React Native) + TypeScript + Expo Router** | One app for clients and agents; the signed-in role picks the experience (client tabs vs. agent tabs). Built and shipped with EAS (see deploy.md). Can be split into two store apps later without changing the API. |
| Web app (dashboard + API) | **Next.js 15 (App Router) + TypeScript** | Brokerage dashboard (desktop web) and all API route handlers (`apps/web/app/api/*`, `apps/web/server/*`). A web version of the client flow is optional (demo/QA only). |
| Styling | NativeWind (mobile, Tailwind syntax) · Tailwind CSS (web) | Shared design tokens in `packages/shared/theme`. Frontend may change; no business logic in components. |
| Listing data | **Existing partner database via the partner's API** (already working) | Source of truth for listings, photos, prices, locations and status. Accessed only through `server/listings/partner.ts` with server-side credentials, response caching and rate limiting. |
| Pebble database | **PostgreSQL 16** with **PostGIS** (geo) and **pgvector** (vibe embeddings) | Pebble's own data + listing enrichment keyed by partner listing ID. Hosted on Supabase (see deploy.md). |
| ORM / migrations | Drizzle ORM + drizzle-kit migrations | Typed schema, SQL-first. (Prisma is fine if preferred; pick one.) |
| Auth | **Supabase Auth** (email magic link, phone OTP, Google) | Roles stored in `users.role`; Row-Level Security (RLS) by `brokerage_id` and ownership. |
| File storage | Supabase Storage (S3-compatible) | Listing photos, uploaded client photos (temporary), exports. Signed URLs only. |
| Realtime | Supabase Realtime (Postgres changes) via `supabase-js` (works in React Native and web) | New lead → agent app; lead status → client app; events → dashboard live feed. |
| Background jobs | **Inngest** (event-driven + cron) | Ingestion, photo tagging, embeddings, follow-up agent sweeps, metrics rollups, data-deletion jobs. Retries + idempotency built in. |
| AI | **Gemini API** via server-only client (`server/ai/gemini.ts`) | Default `GEMINI_MODEL=gemini-3.8-flash`, fast path `GEMINI_FAST_MODEL` (e.g. a Flash-Lite model), embeddings via `GEMINI_EMBED_MODEL`. Never call Gemini from the mobile app or the browser. |
| Voice in (mobile) | **Native speech recognition** via `expo-speech-recognition` (Apple Speech on iOS, Android SpeechRecognizer): continuous mode + interim results, language set per client | Requires a development build (not Expo Go). Later: Gemini Live / Gemini transcription models for accents and mixed languages. Audio is never stored. |
| Voice out (mobile) | `expo-speech` (on-device text-to-speech) | Later: Gemini TTS voices. |
| Camera / photos / location | `expo-image-picker`, `expo-location` | Each asked only after the matching consent switch (§7). |
| Maps (mobile) | `react-native-maps` (Apple Maps on iOS, Google Maps on Android) | **Pins, prices and listing details come from the partner database** via `GET /api/listings/map?bbox=…`. Needs a Google Maps API key for Android. |
| Maps (web dashboard) | Leaflet + OpenStreetMap tiles | Same API. Swap to a commercial tile provider for production traffic. |
| 3D tour | three.js scene in an in-app WebView (`react-native-webview`), or `@react-three/fiber/native` + `expo-gl` | Accepts a real 3D scan / glTF URL per listing when available. |
| Charts | Recharts | Dashboard only. |
| Push notifications | **Expo Notifications** (APNs on iOS, FCM on Android) via the Expo push service | New lead → agent; verified / tour / messages → client. Device tokens stored in `push_tokens`. |
| Other notifications | Email (Resend), SMS (Twilio) | SMS only with explicit opt-in (TCPA). |
| Secure storage | `expo-secure-store` | Auth session tokens on device. Never store API keys in the app. |
| Validation | Zod | Every API input and every AI JSON output is schema-validated. |
| Observability | Sentry (errors) + structured logs + `ai_runs` table | AI calls logged without raw PII (see §8). |
| Testing | Vitest (unit), Playwright (web e2e), Maestro (mobile e2e flows), a **Gemini mock server** for CI | CI never calls the real API. |

---

## 3. Architecture

```
  Pebble mobile app (Expo, iOS + Android)
   client mode ─┐  HTTPS + Bearer JWT; push via Expo (APNs/FCM); realtime via supabase-js
   agent mode  ─┤
                ▼       ┌──────────────────── apps/web: Next.js (Vercel) ──────────────────────┐
 Dashboard (web) ──►   │  UI routes: /dashboard  /login  /privacy  (+ optional /demo)          │
                        │  API: app/api/* (route handlers, Zod-validated, auth-checked)         │
                        │  server/ai/*   Gemini client, prompts, schemas, agent tools          │
                        │  server/search/*  filters + geo + vector + rerank                    │
                        │  server/domain/*  leads, verification, deals, consent (state machines)│
                        └───────────────┬───────────────────────┬──────────────────────────────┘
                                        │                       │ events
                         ┌──────────────▼─────────┐   ┌─────────▼──────────┐
                         │ Supabase               │   │ Inngest            │
                         │ Postgres+PostGIS+pgvec │◄──┤ jobs + crons       │──► Gemini API
                         │ Auth · Storage · RT    │   │ (ingest, tag, embed│
                         └──────────────▲─────────┘   │  follow-ups, rollup│
                                        │             │  deletion)         │
                                        │                       │ enrichment sync (changed listings → tag + embed)
                         ┌──────────────────────────────────────────▼───────┐
   map, search, detail ─►│ EXISTING listing database (partner API) ── source│
   via server/listings/  │ of truth for listings; already working; read-only│
   partner.ts + cache    │ for Pebble (confidential provider)               │
                         └──────────────────────────────────────────────────┘
```

### Module layout (backbone)

```
/apps/mobile              Expo app (iOS + Android): app/(auth), app/(client)/*, app/(agent)/*, components/, hooks/
                          UI only; talks to the API through packages/shared/api; no secrets in the app
/apps/web                 Next.js: dashboard UI + API
  /app                    UI routes (replaceable) + /app/api/* route handlers
  /server
  /ai        gemini.ts (REST client), prompts/*.ts, schemas/*.ts (Zod), agents/followup.ts, guardrails.ts
  /search    criteria.ts, query.ts (SQL+PostGIS+pgvector), rerank.ts
  /domain    leads.ts (state machine), verification.ts, deals.ts, consent.ts, messaging.ts, metrics.ts
  /listings  partner.ts (adapter to the EXISTING partner API: search, bbox/map, detail, photos, changes),
             cache.ts, normalize.ts (partner record → Listing), uploads.ts (agent-uploaded listings), health.ts
  /privacy   export.ts, delete.ts, redact.ts
  /auth      session.ts, roles.ts
  /db        schema.ts, migrations/, seed/
  /jobs      inngest functions
/packages/shared          types (Listing, Criteria, Lead, ...), Zod schemas, typed API client, i18n strings, theme tokens
```

Paths elsewhere in this doc like `server/...` mean `apps/web/server/...`.

---

## 4. How it works (one journey)

### 4.1 Listen
1. Client opens the Pebble app on iOS or Android, signs in (or continues as guest with a device session) and accepts the consent screen (§7) before the mic, photo or location is used. The OS permission prompt appears only after the matching consent switch is on.
2. One tap starts **continuous listening**. Interim transcript streams to the screen. The turn ends after ~2 s of silence or a tap.
3. Client can also type, or attach a photo of a house they like.
4. Language is detected per turn. If it differs from the UI language, Pebble asks **in English and in the detected language** whether to switch. It switches only on "Yes". Choice is saved on the client profile.

### 4.2 Understand
`POST /api/search/turn` runs:
1. **Parse** (Gemini, JSON schema): message (any language) + previous criteria → `{language, englishText, criteria}`. Refinements ("cheaper", "closer", "more artsy") modify the previous criteria; nothing restarts.
2. **Guardrail**: strip any criteria touching protected characteristics; log a `guardrail_event`.
3. **Photo** (if any): Gemini vision → vibe tags → added as soft criteria. Client photo is deleted after tagging (not stored).
4. **Retrieve**: query the **partner database** (through `server/listings/partner.ts`) with the hard filters it supports (market/area or bounding box around the client's **anchor place**, intent, price, beds, baths, pets, status) → up to ~60 candidates. Then join Pebble's `listing_enrichment` by partner listing ID and score with pgvector similarity between the request's vibe embedding and each listing's vibe embedding, plus commute distance (PostGIS). Keep the top ~20. Any filter the partner API can't do is applied server-side after the fetch.
5. **Rerank** (Gemini): pick the best 3, write a short "why it fits" per house, and one spoken sentence (English + client language) that recaps what was heard.
6. Response: 3 houses + reply. The conversation and criteria are stored on the `search_session`.

"Memory" in MVP = within the conversation (session criteria). Long-term preference memory is a roadmap item and requires its own consent purpose.

### 4.3 Verify
1. Client taps **Interested!** on a house → creates a `lead` (status `new`) with the transcript, criteria, the 3 suggestions and the chosen listing. This is the moment client data is shared with that brokerage (consent purpose `share_with_agent`).
2. Routing picks an agent (listing agent → market round-robin → manager fallback) and notifies them (realtime + push).
3. Gemini writes the **AI recap** (English, for the agent): summary, budget, timeline, must-haves, nice-to-haves.
4. Agent completes the **verification checklist**: listing still available · price current · fits client needs · legal/zoning/fair-housing OK. All four required before `verify`.
5. On verify, Gemini drafts the first message (English + client language). Agent edits and sends, or calls. Client status shows "Verified by {agent name}".

### 4.4 Close
1. Client books a tour → `touring` → submits application/offer → `application` → agent marks `closed`.
2. **Follow-up agent** (Inngest cron, hourly): finds deals where the client or the agent has been quiet beyond thresholds. For each, runs a Gemini function-calling loop (§5.3) that investigates and produces a draft + reason. Agent sees it under Follow-ups and taps **Send** (or edits / skips / marks cancelled). Nothing is auto-sent.
3. Agent-side inactivity (lead waiting too long for a first reply) creates an internal nudge to the agent and, after a threshold, to the manager.
4. `cancelled` deals are archived and hidden from active views (still counted in analytics).
5. On `closed`, client UI switches from "house" to "home" ("Welcome home").

### 4.5 Brokerage view
Dashboard reads rollups: revenue, deals closed, average first-response time, qualified vs. verified leads, deals rescued by follow-ups, funnel, top agents, live activity feed, revenue forecast (statistical model), and **AI strategy ideas** (Gemini, from the metrics) that a manager approves or dismisses.

---

## 5. AI pipeline (Gemini)

All calls go through `server/ai/gemini.ts`:

- REST `POST {GEMINI_BASE_URL}/models/{model}:generateContent`, header `x-goog-api-key`.
- `generationConfig.responseMimeType = "application/json"` for structured steps; every response is validated with Zod; one automatic retry with the validation error appended; then fallback.
- Do **not** send `temperature` / `top_p` / `top_k` (deprecated on current models).
- A request must **end with a user turn** (function responses are sent as a user turn).
- Keep the model's returned `content.parts` intact (including any `thoughtSignature`) when continuing a function-calling conversation.
- Timeouts: 8 s for parse/rerank, 20 s for vision, 45 s for the follow-up agent.
- `GEMINI_BASE_URL` is overridable so CI and offline demos use the mock server.

### 5.1 Steps

| Step | Trigger | Model | Input | Output (schema) | Fallback |
| --- | --- | --- | --- | --- | --- |
| `parse` | each client turn | fast | text, prev criteria, image tags | `ParseResult {language, languageName, languageNative, englishText, criteria, switchQuestion?}` | rule-based parser |
| `rerank` | after retrieval | fast | criteria, englishText, ≤20 candidate briefs | `{picks:[{listingId, why, whyNative}], replyEnglish, replyNative}` | score-sorted top 3 + template reply |
| `vibe_tag` | enrichment sync (new/changed partner photos); agent uploads; client photo | default | ≤4 images | `VibeTags {style[], materials[], colors[], ambience[], light 0..1}` | on-device color/light heuristics |
| `embed` | after vibe_tag; each search turn | embed | vibe text | vector(768) | skip vector term |
| `translate_ui` | client says Yes to a language without a bundled dictionary | fast | EN string table | same keys translated | stay in English |
| `recap` | lead created | default | transcript, criteria, listing | `LeadRecap {summary, budget, timeline, mustHaves[], niceToHaves[]}` | template recap |
| `draft_contact` | agent opens "Contact client" | default | lead, listing, agent | `{english, native}` | template |
| `followup_agent` | cron / agent taps Investigate | default | lead id | `{draft, draftNative, reason, trace[]}` | rule-based nudge text |
| `strategy` | daily rollup; dashboard open | default | metrics JSON | `{strategies:[{title, why, impact}]}` (exactly 3) | static ideas |

### 5.2 Prompt rules (shared system preamble)
- Role: Pebble, working for a licensed agent at {brokerage}.
- Use only provided facts; never invent prices, availability or policies.
- Call it a "house" until closed.
- Never ask about or use protected characteristics; never steer by neighborhood demographics.
- Never pressure; one clear question at most in client-facing drafts; ≤45 words for messages.

### 5.3 Follow-up agent (function calling)
Tools (server-implemented, scoped to the agent's brokerage):

| Tool | Returns |
| --- | --- |
| `get_deal_history()` | stage, tour slot, hours since last client/agent message, last 5 messages, recap |
| `check_listing(listing_id)` | read live from the partner database: still available, current price, price changed vs. `leads.listing_snapshot`, available-from, pet policy |
| `find_similar_houses(listing_id, max_price?)` | ≤2 alternatives (same market, same filters) |
| `get_agent_calendar()` (later) | next free tour slots |
| `submit_draft(message_english, message_native, reason)` | terminal; stores a `nudge` with status `pending_approval` |

Loop: max 6 steps; every tool call is written to `ai_runs.trace`; the UI shows the steps ("Read the deal history ✓ · Re-checked the listing ✓ · Drafted the check-in ✓").

### 5.4 Guardrails (`server/ai/guardrails.ts`)
- Input: block protected-class criteria; redact emails/phones before logging.
- Output: Zod validation; profanity/PII check on drafts; reject drafts mentioning protected classes; length limits.
- Human gates: `verify`, `send message`, `send nudge`, `approve strategy` are user actions only — there is no code path where the AI performs them.

---

## 6. Data model (Postgres)

```
brokerages        id, name, markets text[], plan, seats, settings jsonb, created_at
users             id (auth uid), role, brokerage_id?, name, email, phone, locale, created_at
agents            user_id, brokerage_id, license_no, license_state, markets text[], active
clients           user_id?, device_id?, preferred_language, anchor_place geography?, created_at
consents          id, subject_id, purpose, granted bool, version, granted_at, revoked_at, ip_hash, ua
                  purposes: voice_processing | photo_processing | location | share_with_agent |
                            ai_translation | followup_messages | sms | long_term_memory (later)
markets           id, name ('Houston, TX'), center geography, timezone, currency, active
-- Listings themselves live in the EXISTING partner database (source of truth). Pebble stores only:
listing_refs      listing_key ('partner:<id>' | 'upload:<uuid>'), market_id, location geography(Point),
                  last_seen_at, partner_updated_at        -- thin pointer, refreshed by the enrichment sync
listing_enrichment listing_key, style text[], materials text[], colors text[], ambience text[], light real,
                  vibe_text text, embedding vector(768), photo_hash, model, tagged_at
uploaded_listings id, brokerage_id, agent_id, full listing fields, photos, status  -- agent uploads only
                  (merged with partner results at query time; partner data always wins on conflicts)
search_sessions   id, client_id, market_id, language, criteria jsonb, created_at, updated_at
search_turns      id, session_id, input_text, input_lang, english_text, image_tags jsonb, results jsonb,
                  reply_en, reply_native, ai_run_id, created_at
leads             id, brokerage_id, client_id, agent_id, listing_key, listing_snapshot jsonb (price/status at
                  the moment of Interested!, for "price changed?" checks), session_id, status, recap jsonb,
                  suggestions uuid[], language, deal_value_cents, rescued_by_followup bool,
                  last_client_activity_at, last_agent_activity_at, archived bool, created_at
lead_events       id, lead_id, at, actor ('client'|'agent'|'ai'|'system'), type, data jsonb
verifications     lead_id, available bool, price_current bool, fits_needs bool, legal_ok bool,
                  verified_by, verified_at, notes
messages          id, lead_id, sender ('client'|'agent'), body_original, lang_original, body_translated,
                  lang_translated, ai_drafted bool, approved_by?, sent_at, channel ('in_app'|'sms'|'email')
tours             id, lead_id, starts_at, status
nudges            id, lead_id, target ('client'|'agent'|'manager'), reason, draft_en, draft_native,
                  status ('pending_approval'|'sent'|'skipped'), ai_run_id, decided_by, decided_at
strategies        id, brokerage_id, period, title, why, impact, status ('proposed'|'approved'|'dismissed'),
                  decided_by, decided_at, ai_run_id
push_tokens       id, user_id, platform ('ios'|'android'), expo_token, device_id, created_at, revoked_at
metrics_daily     brokerage_id, day, revenue_cents, deals_closed, avg_first_response_sec, leads_new,
                  leads_verified, tours, applications, rescued_deals, ...
ai_runs           id, step, model, latency_ms, status, input_hash, output jsonb (no raw PII), trace jsonb,
                  tokens_in, tokens_out, created_at
audit_log         id, actor_id, action, entity, entity_id, at, data jsonb
data_requests     id, subject_id, type ('export'|'delete'), status, requested_at, completed_at
```

Indexes: `listing_refs` GIST on `location`; `listing_enrichment` HNSW on `embedding`; `listing_refs (market_id, last_seen_at)`; `leads (brokerage_id, status, archived)`; `lead_events (lead_id, at)`.

### Lead state machine (`server/domain/leads.ts`)

```
new ──verify (checklist complete)──► verified ──tour booked──► touring ──application/offer──► application ──close──► closed
 │                                     │                         │                              │
 └──────────────────────── cancel (any open state) ─────────────────────────────────────────────┴──► cancelled (archived, hidden)
```
Each transition writes a `lead_events` row and emits an Inngest event (`lead/status.changed`) for realtime fan-out and metrics.

---

## 7. Auth, consent and privacy

### 7.1 Sign-in
- `/login`: clients use email magic link, phone OTP or Google. Guests can search with a device session; signing in is required to tap **Interested!**.
- Agents and managers are invited by a brokerage admin (email invite → set up account). Agents must have a license number on file.
- Mobile: the same methods inside the app, plus **Sign in with Apple** on iOS (App Store rules require a privacy-focused sign-in option when Google sign-in is offered). Magic links and OAuth return to the app through a deep link (`pebble://auth/callback`) and universal/app links.
- After sign-in the app reads the role: `client` → client tabs, `agent` → agent tabs. Managers use the web dashboard (and can be agents too).
- Sessions: Supabase JWT (stored with `expo-secure-store` on mobile, httpOnly cookies on web); every API call sends `Authorization: Bearer <jwt>`; server checks role + `brokerage_id` on every call; RLS as a second line of defense.

### 7.2 Consent screen (before first use)
Plain language, one switch per purpose, nothing pre-ticked except what's strictly necessary:

| Purpose | Default | Shown when |
| --- | --- | --- |
| Voice processing (speech → text; audio not stored) | off until tapped | first mic tap |
| Photo processing (tag a photo, then delete it) | off | first photo attach |
| Location (commute times) | off | first map/commute use |
| AI translation | on when the client says Yes to switching language | language prompt |
| Share my request with a licensed agent | asked at **Interested!** | Interested! |
| Follow-up messages / SMS | off | after verification |
| Remember my preferences across visits (later) | off | settings |

Consents are versioned; a new version re-prompts. Revoking a purpose stops that processing immediately.

**OS permissions follow consent, never the other way round.** iOS usage strings (`NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`) and Android permissions (`RECORD_AUDIO`, `READ_MEDIA_IMAGES`, `ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS`) are requested only when the client turns on that purpose. The App Store privacy labels and Google Play Data safety form must match §7.3 exactly.

### 7.3 Data handling
- **Voice audio is never stored**; only the text transcript of the session.
- Client photos used for search are deleted right after tagging.
- PII columns (email, phone, message bodies) encrypted at rest (Postgres + pgcrypto or Supabase Vault for keys).
- Logs and `ai_runs` store hashes / redacted text, not raw PII.
- Retention (configurable per brokerage): search sessions 90 days after last activity if no lead; leads per brokerage record-keeping rules.
- **My data** page: download (JSON + CSV) and delete. Delete runs a job that removes or anonymizes client rows across tables within 30 days and records completion in `data_requests`.
- A brokerage only sees a client after **Interested!** on its listing; agents see only their assigned leads; managers see their brokerage only.

### 7.4 Compliance targets (launch markets)
- California: CCPA/CPRA (notice at collection, right to know/delete/correct, limit use of sensitive data, no selling/sharing for ads).
- Texas: Texas Data Privacy and Security Act (consent for sensitive data, rights to access/delete, privacy notice).
- Fair Housing Act + California and Texas fair-housing laws (no protected-class steering).
- TCPA for SMS (prior express consent, opt-out keyword).
- Have counsel review before launch; this design is built to make that review easy.

---

## 8. API surface (route handlers)

All routes: auth required unless noted (`Authorization: Bearer <jwt>` from the mobile app, session cookie from the web dashboard), Zod-validated, versioned under `/api` (add `/api/v2` rather than breaking shipped app versions), return `{ok, data}` or `{error}`. The typed client in `packages/shared/api` is the only way the apps call the API.

| Method & path | Role | Purpose |
| --- | --- | --- |
| `GET /api/ai/status` | public | Gemini configured? model name |
| `POST /api/consent` | client | record consent decisions |
| `POST /api/devices/push-token` | client/agent | register an Expo push token for this device |
| `GET/POST /api/me/data` | client | export / request deletion |
| `POST /api/search/turn` | client/guest | parse → guardrail → retrieve → rerank → reply |
| `POST /api/search/photo` | client/guest | vibe-tag an uploaded photo (deleted after) |
| `GET /api/listings/health` | admin | partner database reachable? latency |
| `GET /api/listings/map` | any | pins for a bounding box, from the partner database |
| `GET /api/listings/:id` | any | listing detail from the partner database + Pebble enrichment (tags, tour asset) |
| `POST /api/leads` | client | **Interested!** → create lead, route agent, AI recap |
| `GET /api/agent/leads` | agent | inbox + pipeline (excludes archived) |
| `POST /api/leads/:id/checklist` | agent | update verification checklist |
| `POST /api/leads/:id/verify` | agent | requires all 4 checks |
| `POST /api/leads/:id/draft` | agent | Gemini contact draft |
| `POST /api/leads/:id/messages` | agent/client | send (agent sends only after review) |
| `POST /api/leads/:id/status` | agent/client | tour, application, close, cancel |
| `GET /api/agent/nudges` | agent | pending follow-ups |
| `POST /api/nudges/:id/investigate` | agent | run follow-up agent now |
| `POST /api/nudges/:id/decide` | agent | send / edit+send / skip |
| `POST /api/listings` | agent | upload listing (photos → vibe tag job) |
| `GET /api/dashboard/metrics` | manager | KPIs, funnel, forecast, agents |
| `GET /api/dashboard/strategies` | manager | AI ideas |
| `POST /api/strategies/:id/decide` | manager | approve / dismiss |
| `POST /api/i18n/translate` | client | Gemini UI translation for a new language |

---

## 9. Listing data (existing partner database)

The partner database is **already working** and stays the source of truth. Pebble reads it; it does not copy or replace it.

```ts
// server/listings/partner.ts — the ONLY place that talks to the partner API
export interface ListingsProvider {
  health(): Promise<{ ok: boolean; latencyMs: number }>;
  search(q: { market: MarketId; bbox?: BBox; kind?: Kind; priceMax?: number; bedsMin?: number;
              pets?: boolean; status?: "active"; limit: number; cursor?: string }): Promise<Page<Listing>>;
  mapPins(q: { bbox: BBox; filters?: Partial<SearchFilters>; limit: number }): Promise<MapPin[]>;
  get(id: string): Promise<Listing | null>;          // detail incl. photos
  changedSince(since: Date, market: MarketId): AsyncIterable<{ id: string; updatedAt: Date }>;
}
```

- **Start from the existing client.** If the repo already has code calling the partner API, wrap it in this interface instead of rewriting it. Map partner fields to the normalized `Listing` type in `normalize.ts` (one place).
- **Server-side only.** Mobile app / dashboard → `/api/listings/*` → `partner.ts` → partner API. Credentials in `LISTINGS_PARTNER_BASE_URL`, `LISTINGS_PARTNER_API_KEY` (plus any partner-specific auth vars).
- **Caching and limits.** Cache map tiles/pins and detail responses (short TTL, e.g. 5 min for search/map, 30 min for detail) in memory/edge cache; respect the partner's rate limits with a token bucket; retry with backoff; return cached data when the partner is slow.
- **Map.** `GET /api/listings/map?bbox=&filters=` returns pins (id, lat, lng, price, kind) straight from the partner database for the visible area. Detail panels call `GET /api/listings/:id`.
- **Enrichment sync** (Inngest cron per market): `changedSince()` → upsert `listing_refs` → for new/changed photos run `vibe_tag` (Gemini vision) → `embed` → write `listing_enrichment`. Rate-limited and resumable. Listings that disappear from the partner database are marked stale and excluded; open leads on them trigger a follow-up-agent check.
- **Agent uploads** are stored in `uploaded_listings`, tagged the same way, and merged into results; they never write to the partner database.
- **Other sources later** (MLS/RESO, a brokerage's own feed) implement the same `ListingsProvider` interface.
- **Health check first.** `GET /api/listings/health` must pass and the map must show real Houston and Los Angeles listings before feature work continues.

Market config (Houston, Los Angeles) lives in `markets` + seed files: bounding box, timezone, default anchor suggestions, neighborhoods. Adding a market = a config row + confirming the partner covers it.

---

## 10. Metrics and forecast

- `metrics_daily` is rolled up nightly (and incrementally on events) per brokerage.
- **Deals rescued by AI follow-ups** = closed deals where a nudge was sent and the client replied within 7 days after a quiet period.
- **Average first response** = time from lead `new` to first agent message or call log.
- Forecast: least-squares trend × seasonal index on monthly revenue (deterministic code in `server/domain/metrics.ts`); Gemini only explains it and proposes strategies.

---

## 11. Non-functional targets

| Area | Target |
| --- | --- |
| Search turn latency | p50 < 2.5 s, p95 < 5 s (parse + retrieve + rerank) |
| New lead → agent notified | < 3 s |
| Availability | 99.5% (MVP) |
| AI degradation | every step falls back; UI never blocks on AI longer than its timeout |
| Platforms | iOS (current and previous major version), Android 10+ (API 29+), dashboard on current Chrome / Safari / Edge / Firefox |
| Accessibility | WCAG 2.1 AA equivalents: VoiceOver / TalkBack labels, Dynamic Type / font scaling, 44pt touch targets |
| Languages | EN UI + bundled ES/ZH/KO; any other language via Gemini translation |
