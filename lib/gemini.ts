/**
 * Server-only Gemini API client (REST, generateContent).
 * The API key never reaches the browser: set GEMINI_API_KEY in .env.local
 * (or your host's environment). GEMINI_MODEL overrides the default model.
 *
 * Notes for current Gemini models: sampling params (temperature/top_p/top_k)
 * are deprecated, and a request must not end with a "model" turn, so every
 * call here ends with a user turn (or a user turn carrying functionResponses).
 */
import "server-only";

const BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const FAST_MODEL = process.env.GEMINI_FAST_MODEL || MODEL;

export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY);

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
export interface Content { role: "user" | "model"; parts: Part[] }
export interface FunctionDecl { name: string; description: string; parameters: Record<string, unknown> }

export async function generate(opts: {
  contents: Content[];
  system?: string;
  json?: boolean;
  tools?: FunctionDecl[];
  model?: string;
  timeoutMs?: number;
}): Promise<{ parts: Part[]; content: Content }> {
  if (!hasGemini()) throw new Error("GEMINI_API_KEY is not set");
  const body: Record<string, unknown> = { contents: opts.contents };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (opts.json) body.generationConfig = { responseMimeType: "application/json" };
  if (opts.tools?.length) body.tools = [{ functionDeclarations: opts.tools }];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  try {
    const res = await fetch(`${BASE}/models/${opts.model || MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    const content: Content = j.candidates?.[0]?.content || { role: "model", parts: [] };
    return { parts: content.parts || [], content: { role: "model", parts: content.parts || [] } };
  } finally {
    clearTimeout(timer);
  }
}

export function textOf(parts: Part[]) {
  return parts.map((p) => ("text" in p ? p.text : "")).join("");
}

export function parseJSON<T>(s: string): T {
  const m = s.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : s) as T;
}

/** One-shot JSON call: system prompt + user parts -> parsed object. */
export async function generateJSON<T>(system: string, parts: Part[], model?: string): Promise<T> {
  const { parts: out } = await generate({ system, contents: [{ role: "user", parts }], json: true, model });
  return parseJSON<T>(textOf(out));
}

export function dataUrlToPart(dataUrl: string): Part {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error("expected a data: URL");
  return { inlineData: { mimeType: m[1], data: m[2] } };
}
