"use client";
/* Customer accounts for the homebuyer app: welcome, sign up (details → privacy & consent), log in,
   the privacy notice, and a profile screen to change consent, download or delete their data. */
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import Mascot from "@/components/Mascot";
import { deleteAccount, exportMyData, logIn, logOut, PRIVACY_VERSION, signUp, updateAccount, updateConsent } from "@/lib/store";
import type { CustomerProfile } from "@/lib/types";

const field = "h-12 w-full rounded-full border border-line bg-card px-4 text-[15px] outline-none focus:border-sage placeholder:text-stone";

function Screen({ title, sub, onBack, children }: { title: string; sub?: string; onBack?: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-canvas fadein">
      <div className="px-5 pt-14 flex items-center justify-between">
        {onBack ? <button onClick={onBack} className="text-sm text-stone">Back</button> : <span />}
        <div className="flex items-center gap-1.5 text-[15px] font-semibold text-ink"><Mascot sparkle={false} className="h-7 w-7" />Pebble</div>
        <span className="w-8" />
      </div>
      <div className="px-6 pt-6">
        <h2 className="font-display text-[28px] leading-tight">{title}</h2>
        {sub && <p className="mt-1.5 text-[15px] text-stone">{sub}</p>}
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-5 pb-10">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, title, body, required = false }: { on: boolean; onChange: (v: boolean) => void; title: string; body: ReactNode; required?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`w-full text-left flex gap-3 rounded-3xl p-4 border transition ${on ? "border-sage bg-sage-soft/60" : "border-line bg-card"}`}>
      <span className={`mt-0.5 w-11 h-6 rounded-full shrink-0 relative transition ${on ? "bg-sage" : "bg-line"}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} /></span>
      <span className="min-w-0">
        <span className="block text-[15px]">{title}{required && <span className="text-clay"> · required</span>}</span>
        <span className="block text-[13px] text-stone mt-0.5 leading-snug">{body}</span>
      </span>
    </button>
  );
}

export type AuthMode = "welcome" | "signup" | "login";

/** reason: why we are asking, e.g. "Create an account so a Real Estate Agent can reach you." */
export function AuthFlow({ start = "welcome", reason, onDone, onClose }: { start?: AuthMode; reason?: string; onDone: () => void; onClose: () => void }) {
  const [mode, setMode] = useState<AuthMode | "consent" | "privacy">(start);
  const [back, setBack] = useState<AuthMode | "consent">("welcome");
  const [d, setD] = useState({ name: "", email: "", password: "", age: "", location: "", phone: "" });
  const [c, setC] = useState({ terms: false, activity: true, contact: true, shareWithOwners: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const privacy = (from: AuthMode | "consent") => { setBack(from); setMode("privacy"); };

  if (mode === "privacy") return <PrivacyNotice onClose={() => setMode(back)} />;

  if (mode === "welcome") {
    return (
      <div className="absolute inset-0 z-40 flex flex-col items-center bg-canvas px-8 text-center fadein">
        <div className="pt-16 flex items-center gap-2 text-[17px] font-semibold text-ink"><Mascot className="h-10 w-10 animate-float" />Pebble</div>
        <div className="flex-1 w-full flex flex-col items-center justify-center -mt-6">
          <h1 className="font-display text-[1.9rem] leading-tight">Say the house.<br />Find your home.</h1>
          <p className="mt-4 text-[15px] text-stone">{reason || "Make an account to save the homes you love and get matches that fit you better."}</p>
          <button onClick={() => setMode("signup")} className="mt-10 w-full h-14 rounded-full bg-clay text-white text-[17px]">Create an account</button>
          <button onClick={() => setMode("login")} className="mt-3 w-full h-14 rounded-full border border-line bg-card text-[17px]">Log in</button>
        </div>
        <button onClick={onClose} className="pb-10 text-sm text-stone underline-offset-4 hover:underline">Look around first</button>
      </div>
    );
  }

  if (mode === "login") {
    const go = async () => {
      setBusy(true); setErr("");
      const r = await logIn(d.email, d.password);
      setBusy(false);
      if (r.ok) onDone(); else setErr(r.error);
    };
    return (
      <Screen title="Welcome back" sub={reason} onBack={() => (start === "login" ? onClose() : setMode("welcome"))}>
        <form className="space-y-2.5" onSubmit={(e) => { e.preventDefault(); void go(); }}>
          <input aria-label="Email" type="email" autoComplete="email" value={d.email} onChange={set("email")} placeholder="Email" className={field} />
          <input aria-label="Password" type="password" autoComplete="current-password" value={d.password} onChange={set("password")} placeholder="Password" className={field} />
          {err && <p className="text-sm text-clay pt-1">{err}</p>}
          <button disabled={busy || !d.email || !d.password} className="mt-3 w-full h-14 rounded-full bg-clay text-white text-[17px] disabled:opacity-50">{busy ? "One moment…" : "Log in"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-stone">New here? <button onClick={() => setMode("signup")} className="text-sage">Create an account</button></p>
      </Screen>
    );
  }

  if (mode === "signup") {
    const ok = d.name.trim() && /\S+@\S+\.\S+/.test(d.email) && d.password.length >= 8;
    return (
      <Screen title="Create your account" sub={reason || "So your agent knows who they're helping."} onBack={() => (start === "signup" ? onClose() : setMode("welcome"))}>
        <form className="space-y-2.5" onSubmit={(e) => { e.preventDefault(); if (ok) { setErr(""); setMode("consent"); } }}>
          <input aria-label="Full name" autoComplete="name" value={d.name} onChange={set("name")} placeholder="Full name" className={field} />
          <input aria-label="Email" type="email" autoComplete="email" value={d.email} onChange={set("email")} placeholder="Email" className={field} />
          <input aria-label="Password" type="password" autoComplete="new-password" value={d.password} onChange={set("password")} placeholder="Password (8+ characters)" className={field} />
          <div className="flex gap-2.5">
            <input aria-label="Age" inputMode="numeric" value={d.age} onChange={(e) => setD({ ...d, age: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="Age" className={`${field} w-24 shrink-0`} />
            <input aria-label="Where you live now" autoComplete="address-level2" value={d.location} onChange={set("location")} placeholder="Where you live now" className={field} />
          </div>
          <input aria-label="Phone (optional)" type="tel" autoComplete="tel" value={d.phone} onChange={set("phone")} placeholder="Phone (optional)" className={field} />
          <p className="text-[12px] text-stone px-1">Age and location are optional. They help us suggest the right areas.</p>
          <button disabled={!ok} className="mt-3 w-full h-14 rounded-full bg-clay text-white text-[17px] disabled:opacity-50">Continue</button>
        </form>
        <p className="mt-6 text-center text-sm text-stone">Already have an account? <button onClick={() => setMode("login")} className="text-sage">Log in</button></p>
      </Screen>
    );
  }

  // consent
  const create = async () => {
    setBusy(true); setErr("");
    const r = await signUp({ name: d.name, email: d.email, password: d.password, age: Number(d.age) || undefined, location: d.location, phone: d.phone, consent: c });
    setBusy(false);
    if (r.ok) onDone(); else setErr(r.error);
  };
  return (
    <Screen title="Your privacy" sub="You choose what we keep and who sees it. You can change this any time in your profile." onBack={() => setMode("signup")}>
      <div className="space-y-2.5">
        <Toggle required on={c.terms} onChange={(v) => setC({ ...c, terms: v })} title="I agree to the Terms and Privacy Notice"
          body={<>We use your details to run your account and match you with homes. <span role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); privacy("consent"); }} className="text-sage underline">Read the Privacy Notice</span></>} />
        <Toggle on={c.activity} onChange={(v) => setC({ ...c, activity: v })} title="Save my searches and the homes I look at"
          body="Gives you better matches. The brokerage also sees this in its insights, like which tags and areas are popular." />
        <Toggle on={c.contact} onChange={(v) => setC({ ...c, contact: v })} title="A Real Estate Agent can contact me"
          body="By email or phone, about homes you show interest in. Never sold to anyone else." />
        <Toggle on={c.shareWithOwners} onChange={(v) => setC({ ...c, shareWithOwners: v })} title="Owners of homes I look at can see my contact details"
          body="Your name, age and email, so an owner can reach out about a home you've viewed a lot. Off by default." />
      </div>
      {err && <p className="mt-3 text-sm text-clay">{err}</p>}
      <button onClick={() => void create()} disabled={!c.terms || busy} className="mt-5 w-full h-14 rounded-full bg-clay text-white text-[17px] disabled:opacity-50">{busy ? "Creating…" : "Create account"}</button>
      <p className="mt-3 text-center text-[12px] text-stone">Privacy Notice version {PRIVACY_VERSION}</p>
    </Screen>
  );
}

export function PrivacyNotice({ onClose }: { onClose: () => void }) {
  const items: [string, string][] = [
    ["What we collect", "Your account details (name, email, password, and if you choose: age, where you live now, phone). If you turn on saving: what you search for, which homes you open and how long you look. When you tap Interested: the home and what you told us you need."],
    ["Why", "To run your account, find homes that fit you, and let a licensed Real Estate Agent help you. With your permission, the brokerage uses activity in aggregate (popular tags, areas, time on listings) to improve its service."],
    ["Who can see it", "Your Real Estate Agent and their brokerage. Property owners only see your contact details if you turn that on. We never sell your data."],
    ["How long we keep it", "While your account is open. Turning off saving deletes your saved searches and views. Deleting your account removes your profile and activity."],
    ["Your choices", "Change your permissions, download a copy of your data, or delete your account at any time from your profile."],
    ["Fair housing", "We never use age, race, religion, national origin, sex, disability or family status to decide which homes you're shown."],
  ];
  return (
    <Screen title="Privacy Notice" sub={`Version ${PRIVACY_VERSION}`} onBack={onClose}>
      <div className="space-y-3">
        {items.map(([h, b]) => (
          <section key={h} className="rounded-3xl bg-card p-4 shadow-card">
            <h3 className="font-display text-lg">{h}</h3>
            <p className="mt-1 text-[14px] leading-relaxed text-stone">{b}</p>
          </section>
        ))}
      </div>
    </Screen>
  );
}

export function ProfileScreen({ account, onBack }: { account: CustomerProfile; onBack: () => void }) {
  const [privacy, setPrivacy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [edit, setEdit] = useState({ name: account.name || "", age: account.age ? String(account.age) : "", location: account.location || "", phone: account.phone || "" });
  const c = account.consent;
  if (privacy) return <PrivacyNotice onClose={() => setPrivacy(false)} />;
  const download = () => {
    const blob = new Blob([exportMyData()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pebble-my-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const dirty = edit.name !== (account.name || "") || edit.age !== (account.age ? String(account.age) : "") || edit.location !== (account.location || "") || edit.phone !== (account.phone || "");
  return (
    <Screen title={account.name || "Your profile"} sub={account.email} onBack={onBack}>
      <h3 className="text-sm text-stone mb-2">Your details</h3>
      <div className="space-y-2.5">
        <input aria-label="Full name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Full name" className={field} />
        <div className="flex gap-2.5">
          <input aria-label="Age" inputMode="numeric" value={edit.age} onChange={(e) => setEdit({ ...edit, age: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="Age" className={`${field} w-24 shrink-0`} />
          <input aria-label="Where you live now" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} placeholder="Where you live now" className={field} />
        </div>
        <input aria-label="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="Phone" className={field} />
        {dirty && <button onClick={() => updateAccount({ name: edit.name.trim(), age: Number(edit.age) || undefined, location: edit.location.trim(), phone: edit.phone.trim() })} className="w-full h-12 rounded-full bg-sage text-white">Save changes</button>}
      </div>

      <h3 className="text-sm text-stone mt-7 mb-2">Privacy</h3>
      {c && (
        <div className="space-y-2.5">
          <Toggle on={c.activity} onChange={(v) => updateConsent({ activity: v })} title="Save my searches and the homes I look at" body={c.activity ? "On. Turning this off also deletes what was saved." : "Off. Nothing about your browsing is kept."} />
          <Toggle on={c.contact} onChange={(v) => updateConsent({ contact: v })} title="A Real Estate Agent can contact me" body="By email or phone, about homes you show interest in." />
          <Toggle on={c.shareWithOwners} onChange={(v) => updateConsent({ shareWithOwners: v })} title="Owners of homes I look at can see my contact details" body="Your name, age and email." />
          <p className="text-[12px] text-stone px-1">Agreed to Privacy Notice {c.version} on {c.terms ? new Date(c.terms).toLocaleDateString() : "—"} · last changed {new Date(c.updatedAt).toLocaleDateString()}</p>
        </div>
      )}
      <div className="mt-6 space-y-2">
        <button onClick={() => setPrivacy(true)} className="w-full h-12 rounded-full border border-line bg-card flex items-center justify-center gap-2">Read the Privacy Notice</button>
        <button onClick={download} className="w-full h-12 rounded-full border border-line bg-card flex items-center justify-center gap-2"><Icon name="upload" className="w-4 h-4 rotate-180" />Download my data</button>
        <button onClick={() => { logOut(); onBack(); }} className="w-full h-12 rounded-full border border-line bg-card">Log out</button>
        {confirm ? (
          <div className="rounded-3xl bg-clay-soft p-4">
            <p className="text-sm">This deletes your profile, saved searches and viewing history. Your agent keeps only an anonymous record of any deal in progress.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => { deleteAccount(); onBack(); }} className="h-10 px-4 rounded-full bg-clay text-white text-sm">Delete my account</button>
              <button onClick={() => setConfirm(false)} className="h-10 px-4 rounded-full text-sm text-stone">Keep it</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="w-full h-12 rounded-full text-clay">Delete my account</button>
        )}
      </div>
    </Screen>
  );
}
