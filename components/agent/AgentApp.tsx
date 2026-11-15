"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Lead, LeadStatus, Listing } from "@/lib/types";
import { getListing, listingsSync, analyzePhotos } from "@/lib/adapters";
import { saveUpload } from "@/lib/adapters/agentUploads";
import { agentById, bedsBaths, commute, price } from "@/lib/recap";
import { contactClient, nudgeFor, now, sendNudge, setCheck, setStatus, useStore, verifyLead } from "@/lib/store";
import { aiDraft, aiFollowup } from "@/lib/ai";
import { DEAL, dealTypeOf, fmtDay, fmtTime } from "@/lib/closing";
import HomeArt from "@/components/HomeArt";
import AerialView from "@/components/AerialView";
import MapView, { LayerSwitch, type BaseLayer, type PinStatus } from "@/components/MapView";
import MapView3D from "@/components/MapView3D";
import ExteriorView from "@/components/ExteriorView";
import { exteriorOf, hasExterior } from "@/lib/exteriors";
import MatterportTour from "@/components/MatterportTour";
import Tour3D from "@/components/Tour3D";
import { Avatar, Icon } from "@/components/ui";

type Tab = "inbox" | "pipeline" | "nudges" | "listings";
const ME = "maya";

const ago = (t: number) => {
  const m = Math.max(1, Math.round((now() - t) / 60000));
  return m < 60 ? `${m}m ago` : m < 60 * 24 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const initials = (n: string) => n.replace(/^The /, "").split(" ").map((x) => x[0]).slice(0, 2).join("");
const STAGES: { id: LeadStatus; label: string }[] = [
  { id: "new", label: "New" }, { id: "verified", label: "Verified" }, { id: "touring", label: "Touring" }, { id: "application", label: "Offer / Application" }, { id: "closed", label: "Closed" },
];

export default function AgentApp() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [open, setOpen] = useState<string | null>(null);
  const [compose, setCompose] = useState<string | null>(null);
  const leads = useStore((s) => s.leads);
  const lead = leads.find((l) => l.id === open);
  // when a deal closes: back to the lead list, with a congratulations pop-up
  const [cheer, setCheer] = useState<Lead | null>(null);
  const closedSeen = useRef<Set<string> | null>(null);
  const closedKey = leads.filter((l) => l.status === "closed").map((l) => l.id).join(",");
  useEffect(() => {
    const closed = closedKey ? closedKey.split(",") : [];
    if (!closedSeen.current) { closedSeen.current = new Set(closed); return; }
    const fresh = closed.find((id) => !closedSeen.current!.has(id));
    closed.forEach((id) => closedSeen.current!.add(id));
    const l = fresh && leads.find((x) => x.id === fresh);
    if (l) {
      setTimeout(() => { setOpen(null); setCompose(null); setTab("inbox"); setCheer(l); }, 900);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedKey]);

  useEffect(() => {
    const w = window as unknown as { pebbleAgent: Record<string, unknown> };
    w.pebbleAgent = {
      tab: (t: Tab) => { setOpen(null); setTab(t); },
      open: (id?: string) => setOpen(id || leads.find((l) => l.status === "new")?.id || null),
      close: () => setOpen(null),
      compose: (v: boolean) => setCompose(v ? "x" : null),
    };
  });

  const newCount = leads.filter((l) => l.status === "new").length;
  const nudgeCount = leads.filter((l) => nudgeFor(l)).length;

  return (
    <div className="relative h-full w-full bg-[#F5F7FA] text-ink overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {tab === "inbox" && <Inbox leads={leads} onOpen={setOpen} nudges={nudgeCount} goNudges={() => setTab("nudges")} />}
        {tab === "pipeline" && <Pipeline leads={leads} onOpen={setOpen} />}
        {tab === "nudges" && <Nudges leads={leads} />}
        {tab === "listings" && <Listings leads={leads} onOpen={setOpen} />}
      </div>
      <nav className="shrink-0 h-[84px] pb-6 bg-white border-t border-[#EDF2F9] grid grid-cols-4">
        {([["inbox", "bell", "Leads", newCount], ["pipeline", "chart", "Pipeline", 0], ["nudges", "spark", "Follow-ups", nudgeCount], ["listings", "home", "Listings", 0]] as const).map(([id, ic, label, badge]) => (
          <button key={id} onClick={() => { setTab(id); setOpen(null); }} className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${tab === id ? "text-coral" : "text-mute"}`}>
            <Icon name={ic} className="w-[22px] h-[22px]" />
            {label}
            {badge > 0 && <span className="absolute top-2 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-white text-[10px] font-bold flex items-center justify-center">{badge}</span>}
          </button>
        ))}
      </nav>
      {lead && <LeadView lead={lead} onBack={() => setOpen(null)} onContact={() => setCompose(lead.id)} />}
      {compose && lead && <Composer lead={lead} onClose={() => setCompose(null)} />}
      {cheer && <SaleCheer lead={cheer} onClose={() => setCheer(null)} />}
    </div>
  );
}

function Header({ title, sub }: { title: string; sub?: string }) {
  const me = agentById(ME);
  return (
    <div className="pt-14 px-5 pb-4 flex items-center justify-between">
      <div>
        {sub && <div className="text-[13px] text-mute">{sub}</div>}
        <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
      </div>
      <Avatar initials={me.initials} color={me.color} size={40} />
    </div>
  );
}

function Inbox({ leads, onOpen, nudges, goNudges }: { leads: Lead[]; onOpen: (id: string) => void; nudges: number; goNudges: () => void }) {
  const items = leads.filter((l) => !l.archived && l.status !== "closed").sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <Header title="Leads" sub="Good morning, Maya" />
      {nudges > 0 && (
        <button onClick={goNudges} className="mx-5 mb-4 w-[calc(100%-40px)] flex items-center gap-3 p-3.5 rounded-2xl bg-navy text-white text-left">
          <div className="w-9 h-9 rounded-full bg-violet flex items-center justify-center"><Icon name="spark" className="w-5 h-5" /></div>
          <div className="flex-1 text-[14px]"><b>{nudges} deals</b> are going quiet. The Agentic Assistant drafted check-ins for you.</div>
          <Icon name="chev" className="w-4 h-4 opacity-60" />
        </button>
      )}
      <div className="px-5 space-y-2.5 pb-6">
        {items.map((l) => {
          const home = getListing(l.chosenListingId);
          const isNew = l.status === "new";
          return (
            <button key={l.id} onClick={() => onOpen(l.id)} className={`w-full text-left p-3.5 rounded-2xl bg-white shadow-card flex gap-3 ${isNew ? "ring-2 ring-coral/70" : ""}`}>
              <div className="relative"><Avatar initials={initials(l.clientName)} color={isNew ? "#16325A" : "#A9B5C6"} size={42} />{isNew && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-coral border-2 border-white" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline"><span className="font-semibold text-[15px]">{l.clientName}</span><span className="text-[11px] text-mute">{ago(l.createdAt)}</span></div>
                <div className="text-[13px] text-[#4A586D] line-clamp-2 leading-snug mt-0.5">{l.recap.summary}</div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${isNew ? "bg-coral text-white" : "bg-blush text-mute"}`}>{isNew ? "New lead" : STAGES.find((s) => s.id === l.status)?.label}</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#EDF3FE] text-[#3478F0] font-semibold">{DEAL[dealTypeOf(l)].label}</span>
                  {l.language && <span className="px-2 py-0.5 rounded-full bg-[#EFECFB] text-[#6655CC] font-semibold">{l.language} · translated</span>}
                  {isNew && now() - l.createdAt > 15 * 60000 && <span className="px-2 py-0.5 rounded-full bg-[#FBF1DC] text-[#A8710F] font-semibold">Waiting {Math.round((now() - l.createdAt) / 60000)} min</span>}
                  <span className="text-mute truncate">{home?.title}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LeadView({ lead, onBack, onContact }: { lead: Lead; onBack: () => void; onContact: () => void }) {
  const homes = lead.suggestions.map(getListing).filter(Boolean) as Listing[];
  const allChecked = Object.values(lead.checklist).every(Boolean);
  const checks: [keyof Lead["checklist"], string, string][] = [
    ["available", "Listing still available", "Confirmed with owner / MLS today"],
    ["price", "Price is current", `${homes[0] ? price(homes[0]) : ""} — no change since listing`],
    ["fits", "Fits the client's needs", "Beds, budget, pets, commute"],
    ["legal", "Legal, zoning & fair-housing OK", "No discriminatory terms; lease compliant"],
  ];
  const next: Record<string, [LeadStatus, string] | null> = { verified: ["touring", "Mark toured"], touring: ["application", "Application received"], application: ["closed", "Close deal"], new: null, closed: null, cancelled: null };
  return (
    <div className="absolute inset-0 z-30 bg-[#F5F7FA] flex flex-col rise">
      <div className="pt-14 px-5 pb-3 flex items-center gap-3 bg-[#F5F7FA]">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white shadow-card flex items-center justify-center"><Icon name="back" className="w-4 h-4" /></button>
        <Avatar initials={initials(lead.clientName)} color="#16325A" size={38} />
        <div className="flex-1">
          <div className="font-semibold text-[16px] leading-tight">{lead.clientName}</div>
          <div className="text-[12px] text-mute">via Pebble voice · {ago(lead.createdAt)}</div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${lead.status === "new" ? "bg-coral text-white" : "bg-[#EDF3FE] text-[#3478F0]"}`}>{lead.status === "new" ? "Needs verification" : STAGES.find((s) => s.id === lead.status)?.label}</span>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-36 space-y-4">
        <section className="rounded-3xl bg-white shadow-card p-4">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-violet"><Icon name="spark" className="w-4 h-4" />Agentic Assistant recap{lead.events.some((e) => e.label.startsWith("Agentic Assistant recap written") || e.label.startsWith("AI recap written")) && <span className="ml-auto text-[10px] text-mute font-medium">by Gemini</span>}</div>
          <p className="mt-2 text-[15px] leading-snug font-medium">{lead.recap.summary}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-blush p-2.5"><div className="text-[11px] text-mute">Budget</div><div className="text-[14px] font-semibold">{lead.recap.budget}</div></div>
            <div className="rounded-2xl bg-blush p-2.5"><div className="text-[11px] text-mute">Timeline</div><div className="text-[14px] font-semibold">{lead.recap.timeline}</div></div>
          </div>
          {lead.recap.mustHaves.length > 0 && <div className="mt-3"><div className="text-[11px] text-mute mb-1.5">Must-haves</div><div className="flex flex-wrap gap-1.5">{lead.recap.mustHaves.map((m) => <span key={m} className="px-2.5 py-1 rounded-full bg-navy text-white text-[12px] font-medium">{m}</span>)}</div></div>}
          {lead.recap.niceToHaves.length > 0 && <div className="mt-2.5"><div className="text-[11px] text-mute mb-1.5">Vibe</div><div className="flex flex-wrap gap-1.5">{lead.recap.niceToHaves.map((m) => <span key={m} className="px-2.5 py-1 rounded-full bg-coral-soft text-coral-deep text-[12px] font-medium">{m}</span>)}</div></div>}
          {lead.transcript.length > 0 && <p className="mt-3 text-[12px] text-mute italic leading-snug">“{lead.transcript.join(" … ")}”</p>}
        </section>

        <section>
          <div className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><Icon name="spark" className="w-4 h-4 text-violet" />Homes suggested by the Agentic Assistant</div>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-5 px-5">
            {homes.map((h, i) => (
              <div key={h.id} className="shrink-0 w-[150px] rounded-2xl bg-white shadow-card overflow-hidden">
                <div className="relative h-[86px]"><HomeArt listing={h} className="w-full h-full" />{i === 0 && <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-coral text-white text-[10px] font-bold">Client picked</span>}</div>
                <div className="p-2"><div className="text-[13px] font-bold">{price(h)}</div><div className="text-[11px] truncate">{h.title}</div><div className="text-[10px] text-mute">{commute(h)}</div></div>
              </div>
            ))}
          </div>
        </section>

        {homes[0] && (
          <section className="rounded-3xl bg-white shadow-card p-4">
            <div className="text-[12px] text-mute mb-1">Remote check of the client&apos;s pick · {homes[0].address.split(",")[0]}</div>
            <AerialView l={homes[0]} compact />
          </section>
        )}

        <section className="rounded-3xl bg-white shadow-card p-4">
          <div className="flex items-center justify-between"><div className="text-[13px] font-semibold">Human verification</div><div className="text-[11px] text-mute">{Object.values(lead.checklist).filter(Boolean).length}/4</div></div>
          <div className="mt-2 divide-y divide-[#EDF2F9]">
            {checks.map(([k, t, d]) => (
              <button key={k} onClick={() => setCheck(lead.id, k, !lead.checklist[k])} className="w-full flex items-center gap-3 py-2.5 text-left">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center transition ${lead.checklist[k] ? "bg-coral text-white" : "border-2 border-[#E1E7EF]"}`}>{lead.checklist[k] && <Icon name="check" className="w-4 h-4" stroke={3} />}</span>
                <div><div className="text-[14px] font-medium">{t}</div><div className="text-[11px] text-mute">{d}</div></div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-mute">The Agentic Assistant suggests, you verify. Nothing reaches the client until you confirm.</p>
        </section>

        {lead.language && (
          <div className="rounded-2xl bg-[#EFECFB] text-[#6655CC] p-3 text-[12px] leading-snug flex gap-2"><Icon name="chat" className="w-4 h-4 shrink-0" /><span>Client speaks <b>{lead.language}</b>. You read and write in English — Pebble translates both ways.</span></div>
        )}
        {lead.messages.length > 0 && <Conversation lead={lead} />}
        {lead.status !== "new" && (
          <section className="rounded-3xl bg-white shadow-card p-4">
            <div className="text-[13px] font-semibold mb-2">Deal · {DEAL[dealTypeOf(lead)].label}</div>
            <div className="flex gap-2">
              {next[lead.status] && <button onClick={() => setStatus(lead.id, next[lead.status]![0])} className="flex-1 h-10 rounded-full bg-navy text-white text-[13px] font-semibold">{next[lead.status]![1]}</button>}
              {lead.status !== "closed" && <button onClick={() => setStatus(lead.id, "cancelled")} className="h-10 px-4 rounded-full border border-[#E1E7EF] text-[13px] font-medium text-mute flex items-center gap-1"><Icon name="archive" className="w-4 h-4" />Cancel</button>}
            </div>
          </section>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-5 pt-3 pb-8 bg-white border-t border-[#EDF2F9] flex gap-2.5">
        <button disabled={lead.status === "new" && !allChecked} onClick={() => verifyLead(lead.id)} className={`flex-1 py-3.5 disabled:opacity-40 rounded-full font-semibold text-[15px] flex items-center justify-center gap-1.5 ${lead.status === "new" ? "bg-coral text-white" : "bg-[#EDF3FE] text-[#3478F0]"}`}>
          <Icon name="check" className="w-5 h-5" stroke={2.6} />{lead.status === "new" ? "Verify" : "Verified"}
        </button>
        <button onClick={onContact} className="flex-1 py-3.5 rounded-full bg-navy text-white font-semibold text-[15px] flex items-center justify-center gap-1.5"><Icon name="phone" className="w-5 h-5" />Contact client</button>
      </div>
    </div>
  );
}

/** The thread with the client, newest at the bottom (the demo closing writes into it too). */
function Conversation({ lead }: { lead: Lead }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [lead.messages.length]);
  return (
    <section className="rounded-3xl bg-white shadow-card p-4">
      <div className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><Icon name="chat" className="w-4 h-4" />Conversation</div>
      <div className="max-h-72 overflow-y-auto no-scrollbar space-y-1.5">
        {lead.messages.map((m, i) => m.milestone ? (
          <div key={i} className="text-center"><span className="inline-block px-2.5 py-1 rounded-full bg-[#E6F4EC] text-[#2A8A5C] text-[11px] font-semibold">{m.text} · {fmtDay(m.at)}</span></div>
        ) : (
          <div key={i} className={`flex ${m.from === "client" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug whitespace-pre-line ${m.from === "client" ? "bg-blush rounded-bl-md" : "bg-navy text-white rounded-br-md"}`}>
              {m.text}
              <div className={`mt-0.5 text-[10px] ${m.from === "client" ? "text-mute" : "text-white/60"}`}>{fmtDay(m.at)} · {fmtTime(m.at)}</div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
    </section>
  );
}

/** Pop-up for the agent when one of their deals closes. */
function SaleCheer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const home = getListing(lead.chosenListingId);
  const deal = dealTypeOf(lead);
  const me = agentById(lead.agentId).name.split(" ")[0];
  const what = deal === "buy" ? "sale" : deal === "lease" ? "lease" : "rental";
  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-6 fadein" onClick={onClose}>
      <div className="w-full rounded-[28px] bg-white p-6 text-center shadow-card rise" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-16 h-16 rounded-full bg-[#E6F4EC] text-[34px] grid place-items-center" aria-hidden>🎉</div>
        <div className="mt-4 text-[13px] text-mute">Congratulations, {me}!</div>
        <h3 className="mt-1 text-[22px] font-bold leading-tight">You closed the {what}</h3>
        <p className="mt-2 text-[14px] text-[#4A586D] leading-snug">
          {lead.clientName} {deal === "buy" ? "bought" : deal === "lease" ? "signed a lease on" : "is renting"} <b>{home?.title ?? "the home"}</b>{lead.closedAt ? ` on ${fmtDay(lead.closedAt)}` : ""}.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-left">
          <div className="rounded-2xl bg-blush p-3"><div className="text-[11px] text-mute">{deal === "buy" ? "Price" : "Rent"}</div><div className="text-[15px] font-semibold">{home ? price(home) : "—"}</div></div>
          <div className="rounded-2xl bg-blush p-3"><div className="text-[11px] text-mute">Your commission</div><div className="text-[15px] font-semibold text-[#2A8A5C]">${lead.dealValue.toLocaleString()}</div></div>
        </div>
        <button onClick={onClose} className="mt-5 w-full h-12 rounded-full bg-navy text-white font-semibold">Back to leads</button>
      </div>
    </div>
  );
}

function Composer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const home = getListing(lead.chosenListingId);
  const first = lead.clientName.split(" ")[0];
  const [text, setText] = useState(`Hi ${first}, I'm Maya Chen from Stonebridge Realty. I just verified ${home?.title} — it's available for August, $${home?.price.toLocaleString()}/mo, and dogs are welcome. Want to tour it Saturday?`);
  const [drafting, setDrafting] = useState(true);
  const [native, setNative] = useState("");
  useEffect(() => {
    let alive = true;
    if (!home) return;
    aiDraft(lead, home, "Maya Chen").then((d) => {
      if (!alive) return;
      if (d?.english) { setText(d.english); if (d.native && d.native !== d.english) setNative(d.native); }
      setDrafting(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="absolute inset-0 z-40 bg-black/25 flex flex-col justify-end fadein" onClick={onClose}>
      <div className="rounded-t-[30px] bg-white p-5 pb-9 rise" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-[#E1E7EF] mx-auto mb-4" />
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-violet"><Icon name="spark" className="w-4 h-4" />{drafting ? "Gemini is drafting…" : "Agentic Assistant draft · edit before sending"}</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} className={`mt-2 w-full h-32 rounded-2xl bg-blush p-3 text-[15px] leading-snug outline-none resize-none ${drafting ? "opacity-60" : ""}`} />
        {native && <div className="mt-2 text-[12px] text-mute leading-snug"><b className="text-[#6655CC]">Client sees ({lead.language}):</b> {native}</div>}
        <div className="mt-3 flex gap-2.5">
          <a href={`tel:${lead.clientPhone}`} className="h-12 px-5 rounded-full border border-[#E1E7EF] flex items-center gap-1.5 font-semibold text-[14px]"><Icon name="phone" className="w-4 h-4" />Call</a>
          <button onClick={() => { contactClient(lead.id, native ? `${native}\n\n(${text})` : text); onClose(); }} className="flex-1 h-12 rounded-full bg-coral text-white font-semibold text-[15px]">Send message</button>
        </div>
      </div>
    </div>
  );
}

function Pipeline({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  const [showArchive, setShowArchive] = useState(false);
  const active = leads.filter((l) => !l.archived);
  const archived = leads.filter((l) => l.archived);
  const total = active.filter((l) => l.status !== "closed").reduce((a, l) => a + l.dealValue, 0);
  return (
    <div>
      <Header title="Pipeline" sub={`$${total.toLocaleString()} in open deals`} />
      <div className="px-5 space-y-4 pb-6">
        {STAGES.map((s) => {
          const items = active.filter((l) => l.status === s.id);
          return (
            <div key={s.id}>
              <div className="flex items-center justify-between mb-1.5"><div className="text-[13px] font-semibold flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${s.id === "closed" ? "bg-[#2A8A5C]" : s.id === "new" ? "bg-coral" : "bg-ink"}`} />{s.label}</div><span className="text-[12px] text-mute">{items.length}</span></div>
              <div className="space-y-1.5">
                {items.map((l) => (
                  <button key={l.id} onClick={() => onOpen(l.id)} className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white shadow-card text-left">
                    <Avatar initials={initials(l.clientName)} color={s.id === "new" ? "#16325A" : "#A9B5C6"} size={30} />
                    <div className="flex-1 min-w-0"><div className="text-[14px] font-medium">{l.clientName}</div><div className="text-[11px] text-mute truncate">{getListing(l.chosenListingId)?.title}</div></div>
                    <div className="text-[12px] font-semibold">${l.dealValue.toLocaleString()}</div>
                  </button>
                ))}
                {!items.length && <div className="text-[12px] text-[#A9B5C6] px-1">—</div>}
              </div>
            </div>
          );
        })}
        <button onClick={() => setShowArchive(!showArchive)} className="text-[12px] text-mute flex items-center gap-1"><Icon name="archive" className="w-4 h-4" />Archived · {archived.length} cancelled (hidden)</button>
        {showArchive && archived.map((l) => <div key={l.id} className="text-[12px] text-mute pl-5">{l.clientName} — {l.recap.summary}</div>)}
      </div>
    </div>
  );
}

type AgentRun = { busy: boolean; draft?: string; draftNative?: string; reason?: string; trace?: { tool: string; result: string }[]; failed?: boolean };
const TOOL_LABEL: Record<string, string> = { get_deal_history: "Read the deal history", check_listing: "Looked up the listing (CoStar snapshot)", find_similar_houses: "Looked for similar houses", submit_draft: "Drafted the check-in" };

function Nudges({ leads }: { leads: Lead[] }) {
  const items = leads.map((l) => ({ l, n: nudgeFor(l) })).filter((x) => x.n);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Record<string, AgentRun>>({});
  const runAgent = async (l: Lead) => {
    setRuns((r) => ({ ...r, [l.id]: { busy: true } }));
    const out = await aiFollowup(l, now());
    setRuns((r) => ({ ...r, [l.id]: out ? { busy: false, ...out } : { busy: false, failed: true } }));
    if (out?.draft) setEdits((e) => ({ ...e, [l.id]: out.draftNative && out.draftNative !== out.draft ? `${out.draftNative}\n\n(${out.draft})` : out.draft }));
  };
  useEffect(() => {
    // the agent investigates the first quiet deal automatically; the human still decides
    if (items[0] && !runs[items[0].l.id]) runAgent(items[0].l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);
  return (
    <div>
      <Header title="Follow-ups" sub="Your Agentic Assistant keeps your deals moving" />
      <div className="px-5 space-y-3 pb-6">
        {!items.length && <div className="rounded-2xl bg-white p-5 text-center text-mute text-[14px]">All caught up. Every client has heard from you.</div>}
        {items.map(({ l, n }) => {
          const run = runs[l.id];
          return (
            <div key={l.id} className="rounded-3xl bg-white shadow-card p-4 rise">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-violet-soft text-violet flex items-center justify-center shrink-0"><Icon name="spark" className="w-5 h-5" /></div>
                <div className="text-[15px] font-semibold leading-snug">{n!.text}</div>
              </div>
              {run && (
                <div className="mt-3 rounded-2xl bg-[#F5F7FA] p-3 space-y-1.5">
                  <div className="text-[11px] font-semibold text-mute">{run.busy ? "Agentic Assistant is investigating…" : run.failed ? "Agentic Assistant offline · using the standard draft" : "Agentic Assistant follow-up · Gemini"}</div>
                  {run.busy && <div className="h-3 w-2/3 rounded shimmer" />}
                  {run.trace?.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px] rise" style={{ animationDelay: `${i * 120}ms` }}>
                      <span className="w-4 h-4 rounded-full bg-[#2A8A5C] text-white flex items-center justify-center shrink-0 mt-px"><Icon name="check" className="w-3 h-3" stroke={3} /></span>
                      <span><b className="font-semibold">{TOOL_LABEL[s.tool] || s.tool}</b></span>
                    </div>
                  ))}
                  {run.reason && <div className="text-[12px] text-[#4A586D] leading-snug pt-1">{run.reason}</div>}
                </div>
              )}
              <textarea value={edits[l.id] ?? n!.draft} onChange={(e) => setEdits({ ...edits, [l.id]: e.target.value })} className="mt-3 w-full h-24 rounded-2xl bg-blush p-3 text-[14px] leading-snug outline-none resize-none" />
              <div className="mt-2.5 flex gap-2">
                <button onClick={() => sendNudge(l.id, edits[l.id] ?? n!.draft)} className="flex-1 h-11 rounded-full bg-coral text-white font-semibold text-[14px] flex items-center justify-center gap-1.5"><Icon name="send" className="w-4 h-4" />Send</button>
                {!run && <button onClick={() => runAgent(l)} className="h-11 px-3 rounded-full border border-violet/40 text-violet text-[13px] font-semibold flex items-center gap-1"><Icon name="spark" className="w-4 h-4" />Investigate</button>}
                <button onClick={() => setStatus(l.id, "cancelled")} className="h-11 px-3 rounded-full border border-[#E1E7EF] text-mute text-[13px] font-medium">Cancelled</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ACTIVE: LeadStatus[] = ["new", "verified", "touring", "application"];
const STATUS_META: Record<PinStatus, { label: string; dot: string; chip: string }> = {
  available: { label: "Available", dot: "bg-[#3478F0]", chip: "bg-[#EDF3FE] text-[#3478F0]" },
  active: { label: "In progress", dot: "bg-[#E0702F]", chip: "bg-[#FBF1DC] text-[#A8710F]" },
  sold: { label: "Sold / leased", dot: "bg-mute", chip: "bg-[#EDF2F9] text-mute" },
};

/** Deal status of a listing, derived from the brokerage pipeline:
 *  sold = a closed deal on it; in progress = at least one live lead; otherwise available. */
function listingStatus(id: string, leads: Lead[]): { status: PinStatus; buyers: Lead[]; closedBy?: Lead } {
  const on = leads.filter((l) => l.chosenListingId === id);
  const closedBy = on.find((l) => l.status === "closed");
  const buyers = on.filter((l) => ACTIVE.includes(l.status) && !l.archived).sort((a, b) => ACTIVE.indexOf(b.status) - ACTIVE.indexOf(a.status));
  return { status: closedBy ? "sold" : buyers.length ? "active" : "available", buyers, closedBy };
}
const soldWord = (l: Listing) => (l.kind === "rent" || l.kind === "stay" ? "Leased" : "Sold");

function StatusChip({ s, l }: { s: PinStatus; l: Listing }) {
  const m = STATUS_META[s];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.chip}`}><i className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{s === "sold" ? soldWord(l) : m.label}</span>;
}

function Listings({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  // Only the signed-in agent's own listings (list and map). Status still counts every lead on them,
  // including clients worked by other agents, since that's the real state of the property.
  // Listings with deal activity or a drone exterior model first, so the 8 shown are the most useful.
  const mapped = useMemo(() => {
    const busy = new Set(leads.map((l) => l.chosenListingId));
    const rank = (l: Listing) => (busy.has(l.id) ? 2 : 0) + (hasExterior(l.id) ? 1 : 0);
    return listingsSync().filter((l) => l.agentId === ME).map((l, i) => ({ l, i })).sort((a, b) => rank(b.l) - rank(a.l) || a.i - b.i).slice(0, 8).map((x) => x.l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mine = mapped;
  const info = useMemo(() => Object.fromEntries(mapped.map((l) => [l.id, listingStatus(l.id, leads)])), [mapped, leads]);
  const pinStatus = useMemo(() => Object.fromEntries(mapped.map((l) => [l.id, info[l.id].status])), [mapped, info]);
  const [editing, setEditing] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [upload, setUpload] = useState(false);
  const [full, setFull] = useState(false);
  const count = (s: PinStatus) => mapped.filter((l) => pinStatus[l.id] === s).length;
  return (
    <div>
      <Header title="Listings" sub={`${mine.length} active`} />
      <div className="px-5 pb-6 space-y-2.5">
        <div className="relative isolate h-44 rounded-2xl overflow-hidden shadow-card">
          {!full && <MapView listings={mapped} status={pinStatus} aerial={false} className="absolute inset-0" />}
          <button onClick={() => setFull(true)} className="absolute inset-0 z-[500]" aria-label="Open full-screen map" />
          <div className="absolute left-2 bottom-2 z-[501] pointer-events-none flex gap-1">
            {(Object.keys(STATUS_META) as PinStatus[]).map((s) => <span key={s} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 text-[10px] font-semibold shadow-card"><i className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} />{STATUS_META[s].label} {count(s)}</span>)}
          </div>
          <span className="absolute right-2 top-2 z-[501] pointer-events-none flex items-center gap-1 px-2.5 py-1 rounded-full bg-navy text-white text-[11px] font-semibold"><Icon name="map" className="w-3.5 h-3.5" />Full screen</span>
        </div>
        <button onClick={() => setUpload(true)} className="w-full h-12 rounded-2xl border-2 border-dashed border-coral/50 text-coral font-semibold text-[14px] flex items-center justify-center gap-2"><Icon name="upload" className="w-5 h-5" />Upload my own listing</button>
        {mine.map((l) => (
          <div key={l.id} className="flex gap-3 p-2.5 rounded-2xl bg-white shadow-card items-center">
            <div className="w-16 h-14 rounded-xl overflow-hidden shrink-0"><HomeArt listing={l} className="w-full h-full" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium truncate">{l.title}</div>
              {editing === l.id ? (
                <input autoFocus type="number" defaultValue={prices[l.id] ?? l.price} onBlur={(e) => { setPrices({ ...prices, [l.id]: +e.target.value }); setEditing(null); }} className="w-28 h-7 rounded-lg bg-blush px-2 text-[13px] outline-none" />
              ) : (
                <div className="text-[12px] text-mute">{price({ ...l, price: prices[l.id] ?? l.price })} · {bedsBaths(l)}</div>
              )}
              <div className="mt-1 flex gap-1 items-center"><StatusChip s={pinStatus[l.id]} l={l} />{[l.style, ...l.ambience.slice(0, 1)].map((t) => <span key={t} className="px-1.5 py-0.5 rounded-md bg-blush text-[10px] text-mute">{t}</span>)}</div>
            </div>
            <button onClick={() => setEditing(l.id)} className="w-8 h-8 rounded-full bg-blush flex items-center justify-center text-mute"><Icon name="edit" className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      {upload && <UploadSheet onClose={() => setUpload(false)} />}
      {full && <ListingsMap listings={mapped} info={info} pinStatus={pinStatus} onClose={() => setFull(false)} onOpenLead={onOpen} />}
    </div>
  );
}

function ListingsMap({ listings, info, pinStatus, onClose, onOpenLead }: {
  listings: Listing[];
  info: Record<string, ReturnType<typeof listingStatus>>;
  pinStatus: Record<string, PinStatus>;
  onClose: () => void;
  onOpenLead: (id: string) => void;
}) {
  const [filter, setFilter] = useState<PinStatus | "all">("all");
  const [sel, setSel] = useState<string | null>(null);
  const shown = filter === "all" ? listings : listings.filter((l) => pinStatus[l.id] === filter);
  const l = sel ? listings.find((x) => x.id === sel) : undefined;
  const st = l ? info[l.id] : undefined;
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [layer, setLayer] = useState<BaseLayer>("map");
  const [tour, setTour] = useState<Listing | null>(null);
  const [outside, setOutside] = useState<Listing | null>(null);
  const ext = l ? exteriorOf(l.id) : undefined;
  return (
    <div className="absolute inset-0 z-20 isolate bg-[#F5F7FA] fadein">
      {mode === "2d"
        ? <MapView listings={shown} selected={sel || undefined} onSelect={setSel} stableView status={pinStatus} layer={layer} onLayer={setLayer} className="absolute inset-0" />
        : <MapView3D listings={shown} selected={sel || undefined} onSelect={setSel} status={pinStatus} layer={layer} className="absolute inset-0" />}
      <div className="absolute top-[108px] inset-x-4 z-[500] flex items-center justify-end gap-2 pointer-events-none">
        <LayerSwitch value={layer} onChange={setLayer} className="pointer-events-auto" />
        <div className="pointer-events-auto flex p-0.5 rounded-full bg-white/95 shadow-card text-[11px] font-bold" role="group" aria-label="Map view">
          {(["2d", "3d"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`w-9 h-7 rounded-full ${mode === m ? "bg-navy text-white" : "text-mute"}`}>{m.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <div className="absolute top-0 inset-x-0 z-[500] pt-14 px-4 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button onClick={onClose} className="w-10 h-10 shrink-0 rounded-full bg-white shadow-card flex items-center justify-center" aria-label="Close map"><Icon name="back" className="w-4 h-4" /></button>
          <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
            {(["all", "available", "active", "sold"] as const).map((f) => {
              const n = f === "all" ? listings.length : listings.filter((x) => pinStatus[x.id] === f).length;
              return (
                <button key={f} onClick={() => { setFilter(f); setSel(null); }} className={`shrink-0 h-9 px-3 rounded-full text-[12px] font-semibold shadow-card flex items-center gap-1.5 ${filter === f ? "bg-navy text-white" : "bg-white text-ink"}`}>
                  {f !== "all" && <i className={`w-2 h-2 rounded-full ${STATUS_META[f].dot}`} />}{f === "all" ? "All" : STATUS_META[f].label}<span className="opacity-60">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {l && st ? (
        <div className="absolute inset-x-3 bottom-6 z-[500] rounded-[24px] bg-white shadow-card p-3 rise">
          <div className="flex gap-3">
            <div className="w-20 h-16 rounded-xl overflow-hidden shrink-0"><HomeArt listing={l} className="w-full h-full" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5"><StatusChip s={st.status} l={l} /></div>
              <div className="mt-1 text-[14px] font-semibold truncate">{l.title}</div>
              <div className="text-[12px] text-mute truncate">{price(l)} · {bedsBaths(l)} · {l.neighborhood}</div>
            </div>
            <button onClick={() => setSel(null)} className="w-7 h-7 rounded-full bg-blush flex items-center justify-center text-mute shrink-0" aria-label="Close"><Icon name="x" className="w-3.5 h-3.5" /></button>
          </div>
          <CostarFacts l={l} />
          <div className="mt-2.5 border-t border-[#EDF2F9] pt-2.5">
            {st.status === "sold" && st.closedBy && <LeadRow lead={st.closedBy} label={`${soldWord(l)} to`} onOpen={onOpenLead} />}
            {st.status === "active" && (
              <>
                <div className="text-[11px] text-mute mb-1">{st.buyers.length} interested {st.buyers.length === 1 ? "client" : "clients"}</div>
                <div className="space-y-1">{st.buyers.map((b) => <LeadRow key={b.id} lead={b} onOpen={onOpenLead} />)}</div>
              </>
            )}
            {st.status === "available" && <div className="text-[12px] text-mute">No one is interested yet. Pebble will suggest it to matching clients.</div>}
          </div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => setTour(l)} className="flex-1 h-10 rounded-full bg-blush text-ink text-[13px] font-semibold flex items-center justify-center gap-1.5"><Icon name="cube" className="w-4 h-4 text-coral" />3D interior</button>
            {ext && <button onClick={() => setOutside(l)} className="flex-1 h-10 rounded-full bg-navy text-white text-[13px] font-semibold flex items-center justify-center gap-1.5"><Icon name="home" className="w-4 h-4" />3D exterior</button>}
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-8 z-[500] text-center pointer-events-none"><span className="px-3 py-1.5 rounded-full bg-white/95 shadow-card text-[12px] text-mute">Tap a pin to see who&apos;s interested</span></div>
      )}
      {tour && (
        <div className="absolute inset-0 z-[700] bg-blush fadein">
          {tour.matterportId ? <MatterportTour modelId={tour.matterportId} title={tour.title} className="absolute inset-0" /> : <Tour3D listing={tour} className="absolute inset-0" />}
          <div className="absolute top-12 left-4 right-4 flex items-center justify-between pointer-events-none">
            <button onClick={() => setTour(null)} className="pointer-events-auto w-10 h-10 rounded-full bg-white/90 shadow-card flex items-center justify-center" aria-label="Back to map"><Icon name="back" /></button>
            <div className="px-3 py-1.5 rounded-full bg-white/90 shadow-card text-xs font-medium truncate max-w-[70%]">{tour.matterportId ? "Matterport 3D scan · via CoStar" : "Living room · drag to look around"}</div>
          </div>
        </div>
      )}
      {outside && exteriorOf(outside.id) && (
        <div className="absolute inset-0 z-[700] bg-[#CFD8DF] fadein">
          <ExteriorView sid={exteriorOf(outside.id)!.sid} className="absolute inset-0" />
          <div className="absolute top-12 left-4 right-4 flex items-center justify-between pointer-events-none">
            <button onClick={() => setOutside(null)} className="pointer-events-auto w-10 h-10 rounded-full bg-white/90 shadow-card flex items-center justify-center" aria-label="Back to map"><Icon name="back" /></button>
            <div className="px-3 py-1.5 rounded-full bg-white/90 shadow-card text-xs font-medium truncate max-w-[70%]">Drone 3D exterior · Matterport</div>
          </div>
          <div className="absolute bottom-8 inset-x-0 text-center pointer-events-none"><span className="px-3 py-1.5 rounded-full bg-white/90 shadow-card text-[12px] text-mute">{outside.address || outside.title} · drag to orbit</span></div>
        </div>
      )}
    </div>
  );
}

/** Market facts straight from the CoStar record behind the listing (Homes.com MLS / Apartments.com). */
function CostarFacts({ l }: { l: Listing }) {
  const c = l.costar;
  if (!c) return null;
  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const change = c.originalPrice && c.originalPrice !== l.price ? (l.price - c.originalPrice) / c.originalPrice : null;
  const facts: [string, string][] = [];
  if (c.dom != null) facts.push(["On market", `${c.dom} days`]);
  if (c.pricePerSqft) facts.push(["Price / sqft", usd(c.pricePerSqft)]);
  if (change != null) facts.push(["vs. list price", `${change > 0 ? "+" : ""}${(change * 100).toFixed(1)}%`]);
  if (c.hoa) facts.push(["HOA", `${usd(c.hoa)}/mo`]);
  if (c.unitsAvailable != null) facts.push(["Units open", c.totalUnits ? `${c.unitsAvailable} of ${c.totalUnits}` : String(c.unitsAvailable)]);
  if (c.vacancyPercent != null) facts.push(["Vacancy", `${c.vacancyPercent.toFixed(1)}%`]);
  if (l.yearBuilt && facts.length < 4) facts.push(["Built", String(l.yearBuilt)]);
  if (!facts.length) return null;
  return (
    <div className="mt-2.5">
      <div className="grid grid-cols-4 gap-1.5">
        {facts.slice(0, 4).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-blush px-2 py-1.5 min-w-0"><div className="text-[9px] text-mute truncate">{k}</div><div className="text-[12px] font-semibold truncate">{v}</div></div>
        ))}
      </div>
      <div className="mt-1 text-[9px] text-mute">Data: CoStar · {c.dataset === "apartment-listing" ? "Apartments.com" : "Homes.com MLS"}{c.listDate ? ` · listed ${c.listDate.slice(0, 10)}` : ""}</div>
    </div>
  );
}

function LeadRow({ lead, label, onOpen }: { lead: Lead; label?: string; onOpen: (id: string) => void }) {
  const stage = lead.status === "new" ? "Needs verification" : STAGES.find((s) => s.id === lead.status)?.label;
  return (
    <button onClick={() => onOpen(lead.id)} className="w-full flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-blush text-left">
      <Avatar initials={initials(lead.clientName)} color="#16325A" size={30} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate">{label && <span className="text-mute font-normal">{label} </span>}{lead.clientName}</div>
        <div className="text-[11px] text-mute truncate">{stage} · {agentById(lead.agentId).name} · active {ago(lead.lastClientActivity)}</div>
      </div>
      <Icon name="chev" className="w-4 h-4 text-mute" />
    </button>
  );
}

function UploadSheet({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<string[]>([]);
  const [tags, setTags] = useState<Awaited<ReturnType<typeof analyzePhotos>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [p, setP] = useState(2500);
  const [beds, setBeds] = useState(2);
  const onFiles = async (fl: FileList) => {
    const urls = await Promise.all([...fl].slice(0, 4).map((f) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); })));
    setFiles(urls);
    setBusy(true);
    const t = await analyzePhotos(urls);
    setTags(t);
    setBusy(false);
  };
  const save = () => {
    const l: Listing = {
      id: "up-" + Date.now().toString(36), title: title || "My new listing", kind: "rent", propertyType: "apartment", price: p, beds, baths: 1, sqft: 900,
      neighborhood: "Greater Heights", address: "Houston, TX", lat: 29.79, lng: -95.398, minutesToCampus: 12, commuteMode: "drive", city: "Houston", anchor: "Downtown Houston", petFriendly: true, availableFrom: "Now",
      style: tags?.style[0] || "contemporary", materials: tags?.materials || [], colors: tags?.colors || [], ambience: tags?.ambience || [], light: tags?.light ?? 0.5,
      description: "Uploaded by Maya Chen.", highlights: [], agentId: ME, yearBuilt: 2000, artSeed: 99, source: "agent-upload", photos: files,
    };
    saveUpload(l);
    onClose();
  };
  return (
    <div className="absolute inset-0 z-40 bg-black/25 flex flex-col justify-end fadein" onClick={onClose}>
      <div className="rounded-t-[30px] bg-white p-5 pb-9 rise" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-[#E1E7EF] mx-auto mb-4" />
        <h3 className="text-[20px] font-bold">New listing</h3>
        <label className="mt-3 block h-28 rounded-2xl bg-blush border-2 border-dashed border-[#E1E7EF] cursor-pointer overflow-hidden">
          {files.length ? <div className="flex h-full gap-1">{files.map((f) => <img key={f} src={f} alt="" className="h-full flex-1 object-cover" />)}</div> : <div className="h-full flex flex-col items-center justify-center text-mute text-[13px]"><Icon name="image" />Add photos — we tag the vibe for you</div>}
          <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && onFiles(e.target.files)} />
        </label>
        {busy && <div className="mt-2 text-[12px] text-violet flex items-center gap-1.5"><Icon name="spark" className="w-4 h-4" />Reading the photos…</div>}
        {tags && tags.relevant === false && tags.subject !== "unknown" && (
          <div className="mt-2 rounded-xl bg-[#FBF1DC] text-[#A8710F] p-2.5 text-[12px] leading-snug">These photos don&apos;t look like a property{tags.description ? ` (${tags.description})` : ""}. Add photos of the home so buyers and the vibe search see the right thing.</div>
        )}
        {tags?.subject === "unknown" && <div className="mt-2 text-[11px] text-mute">Couldn&apos;t check the photos with AI right now; tags below are a rough color read.</div>}
        {tags && <div className="mt-2 flex flex-wrap gap-1.5">{[...tags.style, ...tags.ambience, ...tags.materials, ...tags.colors].map((t, i) => <span key={t + i} className="word px-2 py-0.5 rounded-full bg-coral-soft text-coral-deep text-[12px]" style={{ animationDelay: `${i * 60}ms` }}>{t}</span>)}</div>}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="mt-3 w-full h-11 rounded-xl bg-blush px-3 outline-none text-[14px]" />
        <div className="mt-2 flex gap-2">
          <input type="number" value={p} onChange={(e) => setP(+e.target.value)} className="flex-1 h-11 rounded-xl bg-blush px-3 outline-none text-[14px]" />
          <input type="number" value={beds} onChange={(e) => setBeds(+e.target.value)} className="w-20 h-11 rounded-xl bg-blush px-3 outline-none text-[14px]" />
        </div>
        <button onClick={save} className="mt-4 w-full h-12 rounded-full bg-coral text-white font-semibold">Publish listing</button>
      </div>
    </div>
  );
}
