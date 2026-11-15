"use client";
/* Listing catalog with the vibe model's tags — what the search engine "sees". */
import { listingsSync } from "@/lib/adapters";
import { price } from "@/lib/recap";
import HomeArt from "@/components/HomeArt";
import { Logo } from "@/components/ui";

export default function Gallery() {
  const all = listingsSync();
  return (
    <div className="min-h-screen bg-blush p-8">
      <div className="flex items-baseline gap-4"><Logo className="text-[18px]" /><h1 className="text-[22px] font-bold">Listing catalog · vibe tags</h1><span className="text-mute text-[13px]">{all.length} live CoStar listings · Houston &amp; Los Angeles · every one with a Matterport 3D tour</span></div>
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        {all.map((l) => (
          <div key={l.id} id={l.id} className="rounded-2xl bg-white shadow-card overflow-hidden">
            <div className="h-32"><HomeArt listing={l} className="w-full h-full" /></div>
            <div className="p-3">
              <div className="text-[13px] font-semibold truncate">{l.title}</div>
              <div className="text-[12px] text-mute">{price(l)} · {l.neighborhood}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">{[l.style, ...l.ambience, ...l.materials.slice(0, 2)].map((t) => <span key={t} className="px-1.5 py-0.5 rounded-md bg-blush text-[10px] text-[#4A586D]">{t}</span>)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
