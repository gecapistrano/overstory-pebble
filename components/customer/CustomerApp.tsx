"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Criteria, DealType, Lead, Listing } from "@/lib/types";
import { listingsSync, getListing, analyzePhotos } from "@/lib/adapters";
import { emptyCriteria, parseRequest, CHIPS } from "@/lib/parse";
import { topThree } from "@/lib/search";
import { isStyle } from "@/lib/styles";
import { spokenRecap, price, commute, bedsBaths, vibeTag, agentById } from "@/lib/recap";
import { listen, speak, speechSupported } from "@/lib/speech";
import { detectLanguage, toEnglish, t, switchPrompt, recapIn, speechLang, LANG_NAME, EN, hasDict, registerLanguage, type Lang } from "@/lib/i18n";
import { aiParse, aiRecap, aiTranslate } from "@/lib/ai";
import { createLead, recordSearch, recordView, setLeadRecap, updateAccount, updateConsent, useAccount, useStore } from "@/lib/store";
import { DEAL, closingLive, dealOptions, dealTypeOf, defaultDeal, fmtDay, fmtTime, runClosing } from "@/lib/closing";
import { AuthFlow, ProfileScreen, type AuthMode } from "@/components/customer/Account";
import type { CustomerProfile } from "@/lib/types";
import HomeArt from "@/components/HomeArt";
import MapView from "@/components/MapView";
import Tour3D from "@/components/Tour3D";
import MatterportTour from "@/components/MatterportTour";
import CostarBadge from "@/components/CostarBadge";
import AerialView from "@/components/AerialView";
import { Avatar, Icon } from "@/components/ui";
import Mascot, { type MascotState } from "@/components/Mascot";

type View = "home" | "listening" | "thinking" | "results" | "detail" | "tour" | "status" | "myhome";

const LangCtx = createContext<Lang>("en");
const useT = () => { const l = useContext(LangCtx); return (k: string) => t(l, k); };

// what the buyer picked on the home screen (Buy / Rent / Lease), added to the request when they didn't say it
const INTENT_WORDS = /(buy|buying|purchase|own|mortgage|for sale|rent|renting|rental|lease|leasing|apartment|office|retail|commercial|storefront|land|lot|acres?|stay|hotel|airbnb|nightly)/i;
const WANT_HINT: Record<DealType, string> = { buy: "(I want to buy)", rent: "(I want to rent)", lease: "(I want to lease)" };

const SAMPLE = "I'm starting a job in downtown Houston in January, looking for a bright 1-bedroom in the Heights under $1,600, close to downtown, I have a dog";

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
  const [tourFrom, setTourFrom] = useState<"detail" | "results" | "myhome">("detail");
  const [sheet, setSheet] = useState(false);
  const account = useAccount();
  const [auth, setAuth] = useState<{ start: AuthMode; reason?: string; then?: "sheet" } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // first visit: offer an account (they can still look around first)
  useEffect(() => {
    try {
      if (!account && !localStorage.getItem("pebble.welcome.seen")) setAuth({ start: "welcome" });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** "Interested" needs an account, so the agent knows who to call. */
  const interested = () => {
    if (account) setSheet(true);
    else setAuth({ start: "welcome", reason: "Create an account so a licensed Real Estate Agent can reach you about this home.", then: "sheet" });
  };
  const [leadId, setLeadId] = useState<string | null>(null);
  const [want, setWant] = useState<DealType | null>(null);
  const wantRef = useRef(want);
  wantRef.current = want;
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [typeMode, setTypeMode] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoOnly, setPhotoOnly] = useState(false); // last turn was a photo that wasn't a home: no search ran
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
    // 1) the photo (if any) goes through the vision model first, which decides whether it is a home at all
    let imageTags: string[] = [];
    let photoHint = "";
    let photoNote = "";
    if (image) {
      const tags = await analyzePhotos([image], LANG_NAME[langRef.current]?.en || "English").catch(() => null);
      if (tags?.relevant) {
        imageTags = [...tags.ambience, ...tags.style];
        photoHint = `(the client shared a photo of ${tags.description || "a home"}${tags.beds ? `; it is a floor plan with ${tags.beds} bedrooms` : ""}${tags.materials.length ? `; materials: ${tags.materials.join(", ")}` : ""})`;
        photoNote = tags.message || "";
      } else {
        // not a home (or the photo could not be checked): never invent a vibe from it
        photoNote = tags && tags.subject !== "unknown" && tags.message ? tags.message : t(langRef.current, tags && tags.subject !== "unknown" ? "photoNotHome" : "photoUnread");
        if (!text.trim()) {
          await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - started))));
          setReply(photoNote);
          setReplyKey((k) => k + 1);
          setPhotoOnly(true);
          setTranscript((t) => [...t, "(photo: not a home)"]);
          setPhoto(null);
          setView("results");
          speak(photoNote, speechLang(langRef.current));
          return;
        }
      }
    }
    setPhotoOnly(false);
    // 2) Gemini: understand (any language) -> search -> re-rank with reasons
    const hint = wantRef.current && !INTENT_WORDS.test(text) ? WANT_HINT[wantRef.current] : "";
    const ai = await aiParse([text, hint, photoHint].filter(Boolean).join(" "), prev, imageTags);
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
      c = parseRequest([toEnglish(text, spoken), hint].filter(Boolean).join(" "), prev);
      if (imageTags.length) {
        const vibeWords = imageTags.map((v) => (v === "creative" ? "artsy" : v === "airy" ? "bright" : v)).filter((v) => isStyle(v) || ["cozy", "artsy", "bright", "quiet"].includes(v));
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
    // customer data for the brokerage: what they asked for, in which area
    recordSearch({
      text: text || "(photo)",
      tags: [...new Set([...c.vibes, ...(c.pets ? ["pet friendly"] : []), ...(c.walkable ? ["walkable"] : []), ...(imageTags.length ? ["from a photo"] : [])])],
      neighborhoods: c.neighborhoods?.length ? c.neighborhoods : [...new Set(top.map((l) => l.neighborhood))],
      city: c.city || top[0]?.city,
      intent: c.intent,
      budgetMax: c.budgetMax,
    });
    setReplyEn(english);
    setReplyNative({ lang: spoken, text: native });
    const recap = langRef.current === "en" ? english : langRef.current === spoken ? native : recapIn(langRef.current, c, english);
    const shown = photoNote ? `${photoNote} ${recap}` : recap;
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
  // this customer's deals: in progress, and homes they bought / rent / lease (shown on the home screen)
  const myDeals = account ? allLeads.filter((l) => l.customerId === account.id && l.status !== "cancelled") : [];
  const myKey = myDeals.map((l) => `${l.id}:${l.status}`).join(",");
  // demo: the agent accepts and the closing plays out on its own (and resumes after a reload)
  useEffect(() => { myDeals.forEach((l) => closingLive(l) && runClosing(l.id)); }, [myKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // a deal that closes while the app is open gets the congratulations screen, wherever the buyer is
  const closedSeen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const closed = myDeals.filter((l) => l.status === "closed").map((l) => l.id);
    if (!closedSeen.current) { closedSeen.current = new Set(closed); return; }
    const fresh = closed.find((id) => !closedSeen.current!.has(id));
    closed.forEach((id) => closedSeen.current!.add(id));
    if (fresh) setTimeout(() => setCelebrate(fresh), 900);
  }, [myKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const openDeal = (l: Lead) => {
    setLeadId(l.id);
    if (l.status === "closed") { setDetail(getListing(l.chosenListingId) || null); setView("myhome"); }
    else setView("status");
  };

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
      talk: () => interested(),
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

  // time on the listing: from opening the detail (or its 3D tour) until leaving it
  const viewing = (view === "detail" || view === "tour") && detail ? detail.id : null;
  useEffect(() => {
    if (!viewing) return;
    const started = Date.now();
    return () => recordView(viewing, Date.now() - started);
  }, [viewing]);

  const sendLead = (dealType?: DealType) => {
    const chosen = detail || results[0];
    if (!chosen || !account) return;
    const id = createLead({ dealType: dealType || defaultDeal(chosen, wantRef.current), language: lang === "en" ? (replyNative.lang !== "en" ? LANG_NAME[replyNative.lang]?.en : undefined) : LANG_NAME[lang]?.en || lang, clientName: account.name || "Pebble customer", transcript: transcriptRef.current, criteria: critRef.current, suggestions: results, chosen });
    setLeadId(id);
    setSheet(false);
    setView("status");
    runClosing(id);
    // Gemini writes the agent's recap in English from the client's own words
    aiRecap(critRef.current, transcriptRef.current, chosen, lang === "en" ? undefined : LANG_NAME[lang]?.en).then((r) => r && setLeadRecap(id, r));
  };

  // a photo is a first-class way in: show it while Pebble reads it, then run it through the same pipeline
  const onPhoto = (f: File, text = "") => {
    setPhoto(URL.createObjectURL(f));
    process(text, f);
  };

  return (
    <LangCtx.Provider value={lang}>
    <div className="relative h-full w-full bg-canvas text-ink overflow-hidden" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      {view === "home" && <Home want={want} setWant={setWant} deals={myDeals} onDeal={openDeal} onMic={startListening} onSubmit={(t) => { setPartial(t); process(t); }} onPhoto={(f) => onPhoto(f)} />}
      {view === "listening" && (
        <Listening
          partial={partial}
          level={level}
          typeMode={typeMode}
          onStop={() => (stopRef.current ? stopRef.current() : process(partial))}
          onSubmit={(t) => { setTypeMode(false); process(t); }}
          onExample={() => { setTypeMode(false); simulate(SAMPLE); }}
          onTalk={() => { setTypeMode(false); startListening(); }}
          onPhoto={(f) => { setTypeMode(false); onPhoto(f); }}
          onClose={() => { setTypeMode(false); setView(results.length ? "results" : "home"); }}
        />
      )}
      {view === "thinking" && <Thinking text={partial || transcript[transcript.length - 1] || ""} photo={photo} />}
      {view === "results" && (
        <Results
          photoOnly={photoOnly}
          reply={reply}
          replyKey={replyKey}
          results={results}
          criteria={criteria}
          showMap={showMap}
          setShowMap={setShowMap}
          active={active}
          setActive={setActive}
          onHome={() => setView("home")}
          onOpen={(l) => { setDetail(l); setView("detail"); }}
          onTour={(l) => { setDetail(l); setTourFrom("results"); setView("tour"); }}
          onChip={(c) => process(c)}
          onMic={startListening}
          onPhoto={(f) => onPhoto(f)}
          onSend={(text) => process(text)}
        />
      )}
      {view === "detail" && detail && <Detail l={detail} criteria={criteria} why={why[detail.id] ? (lang === "en" ? why[detail.id].en : why[detail.id].native) : ""} onBack={() => setView("results")} onTour={() => { setTourFrom("detail"); setView("tour"); }} onTalk={interested} />}
      {view === "tour" && detail && (
        <div className="absolute inset-0 bg-sand">
          {detail.matterportId ? <MatterportTour modelId={detail.matterportId} title={detail.title} className="absolute inset-0" /> : <Tour3D listing={detail} className="absolute inset-0" />}
          <div className="absolute top-12 left-4 right-4 flex items-center justify-between pointer-events-none">
            <button onClick={() => setView(tourFrom)} className="pointer-events-auto w-10 h-10 rounded-full bg-card/90 shadow-card flex items-center justify-center"><Icon name="back" /></button>
            <div className="px-3 py-1.5 rounded-full bg-card/90 shadow-card text-xs">{detail.matterportId ? "Matterport 3D scan · via CoStar" : "Living room · drag to look around"}</div>
          </div>
          <div className={`absolute bottom-8 left-4 right-4 ${tourFrom === "myhome" ? "hidden" : ""}`}>
            <button onClick={interested} className="w-full h-14 rounded-full bg-clay text-white text-lg shadow-card">{t(lang, "interested")}</button>
          </div>
        </div>
      )}
      {view === "status" && lead && <Status lead={lead} onBack={() => setView(results.length ? "results" : "home")} onHome={() => setView("home")} onMyHome={() => openDeal(lead)} />}
      {view === "myhome" && detail && lead && (
        <Detail l={detail} criteria={criteria} why="" onBack={() => setView("home")} onTour={() => { setTourFrom("myhome"); setView("tour"); }} onTalk={() => undefined} owned={lead} onConversation={() => setView("status")} />
      )}
      {sheet && detail && account && <ShareSheet l={detail} account={account} want={want} onClose={() => setSheet(false)} onSend={sendLead} />}
      {celebrate && (() => { const d = allLeads.find((l) => l.id === celebrate); return d ? (
        <Congrats lead={d} onView={() => { setCelebrate(null); openDeal(d); }} onBrowse={() => { setCelebrate(null); setView("home"); }} />
      ) : null; })()}
      {(view === "home" || view === "results") && !auth && !profileOpen && (
        <button onClick={() => (account ? setProfileOpen(true) : setAuth({ start: "login" }))} aria-label={account ? "Your profile" : "Log in"}
          className="absolute top-12 right-4 z-30 h-9 min-w-9 px-3 rounded-full bg-card/95 text-ink shadow-card text-sm flex items-center justify-center gap-1.5">
          {account ? <span className="w-6 h-6 -mx-1.5 rounded-full bg-sage text-white text-[11px] grid place-items-center">{(account.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}</span> : "Log in"}
        </button>
      )}
      {profileOpen && account && <ProfileScreen account={account} onBack={() => setProfileOpen(false)} />}
      {auth && (
        <AuthFlow start={auth.start} reason={auth.reason}
          onClose={() => { try { localStorage.setItem("pebble.welcome.seen", "1"); } catch {} setAuth(null); }}
          onDone={() => { try { localStorage.setItem("pebble.welcome.seen", "1"); } catch {} const next = auth.then; setAuth(null); if (next === "sheet") setSheet(true); }} />
      )}
      {askLang && view === "results" && (
        <LangPrompt lang={askLang} onYes={() => switchLang(askLang)} onNo={() => { declined.current.add(askLang); setAskLang(null); }} />
      )}
    </div>
    </LangCtx.Provider>
  );
}

/* ---------------- Screens ---------------- */

/** Pebble wordmark: the mascot stone + name, as in the OverStory design. */
function Wordmark({ className = "", mood = "idle" }: { className?: string; mood?: MascotState }) {
  return <div className={`flex items-center gap-1.5 text-[15px] font-semibold text-ink ${className}`}><Mascot state={mood} sparkle={false} className="h-7 w-7" />Pebble</div>;
}

function PhotoPicker({ onPick, className, children, label }: { onPick: (f: File) => void; className: string; children: React.ReactNode; label: string }) {
  return (
    <label className={`cursor-pointer ${className}`} aria-label={label}>
      {children}
      <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
    </label>
  );
}

/** Opening screen, in the OverStory intro layout: Pebble + badges, one line of story, then one request —
 *  typed, spoken, or a photo of a home they love — in a single white search bar, with example requests below. */
function Home({ onMic, onSubmit, onPhoto, want, setWant, deals, onDeal }: { onMic: () => void; onSubmit: (t: string) => void; onPhoto: (f: File) => void; want: DealType | null; setWant: (d: DealType | null) => void; deals: Lead[]; onDeal: (l: Lead) => void }) {
  const tr = useT();
  const [q, setQ] = useState("");
  const [err, setErr] = useState(false);
  const [dragging, setDragging] = useState(false);
  const submit = (text: string) => {
    const v = text.trim();
    if (!v) { setErr(true); return; }
    onSubmit(v);
  };
  const pickFile = (files: FileList | null | undefined) => {
    const f = files && Array.from(files).find((x) => x.type.startsWith("image/"));
    if (f) onPhoto(f);
  };
  return (
    <div
      className="absolute inset-0 overflow-y-auto no-scrollbar bg-[radial-gradient(120%_70%_at_20%_0%,#1F3F6E_0%,#16325A_45%,#0C1C36_100%)] text-white"
      onDragOver={(e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files); }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-3xl border-2 border-dashed border-violet-light bg-violet-light/10 px-8 text-center text-[17px] font-medium">
          {tr("dropHere")}
        </div>
      )}
      <div className="min-h-full flex flex-col px-6 pt-14 pb-8">
        <div className="animate-rise flex flex-wrap items-center gap-2" style={{ animationDelay: "50ms" }}>
          <Mascot className="h-12 w-12 animate-float" />
          <span className="text-[19px] font-semibold tracking-[0.01em]">Pebble</span>
          <span className="ml-0.5 rounded-full border border-violet-light/40 bg-violet-light/10 px-2 py-0.5 text-[11px] text-[#D9CFFF]">✦ {tr("aiPowered")}</span>
        </div>

        <div className="flex-1 flex flex-col justify-center py-8">
          <h1 className="animate-rise text-[34px] font-semibold leading-[1.08] tracking-[-0.01em]" style={{ animationDelay: "150ms" }}>
            {tr("tagline1")}<br />{tr("tagline2")}
          </h1>
          <p className="animate-rise mt-4 text-[15px] leading-relaxed text-white/75" style={{ animationDelay: "250ms" }}>{tr("introBody")}</p>

          {deals.length > 0 && <MyDeals deals={deals} onDeal={onDeal} />}

          <div className="animate-rise mt-7 flex items-center gap-2" style={{ animationDelay: "330ms" }} role="group" aria-label="I want to">
            <span className="text-[12.5px] text-white/60">I want to</span>
            <div className="flex rounded-full bg-white/10 p-0.5">
              {(["buy", "rent", "lease"] as const).map((d) => (
                <button key={d} type="button" aria-pressed={want === d} onClick={() => setWant(want === d ? null : d)}
                  className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition ${want === d ? "bg-white text-navy" : "text-white/80 hover:text-white"}`}>{DEAL[d].label}</button>
              ))}
            </div>
          </div>

          <form className="animate-rise mt-3" style={{ animationDelay: "380ms" }} onSubmit={(e) => { e.preventDefault(); submit(q); }}>
            <div className="flex items-center gap-1.5 rounded-2xl bg-white p-1.5 pl-3.5 text-ink shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)]">
              <span className="text-[17px] text-violet" aria-hidden="true">✦</span>
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setErr(false); }}
                aria-label={tr("describe")}
                placeholder={tr("describe")}
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] placeholder:text-faint focus:outline-none"
              />
              <PhotoPicker onPick={onPhoto} label={tr("showPhoto")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-stone hover:border-sage/50 hover:text-ink">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.6" /></svg>
              </PhotoPicker>
              {q.trim() ? (
                <button type="submit" className="h-11 shrink-0 rounded-xl bg-navy px-4 text-[14px] font-medium text-white hover:bg-navy-700 active:scale-[.98]">{tr("ask")} →</button>
              ) : (
                <button type="button" onClick={onMic} aria-label={tr("tapTalk")} className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy text-white hover:bg-navy-700 active:scale-95">
                  <span className="ring absolute inset-0 rounded-xl bg-navy" />
                  <Icon name="mic" className="relative h-5 w-5" stroke={1.8} />
                </button>
              )}
            </div>
            {err && <p className="mt-2 text-[13px] text-[#FFB4B4]">{tr("emptyAsk")}</p>}
          </form>

          <div className="animate-rise mt-4 flex flex-wrap gap-2" style={{ animationDelay: "480ms" }}>
            {tr("examples").split("|").map((e) => (
              <button key={e} type="button" onClick={() => submit(e)} className="rounded-full border border-white/25 bg-white/5 px-3 py-1.5 text-left text-[12.5px] text-white/85 hover:border-white/60 hover:bg-white/10">{e}</button>
            ))}
          </div>
          <p className="animate-rise mt-4 text-[13px] leading-relaxed text-white/65" style={{ animationDelay: "530ms" }}>
            {tr("orUpload")}{" "}
            <PhotoPicker onPick={onPhoto} label={tr("showPhoto")} className="font-medium text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">{tr("uploadPhoto")}</PhotoPicker>{" "}
            {tr("dropHint")}
          </p>
        </div>

        <div className="animate-rise flex items-center justify-between gap-3 text-[12.5px] text-white/60" style={{ animationDelay: "600ms" }}>
          <button type="button" onClick={onMic} className="font-medium text-white/85 underline decoration-white/30 underline-offset-4 hover:text-white">{tr("justTalk")}</button>
          <span className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] text-white/70">CoStar · Matterport</span>
        </div>
      </div>
    </div>
  );
}

function Waveform({ level, n = 24 }: { level: number; n?: number }) {
  return (
    <div className="flex items-center justify-center gap-[4px] h-14" aria-hidden>
      {[...Array(n)].map((_, i) => {
        const env = Math.sin((i / (n - 1)) * Math.PI);
        return <span key={i} className="bar w-[3px] rounded-full bg-sage" style={{ height: `${10 + env * 36 * (0.5 + level)}px`, animationDelay: `${(i * 73) % 900}ms`, animationDuration: `${700 + ((i * 131) % 600)}ms` }} />;
      })}
    </div>
  );
}

function Listening({ partial, level, typeMode, onStop, onSubmit, onExample, onTalk, onPhoto, onClose }: { partial: string; level: number; typeMode: boolean; onStop: () => void; onSubmit: (t: string) => void; onExample: () => void; onTalk: () => void; onPhoto: (f: File) => void; onClose: () => void }) {
  const tr = useT();
  const [t, setT] = useState("");
  const words = partial.split(" ").filter(Boolean);
  return (
    <div className="absolute inset-0 flex flex-col bg-canvas">
      <div className="pt-14 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-sage">{!typeMode && <span className="w-2 h-2 rounded-full bg-clay animate-pulse" />}{typeMode ? tr("describe") : tr("listening")}</div>
        <button onClick={onClose} aria-label={tr("back")} className="text-stone"><Icon name="x" /></button>
      </div>
      {typeMode ? (
        <div className="flex-1 px-6 pt-8 flex flex-col">
          <textarea autoFocus value={t} onChange={(e) => setT(e.target.value)} placeholder={tr("describe")} className="w-full h-44 rounded-3xl bg-card shadow-card p-5 font-display text-[22px] leading-snug outline-none resize-none placeholder:text-[#A9B5C6]" />
          <button onClick={onExample} className="self-start text-sm text-sage mt-3">{tr("example")}</button>
          <div className="mt-auto pb-10 space-y-4">
            <button onClick={() => onSubmit(t)} disabled={!t.trim()} className="w-full h-14 rounded-full bg-clay text-white text-lg disabled:opacity-50">{tr("findHome")}</button>
            {/* typing is the backup: the main options stay one tap away */}
            <div className="flex justify-center gap-6 text-sm text-stone">
              <button onClick={onTalk} className="flex items-center gap-1.5"><Icon name="mic" className="w-4 h-4" />{tr("talkInstead")}</button>
              <PhotoPicker onPick={onPhoto} label={tr("showPhoto")} className="flex items-center gap-1.5"><Icon name="image" className="w-4 h-4" />{tr("showPhoto")}</PhotoPicker>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 px-7 pt-12">
            <p className="font-display text-[26px] leading-[1.25]">
              {words.map((w, i) => <span key={i} className="word mr-[0.25em]">{w}</span>)}
              {!words.length && <span className="text-[#A9B5C6]">{tr("goAhead")}</span>}
            </p>
          </div>
          <div className="pb-12 flex flex-col items-center gap-6">
            <Waveform level={level} />
            <button onClick={onStop} aria-label="Stop" className="w-[76px] h-[76px] rounded-full bg-clay grid place-items-center shadow-[0_12px_30px_rgba(22,50,90,.35)]"><span className="w-6 h-6 rounded-md bg-white" /></button>
            <p className="text-stone text-sm -mt-2">{tr("pauseHint")}</p>
          </div>
        </>
      )}
    </div>
  );
}

function Thinking({ text, photo }: { text: string; photo: string | null }) {
  const tr = useT();
  return (
    <div className="absolute inset-0 flex flex-col bg-canvas px-7 pt-14">
      <Wordmark mood="thinking" />
      {photo && <img src={photo} alt="" className="mt-10 w-28 h-28 rounded-3xl object-cover shadow-card rise" />}
      {text && <p className="mt-10 font-display text-[22px] leading-snug text-[#8592A6]">{text}</p>}
      <div className="mt-10 flex items-center gap-3 text-stone">
        <div className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="w-2.5 h-2.5 rounded-full bg-violet animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}</div>
        <span className="text-[15px]">{tr("finding")}</span>
      </div>
      <div className="mt-10 space-y-3">{[0, 1].map((i) => <div key={i} className="h-40 rounded-[28px] shimmer" />)}</div>
    </div>
  );
}

function Card({ l, c, onOpen, wide = false }: { l: Listing; c: Criteria; onOpen: () => void; wide?: boolean }) {
  const tr = useT();
  return (
    <button onClick={onOpen} className={`text-left shrink-0 snap-center ${wide ? "w-full" : "w-[300px]"} rounded-[28px] bg-card shadow-card overflow-hidden`}>
      <div className="relative h-44 bg-sand">
        <HomeArt listing={l} className="w-full h-full" />
        {l.matterportId && <span className="absolute top-3 right-3 px-2 py-1 rounded-full bg-ink/75 text-white text-[11px] flex items-center gap-1"><Icon name="cube" className="w-3.5 h-3.5" />3D</span>}
      </div>
      <div className="space-y-1 p-4">
        <p className="font-display text-2xl">{price(l)}</p>
        <p className="text-sm truncate">{l.title} · {l.neighborhood}</p>
        <p className="text-sm text-stone">{bedsBaths(l)} · {l.minutesToCampus} {tr(l.commuteMode === "walk" ? "walk" : "drive")}</p>
        <p className="text-sm text-sage">{vibeTag(l, c)}</p>
      </div>
    </button>
  );
}

function Results(p: {
  reply: string; replyKey: number; results: Listing[]; criteria: Criteria; showMap: boolean; setShowMap: (v: boolean) => void; active: number; setActive: (i: number) => void;
  photoOnly?: boolean;
  onHome: () => void; onOpen: (l: Listing) => void; onTour: (l: Listing) => void; onChip: (c: string) => void; onMic: () => void; onPhoto: (f: File) => void; onSend: (text: string) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typing, setTyping] = useState("");
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    el.scrollTo({ left: p.active * 312, behavior: "smooth" });
  }, [p.active]);
  const tr = useT();
  const words = p.reply.split(" ");
  const send = () => { const t = typing.trim(); if (!t) return; setTyping(""); setTypeOpen(false); p.onSend(t); };
  return (
    <div className="absolute inset-0 flex flex-col bg-canvas">
      <header className="flex items-center justify-between px-5 pb-1 pt-14">
        <button onClick={p.onHome} className="text-sm text-stone">{tr("back")}</button>
        <Wordmark />
        <button onClick={() => p.setShowMap(!p.showMap)} className="text-sm text-sage">{p.showMap ? tr("homes") : tr("map")}</button>
      </header>
      <p className="px-5 pt-4 pb-3 font-display text-2xl leading-snug" key={p.replyKey}>
        {words.map((w, i) => <span key={i} className="word mr-[0.24em]" style={{ animationDelay: `${i * 45}ms` }}>{w}</span>)}
      </p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-3">
        {tr("chips").split("|").map((c, i) => <button key={c} onClick={() => p.onChip(CHIPS[i])} className="shrink-0 rounded-full bg-sage-soft px-3 py-2 text-sm text-sage-ink">{c}</button>)}
      </div>
      {p.results.length === 0 && !p.photoOnly && <p className="px-5 text-sm text-stone">{tr("emptyResults")}</p>}
      {p.showMap ? (
        <div className="flex-1 min-h-0 flex flex-col px-4 gap-3 fadein">
          <MapView listings={p.results} selected={p.results[p.active]?.id} onSelect={(id) => p.setActive(p.results.findIndex((r) => r.id === id))} className="flex-1 rounded-[28px] overflow-hidden" />
          {p.results[p.active] && (
            <div className="flex gap-2 items-center p-2 rounded-3xl bg-card shadow-card">
              <button onClick={() => p.onOpen(p.results[p.active])} className="flex-1 min-w-0 flex gap-3 items-center text-left">
                <div className="w-20 h-16 rounded-2xl overflow-hidden shrink-0"><HomeArt listing={p.results[p.active]} className="w-full h-full" /></div>
                <div className="min-w-0"><div className="font-display text-lg">{price(p.results[p.active])}</div><div className="text-sm truncate">{p.results[p.active].title}</div><div className="text-xs text-stone">{commute(p.results[p.active])}</div></div>
              </button>
              <button onClick={() => p.onTour(p.results[p.active])} className="shrink-0 h-10 px-3 rounded-full bg-sage-soft text-sage-ink text-[13px] flex items-center gap-1.5"><Icon name="cube" className="w-4 h-4" />{tr("tour3d")}</button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div ref={rail} onScroll={(e) => { const i = Math.round(e.currentTarget.scrollLeft / 312); if (i !== p.active) p.setActive(i); }} className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar px-[45px] pb-4 pt-1">
            {p.results.map((l, i) => <div key={l.id} className="rise" style={{ animationDelay: `${200 + i * 90}ms` }}><Card l={l} c={p.criteria} onOpen={() => p.onOpen(l)} /></div>)}
          </div>
          <div className="flex justify-center gap-1.5">{p.results.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === p.active ? "w-5 bg-sage" : "w-1.5 bg-line"}`} />)}</div>
        </div>
      )}

      {typeOpen ? (
        <div className="px-4 pt-3 pb-8 flex items-center gap-2 fadein">
          <button onClick={() => setTypeOpen(false)} aria-label={tr("back")} className="w-11 h-11 rounded-full bg-sand text-stone grid place-items-center shrink-0"><Icon name="x" className="w-4 h-4" /></button>
          <input autoFocus value={typing} onChange={(e) => setTyping(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={tr("sayMore")} className="min-w-0 flex-1 h-11 rounded-full border border-line bg-card px-4 text-[15px] outline-none placeholder:text-stone" />
          <button onClick={send} aria-label="Send" className="w-11 h-11 rounded-full bg-sage text-white grid place-items-center shrink-0"><Icon name="send" className="w-5 h-5" /></button>
        </div>
      ) : (
        <div className="pt-3 pb-7 flex items-end justify-center gap-7">
          <div className="flex flex-col items-center gap-1">
            <PhotoPicker onPick={p.onPhoto} label={tr("showPhoto")} className="w-14 h-14 rounded-full bg-sage text-white grid place-items-center shadow-card"><Icon name="image" className="w-6 h-6" stroke={1.8} /></PhotoPicker>
            <span className="text-[11px] text-stone">{tr("photo")}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={p.onMic} aria-label={tr("tapTalk")} className="w-[68px] h-[68px] rounded-full bg-clay text-white grid place-items-center shadow-[0_12px_30px_rgba(22,50,90,.35)]"><Icon name="mic" className="w-7 h-7" stroke={1.8} /></button>
            <span className="text-[11px] text-stone">{tr("talk")}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => setTypeOpen(true)} aria-label={tr("typeInstead")} className="w-11 h-11 mb-[6px] rounded-full border border-line bg-card text-stone grid place-items-center"><Icon name="keyboard" className="w-5 h-5" stroke={1.6} /></button>
            <span className="text-[11px] text-stone">{tr("type")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ l, criteria, why, onBack, onTour, onTalk, owned, onConversation }: { l: Listing; criteria: Criteria; why: string; onBack: () => void; onTour: () => void; onTalk: () => void; owned?: Lead; onConversation?: () => void }) {
  const tr = useT();
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
    <div className="absolute inset-0 flex flex-col bg-canvas">
      <div className="flex-1 overflow-y-auto no-scrollbar pb-28">
        <button onClick={onBack} className="px-5 pb-3 pt-14 text-sm text-stone">{tr("back")}</button>
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto no-scrollbar px-4">
          {variants.map((v) => <div key={v} className="h-56 w-[88%] shrink-0 snap-center overflow-hidden rounded-[28px] bg-sand"><HomeArt listing={l} variant={v} className="w-full h-full" /></div>)}
        </div>
        <div className="space-y-2 px-5 py-4">
          <p className="font-display text-3xl">{price(l)}</p>
          <h1 className="text-lg">{l.title}</h1>
          <p className="text-sm text-stone">{l.neighborhood} · {l.address.split(",")[0]}</p>
          <p className="text-sm">{bedsBaths(l)} · {l.minutesToCampus} {tr(l.commuteMode === "walk" ? "walk" : "drive")} · {l.petFriendly ? tr("petsOk") : tr("noPets")}</p>
          <p className="text-sm text-sage">{vibeTag(l, criteria)}</p>
          <CostarBadge l={l} className="!mt-3" />
        </div>
        {(fits.length > 0 || why) && (
          <div className="mx-4 rounded-3xl bg-card p-4 shadow-card">
            <div className="text-[13px] text-stone mb-2">{tr("whyFits")}</div>
            {why && <p className="font-display text-[17px] leading-snug mb-3">{why}</p>}
            <div className="flex flex-wrap gap-2">{fits.map((f) => <span key={f} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-sage-soft text-sage-ink text-[13px]"><Icon name="check" className="w-3.5 h-3.5" />{f}</span>)}</div>
          </div>
        )}
        <p className="px-5 pt-5 text-[15px] leading-relaxed text-[#4A586D]">{l.description}</p>
        {l.highlights.length > 0 && <div className="px-5 mt-4 flex flex-wrap gap-1.5">{l.highlights.map((h) => <span key={h} className="px-2.5 py-1 rounded-full bg-sand text-[12px] text-[#4A586D]">{h}</span>)}</div>}
        {/* the teammate's tour card: a slow-panning photo that opens the 3D walkthrough */}
        <button onClick={onTour} className="relative mx-4 mt-6 block h-48 w-[calc(100%-2rem)] overflow-hidden rounded-[28px] bg-sand text-left">
          <HomeArt listing={l} variant="living" className="pan w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-black/10" />
          <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-white/90 text-ink text-[12px] flex items-center gap-1"><Icon name="cube" className="w-3.5 h-3.5" />{tr("tour3d")}</div>
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <p className="text-sm">{tr("tourTitle")}</p>
            <p className="text-xs text-white/85">{tr("tourBody")}</p>
          </div>
        </button>
        <AerialView l={l} className="mx-4 mt-6" />
      </div>
      {owned ? (
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-canvas via-canvas to-canvas/0">
          <div className="rounded-3xl bg-card shadow-card p-3 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-sage text-white grid place-items-center shrink-0"><Icon name="key" className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium">{DEAL[dealTypeOf(owned)].owned}</div>
              <div className="text-[12px] text-stone truncate">{DEAL[dealTypeOf(owned)].since} {owned.closedAt ? fmtDay(owned.closedAt) : ""} · with {agentById(owned.agentId).name}</div>
            </div>
            {onConversation && <button onClick={onConversation} className="h-10 px-3.5 rounded-full bg-sage-soft text-sage-ink text-[13px] shrink-0">Messages</button>}
          </div>
        </div>
      ) : (
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-canvas via-canvas to-canvas/0">
        <button onClick={onTalk} className="w-full h-14 rounded-full bg-clay text-white shadow-[0_10px_30px_rgba(22,50,90,.3)] flex flex-col items-center justify-center leading-tight"><span className="text-[17px]">{tr("interested")}</span><span className="text-[11px] opacity-85">{tr("interestedSub")}</span></button>
      </div>
      )}
    </div>
  );
}

function ShareSheet({ l, account, want, onClose, onSend }: { l: Listing; account: CustomerProfile; want: DealType | null; onClose: () => void; onSend: (d: DealType) => void }) {
  const tr = useT();
  const lang = useContext(LangCtx);
  const [phone, setPhone] = useState(account.phone || "");
  const options = dealOptions(l);
  const [deal, setDeal] = useState<DealType>(defaultDeal(l, want));
  const DEAL_SUB: Record<DealType, string> = { buy: `Make an offer · ${price(l)}`, lease: l.kind === "commercial" ? "Multi-year commercial lease" : "Fixed term, usually 12 months", rent: "Flexible, month-to-month" };
  const canContact = Boolean(account.consent?.contact);
  const send = () => {
    if (phone.trim() !== (account.phone || "")) updateAccount({ phone: phone.trim() });
    onSend(deal);
  };
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/25 fadein" onClick={onClose}>
      <div className="rounded-t-[32px] bg-card p-6 pb-9 rise max-h-[92%] overflow-y-auto no-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-line mx-auto mb-5" />
        <h3 className="font-display text-[24px] leading-snug">{tr("sheetTitle")}</h3>
        <p className="text-[15px] text-stone mt-1.5">{lang === "en" ? <>A licensed Real Estate Agent checks that <span className="text-ink">{l.title}</span> is available, priced right, and right for you, then contacts you.</> : tr("sheetBody")}</p>
        <div className="mt-5">
          <div className="text-[13px] text-stone mb-2">How do you want this home?</div>
          <div className={`grid gap-2 ${options.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {options.map((d) => (
              <button key={d} type="button" onClick={() => setDeal(d)} aria-pressed={deal === d}
                className={`rounded-2xl border-2 p-3 text-left transition ${deal === d ? "border-sage bg-sage-soft" : "border-line bg-card"}`}>
                <div className="text-[15px] font-medium">{DEAL[d].verb}</div>
                <div className="text-[12px] text-stone leading-snug">{DEAL_SUB[d]}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-3xl bg-canvas p-4">
          <p className="text-[15px]">{account.name}</p>
          <p className="text-sm text-stone">{account.email}</p>
          <input aria-label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (so the agent can call)" className="mt-3 h-11 w-full rounded-full border border-line bg-card px-4 text-[15px] outline-none focus:border-sage" />
        </div>
        {!canContact && (
          <button onClick={() => updateConsent({ contact: true })} className="mt-3 w-full text-left rounded-3xl border border-clay/40 bg-clay-soft p-4 text-sm">
            You turned off agent contact. <span className="text-clay underline">Allow a Real Estate Agent to contact me about this home</span>
          </button>
        )}
        <button onClick={send} disabled={!canContact} className="mt-4 w-full h-14 rounded-full bg-clay text-white text-[17px] disabled:opacity-50">{tr("send")}</button>
      </div>
    </div>
  );
}

/** "Your homes" on the start screen: homes the buyer bought, rents or leased, and deals still in progress. */
function MyDeals({ deals, onDeal }: { deals: Lead[]; onDeal: (l: Lead) => void }) {
  const done = deals.filter((d) => d.status === "closed");
  const open = deals.filter((d) => d.status !== "closed");
  const row = (d: Lead) => {
    const l = getListing(d.chosenListingId);
    if (!l) return null;
    const t = DEAL[dealTypeOf(d)];
    const closed = d.status === "closed";
    return (
      <button key={d.id} type="button" onClick={() => onDeal(d)} className="w-full flex items-center gap-3 rounded-2xl bg-white/10 p-2 text-left hover:bg-white/15">
        <div className="w-16 h-12 rounded-xl overflow-hidden shrink-0"><HomeArt listing={l} className="w-full h-full" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium truncate">{l.title}</div>
          <div className="text-[12px] text-white/65 truncate">{closed ? `${t.done}${d.closedAt ? ` · ${fmtDay(d.closedAt)}` : ""}` : closingLive(d) ? "Your agent is on it…" : "In progress"} · {l.neighborhood}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${closed ? "bg-[#2A8A5C] text-white" : "bg-white/15 text-white/85"}`}>{closed ? t.done : t.label}</span>
      </button>
    );
  };
  return (
    <div className="animate-rise mt-7 space-y-3" style={{ animationDelay: "300ms" }}>
      {done.length > 0 && <div><div className="mb-2 text-[12.5px] font-medium text-white/70">Your homes</div><div className="space-y-2">{done.map(row)}</div></div>}
      {open.length > 0 && <div><div className="mb-2 text-[12.5px] font-medium text-white/70">In progress</div><div className="space-y-2">{open.map(row)}</div></div>}
      <div className="pt-1 text-[12.5px] text-white/60">Or browse more homes:</div>
    </div>
  );
}

const STEP_LABELS: Record<DealType, string[]> = {
  buy: ["Sent", "Verified", "Toured", "Under contract", "Closed"],
  rent: ["Sent", "Verified", "Toured", "Applied", "Moved in"],
  lease: ["Sent", "Verified", "Toured", "Terms agreed", "Lease signed"],
};

/** The deal, as a conversation with the agent. In the demo it plays out fast-forwarded (lib/closing.ts). */
function Status({ lead, onBack, onHome, onMyHome }: { lead: Lead; onBack: () => void; onHome: () => void; onMyHome: () => void }) {
  const l = getListing(lead.chosenListingId)!;
  const agent = agentById(lead.agentId);
  const deal = dealTypeOf(lead);
  const order = ["new", "verified", "touring", "application", "closed"];
  const at = Math.max(0, order.indexOf(lead.status));
  const live = closingLive(lead);
  const msgs = lead.messages;
  const last = msgs[msgs.length - 1];
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs.length, lead.status]);
  let prevDay = "";
  return (
    <div className="absolute inset-0 flex flex-col bg-canvas">
      <div className="pt-14 px-5 pb-3 flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-full bg-card shadow-card grid place-items-center"><Icon name="back" className="w-4 h-4" /></button>
        <Avatar initials={agent.initials} color={agent.color} size={36} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium leading-tight">{agent.name}</div>
          <div className="text-[12px] text-stone truncate">{lead.status === "new" ? "Reviewing your request…" : `Licensed Real Estate Agent · ${DEAL[deal].label}`}</div>
        </div>
        {live && last && <span className="shrink-0 rounded-full bg-violet-soft text-violet px-2.5 py-1 text-[11px] font-medium">⏩ {fmtDay(last.at)}</span>}
      </div>
      <div className="mx-5 flex gap-3 items-center p-2 rounded-3xl bg-card shadow-card">
        <div className="w-16 h-12 rounded-2xl overflow-hidden shrink-0"><HomeArt listing={l} className="w-full h-full" /></div>
        <div className="min-w-0 flex-1"><div className="font-display text-[17px] leading-tight">{price(l)}</div><div className="text-[13px] truncate">{l.title}</div></div>
      </div>
      <div className="mx-5 mt-3 flex items-center">
        {STEP_LABELS[deal].map((s, i) => (
          <div key={s} className="flex-1 flex flex-col items-center gap-1 relative">
            {i > 0 && <span className={`absolute top-[8px] right-1/2 w-full h-0.5 ${i <= at ? "bg-sage" : "bg-line"}`} />}
            <span className={`relative w-[18px] h-[18px] rounded-full grid place-items-center transition ${i <= at ? "bg-sage text-white" : "bg-canvas border-2 border-line"}`}>{i <= at && <Icon name="check" className="w-2.5 h-2.5" stroke={3.5} />}</span>
            <span className={`text-[10px] leading-none text-center ${i <= at ? "text-ink" : "text-stone"}`}>{s}</span>
          </div>
        ))}
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-6 space-y-2">
        <div className="flex justify-end"><div className="max-w-[80%] rounded-2xl rounded-tr-md bg-sage text-white px-3.5 py-2.5 text-[14px] leading-snug">I&apos;m interested in {l.title}. Can you help me {DEAL[deal].verb.toLowerCase()}?</div></div>
        {lead.status === "new" && <div className="text-center text-[12px] text-stone pt-2">Sent to {agent.name} · checking availability, price and fit…</div>}
        {msgs.map((m, i) => {
          const d = fmtDay(m.at);
          const sep = d !== prevDay;
          prevDay = d;
          return (
            <div key={i} className="rise">
              {sep && <div className="flex justify-center py-2"><span className="rounded-full bg-sand px-3 py-1 text-[11px] text-stone">{d}</span></div>}
              {m.milestone ? (
                <div className="flex justify-center"><span className="flex items-center gap-1.5 rounded-full bg-sage-soft text-sage-ink px-3 py-1.5 text-[12px] font-medium"><Icon name="check" className="w-3.5 h-3.5" stroke={2.6} />{m.text}</span></div>
              ) : m.from === "client" ? (
                <div className="flex justify-end"><div className="max-w-[80%]"><div className="rounded-2xl rounded-tr-md bg-sage text-white px-3.5 py-2.5 text-[14px] leading-snug">{m.text}</div><div className="text-right text-[10px] text-stone mt-0.5 mr-1">{fmtTime(m.at)}</div></div></div>
              ) : (
                <div className="flex items-end gap-2">
                  <Avatar initials={agent.initials} color={agent.color} size={26} />
                  <div className="max-w-[78%]"><div className="rounded-2xl rounded-bl-md bg-card shadow-card px-3.5 py-2.5 text-[14px] leading-snug whitespace-pre-line">{m.text}</div><div className="text-[10px] text-stone mt-0.5 ml-1">{fmtTime(m.at)}</div></div>
                </div>
              )}
            </div>
          );
        })}
        {live && (
          <div className="flex items-end gap-2 pt-1">
            <Avatar initials={agent.initials} color={agent.color} size={26} />
            <div className="rounded-2xl rounded-bl-md bg-card shadow-card px-3.5 py-3 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-stone animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}</div>
          </div>
        )}
        {lead.status === "closed" && (
          <div className="pt-3 flex gap-2 rise">
            <button onClick={onMyHome} className="flex-1 h-12 rounded-full bg-clay text-white text-[15px] flex items-center justify-center gap-1.5"><Icon name="key" className="w-4 h-4" />View my home</button>
            <button onClick={onHome} className="h-12 px-4 rounded-full border border-line bg-card text-[14px]">Browse homes</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Shown to the homebuyer the moment the deal closes. */
function Congrats({ lead, onView, onBrowse }: { lead: Lead; onView: () => void; onBrowse: () => void }) {
  const l = getListing(lead.chosenListingId);
  const t = DEAL[dealTypeOf(lead)];
  const first = lead.clientName.replace(/^The /, "").split(" ")[0];
  const colors = ["#7C6CF0", "#2A8A5C", "#E0702F", "#3478F0", "#F2C14E"];
  return (
    <div className="absolute inset-0 z-50 overflow-hidden bg-[radial-gradient(120%_70%_at_20%_0%,#1F3F6E_0%,#16325A_45%,#0C1C36_100%)] text-white fadein">
      <style>{`@keyframes pb-fall{0%{transform:translateY(-20px) rotate(0)}100%{transform:translateY(860px) rotate(540deg)}}`}</style>
      {[...Array(36)].map((_, i) => (
        <span key={i} aria-hidden className="pointer-events-none absolute top-0 w-2 h-3 rounded-[2px]"
          style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animation: `pb-fall ${2.4 + ((i * 13) % 20) / 10}s linear ${((i * 7) % 15) / 10}s infinite`, opacity: 0.9 }} />
      ))}
      <div className="relative h-full flex flex-col px-6 pt-16 pb-10">
        <Mascot state="happy" className="h-16 w-16" />
        <p className="mt-6 text-[14px] text-white/70">Congratulations, {first}!</p>
        <h1 className="mt-1 text-[34px] font-semibold leading-[1.08]">{t.congrats}</h1>
        {l && (
          <div className="mt-7 rounded-[28px] bg-white text-ink overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)] rise">
            <div className="h-40"><HomeArt listing={l} className="w-full h-full" /></div>
            <div className="p-4">
              <div className="flex items-center gap-2"><span className="rounded-full bg-[#2A8A5C] text-white px-2 py-0.5 text-[11px] font-medium">{t.done}</span><span className="text-[12px] text-stone">{lead.closedAt ? fmtDay(lead.closedAt) : ""}</span></div>
              <div className="mt-1.5 font-display text-[20px] leading-tight">{l.title}</div>
              <div className="text-[13px] text-stone">{price(l)} · {l.neighborhood} · with {agentById(lead.agentId).name}</div>
            </div>
          </div>
        )}
        <p className="mt-5 text-[14px] text-white/70 leading-relaxed">It&apos;s saved on your home screen. Open it any time, or keep browsing.</p>
        <div className="mt-auto space-y-2.5">
          <button onClick={onView} className="w-full h-14 rounded-full bg-white text-navy text-[16px] font-medium flex items-center justify-center gap-2"><Icon name="key" className="w-5 h-5" />View my home</button>
          <button onClick={onBrowse} className="w-full h-12 rounded-full border border-white/30 text-[15px] text-white/90">Browse more homes</button>
        </div>
      </div>
    </div>
  );
}

function LangPrompt({ lang, onYes, onNo }: { lang: Lang; onYes: () => void; onNo: () => void }) {
  const q = switchPrompt(lang)!;
  return (
    <div className="absolute top-[100px] left-4 right-4 z-30 rounded-3xl bg-card p-4 shadow-card rise">
      <div className="text-[12px] text-stone">{LANG_NAME[lang].native} · {LANG_NAME[lang].en}</div>
      <p className="mt-1 font-display text-xl leading-snug">{q.native}</p>
      <p className="mt-0.5 text-[13px] text-stone leading-snug">{q.en}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={onYes} className="rounded-full bg-sage px-4 py-2 text-sm text-white">{q.yes} · Yes</button>
        <button onClick={onNo} className="rounded-full border border-line px-4 py-2 text-sm">{q.no} · No</button>
      </div>
    </div>
  );
}
