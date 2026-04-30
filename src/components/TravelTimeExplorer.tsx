"use client";

import { useState, useEffect, useRef } from "react";
import type { TransportMode } from "@/lib/travel-time-types";
import type { TimeBand } from "@/lib/travel-time-types";
import OriginCombobox from "./OriginCombobox";
import Tooltip from "./Tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Origin {
  id: string;
  name: string;
  type: "city" | "airport";
  country: string;
  computed: boolean;
  transitNearPct: number | null;
}

interface Results {
  totalReachable: number;
  totalPopulation: number;
  rawSum: number;
  normalized: number;
  timeBands: TimeBand[];
  transitCoveragePct: number;
  drivingCoveragePct: number;
  transitNearPct: number;
}

interface TravelTimeExplorerProps {
  origins: Origin[];
  selectedOrigin: string | null;
  onOriginChange: (id: string | null) => void;
  mode: TransportMode;
  onModeChange: (mode: TransportMode) => void;
  exponent: number;
  onExponentChange: (exp: number) => void;
  maxTimeMin: number;
  onMaxTimeChange: (min: number) => void;
  colorBy: "travel-time" | "population" | "weight";
  onColorByChange: (cb: "travel-time" | "population" | "weight") => void;
  results: Results | null;
  loading: boolean;
  error: string | null;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatExp(n: number): string {
  return n === Math.round(n) ? String(n) : n.toFixed(1);
}

const DEFAULT_MAX_TIME = 120;
const UNLIMITED_MAX_TIME = 180;

function MaxTimeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [maxCap, setMaxCap] = useState(DEFAULT_MAX_TIME);
  const unlimited = maxCap === UNLIMITED_MAX_TIME;

  const toggleLimit = () => {
    if (unlimited) {
      setMaxCap(DEFAULT_MAX_TIME);
      if (value > DEFAULT_MAX_TIME) onChange(DEFAULT_MAX_TIME);
    } else {
      setMaxCap(UNLIMITED_MAX_TIME);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-gray-700">
          Max travel time: {value} min
        </label>
        <button
          onClick={toggleLimit}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          {unlimited ? `Cap at ${DEFAULT_MAX_TIME} min` : "Remove limit"}
        </button>
      </div>
      <input
        type="range"
        min={15}
        max={maxCap}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>15 min</span>
        <span>{maxCap} min</span>
      </div>
    </div>
  );
}

export default function TravelTimeExplorer({
  origins,
  selectedOrigin,
  onOriginChange,
  mode,
  onModeChange,
  exponent,
  onExponentChange,
  maxTimeMin,
  onMaxTimeChange,
  colorBy,
  onColorByChange,
  results,
  loading,
  error,
}: TravelTimeExplorerProps) {
  const [tableView, setTableView] = useState<"cumulative" | "per-band">("cumulative");

  // Track which origins the user has dismissed the low-data dialog for
  const [dismissedOrigins, setDismissedOrigins] = useState<Set<string>>(new Set());
  const prevOriginRef = useRef(selectedOrigin);

  // Reset dismissed state when origin changes
  useEffect(() => {
    if (selectedOrigin !== prevOriginRef.current) {
      prevOriginRef.current = selectedOrigin;
    }
  }, [selectedOrigin]);

  const showLowDataDialog =
    results &&
    !loading &&
    (mode === "transit" || mode === "fastest") &&
    results.transitNearPct < 5 &&
    selectedOrigin !== null &&
    !dismissedOrigins.has(selectedOrigin);

  return (
    <div className="space-y-5">
      {/* Origin Selector */}
      <OriginCombobox
        origins={origins}
        value={selectedOrigin}
        onChange={onOriginChange}
        transitMode={mode === "transit"}
      />

      {/* Mode Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Transport Mode
        </label>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(["driving", "transit", "fastest"] as TransportMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                mode === m
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {m === "driving" ? "Driving" : m === "transit" ? "Transit" : "Fastest"}
            </button>
          ))}
        </div>
      </div>

      {/* Exponent Slider */}
      <div className="space-y-2">
        <Tooltip text="Controls how fast weight drops with distance. n=1: gentle. n=2: inverse-square (gravity). n=3: very local.">
          <label className="text-sm font-medium text-gray-700 cursor-help border-b border-dashed border-gray-300">
            Exponent: {exponent.toFixed(1)} &mdash; 1/t<sup>{formatExp(exponent)}</sup>
          </label>
        </Tooltip>
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.1}
          value={exponent}
          onChange={(e) => onExponentChange(Number(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>0.1</span>
          <span>3.0</span>
        </div>
      </div>

      {/* Max Time Slider */}
      <MaxTimeSlider value={maxTimeMin} onChange={onMaxTimeChange} />

      {/* Color By Toggle */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Colour by
        </label>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {([
            { value: "travel-time" as const, label: "Time" },
            { value: "population" as const, label: "Population" },
            { value: "weight" as const, label: `1/t${formatExp(exponent)}` },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => onColorByChange(opt.value)}
              className={`flex-1 px-2 py-2 text-sm font-medium transition-colors ${
                colorBy === opt.value
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-500">
          <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading data...</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Near-zero transit data: popup dialog */}
      <AlertDialog
        open={!!showLowDataDialog}
        onOpenChange={(open) => {
          if (!open && selectedOrigin) {
            setDismissedOrigins((prev) => new Set(prev).add(selectedOrigin));
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transit data unavailable</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Transit data covers only <strong>{results?.transitNearPct}%</strong> of
                  cells within 50km of this origin ({results?.transitCoveragePct}% overall).
                  This is too sparse to be meaningful.
                </p>
                <p>
                  The TravelTime API relies on published GTFS feeds. Some regions — including
                  parts of Southern Europe, many US cities, and most of Asia — have very
                  limited feed coverage. This doesn&apos;t mean transit is bad here, just that
                  the data source can&apos;t see it.
                </p>
                <p>
                  Results in transit or fastest mode will effectively only reflect driving
                  times for this origin. Switch to <strong>Driving</strong> mode for reliable results.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Understood</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inline transit coverage warning (moderate cases) */}
      {results && !loading && (mode === "transit" || mode === "fastest") && results.transitNearPct >= 5 && (
        <div className={`rounded-lg p-3 space-y-1 ${
          results.transitNearPct >= 80
            ? "bg-amber-50 border border-amber-200"
            : "bg-red-50 border border-red-200"
        }`}>
          <p className={`text-xs font-medium ${
            results.transitNearPct >= 80 ? "text-amber-800" : "text-red-800"
          }`}>
            Transit data: {results.transitNearPct}% within 50km, {results.transitCoveragePct}% overall
          </p>
          <p className={`text-xs ${
            results.transitNearPct >= 80 ? "text-amber-700" : "text-red-700"
          }`}>
            {results.transitNearPct >= 80
              ? "Urban transit data looks good. Overall coverage is lower because the 200km search radius extends well beyond the transit network — this is normal."
              : "Transit data may be incomplete for this region. The TravelTime API relies on published GTFS feeds, which have limited coverage in parts of Southern/Eastern Europe, the US, and Asia. Results may understate true transit accessibility."}
          </p>
        </div>
      )}

      {results && !loading && (
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Reachable within {maxTimeMin} min
            </p>
            <p className="text-3xl font-bold text-gray-900">
              {results.totalPopulation.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400">
              {formatNumber(results.totalPopulation)} people across{" "}
              {results.totalReachable.toLocaleString()} cells
            </p>
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-3">
            <Tooltip text="Weights population by travel time: each person contributes pop/t^n.">
              <p className="text-xs uppercase tracking-wide text-blue-600 font-medium cursor-help border-b border-dashed border-blue-300">
                Travel-Time Gravity (1/t<sup>{formatExp(exponent)}</sup>)
              </p>
            </Tooltip>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Tooltip text="Sum of pop/t^n across all reachable cells.">
                  <p className="text-xs text-blue-500 font-medium cursor-help border-b border-dashed border-blue-300">Raw</p>
                </Tooltip>
                <p className="text-lg font-semibold text-blue-900">
                  {results.rawSum.toLocaleString()}
                </p>
              </div>
              <div>
                <Tooltip text="Raw / sum of weights. A travel-time-weighted average, comparable across max-time choices.">
                  <p className="text-xs text-blue-500 font-medium cursor-help border-b border-dashed border-blue-300">Normalized</p>
                </Tooltip>
                <p className="text-lg font-semibold text-blue-900">
                  {results.normalized.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Time Band Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">
                Time Band Breakdown
              </h3>
              <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                <button
                  onClick={() => setTableView("cumulative")}
                  className={`px-2.5 py-1 font-medium transition-colors ${
                    tableView === "cumulative"
                      ? "bg-gray-800 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  Cumulative
                </button>
                <button
                  onClick={() => setTableView("per-band")}
                  className={`px-2.5 py-1 font-medium transition-colors ${
                    tableView === "per-band"
                      ? "bg-gray-800 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  Per-band
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-1.5 pr-2">Band (min)</th>
                    <th className="py-1.5 pr-2 text-right">Population</th>
                    <th className="py-1.5 pr-2 text-right">Cells</th>
                    <th className="py-1.5 text-right">
                      1/t<sup>{formatExp(exponent)}</sup>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const isCum = tableView === "cumulative";
                    const filtered = results.timeBands.filter(
                      (b) => b.cellCount > 0 && b.minMin < maxTimeMin
                    );
                    let cumPop = 0;
                    let cumWeight = 0;
                    return filtered.map((band) => {
                      cumPop += band.population;
                      cumWeight += band.weightedContribution;
                      const displayMax = Math.min(band.maxMin, maxTimeMin);
                      return (
                        <tr
                          key={band.minMin}
                          className="border-b border-gray-100 text-gray-700"
                        >
                          <td className="py-1.5 pr-2">
                            {isCum ? `0\u2013${displayMax}` : `${band.minMin}\u2013${displayMax}`}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {(isCum ? cumPop : band.population).toLocaleString()}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {band.cellCount.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {Math.round((isCum ? cumWeight : band.weightedContribution) * 100) / 100}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!selectedOrigin && !loading && (
        <p className="text-sm text-gray-500">
          Select an origin to explore travel-time data.
        </p>
      )}
    </div>
  );
}
