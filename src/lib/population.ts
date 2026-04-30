import { getImage, readRastersExclusive } from "./geotiff-reader";
import { haversineDistance, bearing, boundingBox } from "./geo";
import { generateRingBoundaries } from "./rings";
import type { PopulationQuery, PopulationResult, RingResult, WedgeResult } from "./types";

const NUM_SECTORS = 12;
const SECTOR_SIZE_DEG = 360 / NUM_SECTORS;

const MIN_DISTANCE_KM = 0.1; // Clamp for inverse-square (100m)

export async function computePopulation(
  query: PopulationQuery
): Promise<PopulationResult> {
  const startTime = performance.now();
  const { lat, lng, radiusKm, exponent, dataSource = "ghs" } = query;

  const image = await getImage(dataSource);
  const [originX, originY] = image.getOrigin();
  const [resX, resY] = image.getResolution();
  const width = image.getWidth();
  const height = image.getHeight();

  // Bounding box in geographic coords
  const [minLng, minLat, maxLng, maxLat] = boundingBox(lat, lng, radiusKm);

  // Convert to pixel coordinates
  const col0 = Math.max(0, Math.floor((minLng - originX) / resX));
  const col1 = Math.min(width - 1, Math.ceil((maxLng - originX) / resX));
  const row0 = Math.max(0, Math.floor((maxLat - originY) / resY)); // resY is negative
  const row1 = Math.min(height - 1, Math.ceil((minLat - originY) / resY));

  // Read the window of raster data
  const data = await readRastersExclusive(image, [col0, row0, col1 + 1, row1 + 1], dataSource);
  const readWidth = col1 - col0 + 1;

  // Generate ring boundaries
  const ringBounds = generateRingBoundaries(radiusKm);

  // Initialize ring accumulators
  const ringCount = ringBounds.length - 1;
  const ringPop = new Float64Array(ringCount);
  const ringInvSq = new Float64Array(ringCount);
  const ringArea = new Float64Array(ringCount);

  // Wedge accumulators: ringCount * NUM_SECTORS
  const wedgePop = new Float64Array(ringCount * NUM_SECTORS);
  const wedgeInvSq = new Float64Array(ringCount * NUM_SECTORS);
  const wedgeArea = new Float64Array(ringCount * NUM_SECTORS);

  let totalPop = 0;
  let inverseSqSum = 0;
  let inverseSqWeightSum = 0;
  let pixelsProcessed = 0;

  const pixelSizeDeg = Math.abs(resX);

  // Iterate over pixels in the window
  for (let row = row0; row <= row1; row++) {
    const pixelLat = originY + (row + 0.5) * resY;
    for (let col = col0; col <= col1; col++) {
      const pixelLng = originX + (col + 0.5) * resX;

      const dist = haversineDistance(lat, lng, pixelLat, pixelLng);
      if (dist > radiusKm) continue;

      const idx = (row - row0) * readWidth + (col - col0);
      const pop = data[idx];

      // Skip nodata (negative values or NaN)
      if (pop < 0 || isNaN(pop)) continue;

      pixelsProcessed++;
      totalPop += pop;

      // Find which ring this pixel belongs to
      let ringIdx = -1;
      for (let r = 0; r < ringCount; r++) {
        if (dist >= ringBounds[r] && dist < ringBounds[r + 1]) {
          ringIdx = r;
          break;
        }
      }
      // Edge case: pixel exactly at outer boundary
      if (ringIdx === -1 && dist <= radiusKm) {
        ringIdx = ringCount - 1;
      }

      if (ringIdx >= 0) {
        ringPop[ringIdx] += pop;

        const r = Math.max(dist, MIN_DISTANCE_KM);
        const weight = 1 / Math.pow(r, exponent);
        const contribution = pop * weight;
        ringInvSq[ringIdx] += contribution;
        inverseSqSum += contribution;
        inverseSqWeightSum += weight;

        // Approximate pixel area
        const cosLat = Math.cos((pixelLat * Math.PI) / 180);
        const areaKm2 =
          pixelSizeDeg *
          (Math.PI / 180) *
          6371 *
          (pixelSizeDeg * (Math.PI / 180) * 6371 * cosLat);
        ringArea[ringIdx] += areaKm2;

        // Wedge accumulation
        const brng = bearing(lat, lng, pixelLat, pixelLng);
        const sectorIdx = Math.min(Math.floor(brng / SECTOR_SIZE_DEG), NUM_SECTORS - 1);
        const wedgeIdx = ringIdx * NUM_SECTORS + sectorIdx;
        wedgePop[wedgeIdx] += pop;
        wedgeInvSq[wedgeIdx] += contribution;
        wedgeArea[wedgeIdx] += areaKm2;
      }
    }
  }

  // Build ring results
  const rings: RingResult[] = [];
  for (let r = 0; r < ringCount; r++) {
    const area = ringArea[r] || 1;
    rings.push({
      innerKm: ringBounds[r],
      outerKm: ringBounds[r + 1],
      population: Math.round(ringPop[r]),
      inverseSqContribution: Math.round(ringInvSq[r] * 100) / 100,
      areaSqKm: Math.round(area * 10) / 10,
      density: Math.round(ringPop[r] / area),
    });
  }

  // Build wedge results
  // Find max value for intensity normalization
  let maxWedgeVal = 0;
  for (let i = 0; i < ringCount * NUM_SECTORS; i++) {
    if (wedgeInvSq[i] > maxWedgeVal) maxWedgeVal = wedgeInvSq[i];
  }
  if (maxWedgeVal === 0) maxWedgeVal = 1;

  const wedges: WedgeResult[] = [];
  for (let r = 0; r < ringCount; r++) {
    for (let s = 0; s < NUM_SECTORS; s++) {
      const idx = r * NUM_SECTORS + s;
      const area = wedgeArea[idx] || 1;
      const pop = wedgePop[idx];
      wedges.push({
        ringIdx: r,
        sectorIdx: s,
        innerKm: ringBounds[r],
        outerKm: ringBounds[r + 1],
        startAngle: s * SECTOR_SIZE_DEG,
        endAngle: (s + 1) * SECTOR_SIZE_DEG,
        population: Math.round(pop),
        areaSqKm: Math.round(area * 10) / 10,
        density: Math.round(pop / area),
        inverseSqContribution: Math.round(wedgeInvSq[idx] * 100) / 100,
        intensity: wedgeInvSq[idx] / maxWedgeVal,
      });
    }
  }

  return {
    totalPopulation: Math.round(totalPop),
    inverseSqSum: Math.round(inverseSqSum * 100) / 100,
    inverseSqNormalized:
      inverseSqWeightSum > 0
        ? Math.round((inverseSqSum / inverseSqWeightSum) * 100) / 100
        : 0,
    rings,
    wedges,
    pixelsProcessed,
    computeTimeMs: Math.round(performance.now() - startTime),
    center: { lat, lng },
    radiusKm,
  };
}
