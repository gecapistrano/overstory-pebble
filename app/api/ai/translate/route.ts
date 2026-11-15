/** Translates the app's interface strings into the client's language (any language Gemini supports). */
import { generateJSON, FAST_MODEL } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";
import { HttpError, obj, readBody, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

const SYSTEM = `Translate the JSON values into the target language for a friendly home-search app. Keep keys, keep "|" separators,
keep it short and natural, keep "Pebble" untranslated. Reply ONLY with the translated JSON object.`;

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readBody(req);
    const language = str(body.language, "language", { max: 40 });
    const raw = obj(body.strings, "strings");
    const keys = Object.keys(raw);
    if (!keys.length) throw new HttpError(400, "bad-input", "strings is empty");
    if (keys.length > 400) throw new HttpError(400, "bad-input", "strings has more than 400 entries");
    const strings: Record<string, string> = {};
    for (const k of keys) {
      if (k.length > 80) throw new HttpError(400, "bad-input", `strings key ${k.slice(0, 20)}… is too long`);
      strings[k] = str(raw[k], `strings.${k}`, { max: 1000 });
    }
    const out = await generateJSON<Record<string, unknown>>(SYSTEM, [{ text: `Target language: ${language}\n${JSON.stringify(strings)}` }], FAST_MODEL);
    // only hand back the keys we asked for, as text (the model may drop, add or nest keys)
    const translated: Record<string, string> = {};
    for (const k of keys) translated[k] = typeof out?.[k] === "string" && out[k] ? (out[k] as string) : strings[k];
    return { strings: translated };
  });
}
