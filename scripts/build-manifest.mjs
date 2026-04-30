#!/usr/bin/env node
// Build data/travel-time/manifest.json from the JSON files in that directory.
// Output format:
//   [{ "id": "london", "cellCount": 119626, "transitNearPct": 55.0 }, ...]
//
// transitNearPct = % of cells within 50km of the origin that have a non-null
// transit time. Matches useTravelTimeData.ts so the UI can read it directly.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data", "travel-time");
const NEAR_KM = 50;
const R = 6371;

function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function buildManifest() {
  const entries = await fs.readdir(DATA_DIR);
  const files = entries.filter((f) => f.endsWith(".json") && f !== "manifest.json").sort();

  const manifest = [];
  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.warn(`  skip ${id}: invalid JSON (${err.message})`);
      continue;
    }
    const cells = data.cells ?? [];
    const oLat = data.origin?.lat;
    const oLng = data.origin?.lng;

    let nearTotal = 0;
    let nearTransit = 0;
    if (typeof oLat === "number" && typeof oLng === "number") {
      for (const c of cells) {
        if (haversine(oLat, oLng, c.lat, c.lng) < NEAR_KM) {
          nearTotal++;
          if (c.transit !== null && c.transit !== undefined) nearTransit++;
        }
      }
    }
    const transitNearPct = nearTotal > 0
      ? Math.round((nearTransit / nearTotal) * 1000) / 10
      : 0;

    manifest.push({ id, cellCount: cells.length, transitNearPct });
  }

  const outPath = path.join(DATA_DIR, "manifest.json");
  await fs.writeFile(outPath, JSON.stringify(manifest));
  console.log(`Wrote ${manifest.length} entries to ${path.relative(process.cwd(), outPath)}`);
}

buildManifest().catch((err) => {
  console.error(err);
  process.exit(1);
});
