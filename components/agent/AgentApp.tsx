"use client";
import { useEffect, useMemo, useState } from "react";
import type { Lead, LeadStatus, Listing } from "@/lib/types";
import { getListing, listingsSync, analyzePhotos } from "@/lib/adapters";
import { saveUpload } from "@/lib/adapters/agentUploads";
import { agentById, bedsBaths, commute, price } from "@/lib/recap";
import { contactClient, nudgeFor, now, sendNudge, setCheck, setStatus, useStore, verifyLead } from "@/lib/store";
import { aiDraft, aiFollowup } from "@/lib/ai";
import HomeArt from "@/components/HomeArt";
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
    <div className="relative h-full w-full bg-[#FAF7F7] text-ink overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {tab === "inbox" && <Inbox leads={leads} onOpen={setOpen} nudges={nudgeCount} goNudges={() => setTab("nudges")} />}
        {tab === "pipeline" && <Pipeline leads={leads} onOpen={setOpen} />}
        {tab === "nudges" && <Nudges leads={leads} />}
        {tab === "listings" && <Listings />}
      </div>
      <nav className="shrink-0 h-[84px] pb-6 bg-white border-t border-[#f0e6e6] grid grid-cols-4">
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
        <button onClick={goNudges} className="mx-5 mb-4 w-[calc(100%-40px)] flex items-center gap-3 p-3.5 rounded-2xl bg-ink text-white text-left">
          <div className="w-9 h-9 rounded-full bg-coral flex items-center justify-center"><Icon name="spark" className="w-5 h-5" /></div>
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
              <div className="relative"><Avatar initials={initials(l.clientName)} color={isNew ? "#E5322D" : "#C9B9BB"} size={42} />{isNew && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-coral border-2 border-white" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline"><span className="font-semibold text-[15px]">{l.clientName}</span><span className="text-[11px] text-mute">{ago(l.createdAt)}</span></div>
                <div className="text-[13px] text-[#5b5357] line-clamp-2 leading-snug mt-0.5">{l.recap.summary}</div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${isNew ? "bg-coral text-white" : "bg-blush text-mute"}`}>{isNew ? "New lead" : STAGES.find((s) => s.id === l.status)?.label}</span>
                  {l.language && <span className="px-2 py-0.5 rounded-full bg-[#EEF2FF] text-[#3B4CC0] font-semibold">{l.language} · translated</span>}
                  {isNew && now() - l.createdAt > 15 * 60000 && <span className="px-2 py-0.5 rounded-full bg-[#FFF4D6] text-[#8A6A12] font-semibold">Waiting {Math.round((now() - l.createdAt) / 60000)} min</span>}
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
    <div className="absolute inset-0 z-30 bg-[#FAF7F7] flex flex-col rise">
      <div className="pt-14 px-5 pb-3 flex items-center gap-3 bg-[#FAF7F7]">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white shadow-card flex items-center justify-center"><Icon name="back" className="w-4 h-4" /></button>
        <Avatar initials={initials(lead.clientName)} color="#E5322D" size={38} />
        <div className="flex-1">
          <div className="font-semibold text-[16px] leading-tight">{lead.clientName}</div>
          <div className="text-[12px] text-mute">via Pebble voice · {ago(lead.createdAt)}</div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${lead.status === "new" ? "bg-coral text-white" : "bg-[#E4F4EA] text-[#1F7A4C]"}`}>{lead.status === "new" ? "Needs verification" : STAGES.find((s) => s.id === lead.status)?.label}</span>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-36 space-y-4">
        <section className="rounded-3xl bg-white shadow-card p-4">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-coral"><Icon name="spark" className="w-4 h-4" />Agentic Assistant recap{lead.events.some((e) => e.label.startsWith("Agentic Assistant recap written") || e.label.startsWith("AI recap written")) && <span className="ml-auto text-[10px] text-mute font-medium">by Gemini</span>}</div>
          <p className="mt-2 text-[15px] leading-snug font-medium">{lead.recap.summary}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-blush p-2.5"><div className="text-[11px] text-mute">Budget</div><div className="text-[14px] font-semibold">{lead.recap.budget}</div></div>
            <div className="rounded-2xl bg-blush p-2.5"><div className="text-[11px] text-mute">Timeline</div><div className="text-[14px] font-semibold">{lead.recap.timeline}</div></div>
          </div>
          {lead.recap.mustHaves.length > 0 && <div className="mt-3"><div className="text-[11px] text-mute mb-1.5">Must-haves</div><div className="flex flex-wrap gap-1.5">{lead.recap.mustHaves.map((m) => <span key={m} className="px-2.5 py-1 rounded-full bg-ink text-white text-[12px] font-medium">{m}</span>)}</div></div>}
          {lead.recap.niceToHaves.length > 0 && <div className="mt-2.5"><div className="text-[11px] text-mute mb-1.5">Vibe</div><div className="flex flex-wrap gap-1.5">{lead.recap.niceToHaves.map((m) => <span key={m} className="px-2.5 py-1 rounded-full bg-coral-soft text-coral-deep text-[12px] font-medium">{m}</span>)}</div></div>}
          {lead.transcript.length > 0 && <p className="mt-3 text-[12px] text-mute italic leading-snug">“{lead.transcript.join(" … ")}”</p>}
        </section>

        <section>
          <div className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><Icon name="spark" className="w-4 h-4 text-coral" />Homes suggested by the Agentic Assistant</div>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-5 px-5">
            {homes.map((h, i) => (
              <div key={h.id} className="shrink-0 w-[150px] rounded-2xl bg-white shadow-card overflow-hidden">
                <div className="relative h-[86px]"><HomeArt listing={h} className="w-full h-full" />{i === 0 && <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-coral text-white text-[10px] font-bold">Client picked</span>}</div>
                <div className="p-2"><div className="text-[13px] font-bold">{price(h)}</div><div className="text-[11px] truncate">{h.title}</div><div className="text-[10px] text-mute">{commute(h)}</div></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white shadow-card p-4">
          <div className="flex items-center justify-between"><div className="text-[13px] font-semibold">Human verification</div><div className="text-[11px] text-mute">{Object.values(lead.checklist).filter(Boolean).length}/4</div></div>
          <div className="mt-2 divide-y divide-[#f3eaea]">
            {checks.map(([k, t, d]) => (
              <button key={k} onClick={() => setCheck(lead.id, k, !lead.checklist[k])} className="w-full flex items-center gap-3 py-2.5 text-left">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center transition ${lead.checklist[k] ? "bg-coral text-white" : "border-2 border-[#e6d6d7]"}`}>{lead.checklist[k] && <Icon name="check" className="w-4 h-4" stroke={3} />}</span>
                <div><div className="text-[14px] font-medium">{t}</div><div className="text-[11px] text-mute">{d}</div></div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-mute">The Agentic Assistant suggests, you verify. Nothing reaches the client until you confirm.</p>
        </section>

        {lead.language && (
          <div className="rounded-2xl bg-[#EEF2FF] text-[#3B4CC0] p-3 text-[12px] leading-snug flex gap-2"><Icon name="chat" className="w-4 h-4 shrink-0" /><span>Client speaks <b>{lead.language}</b>. You read and write in English — Pebble translates both ways.</span></div>
        )}
        {lead.status !== "new" && (
          <section className="rounded-3xl bg-white shadow-card p-4">
            <div className="text-[13px] font-semibold mb-2">Deal</div>
            <div className="flex gap-2">
              {next[lead.status] && <button onClick={() => setStatus(lead.id, next[lead.status]![0])} className="flex-1 h-10 rounded-full bg-ink text-white text-[13px] font-semibold">{next[lead.status]![1]}</button>}
              {lead.status !== "closed" && <button onClick={() => setStatus(lead.id, "cancelled")} className="h-10 px-4 rounded-full border border-[#e6d6d7] text-[13px] font-medium text-mute flex items-center gap-1"><Icon name="archive" className="w-4 h-4" />Cancel</button>}
            </div>
          </section>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-5 pt-3 pb-8 bg-white border-t border-[#f0e6e6] flex gap-2.5">
        <button disabled={lead.status === "new" && !allChecked} onClick={() => verifyLead(lead.id)} className={`flex-1 py-3.5 disabled:opacity-40 rounded-full font-semibold text-[15px] flex items-center justify-center gap-1.5 ${lead.status === "new" ? "bg-coral text-white" : "bg-[#E4F4EA] text-[#1F7A4C]"}`}>
          <Icon name="check" className="w-5 h-5" stroke={2.6} />{lead.status === "new" ? "Verify" : "Verified"}
        </button>
        <button onClick={onContact} className="flex-1 py-3.5 rounded-full bg-ink text-white font-semibold text-[15px] flex items-center justify-center gap-1.5"><Icon name="phone" className="w-5 h-5" />Contact client</button>
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
        <div className="w-10 h-1 rounded-full bg-[#e8d5d6] mx-auto mb-4" />
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-coral"><Icon name="spark" className="w-4 h-4" />{drafting ? "Gemini is drafting…" : "Agentic Assistant draft · edit before sending"}</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} className={`mt-2 w-full h-32 rounded-2xl bg-blush p-3 text-[15px] leading-snug outline-none resize-none ${drafting ? "opacity-60" : ""}`} />
        {native && <div className="mt-2 text-[12px] text-mute leading-snug"><b className="text-[#3B4CC0]">Client sees ({lead.language}):</b> {native}</div>}
        <div className="mt-3 flex gap-2.5">
          <a href={`tel:${lead.clientPhone}`} className="h-12 px-5 rounded-full border border-[#e6d6d7] flex items-center gap-1.5 font-semibold text-[14px]"><Icon name="phone" className="w-4 h-4" />Call</a>
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
              <div className="flex items-center justify-between mb-1.5"><div className="text-[13px] font-semibold flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${s.id === "closed" ? "bg-[#2E9E6A]" : s.id === "new" ? "bg-coral" : "bg-ink"}`} />{s.label}</div><span className="text-[12px] text-mute">{items.length}</span></div>
              <div className="space-y-1.5">
                {items.map((l) => (
                  <button key={l.id} onClick={() => onOpen(l.id)} className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white shadow-card text-left">
                    <Avatar initials={initials(l.clientName)} color={s.id === "new" ? "#E5322D" : "#C9B9BB"} size={30} />
                    <div className="flex-1 min-w-0"><div className="text-[14px] font-medium">{l.clientName}</div><div className="text-[11px] text-mute truncate">{getListing(l.chosenListingId)?.title}</div></div>
                    <div className="text-[12px] font-semibold">${l.dealValue.toLocaleString()}</div>
                  </button>
                ))}
                {!items.length && <div className="text-[12px] text-[#c8b8ba] px-1">—</div>}
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
const TOOL_LABEL: Record<string, string> = { get_deal_history: "Read the deal history", check_listing: "Re-checked the listing", find_similar_houses: "Looked for similar houses", submit_draft: "Drafted the check-in" };

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
                <div className="w-9 h-9 rounded-full bg-coral-soft text-coral flex items-center justify-center shrink-0"><Icon name="spark" className="w-5 h-5" /></div>
                <div className="text-[15px] font-semibold leading-snug">{n!.text}</div>
              </div>
              {run && (
                <div className="mt-3 rounded-2xl bg-[#FAF7F7] p-3 space-y-1.5">
                  <div className="text-[11px] font-semibold text-mute">{run.busy ? "Agentic Assistant is investigating…" : run.failed ? "Agentic Assistant offline · using the standard draft" : "Agentic Assistant follow-up · Gemini"}</div>
                  {run.busy && <div className="h-3 w-2/3 rounded shimmer" />}
                  {run.trace?.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px] rise" style={{ animationDelay: `${i * 120}ms` }}>
                      <span className="w-4 h-4 rounded-full bg-[#2E9E6A] text-white flex items-center justify-center shrink-0 mt-px"><Icon name="check" className="w-3 h-3" stroke={3} /></span>
                      <span><b className="font-semibold">{TOOL_LABEL[s.tool] || s.tool}</b></span>
                    </div>
                  ))}
                  {run.reason && <div className="text-[12px] text-[#5b5357] leading-snug pt-1">{run.reason}</div>}
                </div>
              )}
              <textarea value={edits[l.id] ?? n!.draft} onChange={(e) => setEdits({ ...edits, [l.id]: e.target.value })} className="mt-3 w-full h-24 rounded-2xl bg-blush p-3 text-[14px] leading-snug outline-none resize-none" />
              <div className="mt-2.5 flex gap-2">
                <button onClick={() => sendNudge(l.id, edits[l.id] ?? n!.draft)} className="flex-1 h-11 rounded-full bg-coral text-white font-semibold text-[14px] flex items-center justify-center gap-1.5"><Icon name="send" className="w-4 h-4" />Send</button>
                {!run && <button onClick={() => runAgent(l)} className="h-11 px-3 rounded-full border border-coral/40 text-coral text-[13px] font-semibold flex items-center gap-1"><Icon name="spark" className="w-4 h-4" />Investigate</button>}
                <button onClick={() => setStatus(l.id, "cancelled")} className="h-11 px-3 rounded-full border border-[#e6d6d7] text-mute text-[13px] font-medium">Cancelled</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Listings() {
  const mine = useMemo(() => listingsSync().filter((l) => l.agentId === ME || l.source === "agent-upload").slice(0, 8), []);
  const [editing, setEditing] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [upload, setUpload] = useState(false);
  return (
    <div>
      <Header title="Listings" sub={`${mine.length} active`} />
      <div className="px-5 pb-6 space-y-2.5">
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
              <div className="mt-1 flex gap-1">{[l.style, ...l.ambience.slice(0, 2)].map((t) => <span key={t} className="px-1.5 py-0.5 rounded-md bg-blush text-[10px] text-mute">{t}</span>)}</div>
            </div>
            <button onClick={() => setEditing(l.id)} className="w-8 h-8 rounded-full bg-blush flex items-center justify-center text-mute"><Icon name="edit" className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      {upload && <UploadSheet onClose={() => setUpload(false)} />}
    </div>
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
        <div className="w-10 h-1 rounded-full bg-[#e8d5d6] mx-auto mb-4" />
        <h3 className="text-[20px] font-bold">New listing</h3>
        <label className="mt-3 block h-28 rounded-2xl bg-blush border-2 border-dashed border-[#ecd8d9] cursor-pointer overflow-hidden">
          {files.length ? <div className="flex h-full gap-1">{files.map((f) => <img key={f} src={f} alt="" className="h-full flex-1 object-cover" />)}</div> : <div className="h-full flex flex-col items-center justify-center text-mute text-[13px]"><Icon name="image" />Add photos — we tag the vibe for you</div>}
          <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && onFiles(e.target.files)} />
        </label>
        {busy && <div className="mt-2 text-[12px] text-coral flex items-center gap-1.5"><Icon name="spark" className="w-4 h-4" />Reading the photos…</div>}
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
