# Pop Squared — Agent Notes

Audience: future agents maintaining this repo. Pairs with `README.md` (human-facing, written for non-developer YA staff).

**Live:** Vercel project `pop-squared` under the `ya-projects` team. Repo: `YIMBYAlliance/pop-squared`. Push to `master` → auto-deploy.

The team maintaining this is mostly non-technical and will direct work through Claude Code. Read "Working in this repo — instructions for the agent" at the bottom of this file before making changes.

## Purpose

Population radius calculator with inverse-square gravity weighting, plus public-transport accessibility overlay for UK locations. Compare mode supports side-by-side analysis of two pins. UK-specific data uses a higher-resolution ONS-derived raster.

## Architecture in one diagram

```
Cloudflare R2 (bucket: pop-squared-data, YA account)
   GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif    (world ~1km, ~461MB)
   uk-pop-100m.tif (or similar)                       (UK 100m, ONS-derived)
   travel-time/<originId>.json                        (per-origin transit isochrones)

Server (Next.js API routes, on Vercel):
   /api/population               POST {lat,lng,radiusKm} → reads GeoTIFF via HTTP range requests
   /api/travel-time/origins      GET → list of computed UK origins
   /api/travel-time/results/[id] GET → isochrone data for a given origin
   /api/travel-time/compute      (dev-only) compute new origins via TravelTime API → upload to R2
   /api/travel-time/migrate      (dev-only) admin migration

Browser:
   src/app/page.tsx              main page — Mapbox map + UnifiedSidebar + modals
   usePopulation hook            fetches /api/population
   useTravelTimeData hook        fetches /api/travel-time/* and overlays as supercells
   compare mode                  state for two pins, side-by-side analytics
```

## Tech stack

- **Next.js 16** App Router (`src/app`), React 19, TypeScript strict
- **Tailwind 4** + minimal shadcn-ish UI in `src/components/ui`
- **Mapbox GL JS 3** (direct, no react-map-gl wrapper)
- **`geotiff` npm package** for server-side raster reads (range-request friendly)
- **`h3-js`** for hex-cell aggregation in the transit overlay
- **`traveltime-api`** SDK for the dev-only recompute flow
- **No tests, no Storybook, no CI** — `npm run lint` and `npx tsc --noEmit` are the only gates

## Key files

| Path | What it does |
|---|---|
| `src/app/page.tsx` | Main page — Mapbox map, modals, sidebar wiring, compare mode state |
| `src/app/api/population/route.ts` | POST endpoint for population/inverse-square calculation |
| `src/app/api/travel-time/origins/route.ts` | GET list of available UK transit origins (reads R2) |
| `src/app/api/travel-time/results/[originId]/route.ts` | GET per-origin isochrone data (reads R2) |
| `src/app/api/travel-time/compute/route.dev.ts` | (dev-only) compute new origins via TravelTime API |
| `src/app/api/travel-time/migrate/route.dev.ts` | (dev-only) admin migration of travel-time data |
| `src/lib/population.ts` | Core GeoTIFF reading + radius computation, module-scoped cache |
| `src/lib/geotiff-reader.ts` | GeoTIFF abstraction; uses `GEOTIFF_URL` env var |
| `src/lib/geo.ts` | Haversine, bounding-box helpers |
| `src/lib/rings.ts` | Adaptive 1km ring boundaries |
| `src/lib/circle-geojson.ts` | GeoJSON for map overlay (rings, circle, wedges) |
| `src/lib/supercells.ts` | H3-based aggregation for transit overlay |
| `src/lib/types.ts` | Shared TypeScript types incl. `isInUk()` predicate |
| `src/components/UnifiedSidebar.tsx` | Sidebar shell — mode picker, results, methodology entry point |
| `src/components/MigrateDashboard.tsx` | Dev-only `/migrate` admin UI |
| `src/components/compare/` | Compare-mode UI (mode picker, side-by-side panels) |
| `src/components/{Methodology,DataQuality,Transit}*Modal.tsx` | Explanatory / first-use modals |
| `scripts/build-uk-raster.py` | Builds the UK 100m raster from ONS Census data |
| `scripts/build-manifest.mjs` | Builds the manifest of available origins |
| `scripts/deploy-r2.sh` | Uploads built artifacts to R2 (uses `R2_*` env vars) |
| `scripts/deploy-travel-time-r2.sh` | Uploads precomputed travel-time JSON to R2 |
| `scripts/setup.sh`, `scripts/download-data.sh` | Legacy local-dev helpers (not needed in current flow) |

## Data flow

### Population query

1. Browser calls `POST /api/population` with `{lat, lng, radiusKm}`.
2. Route handler reads either world or UK GeoTIFF via `geotiff-reader.ts` (selects based on `isInUk(lat, lng)`).
3. `geotiff` library fetches just the needed tiles via HTTP range requests to `GEOTIFF_URL`. Module-scoped cache keeps repeat reads fast.
4. `src/lib/population.ts` computes ring sums + inverse-square weighted sum.
5. Response includes per-ring breakdown, total, and inverse-square metrics.

### Travel-time overlay

1. Browser calls `GET /api/travel-time/origins` → list of UK cities/airports with computed isochrones.
2. User selects an origin → browser calls `GET /api/travel-time/results/[originId]`.
3. Route reads precomputed JSON from R2 (`TRAVEL_TIME_URL/<originId>.json`).
4. Browser builds H3 supercells from the data and overlays as a Mapbox layer.
5. Sidebar shows `transitNearPct` — % of population within X minutes by transit.

### Recompute flow (dev-only, gated)

1. Run `npm run dev` with `NEXT_PUBLIC_DEV_MODE=true` (already set in Infisical Development).
2. Visit `/migrate` (404s in production builds since the flag isn't set).
3. The dashboard offers buttons that POST to `/api/travel-time/compute` and `/api/travel-time/migrate`.
4. Compute calls the TravelTime API for new isochrones (uses `TRAVELTIME_APP_ID` + `TRAVELTIME_API_KEY`).
5. Migrate uploads results to R2 (uses `R2_*` env vars).
6. **Both endpoints are gated by `if (process.env.NEXT_PUBLIC_DEV_MODE !== "true") return 404` — production builds don't include them at all** because `next.config.ts` `pageExtensions` excludes `.dev.ts` when the flag is unset.

## Environment variables

**Source of truth: Infisical** (`ya-tools` project, `/pop-squared` folder, `dev` and `prod` environments). The repo is linked via `.infisical.json`. `npm run dev` invokes `infisical run --env=dev --path=/pop-squared -- next dev`, so secrets reach the code at runtime — there is no `.env.local` and one should not be added.

To run anything else with secrets injected: `infisical run --env=dev --path=/pop-squared -- <command>` (e.g. `bash scripts/deploy-r2.sh`). To read/set secrets directly: `infisical secrets --env=dev --path=/pop-squared`, `infisical secrets set NAME=value --env=dev --path=/pop-squared`. The user must be `infisical login`'d and have access to `ya-tools`.

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | yes | Browser-exposed Mapbox public token |
| `GEOTIFF_URL` | yes | R2 URL for the world GeoTIFF |
| `TRAVEL_TIME_URL` | yes (transit) | R2 URL prefix for precomputed isochrones |
| `NEXT_PUBLIC_DEV_MODE` | dev only | Set to `"true"` in Development; **must be unset/false in Production** — gates `/migrate` admin routes |
| `TRAVELTIME_APP_ID` | recompute only | TravelTime API app ID |
| `TRAVELTIME_API_KEY` | recompute only | TravelTime API key — costs money to use heavily |
| `R2_ACCOUNT_ID` | deploy only | YA Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | deploy only | Used by `scripts/deploy-r2.sh` |
| `R2_SECRET_KEY` | deploy only | Used by `scripts/deploy-r2.sh` |
| `R2_BUCKET` | deploy only | `pop-squared-data` |

> **TODO — Vercel sync not yet configured.** As of 2026-05-07 the Infisical→Vercel integration is set up for `public-mapping` and `streetvotes-site`, but not for `pop-squared`. Until it's configured, the Vercel deployment uses env vars stored directly in the Vercel project — changing values in Infisical Production won't update the live site. To finish: in Infisical → `ya-tools` → Integrations → Vercel, add a mapping `Production / /pop-squared` → Vercel `pop-squared` / Production. Mirror Vercel's current prod values into Infisical Production *first* (to avoid the sync wiping them on first run).

## Common tasks

### Run dev

```bash
npm install
npm run dev   # wraps `infisical run --env=dev --path=/pop-squared -- next dev`
```

### Build / lint / type-check

```bash
npm run build
npm run lint
npx tsc --noEmit   # type-check only
```

### Deploy data to R2

```bash
infisical run --env=dev --path=/pop-squared -- bash scripts/deploy-r2.sh
infisical run --env=dev --path=/pop-squared -- bash scripts/deploy-travel-time-r2.sh
```

The R2 credentials come from Infisical via `infisical run`. Don't hand-edit env vars.

### Recompute travel-time data for a new city

This costs TravelTime API budget. Confirm with the user first.

1. `npm run dev` (which sets `NEXT_PUBLIC_DEV_MODE=true`).
2. Visit `/migrate`.
3. Use the dashboard buttons to compute new origins → upload to R2.
4. Verify in production: redeploy Vercel and check the new origin appears in the dropdown.

### Rotate the Mapbox token

1. mapbox.com → `freddie-yimby` account → Account → Tokens. Either restrict the existing token to the right URL allowlist, or create a new one.
2. Update `NEXT_PUBLIC_MAPBOX_TOKEN` in **Infisical → ya-tools → Development → /pop-squared** (and Production once sync is configured).
3. Redeploy Vercel so the new value bakes into the build.

## Non-obvious gotchas

- **`NEXT_PUBLIC_DEV_MODE` doubles as a build-time and runtime gate.** `next.config.ts` reads it via `pageExtensions` to *exclude* `.dev.ts` files from production builds, and the dev-only route handlers also check `process.env.NEXT_PUBLIC_DEV_MODE !== "true"` at runtime. Both layers must agree.
- **GeoTIFF range-request reads cache module-scoped.** `src/lib/population.ts` keeps a parsed-header cache so repeat queries don't re-fetch metadata. If you change the GeoTIFF URL at runtime, restart the server.
- **`getOrigin()` on `GeoTIFFImage` returns `[x, y, z]` (3 elements), not 4.** Older docs say 4; the library returns 3.
- **`geotiff` is in `serverExternalPackages` in `next.config.ts`.** It uses Node APIs and won't work in the Edge runtime. Don't move population endpoints to Edge.
- **Tailwind v4 syntax.** `@import "tailwindcss"` in `globals.css`, not `@tailwind` directives.
- **Mapbox account name `freddie-yimby` is historical** — it's an org-owned shared account despite the name. Don't rename.
- **R2 public URLs require the `pub-...r2.dev` prefix to be enabled** on the bucket. If a new bucket is created from scratch, the public URL is off by default — toggle in Cloudflare dashboard or via `wrangler r2 bucket dev-url enable`.
- **TravelTime API has rate limits and a monthly cap.** Heavy `/migrate` recompute runs can blow the cap fast.

## Working in this repo — instructions for the agent

The people directing your work in this repo are mostly non-developer YA staff. Behave accordingly:

1. **Ask the user when anything is unclear.** Use `AskUserQuestion` with concrete options rather than guessing. Specifically ask before:
   - Touching the `/migrate` recompute flow (costs TravelTime budget).
   - Changing R2 bucket paths or replacing data files there.
   - Making non-obvious changes to the population calculation (it's the load-bearing primitive — most of the rest of the app trusts its output).
   - Anything that touches `next.config.ts` `pageExtensions` (it's load-bearing for the dev-mode gate).

2. **Keep `CLAUDE.md` and `README.md` current as you work.** Treat docs as part of every change, in the same commit:
   - New env var, new external service, new route → update `CLAUDE.md`.
   - Human-visible change (new mode, new compare option, new map style) → update `README.md`.
   - New gotcha discovered while debugging → add it here so the next agent doesn't repeat it.
   - Something in the docs is now wrong → fix it.

3. **Test before declaring done.** For UI changes, run `npm run dev` and check in a browser — type-checks don't catch visual regressions. Test compare mode and the UK transit overlay in particular; both have sharp edges. If you can't actually test something, say so explicitly.

4. **Match the existing conventions.** Read neighbouring files first. Per-mode state lives in `src/app/page.tsx`. Modals follow the `*FirstUseModal.tsx` / `*Modal.tsx` pattern. Map sources use Mapbox GL directly (no wrapper). Use shadcn-ish primitives in `src/components/ui` — don't introduce a second component library.

5. **Don't add scope.** Fix what was asked. The team is small and unlikely to do much development here — extra surface area is a liability.

6. **Be careful with deployment, secrets, and shared state.** Confirm before:
   - Pushing to `master` (this deploys to production).
   - Force-pushing or rewriting history.
   - Modifying anything in Vercel's environment variables directly (you usually shouldn't be doing this — change it in Infisical instead, once Vercel sync is configured).
   - Rotating the Mapbox / TravelTime / R2 credentials.
   - Re-uploading data files to R2 (silently goes live everywhere, no Vercel deploy needed).

7. **Don't enable `NEXT_PUBLIC_DEV_MODE=true` in Production.** It exposes admin routes publicly and they aren't auth-gated.

8. **The `/migrate` flow burns money.** Confirm before triggering any compute action there.
