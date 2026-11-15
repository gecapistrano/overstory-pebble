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
    sayMore: "Di o escribe más…", interested: "¡Me interesa!", interestedSub: "Un agente real lo verifica", tour3d: "Tour 3D", inside: "Adentro", outside: "Afuera", outsideDrone: "Exterior 3D · dron · arrastra para girar", outsideAerial: "Vista aérea del exterior", photoNotHome: "Esa foto no parece una casa. Compárteme una foto de una habitación o casa que te guste, o descríbela.", photoUnread: "No pude revisar tu foto ahora. Cuéntame qué te gusta de ella y busco casas parecidas.", whyFits: "Por qué te queda",
    walk: "min a pie al centro", drive: "min en auto al centro", petsOk: "Mascotas OK", noPets: "Sin mascotas",
    sheetTitle: "Un agente real sigue desde aquí", sheetBody: "Un agente con licencia confirma que está disponible, con el precio correcto y que es para ti. Luego te llama.", send: "Enviar a un agente",
    yourHome: "Tu hogar", sent: "Enviado a un agente con licencia", verifying: "Un agente está verificando este hogar", verifiedBy: "Verificado por",
    book: "Reserva una visita", apply: "Aplicar", startApp: "Iniciar solicitud", movein: "Mudanza", welcome: "Contrato firmado. Bienvenida a casa.",
    chips: "Más barato|Más cerca del centro|Acepta mascotas|Más luz|Calle tranquila",
    resumeSearch: "Continúa tu búsqueda", photoSearch: "Búsqueda basada en tu foto",
    searchTab: "Buscar", interestedTab: "Me interesan", interestedEmpty: "Aún no has mostrado interés en ninguna casa.", interestedSignIn: "Inicia sesión para guardar las casas que te interesan.", signIn: "Iniciar sesión",
    interestActiveTab: "Activas", interestCancelledTab: "Canceladas", interestCancelledEmpty: "Aún no hay solicitudes canceladas.",
    interestStageSaved: "Interés", interestStageValidated: "Validada", interestStageTour: "Visita", interestStageCompleted: "Trato cerrado",
    interestNotSent: "Aún no se ha enviado a un agente.", interestValidating: "El agente está revisando esta propiedad.", interestNoTour: "Propiedad validada. Aún no hay visita programada.",
    interestTourBooked: "Visita programada.", interestApplication: "Solicitud en curso.", interestComplete: "Trato completado.", interestCancelled: "Solicitud cancelada.", interestOpenProgress: "Ver seguimiento",
    interestTourDeclined: "Sin visita por ahora.", interestTimesSent: "Horarios enviados; esperando tu respuesta.", tourOfferWaiting: "El agente enviará horarios disponibles cuando la propiedad esté validada.", tourOfferPrompt: "Elige un horario o indica que no quieres una visita.", declineTour: "No quiero una visita", cancelTour: "Cancelar visita", cancelDeal: "Cancelar trato", tourDeclined: "Dijiste que no querías una visita por ahora.", requestCancelledBody: "El agente inmobiliario canceló esta solicitud. Ponte en contacto con él si necesitas más información.", requestCancelledByYouBody: "Cancelaste esta solicitud.",
  },
  zh: {
    tagline1: "说出你想要的房子。", tagline2: "找到你的家。", tapTalk: "点一下，直接说。", typeInstead: "改为输入", showPhoto: "上传照片",
    listening: "正在听…", goAhead: "请说，我在听。", pauseHint: "你停顿时我就回答", finding: "正在寻找合适的家…",
    sayMore: "继续说或输入…", interested: "我感兴趣！", interestedSub: "由真人经纪人核实", tour3d: "3D 看房", inside: "室内", outside: "外观", outsideDrone: "无人机 3D 外观 · 拖动旋转", outsideAerial: "外观航拍", photoNotHome: "这张照片看起来不是房子。请分享一张你喜欢的房间或房子的照片，或者描述一下。", photoUnread: "我现在没法查看这张照片。告诉我你喜欢它的哪些地方，我来找类似的房子。", whyFits: "为什么适合你",
    walk: "分钟步行到市中心", drive: "分钟车程到市中心", petsOk: "可养宠物", noPets: "不可养宠物",
    sheetTitle: "接下来由真人经纪人跟进", sheetBody: "持证经纪人会确认房源可用、价格准确、适合你，然后给你打电话。", send: "发送给经纪人",
    yourHome: "你的家", sent: "已发送给持证经纪人", verifying: "经纪人正在核实这套房子", verifiedBy: "已核实：",
    book: "预约看房", apply: "申请", startApp: "开始申请", movein: "入住", welcome: "租约已签。欢迎回家。",
    chips: "便宜一点|离市中心更近|可养宠物|更明亮|安静街道",
    resumeSearch: "继续上次的搜索", photoSearch: "根据你的照片搜索",
    searchTab: "搜索", interestedTab: "感兴趣", interestedEmpty: "你还没有标记感兴趣的房子。", interestedSignIn: "登录后保存你感兴趣的房子。", signIn: "登录",
    interestActiveTab: "进行中", interestCancelledTab: "已取消", interestCancelledEmpty: "目前没有已取消的请求。",
    interestStageSaved: "已感兴趣", interestStageValidated: "已核实", interestStageTour: "已预约看房", interestStageCompleted: "交易完成",
    interestNotSent: "尚未发送给经纪人。", interestValidating: "经纪人正在核实房源。", interestNoTour: "房源已核实，尚未预约看房。",
    interestTourBooked: "看房已预约。", interestApplication: "申请处理中。", interestComplete: "交易已完成。", interestCancelled: "请求已取消。", interestOpenProgress: "查看进度",
    interestTourDeclined: "暂不看房。", interestTimesSent: "看房时间已发送，等待你的回复。", tourOfferWaiting: "房源核实后，经纪人会发送可看房时间。", tourOfferPrompt: "请选择时间，或告知暂不看房。", declineTour: "暂不看房", cancelTour: "取消看房", cancelDeal: "取消交易", tourDeclined: "你选择了暂不看房。", requestCancelledBody: "房产经纪人已取消此请求。如需了解详情，请联系经纪人。", requestCancelledByYouBody: "你已取消此请求。",
  },
  ko: {
    tagline1: "원하는 집을 말하세요.", tagline2: "당신의 집을 찾으세요.", tapTalk: "탭하고 말하세요.", typeInstead: "입력하기", showPhoto: "사진 보여주기",
    listening: "듣고 있어요…", goAhead: "말씀하세요, 듣고 있어요.", pauseHint: "말을 멈추면 답할게요", finding: "딱 맞는 집을 찾는 중…",
    sayMore: "더 말하거나 입력하세요…", interested: "관심 있어요!", interestedSub: "실제 중개사가 확인해요", tour3d: "3D 투어", inside: "실내", outside: "외관", outsideDrone: "드론 3D 외관 · 드래그해서 회전", outsideAerial: "외관 항공 사진", photoNotHome: "이 사진은 집이 아닌 것 같아요. 마음에 드는 방이나 집 사진을 보내 주시거나 설명해 주세요.", photoUnread: "지금은 사진을 확인할 수 없었어요. 사진의 어떤 점이 좋은지 말씀해 주시면 비슷한 집을 찾아볼게요.", whyFits: "잘 맞는 이유",
    walk: "분 도보 (다운타운)", drive: "분 차량 (다운타운)", petsOk: "반려동물 가능", noPets: "반려동물 불가",
    sheetTitle: "이제 실제 중개사가 도와드려요", sheetBody: "공인 중개사가 매물 여부, 가격, 적합성을 확인한 뒤 전화드려요.", send: "중개사에게 보내기",
    yourHome: "나의 집", sent: "공인 중개사에게 전송됨", verifying: "중개사가 이 집을 확인 중", verifiedBy: "확인 완료:",
    book: "방문 예약", apply: "신청", startApp: "신청 시작", movein: "입주", welcome: "계약 완료. 집에 오신 걸 환영해요.",
    chips: "더 저렴하게|다운타운 더 가까이|반려동물 가능|더 밝게|조용한 거리",
    resumeSearch: "검색 이어하기", photoSearch: "사진으로 검색",
    searchTab: "검색", interestedTab: "관심 있어요", interestedEmpty: "아직 관심 있는 집을 표시하지 않았어요.", interestedSignIn: "로그인하여 관심 있는 집을 저장하세요.", signIn: "로그인",
    interestActiveTab: "진행 중", interestCancelledTab: "취소됨", interestCancelledEmpty: "취소된 요청이 없어요.",
    interestStageSaved: "관심 표시", interestStageValidated: "확인 완료", interestStageTour: "방문 예약", interestStageCompleted: "거래 완료",
    interestNotSent: "아직 중개사에게 요청을 보내지 않았어요.", interestValidating: "중개사가 매물을 확인하고 있어요.", interestNoTour: "매물이 확인됐어요. 아직 방문 일정은 없어요.",
    interestTourBooked: "방문이 예약됐어요.", interestApplication: "신청 진행 중.", interestComplete: "거래가 완료됐어요.", interestCancelled: "요청이 취소됐어요.", interestOpenProgress: "진행 상황 보기",
    interestTourDeclined: "방문은 아직 원하지 않아요.", interestTimesSent: "방문 시간이 전송됐어요. 답변을 기다리고 있어요.", tourOfferWaiting: "매물이 확인되면 중개사가 방문 가능한 시간을 보내드려요.", tourOfferPrompt: "가능한 시간을 선택하거나 방문하지 않겠다고 알려주세요.", declineTour: "방문하지 않을게요", cancelTour: "방문 취소", cancelDeal: "거래 취소", tourDeclined: "지금은 방문을 원하지 않는다고 답했어요.", requestCancelledBody: "부동산 중개사가 이 요청을 취소했어요. 자세한 내용은 중개사에게 문의하세요.", requestCancelledByYouBody: "이 요청을 취소했어요.",
  },
};
export const EN: Dict = {
  tagline1: "Say the house.", tagline2: "Find your home.", tapTalk: "Tap and just talk.", typeInstead: "Type instead", showPhoto: "Show a photo",
  listening: "Listening…", goAhead: "Go ahead, I'm listening.", pauseHint: "I'll answer when you pause", finding: "Finding homes that feel right…",
  sayMore: "Say or type more…", interested: "Interested!", interestedSub: "A Real Estate Agent verifies it", tour3d: "3D tour", inside: "Inside", outside: "Outside", outsideDrone: "Drone 3D exterior · drag to orbit", outsideAerial: "Aerial view of the outside", photoNotHome: "That photo doesn't look like a home. Share a photo of a room or house you love, or describe it.", photoUnread: "I couldn't check your photo just now. Tell me what you love about it and I'll find homes like it.", whyFits: "Why it fits you",
  walk: "min walk to downtown", drive: "min drive to downtown", petsOk: "Pets OK", noPets: "No pets",
  sheetTitle: "A Real Estate Agent takes it from here", sheetBody: "A licensed Real Estate Agent checks that this home is available, priced right, and right for you — then calls you.", send: "Send to a Real Estate Agent",
  yourHome: "Your home", sent: "Sent to a licensed Real Estate Agent", verifying: "A Real Estate Agent is verifying this home", verifiedBy: "Verified by",
  book: "Book a tour", apply: "Apply", startApp: "Start application", movein: "Move in", welcome: "Lease signed. Welcome home.",
  chips: "Cheaper|Closer to downtown|Pet friendly|More light|Quieter street",
  resumeSearch: "Pick up where you left off", photoSearch: "Search based on your photo",
  searchTab: "Search", interestedTab: "Interested", interestedEmpty: "You haven't marked any homes as interesting yet.", interestedSignIn: "Log in to keep track of homes you’re interested in.", signIn: "Log in",
  interestActiveTab: "Active", interestCancelledTab: "Cancelled", interestCancelledEmpty: "No cancelled requests yet.",
  interestStageSaved: "Interested", interestStageValidated: "Validated", interestStageTour: "Tour scheduled", interestStageCompleted: "Deal complete",
  interestNotSent: "Not sent to an agent yet.", interestValidating: "A Real Estate Agent is validating this listing.", interestNoTour: "Listing validated. No tour is scheduled yet.",
  interestTourBooked: "Tour scheduled.", interestApplication: "Application in progress.", interestComplete: "Deal completed successfully.", interestCancelled: "Request cancelled.", interestOpenProgress: "View progress",
  interestTourDeclined: "No tour for now.", interestTimesSent: "Tour times sent; waiting for your response.", tourOfferWaiting: "The agent will send available tour times after validating the listing.", tourOfferPrompt: "Choose a time or let the agent know you don't want a tour.", declineTour: "No tour", cancelTour: "Cancel tour", cancelDeal: "Cancel deal", tourDeclined: "You said no tour for now.", requestCancelledBody: "Your Real Estate Agent cancelled this request. Contact them if you need more information.", requestCancelledByYouBody: "You cancelled this request.",
  talk: "Talk", photo: "Photo", type: "Type", photoSub: "Show me a home you love, I'll find ones like it", back: "Back", map: "Map", homes: "Homes",
  tourTitle: "Walk through it in 3D", tourBody: "Tap to look around every room", talkInstead: "Talk instead", findHome: "Find my home",
  describe: "Describe the place you want…", example: "Try an example", emptyResults: "Nothing matched yet. Try saying it another way.",
  aiPowered: "AI-powered", introBody: "Say what you're looking for in your own words and language, or show a photo of a home you love. AI reads it, searches real listings by feel and fit, and a licensed Real Estate Agent checks the match.",
  ask: "Ask", uploadPhoto: "upload a photo of a home you love", orUpload: "Or", dropHint: "(or drop it here). Words in the box, like “under $2,000”, narrow the matches.", dropHere: "Drop a photo of a home you love",
  justTalk: "Just talk instead →", examples: "Bright 1-bedroom in the Heights under $1,600, I have a dog|Family home near good schools in Los Angeles, 3 beds|Quiet modern condo close to downtown Houston, walkable",
  emptyAsk: "Describe a home or add a photo first.",
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
