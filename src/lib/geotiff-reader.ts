import { fromFile, fromUrl, GeoTIFF, GeoTIFFImage } from "geotiff";
import path from "path";
import type { DataSource } from "./types";

const SOURCE_FILES: Record<DataSource, string> = {
  ghs: "GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif",
  uk: "uk-pop-100m-4326.tif",
};

const SOURCE_ENV: Record<DataSource, string> = {
  ghs: "GEOTIFF_URL",
  uk: "GEOTIFF_UK_URL",
};

const cachedImages: Partial<Record<DataSource, GeoTIFFImage>> = {};
const imagePromises: Partial<Record<DataSource, Promise<GeoTIFFImage>>> = {};

/**
 * Returns the shared GeoTIFFImage for the given source, opening on first call.
 * Safe to call concurrently — deduplicates the open per source.
 */
export async function getImage(source: DataSource = "ghs"): Promise<GeoTIFFImage> {
  const cached = cachedImages[source];
  if (cached) return cached;

  const inflight = imagePromises[source];
  if (inflight) return inflight;

  const p = openImage(source);
  imagePromises[source] = p;
  try {
    const img = await p;
    cachedImages[source] = img;
    return img;
  } catch (err) {
    delete imagePromises[source];
    throw err;
  }
}

async function openImage(source: DataSource): Promise<GeoTIFFImage> {
  const filename = SOURCE_FILES[source];
  const remoteUrl = process.env[SOURCE_ENV[source]];
  let tiff: GeoTIFF;
  try {
    if (remoteUrl) {
      tiff = await fromUrl(remoteUrl);
    } else {
      const tifPath = path.join(process.cwd(), "data", filename);
      tiff = await fromFile(tifPath);
    }
    return await tiff.getImage();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (source === "uk") {
      throw new Error(
        `UK population raster not available. Build it with "uv run scripts/build-uk-raster.py" or set ${SOURCE_ENV.uk} for remote access. (${detail})`
      );
    }
    if (remoteUrl) {
      throw new Error(
        `Could not load population data from remote URL. Check that ${SOURCE_ENV[source]} is correct. (${detail})`
      );
    }
    throw new Error(
      `Population data file not found. Run "bash scripts/download-data.sh" to download it, or set ${SOURCE_ENV[source]} for remote access. (${detail})`
    );
  }
}

/**
 * Mutex for readRasters — geotiff doesn't support concurrent reads on the
 * same image. Per-source queue so UK and GHS reads don't block each other.
 */
const readQueues: Partial<Record<DataSource, Promise<unknown>>> = {};

export async function readRastersExclusive(
  image: GeoTIFFImage,
  window: [number, number, number, number],
  source: DataSource = "ghs"
): Promise<Float32Array | Float64Array> {
  const prev = readQueues[source] ?? Promise.resolve();
  const result = prev.then(async () => {
    const rasterData = await image.readRasters({ window });
    return rasterData[0] as Float32Array | Float64Array;
  });
  readQueues[source] = result.then(() => {}, () => {});
  return result;
}
