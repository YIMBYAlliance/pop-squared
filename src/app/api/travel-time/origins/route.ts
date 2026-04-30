import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ORIGINS } from "@/lib/origins";

const RESULTS_DIR = path.join(process.cwd(), "data", "travel-time");

interface ManifestEntry {
  id: string;
  cellCount: number;
  transitNearPct?: number;
}

interface ManifestData {
  cellCount: number | null;
  transitNearPct: number | null;
}

let cachedRemoteManifest: ManifestEntry[] | null = null;
let cachedLocalManifest: ManifestEntry[] | null = null;

async function getRemoteManifest(): Promise<ManifestEntry[]> {
  if (cachedRemoteManifest) return cachedRemoteManifest;
  const remoteBase = process.env.TRAVEL_TIME_URL;
  if (!remoteBase) return [];
  try {
    const res = await fetch(`${remoteBase}/manifest.json`);
    if (res.ok) {
      cachedRemoteManifest = await res.json();
      return cachedRemoteManifest!;
    }
  } catch {
    // Remote manifest unavailable
  }
  return [];
}

async function getLocalManifest(): Promise<ManifestEntry[]> {
  if (cachedLocalManifest) return cachedLocalManifest;
  try {
    const raw = await fs.readFile(path.join(RESULTS_DIR, "manifest.json"), "utf-8");
    cachedLocalManifest = JSON.parse(raw);
    return cachedLocalManifest!;
  } catch {
    return [];
  }
}

export async function GET() {
  const [remoteManifest, localManifest] = await Promise.all([
    getRemoteManifest(),
    getLocalManifest(),
  ]);

  const lookup = (m: ManifestEntry[]): Map<string, ManifestData> =>
    new Map(
      m.map((e) => [
        e.id,
        {
          cellCount: e.cellCount ?? null,
          transitNearPct: e.transitNearPct ?? null,
        },
      ])
    );

  const localMap = lookup(localManifest);
  const remoteMap = lookup(remoteManifest);

  const origins = await Promise.all(
    ORIGINS.map(async (origin) => {
      const filePath = path.join(RESULTS_DIR, `${origin.id}.json`);
      let computed = false;
      let stats: ManifestData | undefined;

      try {
        await fs.access(filePath);
        computed = true;
        stats = localMap.get(origin.id) ?? remoteMap.get(origin.id);
      } catch {
        if (remoteMap.has(origin.id)) {
          computed = true;
          stats = remoteMap.get(origin.id);
        }
      }

      return {
        ...origin,
        computed,
        cellCount: stats?.cellCount ?? null,
        transitNearPct: stats?.transitNearPct ?? null,
      };
    })
  );

  return NextResponse.json({
    origins,
    total: origins.length,
    completed: origins.filter((o) => o.computed).length,
  });
}
