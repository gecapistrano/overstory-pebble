"use client";
/* Vexcel aerial view of one listing: top-down ortho with the parcel outlined, a 45° bird's-eye
   oblique, and the property attributes Vexcel's AI reads from the imagery (footprint, roof, pool,
   tree cover). Everything goes through /api/vexcel/* so the key stays on the server. */
import { useEffect, useState } from "react";
import type { Listing } from "@/lib/types";

export interface VexcelFacts {
  parcel: boolean;
  captured: string | null;
  gsdCm: number | null;
  structures: number | null;
  footprintSqft: number | null;
  roofMaterial: string | null;
  roofShape: string | null;
  roofCondition: number | null;
  roofDiscolorationPct: number | null;
  pool: boolean;
  treeCoverPct: number | null;
  solar: boolean | null;
  elevationFt: number | null;
}

const q = (l: Pick<Listing, "lat" | "lng">) => `lat=${l.lat}&lng=${l.lng}`;
const cache = new Map<string, Promise<VexcelFacts | null>>();
export function vexcelFacts(l: Pick<Listing, "lat" | "lng">) {
  const k = q(l);
  if (!cache.has(k)) cache.set(k, fetch(`/api/vexcel/parcel/?${k}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(k)!;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function factChips(f: VexcelFacts, l?: Listing): string[] {
  const out: string[] = [];
  if (f.footprintSqft) out.push(`${f.footprintSqft.toLocaleString("en-US")} sq ft roof footprint`);
  if (f.roofMaterial || f.roofShape) out.push(`${cap([f.roofShape, f.roofMaterial].filter(Boolean).join(" "))} roof`);
  if (f.roofDiscolorationPct != null && f.roofDiscolorationPct >= 5) out.push(`${Math.round(f.roofDiscolorationPct)}% roof discoloration`);
  if (f.pool) out.push("Pool detected");
  if (f.treeCoverPct != null) out.push(`${Math.round(f.treeCoverPct)}% tree cover`);
  if (f.solar) out.push("Solar panels");
  if (f.structures && f.structures > 1 && l?.propertyType === "house") out.push(`${f.structures} structures on parcel`);
  return out;
}

export default function AerialView({ l, className = "", compact = false }: { l: Listing; className?: string; compact?: boolean }) {
  const [tab, setTab] = useState<"top" | "oblique">("oblique");
  const [facts, setFacts] = useState<VexcelFacts | null | undefined>(undefined);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let alive = true;
    setFacts(undefined);
    setBroken({});
    setTab("oblique");
    vexcelFacts(l).then((f) => alive && setFacts(f));
    return () => void (alive = false);
  }, [l.id, l.lat, l.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (facts === null && broken.top) return null; // outside Vexcel coverage / no key
  const view = tab === "oblique" && broken.oblique ? "top" : tab;
  const src = view === "top" ? `/api/vexcel/ortho/?${q(l)}` : `/api/vexcel/oblique/?${q(l)}`;
  const chips = facts ? factChips(facts, l) : [];
  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-mute">Aerial view · Vexcel</div>
        {!broken.oblique && (
          <div className="flex p-0.5 rounded-full bg-blush text-[11px] font-semibold">
            <button onClick={() => setTab("oblique")} className={`px-2.5 h-6 rounded-full ${view === "oblique" ? "bg-white shadow" : "text-mute"}`}>Bird&apos;s-eye</button>
            <button onClick={() => setTab("top")} className={`px-2.5 h-6 rounded-full ${view === "top" ? "bg-white shadow" : "text-mute"}`}>Top-down</button>
          </div>
        )}
      </div>
      <div className={`relative mt-2 rounded-2xl overflow-hidden bg-[#EDF2F9] ${compact ? "h-36" : "h-52"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={src} src={src} alt={`Aerial ${view === "top" ? "ortho" : "oblique"} image of ${l.address}`} className="absolute inset-0 w-full h-full object-cover" loading="lazy"
          onError={() => setBroken((b) => ({ ...b, [view]: true }))} />
        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-medium">Parcel outlined in gold</span>
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => <span key={c} className="px-2.5 py-1 rounded-full bg-[#E7F4EC] text-[#2A8A5C] text-[12px] font-medium">{c}</span>)}
        </div>
      )}
      {facts && <div className="mt-1.5 text-[11px] text-mute">Vexcel AI attributes from {facts.captured ? `the ${facts.captured.slice(0, 7)} capture` : "aerial imagery"}{facts.gsdCm ? ` · ${facts.gsdCm} cm resolution` : ""} · verify on site</div>}
    </div>
  );
}
