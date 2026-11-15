"use client";
/* 3D map: MapLibre GL over OpenFreeMap's "liberty" vector style, which ships real
   OpenStreetMap building footprints extruded to their height. The camera is tilted so
   agents see the exterior massing around each property. Same props and pins as MapView
   (deal-status colors, 3D-scan badge), so the two can be swapped with a 2D/3D toggle.
   Layers: "map" (vector), "aerial" (Vexcel ortho via /api/vexcel, draped under the buildings)
   and "terrain" (AWS Terrain Tiles elevation as real 3D relief + hillshade, exaggerated so the
   gentle relief of Houston / LA bayous and hills reads at street scale). */
import { useEffect, useRef, useState } from "react";
import type { Listing } from "@/lib/types";
import type { BaseLayer, PinStatus } from "@/components/MapView";
import { price } from "@/lib/recap";
import { marketOf } from "@/lib/markets";

const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const EXAGGERATION = 4;

export default function MapView3D({
  listings,
  selected,
  onSelect,
  status,
  className = "",
  city,
  layer = "map",
}: {
  listings: Listing[];
  selected?: string;
  onSelect?: (id: string) => void;
  status?: Record<string, PinStatus>;
  className?: string;
  city?: string;
  layer?: BaseLayer;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markers = useRef<import("maplibre-gl").Marker[]>([]);
  const fitKey = useRef("");
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const market = marketOf(city || listings[0]?.city);

  useEffect(() => {
    let alive = true;
    let ro: ResizeObserver | null = null;
    (async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        if (!alive || !ref.current || mapRef.current) return;
        const map = new maplibregl.Map({
          container: ref.current,
          style: STYLE,
          center: [market.lng, market.lat],
          zoom: 15,
          pitch: 60,
          bearing: -20,
          maxPitch: 75,
          attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
        map.on("load", () => {
          // warm the extruded buildings slightly so they read against the base map
          const below = map.getLayer("building-3d") ? "building-3d" : undefined;
          if (below) map.setPaintProperty("building-3d", "fill-extrusion-color", "#E1E7EF");
          map.addSource("pebble-aerial", { type: "raster", tiles: [`${location.origin}/api/vexcel/tile/{z}/{x}/{y}/`], tileSize: 256, minzoom: 11, maxzoom: 20, attribution: "Aerial © Vexcel Imaging" });
          map.addLayer({ id: "pebble-aerial", type: "raster", source: "pebble-aerial", layout: { visibility: "none" } }, below);
          // separate DEM sources for the 3D surface and the hillshade (MapLibre's recommendation)
          const dem = { type: "raster-dem" as const, tiles: [DEM], tileSize: 256, maxzoom: 15, encoding: "terrarium" as const, attribution: "Elevation: AWS Terrain Tiles (SRTM, USGS 3DEP)" };
          map.addSource("pebble-dem", dem);
          map.addSource("pebble-hillshade", dem);
          map.addLayer({ id: "pebble-hillshade", type: "hillshade", source: "pebble-hillshade", layout: { visibility: "none" }, paint: { "hillshade-exaggeration": 0.6, "hillshade-shadow-color": "#4A586D", "hillshade-highlight-color": "#FFFFFF" } }, below);
          setReady(true);
        });
        map.on("error", (e) => console.warn("3D map:", e.error?.message));
        mapRef.current = map;
        ro = new ResizeObserver(() => map.resize());
        ro.observe(ref.current);
      } catch (e) {
        console.warn("3D map unavailable", e);
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      ro?.disconnect();
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty("pebble-aerial", "visibility", layer === "aerial" ? "visible" : "none");
    map.setLayoutProperty("pebble-hillshade", "visibility", layer === "terrain" ? "visible" : "none");
    map.setTerrain(layer === "terrain" ? { source: "pebble-dem", exaggeration: EXAGGERATION } : null);
    if (layer === "aerial" && map.getZoom() < 11) map.setZoom(11);
  }, [ready, layer]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      const map = mapRef.current;
      if (!alive || !map) return;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      const pts = listings.filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng));
      pts.forEach((l) => {
        const on = l.id === selected;
        const st = status?.[l.id];
        const el = document.createElement("div");
        el.className = "pin3d";
        el.style.zIndex = on ? "2" : "1";
        el.innerHTML = `<div class="pin ${st ? `pin-st pin-${st}` : ""} ${on ? "pin-on" : ""}">${st ? '<i class="pin-dot"></i>' : ""}${price(l).replace("/mo", "")}${l.matterportId ? ' <span class="pin-3d">3D</span>' : ""}</div>`;
        el.addEventListener("click", (e) => { e.stopPropagation(); onSelectRef.current?.(l.id); });
        markers.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([l.lng, l.lat]).addTo(map));
      });
      const key = pts.map((l) => l.id).join();
      const sel = pts.find((l) => l.id === selected);
      if (sel) {
        // fly in close so the selected property's building and its neighbours stand up in 3D
        map.flyTo({ center: [sel.lng, sel.lat], zoom: Math.max(map.getZoom(), 16.5), pitch: 62, duration: 900 });
      } else if (fitKey.current !== key && pts.length) {
        const b = new maplibregl.LngLatBounds();
        pts.forEach((l) => b.extend([l.lng, l.lat]));
        map.fitBounds(b, { padding: { top: 140, bottom: 220, left: 50, right: 50 }, maxZoom: 16, pitch: 60, bearing: -20, duration: 0 });
      }
      fitKey.current = key;
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, listings.map((l) => l.id).join(), selected, status ? JSON.stringify(status) : ""]);

  return (
    <div className={`bg-[#EEF2F7] ${className}`}>
      <div ref={ref} className="absolute inset-0" />
      {!ready && !failed && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-mute pointer-events-none">Loading 3D map…</div>}
      {failed && <div className="absolute inset-0 flex items-center justify-center text-center px-8 text-[13px] text-mute">3D map isn&apos;t supported on this device. Switch back to 2D.</div>}
    </div>
  );
}
