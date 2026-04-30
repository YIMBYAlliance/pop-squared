import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ORIGINS } from "@/lib/origins";
import type { OriginResult } from "@/lib/travel-time-types";
import type { MigrateOriginStats } from "@/lib/migrate-types";

const RESULTS_DIR = path.join(process.cwd(), "data", "travel-time");

export async function GET() {
  if (process.env.NEXT_PUBLIC_DEV_MODE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const origins: MigrateOriginStats[] = await Promise.all(
    ORIGINS.map(async (origin) => {
      const base: MigrateOriginStats = {
        id: origin.id,
        name: origin.name,
        country: origin.country,
        type: origin.type,
        hasFile: false,
        totalCells: null,
        drivingReachable: null,
        transitReachable: null,
        drivingPct: null,
        transitPct: null,
        computedAt: null,
      };

      const filePath = path.join(RESULTS_DIR, `${origin.id}.json`);
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        const data: OriginResult = JSON.parse(raw);
        const total = data.cells.length;
        const driving = data.cells.filter((c) => c.driving !== null).length;
        const transit = data.cells.filter((c) => c.transit !== null).length;

        return {
          ...base,
          hasFile: true,
          totalCells: total,
          drivingReachable: driving,
          transitReachable: transit,
          drivingPct: total > 0 ? Math.round((driving / total) * 1000) / 10 : 0,
          transitPct: total > 0 ? Math.round((transit / total) * 1000) / 10 : 0,
          computedAt: data.computedAt,
        };
      } catch {
        return base;
      }
    })
  );

  return NextResponse.json({ origins });
}
