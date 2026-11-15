/** Vibe model: Gemini reads listing / client photos and returns style, materials, colors, ambience, light. */
import { generateJSON, dataUrlToPart } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";
import type { VibeTags } from "@/lib/types";

export const dynamic = "force-dynamic";

const SYSTEM = `You tag real-estate photos for vibe search. Reply ONLY with JSON:
{"style": up to 2 of ["gothic","minimalist","artsy","modern farmhouse","colonial","victorian","industrial","craftsman","contemporary","scandinavian"],
 "materials": up to 4 short phrases, "colors": up to 4 color names,
 "ambience": up to 4 of ["cozy","bright","quiet","calm","creative","airy","moody","leafy","historic","warm","urban"],
 "light": number 0..1 for how much natural light}. Describe the space only, never people.`;

export async function POST(req: Request) {
  const { images } = (await req.json()) as { images: string[] };
  return handle(async () => {
    const tags = await generateJSON<VibeTags>(SYSTEM, [...images.slice(0, 4).map(dataUrlToPart), { text: "Tag these photos." }]);
    return { tags };
  });
}
