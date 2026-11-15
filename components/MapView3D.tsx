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

// The OverStory desk look: Esri light-grey canvas + its labels, with OpenStreetMap building footprints
// (OpenFreeMap) extruded to their real height in soft blue-grey, as in the original OverStory map.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const DESK_STYLE = {
  version: 8 as const,
  sources: {
    "desk-base": { type: "raster" as const, tiles: [`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 16, attribution: "Map © Esri, HERE, Garmin, OpenStreetMap contributors" },
    "desk-labels": { type: "raster" as const, tiles: [`${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 16 },
    osm: { type: "vector" as const, url: "https://tiles.openfreemap.org/planet", attribution: "Buildings © OpenStreetMap contributors (OpenFreeMap)" },
  },
  layers: [
    { id: "desk-bg", type: "background" as const, paint: { "background-color": "#EEF2F7" } },
    { id: "desk-base", type: "raster" as const, source: "desk-base" },
    { id: "desk-labels", type: "raster" as const, source: "desk-labels" },
    {
      id: "building-3d", type: "fill-extrusion" as const, source: "osm", "source-layer": "building", minzoom: 13,
      paint: {
        "fill-extrusion-color": "rgb(205, 212, 224)",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.92,
      },
    },
  ],
};


// ---- OverStory floor stacks: each listed building drawn as one slab per storey (as in the original OverStory map)
const STOREY_M = 3.2; // metres per storey, to turn a building's real OSM height into floors
const SLAB = 0.82; // slab thickness as a share of a storey: the gaps make the floors readable
const SLAB_GROW = 1.12; // slabs wrap slightly around the grey building, like OverStory's slabs around its columns
const FALLBACK_FLOORS: Record<string, number> = { house: 2, townhouse: 3, condo: 5, apartment: 4 };
type Ring = [number, number][];

function inRing(pt: [number, number], ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function grow(ring: Ring, k: number): Ring {
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length;
  const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  return ring.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}
/** A small square (about w metres) around a point, for homes without a mapped footprint. */
function square(lng: number, lat: number, w = 14): Ring {
  const dy = w / 2 / 111320, dx = dy / Math.cos((lat * Math.PI) / 180);
  return [[lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy], [lng - dx, lat - dy]];
}

export default function MapView3D({
  listings,
  selected,
  onSelect,
  status,
  className = "",
  city,
  layer = "map",
  look = "liberty",
}: {
  listings: Listing[];
  selected?: string;
  onSelect?: (id: string) => void;
  status?: Record<string, PinStatus>;
  className?: string;
  city?: string;
  layer?: BaseLayer;
  /** "liberty": OpenFreeMap vector style; "desk": the OverStory light-grey map with blue-grey 3D buildings. */
  look?: "liberty" | "desk";
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
        const maplibregl = await import("maplibre-gl");
        if (!alive || !ref.current || mapRef.current) return;
        const map = new maplibregl.Map({
          container: ref.current,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          style: look === "desk" ? (DESK_STYLE as any) : STYLE,
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
          if (below && look !== "desk") map.setPaintProperty("building-3d", "fill-extrusion-color", "#E1E7EF");
          map.addSource("pebble-aerial", { type: "raster", tiles: [`${location.origin}/api/vexcel/tile/{z}/{x}/{y}/`], tileSize: 256, minzoom: 11, maxzoom: 20, attribution: "Aerial © Vexcel Imaging" });
          map.addLayer({ id: "pebble-aerial", type: "raster", source: "pebble-aerial", layout: { visibility: "none" } }, below);
          // separate DEM sources for the 3D surface and the hillshade (MapLibre's recommendation)
          const dem = { type: "raster-dem" as const, tiles: [DEM], tileSize: 256, maxzoom: 15, encoding: "terrarium" as const, attribution: "Elevation: AWS Terrain Tiles (SRTM, USGS 3DEP)" };
          map.addSource("pebble-dem", dem);
          map.addSource("pebble-hillshade", dem);
          map.addLayer({ id: "pebble-hillshade", type: "hillshade", source: "pebble-hillshade", layout: { visibility: "none" }, paint: { "hillshade-exaggeration": 0.6, "hillshade-shadow-color": "#4A586D", "hillshade-highlight-color": "#FFFFFF" } }, below);
          if (look === "desk") {
            map.addSource("pebble-floors", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
            map.addLayer({
              id: "pebble-floors", type: "fill-extrusion", source: "pebble-floors",
              paint: {
                "fill-extrusion-color": ["case", ["get", "sel"], "#1F6FEB", "#1E4082"],
                "fill-extrusion-base": ["get", "base"],
                "fill-extrusion-height": ["get", "top"],
                "fill-extrusion-opacity": 0.9,
              },
            });
          }
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
    if (look === "desk") {
      map.setPaintProperty("building-3d", "fill-extrusion-color", layer === "aerial" ? "#FFFFFF" : "rgb(205, 212, 224)");
      map.setPaintProperty("building-3d", "fill-extrusion-opacity", layer === "aerial" ? 0.35 : 0.92);
    }
    map.setLayoutProperty("pebble-hillshade", "visibility", layer === "terrain" ? "visible" : "none");
    map.setTerrain(layer === "terrain" ? { source: "pebble-dem", exaggeration: EXAGGERATION } : null);
    if (layer === "aerial" && map.getZoom() < 11) map.setZoom(11);
  }, [ready, layer]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      const maplibregl = await import("maplibre-gl");
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

  // OverStory look: rebuild the floor stacks whenever the map settles (new tiles, new listings, new selection)
  const floorKey = useRef("");
  const stackRef = useRef({ listings, selected });
  stackRef.current = { listings, selected };
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || look !== "desk") return;
    const update = () => {
      const src = map.getSource("pebble-floors") as import("maplibre-gl").GeoJSONSource | undefined;
      if (!src) return;
      const { listings: ls, selected: sel } = stackRef.current;
      const pts = ls.filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng));
      // the real footprint + height of the building under each listing, from the loaded OSM tiles
      const blds = map.getZoom() >= 13 ? map.querySourceFeatures("osm", { sourceLayer: "building" }) : [];
      const features: GeoJSON.Feature[] = [];
      const sig: string[] = [];
      for (const l of pts) {
        const at: [number, number] = [l.lng, l.lat];
        let ring: Ring | null = null;
        let height = 0;
        for (const f of blds) {
          const g = f.geometry;
          const polys: Ring[][] = g.type === "Polygon" ? [g.coordinates as Ring[]] : g.type === "MultiPolygon" ? (g.coordinates as Ring[][]) : [];
          const hit = polys.find((p) => p[0] && inRing(at, p[0]));
          if (hit) {
            ring = hit[0];
            height = Number(f.properties?.render_height) || 0;
            break;
          }
        }
        // enough slabs that the top one covers the roof of the real building
        const floors = Math.max(1, Math.min(100, height ? Math.ceil((height - STOREY_M * SLAB) / STOREY_M) + 1 : FALLBACK_FLOORS[l.propertyType] ?? 2));
        const foot = ring ? grow(ring, SLAB_GROW) : square(l.lng, l.lat);
        const on = l.id === sel;
        sig.push(`${l.id}:${floors}:${ring ? ring.length : 0}:${on ? 1 : 0}`);
        for (let i = 0; i < floors; i++) {
          features.push({ type: "Feature", properties: { base: i * STOREY_M, top: i * STOREY_M + STOREY_M * SLAB, sel: on }, geometry: { type: "Polygon", coordinates: [foot] } });
        }
      }
      const key = sig.join("|");
      if (key === floorKey.current) return; // nothing changed: don't re-render (idle would loop)
      floorKey.current = key;
      src.setData({ type: "FeatureCollection", features });
    };
    update();
    map.on("idle", update);
    return () => { map.off("idle", update); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, look, listings.map((l) => l.id).join(), selected]);

  return (
    <div className={`bg-[#EEF2F7] ${className}`}>
      <div ref={ref} className="absolute inset-0" />
      {!ready && !failed && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-mute pointer-events-none">Loading 3D map…</div>}
      {failed && <div className="absolute inset-0 flex items-center justify-center text-center px-8 text-[13px] text-mute">3D map isn&apos;t supported on this device. Switch back to 2D.</div>}
    </div>
  );
}
