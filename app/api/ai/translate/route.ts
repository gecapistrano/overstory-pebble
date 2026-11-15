/** Translates the app's interface strings into the client's language (any language Gemini supports). */
import { generateJSON, FAST_MODEL } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";

export const dynamic = "force-dynamic";

const SYSTEM = `Translate the JSON values into the target language for a friendly home-search app. Keep keys, keep "|" separators,
keep it short and natural, keep "Pebble" untranslated. Reply ONLY with the translated JSON object.`;

export async function POST(req: Request) {
  const { language, strings } = (await req.json()) as { language: string; strings: Record<string, string> };
  return handle(async () => ({ strings: await generateJSON<Record<string, string>>(SYSTEM, [{ text: `Target language: ${language}\n${JSON.stringify(strings)}` }], FAST_MODEL) }));
}
