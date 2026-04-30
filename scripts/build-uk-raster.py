# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "geopandas>=1.0",
#     "pandas>=2.2",
#     "rasterio>=1.4",
#     "shapely>=2.0",
#     "pyogrio>=0.10",
#     "requests>=2.32",
#     "tqdm>=4.66",
#     "numpy>=2.0",
# ]
# ///
"""
Build a UK population raster from authoritative ONS / NRS / NISRA census data.

Run:
    uv run scripts/build-uk-raster.py            # E&W only (default)
    uv run scripts/build-uk-raster.py --regions ew,scotland,ni

Output: data/uk-pop-100m-4326.tif
        ~100m WGS84 raster covering the UK, populated by uniform-within-OA
        dasymetric allocation of 2021/2022 census usual-resident counts.

Why this exists
---------------
The default GHS-POP global raster (1km, satellite-derived) systematically
underestimates dense UK city cores — Tom Forth has measured a ~40% shortfall
inside Manchester's 2km core. Pop Squared's "UK mode" swaps in this raster
when the query point is inside the UK bbox.

Status
------
v1 — England & Wales fully working from ONS Census 2021. Scotland and NI
hooks are present but not yet wired to live URLs (TODO markers in SOURCES).
E&W is ~89% of UK population, so v1 already fixes the underestimate for
every English/Welsh city.

Method
------
1. Download OA polygon boundaries (paginated ArcGIS query) and OA-level
   usual-resident counts (Nomis CSV).
2. Inner-join on OA code to get a GeoDataFrame keyed by OA with `population`.
3. Reproject to BNG (EPSG:27700) for area-in-m² calculation, then to WGS84
   (EPSG:4326) for rasterisation.
4. Rasterize at ~100m density (people/km²), then weight each pixel by its
   true geodesic area so totals preserve.
5. Write a compressed tiled GeoTIFF.
"""

from __future__ import annotations

import argparse
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "uk-source-cache"
OUTPUT_TIF = DATA_DIR / "uk-pop-100m-4326.tif"

UK_BBOX = (-8.7, 49.5, 2.0, 61.0)  # minLng, minLat, maxLng, maxLat
TARGET_RES_DEG = 0.001  # ~111m east-west, ~111×cos(lat) m north-south


# --------------------------------------------------------------------------- #
# Source configuration
# --------------------------------------------------------------------------- #


@dataclass
class Source:
    name: str
    key: str
    loader: Callable[[Path], gpd.GeoDataFrame]
    enabled: bool = True


# --------------------------------------------------------------------------- #
# E&W loader (working)
# --------------------------------------------------------------------------- #

EW_BOUNDARY_SERVICE = (
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
    "Output_Areas_2021_EW_BGC_V2/FeatureServer/0/query"
)
EW_POPULATION_URL = (
    "https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1.data.csv"
    "?date=latest&geography=TYPE150&c2021_restype_3=0&measures=20100"
    "&select=geography_code,obs_value"
)


def fetch_ew_boundaries(cache_dir: Path) -> gpd.GeoDataFrame:
    """Paginate the ArcGIS FeatureServer to pull all ~189k E&W OA polygons.

    Each page is cached as a separate GeoJSON file so reruns are cheap.
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    page_size = 2000

    # First, find total record count
    count_resp = requests.get(
        EW_BOUNDARY_SERVICE,
        params={"where": "1=1", "returnCountOnly": "true", "f": "json"},
        timeout=60,
    )
    count_resp.raise_for_status()
    total = count_resp.json()["count"]
    pages = (total + page_size - 1) // page_size
    print(f"  E&W: {total:,} OAs, {pages} pages of {page_size}")

    frames: list[gpd.GeoDataFrame] = []
    for page in tqdm(range(pages), desc="  boundaries"):
        page_path = cache_dir / f"ew_oa_page_{page:03d}.geojson"
        if not page_path.exists():
            params = {
                "where": "1=1",
                "outFields": "OA21CD",
                "outSR": "4326",
                "f": "geojson",
                "resultOffset": page * page_size,
                "resultRecordCount": page_size,
                "orderByFields": "OA21CD",
            }
            r = requests.get(EW_BOUNDARY_SERVICE, params=params, timeout=180)
            r.raise_for_status()
            page_path.write_bytes(r.content)
        frames.append(gpd.read_file(page_path))

    gdf = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs="EPSG:4326")
    gdf = gdf[["OA21CD", "geometry"]].rename(columns={"OA21CD": "oa_code"})
    return gdf


def fetch_ew_population(cache_dir: Path) -> pd.DataFrame:
    """Page the Nomis CSV API. Each request returns up to 25,000 rows."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    page_size = 25000
    page = 0
    paths: list[Path] = []
    while True:
        page_path = cache_dir / f"ew_population_page_{page:02d}.csv"
        if not page_path.exists():
            url = f"{EW_POPULATION_URL}&recordoffset={page * page_size}"
            with requests.get(url, stream=True, timeout=600) as r:
                r.raise_for_status()
                with open(page_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 16):
                        f.write(chunk)
        # Header + 0 data rows ≈ small file → stop. Use line count.
        with open(page_path) as f:
            lines = sum(1 for _ in f)
        paths.append(page_path)
        print(f"  E&W population page {page}: {lines - 1:,} rows")
        if lines - 1 < page_size:
            break
        page += 1
        if page > 20:
            raise RuntimeError("Nomis pagination exceeded 20 pages — bug?")

    df = pd.concat([pd.read_csv(p) for p in paths], ignore_index=True)
    df = df.rename(
        columns={"GEOGRAPHY_CODE": "oa_code", "OBS_VALUE": "population"}
    )[["oa_code", "population"]]
    return df


def load_ew(cache_root: Path) -> gpd.GeoDataFrame:
    print("\n=== England & Wales (ONS Census 2021) ===")
    cache = cache_root / "ew"
    bdry = fetch_ew_boundaries(cache)
    pop = fetch_ew_population(cache)
    merged = bdry.merge(pop, on="oa_code", how="inner")
    print(
        f"  Joined: {len(merged):>7,} OAs, "
        f"total pop: {merged['population'].sum():>12,.0f}"
    )
    return merged


# --------------------------------------------------------------------------- #
# Scotland / NI placeholders — TODO
# --------------------------------------------------------------------------- #


# --------------------------------------------------------------------------- #
# Scotland loader
# --------------------------------------------------------------------------- #

SCOT_BOUNDARY_SERVICE = (
    "https://maps.gov.scot/server/rest/services/"
    "NRS/Census2022/MapServer/3/query"
)
# Topic tables zip from scotlandscensus.gov.uk — contains UV101b at OA level
SCOT_TOPIC_ZIP_URL = (
    "https://www.scotlandscensus.gov.uk/media/"
    "zz85kfinmf97whklasd98gfkadft5hj4f_Topic2H_20241120_1747/"
    "Census-2022-Output-Area-v1.zip"
)
SCOT_POPULATION_TABLE = "UV101b - Usual resident population by sex by age (6).csv"


def fetch_scotland_boundaries(cache_dir: Path) -> gpd.GeoDataFrame:
    """Page the maps.gov.scot ArcGIS MapServer for all 46,363 OA polygons.

    Returns geometry in WGS84. The source CRS is BNG (EPSG:27700) so we
    request reprojection server-side via outSR=4326.
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    page_size = 1000

    count_resp = requests.get(
        SCOT_BOUNDARY_SERVICE,
        params={"where": "1=1", "returnCountOnly": "true", "f": "json"},
        timeout=60,
    )
    count_resp.raise_for_status()
    total = count_resp.json()["count"]
    pages = (total + page_size - 1) // page_size
    print(f"  Scotland: {total:,} OAs, {pages} pages of {page_size}")

    frames: list[gpd.GeoDataFrame] = []
    for page in tqdm(range(pages), desc="  boundaries"):
        page_path = cache_dir / f"scot_oa_page_{page:03d}.geojson"
        if not page_path.exists():
            params = {
                "where": "1=1",
                "outFields": "code",
                "outSR": "4326",
                "f": "geojson",
                "resultOffset": page * page_size,
                "resultRecordCount": page_size,
                "orderByFields": "code",
            }
            r = requests.get(SCOT_BOUNDARY_SERVICE, params=params, timeout=180)
            r.raise_for_status()
            page_path.write_bytes(r.content)
        frames.append(gpd.read_file(page_path))

    gdf = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs="EPSG:4326")
    gdf = gdf[["code", "geometry"]].rename(columns={"code": "oa_code"})
    return gdf


def fetch_scotland_population(cache_dir: Path) -> pd.DataFrame:
    """Download the NRS topic-tables zip, extract UV101b, parse OA + total."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    zip_path = cache_dir / "scot_topic_tables.zip"
    if not zip_path.exists():
        print("  Scotland: downloading topic-tables zip (~74MB)…")
        with requests.get(SCOT_TOPIC_ZIP_URL, stream=True, timeout=600) as r:
            r.raise_for_status()
            total = int(r.headers.get("content-length", 0))
            with open(zip_path, "wb") as f, tqdm(
                total=total, unit="B", unit_scale=True, desc="  download"
            ) as bar:
                for chunk in r.iter_content(chunk_size=1 << 16):
                    f.write(chunk)
                    bar.update(len(chunk))

    csv_path = cache_dir / "scot_population.csv"
    if not csv_path.exists():
        with zipfile.ZipFile(zip_path) as zf:
            with zf.open(SCOT_POPULATION_TABLE) as src, open(csv_path, "wb") as dst:
                dst.write(src.read())

    # Header: 3 title lines + 3 column-header lines, data starts at row 7.
    # Col 0 = OA code, col 1 = Total (All people).
    df = pd.read_csv(csv_path, skiprows=6, header=None, low_memory=False)
    df = df.iloc[:, [0, 1]].rename(columns={0: "oa_code", 1: "population"})
    # NRS uses "-" for zero/suppressed cells in some tables; coerce to int.
    df["population"] = pd.to_numeric(df["population"], errors="coerce").fillna(0).astype(int)
    df = df[df["oa_code"].astype(str).str.startswith("S")]
    return df


def load_scotland(cache_root: Path) -> gpd.GeoDataFrame:
    print("\n=== Scotland (NRS Census 2022) ===")
    cache = cache_root / "scotland"
    bdry = fetch_scotland_boundaries(cache)
    pop = fetch_scotland_population(cache)
    merged = bdry.merge(pop, on="oa_code", how="inner")
    print(
        f"  Joined: {len(merged):>7,} OAs, "
        f"total pop: {merged['population'].sum():>12,.0f}"
    )
    return merged


def load_ni(cache_root: Path) -> gpd.GeoDataFrame:
    raise SystemExit(
        "NI loader not yet implemented. NISRA Census 2021 SA boundaries "
        "+ MS-A01 URLs need to be confirmed and wired up."
    )


SOURCES: list[Source] = [
    Source(name="England & Wales", key="ew", loader=load_ew),
    Source(name="Scotland", key="scotland", loader=load_scotland),
    Source(name="Northern Ireland", key="ni", loader=load_ni, enabled=False),
]


# --------------------------------------------------------------------------- #
# Rasterisation
# --------------------------------------------------------------------------- #


def rasterize_density(
    gdf: gpd.GeoDataFrame, bbox: tuple[float, float, float, float], res_deg: float
) -> tuple[np.ndarray, "rasterio.Affine"]:  # type: ignore[name-defined]
    """Burn population density (people / km²) onto a regular WGS84 grid, then
    multiply by per-pixel geodesic area to recover counts that sum back to the
    OA total."""
    from rasterio import features
    from rasterio.transform import from_bounds

    minx, miny, maxx, maxy = bbox
    width = int(round((maxx - minx) / res_deg))
    height = int(round((maxy - miny) / res_deg))
    transform = from_bounds(minx, miny, maxx, maxy, width, height)

    # Compute area in km² in BNG (true projected metres for E&W; near enough
    # for Scotland; will need separate handling for NI when added).
    proj = gdf.to_crs("EPSG:27700")
    area_km2 = proj.geometry.area / 1e6
    density = (gdf["population"] / area_km2).fillna(0.0).astype("float32")

    print(f"  Rasterising at {res_deg}° (~100m), grid {width}×{height}…")
    density_raster = features.rasterize(
        ((geom, val) for geom, val in zip(gdf.geometry, density)),
        out_shape=(height, width),
        transform=transform,
        fill=0,
        dtype="float32",
    )

    # Convert per-pixel density (people/km²) → people, weighted by latitude.
    # Pixel width: res_deg × 111.32 × cos(lat). Pixel height: res_deg × 111.32.
    lats = np.linspace(maxy - res_deg / 2, miny + res_deg / 2, height)
    pixel_area_km2 = (
        (res_deg * 111.32)
        * (res_deg * 111.32 * np.cos(np.radians(lats)))
    ).astype("float32")
    counts = density_raster * pixel_area_km2[:, None]
    return counts, transform


def write_geotiff(arr: np.ndarray, transform, out: Path) -> None:
    import rasterio

    out.parent.mkdir(parents=True, exist_ok=True)
    height, width = arr.shape
    with rasterio.open(
        out,
        "w",
        driver="GTiff",
        width=width,
        height=height,
        count=1,
        dtype=arr.dtype,
        crs="EPSG:4326",
        transform=transform,
        compress="deflate",
        predictor=2,
        tiled=True,
        blockxsize=512,
        blockysize=512,
    ) as dst:
        dst.write(arr, 1)
    print(f"  → wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--regions",
        default="ew,scotland",
        help="Comma-separated regions to include (ew,scotland,ni). Default: ew,scotland.",
    )
    args = parser.parse_args()
    selected = {r.strip() for r in args.regions.split(",") if r.strip()}

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    parts: list[gpd.GeoDataFrame] = []
    for src in SOURCES:
        if src.key not in selected:
            continue
        try:
            parts.append(src.loader(CACHE_DIR))
        except SystemExit as e:
            print(f"  SKIP {src.name}: {e}", file=sys.stderr)

    if not parts:
        print("No sources loaded — nothing to do.", file=sys.stderr)
        return 1

    combined = gpd.GeoDataFrame(
        pd.concat(parts, ignore_index=True), crs="EPSG:4326"
    )
    print(
        f"\nCombined: {len(combined):,} OAs, "
        f"{combined['population'].sum():,.0f} total population"
    )

    counts, transform = rasterize_density(combined, UK_BBOX, TARGET_RES_DEG)
    raster_total = float(counts.sum())
    src_total = float(combined["population"].sum())
    drift_pct = 100 * (raster_total - src_total) / src_total
    print(
        f"  Raster sum: {raster_total:,.0f}  "
        f"(census: {src_total:,.0f}, drift: {drift_pct:+.2f}%)"
    )
    write_geotiff(counts, transform, OUTPUT_TIF)
    print("\nDone. Restart `npm run dev` to pick up the new raster.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
