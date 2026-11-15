/**
 * Auto-translate. Pebble detects the language a client speaks or types, ASKS
 * (in English and in that language) whether to switch, and only switches on
 * "Yes". Requests are normalized to English for matching, and agents always
 * read the AI recap in English with the client's language noted.
 */
import type { Criteria } from "./types";

/** Built-in UI languages; Gemini adds any other language at runtime (registerLanguage). */
export type Lang = string;
export const LANG_NAME: Record<string, { en: string; native: string }> = {
  en: { en: "English", native: "English" },
  es: { en: "Spanish", native: "Español" },
  zh: { en: "Chinese", native: "中文" },
  ko: { en: "Korean", native: "한국어" },
};

/** Lightweight on-device detection (script + common words). An LLM can replace this. */
export function detectLanguage(text: string): Lang {
  if (/[가-힯]/.test(text)) return "ko";
  if (/[一-鿿]/.test(text)) return "zh";
  const t = " " + text.toLowerCase() + " ";
  const es = [" busco ", " quiero ", " necesito ", " habitaci", " cerca ", " perro", " para ", " con ", " una ", " casa ", " mi ", " menos de ", " luz ", " acogedor", " apartamento", " mudo", " trabajo ", " dólares", " mes "];
  const hits = es.filter((w) => t.includes(w)).length;
  return hits >= 3 ? "es" : "en";
}

/** Normalizes a non-English request into English keywords for the offline parser. */
export function toEnglish(text: string, lang: Lang): string {
  if (lang === "en") return text;
  let t = text.toLowerCase();
  const maps: Record<string, [RegExp, string][]> = {
    es: [
      [/(\d+|dos|tres|una|un) (habitaciones|habitación|recámaras|cuartos|dormitorios)/g, "$1-bedroom"], [/\bdos\b/g, "two"], [/\btres\b/g, "three"], [/\buna?\b/g, "one"],
      [/menos de|máximo|hasta/g, "under"], [/(\d+) ?mil/g, "$1000"], [/\bperros?\b/g, "dog"], [/\bgatos?\b/g, "cat"], [/acogedor[ao]?s?/g, "cozy"], [/artístic[ao]s?|creativ[ao]/g, "artsy"],
      [/mucha luz|luminos[ao]|luz natural/g, "lots of light"], [/tranquil[ao]/g, "quiet"], [/cerca del centro|cerca del trabajo|caminando al trabajo|a pie/g, "walkable to work"],
      [/alquilar|rentar|alquiler/g, "rent"], [/comprar/g, "buy"], [/terreno/g, "land"], [/agosto/g, "august"], [/septiembre/g, "september"], [/julio/g, "july"], [/trabajo/g, "job"], [/más barato/g, "cheaper"],
    ],
    zh: [
      [/两室|两居|兩房|两卧/g, " 2-bedroom "], [/三室|三居/g, " 3-bedroom "], [/一室|一居/g, " 1-bedroom "], [/(\d+)\s*(美元|美金|刀)?以下|不超过(\d+)/g, " under $1$3 "],
      [/狗/g, " dog "], [/猫/g, " cat "], [/温馨|舒适/g, " cozy "], [/艺术/g, " artsy "], [/明亮|采光好|阳光/g, " lots of light "], [/安静/g, " quiet "],
      [/校园附近|走路到校园|步行到学校|离学校近/g, " walkable to work "], [/租/g, " rent "], [/买/g, " buy "], [/八月/g, " august "], [/九月/g, " september "], [/工作/g, " job "],
    ],
    ko: [
      [/방\s*2개|투룸/g, " 2-bedroom "], [/방\s*3개/g, " 3-bedroom "], [/원룸/g, " studio "], [/(\d+)\s*달러\s*이하/g, " under $$$1 "], [/강아지|개/g, " dog "], [/고양이/g, " cat "],
      [/아늑한/g, " cozy "], [/예술적인|감성적인/g, " artsy "], [/밝은|채광/g, " lots of light "], [/조용한/g, " quiet "], [/캠퍼스 근처|걸어서/g, " walkable to work "], [/월세|렌트/g, " rent "], [/8월/g, " august "], [/직장|일/g, " job "],
    ],
  };
  for (const [re, rep] of maps[lang] || []) t = t.replace(re, rep);
  return t;
}

type Dict = Record<string, string>;
const D: Record<string, Dict> = {
  es: {
    tagline1: "Di la casa.", tagline2: "Encuentra tu hogar.", tapTalk: "Toca y habla.", typeInstead: "Escribir", showPhoto: "Mostrar una foto",
    listening: "Escuchando…", goAhead: "Adelante, te escucho.", pauseHint: "Respondo cuando hagas una pausa", finding: "Buscando hogares que se sientan bien…",
    sayMore: "Di o escribe más…", interested: "¡Me interesa!", interestedSub: "Un agente real lo verifica", tour3d: "Tour 3D", whyFits: "Por qué te queda",
    walk: "min a pie al centro", drive: "min en auto al centro", petsOk: "Mascotas OK", noPets: "Sin mascotas",
    sheetTitle: "Un agente real sigue desde aquí", sheetBody: "Un agente con licencia confirma que está disponible, con el precio correcto y que es para ti. Luego te llama.", send: "Enviar a un agente",
    yourHome: "Tu hogar", sent: "Enviado a un agente con licencia", verifying: "Un agente está verificando este hogar", verifiedBy: "Verificado por",
    book: "Reserva una visita", apply: "Aplicar", startApp: "Iniciar solicitud", movein: "Mudanza", welcome: "Contrato firmado. Bienvenida a casa.",
    chips: "Más barato|Más cerca del centro|Acepta mascotas|Más luz|Calle tranquila",
  },
  zh: {
    tagline1: "说出你想要的房子。", tagline2: "找到你的家。", tapTalk: "点一下，直接说。", typeInstead: "改为输入", showPhoto: "上传照片",
    listening: "正在听…", goAhead: "请说，我在听。", pauseHint: "你停顿时我就回答", finding: "正在寻找合适的家…",
    sayMore: "继续说或输入…", interested: "我感兴趣！", interestedSub: "由真人经纪人核实", tour3d: "3D 看房", whyFits: "为什么适合你",
    walk: "分钟步行到市中心", drive: "分钟车程到市中心", petsOk: "可养宠物", noPets: "不可养宠物",
    sheetTitle: "接下来由真人经纪人跟进", sheetBody: "持证经纪人会确认房源可用、价格准确、适合你，然后给你打电话。", send: "发送给经纪人",
    yourHome: "你的家", sent: "已发送给持证经纪人", verifying: "经纪人正在核实这套房子", verifiedBy: "已核实：",
    book: "预约看房", apply: "申请", startApp: "开始申请", movein: "入住", welcome: "租约已签。欢迎回家。",
    chips: "便宜一点|离市中心更近|可养宠物|更明亮|安静街道",
  },
  ko: {
    tagline1: "원하는 집을 말하세요.", tagline2: "당신의 집을 찾으세요.", tapTalk: "탭하고 말하세요.", typeInstead: "입력하기", showPhoto: "사진 보여주기",
    listening: "듣고 있어요…", goAhead: "말씀하세요, 듣고 있어요.", pauseHint: "말을 멈추면 답할게요", finding: "딱 맞는 집을 찾는 중…",
    sayMore: "더 말하거나 입력하세요…", interested: "관심 있어요!", interestedSub: "실제 중개사가 확인해요", tour3d: "3D 투어", whyFits: "잘 맞는 이유",
    walk: "분 도보 (다운타운)", drive: "분 차량 (다운타운)", petsOk: "반려동물 가능", noPets: "반려동물 불가",
    sheetTitle: "이제 실제 중개사가 도와드려요", sheetBody: "공인 중개사가 매물 여부, 가격, 적합성을 확인한 뒤 전화드려요.", send: "중개사에게 보내기",
    yourHome: "나의 집", sent: "공인 중개사에게 전송됨", verifying: "중개사가 이 집을 확인 중", verifiedBy: "확인 완료:",
    book: "방문 예약", apply: "신청", startApp: "신청 시작", movein: "입주", welcome: "계약 완료. 집에 오신 걸 환영해요.",
    chips: "더 저렴하게|다운타운 더 가까이|반려동물 가능|더 밝게|조용한 거리",
  },
};
export const EN: Dict = {
  tagline1: "Say the house.", tagline2: "Find your home.", tapTalk: "Tap and just talk.", typeInstead: "Type instead", showPhoto: "Show a photo",
  listening: "Listening…", goAhead: "Go ahead, I'm listening.", pauseHint: "I'll answer when you pause", finding: "Finding homes that feel right…",
  sayMore: "Say or type more…", interested: "Interested!", interestedSub: "A Real Estate Agent verifies it", tour3d: "3D tour", whyFits: "Why it fits you",
  walk: "min walk to downtown", drive: "min drive to downtown", petsOk: "Pets OK", noPets: "No pets",
  sheetTitle: "A Real Estate Agent takes it from here", sheetBody: "A licensed Real Estate Agent checks that this home is available, priced right, and right for you — then calls you.", send: "Send to a Real Estate Agent",
  yourHome: "Your home", sent: "Sent to a licensed Real Estate Agent", verifying: "A Real Estate Agent is verifying this home", verifiedBy: "Verified by",
  book: "Book a tour", apply: "Apply", startApp: "Start application", movein: "Move in", welcome: "Lease signed. Welcome home.",
  chips: "Cheaper|Closer to downtown|Pet friendly|More light|Quieter street",
};
export const t = (lang: Lang, k: keyof typeof EN | string) => (lang === "en" ? EN[k] : D[lang]?.[k] ?? EN[k]) ?? k;
export const hasDict = (lang: Lang) => lang === "en" || Boolean(D[lang]);
const PROMPTS: Record<string, { native: string; yes: string; no: string }> = {};
/** Registers a language Gemini detected: its name, its switch question and (optionally) translated UI strings. */
export function registerLanguage(code: string, name: { en: string; native: string }, prompt?: { native: string; yes: string; no: string }, dict?: Dict) {
  if (!LANG_NAME[code]) LANG_NAME[code] = name;
  if (prompt && !PROMPTS[code]) PROMPTS[code] = prompt;
  if (dict) D[code] = dict;
}

/** The bilingual "switch language?" question. */
export function switchPrompt(lang: Lang) {
  const q: Record<string, [string, string, string]> = {
    es: ["Parece que hablas español. ¿Cambiamos Pebble a español?", "Sí", "No"],
    zh: ["看起来你说中文。要把 Pebble 切换成中文吗？", "好的", "不用"],
    ko: ["한국어를 쓰시는 것 같아요. Pebble를 한국어로 바꿀까요?", "네", "아니요"],
  };
  if (lang === "en") return null;
  const name = LANG_NAME[lang]?.en || lang;
  const en = `Looks like you speak ${name}. Switch Pebble to ${name}?`;
  if (PROMPTS[lang]) return { en, ...PROMPTS[lang] };
  if (q[lang]) return { en, native: q[lang][0], yes: q[lang][1], no: q[lang][2] };
  return { en, native: en, yes: "Yes", no: "No" };
}

/** One-sentence spoken recap in the client's language. */
export function recapIn(lang: Lang, c: Criteria, english: string): string {
  if (lang === "en") return english;
  const vibe = c.vibes[0];
  if (lang === "es") {
    const v = vibe === "cozy" ? "acogedor" : vibe === "artsy" ? "artístico" : vibe === "bright" ? "luminoso" : vibe === "quiet" ? "tranquilo" : "";
    const beds = c.bedsMin ? `de ${c.bedsMin} habitaciones` : "";
    return `Entendido: un alquiler ${beds} ${v}${c.budgetMax ? `, por menos de $${c.budgetMax.toLocaleString("en-US")}` : ""}${c.walkable ? ", cerca del centro" : ""}${c.pets ? ", con tu perro" : ""}. Aquí tienes mis tres favoritos.`.replace(/\s+/g, " ").replace(" ,", ",");
  }
  if (lang === "zh") {
    const v = vibe === "cozy" ? "温馨" : vibe === "artsy" ? "有艺术感" : vibe === "bright" ? "明亮" : vibe === "quiet" ? "安静" : "";
    return `明白了：${c.bedsMin ? `${c.bedsMin}室` : ""}${v ? `、${v}` : ""}${c.budgetMax ? `、$${c.budgetMax.toLocaleString("en-US")}以内` : ""}${c.walkable ? "、步行到校园" : ""}${c.pets ? "、可以养狗" : ""}。这是我最推荐的三套。`;
  }
  const v = vibe === "cozy" ? "아늑한" : vibe === "artsy" ? "감성적인" : vibe === "bright" ? "밝은" : vibe === "quiet" ? "조용한" : "";
  return `알겠어요: ${c.budgetMax ? `$${c.budgetMax.toLocaleString("en-US")} 이하, ` : ""}${c.walkable ? "캠퍼스 근처, " : ""}${c.pets ? "강아지 가능한 " : ""}${v} ${c.bedsMin ? `방 ${c.bedsMin}개` : ""} 집. 추천 세 곳이에요.`.replace(/\s+/g, " ");
}

const SPEECH: Record<string, string> = { en: "en-US", es: "es-US", zh: "zh-CN", ko: "ko-KR" };
export const speechLang = (lang: Lang) => SPEECH[lang] || lang;
