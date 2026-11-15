"use client";
/* Leaflet map over CARTO / OpenStreetMap tiles. Works for any CoStar market (Houston, LA):
   the view fits the listings plus the market's commute anchor (e.g. Downtown Houston).
   Pins with a Matterport scan carry a small 3D mark; tapping a pin calls onSelect. */
import { useEffect, useRef } from "react";
import type { Listing } from "@/lib/types";
import { price } from "@/lib/recap";
import { marketOf } from "@/lib/markets";

export default function MapView({
  listings,
  selected,
  onSelect,
  className = "",
  city,
  numbered = false,
}: {
  listings: Listing[];
  selected?: string;
  onSelect?: (id: string) => void;
  className?: string;
  city?: string;
  numbered?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const market = marketOf(city || listings[0]?.city);

  useEffect(() => {
    let alive = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!alive || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, { zoomControl: false, attributionControl: true }).setView([market.lat, market.lng], market.zoom);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors © CARTO",
        subdomains: "abcd",
        maxZoom: 19,
        className: "pebble-tiles",
        errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      draw();
      // the container is often sized after mount (tabs, modals)
      setTimeout(() => map.invalidateSize(), 150);
    })();
    return () => {
      alive = false;
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
      const label = numbered ? `${i + 1} · ${price(l).replace("/mo", "")}` : price(l).replace("/mo", "");
      L.marker([l.lat, l.lng], {
        zIndexOffset: on ? 1000 : 0,
        icon: L.divIcon({ className: "", html: `<div class="pin ${on ? "pin-on" : ""}">${label}${l.matterportId ? ' <span class="pin-3d">3D</span>' : ""}</div>`, iconSize: [70, 26], iconAnchor: [35, 13] }),
      })
        .on("click", () => onSelectRef.current?.(l.id))
        .addTo(layer);
    });
    const pts = listings.filter((l) => Number.isFinite(l.lat)).map((l) => [l.lat, l.lng] as [number, number]);
    if (pts.length) map.fitBounds(L.latLngBounds([...pts, [market.lat, market.lng]]), { padding: [40, 40], maxZoom: 15 });
    else map.setView([market.lat, market.lng], market.zoom);
  }

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings.map((l) => l.id).join(), selected, market.city]);

  return <div ref={ref} className={`bg-[#F4EEEA] ${className}`} />;
}
