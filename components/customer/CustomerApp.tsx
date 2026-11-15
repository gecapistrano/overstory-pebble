"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Criteria, Lead, Listing } from "@/lib/types";
import { listingsSync, getListing, analyzePhotos } from "@/lib/adapters";
import { emptyCriteria, parseRequest, CHIPS } from "@/lib/parse";
import { topThree } from "@/lib/search";
import { spokenRecap, price, commute, bedsBaths, vibeTag, agentById } from "@/lib/recap";
import { listen, speak, speechSupported } from "@/lib/speech";
import { detectLanguage, toEnglish, t, switchPrompt, recapIn, speechLang, LANG_NAME, EN, hasDict, registerLanguage, type Lang } from "@/lib/i18n";
import { aiParse, aiRecap, aiTranslate } from "@/lib/ai";
import { bookTour, createLead, setLeadRecap, submitApplication, useStore } from "@/lib/store";
import HomeArt from "@/components/HomeArt";
import MapView from "@/components/MapView";
import Tour3D from "@/components/Tour3D";
import MatterportTour from "@/components/MatterportTour";
import CostarBadge from "@/components/CostarBadge";
import { Avatar, Icon, Logo } from "@/components/ui";

type View = "home" | "listening" | "thinking" | "results" | "detail" | "tour" | "status";

const LangCtx = createContext<Lang>("en");
const useT = () => { const l = useContext(LangCtx); return (k: string) => t(l, k); };

const SAMPLE = "I'm starting a job in downtown Houston in January, looking for a bright 2-bedroom in the Heights under $2,000, close to downtown, I have a dog";

export default function CustomerApp() {
  const [view, setView] = useState<View>("home");
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [criteria, setCriteria] = useState<Criteria>(emptyCriteria());
  const [results, setResults] = useState<Listing[]>([]);
  const [reply, setReply] = useState("");
  const [replyKey, setReplyKey] = useState(0);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [active, setActive] = useState(0);
  const [detail, setDetail] = useState<Listing | null>(null);
  const [sheet, setSheet] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [typing, setTyping] = useState("");
  const [typeMode, setTypeMode] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [askLang, setAskLang] = useState<Lang | null>(null);
  const declined = useRef<Set<Lang>>(new Set());
  const langRef = useRef(lang);
  langRef.current = lang;
  const [replyEn, setReplyEn] = useState("");
  const [replyNative, setReplyNative] = useState<{ lang: Lang; text: string }>({ lang: "en", text: "" });
  const [why, setWhy] = useState<Record<string, { en: string; native: string }>>({});
  const stopRef = useRef<(() => void) | null>(null);
  const critRef = useRef(criteria);
  critRef.current = criteria;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  const process = useCallback(async (text: string, image?: string | File) => {
    if (!text.trim() && !image) {
      setView(results.length ? "results" : "home");
      return;
    }
    setView("thinking");
    const prev = critRef.current;
    const started = Date.now();
    // 1) the photo (if any) goes through the vibe model first
    let imageTags: string[] = [];
    if (image) {
      const tags = await analyzePhotos([image]).catch(() => null);
      if (tags) imageTags = [...tags.ambience, ...tags.style];
    }
    // 2) Gemini: understand (any language) -> search -> re-rank with reasons
    const ai = await aiParse(text || "(the client shared a photo of a house they like)", prev, imageTags);
    let c: Criteria, top: Listing[], english: string, native: string, spoken: Lang;
    if (ai && ai.picks?.length) {
      c = { ...ai.criteria, vibes: ai.criteria.vibes || [], neighborhoods: ai.criteria.neighborhoods || [] };
      top = ai.picks.map((p) => getListing(p.id)).filter(Boolean) as Listing[];
      setWhy(Object.fromEntries(ai.picks.map((p) => [p.id, { en: p.why, native: p.whyNative || p.why }])));
      english = ai.replyEnglish;
      native = ai.replyNative || ai.replyEnglish;
      spoken = ai.language || "en";
      if (spoken !== "en") registerLanguage(spoken, { en: ai.languageName, native: ai.languageNative }, ai.switchQuestion);
      if (ai.englishText) text = text ? `${text}` : ai.englishText;
    } else {
      // offline fallback: on-device rules
      spoken = detectLanguage(text || " ");
      c = parseRequest(toEnglish(text, spoken), prev);
      if (imageTags.length) {
        const vibeWords = imageTags.map((v) => (v === "creative" ? "artsy" : v === "airy" ? "bright" : v)).filter((v) => ["cozy", "artsy", "bright", "quiet", "minimalist", "gothic", "scandinavian", "craftsman", "victorian", "industrial"].includes(v));
        c = { ...c, vibes: [...new Set([...vibeWords, ...c.vibes])] };
      }
      top = topThree(listingsSync(), c);
      setWhy({});
      english = spokenRecap(c, prev.vibes.length || prev.budgetMax ? prev : undefined);
      native = recapIn(spoken, c, english);
    }
    if (spoken !== "en" && spoken !== langRef.current && !declined.current.has(spoken)) setAskLang(spoken);
    await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - started))));
    setCriteria(c);
    setResults(top);
    setReplyEn(english);
    setReplyNative({ lang: spoken, text: native });
    const shown = langRef.current === "en" ? english : langRef.current === spoken ? native : recapIn(langRef.current, c, english);
    setReply(shown);
    setReplyKey((k) => k + 1);
    setActive(0);
    setTranscript((t) => [...t, text || "(photo)"]);
    setPhoto(null);
    setView("results");
    speak(shown, speechLang(langRef.current));
  }, [results.length]);

  const startListening = useCallback(() => {
    setPartial("");
    setView("listening");
    if (!speechSupported()) {
      setTypeMode(true);
      return;
    }
    const h = listen({ lang: speechLang(langRef.current), onPartial: setPartial, onLevel: setLevel, onDone: (t) => process(t) });
    stopRef.current = h.stop;
  }, [process]);

  /** Simulated speech stream — same pipeline, used for demos/recordings and browsers without speech. */
  const simulate = useCallback((text: string, msPerWord = 230) => {
    setPartial("");
    setView("listening");
    const words = text.split(" ");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setPartial(words.slice(0, i).join(" "));
      setLevel(0.4 + Math.random() * 0.6);
      if (i >= words.length) {
        clearInterval(id);
        setTimeout(() => process(text), 1100);
      }
    }, msPerWord);
  }, [process]);

  const allLeads = useStore((s) => s.leads);
  const lead = leadId ? allLeads.find((l) => l.id === leadId) : undefined;

  // demo API for scripted recordings: window.pebble.*
  useEffect(() => {
    const w = window as unknown as { pebble: Record<string, unknown> };
    w.pebble = {
      say: (t: string, ms?: number) => simulate(t, ms),
      lang: (l: Lang) => switchLang(l),
      reset: () => { setCriteria(emptyCriteria()); setResults([]); setTranscript([]); setView("home"); },
      run: (t: string) => process(t),
      open: (i: number) => { setDetail(results[i] || topThree(listingsSync(), critRef.current)[i]); setView("detail"); },
      openId: (id: string) => { setDetail(getListing(id) || null); setView("detail"); },
      tour: () => setView("tour"),
      talk: () => setSheet(true),
      send: () => sendLead(),
      map: (v: boolean) => setShowMap(v),
      slide: (i: number) => setActive(i),
      view: (v: View) => setView(v),
      status: (id: string) => { setLeadId(id); setView("status"); },
    };
  });

  const switchLang = async (l: Lang) => {
    setAskLang(null);
    // languages without a built-in dictionary: Gemini translates the interface on the spot
    if (!hasDict(l)) {
      const strings = await aiTranslate(LANG_NAME[l]?.en || l, EN);
      if (strings) registerLanguage(l, LANG_NAME[l] || { en: l, native: l }, undefined, strings);
    }
    setLang(l);
    langRef.current = l;
    setReply(replyNative.lang === l ? replyNative.text : recapIn(l, critRef.current, replyEn));
    setReplyKey((k) => k + 1);
  };

  const sendLead = () => {
    const chosen = detail || results[0];
    if (!chosen) return;
    const id = createLead({ language: lang === "en" ? (replyNative.lang !== "en" ? LANG_NAME[replyNative.lang]?.en : undefined) : LANG_NAME[lang]?.en || lang, clientName: lang === "es" ? "Lucía Morales" : lang === "zh" ? "Wei Zhang" : lang === "ko" ? "Ji-woo Park" : "Sarah Kim", transcript: transcriptRef.current, criteria: critRef.current, suggestions: results, chosen });
    setLeadId(id);
    setSheet(false);
    setView("status");
    // Gemini writes the agent's recap in English from the client's own words
    aiRecap(critRef.current, transcriptRef.current, chosen, lang === "en" ? undefined : LANG_NAME[lang]?.en).then((r) => r && setLeadRecap(id, r));
  };

  return (
    <LangCtx.Provider value={lang}>
    <div className="relative h-full w-full bg-white text-ink overflow-hidden">
      {view === "home" && <Home onMic={startListening} onType={() => { setTypeMode(true); setView("listening"); }} onPhoto={(f) => process("", f)} />}
      {view === "listening" && (
        <Listening
          partial={partial}
          level={level}
          typeMode={typeMode}
          onStop={() => (stopRef.current ? stopRef.current() : process(partial))}
          onSubmit={(t) => { setTypeMode(false); process(t); }}
          onExample={() => { setTypeMode(false); simulate(SAMPLE); }}
          onClose={() => { setTypeMode(false); setView(results.length ? "results" : "home"); }}
        />
      )}
      {view === "thinking" && <Thinking text={partial || transcript[transcript.length - 1] || ""} />}
      {view === "results" && (
        <Results
          reply={reply}
          replyKey={replyKey}
          results={results}
          criteria={criteria}
          showMap={showMap}
          setShowMap={setShowMap}
          active={active}
          setActive={setActive}
          onOpen={(l) => { setDetail(l); setView("detail"); }}
          onChip={(c) => process(c)}
          onMic={startListening}
          typing={typing}
          setTyping={setTyping}
          onSend={() => { const t = typing; setTyping(""); process(t, photo || undefined); }}
          photo={photo}
          setPhoto={setPhoto}
        />
      )}
      {view === "detail" && detail && <Detail l={detail} criteria={criteria} why={why[detail.id] ? (lang === "en" ? why[detail.id].en : why[detail.id].native) : ""} onBack={() => setView("results")} onTour={() => setView("tour")} onTalk={() => setSheet(true)} />}
      {view === "tour" && detail && (
        <div className="absolute inset-0 bg-blush">
          {detail.matterportId ? <MatterportTour modelId={detail.matterportId} title={detail.title} className="absolute inset-0" /> : <Tour3D listing={detail} className="absolute inset-0" />}
          <div className="absolute top-12 left-4 right-4 flex items-center justify-between pointer-events-none">
            <button onClick={() => setView("detail")} className="pointer-events-auto w-10 h-10 rounded-full bg-white/90 shadow-card flex items-center justify-center"><Icon name="back" /></button>
            <div className="px-3 py-1.5 rounded-full bg-white/90 shadow-card text-xs font-medium">{detail.matterportId ? "Matterport 3D scan · via CoStar" : "Living room · drag to look around"}</div>
          </div>
          <div className="absolute bottom-8 left-4 right-4">
            <button onClick={() => setSheet(true)} className="w-full h-14 rounded-full bg-coral text-white font-semibold shadow-card">{t(lang, "interested")}</button>
          </div>
        </div>
      )}
      {view === "status" && lead && <Status lead={lead} onBack={() => setView("results")} />}
      {sheet && detail && <ShareSheet l={detail} onClose={() => setSheet(false)} onSend={sendLead} />}
      {askLang && view === "results" && (
        <LangPrompt lang={askLang} onYes={() => switchLang(askLang)} onNo={() => { declined.current.add(askLang); setAskLang(null); }} />
      )}
    </div>
    </LangCtx.Provider>
  );
}

/* ---------------- Screens ---------------- */

function Home({ onMic, onType, onPhoto }: { onMic: () => void; onType: () => void; onPhoto: (f: File) => void }) {
  const tr = useT();
  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-white to-blush">
      <div className="pt-14 px-6"><Logo className="text-[17px]" /></div>
      <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-6">
        <h1 className="text-[30px] leading-[1.12] font-bold tracking-tight text-center rise">{tr("tagline1")}<br />{tr("tagline2")}</h1>
        <button onClick={onMic} aria-label="Tap and talk" className="relative mt-16 w-[132px] h-[132px] rounded-full bg-coral text-white flex items-center justify-center shadow-[0_18px_50px_rgba(229,50,45,.45)] active:scale-95 transition">
          <span className="ring absolute inset-0 rounded-full bg-coral" />
          <span className="ring ring2 absolute inset-0 rounded-full bg-coral" />
          <span className="ring ring3 absolute inset-0 rounded-full bg-coral" />
          <Icon name="mic" className="w-12 h-12 relative" stroke={2.2} />
        </button>
        <p className="mt-10 text-mute text-[15px]">{tr("tapTalk")}</p>
      </div>
      <div className="pb-10 flex justify-center gap-6 text-mute">
        <button onClick={onType} className="text-sm underline-offset-4 hover:underline">{tr("typeInstead")}</button>
        <label className="text-sm cursor-pointer flex items-center gap-1.5"><Icon name="image" className="w-4 h-4" />{tr("showPhoto")}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} /></label>
      </div>
    </div>
  );
}

function Waveform({ level, n = 28 }: { level: number; n?: number }) {
  return (
    <div className="flex items-center justify-center gap-[5px] h-16">
      {[...Array(n)].map((_, i) => {
        const env = Math.sin((i / (n - 1)) * Math.PI);
        return <span key={i} className="bar w-[5px] rounded-full bg-coral" style={{ height: `${18 + env * 46 * (0.5 + level)}px`, animationDelay: `${(i * 73) % 900}ms`, animationDuration: `${700 + ((i * 131) % 600)}ms` }} />;
      })}
    </div>
  );
}

function Listening({ partial, level, typeMode, onStop, onSubmit, onExample, onClose }: { partial: string; level: number; typeMode: boolean; onStop: () => void; onSubmit: (t: string) => void; onExample: () => void; onClose: () => void }) {
  const tr = useT();
  const [t, setT] = useState("");
  const words = partial.split(" ").filter(Boolean);
  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <div className="pt-14 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium"><span className="w-2 h-2 rounded-full bg-coral animate-pulse" />{typeMode ? "Tell me about it" : tr("listening")}</div>
        <button onClick={onClose} className="text-mute"><Icon name="x" /></button>
      </div>
      {typeMode ? (
        <div className="flex-1 px-6 pt-10 flex flex-col">
          <textarea autoFocus value={t} onChange={(e) => setT(e.target.value)} placeholder="Describe the place you want…" className="w-full h-48 text-[22px] leading-snug font-medium outline-none resize-none placeholder:text-[#d7c9cb]" />
          <button onClick={onExample} className="self-start text-sm text-coral mt-2">Try an example</button>
          <div className="mt-auto pb-10"><button onClick={() => onSubmit(t)} className="w-full h-14 rounded-full bg-coral text-white font-semibold">Find my home</button></div>
        </div>
      ) : (
        <>
          <div className="flex-1 px-7 pt-12">
            <p className="text-[26px] leading-[1.25] font-semibold tracking-tight">
              {words.map((w, i) => <span key={i} className="word mr-[0.25em]">{w}</span>)}
              {!words.length && <span className="text-[#d7c9cb]">{tr("goAhead")}</span>}
            </p>
          </div>
          <div className="pb-12 flex flex-col items-center gap-6">
            <Waveform level={level} />
            <button onClick={onStop} className="w-[76px] h-[76px] rounded-full bg-coral flex items-center justify-center shadow-[0_12px_30px_rgba(229,50,45,.4)]"><span className="w-6 h-6 rounded-md bg-white" /></button>
            <p className="text-mute text-sm -mt-2">{tr("pauseHint")}</p>
          </div>
        </>
      )}
    </div>
  );
}

function Thinking({ text }: { text: string }) {
  const tr = useT();
  return (
    <div className="absolute inset-0 flex flex-col bg-white px-7 pt-14">
      <Logo className="text-[17px]" />
      <p className="mt-12 text-[22px] leading-snug font-semibold text-[#c9b9bb]">{text}</p>
      <div className="mt-10 flex items-center gap-3 text-mute">
        <div className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="w-2.5 h-2.5 rounded-full bg-coral animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}</div>
        <span className="text-[15px]">{tr("finding")}</span>
      </div>
      <div className="mt-10 space-y-3">{[0, 1].map((i) => <div key={i} className="h-40 rounded-3xl shimmer" />)}</div>
    </div>
  );
}

function Card({ l, c, onOpen, wide = false }: { l: Listing; c: Criteria; onOpen: () => void; wide?: boolean }) {
  const tr = useT();
  return (
    <button onClick={onOpen} className={`text-left shrink-0 snap-center ${wide ? "w-full" : "w-[300px]"} rounded-[28px] bg-white shadow-card overflow-hidden`}>
      <div className="relative h-[200px] bg-petal">
        <HomeArt listing={l} className="w-full h-full" />
        <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/95 text-[12px] font-semibold text-coral">{vibeTag(l, c)}</span>
        {l.matterportId && <span className="absolute top-3 right-3 px-2 py-1 rounded-full bg-ink/80 text-white text-[11px] font-semibold flex items-center gap-1"><Icon name="cube" className="w-3.5 h-3.5" />3D</span>}
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between"><span className="text-[22px] font-bold tracking-tight">{price(l)}</span><span className="text-[13px] text-mute">{bedsBaths(l)}</span></div>
        <div className="mt-0.5 text-[15px] font-medium truncate">{l.title}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[13px] text-mute"><Icon name="walk" className="w-4 h-4" />{l.minutesToCampus} {tr(l.commuteMode === "walk" ? "walk" : "drive")}</div>
      </div>
    </button>
  );
}

function Results(p: {
  reply: string; replyKey: number; results: Listing[]; criteria: Criteria; showMap: boolean; setShowMap: (v: boolean) => void; active: number; setActive: (i: number) => void;
  onOpen: (l: Listing) => void; onChip: (c: string) => void; onMic: () => void; typing: string; setTyping: (s: string) => void; onSend: () => void; photo: string | null; setPhoto: (s: string | null) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    el.scrollTo({ left: p.active * 312, behavior: "smooth" });
  }, [p.active]);
  const tr = useT();
  const words = p.reply.split(" ");
  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <div className="pt-14 px-6 flex items-center justify-between">
        <Logo className="text-[17px]" />
        <div className="flex p-1 rounded-full bg-blush">
          <button onClick={() => p.setShowMap(false)} className={`w-9 h-8 rounded-full flex items-center justify-center ${!p.showMap ? "bg-white shadow" : "text-mute"}`}><Icon name="list" className="w-4 h-4" /></button>
          <button onClick={() => p.setShowMap(true)} className={`w-9 h-8 rounded-full flex items-center justify-center ${p.showMap ? "bg-white shadow" : "text-mute"}`}><Icon name="map" className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="px-6 pt-6 pb-5" key={p.replyKey}>
        <div className="flex items-center gap-2 text-coral text-[13px] font-semibold mb-2"><Icon name="speaker" className="w-4 h-4" />Pebble</div>
        <p className="text-[21px] leading-[1.28] font-semibold tracking-tight">{words.map((w, i) => <span key={i} className="word mr-[0.24em]" style={{ animationDelay: `${i * 45}ms` }}>{w}</span>)}</p>
      </div>
      {p.showMap ? (
        <div className="flex-1 min-h-0 flex flex-col px-4 gap-3 fadein">
          <MapView listings={p.results} selected={p.results[p.active]?.id} onSelect={(id) => p.setActive(p.results.findIndex((r) => r.id === id))} className="flex-1 rounded-[28px] overflow-hidden" />
          {p.results[p.active] && (
            <button onClick={() => p.onOpen(p.results[p.active])} className="flex gap-3 items-center p-2 rounded-3xl bg-white shadow-card text-left">
              <div className="w-20 h-16 rounded-2xl overflow-hidden"><HomeArt listing={p.results[p.active]} className="w-full h-full" /></div>
              <div className="min-w-0"><div className="font-bold">{price(p.results[p.active])}</div><div className="text-sm truncate">{p.results[p.active].title}</div><div className="text-xs text-mute">{commute(p.results[p.active])}</div></div>
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div ref={rail} onScroll={(e) => { const i = Math.round(e.currentTarget.scrollLeft / 312); if (i !== p.active) p.setActive(i); }} className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar px-[45px] pb-6 pt-1">
            {p.results.map((l, i) => <div key={l.id} className="rise" style={{ animationDelay: `${200 + i * 90}ms` }}><Card l={l} c={p.criteria} onOpen={() => p.onOpen(l)} /></div>)}
          </div>
          <div className="flex justify-center gap-1.5">{p.results.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === p.active ? "w-5 bg-coral" : "w-1.5 bg-[#e8d5d6]"}`} />)}</div>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-6 pt-4 pb-3">
        {tr("chips").split("|").map((c, i) => <button key={c} onClick={() => p.onChip(CHIPS[i])} className="shrink-0 px-3.5 h-9 rounded-full border border-[#efdfe0] text-[13px] font-medium bg-white">{c}</button>)}
      </div>
      <div className="px-4 pb-8 flex items-center gap-2">
        <label className="w-11 h-11 rounded-full bg-blush flex items-center justify-center text-mute cursor-pointer shrink-0">
          {p.photo ? <img src={p.photo} alt="" className="w-11 h-11 rounded-full object-cover" /> : <Icon name="image" className="w-5 h-5" />}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) p.setPhoto(URL.createObjectURL(f)); }} />
        </label>
        <input value={p.typing} onChange={(e) => p.setTyping(e.target.value)} onKeyDown={(e) => e.key === "Enter" && p.onSend()} placeholder={tr("sayMore")} className="flex-1 h-11 rounded-full bg-blush px-4 text-[15px] outline-none placeholder:text-mute" />
        {p.typing || p.photo ? (
          <button onClick={p.onSend} className="w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center shrink-0"><Icon name="send" className="w-5 h-5" /></button>
        ) : (
          <button onClick={p.onMic} className="w-11 h-11 rounded-full bg-coral text-white flex items-center justify-center shrink-0"><Icon name="mic" className="w-5 h-5" /></button>
        )}
      </div>
    </div>
  );
}

function Detail({ l, criteria, why, onBack, onTour, onTalk }: { l: Listing; criteria: Criteria; why: string; onBack: () => void; onTour: () => void; onTalk: () => void }) {
  const tr = useT();
  const [g, setG] = useState(0);
  const variants = ["exterior", "living", "bedroom", "kitchen"] as const;
  const fits = [
    criteria.pets && l.petFriendly ? "Dogs welcome" : "",
    criteria.maxMinutes && l.minutesToCampus <= criteria.maxMinutes ? commute(l) : "",
    criteria.neighborhoods?.includes(l.neighborhood) ? `In ${l.neighborhood}` : "",
    criteria.budgetMax && l.price <= criteria.budgetMax ? `Within your budget` : "",
    criteria.moveIn && (l.availableFrom.includes("-08-") || l.availableFrom === "Now") ? `Ready for ${criteria.moveIn}` : "",
    ...criteria.vibes.slice(0, 2).filter((v) => vibeTag(l, { ...criteria, vibes: [v] }).toLowerCase() !== l.style).map((v) => (v === "bright" ? "Full of natural light" : `Feels ${v}`)),
  ].filter(Boolean);
  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <div className="relative h-[330px] shrink-0 bg-petal">
        <div className="flex h-full overflow-x-auto snap-x snap-mandatory no-scrollbar" onScroll={(e) => setG(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {variants.map((v) => <div key={v} className="w-full h-full shrink-0 snap-center"><HomeArt listing={l} variant={v} className="w-full h-full" /></div>)}
        </div>
        <button onClick={onBack} className="absolute top-12 left-4 w-10 h-10 rounded-full bg-white/95 shadow-card flex items-center justify-center"><Icon name="back" /></button>
        <button onClick={onTour} className="absolute bottom-4 right-4 h-9 px-3.5 rounded-full bg-white/95 shadow-card flex items-center gap-1.5 text-[13px] font-semibold"><Icon name="cube" className="w-4 h-4 text-coral" />{tr("tour3d")}</button>
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">{variants.map((_, i) => <span key={i} className={`h-1.5 rounded-full ${i === g ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />)}</div>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-5 pb-28">
        <div className="text-[26px] font-bold tracking-tight">{price(l)}</div>
        <h2 className="text-[19px] font-semibold mt-0.5">{l.title}</h2>
        <div className="text-[14px] text-mute mt-0.5">{l.neighborhood} · {l.address.split(",")[0]}</div>
        <CostarBadge l={l} className="mt-3" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[["bed", bedsBaths(l)], ["walk", `${l.minutesToCampus} min`], ["paw", l.petFriendly ? tr("petsOk") : tr("noPets")]].map(([i, t]) => (
            <div key={i} className="rounded-2xl bg-blush px-3 py-2.5"><Icon name={i} className="w-4 h-4 text-coral" /><div className="text-[13px] font-medium mt-1">{t}</div></div>
          ))}
        </div>
        {(fits.length > 0 || why) && (
          <div className="mt-5">
            <div className="text-[13px] font-semibold text-mute mb-2">{tr("whyFits")}</div>
            {why && <p className="text-[16px] font-semibold leading-snug mb-2.5 flex gap-1.5"><Icon name="spark" className="w-4 h-4 text-coral mt-0.5 shrink-0" />{why}</p>}
            <div className="flex flex-wrap gap-2">{fits.map((f) => <span key={f} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-coral-soft text-coral-deep text-[13px] font-medium"><Icon name="check" className="w-3.5 h-3.5" />{f}</span>)}</div>
          </div>
        )}
        <p className="mt-5 text-[15px] leading-relaxed text-[#4a4346]">{l.description}</p>
        {l.highlights.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{l.highlights.map((h) => <span key={h} className="px-2.5 py-1 rounded-full bg-blush text-[12px] text-[#5b5357]">{h}</span>)}</div>}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-white via-white to-white/0">
        <button onClick={onTalk} className="w-full h-14 rounded-full bg-coral text-white shadow-[0_10px_30px_rgba(229,50,45,.35)] flex flex-col items-center justify-center leading-tight"><span className="text-[16px] font-semibold flex items-center gap-1.5"><Icon name="spark" className="w-4 h-4" />{tr("interested")}</span><span className="text-[11px] opacity-85">{tr("interestedSub")}</span></button>
      </div>
    </div>
  );
}

function ShareSheet({ l, onClose, onSend }: { l: Listing; onClose: () => void; onSend: () => void }) {
  const tr = useT();
  const lang = useContext(LangCtx);
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/25 fadein" onClick={onClose}>
      <div className="rounded-t-[32px] bg-white p-6 pb-9 rise" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-[#e8d5d6] mx-auto mb-5" />
        <h3 className="text-[22px] font-bold tracking-tight">{tr("sheetTitle")}</h3>
        <p className="text-[15px] text-mute mt-1.5">{lang === "en" ? <>A licensed Real Estate Agent checks that <b className="text-ink font-semibold">{l.title}</b> is available, priced right, and right for you — then calls you.</> : tr("sheetBody")}</p>
        <div className="mt-5 space-y-2.5">
          <div className="h-12 rounded-2xl bg-blush px-4 flex items-center text-[15px]">{lang === "es" ? "Lucía Morales" : lang === "zh" ? "Wei Zhang" : lang === "ko" ? "Ji-woo Park" : "Sarah Kim"}</div>
          <div className="h-12 rounded-2xl bg-blush px-4 flex items-center text-[15px]">(609) 555-0142</div>
        </div>
        <button onClick={onSend} className="mt-5 w-full h-14 rounded-full bg-coral text-white font-semibold text-[16px]">{tr("send")}</button>
      </div>
    </div>
  );
}

function Status({ lead, onBack }: { lead: Lead; onBack: () => void }) {
  const tr = useT();
  const l = getListing(lead.chosenListingId)!;
  const agent = agentById(lead.agentId);
  const order = ["new", "verified", "touring", "application", "closed"];
  const at = order.indexOf(lead.status);
  const lastAgentMsg = [...lead.messages].reverse().find((m) => m.from === "agent");
  const firstAgentMsg = lead.messages.find((m) => m.from === "agent");
  const steps = [
    { t: tr("sent"), d: "Your wishes and this home, summarized." },
    { t: at >= 1 ? `${tr("verifiedBy")} ${agent.name}` : tr("verifying"), d: at >= 1 ? "Available, price confirmed, a good fit." : "Checking availability, price and fit…" },
    { t: lead.tourSlot ? `Tour booked · ${lead.tourSlot}` : tr("book"), d: at >= 2 ? "See you there!" : "Pick a time that works." },
    { t: at >= 3 ? "Application sent" : tr("apply"), d: at >= 3 ? `${agent.name.split(" ")[0]} is handling the paperwork.` : "One tap when you're ready." },
    { t: at >= 4 ? (l.kind === "buy" || l.kind === "land" ? "It's yours!" : tr("welcome")) : l.kind === "buy" || l.kind === "land" ? "Close" : tr("movein"), d: at >= 4 ? "Keys are waiting." : "" },
  ];
  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <div className="pt-14 px-6 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-blush flex items-center justify-center"><Icon name="back" className="w-4 h-4" /></button>
        <div className="text-[15px] font-semibold">{tr("yourHome")}</div>
      </div>
      <div className="mx-6 mt-5 flex gap-3 items-center p-2 rounded-3xl bg-blush">
        <div className="w-20 h-16 rounded-2xl overflow-hidden"><HomeArt listing={l} className="w-full h-full" /></div>
        <div className="min-w-0"><div className="font-bold">{price(l)}</div><div className="text-sm truncate">{l.title}</div><div className="text-xs text-mute">{l.neighborhood}</div></div>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-6 pb-8">
        {steps.map((s, i) => {
          const done = i <= at;
          const current = i === at + 1;
          return (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${done ? "bg-coral text-white" : current ? "border-2 border-coral" : "border-2 border-[#ecdcdd]"}`}>
                  {done ? <Icon name="check" className="w-4 h-4" stroke={3} /> : current ? <span className="w-2 h-2 rounded-full bg-coral animate-pulse" /> : null}
                </div>
                {i < steps.length - 1 && <div className={`w-0.5 flex-1 min-h-[28px] ${i < at ? "bg-coral" : "bg-[#f0e3e4]"}`} />}
              </div>
              <div className="pb-5 flex-1">
                <div className={`text-[16px] font-semibold ${done || current ? "" : "text-[#c8b8ba]"}`}>{s.t}</div>
                {s.d && <div className="text-[13px] text-mute mt-0.5">{s.d}</div>}
                {i === 1 && at >= 1 && (
                  <div className="mt-3 flex items-start gap-2.5 rise">
                    <Avatar initials={agent.initials} color={agent.color} size={34} />
                    <div className="rounded-2xl rounded-tl-md bg-blush px-3.5 py-2.5 text-[14px] leading-snug">{firstAgentMsg?.text || `Hi Sarah, I'm ${agent.name}. I checked this home in person — it's yours to see.`}</div>
                  </div>
                )}
                {i === 2 && at === 1 && (
                  <div className="mt-3 flex gap-2 rise">{["Sat 10:00", "Sat 2:30", "Sun 11:00"].map((t) => <button key={t} onClick={() => bookTour(lead.id, t)} className="px-3 h-9 rounded-full border border-coral text-coral text-[13px] font-semibold">{t}</button>)}</div>
                )}
                {i === 3 && at === 2 && (
                  <div className="mt-3 rise">
                    {lastAgentMsg && lead.nudgesSent > 0 && <div className="mb-3 flex items-start gap-2.5"><Avatar initials={agent.initials} color={agent.color} size={30} /><div className="rounded-2xl rounded-tl-md bg-blush px-3.5 py-2.5 text-[14px] leading-snug">{lastAgentMsg.text}</div></div>}
                    <button onClick={() => submitApplication(lead.id)} className="h-11 px-5 rounded-full bg-coral text-white text-[14px] font-semibold">{tr("startApp")}</button>
                  </div>
                )}
                {i === 4 && at >= 4 && <div className="mt-3 flex items-center gap-2 text-coral font-semibold rise"><Icon name="key" className="w-5 h-5" />Congratulations, Sarah!</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LangPrompt({ lang, onYes, onNo }: { lang: Lang; onYes: () => void; onNo: () => void }) {
  const q = switchPrompt(lang)!;
  return (
    <div className="absolute top-[52px] left-3 right-3 z-30 rounded-3xl bg-ink text-white p-4 shadow-[0_18px_40px_rgba(30,10,15,.35)] rise">
      <div className="flex items-center gap-2 text-[12px] text-white/70"><Icon name="spark" className="w-4 h-4 text-coral" />{LANG_NAME[lang].native} · {LANG_NAME[lang].en}</div>
      <div className="mt-1.5 text-[16px] font-semibold leading-snug">{q.native}</div>
      <div className="mt-0.5 text-[13px] text-white/70 leading-snug">{q.en}</div>
      <div className="mt-3 flex gap-2">
        <button onClick={onYes} className="flex-1 h-10 rounded-full bg-coral font-semibold text-[14px]">{q.yes} / Yes</button>
        <button onClick={onNo} className="h-10 px-4 rounded-full bg-white/10 text-[14px]">{q.no} / No</button>
      </div>
    </div>
  );
}
