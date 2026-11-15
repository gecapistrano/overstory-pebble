# Pebble — Deployment & Infrastructure

> **Describe the house. Find your home.** · AI suggests, a human verifies.

How Pebble runs: environments, services, secrets, data, jobs, CI/CD, monitoring, security and the demo-day runbook. Read with `system-design.md` (architecture and contracts) and `idea.md` (features).

---

## 1. Principles

1. **The existing listing database is already working. Don't break it.** Listings live in the data partner's database and are reached through the partner's API. Pebble connects to it read-only through one server-side adapter. Never migrate, replace or bulk-copy it. Never name the partner company anywhere.
2. **Secrets never reach the browser.** The Gemini key and partner credentials are server-side environment variables only.
3. **Every AI step degrades gracefully.** If Gemini is slow or down, rules take over; the demo never breaks.
4. **Human gates are infrastructure, not just UI.** There is no job, cron or endpoint that sends a client message, verifies a listing or applies a strategy without a human action.
5. **US data residency for launch** (Houston and Los Angeles clients). Region choices below.

---

## 2. Services (default stack)

| Concern | Service | Plan for hackathon → production |
| --- | --- | --- |
| Mobile app (iOS + Android) | **Expo EAS** (Build, Submit, Update) | Development builds → internal testing (TestFlight / Play internal track) → App Store + Google Play |
| App store accounts | Apple Developer Program, Google Play Console | Needed for TestFlight and Play testing; set up early because review and account verification take days |
| Web dashboard + API (Next.js) | **Vercel** | Hobby/Pro → Pro with US region pinned (`iad1` or `sfo1`) |
| Listing data (source of truth) | **Existing partner database via its API** | Already running; Pebble connects with server-side credentials |
| Pebble database (Postgres + PostGIS + pgvector) | **Supabase** | Free → Pro, US region (e.g. `us-east-1` or `us-west-1`), point-in-time recovery on |
| Auth | Supabase Auth | Email magic link, phone OTP (Twilio), Google OAuth |
| File storage | Supabase Storage | Private buckets; signed URLs |
| Realtime | Supabase Realtime | Lead and status updates |
| Background jobs + crons | **Inngest** | Free → paid as volume grows |
| AI | **Gemini API** (Google AI Studio key) | → Gemini on Google Cloud (Vertex AI) for enterprise data terms, US region |
| Email | Resend | Transactional (magic links, notifications) |
| SMS | Twilio | Only for clients who opted in (TCPA) |
| Errors / performance | Sentry | Client + server |
| Uptime | Better Stack (or any uptime checker) | Pings `/api/health` and `/api/listings/health` |
| Push notifications | Expo push service → APNs (iOS) + FCM (Android) | APNs key in EAS credentials; FCM v1 service account for Android |
| Maps on Android | Google Maps SDK API key (restricted to the app's package + SHA-1) | iOS uses Apple Maps, no key needed |
| Domain / DNS | Vercel DNS or Cloudflare | `pebble.app`-style domain; HTTPS only |

Alternative all-Google path (if a brokerage requires it): Cloud Run (Next.js container), Cloud SQL for Postgres (+PostGIS, pgvector), Cloud Storage, Identity Platform, Cloud Tasks + Cloud Scheduler, Vertex AI Gemini, Secret Manager. The code doesn't change; only adapters for auth, storage and jobs do.

---

## 3. Environments

| Env | Purpose | Gemini | Partner listing database | Pebble DB |
| --- | --- | --- | --- | --- |
| `local` | Development | Real key, or the **Gemini mock** (`GEMINI_BASE_URL=http://127.0.0.1:4000/v1beta`) | Real API with a dev/sandbox key if the partner provides one; otherwise real API with strict rate limits | Supabase local (`supabase start`) or a dev project |
| `preview` | Every pull request (Vercel preview) | Mock by default; real key only if needed | Sandbox / limited key | Supabase branch or shared staging |
| `staging` | Demo rehearsal, QA | Real key | Real API | Staging project, seeded |
| `production` | Live brokerages | Real key (separate project + billing) | Real API, production credentials | Production project |

---

## 4. Environment variables

```bash
# --- App
NEXT_PUBLIC_APP_URL=https://app.example.com
NODE_ENV=production

# --- Existing listing database (data partner) — server-side only, never NEXT_PUBLIC_
LISTINGS_PARTNER_BASE_URL=
LISTINGS_PARTNER_API_KEY=
# add any extra auth the partner API needs (client id/secret, account id) as LISTINGS_PARTNER_*
LISTINGS_PARTNER_RATE_LIMIT_RPS=5
LISTINGS_CACHE_TTL_SEARCH_SEC=300
LISTINGS_CACHE_TTL_DETAIL_SEC=1800
LAUNCH_MARKETS=houston-tx,los-angeles-ca

# --- Mobile app (apps/mobile; EXPO_PUBLIC_ values are bundled into the app, so never secrets)
EXPO_PUBLIC_API_URL=https://app.example.com
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_APP_ENV=production
GOOGLE_MAPS_ANDROID_API_KEY=   # set in app.config via EAS secrets
EXPO_ACCESS_TOKEN=             # CI only, for EAS Build/Update

# --- Gemini — server-side only
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FAST_MODEL=            # optional: a Flash-Lite model for parse/rerank/translate
GEMINI_EMBED_MODEL=           # Gemini embedding model; output dimension 768
GEMINI_BASE_URL=              # leave empty in prod; mock URL in CI/offline demo

# --- Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server only
DATABASE_URL=                 # pooled connection for the ORM
DIRECT_DATABASE_URL=          # migrations

# --- Jobs
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# --- Messaging
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
WEB_PUSH_VAPID_PUBLIC=
WEB_PUSH_VAPID_PRIVATE=

# --- Observability
SENTRY_DSN=
LOG_LEVEL=info

# --- Privacy
PII_ENCRYPTION_KEY_ID=        # key reference in Supabase Vault / KMS
DATA_RETENTION_SEARCH_DAYS=90
```

Rules: commit `.env.example` only. Anything that starts with `EXPO_PUBLIC_` is readable inside the shipped app, exactly like `NEXT_PUBLIC_` on the web: the Gemini key and partner credentials must never appear in `apps/mobile`. Secrets live in Vercel / Supabase / Inngest dashboards (or Secret Manager on GCP). Rotate the Gemini and partner keys before launch and after any leak. Anything that starts with `NEXT_PUBLIC_` is visible to browsers, so never put a secret there.

---

## 5. Data

### 5.1 Two data stores, clearly separated

| Store | Owner | Holds | Pebble access |
| --- | --- | --- | --- |
| **Listing database (existing)** | Data partner | Listings, photos, prices, locations, status for Houston and Los Angeles | Read-only through `server/listings/partner.ts` |
| **Pebble database** | Pebble | Users, consents, search sessions, leads, messages, verifications, tours, nudges, strategies, metrics, AI runs, audit log, listing enrichment (vibe tags + embeddings keyed by partner listing ID), agent-uploaded listings | Read/write |

### 5.2 Migrations and seed
- Drizzle migrations in `/db/migrations`; run `drizzle-kit migrate` in CI on deploy (staging first, then production).
- Enable extensions in the first migration: `postgis`, `vector`, `pgcrypto`.
- RLS policies ship in migrations (by `brokerage_id`, role, and ownership). Service-role key is used only by jobs and server code.
- Seed: markets (Houston, Los Angeles), one demo brokerage, demo agents and a manager, demo leads for the pipeline. **No listings are seeded**: listings come from the partner database.

### 5.3 Backups and recovery
- Supabase Pro: daily backups + point-in-time recovery (7+ days). Test a restore before launch.
- The partner database is backed up by the partner; Pebble's enrichment can be rebuilt by re-running the sync.
- RPO 1 hour / RTO 4 hours (MVP target).

---

## 6. Background jobs (Inngest)

| Job | Trigger | What it does | Limits |
| --- | --- | --- | --- |
| `listings/enrich.sync` | cron every 30 min per market | `changedSince()` from the partner database → upsert `listing_refs` → queue tagging for new/changed photos | Partner rate limit; resumable cursor |
| `listings/vibe.tag` | event | Gemini vision on ≤4 photos → `listing_enrichment` | Concurrency 5; retries ×3 with backoff |
| `listings/embed` | event | Gemini embedding of the vibe text | Concurrency 10 |
| `leads/created` | event | Route agent, notify (realtime + push), Gemini recap | < 3 s to notify; recap may arrive after |
| `followups/sweep` | cron hourly | Find quiet deals (client or agent) → run follow-up agent → store draft as `pending_approval` → notify agent | Never sends to clients |
| `agents/first-response.watch` | cron every 5 min | Flag leads waiting too long for a first reply; escalate to manager after threshold | — |
| `metrics/rollup` | cron nightly + on events | `metrics_daily`, funnel, rescued deals, forecast | — |
| `strategies/propose` | cron daily | Gemini strategy ideas → `proposed` for manager approval | Exactly 3 per brokerage per day max |
| `privacy/delete` | event (data request) | Delete/anonymize client data across tables; record completion | Within 30 days (target: 24 h) |
| `privacy/retention` | cron nightly | Purge search sessions older than retention with no lead | — |

All jobs are idempotent (keyed by entity + version) and logged.

---

## 7. CI/CD (GitHub Actions + Vercel)

```
pull request ──► lint · typecheck · unit tests (Vitest) · e2e (Playwright) against
                 Gemini mock + partner API stub ──► Vercel preview deploy
merge to main ─► migrations on staging ──► deploy staging ──► smoke tests:
                 /api/health · /api/listings/health · map returns Houston + LA pins ·
                 one search turn · one lead created
manual promote ► migrations on production ──► deploy production ──► same smoke tests
```

- CI **never** calls the real Gemini API or the real partner API. Use the Gemini mock server and a recorded partner-API fixture (anonymized) in `/tests/fixtures/partner/`.
- Feature flags (`flags` table or Vercel Edge Config): `ai_followup_agent`, `ai_strategies`, `sms`, `long_term_memory`, `new_markets`.

---

## 7b. Mobile builds and releases (Expo EAS)

| Profile (`eas.json`) | Use | Distribution |
| --- | --- | --- |
| `development` | Day-to-day work; includes native modules (speech recognition, maps), so Expo Go is not enough | Dev client on your own phones / simulators |
| `preview` | Team testing and demo-day phones | iOS: TestFlight internal testers · Android: internal testing track or a direct APK |
| `production` | Store release | App Store + Google Play |

- **Build:** `eas build --profile <profile> --platform all`. Bundle IDs: `app.pebble.mobile` (iOS + Android), one app with client and agent modes.
- **Submit:** `eas submit` to App Store Connect and Google Play Console. Apple review typically takes a day or more; plan demo installs through TestFlight / Play internal testing, not the public stores.
- **Over-the-air updates:** `eas update --branch preview|production` ships JavaScript/asset fixes without a store review. Native changes (new permissions, new native modules) need a new build.
- **API compatibility:** shipped app versions keep working, so the API only adds fields; breaking changes go to `/api/v2`. The app sends `X-App-Version`; the server can show a "please update" screen below a minimum version.
- **Store listings:** privacy label (App Store) and Data safety form (Google Play) must match the consent design: speech converted to text (audio not kept), photos processed then deleted, approximate location for commute, contact info for agents, no tracking or ad sharing.
- **Deep links:** `pebble://` scheme + iOS universal links / Android app links on the web domain (`/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`, served by `apps/web`) for magic-link sign-in and push taps.
- **CI:** on merge to main, `eas update --branch preview`; on a release tag, `eas build --profile production` + `eas submit`. Mobile e2e (Maestro) runs on preview builds against the Gemini mock and the partner-API fixture.

---

## 8. Monitoring and alerts

| Signal | Alert when |
| --- | --- |
| `/api/listings/health` (partner database) | down 2 checks in a row, or p95 latency > 3 s |
| Gemini error rate (`ai_runs.status != ok`) | > 5% over 10 min (fallbacks are covering) |
| Search turn latency | p95 > 5 s over 15 min |
| Lead → agent notification | p95 > 10 s |
| Push delivery | Expo push receipts with errors > 2% |
| Mobile crashes | crash-free sessions < 99.5% (Sentry for React Native) |
| Job failures | any job failed after retries |
| Guardrail events | spike (possible misuse or prompt issue) |
| Cost | daily Gemini spend > budget threshold |

Dashboards: Vercel analytics, Supabase metrics, Inngest runs, Sentry, and a small internal `/admin/health` page.

---

## 9. Security and privacy checklist

- [ ] HTTPS everywhere; HSTS; secure cookies.
- [ ] RLS on every Pebble table; server checks role + `brokerage_id` on every route.
- [ ] Partner and Gemini credentials only in server env; no `NEXT_PUBLIC_` secrets; partner name absent from code and logs.
- [ ] Consent recorded before mic, photo, location, sharing with an agent, follow-up messages, SMS.
- [ ] Voice audio never stored; client search photos deleted after tagging.
- [ ] PII encrypted at rest; redacted in logs and `ai_runs`.
- [ ] "My data" export and delete working end to end.
- [ ] Fair-housing guardrail tests (prompt + server filter) in CI.
- [ ] Rate limiting on public endpoints (search turns, auth) and abuse protection.
- [ ] Dependency scanning (Dependabot) and secret scanning on the repo.
- [ ] Privacy notice and terms published; counsel review for CCPA/CPRA (California), Texas Data Privacy and Security Act, fair housing and TCPA before launch.

---

## 10. Scaling path

| Stage | Change |
| --- | --- |
| Hackathon / pilot (1 brokerage, 2 cities) | Defaults above |
| Several brokerages | Supabase Pro + read replica; partner response cache in Redis (Upstash); Inngest paid |
| More US markets | Add `markets` rows; confirm partner coverage; enrichment sync per market |
| International | Region-specific deployments for data residency; more bundled languages; local currency and units; local fair-housing / privacy rules per market |
| Enterprise brokerages | Vertex AI Gemini with enterprise terms; SSO (SAML) for agents; audit exports; dedicated database |

---

## 11. Cost notes (MVP, rough)

- Gemini: a search turn is ~2 calls (parse + rerank), a lead ~2 (recap + draft), follow-ups ~3–5 tool steps. Use the fast model for parse/rerank/translate. Cache UI translations per language. Track spend in `ai_runs`.
- Vibe tagging runs once per new/changed photo set, not per search.
- Partner API: cache map and detail responses; respect contract limits.

---

## 12. Demo-day runbook

1. **Day before:** staging deploy green; `/api/listings/health` OK; map shows real Houston and LA listings; run the full journey twice; reset demo leads.
2. **Keys:** confirm Gemini quota/billing; have a second key ready.
3. **Network fallback:** if venue Wi-Fi fails, run locally with the Gemini mock (`GEMINI_BASE_URL` → mock) and the partner-API fixture, so the app still works end to end, with the recorded demo video as a final backup.
4. **Devices:** one phone signed in as the demo client and one as the demo agent (preview builds installed via TestFlight / Play internal testing, plus a spare Android APK), and a laptop with the web dashboard signed in as the manager. Turn on Do Not Disturb except Pebble, and set both phones to full brightness and screen mirroring.
5. **Reset:** `/admin/demo/reset` clears demo leads and re-seeds the pipeline (never touches the partner database).
