# Pop Squared

A YIMBY Alliance internal tool for asking *"how many people live within X kilometres of a point?"* — and a richer follow-up question, *"how does that distribution look once you weight nearby people more heavily than distant ones?"* (the inverse-square / gravity metric). It also overlays public-transport accessibility for UK locations using precomputed isochrones from the TravelTime API.

**Vercel project:** `pop-squared` under the `ya-projects` Vercel team — check the dashboard for the live URL. **Repo:** https://github.com/YIMBYAlliance/pop-squared. **Stack (one line):** A Next.js website hosted on Vercel, reading population rasters and transit data from YA's Cloudflare R2 bucket.

## What this project does

You drop a pin on the map and the app tells you:

- **Total population** within the chosen radius (in 1km bands), drawn from a worldwide ~1km raster.
- **Inverse-square weighted population** — the same numbers but weighted by `1 / r²` so people 1km away count 100× more than people 10km away. Roughly: how "felt" is a place by the population around it.
- **For UK locations** specifically: a higher-resolution 100m raster derived from ONS census data, plus a public-transport accessibility overlay showing the share of population reachable by public transit within a given travel time.
- **Compare mode** — two pins side-by-side, useful for benchmarking sites against each other.

The map and analytics live in the browser; the actual raster reading happens server-side because the population data files are big (the world raster is ~461MB).

## Data and accounts

| Thing | Owner | Where | Notes |
|---|---|---|---|
| GitHub repo | YIMBY Alliance org | `YIMBYAlliance/pop-squared` | Push to `master` to deploy |
| Vercel project | YIMBY Alliance team | `ya-projects/pop-squared` | Auto-deploys `master`; PRs get previews |
| Cloudflare R2 bucket | YIMBY Alliance Cloudflare account | bucket `pop-squared-data` (account `f782162e94b1ce9cd3e12e716233b162`) | Hosts the population GeoTIFF + precomputed travel-time JSON files |
| GHSL GHS-POP raster | European Commission JRC (open data) | https://human-settlement.emergency.copernicus.eu/ | World population at ~1km |
| ONS UK 100m raster | Built from ONS Census 2021 | `scripts/build-uk-raster.py` produces it; output uploaded to R2 | Higher-resolution UK overlay |
| TravelTime API | YA TravelTime account | API key in Infisical | Used by the `/migrate` admin flow to precompute transit isochrones |
| Mapbox token | YA Mapbox account (`freddie-yimby` login) | Infisical → `ya-tools` → `/pop-squared` | Public token for base maps |
| Secrets | YIMBY Alliance Infisical | `ya-tools` project, `/pop-squared` folder | See "Keys & secrets" below |

## Running it locally

You need:

- [Node.js](https://nodejs.org) v20+
- The [Infisical CLI](https://infisical.com/docs/cli/overview): `brew install infisical/get-cli/infisical`

```bash
infisical login                  # one-time, opens browser
cd pop-squared
npm install
npm run dev                      # http://localhost:3000
```

That's it — `npm run dev` is wired to fetch all 10 env vars (Mapbox token, R2 credentials, TravelTime API key, GeoTIFF/TravelTime data URLs) from **Infisical → `ya-tools` → `/pop-squared` → Development**. There's no `.env.local` to populate; the project deliberately forbids on-disk secrets after the 2026-05 secrets-management migration.

If `npm run dev` complains about Infisical, you probably haven't run `infisical login` yet, or you don't have access to the YA `ya-tools` Infisical project — ask whoever has admin to invite you.

> **Old setup scripts (`scripts/setup.sh`, `scripts/download-data.sh`) are no longer required for local dev.** They were used in the original flow that pulled the world GeoTIFF onto your laptop. The current flow reads it directly from R2 via `GEOTIFF_URL`. The scripts still work if you want to develop offline, but they're not the recommended path.

## How to make changes

You'll mostly do this by asking Claude Code in this folder. A typical flow:

1. Open `pop-squared` in Claude Code
2. Describe the change in plain English ("change the colour ramp on the population radius rings", "add a tooltip showing population density per ring", "investigate why the UK transit overlay isn't loading for Glasgow")
3. Claude reads `CLAUDE.md` and follows the conventions there
4. Review the diff
5. Ask Claude to commit and push to `master` — Vercel auto-deploys within ~2 minutes

### Good things to ask Claude

- "Change the colour palette on the population radius rings"
- "Add a new comparison preset called X with these two locations"
- "Why does the transit overlay show no data for [city]? Investigate."
- "List every map mode and compare mode this app supports"
- "Run the project locally so I can see my changes"

### Things to be careful about

- **Don't change R2 file paths** in `GEOTIFF_URL` or `TRAVEL_TIME_URL` without verifying the new URL exists in the bucket. The map silently shows nothing if the raster URL 404s.
- **`/migrate` and the data-recompute API routes are dev-only.** They're gated by `NEXT_PUBLIC_DEV_MODE=true` (set in Infisical's `Development` env, *not* `Production`). Don't enable that flag in Production — it exposes admin endpoints publicly.
- **TravelTime API has a per-month query budget.** The `/migrate` recompute flow can burn through it quickly. Confirm before running a fresh recompute for a new city.

## Deployment

**Push to `master` → Vercel auto-deploys within 1–2 minutes.**

- **Where to see deploy status:** Vercel dashboard → ya-projects → pop-squared.
- **Roll back:** Vercel → Deployments → pick a previous "Ready" → ⋯ menu → "Promote to Production".
- **Preview deploys:** every PR gets one with its own URL.

> **TODO — Vercel sync not yet configured for this project.** As of 2026-05-07 the Infisical→Vercel integration is set up for `public-mapping` and `streetvotes-site`, but **not** for `pop-squared`. Right now the live deploy is using whatever env vars are stored directly in the Vercel project, *not* Infisical. Until the sync is configured, **changing values in Infisical Production will not update the live site**. To finish the setup: in Infisical → `ya-tools` → Integrations → Vercel, add an integration mapping `Production / /pop-squared` → Vercel `pop-squared` project / Production env. Before turning it on, mirror current Vercel prod env vars into `Infisical → ya-tools → Production → /pop-squared` (otherwise the sync overwrites Vercel with whatever's in Infisical, including missing keys). See `electoral-scenarios/CLAUDE.md` for the same TODO note in case you want a full template.

## Keys & secrets

All 10 env vars live in **Infisical → `ya-tools` → `/pop-squared`** (Development for local, Production once Vercel sync is configured):

| Var | Purpose | Required |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox base map (browser-exposed) | yes |
| `GEOTIFF_URL` | R2 URL of the world population GeoTIFF | yes |
| `TRAVEL_TIME_URL` | R2 URL prefix for precomputed travel-time JSON files | yes (UK transit overlay) |
| `NEXT_PUBLIC_DEV_MODE` | Enables `/migrate` admin dashboard + recompute APIs | dev only — never in Production |
| `TRAVELTIME_APP_ID` | TravelTime API app ID | needed only for `/migrate` recompute |
| `TRAVELTIME_API_KEY` | TravelTime API key | needed only for `/migrate` recompute |
| `R2_ACCOUNT_ID` | YA Cloudflare account ID | needed only for `scripts/deploy-r2.sh` |
| `R2_ACCESS_KEY_ID` | R2 API access key ID | needed only for deploy scripts |
| `R2_SECRET_KEY` | R2 API secret | needed only for deploy scripts |
| `R2_BUCKET` | R2 bucket name (`pop-squared-data`) | needed only for deploy scripts |

To rotate any of them: change in Infisical (web UI or CLI), and once the Vercel sync is configured it will push to the live deploy. For now, you'd also need to update the Vercel project's env vars manually until the sync is set up.

## When the current owner leaves

1. **Vercel** — `pop-squared` project is already on the `ya-projects` team. Add the new owner as a Team Member; remove the leaver.
2. **GitHub** — repo is in `YIMBYAlliance` org. Standard org-member changes.
3. **Infisical** — confirm the new owner has access to the `ya-tools` Infisical project with at least Editor permissions on Development + Production.
4. **Cloudflare R2** — the bucket is on the YA Cloudflare account. Confirm successor admin access.
5. **Mapbox** — token is on the shared `freddie-yimby` login (despite the name, it's an org-owned account). Confirm successor has access.
6. **TravelTime** — API key is per-account. If the account holder is leaving, transfer/regenerate.

## When something breaks

- **Map is blank or shows the basemap only** → invalid `NEXT_PUBLIC_MAPBOX_TOKEN`. Verify in Infisical and via mapbox.com → Account → Tokens.
- **Population numbers come back as zero** → `GEOTIFF_URL` either points at a missing R2 object or has a CORS/range-request problem. `curl -I "<url>"` to confirm 200, and check that the R2 bucket allows public reads.
- **Transit overlay shows nothing for UK cities** → either the city doesn't have precomputed isochrones in R2 (run `/migrate` in dev), or `TRAVEL_TIME_URL` points at the wrong R2 prefix.
- **Vercel build fails after a push** → check Vercel build logs. Usually a TypeScript error that wasn't caught locally; run `npx tsc --noEmit` to surface.
- **`/migrate` returns 404 in production** → that's intentional. Those routes are gated behind `NEXT_PUBLIC_DEV_MODE=true`. They only build when that flag is set.

## Open questions / known issues

- **Vercel sync (Infisical → Vercel) not yet configured.** See "Deployment" above.
- **No automated tests.** The only quality gate is `npm run lint` and `npx tsc --noEmit`.
- **TravelTime API budget is shared** with whatever else uses the same account. Heavy `/migrate` runs should be planned with whoever else has it.
- **The world GeoTIFF on R2 is ~461MB.** Range requests work fine via `geotiff` npm package, but if R2 ever moves region or changes pricing, this is a non-trivial cost line.

For deeper technical detail (architecture, conventions, gotchas), see `CLAUDE.md`.
