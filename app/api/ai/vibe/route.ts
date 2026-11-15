/** Vibe model: Gemini reads listing / client photos. It first decides WHAT the photo shows (a home or
 *  not), and only then tags design style (lib/styles.ts taxonomy), materials, colors, feel, light.
 *  A screenshot, document, chart, meme, selfie, pet, food, car or landscape is reported as "not_home"
 *  with a one-line message to the user, never forced into a style. */
import { generateJSON, dataUrlToPart } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";
import { STYLES, CUES, FEELS, toStyle } from "@/lib/styles";
import type { PhotoSubject, VibeTags } from "@/lib/types";

export const dynamic = "force-dynamic";

const SUBJECTS: PhotoSubject[] = ["interior", "exterior", "floor_plan", "decor", "other_space", "not_home"];
const USABLE = new Set<PhotoSubject>(["interior", "exterior", "floor_plan", "decor", "other_space"]);

const system = (language: string) => `You check photos that a home seeker uploads as inspiration for a house search (or that an agent uploads for a listing).

STEP 1, be honest and strict: decide what the photo really shows. Pick "subject":
- "interior": a room inside a home (living room, kitchen, bedroom, bathroom...).
- "exterior": the outside of a house or residential building (facade, porch, yard, pool, street view of homes).
- "floor_plan": a residential floor plan or room layout drawing (with rooms such as bed, bath, kitchen).
- "decor": a close-up of home furniture, finishes, fixtures or materials (a sofa, tiles, a lamp, cabinetry).
- "other_space": a non-home interior or building whose look could still inspire a home (hotel room, cafe, office lobby).
- "not_home": anything else: screenshots, documents, text, charts, diagrams or layouts that are not of a home, maps, UI,
  memes, people, selfies, pets, animals, food, cars, products unrelated to homes, landscapes or nature with no home in view,
  abstract or blank images. When unsure whether it is a home, choose "not_home".
"confidence" 0..1 for that choice. "description": a short plain phrase of what is actually in the photo (max 12 words).

STEP 2, only if subject is not "not_home": tag the look. Pick the design style using ONLY these styles (cues in brackets):
${STYLES.map((s) => `- "${s}" [${CUES[s]}]`).join("\n")}
Judge fixed finishes first (cabinets, floors, trim, fixtures), then furniture. Builder-grade beige is "transitional" or "contemporary", not "modern".
For a floor plan, give "beds" (number of bedrooms you can count, else null) and leave styles empty unless the drawing shows finishes.
If subject is "not_home", leave styles, materials, colors and ambience EMPTY and light 0. Never invent a style for a non-home photo.

"message": ONE short friendly sentence in ${language}, addressed to the home seeker:
- if "not_home": say plainly what the photo looks like and that it is not a home, then invite them to share a photo of a room or house they love, or to describe it. If the photo has a clear mood that maps to homes (e.g. a beach suggests "coastal"), you may offer that as a suggestion.
- otherwise: say what you see that you will use for the search (e.g. "Love the warm wood and big windows in this kitchen").

Reply ONLY with JSON:
{"subject": one of ${JSON.stringify(SUBJECTS)}, "confidence": number, "description": string, "message": string,
 "styles": 0-3 of [{"name": one of the styles, "confidence": 0..1}] strongest first,
 "materials": up to 4 short phrases, "colors": up to 4 color names,
 "ambience": up to 4 of ${JSON.stringify(FEELS)},
 "light": number 0..1 for how much natural light, "beds": number or null}.
Describe the space only, never identify or describe people.`;

type Raw = {
  subject?: string; confidence?: number; description?: string; message?: string; beds?: number | null;
  styles?: { name: string; confidence?: number }[]; materials?: string[]; colors?: string[]; ambience?: string[]; light?: number;
};

export async function POST(req: Request) {
  const { images, language } = (await req.json()) as { images: string[]; language?: string };
  return handle(async () => {
    const raw = await generateJSON<Raw>(system(language || "English"), [...images.slice(0, 4).map(dataUrlToPart), { text: "Check these photos." }]);
    const subject: PhotoSubject = SUBJECTS.includes(raw.subject as PhotoSubject) ? (raw.subject as PhotoSubject) : "not_home";
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
    // a home call the model itself is unsure about is not good enough to steer a search
    const relevant = USABLE.has(subject) && confidence >= 0.5;
    const conf: Record<string, number> = {};
    if (relevant) for (const s of raw.styles || []) {
      const k = toStyle(s?.name);
      if (k && conf[k] === undefined) conf[k] = Math.max(0, Math.min(1, Number(s.confidence) || 0.6));
    }
    const style = Object.keys(conf).sort((a, b) => conf[b] - conf[a]);
    const tags: VibeTags = {
      subject,
      relevant,
      subjectConfidence: confidence,
      description: String(raw.description || "").slice(0, 120),
      message: String(raw.message || "").slice(0, 300),
      beds: relevant && Number.isFinite(Number(raw.beds)) && Number(raw.beds) > 0 ? Math.round(Number(raw.beds)) : undefined,
      style,
      styleConfidence: conf,
      materials: relevant ? (raw.materials || []).slice(0, 4) : [],
      colors: relevant ? (raw.colors || []).slice(0, 4) : [],
      ambience: relevant ? (raw.ambience || []).map((a) => a.toLowerCase()).filter((a) => (FEELS as readonly string[]).includes(a)) : [],
      light: relevant ? Math.max(0, Math.min(1, Number(raw.light) || 0)) : 0,
    };
    return { tags };
  });
}
