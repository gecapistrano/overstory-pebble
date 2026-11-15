"use client";
/* Exterior 3D of a property: the drone-trained Gaussian splat from the Matterport hackathon set,
   cropped to the house on the server (/api/exterior/{sid}). Drag to orbit, pinch / scroll to zoom.
   The first open of a model can take a little while (the server reads a slice of a 200–550 MB
   file); after that it is cached. */
import { useEffect, useRef, useState } from "react";

export default function ExteriorView({ sid, className = "" }: { sid: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let alive = true;
    let viewer: { dispose: () => Promise<void> | void; start: () => void } | null = null;
    setState("loading");
    setPct(0);
    (async () => {
      try {
        const S = await import("@mkkellogg/gaussian-splats-3d");
        if (!alive || !ref.current) return;
        const v = new S.Viewer({
          rootElement: ref.current,
          cameraUp: [0, 0, 1], // the captures are Z-up, in metres, with the ground at z = 0
          initialCameraPosition: [26, -26, 20],
          initialCameraLookAt: [0, 0, 3],
          selfDrivenMode: true,
          useBuiltInControls: true,
          sharedMemoryForWorkers: false, // no COOP/COEP headers needed
          gpuAcceleratedSort: false,
          dynamicScene: false,
          sphericalHarmonicsDegree: 0,
          sceneRevealMode: S.SceneRevealMode.Gradual,
          logLevel: S.LogLevel.None,
        });
        viewer = v;
        await v.addSplatScene(`/api/exterior/${encodeURIComponent(sid)}/`, {
          format: S.SceneFormat.Splat,
          showLoadingUI: false,
          progressiveLoad: true,
          onProgress: (p: number) => alive && setPct(Math.round(p)),
        });
        if (!alive) return;
        v.start();
        setState("ready");
      } catch (e) {
        console.warn("exterior 3D", e);
        if (alive) setState("failed");
      }
    })();
    return () => {
      alive = false;
      try { viewer?.dispose(); } catch {}
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [sid]);

  return (
    <div className={`bg-[#CFD8DF] ${className}`}>
      <div ref={ref} className="absolute inset-0" />
      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink/70 text-[13px] pointer-events-none">
          <span className="w-8 h-8 rounded-full border-2 border-ink/20 border-t-ink animate-spin" />
          {pct > 0 ? `Loading drone 3D model… ${pct}%` : "Preparing drone 3D model…"}
        </div>
      )}
      {state === "failed" && <div className="absolute inset-0 flex items-center justify-center text-center px-8 text-[13px] text-ink/70">Couldn&apos;t load the exterior model right now. Try again in a moment.</div>}
    </div>
  );
}
