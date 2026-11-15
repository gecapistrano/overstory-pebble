"use client";
/* Real 3D interior tour: the CoStar listing's Matterport scan, embedded via the public
   Matterport Showcase player. Plain Showcase URL on purpose: passing an SDK applicationKey
   makes public models hang on "Connecting". */
import { useState } from "react";

export const matterportUrl = (modelId: string, autoplay = true) =>
  `https://my.matterport.com/show/?m=${encodeURIComponent(modelId)}${autoplay ? "&play=1" : ""}&qs=1&brand=0&help=0&hl=0`;

export default function MatterportTour({ modelId, title, className = "", autoplay = true }: { modelId: string; title?: string; className?: string; autoplay?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`bg-[#253247] ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80 text-[13px]">
          <span className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          Loading 3D scan…
        </div>
      )}
      <iframe
        key={modelId}
        src={matterportUrl(modelId, autoplay)}
        title={title ? `3D tour · ${title}` : "Matterport 3D tour"}
        className="absolute inset-0 w-full h-full border-0"
        allow="autoplay; fullscreen; web-share; xr-spatial-tracking"
        allowFullScreen
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
