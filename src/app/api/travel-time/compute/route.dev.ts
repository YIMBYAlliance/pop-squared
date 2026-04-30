import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { TravelTimeClient, TravelTimeProtoClient } from "traveltime-api";
import { latLngToCell } from "h3-js";
import { ORIGINS } from "@/lib/origins";
import { extractPopulatedCells } from "@/lib/travel-time-grid";
import type { OriginResult, TravelTimeCell } from "@/lib/travel-time-types";

const MAX_TRAVEL_TIME_SEC = 10800; // 3 hours
const SEARCH_RADIUS_KM = 200;
const H3_RESOLUTION = 7; // ~1.22km edge length, matches our ~1km grid
const RESULTS_DIR = path.join(process.cwd(), "data", "travel-time");

// Proto API country codes (subset of countries with good proto support)
const PROTO_COUNTRIES: Record<string, string> = {
  GB: "uk", UK: "uk",
  US: "us", CA: "ca", MX: "mx",
  FR: "fr", DE: "de", IT: "it", ES: "es", PT: "pt",
  NL: "nl", BE: "be", AT: "at", CH: "ch",
  SE: "se", NO: "no", DK: "dk", FI: "fi",
  PL: "pl", RO: "ro", HU: "hu", GR: "gr",
  IE: "ie", LV: "lv", LT: "lt", SI: "si",
  RS: "rs", AU: "au", NZ: "nz", JP: "jp",
  IN: "in", SG: "sg", PH: "ph", ID: "id",
  ZA: "za", SA: "sa",
};

function getCredentials() {
  const appId = process.env.TRAVELTIME_APP_ID;
  const apiKey = process.env.TRAVELTIME_API_KEY;
  if (!appId || !apiKey) {
    throw new Error("TRAVELTIME_APP_ID and TRAVELTIME_API_KEY must be set in .env.local");
  }
  return { apiKey, applicationId: appId };
}

// TravelTime per-minute quota is shared across H3 + Proto endpoints, so split
// the budget rather than letting each client think it has the whole quota.
// Both retry on 429 with a meaningful backoff so concurrent workers cooperate.
const RATE_LIMIT = {
  enabled: true,
  hitsPerMinute: 30,
  retryCount: 5,
  timeBetweenRetries: 3000,
} as const;

// Module-scoped singletons so the rate-limit budget persists across requests.
// (A fresh client per request would reset its quota tracker every time.)
let _client: TravelTimeClient | null = null;
let _protoClient: TravelTimeProtoClient | null = null;

function getClient(): TravelTimeClient {
  if (!_client) _client = new TravelTimeClient(getCredentials(), { rateLimitSettings: RATE_LIMIT });
  return _client;
}

function getProtoClient(): TravelTimeProtoClient {
  if (!_protoClient) _protoClient = new TravelTimeProtoClient(getCredentials(), { rateLimitSettings: RATE_LIMIT });
  return _protoClient;
}

/** Pick the faster (lower) non-null value */
function pickBest(a: number | null, b: number | null): number | null {
  if (a !== null && b !== null) return Math.min(a, b);
  return a ?? b;
}

/** Returns next Monday at 08:00 UTC as ISO string */
function getNextMondayMorning(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  monday.setUTCHours(8, 0, 0, 0);
  return monday.toISOString();
}

/** Extract a short message from a TravelTime error or generic Error */
function describeError(err: unknown): string {
  if (err && typeof err === "object") {
    // TravelTimeError has http_status and description
    const tte = err as { http_status?: number; description?: string; message?: string };
    if (tte.http_status && tte.description) {
      return `HTTP ${tte.http_status}: ${tte.description}`;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}


export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEV_MODE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { originId, merge, dual } = body;

    if (!originId || typeof originId !== "string") {
      return NextResponse.json({ error: "originId is required" }, { status: 400 });
    }

    const origin = ORIGINS.find((o) => o.id === originId);
    if (!origin) {
      return NextResponse.json({ error: `Unknown origin: ${originId}` }, { status: 400 });
    }

    // Extract populated cells from GeoTIFF
    const { cells: gridCells } = await extractPopulatedCells(
      origin.lat,
      origin.lng,
      SEARCH_RADIUS_KM
    );

    if (gridCells.length === 0) {
      return NextResponse.json(
        { error: "No populated cells found within search radius" },
        { status: 400 }
      );
    }

    const client = getClient();
    const departureTime = getNextMondayMorning();
    const warnings: string[] = [];
    let hasAnyData = false;

    // Call H3 endpoint for driving
    const drivingTimes = new Map<string, number>();
    let h3DrivingError: string | null = null;
    try {
      const drivingResult = await client.h3({
        resolution: H3_RESOLUTION,
        properties: ["min"],
        departure_searches: [
          {
            id: "driving",
            coords: { lat: origin.lat, lng: origin.lng },
            transportation: { type: "driving+ferry" },
            travel_time: MAX_TRAVEL_TIME_SEC,
            departure_time: departureTime,
          },
        ],
      });

      for (const result of drivingResult.results) {
        for (const cell of result.cells) {
          drivingTimes.set(cell.id, cell.properties.min!);
        }
      }
      if (drivingTimes.size > 0) hasAnyData = true;
    } catch (err) {
      h3DrivingError = describeError(err);
      warnings.push(`H3 driving: ${h3DrivingError}`);
      console.error(`H3 driving failed for ${originId}: ${h3DrivingError}`);
    }

    // Call H3 endpoint for public transit
    const transitTimes = new Map<string, number>();
    let h3TransitError: string | null = null;
    try {
      const transitResult = await client.h3({
        resolution: H3_RESOLUTION,
        properties: ["min"],
        departure_searches: [
          {
            id: "transit",
            coords: { lat: origin.lat, lng: origin.lng },
            transportation: { type: "public_transport" },
            travel_time: MAX_TRAVEL_TIME_SEC,
            departure_time: departureTime,
          },
        ],
      });

      for (const result of transitResult.results) {
        for (const cell of result.cells) {
          transitTimes.set(cell.id, cell.properties.min!);
        }
      }
      if (transitTimes.size > 0) hasAnyData = true;
    } catch (err) {
      h3TransitError = describeError(err);
      warnings.push(`H3 transit: ${h3TransitError}`);
      console.error(`H3 transit failed for ${originId}: ${h3TransitError}`);
    }

    // Optionally call Proto API too and merge with H3 results
    let protoDrivingTimes: number[] | null = null;
    let protoTransitTimes: number[] | null = null;
    let usedProto = false;

    if (dual) {
      const protoCountry = PROTO_COUNTRIES[origin.country];
      if (protoCountry) {
        usedProto = true;
        const protoClient = getProtoClient();
        const coords = gridCells.map((c) => ({ lat: c.lat, lng: c.lng }));

        try {
          const drivingResult = await protoClient.timeFilterFast({
            country: protoCountry as "uk",
            departureLocation: { lat: origin.lat, lng: origin.lng },
            destinationCoordinates: coords,
            transportation: "driving+ferry",
            travelTime: MAX_TRAVEL_TIME_SEC,
          });
          if (!("error" in drivingResult)) {
            protoDrivingTimes = drivingResult.properties.travelTimes;
            if (protoDrivingTimes.some((t) => t >= 0)) hasAnyData = true;
          }
        } catch (err) {
          const msg = describeError(err);
          warnings.push(`Proto driving: ${msg}`);
          console.error(`Proto driving failed for ${originId}: ${msg}`);
        }

        try {
          const transitResult = await protoClient.timeFilterFast({
            country: protoCountry as "uk",
            departureLocation: { lat: origin.lat, lng: origin.lng },
            destinationCoordinates: coords,
            transportation: "pt",
            travelTime: MAX_TRAVEL_TIME_SEC,
          });
          if (!("error" in transitResult)) {
            protoTransitTimes = transitResult.properties.travelTimes;
            if (protoTransitTimes.some((t) => t >= 0)) hasAnyData = true;
          }
        } catch (err) {
          const msg = describeError(err);
          warnings.push(`Proto transit: ${msg}`);
          console.error(`Proto transit failed for ${originId}: ${msg}`);
        }
      }
    }

    // If every API call failed, don't save an empty file — return a retryable error
    if (!hasAnyData) {
      return NextResponse.json(
        {
          error: `All API calls failed for ${origin.name}`,
          retryable: true,
          warnings,
        },
        { status: 502 }
      );
    }

    // Map population grid cells to H3 cells, merge with Proto if available
    const cells: TravelTimeCell[] = [];
    let drivingReachable = 0;
    let transitReachable = 0;

    for (let i = 0; i < gridCells.length; i++) {
      const gc = gridCells[i];
      const h3Id = latLngToCell(gc.lat, gc.lng, H3_RESOLUTION);
      const h3Driving = drivingTimes.get(h3Id) ?? null;
      const h3Transit = transitTimes.get(h3Id) ?? null;

      const protoDriving = protoDrivingTimes && protoDrivingTimes[i] >= 0
        ? protoDrivingTimes[i] : null;
      const protoTransit = protoTransitTimes && protoTransitTimes[i] >= 0
        ? protoTransitTimes[i] : null;

      const driving = pickBest(h3Driving, protoDriving);
      const transit = pickBest(h3Transit, protoTransit);

      if (driving !== null || transit !== null) {
        cells.push({
          lat: gc.lat,
          lng: gc.lng,
          pop: gc.pop,
          driving,
          transit,
        });
        if (driving !== null) drivingReachable++;
        if (transit !== null) transitReachable++;
      }
    }

    // Merge with old file if requested: per-cell, keep the best time for each mode
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    const filePath = path.join(RESULTS_DIR, `${originId}.json`);
    let merged = false;
    let oldDrivingReachable: number | null = null;
    let oldTransitReachable: number | null = null;
    let oldCellCount: number | null = null;

    if (merge) {
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        const oldResult: OriginResult = JSON.parse(raw);

        // Index old cells by coordinate key
        const oldMap = new Map<string, TravelTimeCell>();
        for (const c of oldResult.cells) {
          oldMap.set(`${c.lat},${c.lng}`, c);
        }
        oldCellCount = oldResult.cells.length;
        oldDrivingReachable = oldResult.cells.filter((c) => c.driving !== null).length;
        oldTransitReachable = oldResult.cells.filter((c) => c.transit !== null).length;

        // Index new cells by coordinate key
        const newMap = new Map<string, TravelTimeCell>();
        for (const c of cells) {
          newMap.set(`${c.lat},${c.lng}`, c);
        }

        // Union of all cell keys
        const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
        cells.length = 0;
        drivingReachable = 0;
        transitReachable = 0;

        for (const key of allKeys) {
          const oldCell = oldMap.get(key);
          const newCell = newMap.get(key);
          const pop = newCell?.pop ?? oldCell!.pop;
          const [lat, lng] = key.split(",").map(Number);

          const driving = pickBest(oldCell?.driving ?? null, newCell?.driving ?? null);
          const transit = pickBest(oldCell?.transit ?? null, newCell?.transit ?? null);

          if (driving !== null || transit !== null) {
            cells.push({ lat, lng, pop, driving, transit });
            if (driving !== null) drivingReachable++;
            if (transit !== null) transitReachable++;
          }
        }

        merged = true;
      } catch {
        // No old file — nothing to merge with, use new results as-is
      }
    }

    // Build result object
    const result: OriginResult = {
      origin: { id: origin.id, name: origin.name, lat: origin.lat, lng: origin.lng },
      computedAt: new Date().toISOString(),
      maxTravelTimeSec: MAX_TRAVEL_TIME_SEC,
      searchRadiusKm: SEARCH_RADIUS_KM,
      cells,
    };

    await fs.writeFile(filePath, JSON.stringify(result));

    return NextResponse.json({
      success: true,
      merged,
      usedProto,
      cellCount: cells.length,
      totalGridCells: gridCells.length,
      drivingReachable,
      transitReachable,
      oldCellCount,
      oldDrivingReachable,
      oldTransitReachable,
      h3DrivingCells: drivingTimes.size,
      h3TransitCells: transitTimes.size,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    console.error("Compute error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
