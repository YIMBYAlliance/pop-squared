"use client";

import ModePicker, { type CompareMode } from "./compare/ModePicker";
import Controls from "./Controls";
import Results from "./Results";
import RingTable from "./RingTable";
import TravelTimeExplorer from "./TravelTimeExplorer";
import DistanceControls from "./compare/DistanceControls";
import TimeControls from "./compare/TimeControls";
import MetricCards from "./compare/MetricCards";
import BreakdownTable, { type BandRow } from "./compare/BreakdownTable";
import DistributionChart from "./compare/DistributionChart";
import SingleBarChart from "./SingleBarChart";
import type { PopulationResult, RingResult } from "@/lib/types";
import type { TransportMode, TimeBand } from "@/lib/travel-time-types";
import type { ColorBy } from "@/lib/circle-geojson";

interface OriginInfo {
  id: string;
  name: string;
  type: "city" | "airport";
  country: string;
  computed: boolean;
  transitNearPct: number | null;
}

interface TravelTimeResults {
  totalReachable: number;
  totalPopulation: number;
  rawSum: number;
  normalized: number;
  timeBands: TimeBand[];
  transitCoveragePct: number;
  drivingCoveragePct: number;
  transitNearPct: number;
}

interface UnifiedSidebarProps {
  // Mode
  mode: CompareMode;
  onModeChange: (m: CompareMode) => void;
  compare: boolean;
  onCompareChange: (c: boolean) => void;

  // Distance state
  latA: number | null;
  lngA: number | null;
  latB: number | null;
  lngB: number | null;
  activePin: "A" | "B";
  onActivePinChange: (pin: "A" | "B") => void;
  radiusKm: number;
  onRadiusChange: (r: number) => void;
  exponentDist: number;
  onExponentDistChange: (e: number) => void;
  colorBy: ColorBy;
  onColorByChange: (c: ColorBy) => void;
  ukMode: boolean;
  onUkModeChange: (v: boolean) => void;
  ukAvailableA: boolean;
  ukAvailableB: boolean;
  distResultA: PopulationResult | null;
  distResultB: PopulationResult | null;
  distLoadingA: boolean;
  distLoadingB: boolean;
  distErrorA: string | null;
  distErrorB: string | null;

  // Time state
  origins: OriginInfo[];
  originA: string | null;
  onOriginAChange: (id: string | null) => void;
  originB: string | null;
  onOriginBChange: (id: string | null) => void;
  transportMode: TransportMode;
  onTransportModeChange: (m: TransportMode) => void;
  exponentTime: number;
  onExponentTimeChange: (e: number) => void;
  maxTimeMin: number;
  onMaxTimeChange: (m: number) => void;
  timeColorBy: "travel-time" | "population" | "weight";
  onTimeColorByChange: (c: "travel-time" | "population" | "weight") => void;
  timeResultsA: TravelTimeResults | null;
  timeResultsB: TravelTimeResults | null;
  timeLoadingA: boolean;
  timeLoadingB: boolean;
  timeErrorA: string | null;
  timeErrorB: string | null;
  originsError: string | null;
}

// --- Helper builders (reused from CompareSidebar logic) ---

function buildDistanceMetrics(a: PopulationResult | null, b: PopulationResult | null) {
  return [
    { label: "Total Population", valueA: a?.totalPopulation ?? null, valueB: b?.totalPopulation ?? null },
    { label: "Raw Gravity", sublabel: "\u03A3 pop/r\u207F", valueA: a?.inverseSqSum ?? null, valueB: b?.inverseSqSum ?? null },
    { label: "Normalized", sublabel: "pop-weighted avg", valueA: a?.inverseSqNormalized ?? null, valueB: b?.inverseSqNormalized ?? null },
  ];
}

function buildTimeMetrics(a: TravelTimeResults | null, b: TravelTimeResults | null) {
  return [
    { label: "Reachable Pop", valueA: a?.totalPopulation ?? null, valueB: b?.totalPopulation ?? null },
    { label: "Raw Gravity", sublabel: "\u03A3 pop/t\u207F", valueA: a?.rawSum ?? null, valueB: b?.rawSum ?? null },
    { label: "Normalized", sublabel: "pop-weighted avg", valueA: a?.normalized ?? null, valueB: b?.normalized ?? null },
  ];
}

function buildDistanceBands(a: PopulationResult | null, b: PopulationResult | null): BandRow[] {
  const ringsA = a?.rings ?? [];
  const ringsB = b?.rings ?? [];
  const maxLen = Math.max(ringsA.length, ringsB.length);
  if (maxLen === 0) return [];
  const bands: BandRow[] = [];
  for (let i = 0; i < maxLen; i++) {
    const ra: RingResult | undefined = ringsA[i];
    const rb: RingResult | undefined = ringsB[i];
    const ring = ra ?? rb;
    if (!ring) continue;
    bands.push({
      label: `${ring.innerKm}\u2013${ring.outerKm} km`,
      popA: ra?.population ?? null, weightA: ra?.inverseSqContribution ?? null,
      popB: rb?.population ?? null, weightB: rb?.inverseSqContribution ?? null,
    });
  }
  return bands;
}

function buildTimeBands(a: TravelTimeResults | null, b: TravelTimeResults | null, maxTimeMin: number): BandRow[] {
  const bandsA = a?.timeBands ?? [];
  const bandsB = b?.timeBands ?? [];
  const maxLen = Math.max(bandsA.length, bandsB.length);
  if (maxLen === 0) return [];
  const bands: BandRow[] = [];
  for (let i = 0; i < maxLen; i++) {
    const ba = bandsA[i];
    const bb = bandsB[i];
    const band = ba ?? bb;
    if (!band || band.minMin >= maxTimeMin) continue;
    const displayMax = Math.min(band.maxMin, maxTimeMin);
    bands.push({
      label: `${band.minMin}\u2013${displayMax} min`,
      popA: ba ? ba.population : null, weightA: ba ? ba.weightedContribution : null,
      popB: bb ? bb.population : null, weightB: bb ? bb.weightedContribution : null,
    });
  }
  return bands;
}

function buildDistChartBands(a: PopulationResult | null, b: PopulationResult | null) {
  const ringsA = a?.rings ?? [];
  const ringsB = b?.rings ?? [];
  const maxLen = Math.max(ringsA.length, ringsB.length);
  const bands = [];
  for (let i = 0; i < maxLen; i++) {
    const ra = ringsA[i];
    const rb = ringsB[i];
    const ring = ra ?? rb;
    if (!ring) continue;
    bands.push({ label: `${ring.innerKm}\u2013${ring.outerKm}`, valueA: ra?.population ?? 0, valueB: rb?.population ?? 0 });
  }
  return bands;
}

function buildTimeChartBands(a: TravelTimeResults | null, b: TravelTimeResults | null, maxTimeMin: number) {
  const bandsA = a?.timeBands ?? [];
  const bandsB = b?.timeBands ?? [];
  const maxLen = Math.max(bandsA.length, bandsB.length);
  const bands = [];
  for (let i = 0; i < maxLen; i++) {
    const ba = bandsA[i];
    const bb = bandsB[i];
    const band = ba ?? bb;
    if (!band || band.minMin >= maxTimeMin) continue;
    const displayMax = Math.min(band.maxMin, maxTimeMin);
    bands.push({ label: `${band.minMin}\u2013${displayMax}`, valueA: ba?.population ?? 0, valueB: bb?.population ?? 0 });
  }
  return bands;
}

function buildSingleDistBands(result: PopulationResult | null) {
  if (!result) return [];
  return result.rings.map((r) => ({
    label: `${r.innerKm}\u2013${r.outerKm}`,
    value: r.population,
  }));
}

function buildSingleTimeBands(results: TravelTimeResults | null, maxTimeMin: number) {
  if (!results) return [];
  return results.timeBands
    .filter((b) => b.cellCount > 0 && b.minMin < maxTimeMin)
    .map((b) => ({
      label: `${b.minMin}\u2013${Math.min(b.maxMin, maxTimeMin)}`,
      value: b.population,
    }));
}

export default function UnifiedSidebar(props: UnifiedSidebarProps) {
  const isDistance = props.mode === "distance";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">Pop Squared</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Population weighted by proximity
        </p>
      </div>

      {/* Mode Picker */}
      <div className="p-5 border-b border-gray-100">
        <ModePicker mode={props.mode} onChange={props.onModeChange} />
      </div>

      {/* Compare Toggle */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Compare</span>
        <button
          onClick={() => props.onCompareChange(!props.compare)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            props.compare ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              props.compare ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Content: depends on mode + compare */}
      {props.compare ? (
        <CompareContent {...props} isDistance={isDistance} />
      ) : (
        <SingleContent {...props} isDistance={isDistance} />
      )}

      {/* Footer */}
      <div className="mt-auto p-4 text-xs text-gray-400 border-t border-gray-100 space-y-1">
        <p>
          Inspired by{" "}
          <a
            href="https://www.tomforth.co.uk/circlepopulations/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Tom Forth&apos;s Circle Populations
          </a>
        </p>
        <p>
          Population:{" "}
          <a
            href="https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            GHSL GHS-POP R2023A
          </a>
          {" "}(JRC, CC&nbsp;BY&nbsp;4.0)
        </p>
        <p>
          Travel times:{" "}
          <a
            href="https://docs.traveltime.com/api/overview/introduction"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            TravelTime API
          </a>
          ; validated against{" "}
          <a
            href="https://github.com/conveyal/r5"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Conveyal R5
          </a>
        </p>
        <p>
          Maps:{" "}
          <a
            href="https://www.mapbox.com/about/maps/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Mapbox
          </a>
          {" "}&middot;{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            OpenStreetMap
          </a>
          {" "}contributors
        </p>
      </div>
    </div>
  );
}

// ---------- Single mode (no compare) ----------

function SingleContent(props: UnifiedSidebarProps & { isDistance: boolean }) {
  if (props.isDistance) {
    return (
      <>
        <div className="p-5 border-b border-gray-100">
          <Controls
            radiusKm={props.radiusKm}
            onRadiusChange={props.onRadiusChange}
            exponent={props.exponentDist}
            onExponentChange={props.onExponentDistChange}
            colorBy={props.colorBy}
            onColorByChange={props.onColorByChange}
            ukMode={props.ukMode}
            onUkModeChange={props.onUkModeChange}
            ukAvailable={props.ukAvailableA}
          />
        </div>
        <div className="p-5 border-b border-gray-100">
          <Results
            result={props.distResultA}
            loading={props.distLoadingA}
            error={props.distErrorA}
            exponent={props.exponentDist}
          />
        </div>
        {props.distResultA && props.distResultA.rings.length > 0 && (
          <>
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-sm font-medium text-gray-700 mb-2">
                Ring Breakdown
              </h2>
              <RingTable rings={props.distResultA.rings} exponent={props.exponentDist} />
            </div>
            <div className="p-5">
              <h2 className="text-sm font-medium text-gray-700 mb-2">
                Distribution
              </h2>
              <SingleBarChart bands={buildSingleDistBands(props.distResultA)} />
            </div>
          </>
        )}
      </>
    );
  }

  // Time single
  const timeSingleBands = buildSingleTimeBands(props.timeResultsA, props.maxTimeMin);

  return (
    <>
      <div className="p-5 flex-1">
        {props.originsError ? (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-2">
            <p className="text-sm font-medium text-red-800">Unable to load travel-time data</p>
            <p className="text-xs text-red-600">{props.originsError}</p>
          </div>
        ) : (
          <TravelTimeExplorer
            origins={props.origins}
            selectedOrigin={props.originA}
            onOriginChange={props.onOriginAChange}
            mode={props.transportMode}
            onModeChange={props.onTransportModeChange}
            exponent={props.exponentTime}
            onExponentChange={props.onExponentTimeChange}
            maxTimeMin={props.maxTimeMin}
            onMaxTimeChange={props.onMaxTimeChange}
            colorBy={props.timeColorBy}
            onColorByChange={props.onTimeColorByChange}
            results={props.timeResultsA}
            loading={props.timeLoadingA}
            error={props.timeErrorA}
          />
        )}
      </div>
      {timeSingleBands.length > 0 && (
        <div className="p-5 border-t border-gray-100">
          <h2 className="text-sm font-medium text-gray-700 mb-2">
            Distribution
          </h2>
          <SingleBarChart bands={timeSingleBands} />
        </div>
      )}
    </>
  );
}

// ---------- Transit data quality warning for compare mode ----------

function TransitCoverageWarning({
  mode,
  resultsA,
  resultsB,
  nameA,
  nameB,
}: {
  mode: TransportMode;
  resultsA: TravelTimeResults | null;
  resultsB: TravelTimeResults | null;
  nameA: string;
  nameB: string;
}) {
  if (mode !== "transit" && mode !== "fastest") return null;

  const lowA = resultsA && resultsA.transitNearPct < 80;
  const lowB = resultsB && resultsB.transitNearPct < 80;
  if (!lowA && !lowB) return null;

  const veryLowA = resultsA && resultsA.transitNearPct < 5;
  const veryLowB = resultsB && resultsB.transitNearPct < 5;

  const lines: string[] = [];
  if (veryLowA) {
    lines.push(`${nameA}: transit data essentially unavailable (${resultsA!.transitNearPct}% within 50km)`);
  } else if (lowA) {
    lines.push(`${nameA}: limited transit data (${resultsA!.transitNearPct}% within 50km)`);
  }
  if (veryLowB) {
    lines.push(`${nameB}: transit data essentially unavailable (${resultsB!.transitNearPct}% within 50km)`);
  } else if (lowB) {
    lines.push(`${nameB}: limited transit data (${resultsB!.transitNearPct}% within 50km)`);
  }

  const hasVeryLow = veryLowA || veryLowB;

  return (
    <div className={`mt-3 rounded-lg p-3 space-y-1 ${
      hasVeryLow ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"
    }`}>
      <p className={`text-xs font-medium ${hasVeryLow ? "text-red-800" : "text-amber-800"}`}>
        Data quality warning
      </p>
      {lines.map((line, i) => (
        <p key={i} className={`text-xs ${hasVeryLow ? "text-red-700" : "text-amber-700"}`}>
          {line}
        </p>
      ))}
      <p className={`text-xs ${hasVeryLow ? "text-red-600" : "text-amber-600"}`}>
        Transit coverage depends on GTFS feeds — comparisons between origins with
        different coverage levels may not be fair.
      </p>
    </div>
  );
}

// ---------- Compare mode ----------

function CompareContent(props: UnifiedSidebarProps & { isDistance: boolean }) {
  // Resolve display names
  const nameA = props.isDistance
    ? (props.latA !== null ? `${props.latA.toFixed(2)}, ${props.lngA?.toFixed(2)}` : "A")
    : (props.origins.find((o) => o.id === props.originA)?.name ?? "A");
  const nameB = props.isDistance
    ? (props.latB !== null ? `${props.latB.toFixed(2)}, ${props.lngB?.toFixed(2)}` : "B")
    : (props.origins.find((o) => o.id === props.originB)?.name ?? "B");

  const metricRows = props.isDistance
    ? buildDistanceMetrics(props.distResultA, props.distResultB)
    : buildTimeMetrics(props.timeResultsA, props.timeResultsB);

  const bandRows = props.isDistance
    ? buildDistanceBands(props.distResultA, props.distResultB)
    : buildTimeBands(props.timeResultsA, props.timeResultsB, props.maxTimeMin);

  const chartBands = props.isDistance
    ? buildDistChartBands(props.distResultA, props.distResultB)
    : buildTimeChartBands(props.timeResultsA, props.timeResultsB, props.maxTimeMin);

  const loadingA = props.isDistance ? props.distLoadingA : props.timeLoadingA;
  const loadingB = props.isDistance ? props.distLoadingB : props.timeLoadingB;
  const errorA = props.isDistance ? props.distErrorA : props.timeErrorA;
  const errorB = props.isDistance ? props.distErrorB : props.timeErrorB;

  const hasData = props.isDistance
    ? props.distResultA !== null || props.distResultB !== null
    : props.timeResultsA !== null || props.timeResultsB !== null;

  return (
    <>
      {/* Controls */}
      <div className="p-5 border-b border-gray-100">
        {props.isDistance ? (
          <div className="space-y-4">
            <DistanceControls
              activePin={props.activePin}
              onActivePinChange={props.onActivePinChange}
              latA={props.latA}
              lngA={props.lngA}
              latB={props.latB}
              lngB={props.lngB}
              radiusKm={props.radiusKm}
              onRadiusChange={props.onRadiusChange}
              exponent={props.exponentDist}
              onExponentChange={props.onExponentDistChange}
            />
            <Controls
              radiusKm={props.radiusKm}
              onRadiusChange={props.onRadiusChange}
              exponent={props.exponentDist}
              onExponentChange={props.onExponentDistChange}
              colorBy={props.colorBy}
              onColorByChange={props.onColorByChange}
              ukMode={props.ukMode}
              onUkModeChange={props.onUkModeChange}
              ukAvailable={props.ukAvailableA || props.ukAvailableB}
              colorByOnly
            />
          </div>
        ) : (
          <>
            <TimeControls
              origins={props.origins}
              originA={props.originA}
              onOriginAChange={props.onOriginAChange}
              originB={props.originB}
              onOriginBChange={props.onOriginBChange}
              transportMode={props.transportMode}
              onTransportModeChange={props.onTransportModeChange}
              exponent={props.exponentTime}
              onExponentChange={props.onExponentTimeChange}
              maxTimeMin={props.maxTimeMin}
              onMaxTimeChange={props.onMaxTimeChange}
            />
            <TransitCoverageWarning
              mode={props.transportMode}
              resultsA={props.timeResultsA}
              resultsB={props.timeResultsB}
              nameA={nameA}
              nameB={nameB}
            />
          </>
        )}
      </div>

      {/* Errors */}
      {(errorA || errorB) && (
        <div className="p-5 border-b border-gray-100 space-y-2">
          {errorA && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700">A: {errorA}</p>
            </div>
          )}
          {errorB && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700">B: {errorB}</p>
            </div>
          )}
        </div>
      )}

      {/* Metrics */}
      <div className="p-5 border-b border-gray-100">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Summary</h3>
        <MetricCards
          mode={props.mode}
          rows={metricRows}
          loadingA={loadingA}
          loadingB={loadingB}
          labelA={nameA}
          labelB={nameB}
        />
        {!hasData && !loadingA && !loadingB && !errorA && !errorB && (
          <p className="text-sm text-gray-500 text-center">
            {props.isDistance
              ? "Click the map to place markers A and B."
              : "Select two origins to compare."}
          </p>
        )}
      </div>

      {/* Breakdown Table */}
      {bandRows.length > 0 && (
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Breakdown</h3>
          <BreakdownTable
            bands={bandRows}
            weightHeader={props.isDistance ? "pop/r\u207F" : "pop/t\u207F"}
          />
        </div>
      )}

      {/* Distribution Chart */}
      {chartBands.length > 0 && hasData && (
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Distribution</h3>
          <DistributionChart bands={chartBands} labelA={nameA} labelB={nameB} />
        </div>
      )}
    </>
  );
}
