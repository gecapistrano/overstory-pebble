# Pebble — Product Idea & Features

> **Say the house. Find your home.**
> Pebble is your brokerage's AI concierge: it **listens to your clients, then briefs your agents.**
> **AI suggests, a human verifies.**

Every idea for Pebble lives here: the problem, who it's for, the full feature list (tagged **MVP** = build now, **Next** = right after, **Later** = roadmap), the wording rules and the business model.

---

## 1. The problem, from both sides

**The person searching.** You move to a new city. You scroll through hundreds of listings and still aren't sure which house is the one. Filters don't understand "cozy, lots of light, walkable to work, and I have a dog." If English isn't your first language, it's harder still.

**The agent on the other side.** Your client can't decide, stops replying, and the deal quietly dies. That's not bad luck. That's **revenue walking out the door.**

The numbers:

| Number | What it says | Source |
| --- | --- | --- |
| **56%** | of buyers say the hardest part of buying a home is simply finding the right property | National Association of Realtors, 2025 Profile of Home Buyers and Sellers |
| **~7× / 42 h** | firms that reply within an hour are nearly 7× more likely to qualify a lead, yet the average reply took 42 hours | Harvard Business Review, "The Short Life of Online Sales Leads" (2011) |
| **1 in 5** | people in the US speaks a language other than English at home | US Census Bureau, ACS 2018–2022 |

---

## 2. Who it's for

| Who | What they get | Pays? |
| --- | --- | --- |
| **Brokerage (customer)** | A branded AI concierge for its clients; faster response; leads that arrive pre-qualified; follow-ups that rescue deals; one dashboard with forecast and strategy | **Yes**, per agent seat |
| Licensed agents (users) | Leads with an AI recap, a verification checklist, AI-drafted messages, a follow-up agent, a clean pipeline | via brokerage |
| Home seekers (users) | Say what they want in their own words and language; three good houses; a real, licensed person who verifies and calls | free |

**Platforms:** one **Pebble app for iOS and Android** with a client mode and an agent mode (picked by the signed-in role), and a **web dashboard** for the brokerage.

**Launch markets:** Houston, TX and Los Angeles, CA, starting with the listing data we have today: an **existing, working listing database** from a data partner (name kept confidential), reached through the partner's API. The map and every listing screen are built on that database. Built to scale to the rest of the US, then globally.

---

## 3. The journey: listen → understand → verify → close

### 3.1 Listen

| Feature | Description | Phase |
| --- | --- | --- |
| One-tap continuous voice | Tap once; Pebble keeps listening while the client rambles; ends on a pause or tap; live transcript fades in word by word | MVP |
| One-sentence spoken reply | Pebble answers with ONE short sentence that recaps what it heard, plus three houses. Concise and human, never chatty | MVP |
| Type instead | Same pipeline from text | MVP |
| Show a photo | Client attaches a photo of a house they love; the vibe model turns it into search intent | MVP |
| Auto-translate | Detects the client's language each turn; **asks in English and in that language** ("Switch Pebble to Spanish? / ¿Cambiamos Pebble a español?"); switches only on Yes; the whole interface translates (bundled ES/ZH/KO, any other language translated by Gemini) | MVP |
| Agent still reads English | Recaps and client messages appear to the agent in English; agent replies are translated back | MVP |
| Quick-reply chips | "Cheaper", "Closer to work", "Pet friendly", "More light", "Quieter street" | MVP |
| Anchor place | Client sets the place that matters (work, school, family) and commute times are measured to it | MVP |
| Better speech recognition | Gemini Live / transcription models for accents and mixed languages | Later |
| Natural voice replies | Gemini TTS voices instead of the browser voice | Later |

### 3.2 Understand

| Feature | Description | Phase |
| --- | --- | --- |
| Request understanding (Gemini) | Pulls out intent (rent/buy/land/short stay/commercial), budget, bedrooms, timing, pets, commute, neighborhoods and the *feeling* | MVP |
| Refines within the conversation | "Cheaper", "closer", "more artsy" adjust the current search instead of restarting. (No long-term memory claims in MVP) | MVP |
| Vibe search | Gemini vision tags every listing photo: style (gothic, minimalist, artsy, modern farmhouse…), materials, colors, ambience (cozy, bright, quiet) and light. "Something cozy and artsy with lots of light" just works | MVP |
| Smart ranking | Hard filters + geo + vibe similarity shortlist, then Gemini picks the best 3 and writes "why it fits you" for each | MVP |
| Three house cards | Swipeable: photo, price, beds/baths, minutes to the anchor place, one vibe tag | MVP |
| Map view | Toggle between cards and native map pins (Apple Maps on iOS, Google Maps on Android); pins, prices and details come live from the existing listing database | MVP |
| House detail | Photo gallery, facts, "why it fits you", description | MVP |
| 3D tour | Viewer for a 3D scan / glTF when available; generated room from vibe tags otherwise | MVP |
| Long-term preference memory | Remembers taste across visits, only with its own consent switch | Later |
| Neighborhood briefings | Commute, noise, light, amenities (never demographics) | Later |

### 3.3 Verify

| Feature | Description | Phase |
| --- | --- | --- |
| **Interested!** | One tap shares the request with a licensed agent at the brokerage (consent asked here) | MVP |
| Instant routing + notification | Listing agent → market round-robin → manager fallback; phone push notification (iOS/Android) + in-app in under 3 seconds | MVP |
| AI recap | Short summary of needs, budget, timeline, must-haves and vibe, written by Gemini from the client's own words, in English | MVP |
| AI-suggested houses | The 3 houses the AI showed, with the client's pick marked | MVP |
| **Human verification checklist** | Listing still available · price current · fits client needs · legal / zoning / fair-housing OK. All four required to tap **Verify** | MVP |
| Contact client | Gemini drafts the first message (and its translation); agent edits, sends, or calls | MVP |
| Client sees the human | Status: "An agent is verifying this house" → "Verified by {agent}" with the agent's message | MVP |
| Fair-housing guardrails | Pebble never asks about, stores, infers or filters on protected characteristics | MVP |

### 3.4 Close

| Feature | Description | Phase |
| --- | --- | --- |
| Tour booking | Client picks a slot; agent confirms | MVP |
| Application / offer step | Client starts the application; agent tracks it | MVP |
| Pipeline | New → Verified → Touring → Offer/Application → Closed. Cancelled deals are archived and hidden | MVP |
| **Follow-up agent** | When a client goes quiet, Gemini (function calling) reads the deal history, re-checks the listing, finds similar houses if needed and drafts a check-in. Agent taps **Send**. Nothing is auto-sent | MVP |
| Agent nudges | "Sarah hasn't replied in 2 days. Send this check-in?"; and for the agent: "James has waited 25 min for a first reply" (escalates to the manager) | MVP |
| House → home moment | On close, the client app says "Welcome home." | MVP |
| Outcomes | Rent an apartment, buy a house, buy land, book a short stay, lease commercial space, all on one engine | MVP (rent/buy), Next (land, stay, commercial flows) |
| Scheduling sync | Agent calendar availability for tours | Next |
| E-signature hand-off | Send lease/offer to the brokerage's e-sign tool | Later |
| Commission tracking | Deal value and split per agent | Later |

---

## 4. Brokerage dashboard

| Feature | Description | Phase |
| --- | --- | --- |
| KPI cards | Revenue this month, deals closed, average agent response time, qualified vs. verified leads, **deals rescued by AI follow-ups** | MVP |
| Revenue trend + forecast | 12-month trend with a 3-month forecast (trend × seasonality) | MVP |
| Pipeline funnel | Voice requests → qualified → verified → toured → application → closed | MVP |
| Top agents | Closed deals, revenue, response time, verification rate | MVP |
| Live activity | Every request, AI step and human decision as it happens | MVP |
| **AI strategy ideas** | Gemini proposes 3 actions from the month's numbers; a manager **approves** or dismisses. AI suggests, a human decides | MVP |
| Agent seat management | Invite, deactivate, assign markets | Next |
| Multi-office analytics | Compare offices / markets | Later |

---

## 5. Agent tools

| Feature | Description | Phase |
| --- | --- | --- |
| Inbox | New leads first, with "waiting X min" flags | MVP |
| Lead view | AI recap, client's own words, suggested houses, checklist, Verify, Contact | MVP |
| Follow-ups tab | AI drafts with the agent's investigation steps shown; Send / edit / skip / mark cancelled | MVP |
| Listing edit | Change price or details of own listings | MVP |
| Upload my own listing | Photos are auto-tagged by the vibe model before publishing | MVP |
| Language badge | "Speaks Spanish · translated" on leads | MVP |

---

## 6. Trust, privacy and login

| Feature | Description | Phase |
| --- | --- | --- |
| Sign-in | Clients: email link, phone code, Google, and Sign in with Apple on iOS. Agents/managers: invite only | MVP |
| Consent screen | Plain language, one switch per purpose (voice, photo, location, translation, share with agent, follow-up messages/SMS), asked before first use; the phone's permission prompt appears only after the matching switch is on | MVP |
| Store privacy labels | App Store privacy label and Google Play Data safety form match what Pebble actually collects | MVP |
| No audio stored | Only the text transcript is kept | MVP |
| Client photos deleted after tagging | Used once for search, then removed | MVP |
| Share only on Interested! | A brokerage sees a client only after Interested! on its listing | MVP |
| My data | Download or delete everything | MVP |
| Compliance | CCPA/CPRA (Los Angeles), Texas Data Privacy and Security Act (Houston), fair housing, TCPA for SMS | MVP design, counsel review before launch |

---

## 7. Wording and brand rules

- Name: **Pebble**. Tagline: **"Say the house. Find your home."**
- Promise: **"AI suggests, a human verifies."** It's the brand, not a disclaimer.
- **House** while searching → **home** only once it's theirs.
- Describe Pebble to brokerages as "your brokerage's AI concierge: it listens to your clients, then briefs your agents." To clients: "a concierge that listens."
- Client screens never show developer labels, scores, JSON or jargon.
- Never name the listing data partner anywhere.
- Don't overclaim: "refines within the conversation" (now) vs. "remembers your taste" (later, with consent).

---

## 8. Business model

- **SaaS per agent seat**, sold to brokerages. Planned price: **$49 per agent per month** ($588/year).
- **ROI line:** one extra closed deal pays for a seat for years (a rental fee is typically about one month's rent).
- Brokerage-owned: clients, data and the relationship stay with the brokerage, not a lead marketplace.
- Future tiers: data-partner / MLS integrations, multi-office analytics, white-label client app, premium 3D tours.

---

## 9. Roadmap

1. **Now (MVP):** Houston + Los Angeles, rent and buy, full listen → understand → verify → close loop on the iOS/Android app, web dashboard, login + consent.
2. **Next:** land, short stays and commercial flows; calendar sync; seat management; more bundled languages; optionally split into two store apps (Pebble and Pebble for Agents).
3. **Later:** more US markets, then international (markets are configuration); long-term preference memory with consent; natural voice; e-signature hand-off; commission tracking.

---

## 10. Demo story (for the video and live demo)

1. Hook (US-wide): "Who here has moved to a new city and had to find a place?" → flip to the agent losing the deal.
2. Client taps once, rambles; Pebble recaps in one sentence and shows three houses.
3. "Show me something more artsy with lots of light" → vibe search.
4. A Spanish speaker → bilingual "switch language?" → Sí.
5. 3D tour → **Interested!**
6. Agent: notification → AI recap → 4-point checklist → Verify → Contact.
7. Client goes quiet → follow-up agent investigates → agent taps Send → application → closed → "Welcome home."
8. Montage: rent, buy, land, short stay.
9. Dashboard: revenue, response time, deals rescued, forecast, AI strategy → manager approves.
10. Close: "Houston and Los Angeles today, then the US, then global. Pebble. Say the house. Find your home. AI suggests, a human verifies."
