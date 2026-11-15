"use client";
/* Leaflet map over OpenStreetMap tiles. Works for any CoStar market (Houston, LA):
   the view fits the listings plus the market's commute anchor (e.g. Downtown Houston).
   Pins with a Matterport scan carry a small 3D mark; tapping a pin calls onSelect. */
import { useEffect, useRef, useState } from "react";
import type { Listing } from "@/lib/types";
import { price } from "@/lib/recap";
import { marketOf } from "@/lib/markets";

export type PinStatus = "available" | "active" | "sold";
/** Base layer: OpenStreetMap, Vexcel aerial imagery, or OpenTopoMap terrain (relief + contours). */
export type BaseLayer = "map" | "aerial" | "terrain";
export const BASE_LAYERS: { id: BaseLayer; label: string }[] = [{ id: "map", label: "Map" }, { id: "aerial", label: "Aerial" }, { id: "terrain", label: "Terrain" }];

export default function MapView({
  listings,
  selected,
  onSelect,
  className = "",
  city,
  numbered = false,
  status,
  stableView = false,
  aerial = "toggle",
  layer: layerProp,
  onLayer,
}: {
  listings: Listing[];
  selected?: string;
  onSelect?: (id: string) => void;
  className?: string;
  city?: string;
  numbered?: boolean;
  /** Optional deal status per listing id; colors the pin (agent map). */
  status?: Record<string, PinStatus>;
  /** Only re-fit the view when the set of listings changes, not on selection. */
  stableView?: boolean;
  /** Vexcel aerial imagery: false = off, true = on with a Map/Aerial switch, "toggle" = off with the switch. */
  aerial?: boolean | "toggle";
  /** Controlled base layer (hides the built-in switch; the parent draws its own). */
  layer?: BaseLayer;
  onLayer?: (l: BaseLayer) => void;
}) {
  const [ownLayer, setOwnLayer] = useState<BaseLayer>(aerial === true ? "aerial" : "map");
  const base = layerProp ?? ownLayer;
  const setBase = (l: BaseLayer) => { if (layerProp === undefined) setOwnLayer(l); onLayer?.(l); };
  const aerialRef = useRef<import("leaflet").TileLayer | null>(null);
  const terrainRef = useRef<import("leaflet").TileLayer | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const fitKey = useRef("");
  const baseRef = useRef(base);
  baseRef.current = base;
  function applyBase() {
    const map = mapRef.current;
    if (!map) return;
    for (const [lyr, want] of [[aerialRef.current, baseRef.current === "aerial"], [terrainRef.current, baseRef.current === "terrain"]] as const) {
      if (!lyr) continue;
      if (want && !map.hasLayer(lyr)) lyr.addTo(map);
      if (!want && map.hasLayer(lyr)) lyr.remove();
    }
    if (baseRef.current === "aerial" && map.getZoom() < 11) map.setZoom(11);
  }
  useEffect(applyBase, [base]);
  const market = marketOf(city || listings[0]?.city);

  useEffect(() => {
    let alive = true;
    let ro: ResizeObserver | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!alive || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, { zoomControl: false, attributionControl: true }).setView([market.lat, market.lng], market.zoom);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
        className: "pebble-tiles",
        errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
      }).addTo(map);
      // Vexcel 7.5–15 cm aerial ortho imagery via the server proxy (key never reaches the browser).
      // Only at zoom >= 11 and inside Houston / LA; OpenStreetMap shows elsewhere.
      aerialRef.current = L.tileLayer("/api/vexcel/tile/{z}/{x}/{y}/", {
        attribution: "Aerial © Vexcel Imaging",
        minZoom: 11,
        maxNativeZoom: 20,
        maxZoom: 21,
        errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
      });
      // OpenTopoMap: shaded relief + contour lines from SRTM elevation data
      terrainRef.current = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        attribution: "Terrain © OpenTopoMap (CC-BY-SA), SRTM",
        subdomains: "abc",
        maxNativeZoom: 17,
        maxZoom: 19,
        errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
      });
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      applyBase();
      draw();
      // the container is often sized after mount (tabs, modals, full screen)
      setTimeout(() => map.invalidateSize(), 150);
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(ref.current);
      }
    })();
    return () => {
      alive = false;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function draw() {
    const L = (await import("leaflet")).default;
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    L.marker([market.lat, market.lng], {
      icon: L.divIcon({ className: "", html: `<div class="pin-campus">${market.anchor}</div>`, iconSize: [120, 22], iconAnchor: [60, 11] }),
      interactive: false,
    }).addTo(layer);
    listings.forEach((l, i) => {
      if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng)) return;
      const on = l.id === selected;
      const st = status?.[l.id];
      const label = numbered ? `${i + 1} · ${price(l).replace("/mo", "")}` : price(l).replace("/mo", "");
      L.marker([l.lat, l.lng], {
        zIndexOffset: on ? 1000 : 0,
        icon: L.divIcon({ className: "", html: `<div class="pin ${st ? `pin-st pin-${st}` : ""} ${on ? "pin-on" : ""}">${st ? '<i class="pin-dot"></i>' : ""}${label}${l.matterportId ? ' <span class="pin-3d">3D</span>' : ""}</div>`, iconSize: [70, 26], iconAnchor: [35, 13] }),
      })
        .on("click", () => onSelectRef.current?.(l.id))
        .addTo(layer);
    });
    const key = listings.map((l) => l.id).join() + market.city;
    if (stableView && fitKey.current === key) return;
    fitKey.current = key;
    const pts = listings.filter((l) => Number.isFinite(l.lat)).map((l) => [l.lat, l.lng] as [number, number]);
    if (pts.length) map.fitBounds(L.latLngBounds([...pts, [market.lat, market.lng]]), { padding: [40, 40], maxZoom: 15 });
    else map.setView([market.lat, market.lng], market.zoom);
  }

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings.map((l) => l.id).join(), selected, market.city, status ? JSON.stringify(status) : ""]);

  const positioned = /\b(absolute|fixed|relative|sticky)\b/.test(className);
  return (
    <div className={`${positioned ? "" : "relative"} ${className}`}>
      <div ref={ref} className="absolute inset-0 bg-[#EEF2F7]" />
      {aerial !== false && layerProp === undefined && <LayerSwitch value={base} onChange={setBase} className="absolute top-3 right-3 z-[500]" />}
    </div>
  );
}

export function LayerSwitch({ value, onChange, className = "" }: { value: BaseLayer; onChange: (l: BaseLayer) => void; className?: string }) {
  return (
    <div className={`flex p-0.5 rounded-full bg-white/95 shadow-card text-[11px] font-semibold ${className}`} role="group" aria-label="Map layer">
      {BASE_LAYERS.map((b) => (
        <button key={b.id} type="button" aria-pressed={value === b.id} onClick={() => onChange(b.id)} className={`px-2.5 h-7 rounded-full ${value === b.id ? "bg-navy text-white" : "text-mute"}`}>{b.label}</button>
      ))}
    </div>
  );
}
