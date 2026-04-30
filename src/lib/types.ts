export type DataSource = "ghs" | "uk";

export interface PopulationQuery {
  lat: number;
  lng: number;
  radiusKm: number;
  exponent: number;
  dataSource?: DataSource;
}

// Rough UK bounding box (incl. Shetland margins). Used to bound the UK raster.
export const UK_BBOX = {
  minLat: 49.5,
  maxLat: 61.0,
  minLng: -8.7,
  maxLng: 2.0,
};

// UK mode currently covers Great Britain (E&W + Scotland). Northern Ireland
// is not yet rasterised — exclude its bbox so users get a graceful fallback
// to GHS rather than a zero-population query.
const NI_BBOX = {
  minLat: 54.0,
  maxLat: 55.3,
  maxLng: -5.4, // NI sits west of this; mainland GB is east
};

export function isInUk(lat: number, lng: number): boolean {
  if (
    lat < UK_BBOX.minLat ||
    lat > UK_BBOX.maxLat ||
    lng < UK_BBOX.minLng ||
    lng > UK_BBOX.maxLng
  ) {
    return false;
  }
  // Exclude Northern Ireland until its raster ships.
  if (lat >= NI_BBOX.minLat && lat <= NI_BBOX.maxLat && lng <= NI_BBOX.maxLng) {
    return false;
  }
  return true;
}

export interface RingResult {
  innerKm: number;
  outerKm: number;
  population: number;
  inverseSqContribution: number;
  areaSqKm: number;
  density: number;
}

export interface WedgeResult {
  ringIdx: number;
  sectorIdx: number;
  innerKm: number;
  outerKm: number;
  startAngle: number; // degrees, 0 = north, clockwise
  endAngle: number;
  population: number;
  areaSqKm: number;
  density: number;
  inverseSqContribution: number;
  /** 0–1 normalized intensity for coloring */
  intensity: number;
}

export interface PopulationResult {
  totalPopulation: number;
  inverseSqSum: number;
  inverseSqNormalized: number;
  rings: RingResult[];
  wedges: WedgeResult[];
  pixelsProcessed: number;
  computeTimeMs: number;
  center: { lat: number; lng: number };
  radiusKm: number;
}
