# Pebble demo video: voiceover script (Houston & Los Angeles)

About 2:30 · 1920×1080 · 30 fps. Voice: warm, confident English (Kokoro TTS, voice af_heart, or a live presenter). Paced at roughly 150 words a minute.

**Structure.** 0:00–0:22 is the problem, told from both sides with the three numbers on screen. Then the ten-step walkthrough on the live demo (`/demo/`), from searching for a house to a closed deal. Wording rule: it's a **house** while the client is searching, and a **home** only once it's theirs.

**Cast.** Sarah, the client, is relocating to Houston for a job downtown. Maya is a licensed Real Estate Agent at the brokerage.

## Part 1 · The problem (0:00–0:22)

| Time | On screen | Voiceover |
| --- | --- | --- |
| 0:00 | A phone scrolling an endless list of Houston listings | Sarah is moving to Houston. Hundreds of listings later, she still can't tell which house is the one. She's not alone: fifty-six percent of buyers say finding the right property is the hardest part. |
| 0:09 | The agent's phone: an unanswered lead, a clock ticking past 40 hours | On the other side, an agent watches her go quiet. Reply within an hour and a lead is seven times more likely to qualify. The average reply takes forty-two hours. |
| 0:17 | Map of the US with "1 in 5" | And one in five people here speak another language at home. Most property tools act like they don't exist. |

On-screen source captions (bottom left, small, 3 seconds each):

- "56%: National Association of Realtors, 2025 Profile of Home Buyers and Sellers"
- "7× / 42 hours: Oldroyd, McElheran & Elkington, Harvard Business Review, March 2011"
- "1 in 5 (21.7%): US Census Bureau, American Community Survey 2018–2022"

## Part 2 · The walkthrough (0:22–2:30)

| Time | Step | On screen (`/demo/`) | Voiceover |
| --- | --- | --- | --- |
| 0:22 | Title | Pebble logo, "Say the house. Find your home." | Meet Pebble. AI suggests, a human verifies. |
| 0:26 | 1 · Listen | Homebuyer app: tap the mic. Sarah says: "I'm starting a job downtown. Two bedrooms, under two thousand a month, I have a dog, and I want lots of light, maybe near the Heights." | One tap, and Sarah just talks, rambling and all. Pebble keeps listening, picks out her budget, bedrooms, timing, her dog, and the feeling she's after, then answers in one sentence with three houses, each with a reason it fits. |
| 0:42 | 2 · Refine | Sarah says "a bit cheaper, more artsy." The list updates, then she opens a house and its 3D tour | She doesn't start over. "A bit cheaper, more artsy" refines the same search, because vibe search has read every listing photo for style, materials and light. These are real CoStar listings in Houston and Los Angeles. |
| 0:56 | 3 · Interested! | Sarah taps **Interested!** | She loves one, so she taps Interested. Only now does her request reach an agent. |
| 1:01 | 4 · Verify | Agent app: new-lead alert, AI recap, checklist (available, price, fit, fair housing), **Verify** | Maya gets the lead in seconds, not forty-two hours, with an AI recap in Sarah's own words. Before anything is confirmed, she checks availability, price, fit and fair housing herself. AI suggests, a human verifies. |
| 1:17 | 5 · Book a tour | Homebuyer app status screen: "Verified by Maya", Sarah picks Sat 10:00 | Sarah sees her house verified by a real person, and books a tour with one tap. |
| 1:25 | 6 · Apply | Sarah taps **Start application** | After the tour, she's ready. One more tap, and her application is on its way. |
| 1:32 | 7 · Follow-up | Agent app, **Follow-ups** tab: a quiet deal and the AI-drafted check-in, sent with one tap | Deals stall. When a client goes quiet, Pebble's follow-up agent reviews the deal, re-checks the listing, and drafts a check-in. Maya reads it and sends it with one tap. |
| 1:46 | 8 · Close | Agent app: **Close deal** | Then the part every brokerage waits for. Maya closes the deal. |
| 1:51 | 9 · Home | Homebuyer app: "Lease signed. Welcome home." (or "It's yours! Keys are waiting." for a purchase) | And on Sarah's phone: Welcome home. A house just became a home. |
| 1:59 | 10 · Dashboard | Brokerage dashboard: revenue, response time, deals rescued by follow-ups, forecast | And the brokerage sees all of it: revenue, response times, deals rescued by follow-ups, a forecast, and strategy ideas a manager approves. |
| 2:12 | Language (optional cut-in) | Sarah's friend asks in Spanish; Pebble asks to switch in English and Spanish | Speak another language? Pebble notices, asks first, then switches. The agent still reads English. |
| 2:22 | End card | "Pebble. Say the house. Find your home." · Houston · Los Angeles | Pebble. Say the house, find your home. AI suggests, a human verifies. |

## References

1. National Association of Realtors, *2025 Profile of Home Buyers and Sellers* (transactions July 2024 to June 2025). Summary: <https://www.nar.realtor/news/economists-outlook/top-10-takeaways-from-nars-2025-profile-of-home-buyers-and-sellers>
2. J. B. Oldroyd, K. McElheran, D. Elkington, "The Short Life of Online Sales Leads," *Harvard Business Review*, March 2011. An audit of 2,241 US firms; the 42-hour average is among firms that replied within 30 days. <https://hbr.org/2011/03/the-short-life-of-online-sales-leads>
3. US Census Bureau, "Most Americans Speak Only English at Home or Speak English 'Very Well'," release CB23-208, December 7, 2023 (ACS 5-year estimates, 2018–2022): 21.7% of people age 5 and over. <https://www.census.gov/newsroom/press-releases/2023/language-at-home-acs-5-year.html>

## Recording notes

- Before recording, open `/demo/` in a fresh Chrome window, which starts from the sample pipeline. Voice input needs Chrome; "Try an example" works anywhere.
- Steps 5–9 move one lead forward on both phones at once; keep both panes in frame.
- `video-tools/vo_lines.json` still holds the old Princeton lines and scene ids for the earlier capture. Update it alongside a new screen capture.
