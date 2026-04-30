"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import TransitFirstUseModal from "@/components/TransitFirstUseModal";
import DataQualityFirstUseModal from "@/components/DataQualityFirstUseModal";
import type { CompareMode } from "@/components/compare/ModePicker";
import { usePopulation } from "@/hooks/usePopulation";
import { useTravelTimeData } from "@/hooks/useTravelTimeData";
import { buildSuperCells } from "@/lib/supercells";
import { createRings, createCircle, createWedges } from "@/lib/circle-geojson";
import type { ColorBy } from "@/lib/circle-geojson";
import type { TransportMode } from "@/lib/travel-time-types";
import { isInUk, type DataSource } from "@/lib/types";

interface OriginInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: "city" | "airport";
  country: string;
  computed: boolean;
  transitNearPct: number | null;
}

const TRANSIT_OK_PCT = 5;

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export default function Home() {
  // -- Mode + compare --
  const [mode, setMode] = useState<CompareMode>("distance");
  const [compare, setCompare] = useState(false);

  // -- Distance state --
  const [latA, setLatA] = useState<number | null>(null);
  const [lngA, setLngA] = useState<number | null>(null);
  const [latB, setLatB] = useState<number | null>(null);
  const [lngB, setLngB] = useState<number | null>(null);
  const [activePin, setActivePin] = useState<"A" | "B">("A");
  const [radiusKm, setRadiusKm] = useState(10);
  const [exponentDist, setExponentDist] = useState(2);
  const [colorBy, setColorBy] = useState<ColorBy>("inverse-square");
  const [ukMode, setUkMode] = useState(false);

  // -- Time state --
  const [originA, setOriginA] = useState<string | null>(null);
  const [originB, setOriginB] = useState<string | null>(null);
  const [transportMode, setTransportMode] = useState<TransportMode>("fastest");
  const [exponentTime, setExponentTime] = useState(1);
  const [maxTimeMin, setMaxTimeMin] = useState(120);
  const [timeColorBy, setTimeColorBy] = useState<"travel-time" | "population" | "weight">("travel-time");
  const [origins, setOrigins] = useState<OriginInfo[]>([]);
  const [originsError, setOriginsError] = useState<string | null>(null);

  // UK mode is only meaningful when the query point is inside the UK bbox.
  // Otherwise we fall back to GHS so the user gets a result rather than an error.
  const sourceA: DataSource =
    ukMode && latA !== null && lngA !== null && isInUk(latA, lngA) ? "uk" : "ghs";
  const sourceB: DataSource =
    ukMode && latB !== null && lngB !== null && isInUk(latB, lngB) ? "uk" : "ghs";

  // -- Hooks: Distance --
  const distA = usePopulation({
    lat: mode === "distance" ? latA : null,
    lng: mode === "distance" ? lngA : null,
    radiusKm,
    exponent: exponentDist,
    dataSource: sourceA,
  });
  const distB = usePopulation({
    lat: mode === "distance" && compare ? latB : null,
    lng: mode === "distance" && compare ? lngB : null,
    radiusKm,
    exponent: exponentDist,
    dataSource: sourceB,
  });

  // -- Hooks: Time --
  const timeA = useTravelTimeData(
    mode === "time" ? originA : null,
    transportMode,
    exponentTime,
    maxTimeMin
  );
  const timeB = useTravelTimeData(
    mode === "time" && compare ? originB : null,
    transportMode,
    exponentTime,
    maxTimeMin
  );

  // -- Load origins for time mode --
  useEffect(() => {
    fetch("/api/travel-time/origins")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load origins (HTTP ${r.status})`);
        return r.json();
      })
      .then((d) => {
        setOrigins(d.origins);
        setOriginsError(null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setOriginsError(err instanceof Error ? err.message : "Failed to load origins");
      });
  }, []);

  // -- Map refs --
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const markerARef = useRef<mapboxgl.Marker | null>(null);
  const markerBRef = useRef<mapboxgl.Marker | null>(null);

  // Refs for values used in map event handlers
  const activePinRef = useRef(activePin);
  useEffect(() => { activePinRef.current = activePin; }, [activePin]);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const compareRef = useRef(compare);
  useEffect(() => { compareRef.current = compare; }, [compare]);
  const originARef = useRef(originA);
  useEffect(() => { originARef.current = originA; }, [originA]);
  const originBRef = useRef(originB);
  useEffect(() => { originBRef.current = originB; }, [originB]);

  // -- Initialize map --
  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-0.1, 51.5],
      zoom: 7,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-left");

    map.on("load", () => {
      // -- Distance sources & layers --
      map.addSource("rings-a", { type: "geojson", data: EMPTY_FC });
      map.addSource("circle-a", { type: "geojson", data: EMPTY_FC });
      map.addSource("rings-b", { type: "geojson", data: EMPTY_FC });
      map.addSource("circle-b", { type: "geojson", data: EMPTY_FC });

      // A rings fill
      map.addLayer({
        id: "rings-a-fill",
        type: "fill",
        source: "rings-a",
        paint: {
          "fill-color": [
            "interpolate", ["linear"], ["get", "intensity"],
            0, "#fef9c3",
            0.3, "#fbbf24",
            0.6, "#f97316",
            1.0, "#dc2626",
          ],
          "fill-opacity": [
            "interpolate", ["linear"], ["get", "intensity"],
            0, 0.15,
            1, 0.55,
          ],
        },
      });
      map.addLayer({
        id: "rings-a-outline",
        type: "line",
        source: "rings-a",
        paint: {
          "line-color": [
            "interpolate", ["linear"], ["get", "intensity"],
            0, "#fbbf24",
            0.5, "#f97316",
            1.0, "#dc2626",
          ],
          "line-width": 1,
          "line-opacity": 0.5,
        },
      });
      map.addLayer({
        id: "circle-a-outline",
        type: "line",
        source: "circle-a",
        paint: { "line-color": "#3b82f6", "line-width": 2 },
      });

      // B rings fill (blue/orange compare palette)
      map.addLayer({
        id: "rings-b-fill",
        type: "fill",
        source: "rings-b",
        paint: {
          "fill-color": [
            "interpolate", ["linear"], ["get", "intensity"],
            0, "#dbeafe",
            1, "#1e3a8a",
          ],
          "fill-opacity": 0.55,
        },
      });
      map.addLayer({
        id: "rings-b-outline",
        type: "line",
        source: "rings-b",
        paint: { "line-color": "#1e40af", "line-width": 0.5, "line-opacity": 0.4 },
      });
      map.addLayer({
        id: "circle-b-outline",
        type: "line",
        source: "circle-b",
        paint: { "line-color": "#1e40af", "line-width": 2 },
      });

      // -- Time sources & layers --
      map.addSource("cells-a", { type: "geojson", data: EMPTY_FC });
      map.addSource("cells-b", { type: "geojson", data: EMPTY_FC });

      map.addLayer({
        id: "cells-a-fill",
        type: "fill",
        source: "cells-a",
        paint: {
          "fill-color": [
            "step",
            ["get", "travelTimeMin"],
            "#15803d",
            15, "#22c55e",
            30, "#eab308",
            45, "#f59e0b",
            60, "#f97316",
            90, "#ef4444",
            120, "#991b1b",
          ],
          "fill-opacity": 0.7,
        },
      });

      map.addLayer({
        id: "cells-a-outline",
        type: "line",
        source: "cells-a",
        paint: {
          "line-color": "rgba(0, 0, 0, 0.08)",
          "line-width": 0.5,
        },
        minzoom: 10,
      });

      map.addLayer({
        id: "cells-b-fill",
        type: "fill",
        source: "cells-b",
        paint: {
          "fill-color": [
            "step",
            ["get", "travelTimeMin"],
            "#7c2d12",
            15, "#9a3412",
            30, "#c2410c",
            45, "#ea580c",
            60, "#f97316",
            90, "#fdba74",
            120, "#ffedd5",
          ],
          "fill-opacity": 0.5,
        },
      });

      // Origins overlay
      map.addSource("origins-points", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "origins-circles",
        type: "circle",
        source: "origins-points",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 8, 8],
          "circle-color": [
            "match", ["get", "type"],
            "airport", "#8b5cf6",
            "#1d4ed8",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "white",
        },
      });
      map.addLayer({
        id: "origins-labels",
        type: "symbol",
        source: "origins-points",
        layout: {
          "text-field": [
            "concat",
            ["match", ["get", "type"], "airport", "\u2708 ", "\u{1F3D9} "],
            ["get", "name"],
          ],
          "text-size": 11,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": "#374151",
          "text-halo-color": "white",
          "text-halo-width": 1.5,
        },
      });

      // Click on origin
      map.on("click", "origins-circles", (e) => {
        const feature = e.features?.[0];
        if (!feature?.properties?.id) return;
        const id = feature.properties.id;
        if (compareRef.current) {
          // Compare mode: fill A then B
          if (!originARef.current) {
            setOriginA(id);
          } else if (!originBRef.current) {
            setOriginB(id);
          } else {
            setOriginA(id);
          }
        } else {
          // Single mode: always set A
          setOriginA(id);
        }
      });
      map.on("mouseenter", "origins-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "origins-circles", () => {
        map.getCanvas().style.cursor = "";
      });

      setMapReady(true);
    });

    // Distance mode click handler
    map.on("click", (e) => {
      // Skip if we clicked on an origin point
      const features = map.queryRenderedFeatures(e.point, { layers: ["origins-circles"] });
      if (features.length > 0) return;

      if (modeRef.current !== "distance") return;
      const { lat, lng } = e.lngLat;

      if (compareRef.current) {
        // Compare: A/B toggle
        if (activePinRef.current === "A") {
          setLatA(lat);
          setLngA(lng);
          setActivePin("B");
        } else {
          setLatB(lat);
          setLngB(lng);
          setActivePin("A");
        }
      } else {
        // Single: always update A
        setLatA(lat);
        setLngA(lng);
      }
    });

    mapRef.current = map;

    return () => {
      setMapReady(false);
      markerARef.current?.remove();
      markerBRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Visibility management --
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const isDistance = mode === "distance";

    // Distance A layers: visible in distance mode
    for (const id of ["rings-a-fill", "rings-a-outline", "circle-a-outline"]) {
      map.setLayoutProperty(id, "visibility", isDistance ? "visible" : "none");
    }
    // Distance B layers: visible only in distance + compare
    for (const id of ["rings-b-fill", "rings-b-outline", "circle-b-outline"]) {
      map.setLayoutProperty(id, "visibility", isDistance && compare ? "visible" : "none");
    }
    // Time A layers
    for (const id of ["cells-a-fill", "cells-a-outline"]) {
      map.setLayoutProperty(id, "visibility", !isDistance ? "visible" : "none");
    }
    // Time B layers
    map.setLayoutProperty("cells-b-fill", "visibility", !isDistance && compare ? "visible" : "none");
    // Origins
    for (const id of ["origins-circles", "origins-labels"]) {
      map.setLayoutProperty(id, "visibility", !isDistance ? "visible" : "none");
    }
  }, [mode, compare, mapReady]);

  // -- Distance: update A ring/circle layers --
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const ringsSource = map.getSource("rings-a") as mapboxgl.GeoJSONSource;
    const circleSource = map.getSource("circle-a") as mapboxgl.GeoJSONSource;
    if (!ringsSource || !circleSource) return;

    if (distA.result && latA !== null && lngA !== null) {
      const wedgesGeo = createWedges(lngA, latA, distA.result.wedges, colorBy);
      const circleGeo: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [createCircle(lngA, latA, radiusKm)],
      };
      ringsSource.setData(wedgesGeo);
      circleSource.setData(circleGeo);
    } else if (latA !== null && lngA !== null) {
      // Show circle outline even while loading
      ringsSource.setData(EMPTY_FC);
      const circleGeo: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [createCircle(lngA, latA, radiusKm)],
      };
      circleSource.setData(circleGeo);
    } else {
      ringsSource.setData(EMPTY_FC);
      circleSource.setData(EMPTY_FC);
    }
  }, [distA.result, latA, lngA, radiusKm, colorBy, mapReady]);

  // -- Distance: update B ring/circle layers --
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const ringsSource = map.getSource("rings-b") as mapboxgl.GeoJSONSource;
    const circleSource = map.getSource("circle-b") as mapboxgl.GeoJSONSource;
    if (!ringsSource || !circleSource) return;

    if (compare && distB.result && latB !== null && lngB !== null) {
      const wedgesGeo = createWedges(lngB, latB, distB.result.wedges);
      const circleGeo: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [createCircle(lngB, latB, radiusKm)],
      };
      ringsSource.setData(wedgesGeo);
      circleSource.setData(circleGeo);
    } else {
      ringsSource.setData(EMPTY_FC);
      circleSource.setData(EMPTY_FC);
    }
  }, [distB.result, latB, lngB, radiusKm, compare, mapReady]);

  // -- Distance: markers --
  const updateMarker = useCallback(
    (
      ref: React.MutableRefObject<mapboxgl.Marker | null>,
      lat: number | null,
      lng: number | null,
      label: string,
      bgColor: string,
      borderColor: string
    ) => {
      ref.current?.remove();
      if (lat === null || lng === null || !mapRef.current) return;

      const el = document.createElement("div");
      el.innerHTML = `<div style="
        width:24px;height:24px;border-radius:50%;
        background:${bgColor};border:3px solid white;
        box-shadow:0 0 0 2px ${borderColor}, 0 2px 8px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:11px;font-weight:700;
      ">${label}</div>`;

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(mapRef.current);
      ref.current = marker;
    },
    []
  );

  // Distance mode markers
  useEffect(() => {
    if (mode !== "distance") return;
    if (compare) {
      updateMarker(markerARef, latA, lngA, "A", "#1e40af", "#1e40af");
    } else {
      // Single mode: no label marker, just remove
      markerARef.current?.remove();
      markerARef.current = null;
    }
  }, [latA, lngA, mode, compare, updateMarker]);

  useEffect(() => {
    if (mode !== "distance" || !compare) {
      markerBRef.current?.remove();
      markerBRef.current = null;
      return;
    }
    updateMarker(markerBRef, latB, lngB, "B", "#c2410c", "#c2410c");
  }, [latB, lngB, mode, compare, updateMarker]);

  // -- Time: origin markers --
  useEffect(() => {
    if (mode !== "time") {
      markerARef.current?.remove();
      markerARef.current = null;
      return;
    }
    if (!timeA.data) {
      markerARef.current?.remove();
      markerARef.current = null;
      return;
    }
    const { lat, lng, name } = timeA.data.origin;
    const el = document.createElement("div");
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center">
        <div style="
          background:#1d4ed8;color:white;font-size:12px;font-weight:600;
          padding:3px 8px;border-radius:6px;white-space:nowrap;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);margin-bottom:4px;
        ">${name}</div>
        <div style="
          width:16px;height:16px;border-radius:50%;
          background:#1d4ed8;border:3px solid white;
          box-shadow:0 0 0 3px #1d4ed8, 0 2px 8px rgba(0,0,0,0.3);
        "></div>
      </div>`;
    markerARef.current?.remove();
    if (mapRef.current) {
      markerARef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([lng, lat])
        .addTo(mapRef.current);
    }
  }, [timeA.data, mode]);

  useEffect(() => {
    if (mode !== "time" || !compare) {
      markerBRef.current?.remove();
      markerBRef.current = null;
      return;
    }
    if (!timeB.data) {
      markerBRef.current?.remove();
      markerBRef.current = null;
      return;
    }
    const { lat, lng, name } = timeB.data.origin;
    const el = document.createElement("div");
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center">
        <div style="
          background:#c2410c;color:white;font-size:11px;font-weight:600;
          padding:2px 6px;border-radius:5px;white-space:nowrap;
          box-shadow:0 2px 6px rgba(0,0,0,0.3);margin-bottom:3px;
        ">${name}</div>
        <div style="
          width:14px;height:14px;border-radius:50%;
          background:#c2410c;border:3px solid white;
          box-shadow:0 0 0 2px #c2410c, 0 2px 6px rgba(0,0,0,0.3);
        "></div>
      </div>`;
    markerBRef.current?.remove();
    if (mapRef.current) {
      markerBRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([lng, lat])
        .addTo(mapRef.current);
    }
  }, [timeB.data, mode, compare]);

  // -- Time: update supercell layers --
  const cellsAGeo = useMemo((): GeoJSON.FeatureCollection => {
    if (!timeA.results || timeA.results.cells.length === 0) return EMPTY_FC;
    return buildSuperCells(timeA.results.cells);
  }, [timeA.results]);

  const cellsBGeo = useMemo((): GeoJSON.FeatureCollection => {
    if (!timeB.results || timeB.results.cells.length === 0) return EMPTY_FC;
    return buildSuperCells(timeB.results.cells);
  }, [timeB.results]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("cells-a") as mapboxgl.GeoJSONSource;
    if (src) src.setData(cellsAGeo);
  }, [cellsAGeo, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("cells-b") as mapboxgl.GeoJSONSource;
    if (src) src.setData(cellsBGeo);
  }, [cellsBGeo, mapReady]);

  // -- Time: origins overlay (filter out selected origins, hide low-transit in transit mode) --
  const originsGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    const computed = origins.filter((o) => {
      if (!o.computed) return false;
      // In transit-only mode, hide origins where transit data is too sparse.
      // Fastest mode keeps them — driving fallback still produces meaningful results.
      if (transportMode === "transit") {
        return (o.transitNearPct ?? 0) >= TRANSIT_OK_PCT;
      }
      return true;
    });
    if (computed.length === 0) return EMPTY_FC;
    return {
      type: "FeatureCollection",
      features: computed.map((o) => ({
        type: "Feature" as const,
        properties: { id: o.id, name: o.name, type: o.type },
        geometry: { type: "Point" as const, coordinates: [o.lng, o.lat] },
      })),
    };
  }, [origins, transportMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("origins-points") as mapboxgl.GeoJSONSource;
    if (src) src.setData(originsGeoJson);

    // Filter out selected origins from dots
    const selectedIds = [originA, originB].filter(Boolean);
    if (selectedIds.length > 0) {
      const filter: mapboxgl.FilterSpecification = ["all", ...selectedIds.map((id) => ["!=", ["get", "id"], id] as mapboxgl.FilterSpecification)];
      map.setFilter("origins-circles", filter);
      map.setFilter("origins-labels", filter);
    } else {
      map.setFilter("origins-circles", null);
      map.setFilter("origins-labels", null);
    }
  }, [originsGeoJson, originA, originB, mapReady]);

  // -- Time: color-by toggle for single mode --
  const { maxWeight, maxPop } = useMemo(() => {
    if (!timeA.results || timeA.results.cells.length === 0) return { maxWeight: 1, maxPop: 1 };
    let mw = 0;
    let mp = 0;
    for (const c of timeA.results.cells) {
      if (c.weight > mw) mw = c.weight;
      if (c.pop > mp) mp = c.pop;
    }
    return { maxWeight: mw || 1, maxPop: mp || 1 };
  }, [timeA.results]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || mode !== "time") return;

    if (compare) {
      // Compare mode: use banded travel-time color for cells-a
      map.setPaintProperty("cells-a-fill", "fill-color", [
        "step",
        ["get", "travelTimeMin"],
        "#1e3a8a",
        15, "#1e40af",
        30, "#2563eb",
        45, "#3b82f6",
        60, "#60a5fa",
        90, "#93c5fd",
        120, "#dbeafe",
      ]);
      map.setPaintProperty("cells-a-fill", "fill-opacity", 0.5);
    } else if (timeColorBy === "travel-time") {
      map.setPaintProperty("cells-a-fill", "fill-color", [
        "step",
        ["get", "travelTimeMin"],
        "#15803d",
        15, "#22c55e",
        30, "#eab308",
        45, "#f59e0b",
        60, "#f97316",
        90, "#ef4444",
        120, "#991b1b",
      ]);
      map.setPaintProperty("cells-a-fill", "fill-opacity", 0.7);
    } else if (timeColorBy === "population") {
      // Population mode: band by fraction of max pop in supercell
      const p20 = maxPop * 0.2;
      const p40 = maxPop * 0.4;
      const p60 = maxPop * 0.6;
      const p80 = maxPop * 0.8;
      map.setPaintProperty("cells-a-fill", "fill-color", [
        "step",
        ["get", "pop"],
        "#dbeafe",
        p20, "#93c5fd",
        p40, "#3b82f6",
        p60, "#1d4ed8",
        p80, "#1e3a8a",
      ]);
      map.setPaintProperty("cells-a-fill", "fill-opacity", 0.7);
    } else {
      // Weight mode
      const w20 = maxWeight * 0.2;
      const w40 = maxWeight * 0.4;
      const w60 = maxWeight * 0.6;
      const w80 = maxWeight * 0.8;
      map.setPaintProperty("cells-a-fill", "fill-color", [
        "step",
        ["get", "weight"],
        "#fef9c3",
        w20, "#fde68a",
        w40, "#fbbf24",
        w60, "#f97316",
        w80, "#dc2626",
      ]);
      map.setPaintProperty("cells-a-fill", "fill-opacity", 0.7);
    }
  }, [timeColorBy, mode, compare, mapReady, maxWeight, maxPop]);

  // -- Fly to points --
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (mode === "distance") {
      if (compare && latA !== null && lngA !== null && latB !== null && lngB !== null) {
        map.fitBounds(
          [[Math.min(lngA, lngB), Math.min(latA, latB)], [Math.max(lngA, lngB), Math.max(latA, latB)]],
          { padding: 80, maxZoom: 12, duration: 800 }
        );
      }
    } else {
      if (compare) {
        if (timeA.data && timeB.data) {
          const aO = timeA.data.origin;
          const bO = timeB.data.origin;
          map.fitBounds(
            [[Math.min(aO.lng, bO.lng), Math.min(aO.lat, bO.lat)], [Math.max(aO.lng, bO.lng), Math.max(aO.lat, bO.lat)]],
            { padding: 80, maxZoom: 8, duration: 800 }
          );
        } else if (timeA.data) {
          map.flyTo({ center: [timeA.data.origin.lng, timeA.data.origin.lat], zoom: 8, duration: 800 });
        } else if (timeB.data) {
          map.flyTo({ center: [timeB.data.origin.lng, timeB.data.origin.lat], zoom: 8, duration: 800 });
        }
      } else if (timeA.data) {
        map.flyTo({ center: [timeA.data.origin.lng, timeA.data.origin.lat], zoom: 8, duration: 1200 });
      }
    }
  }, [mode, compare, latA, lngA, latB, lngB, timeA.data, timeB.data, mapReady]);

  // -- Clear markers on mode switch --
  useEffect(() => {
    markerARef.current?.remove();
    markerARef.current = null;
    markerBRef.current?.remove();
    markerBRef.current = null;
  }, [mode]);

  // -- When compare is turned off, clear B state and map data --
  useEffect(() => {
    if (!compare) {
      // Clear B selections
      setLatB(null);
      setLngB(null);
      setOriginB(null);
      setActivePin("A");

      // Clear B map layers
      const map = mapRef.current;
      if (map && mapReady) {
        const rbSrc = map.getSource("rings-b") as mapboxgl.GeoJSONSource;
        const cbSrc = map.getSource("circle-b") as mapboxgl.GeoJSONSource;
        const cellsBSrc = map.getSource("cells-b") as mapboxgl.GeoJSONSource;
        if (rbSrc) rbSrc.setData(EMPTY_FC);
        if (cbSrc) cbSrc.setData(EMPTY_FC);
        if (cellsBSrc) cellsBSrc.setData(EMPTY_FC);
      }

      // Remove B marker
      markerBRef.current?.remove();
      markerBRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare]);

  // Sidebar width depends on compare mode
  const sidebarWidth = compare ? "md:w-[520px]" : "md:w-96";

  return (
    <div className="h-full flex flex-col md:flex-row">
      <DataQualityFirstUseModal />
      <TransitFirstUseModal
        active={mode === "time" && (transportMode === "transit" || transportMode === "fastest")}
      />

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Sidebar */}
      <div className={`w-full ${sidebarWidth} bg-white border-t md:border-t-0 md:border-l border-gray-200 flex flex-col overflow-y-auto transition-all duration-200`}>
        <UnifiedSidebar
          mode={mode}
          onModeChange={setMode}
          compare={compare}
          onCompareChange={setCompare}
          latA={latA}
          lngA={lngA}
          latB={latB}
          lngB={lngB}
          activePin={activePin}
          onActivePinChange={setActivePin}
          radiusKm={radiusKm}
          onRadiusChange={setRadiusKm}
          exponentDist={exponentDist}
          onExponentDistChange={setExponentDist}
          colorBy={colorBy}
          onColorByChange={setColorBy}
          ukMode={ukMode}
          onUkModeChange={setUkMode}
          ukAvailableA={latA !== null && lngA !== null && isInUk(latA, lngA)}
          ukAvailableB={latB !== null && lngB !== null && isInUk(latB, lngB)}
          distResultA={distA.result}
          distResultB={distB.result}
          distLoadingA={distA.loading}
          distLoadingB={distB.loading}
          distErrorA={distA.error}
          distErrorB={distB.error}
          origins={origins}
          originA={originA}
          onOriginAChange={setOriginA}
          originB={originB}
          onOriginBChange={setOriginB}
          transportMode={transportMode}
          onTransportModeChange={setTransportMode}
          exponentTime={exponentTime}
          onExponentTimeChange={setExponentTime}
          maxTimeMin={maxTimeMin}
          onMaxTimeChange={setMaxTimeMin}
          timeColorBy={timeColorBy}
          onTimeColorByChange={setTimeColorBy}
          timeResultsA={timeA.results}
          timeResultsB={timeB.results}
          timeLoadingA={timeA.loading}
          timeLoadingB={timeB.loading}
          timeErrorA={timeA.error}
          timeErrorB={timeB.error}
          originsError={originsError}
        />
      </div>
    </div>
  );
}
