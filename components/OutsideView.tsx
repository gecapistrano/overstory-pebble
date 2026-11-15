"use client";
/* The outside of a house, full screen. Drone-trained 3D exterior (Matterport splat) when the
   listing has one; otherwise Vexcel aerial imagery: the 45° bird's-eye oblique, falling back to
   the top-down ortho. So every house has an outside view. */
import { useEffect, useState } from "react";
import type { Listing } from "@/lib/types";
import { exteriorOf } from "@/lib/exteriors";
import ExteriorView from "@/components/ExteriorView";

export default function OutsideView({ l, className = "" }: { l: Listing; className?: string }) {
  const ext = exteriorOf(l.id);
  const [img, setImg] = useState<"oblique" | "ortho" | "none">("oblique");
  useEffect(() => setImg("oblique"), [l.id]);

  if (ext) return <ExteriorView sid={ext.sid} className={className} />;
  const q = `lat=${l.lat}&lng=${l.lng}`;
  return (
    <div className={`bg-[#CFD8DF] ${className}`}>
      {img !== "none" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={img} src={`/api/vexcel/${img}/?${q}`} alt={`Aerial ${img === "oblique" ? "bird's-eye" : "top-down"} view of ${l.address || l.title}`}
          className="absolute inset-0 w-full h-full object-contain"
          onError={() => setImg(img === "oblique" ? "ortho" : "none")} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-center px-8 text-[13px] text-ink/70">No outside imagery for this house yet. Your agent can share photos.</div>
      )}
    </div>
  );
}
