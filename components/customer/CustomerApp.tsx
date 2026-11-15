"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Criteria, DealType, Lead, Listing } from "@/lib/types";
import { listingsSync, getListing, analyzePhotos } from "@/lib/adapters";
import { emptyCriteria, parseRequest, CHIPS } from "@/lib/parse";
import { topThree } from "@/lib/search";
import { isStyle } from "@/lib/styles";
import { spokenRecap, price, commute, bedsBaths, vibeTag, agentById } from "@/lib/recap";
import { listen, speak, canListen, blobToDataUrl, type MicProblem } from "@/lib/speech";
import { detectLanguage, toEnglish, t, switchPrompt, recapIn, speechLang, LANG_NAME, EN, hasDict, registerLanguage, type Lang } from "@/lib/i18n";
import { aiParse, aiRecap, aiTranslate, aiTranscribe } from "@/lib/ai";
import { bookTour, cancelRequest, cancelTour, createLead, declineTour, recordInterest, recordSearch, recordView, setLeadRecap, submitApplication, updateAccount, updateConsent, useAccount, useStore } from "@/lib/store";
import { DEAL, closingLive, dealOptions, dealTypeOf, defaultDeal, fmtDay, fmtTime, runClosing } from "@/lib/closing";
import { AuthFlow, ProfileScreen, type AuthMode } from "@/components/customer/Account";
import type { CustomerProfile } from "@/lib/types";
import HomeArt from "@/components/HomeArt";
import MapView, { BASE_LAYERS, type BaseLayer } from "@/components/MapView";
import MapView3D from "@/components/MapView3D";
import Tour3D from "@/components/Tour3D";
import MatterportTour from "@/components/MatterportTour";
import CostarBadge from "@/components/CostarBadge";
import AerialView from "@/components/AerialView";
import { Avatar, Icon } from "@/components/ui";
import { useWide, DeskBar } from "@/components/customer/Desk";
import Mascot, { type MascotState } from "@/components/Mascot";

type View = "home" | "listening" | "thinking" | "results" | "detail" | "tour" | "status" | "myhome";
type SavedSearch = {
  criteria: Criteria;
  results: Listing[];
  reply: string;
  replyEn: string;
  replyNative: { lang: Lang; text: string };
  transcript: string[];
  why: Record<string, { en: string; native: string }>;
  active: number;
  showMap: boolean;
  photoOnly: boolean;
  request: string;
};
type InterestedHome = { listing: Listing; lead: Lead | undefined; at: number };

const LangCtx = createContext<Lang>("en");
const useT = () => { const l = useContext(LangCtx); return (k: string) => t(l, k); };

// what the buyer picked on the home screen (Buy / Rent / Lease), added to the request when they didn't say it
const INTENT_WORDS = /(buy|buying|purchase|own|mortgage|for sale|rent|renting|rental|lease|leasing|apartment|office|retail|commercial|storefront|land|lot|acres?|stay|hotel|airbnb|nightly)/i;
const WANT_HINT: Record<DealType, string> = { buy: "(I want to buy)", rent: "(I want to rent)", lease: "(I want to lease)" };

const SAMPLE = "I'm starting a job in downtown Houston in January, looking for a bright 1-bedroom in the Heights under $1,600, close to downtown, I have a dog";

export default function CustomerApp() {
  const [view, setView] = useState<View>("home");
  const [homeTab, setHomeTab] = useState<"search" | "interested">("search");
  const [layer, setLayer] = useState<BaseLayer>("map");
  const wide = useWide(); // laptop / desktop: the OverStory desk (navy bar, map, frosted panel)
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [criteria, setCriteria] = useState<Criteria>(emptyCriteria());
  const [results, setResults] = useState<Listing[]>([]);
  const [savedSearch, setSavedSearch] = useState<SavedSearch | null>(null);
  const [reply, setReply] = useState("");
  const [replyKey, setReplyKey] = useState(0);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [active, setActive] = useState(0);
  const [detail, setDetail] = useState<Listing | null>(null);
  const [detailFrom, setDetailFrom] = useState<"results" | "interested">("results");
  const [statusFrom, setStatusFrom] = useState<"results" | "interested">("results");
  const [tourFrom, setTourFrom] = useState<"detail" | "results" | "myhome">("detail");
  const [sheet, setSheet] = useState(false);
  const account = useAccount();
  const allLeads = useStore((s) => s.leads);
  const [pendingInterest, setPendingInterest] = useState<string | null>(null);
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
    if (!detail) return;
    if (account) {
      const currentRequest = allLeads.find((item) => item.customerId === account.id && item.chosenListingId === detail.id && item.status !== "cancelled");
      if (currentRequest) {
        setLeadId(currentRequest.id);
        setStatusFrom(detailFrom);
        setView("status");
        return;
      }
      recordInterest(detail.id);
      setSheet(true);
    } else {
      setPendingInterest(detail.id);
      setAuth({ start: "welcome", reason: "Create an account so a licensed Real Estate Agent can reach you about this home.", then: "sheet" });
    }
  };
  const [leadId, setLeadId] = useState<string | null>(null);
  const [want, setWant] = useState<DealType | null>(null);
  const wantRef = useRef(want);
  wantRef.current = want;
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [typeMode, setTypeMode] = useState(false);
  const [micProblem, setMicProblem] = useState<MicProblem | null>(null);
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
    setSavedSearch({
      criteria: c,
      results: top,
      reply: shown,
      replyEn: english,
      replyNative: { lang: spoken, text: native },
      transcript: [...transcriptRef.current, text || "(photo)"],
      why: ai && ai.picks?.length ? Object.fromEntries(ai.picks.map((p) => [p.id, { en: p.why, native: p.whyNative || p.why }])) : {},
      active: 0,
      showMap: false,
      photoOnly: false,
      request: text.trim() || t(langRef.current, "photoSearch"),
    });
    setReplyKey((k) => k + 1);
    setActive(0);
    setTranscript((t) => [...t, text || "(photo)"]);
    setPhoto(null);
    setView("results");
    speak(shown, speechLang(langRef.current));
  }, [results.length]);

  const startListening = useCallback(() => {
    setPartial("");
    setMicProblem(null);
    setTypeMode(false);
    setView("listening");
    if (!canListen()) {
      setMicProblem("unsupported");
      setTypeMode(true);
      return;
    }
    const h = listen({
      lang: speechLang(langRef.current),
      onPartial: setPartial,
      onLevel: setLevel,
      onDone: (t) => process(t),
      // any language: Gemini transcribes what was actually said; the live captions are only the fallback
      onAudio: async (audio, live) => {
        setPartial(live);
        setView("thinking");
        const heard = await blobToDataUrl(audio).then(aiTranscribe).catch(() => null);
        const t = heard?.text?.trim() || live;
        if (t) { setPartial(t); process(t); }
        else { setMicProblem("no-speech"); setTypeMode(true); setView("listening"); }
      },
      // never fail silently: say what went wrong and offer typing right there
      onError: (pr) => { setMicProblem(pr); setTypeMode(true); },
    });
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

  const lead = leadId ? allLeads.find((l) => l.id === leadId) : undefined;
  const interestByListing = new Map<string, number>((account?.interestedHomes || []).map((home): [string, number] => [home.listingId, home.at]));
  for (const item of allLeads) {
    if (account && item.customerId === account.id) interestByListing.set(item.chosenListingId, Math.max(interestByListing.get(item.chosenListingId) || 0, item.createdAt));
  }
  const interestedHomes: InterestedHome[] = Array.from(interestByListing, ([listingId, at]) => {
    const listing = getListing(listingId);
    if (!listing) return null;
    return {
      listing,
      lead: account
        ? allLeads.find((item) => item.customerId === account.id && item.chosenListingId === listingId && item.status !== "cancelled")
          || allLeads.find((item) => item.customerId === account.id && item.chosenListingId === listingId)
        : undefined,
      at,
    };
  })
    .filter((home): home is InterestedHome => home !== null)
    .sort((a, b) => b.at - a.at);
  const activeInterestedHomes = interestedHomes.filter(({ lead: item }) => item?.status !== "cancelled");
  const cancelledInterestedHomes: InterestedHome[] = account
    ? allLeads
        .reduce<InterestedHome[]>((homes, item) => {
          if (item.customerId !== account.id || item.status !== "cancelled") return homes;
          const listing = getListing(item.chosenListingId);
          if (listing) homes.push({ listing, lead: item, at: item.createdAt });
          return homes;
        }, [])
        .sort((a, b) => b.at - a.at)
    : [];
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
      reset: () => { setCriteria(emptyCriteria()); setResults([]); setTranscript([]); setSavedSearch(null); setReply(""); setReplyEn(""); setWhy({}); setView("home"); },
      run: (t: string) => process(t),
      open: (i: number) => { setDetail(results[i] || topThree(listingsSync(), critRef.current)[i]); setDetailFrom("results"); setView("detail"); },
      openId: (id: string) => { setDetail(getListing(id) || null); setDetailFrom("results"); setView("detail"); },
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
    setStatusFrom("results");
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

  const goHome = () => {
    if (!photoOnly && (results.length || transcript.length)) {
      setSavedSearch((previous) => previous ? { ...previous, criteria, results, reply, replyEn, replyNative, transcript, why, active, showMap } : previous);
    }
    setView("home");
    setHomeTab("search");
    setCriteria(emptyCriteria());
    critRef.current = emptyCriteria();
    setResults([]);
    setReply("");
    setReplyEn("");
    setReplyNative({ lang: "en", text: "" });
    setTranscript([]);
    transcriptRef.current = [];
    setWhy({});
    setActive(0);
    setShowMap(false);
    setDetail(null);
    setPhotoOnly(false);
    setPartial("");
  };
  const resumeSearch = () => {
    if (!savedSearch) return;
    setCriteria(savedSearch.criteria);
    setResults(savedSearch.results);
    setReply(savedSearch.reply);
    setReplyEn(savedSearch.replyEn);
    setReplyNative(savedSearch.replyNative);
    setTranscript(savedSearch.transcript);
    setWhy(savedSearch.why);
    setActive(savedSearch.active);
    setShowMap(savedSearch.showMap);
    setPhotoOnly(savedSearch.photoOnly);
    setDetail(null);
    setView("results");
    setReplyKey((k) => k + 1);
  };
  const navigateHomeTab = (tab: "search" | "interested") => {
    if (view !== "home") goHome();
    setHomeTab(tab);
  };

  return (
    <LangCtx.Provider value={lang}>
    <div className="flex h-full w-full flex-col bg-canvas text-ink overflow-hidden" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      {wide && (
        <DeskBar
          onLogo={goHome}
          account={account ? { initials: (account.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join(""), name: account.name || "" } : null}
          onAccount={() => (account ? setProfileOpen(true) : setAuth({ start: "login" }))}
          tab={homeTab}
          onTab={navigateHomeTab}
          searchLabel={t(lang, "searchTab")}
          interestedLabel={t(lang, "interestedTab")}
          interestCount={activeInterestedHomes.length}
        />
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
      {wide && view !== "home" && view !== "tour" && (
        <MapView3D
          look="desk"
          layer={layer}
          listings={results}
          selected={view === "detail" && detail ? detail.id : results[active]?.id}
          onSelect={(id) => { const i = results.findIndex((r) => r.id === id); if (i >= 0) { setActive(i); if (view === "detail") setDetail(results[i]); } else { setDetail(getListing(id) || null); setDetailFrom("results"); setView("detail"); } }}
          className="absolute inset-0 z-0"
        />
      )}
      {wide && view !== "home" && view !== "tour" && (
        <div className="glass animate-rise absolute right-4 top-4 z-10 flex gap-[2px] !rounded-lg p-[3px]" role="group" aria-label="Base map">
          {BASE_LAYERS.map((b) => (
            <button key={b.id} onClick={() => setLayer(b.id)} aria-pressed={layer === b.id}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${layer === b.id ? "bg-navy text-white" : "text-stone hover:text-ink"}`}>{b.label}</button>
          ))}
        </div>
      )}
      <div
        className={wide && view !== "home" && view !== "tour" ? "glass animate-rise absolute bottom-4 left-4 top-4 z-10 w-[420px] max-w-[calc(100%-2rem)] overflow-hidden" : "absolute inset-0"}
        style={wide ? ({ "--notch": "1.25rem" } as React.CSSProperties) : undefined}
      >
      <div className="relative h-full w-full">
      {view === "home" && <Home
        wide={wide}
        want={want}
        setWant={setWant}
        tab={homeTab}
        onTab={setHomeTab}
        account={account}
        onAccount={() => (account ? setProfileOpen(true) : setAuth({ start: "login" }))}
        interestedHomes={activeInterestedHomes}
        cancelledHomes={cancelledInterestedHomes}
        onOpenInterest={(l) => { setDetail(l); setDetailFrom("interested"); setView("detail"); }}
        onOpenProgress={(l) => { setStatusFrom("interested"); openDeal(l); }}
        resumeText={savedSearch?.request}
        onResume={resumeSearch}
        onMic={startListening}
        onSubmit={(t) => { setPartial(t); process(t); }}
        onPhoto={(f) => onPhoto(f)}
      />}
      {view === "listening" && (
        <Listening
          partial={partial}
          level={level}
          typeMode={typeMode}
          problem={micProblem}
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
          showMap={showMap && !wide}
          setShowMap={setShowMap}
          active={active}
          setActive={setActive}
          onHome={goHome}
          onOpen={(l) => { setDetail(l); setDetailFrom("results"); setView("detail"); }}
          onTour={(l) => { setDetail(l); setDetailFrom("results"); setTourFrom("results"); setView("tour"); }}
          onChip={(c) => process(c)}
          onMic={startListening}
          onPhoto={(f) => onPhoto(f)}
          onSend={(text) => process(text)}
        />
      )}
      {view === "detail" && detail && <Detail l={detail} criteria={criteria} why={why[detail.id] ? (lang === "en" ? why[detail.id].en : why[detail.id].native) : ""} onBack={() => setView(detailFrom === "interested" ? "home" : "results")} onTour={() => { setTourFrom("detail"); setView("tour"); }} onTalk={interested} />}
      {view === "tour" && detail && (
        <div className="absolute inset-0 bg-sand">
          {detail.matterportId ? <MatterportTour modelId={detail.matterportId} title={detail.title} className="absolute inset-0" /> : <Tour3D listing={detail} className="absolute inset-0" />}
          <div className="absolute top-[calc(var(--notch,3.5rem)-0.5rem)] left-4 right-4 flex items-center justify-between pointer-events-none">
            <button onClick={() => setView(tourFrom)} className="pointer-events-auto w-10 h-10 rounded-full bg-card/90 shadow-card flex items-center justify-center"><Icon name="back" /></button>
            <div className="px-3 py-1.5 rounded-full bg-card/90 shadow-card text-xs">{detail.matterportId ? "Matterport 3D scan · via CoStar" : "Living room · drag to look around"}</div>
          </div>
          <div className={`absolute bottom-8 left-4 right-4 ${tourFrom === "myhome" ? "hidden" : ""}`}>
            <button onClick={interested} className="w-full h-14 rounded-full bg-clay text-white text-lg shadow-card">{t(lang, "interested")}</button>
          </div>
        </div>
      )}
      {view === "status" && lead && <Status lead={lead} onBack={() => setView(statusFrom === "interested" || !results.length ? "home" : "results")} onHome={goHome} onMyHome={() => openDeal(lead)} />}
      {view === "myhome" && detail && lead && (
        <Detail l={detail} criteria={criteria} why="" onBack={() => setView("home")} onTour={() => { setTourFrom("myhome"); setView("tour"); }} onTalk={() => undefined} owned={lead} onConversation={() => setView("status")} />
      )}
      {sheet && detail && account && <ShareSheet l={detail} account={account} want={want} onClose={() => setSheet(false)} onSend={sendLead} />}
      {profileOpen && account && <ProfileScreen account={account} onBack={() => setProfileOpen(false)} />}
      {auth && (
        <AuthFlow start={auth.start} reason={auth.reason}
          onClose={() => { try { localStorage.setItem("pebble.welcome.seen", "1"); } catch {} setAuth(null); setPendingInterest(null); }}
          onDone={() => { try { localStorage.setItem("pebble.welcome.seen", "1"); } catch {} const next = auth.then; setAuth(null); if (next === "sheet") { if (pendingInterest) recordInterest(pendingInterest); setPendingInterest(null); setSheet(true); } }} />
      )}
      {askLang && view === "results" && (
        <LangPrompt lang={askLang} onYes={() => switchLang(askLang)} onNo={() => { declined.current.add(askLang); setAskLang(null); }} />
      )}
      </div>
      </div>
      {/* the closing celebration covers the whole screen (and the map on the desk), not just the panel */}
      {celebrate && (() => { const d = allLeads.find((l) => l.id === celebrate); return d ? (
        <Congrats lead={d} onView={() => { setCelebrate(null); openDeal(d); }} onBrowse={() => { setCelebrate(null); setView("home"); }} />
      ) : null; })()}
      </div>
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

/** Opening screen: one big way in (talk), two small ones (photo, type), an optional Buy / Rent / Lease pick, and the Interested tab. */
function Home({ wide, want, setWant, tab, onTab, account, onAccount, interestedHomes, cancelledHomes, onOpenInterest, onOpenProgress, resumeText, onResume, onMic, onSubmit, onPhoto }: {
  wide: boolean;
  want: DealType | null;
  setWant: (d: DealType | null) => void;
  tab: "search" | "interested";
  onTab: (tab: "search" | "interested") => void;
  account: CustomerProfile | null;
  onAccount: () => void;
  interestedHomes: InterestedHome[];
  cancelledHomes: InterestedHome[];
  onOpenInterest: (listing: Listing) => void;
  onOpenProgress: (lead: Lead) => void;
  resumeText?: string;
  onResume: () => void;
  onMic: () => void;
  onSubmit: (t: string) => void;
  onPhoto: (f: File) => void;
}) {
  const tr = useT();
  const [q, setQ] = useState("");
  const [typing, setTyping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [interestTab, setInterestTab] = useState<"active" | "cancelled">("active");
  const examples = tr("examples").split("|");
  const [ex, setEx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setEx((i) => (i + 1) % examples.length), 4500);
    return () => clearInterval(id);
  }, [examples.length]);
  const submit = (text: string) => {
    const v = text.trim();
    if (v) onSubmit(v);
  };
  const pickFile = (files: FileList | null | undefined) => {
    const f = files && Array.from(files).find((x) => x.type.startsWith("image/"));
    if (f) onPhoto(f);
  };
  return (
    <div
      className="absolute inset-0 overflow-y-auto no-scrollbar bg-[radial-gradient(120%_70%_at_50%_0%,#1F3F6E_0%,#16325A_45%,#0C1C36_100%)] text-white"
      onDragOver={(e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files); }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-3xl border-2 border-dashed border-violet-light bg-violet-light/10 px-8 text-center text-[17px] font-medium">
          {tr("dropHere")}
        </div>
      )}
      <div className="mx-auto min-h-full max-w-[560px] flex flex-col items-center md:justify-center md:pb-16 px-6 pt-[var(--notch,3.5rem)] pb-10 text-center">
        <header className="animate-rise self-stretch flex items-center justify-between gap-2">
          <div className="flex-1 text-left">
            {!wide && <div className="flex items-center gap-2"><Mascot className="h-9 w-9" sparkle={false} /><span className="text-[17px] font-semibold">Pebble</span></div>}
          </div>
          {!wide && <nav role="tablist" aria-label="Home sections" className="flex rounded-full bg-white/10 p-1">
            <button role="tab" aria-selected={tab === "search"} onClick={() => onTab("search")} className={`rounded-full px-3 py-2 text-[13px] font-medium ${tab === "search" ? "bg-white text-navy" : "text-white/75 hover:text-white"}`}>{tr("searchTab")}</button>
            <button role="tab" aria-selected={tab === "interested"} onClick={() => onTab("interested")} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium ${tab === "interested" ? "bg-white text-navy" : "text-white/75 hover:text-white"}`}>
              {tr("interestedTab")}
              {interestedHomes.length > 0 && <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${tab === "interested" ? "bg-navy/10 text-navy" : "bg-white/15 text-white"}`}>{interestedHomes.length}</span>}
            </button>
          </nav>}
          <div className="flex-1 flex justify-end">
            {!wide && <button onClick={onAccount} aria-label={account ? "Your profile" : tr("signIn")} className="h-9 min-w-9 px-3 rounded-full bg-white/95 text-ink shadow-card text-sm flex items-center justify-center">
              {account ? <span className="h-6 w-6 rounded-full bg-sage text-white text-[11px] grid place-items-center">{(account.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}</span> : tr("signIn")}
            </button>}
          </div>
        </header>

        {tab === "interested" ? (
          <section role="tabpanel" className="animate-rise mt-10 w-full flex-1 text-left">
            <h1 className="text-[28px] font-semibold leading-tight">{tr("interestedTab")}</h1>
            <nav role="tablist" aria-label="Interested request groups" className="mt-4 flex rounded-full bg-white/10 p-1">
              <button role="tab" aria-selected={interestTab === "active"} onClick={() => setInterestTab("active")} className={`flex-1 rounded-full px-3 py-2 text-[13px] font-medium ${interestTab === "active" ? "bg-white text-navy" : "text-white/75 hover:text-white"}`}>
                {tr("interestActiveTab")} {interestedHomes.length > 0 && <span className="ml-1 text-[11px] opacity-70">{interestedHomes.length}</span>}
              </button>
              <button role="tab" aria-selected={interestTab === "cancelled"} onClick={() => setInterestTab("cancelled")} className={`flex-1 rounded-full px-3 py-2 text-[13px] font-medium ${interestTab === "cancelled" ? "bg-white text-navy" : "text-white/75 hover:text-white"}`}>
                {tr("interestCancelledTab")} {cancelledHomes.length > 0 && <span className="ml-1 text-[11px] opacity-70">{cancelledHomes.length}</span>}
              </button>
            </nav>
            {(interestTab === "active" ? interestedHomes : cancelledHomes).length ? (
              <div className="mt-4 grid w-full gap-3">
                {(interestTab === "active" ? interestedHomes : cancelledHomes).map(({ listing, lead }, index) => (
                  <div key={lead?.id || `${listing.id}-${index}`} className="space-y-2">
                    <Card l={listing} c={emptyCriteria()} onOpen={() => onOpenInterest(listing)} wide showAddress={Boolean(lead && lead.status !== "new" && Object.values(lead.checklist).every(Boolean))} />
                    <InterestProgress
                      listing={listing}
                      lead={lead}
                      onOpenProgress={() => lead && onOpenProgress(lead)}
                      onCancelRequest={() => {
                        if (!lead || lead.status === "closed" || lead.status === "cancelled") return;
                        cancelRequest(lead.id);
                        setInterestTab("cancelled");
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-white/15 bg-white/10 p-5 text-[14px] leading-snug text-white/75">
                <p>{!account ? tr("interestedSignIn") : interestTab === "cancelled" ? tr("interestCancelledEmpty") : tr("interestedEmpty")}</p>
                {!account && <button onClick={onAccount} className="mt-4 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-navy">{tr("signIn")}</button>}
              </div>
            )}
          </section>
        ) : (
          <>
            <h1 className="animate-rise mt-10 md:mt-8 text-[30px] md:text-[44px] font-semibold leading-[1.12] tracking-[-0.01em]" style={{ animationDelay: "150ms" }}>
              {tr("tagline1")}<br /><span className="text-white/70">{tr("tagline2")}</span>
            </h1>

            {/* optional: what kind of deal; added to the request when they don't say it */}
            <div className="animate-rise mt-6 flex rounded-full border border-white/20 bg-white/10 p-[3px]" style={{ animationDelay: "220ms" }} role="group" aria-label="I want to">
              {(["buy", "rent", "lease"] as const).map((d) => (
                <button key={d} type="button" aria-pressed={want === d} onClick={() => setWant(want === d ? null : d)}
                  className={`h-8 rounded-full px-4 text-[13px] font-medium transition ${want === d ? "bg-white text-navy" : "text-white/75 hover:text-white"}`}>{DEAL[d].label}</button>
              ))}
            </div>

            {resumeText && (
              <button type="button" onClick={onResume} className="animate-soft mt-6 w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-left hover:bg-white/15">
                <span className="block text-[13px] font-semibold text-white">{tr("resumeSearch")}</span>
                <span className="mt-1 block truncate text-[12px] text-white/65">{resumeText}</span>
              </button>
            )}

            <div className="animate-rise flex-1 md:flex-none flex flex-col items-center justify-center py-10 md:py-14" style={{ animationDelay: "280ms" }}>
              <button type="button" onClick={onMic} aria-label={tr("tapTalk")}
                className="relative grid h-[132px] w-[132px] place-items-center rounded-full bg-white text-navy shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55)] hover:scale-[1.03] active:scale-95">
                <span className="ring absolute inset-0 rounded-full bg-white/25" />
                <span className="ring ring2 absolute inset-0 rounded-full bg-white/25" />
                <Icon name="mic" className="relative h-12 w-12" stroke={1.7} />
              </button>
              <p className="mt-6 text-[17px] font-medium">{tr("tapTalk")}</p>
            </div>

            {typing ? (
              <form className="animate-soft w-full" onSubmit={(e) => { e.preventDefault(); submit(q); }}>
                <div className="flex items-center gap-1.5 rounded-full bg-white p-1.5 pl-4 text-ink shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)]">
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr("describe")} placeholder={tr("describe")}
                    className="min-w-0 flex-1 bg-transparent py-2 text-[15px] placeholder:text-faint focus:outline-none" />
                  <button type="submit" disabled={!q.trim()} aria-label={tr("ask")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-white disabled:opacity-40"><Icon name="send" className="h-[18px] w-[18px]" /></button>
                </div>
                <button type="button" onClick={() => { setTyping(false); setQ(""); }} className="mt-3 rounded-full px-3 py-1 text-[13px] font-medium text-white/80 hover:bg-white/10 hover:text-white">{tr("back")}</button>
              </form>
            ) : (
              <div className="animate-rise flex items-start justify-center gap-10" style={{ animationDelay: "380ms" }}>
                <div className="flex flex-col items-center gap-2">
                  <PhotoPicker onPick={onPhoto} label={tr("showPhoto")} className="grid h-14 w-14 place-items-center rounded-full border border-white/25 bg-white/10 hover:bg-white/20">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.6" /></svg>
                  </PhotoPicker>
                  <span className="text-[12px] text-white/65">{tr("photo")}</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button type="button" onClick={() => setTyping(true)} aria-label={tr("typeInstead")} className="grid h-14 w-14 place-items-center rounded-full border border-white/25 bg-white/10 hover:bg-white/20">
                    <Icon name="keyboard" className="h-[22px] w-[22px]" stroke={1.6} />
                  </button>
                  <span className="text-[12px] text-white/65">{tr("type")}</span>
                </div>
              </div>
            )}

            <button key={ex} type="button" onClick={() => submit(examples[ex])} className="animate-soft mt-8 max-w-[300px] text-[12.5px] leading-snug text-white/50 hover:text-white/80">
              “{examples[ex]}”
            </button>
          </>
        )}
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

const MIC_HELP: Record<MicProblem, string> = {
  blocked: "Pebble can't use your microphone. Click the mic or lock icon in the address bar, allow the microphone, then tap Talk again. Or type it below.",
  "no-mic": "No microphone found. Plug one in or check your sound settings, or type it below.",
  service: "Voice isn't available in this browser right now. It works in Chrome, Edge and Safari. You can type it below.",
  "no-speech": "I didn't hear anything. Tap Talk and try again, or type it below.",
  unsupported: "This browser can't do voice. Open Pebble in Chrome, Edge or Safari to talk, or type it below.",
};

function Listening({ partial, level, typeMode, problem, onStop, onSubmit, onExample, onTalk, onPhoto, onClose }: { partial: string; level: number; typeMode: boolean; problem: MicProblem | null; onStop: () => void; onSubmit: (t: string) => void; onExample: () => void; onTalk: () => void; onPhoto: (f: File) => void; onClose: () => void }) {
  const tr = useT();
  const [t, setT] = useState("");
  const words = partial.split(" ").filter(Boolean);
  return (
    <div className="absolute inset-0 flex flex-col bg-canvas">
      <div className="pt-[var(--notch,3.5rem)] px-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-sage">{!typeMode && <span className="w-2 h-2 rounded-full bg-clay animate-pulse" />}{typeMode ? tr("describe") : tr("listening")}</div>
        <button onClick={onClose} aria-label={tr("back")} className="text-stone"><Icon name="x" /></button>
      </div>
      {typeMode ? (
        <div className="flex-1 px-6 pt-8 flex flex-col">
          {problem && (
            <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-[14px] leading-snug text-ink">
              <Icon name="mic" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>{MIC_HELP[problem]}</span>
            </div>
          )}
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
    <div className="absolute inset-0 flex flex-col bg-canvas px-7 pt-[var(--notch,3.5rem)]">
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

function Card({ l, c, onOpen, wide = false, showAddress = false }: { l: Listing; c: Criteria; onOpen: () => void; wide?: boolean; showAddress?: boolean }) {
  const tr = useT();
  return (
    <button onClick={onOpen} className={`text-left shrink-0 snap-center ${wide ? "w-full" : "w-[300px]"} rounded-[28px] bg-card shadow-card overflow-hidden`}>
      <div className="relative h-44 bg-sand">
        <HomeArt listing={l} className="w-full h-full" />
        {l.matterportId && <span className="absolute top-3 right-3 px-2 py-1 rounded-full bg-ink/75 text-white text-[11px] flex items-center gap-1"><Icon name="cube" className="w-3.5 h-3.5" />3D</span>}
      </div>
      <div className="space-y-1 p-4">
        {showAddress ? (
          <>
            <p className="break-words text-[28px] font-semibold leading-tight text-navy">{l.address}</p>
            <p className="text-[15px] font-medium">{price(l)}</p>
            <p className="truncate text-sm text-stone">{l.title} · {l.neighborhood}</p>
          </>
        ) : (
          <>
            <p className="font-display text-2xl">{price(l)}</p>
            <p className="truncate text-sm">{l.title} · {l.neighborhood}</p>
          </>
        )}
        <p className="text-sm text-stone">{bedsBaths(l)} · {l.minutesToCampus} {tr(l.commuteMode === "walk" ? "walk" : "drive")}</p>
        <p className="text-sm text-sage">{vibeTag(l, c)}</p>
      </div>
    </button>
  );
}

function InterestProgress({ listing, lead, onOpenProgress, onCancelRequest }: { listing: Listing; lead?: Lead; onOpenProgress: () => void; onCancelRequest: () => void }) {
  const tr = useT();
  const validated = Boolean(lead && lead.status !== "new" && Object.values(lead.checklist).every(Boolean));
  const tourScheduled = Boolean(lead?.tourSlot);
  const completed = lead?.status === "closed";
  const cancelled = lead?.status === "cancelled";
  const summary = !lead
    ? tr("interestNotSent")
    : completed
    ? tr("interestComplete")
    : cancelled
    ? tr("interestCancelled")
    : lead.status === "application"
    ? tr("interestApplication")
    : tourScheduled
    ? tr("interestTourBooked")
    : lead.tourDeclined
    ? tr("interestTourDeclined")
    : lead.tourOptions?.length
    ? tr("interestTimesSent")
    : validated
    ? tr("interestNoTour")
    : tr("interestValidating");
  const steps = [
    { label: tr("interestStageSaved"), done: true },
    { label: tr("interestStageValidated"), done: validated },
    { label: tr("interestStageTour"), done: tourScheduled },
    { label: tr("interestStageCompleted"), done: completed },
  ];
  return (
    <section aria-label={`${listing.title} progress`} className="rounded-2xl bg-white/10 p-4 text-left text-white">
      <p className="text-[13px] font-medium">{summary}</p>
      {tourScheduled && !cancelled && <p className="mt-1 text-[12px] text-white/65">{lead?.tourSlot}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {steps.map((step) => (
          <span key={step.label} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${step.done ? "bg-sage-soft text-sage-ink" : "bg-white/10 text-white/60"}`}>
            {step.done && <Icon name="check" className="h-3 w-3" stroke={2.5} />}
            {step.label}
          </span>
        ))}
      </div>
      {lead && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button onClick={onOpenProgress} className="text-[12px] font-medium text-white underline underline-offset-2">{tr("interestOpenProgress")}</button>
          {lead.status !== "closed" && !cancelled && <button onClick={onCancelRequest} className="text-[12px] font-medium text-white/75 underline underline-offset-2">{tr("cancelDeal")}</button>}
        </div>
      )}
    </section>
  );
}

function Results(p: {
  reply: string; replyKey: number; results: Listing[]; criteria: Criteria; showMap: boolean; setShowMap: (v: boolean) => void; active: number; setActive: (i: number) => void;
  photoOnly?: boolean;
  onHome: () => void; onOpen: (l: Listing) => void; onTour: (l: Listing) => void; onChip: (c: string) => void; onMic: () => void; onPhoto: (f: File) => void; onSend: (text: string) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  // the index the rail is currently showing; when `active` changes from the
  // user's own swipe we must not scroll back, or we fight their gesture
  const shown = useRef(p.active);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typing, setTyping] = useState("");
  const STEP = 312; // card width (300) + gap (12)
  useEffect(() => {
    const el = rail.current;
    if (!el || shown.current === p.active) return;
    shown.current = p.active;
    el.scrollTo({ left: p.active * STEP, behavior: "smooth" });
  }, [p.active]);
  // mouse wheels scroll vertically; turn that into horizontal movement so the
  // carousel works on desktop without a trackpad
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: "auto" });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [p.showMap]);
  const go = (i: number) => { const n = Math.max(0, Math.min(p.results.length - 1, i)); p.setActive(n); };
  // click-and-drag with a mouse, the way a finger swipes
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !rail.current) return;
    drag.current = { x: e.clientX, left: rail.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current, el = rail.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 5) { d.moved = true; el.style.scrollSnapType = "none"; el.setPointerCapture(e.pointerId); }
    if (d.moved) el.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    const d = drag.current, el = rail.current;
    drag.current = null;
    if (!d?.moved || !el) return;
    const i = Math.max(0, Math.min(p.results.length - 1, Math.round(el.scrollLeft / STEP)));
    el.style.scrollSnapType = "";
    shown.current = -1; // force the snap-back scroll even if the index didn't change
    if (i === p.active) { shown.current = i; el.scrollTo({ left: i * STEP, behavior: "smooth" }); } else p.setActive(i);
    dragEnded.current = Date.now();
  };
  // swallow the click that follows a drag so it doesn't open the card
  const dragEnded = useRef(0);
  const onClickCapture = (e: React.MouseEvent) => { if (Date.now() - dragEnded.current < 250) { e.stopPropagation(); e.preventDefault(); } };
  const tr = useT();
  const words = p.reply.split(" ");
  const send = () => { const t = typing.trim(); if (!t) return; setTyping(""); setTypeOpen(false); p.onSend(t); };
  return (
    <div className="absolute inset-0 flex flex-col bg-canvas">
      <header className="flex items-center justify-between px-5 pb-1 pt-[var(--notch,3.5rem)]">
        <button onClick={p.onHome} aria-label={tr("back")} className="-ml-2 grid h-9 w-9 place-items-center rounded-full text-stone hover:bg-sand hover:text-ink"><Icon name="back" className="h-5 w-5" /></button>
        <Wordmark className="md:invisible" />
        <button onClick={() => p.setShowMap(!p.showMap)} className="md:invisible rounded-full px-3 py-1.5 text-sm font-medium text-sage hover:bg-sage-soft">{p.showMap ? tr("homes") : tr("map")}</button>
      </header>
      <p className="px-5 pt-3 pb-3 font-display text-[20px] leading-snug" key={p.replyKey}>
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
          <div className="relative group">
            <div
              ref={rail}
              onScroll={(e) => {
                if (drag.current?.moved) return;
                const i = Math.round(e.currentTarget.scrollLeft / STEP);
                if (i !== shown.current && i >= 0 && i < p.results.length) { shown.current = i; p.setActive(i); }
              }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={onClickCapture}
              onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(p.active + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(p.active - 1); } }}
              tabIndex={0} aria-label={tr("homes")} aria-roledescription="carousel"
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar overscroll-x-contain touch-pan-x px-[45px] pb-4 pt-1 cursor-grab active:cursor-grabbing select-none outline-none"
            >
              {p.results.map((l, i) => <div key={l.id} className="rise shrink-0 snap-center" style={{ animationDelay: `${200 + i * 90}ms` }}><Card l={l} c={p.criteria} onOpen={() => p.onOpen(l)} /></div>)}
            </div>
            {p.results.length > 1 && (
              <>
                <button onClick={() => go(p.active - 1)} disabled={p.active === 0} aria-label="Previous home" className="absolute left-2 top-[88px] -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-card/95 text-ink shadow-card transition-opacity disabled:opacity-0 disabled:pointer-events-none [@media(hover:none)]:hidden">
                  <Icon name="back" className="h-4 w-4" />
                </button>
                <button onClick={() => go(p.active + 1)} disabled={p.active >= p.results.length - 1} aria-label="Next home" className="absolute right-2 top-[88px] -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-card/95 text-ink shadow-card transition-opacity disabled:opacity-0 disabled:pointer-events-none [@media(hover:none)]:hidden">
                  <Icon name="back" className="h-4 w-4 rotate-180" />
                </button>
              </>
            )}
          </div>
          <div className="flex justify-center gap-0.5">{p.results.map((_, i) => (
            <button key={i} onClick={() => go(i)} aria-label={`Home ${i + 1} of ${p.results.length}`} aria-current={i === p.active} className="grid h-5 place-items-center px-0.5">
              <span className={`block h-1.5 rounded-full transition-all ${i === p.active ? "w-5 bg-sage" : "w-1.5 bg-line hover:bg-stone"}`} />
            </button>
          ))}</div>
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
            <PhotoPicker onPick={p.onPhoto} label={tr("showPhoto")} className="w-12 h-12 mb-[10px] rounded-full border border-line bg-card text-stone grid place-items-center hover:text-ink"><Icon name="image" className="w-5 h-5" stroke={1.6} /></PhotoPicker>
            <span className="text-[11px] text-stone">{tr("photo")}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={p.onMic} aria-label={tr("tapTalk")} className="w-[68px] h-[68px] rounded-full bg-clay text-white grid place-items-center shadow-[0_12px_30px_rgba(22,50,90,.35)]"><Icon name="mic" className="w-7 h-7" stroke={1.8} /></button>
            <span className="text-[11px] text-stone">{tr("talk")}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => setTypeOpen(true)} aria-label={tr("typeInstead")} className="w-12 h-12 mb-[10px] rounded-full border border-line bg-card text-stone grid place-items-center hover:text-ink"><Icon name="keyboard" className="w-5 h-5" stroke={1.6} /></button>
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
        <button onClick={onBack} aria-label={tr("back")} className="mx-3 mb-2 mt-[calc(var(--notch,3.5rem)-0.5rem)] grid h-9 w-9 place-items-center rounded-full text-stone hover:bg-sand hover:text-ink"><Icon name="back" className="h-5 w-5" /></button>
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto no-scrollbar px-4">
          {variants.map((v) => <div key={v} className="h-56 w-[88%] shrink-0 snap-center overflow-hidden rounded-[28px] bg-sand"><HomeArt listing={l} variant={v} className="w-full h-full" /></div>)}
        </div>
        <div className="space-y-1 px-5 pt-4 pb-4">
          <p className="font-display text-3xl">{price(l)}</p>
          <h1 className="text-[17px]">{l.title}</h1>
          <p className="text-sm text-stone">{l.neighborhood} · {bedsBaths(l)} · {l.minutesToCampus} {tr(l.commuteMode === "walk" ? "walk" : "drive")}</p>
        </div>
        {(fits.length > 0 || why) && (
          <div className="mx-4 rounded-3xl bg-card p-4 shadow-card">
            <div className="text-[13px] text-stone mb-2">{tr("whyFits")}</div>
            {why && <p className="font-display text-[16px] leading-snug mb-3">{why}</p>}
            <div className="flex flex-wrap gap-2">{fits.map((f) => <span key={f} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-sage-soft text-sage-ink text-[13px]"><Icon name="check" className="w-3.5 h-3.5" />{f}</span>)}</div>
          </div>
        )}
        {/* the teammate's tour card: a slow-panning photo that opens the 3D walkthrough */}
        <button onClick={onTour} className="relative mx-4 mt-4 block h-44 w-[calc(100%-2rem)] overflow-hidden rounded-[28px] bg-sand text-left">
          <HomeArt listing={l} variant="living" className="pan w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-black/10" />
          <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-white/90 text-ink text-[12px] flex items-center gap-1"><Icon name="cube" className="w-3.5 h-3.5" />{tr("tour3d")}</div>
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <p className="text-sm">{tr("tourTitle")}</p>
            <p className="text-xs text-white/85">{tr("tourBody")}</p>
          </div>
        </button>
        <p className="px-5 pt-5 text-[14.5px] leading-relaxed text-[#4A586D]">{l.description}</p>
        <p className="px-5 pt-2 text-[13px] text-stone">{l.address.split(",")[0]} · {l.petFriendly ? tr("petsOk") : tr("noPets")}</p>
        {l.highlights.length > 0 && <div className="px-5 mt-3 flex flex-wrap gap-1.5">{l.highlights.map((h) => <span key={h} className="px-2.5 py-1 rounded-full bg-sand text-[12px] text-[#4A586D]">{h}</span>)}</div>}
        <div className="px-4"><CostarBadge l={l} className="mt-5" /></div>
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

const STEP_LABELS: Record<DealType, string[]> = {
  buy: ["Sent", "Verified", "Toured", "Under contract", "Closed"],
  rent: ["Sent", "Verified", "Toured", "Applied", "Moved in"],
  lease: ["Sent", "Verified", "Toured", "Terms agreed", "Lease signed"],
};

/** The deal, as a conversation with the agent. In the demo it plays out fast-forwarded (lib/closing.ts). */
function Status({ lead, onBack, onHome, onMyHome }: { lead: Lead; onBack: () => void; onHome: () => void; onMyHome: () => void }) {
  const l = getListing(lead.chosenListingId)!;
  const agent = agentById(lead.agentId);
  const tr = useT();
  const deal = dealTypeOf(lead);
  const order = ["new", "verified", "touring", "application", "closed"];
  const at = Math.max(0, order.indexOf(lead.status));
  const live = closingLive(lead);
  const msgs = lead.messages;
  const last = msgs[msgs.length - 1];
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs.length, lead.status]);
  let prevDay = "";
  if (lead.status === "cancelled") {
    return (
      <div className="absolute inset-0 flex flex-col bg-canvas">
        <button onClick={onBack} className="self-start px-5 pb-2 pt-[var(--notch,3.5rem)] text-sm text-stone">{tr("back")}</button>
        <div className="px-5 pt-4">
          <section className="rounded-3xl bg-clay-soft p-4">
            <p className="font-display text-2xl">{tr("interestCancelled")}</p>
            <p className="mt-1 text-[14px] leading-snug text-stone">{tr(lead.cancelledBy === "client" ? "requestCancelledByYouBody" : "requestCancelledBody")}</p>
          </section>
          <div className="mt-4 flex items-center gap-3 rounded-3xl bg-card p-2 shadow-card">
            <div className="h-16 w-20 overflow-hidden rounded-2xl"><HomeArt listing={l} className="h-full w-full" /></div>
            <div className="min-w-0"><div className="font-display text-lg">{price(l)}</div><div className="truncate text-sm">{l.title}</div><div className="text-xs text-stone">{l.neighborhood}</div></div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col bg-canvas">
      <div className="pt-[var(--notch,3.5rem)] px-5 pb-3 flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone hover:bg-sand hover:text-ink"><Icon name="back" className="h-5 w-5" /></button>
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
        {/* agent-driven steps (outside the fast-forwarded demo): tour times, tour, application */}
        {!live && lead.status !== "closed" && (
          <div className="pt-3 space-y-2 rise">
            {at === 1 && (lead.tourDeclined ? <p className="text-[13px] text-stone">{tr("tourDeclined")}</p> : lead.tourOptions?.length ? (
              <div>
                <p className="mb-2 text-[13px] text-stone">{tr("tourOfferPrompt")}</p>
                <div className="flex flex-wrap gap-2">{lead.tourOptions.map((time) => <button key={time} onClick={() => bookTour(lead.id, time)} className="min-h-9 rounded-full bg-sage-soft px-3 text-[13px] text-sage-ink">{time}</button>)}</div>
                <button onClick={() => declineTour(lead.id)} className="mt-2 h-9 rounded-full border border-line px-3 text-[13px] text-stone">{tr("declineTour")}</button>
              </div>
            ) : <p className="text-[13px] text-stone">{tr("tourOfferWaiting")}</p>)}
            {at === 2 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => submitApplication(lead.id)} className="h-11 px-5 rounded-full bg-clay text-white text-[14px]">{tr("startApp")}</button>
                {lead.tourSlot && <button onClick={() => cancelTour(lead.id)} className="h-11 rounded-full border border-line px-4 text-[13px] text-stone">{tr("cancelTour")}</button>}
              </div>
            )}
          </div>
        )}
        {lead.status !== "closed" && (
          <div className="pt-2 text-center"><button onClick={() => cancelRequest(lead.id)} className="text-[12px] text-stone underline underline-offset-2">{tr("cancelDeal")}</button></div>
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
      <div className="relative mx-auto h-full max-w-[480px] flex flex-col px-6 pt-[calc(var(--notch,3.5rem)+0.5rem)] pb-10 md:justify-center">
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
        <div className="mt-auto md:mt-8 space-y-2.5">
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
