/** Speech to text in any language: the browser records the client, Gemini transcribes it in the language
 *  they actually spoke (the browser's own recognizer only hears the one language it was set to). */
import { generateJSON, dataUrlToPart } from "@/lib/gemini";
import { handle } from "@/lib/ai-server";

export const dynamic = "force-dynamic";

const SYSTEM = `You transcribe a short voice message from someone describing a home they want to rent or buy.
Write exactly what they said, in the language they spoke it (never translate). Fix nothing but obvious filler ("um").
If several languages are mixed, keep each part as spoken. If there is no speech, return an empty text.
Reply ONLY with JSON: {"text": the transcript, "language": the ISO 639-1 code of the main language spoken, e.g. "en", "es", "zh", "ko", "ar", "ru"}.`;

const MAX_BYTES = 6_000_000; // ~3 minutes of compressed audio

export async function POST(req: Request) {
  const { audio } = (await req.json()) as { audio?: string };
  if (!audio || !audio.startsWith("data:audio/") || audio.length > MAX_BYTES) {
    return Response.json({ error: "bad-audio" }, { status: 400 });
  }
  // "audio/webm;codecs=opus" -> "audio/webm": Gemini wants the bare type
  const clean = audio.replace(/^data:(audio\/[\w.+-]+)[^;,]*(;codecs=[^;,]+)?;base64,/, "data:$1;base64,");
  return handle(async () => {
    const r = await generateJSON<{ text: string; language: string }>(SYSTEM, [{ text: "Transcribe this voice message." }, dataUrlToPart(clean)]);
    return { text: (r.text || "").trim(), language: (r.language || "").toLowerCase().slice(0, 5) };
  });
}
