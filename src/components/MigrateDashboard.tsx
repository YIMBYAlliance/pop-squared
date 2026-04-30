"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { MigrateOriginStats } from "@/lib/migrate-types";

type Action = "skip" | "recompute";

interface OriginRow extends MigrateOriginStats {
  action: Action;
  status: "idle" | "computing" | "done" | "error";
  wasMerged: boolean;
  usedProto: boolean;
  newTransitPct: number | null;
  newDrivingPct: number | null;
  /** Old pcts recomputed with the merged denominator (for fair delta) */
  adjustedOldTransitPct: number | null;
  adjustedOldDrivingPct: number | null;
  newCells: number | null;
  error?: string;
  warnings?: string[];
}

function CoverageBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-400">&mdash;</span>;
  const color =
    pct >= 30
      ? "text-green-700 bg-green-50"
      : pct >= 10
        ? "text-yellow-700 bg-yellow-50"
        : "text-red-700 bg-red-50";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium tabular-nums ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function StatusBadge({ status, merged, proto }: { status: string; merged?: boolean; proto?: boolean }) {
  const styles: Record<string, string> = {
    idle: "bg-gray-100 text-gray-500",
    skip: "bg-gray-100 text-gray-500",
    recompute: "bg-blue-100 text-blue-700",
    computing: "bg-blue-100 text-blue-700 animate-pulse",
    done: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };
  let label: string;
  if (status === "done") {
    if (merged && proto) label = "merged+proto";
    else if (merged) label = "merged";
    else if (proto) label = "H3+proto";
    else label = "done";
  } else {
    label = status;
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.idle}`}>
      {label}
    </span>
  );
}

function classifyAction(origin: MigrateOriginStats, threshold: number): Action {
  if (!origin.hasFile) return "recompute";
  if (origin.transitPct !== null && origin.transitPct < threshold) return "recompute";
  return "skip";
}

function Delta({ from, to }: { from: number | null; to: number }) {
  if (from === null) return null;
  const diff = to - from;
  if (Math.abs(diff) < 0.05) return null;
  const positive = diff > 0;
  return (
    <span className={`text-xs ml-1 ${positive ? "text-green-600" : "text-red-500"}`}>
      {positive ? "+" : ""}{diff.toFixed(1)}
    </span>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}m ${s}s`;
}

export default function MigrateDashboard() {
  const [origins, setOrigins] = useState<OriginRow[]>([]);
  const [threshold, setThreshold] = useState(30);
  const [mergeEnabled, setMergeEnabled] = useState(true);
  const [dualEnabled, setDualEnabled] = useState(true);
  const [workerCount, setWorkerCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const pauseRef = useRef(false);
  const controllersRef = useRef<Set<AbortController>>(new Set());

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/travel-time/migrate");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows: OriginRow[] = data.origins.map((o: MigrateOriginStats) => ({
        ...o,
        action: classifyAction(o, threshold),
        status: "idle" as const,
        wasMerged: false,
        usedProto: false,
        newTransitPct: null,
        newDrivingPct: null,
        adjustedOldTransitPct: null,
        adjustedOldDrivingPct: null,
        newCells: null,
      }));
      setOrigins(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  useEffect(() => {
    loadStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reclassify when threshold changes (but don't refetch)
  useEffect(() => {
    setOrigins((prev) =>
      prev.map((o) => {
        if (o.status === "done" || o.status === "computing") return o;
        return { ...o, action: classifyAction(o, threshold) };
      })
    );
  }, [threshold]);

  const recomputeCount = origins.filter(
    (o) => o.action === "recompute" && o.status !== "done"
  ).length;
  const computingCount = origins.filter((o) => o.status === "computing").length;
  const doneCount = origins.filter((o) => o.status === "done").length;
  const mergedCount = origins.filter((o) => o.status === "done" && o.wasMerged).length;
  const errorCount = origins.filter((o) => o.status === "error").length;
  const processedCount = doneCount + errorCount;

  const toggleAction = (id: string) => {
    setOrigins((prev) =>
      prev.map((o) =>
        o.id === id && o.status === "idle"
          ? { ...o, action: o.action === "recompute" ? "skip" : "recompute" }
          : o
      )
    );
  };

  const processOrigin = useCallback(
    async (origin: OriginRow, controller: AbortController) => {
      setOrigins((prev) =>
        prev.map((o) => (o.id === origin.id ? { ...o, status: "computing" as const } : o))
      );

      try {
        const res = await fetch("/api/travel-time/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originId: origin.id,
            merge: mergeEnabled,
            dual: dualEnabled,
          }),
          signal: controller.signal,
        });

        const data = await res.json();
        if (!res.ok) {
          const msg = data.warnings?.length
            ? `${data.error} (${data.warnings.join("; ")})`
            : data.error || `HTTP ${res.status}`;
          setOrigins((prev) =>
            prev.map((o) =>
              o.id === origin.id
                ? { ...o, status: "error" as const, error: msg }
                : o
            )
          );
        } else {
          const cc = data.cellCount || 1;
          const newTransitPct =
            Math.round((data.transitReachable / cc) * 1000) / 10;
          const newDrivingPct =
            Math.round((data.drivingReachable / cc) * 1000) / 10;
          // Recompute old pcts with the SAME denominator (merged cell count)
          // so the delta is never negative when merge preserves all old data
          const adjustedOldTransitPct =
            data.oldTransitReachable != null
              ? Math.round((data.oldTransitReachable / cc) * 1000) / 10
              : null;
          const adjustedOldDrivingPct =
            data.oldDrivingReachable != null
              ? Math.round((data.oldDrivingReachable / cc) * 1000) / 10
              : null;
          setOrigins((prev) =>
            prev.map((o) =>
              o.id === origin.id
                ? {
                    ...o,
                    status: "done" as const,
                    wasMerged: data.merged,
                    usedProto: data.usedProto,
                    newTransitPct,
                    newDrivingPct,
                    adjustedOldTransitPct,
                    adjustedOldDrivingPct,
                    newCells: data.cellCount,
                    warnings: data.warnings,
                  }
                : o
            )
          );
        }
        return true;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setOrigins((prev) =>
            prev.map((o) =>
              o.id === origin.id ? { ...o, status: "idle" as const } : o
            )
          );
          return false; // aborted
        }
        setOrigins((prev) =>
          prev.map((o) =>
            o.id === origin.id
              ? { ...o, status: "error" as const, error: String(err) }
              : o
          )
        );
        return true;
      }
    },
    [mergeEnabled, dualEnabled]
  );

  const startMigration = useCallback(async () => {
    pauseRef.current = false;
    setPaused(false);
    setRunning(true);
    setStartTime(Date.now());

    const toProcess = origins.filter(
      (o) => o.action === "recompute" && (o.status === "idle" || o.status === "error")
    );

    // Shared queue index — each worker atomically grabs the next item
    let nextIdx = 0;
    const controllers = new Set<AbortController>();
    controllersRef.current = controllers;

    async function worker() {
      while (!pauseRef.current) {
        const idx = nextIdx++;
        if (idx >= toProcess.length) break;

        const controller = new AbortController();
        controllers.add(controller);

        const ok = await processOrigin(toProcess[idx], controller);
        controllers.delete(controller);

        if (!ok) break; // aborted
      }
    }

    const workers = Array.from({ length: Math.min(workerCount, toProcess.length) }, () =>
      worker()
    );
    await Promise.all(workers);

    if (pauseRef.current) {
      setPaused(true);
    }
    setRunning(false);
  }, [origins, workerCount, processOrigin]);

  const pauseMigration = useCallback(() => {
    pauseRef.current = true;
    for (const c of controllersRef.current) {
      c.abort();
    }
  }, []);

  // Elapsed time display
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running || !startTime) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(interval);
  }, [running, startTime]);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading coverage stats...</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-2">
        <p className="text-sm font-medium text-red-800">Failed to load migration data</p>
        <p className="text-xs text-red-600">{error}</p>
        <button onClick={loadStats} className="text-xs text-blue-600 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const noFile = origins.filter((o) => !o.hasFile);
  const lowTransit = origins.filter(
    (o) => o.hasFile && o.transitPct !== null && o.transitPct < threshold
  );
  const totalToProcess = recomputeCount + processedCount;
  const avgMs = processedCount > 0 && startTime ? (Date.now() - startTime) / processedCount : null;
  const etaMs = avgMs && recomputeCount > 0 ? avgMs * recomputeCount : null;

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <details className="bg-blue-50 border border-blue-200 rounded-lg">
        <summary className="px-4 py-3 text-sm font-medium text-blue-900 cursor-pointer select-none">
          What do the coverage percentages mean?
        </summary>
        <div className="px-4 pb-4 text-sm text-blue-900 space-y-2">
          <p>
            For each origin, we extract all populated ~1km grid cells within 200km from the
            GHS-POP raster. The TravelTime API tells us which of those cells are
            reachable within 3 hours. <strong>Coverage</strong> is the fraction of reachable
            cells that have a travel time for a given transport mode:
          </p>
          <ul className="list-disc ml-5 space-y-1">
            <li>
              <strong>Driving</strong> &mdash; % of reachable cells with a driving+ferry
              travel time. Typically high (80&ndash;100%) since roads reach most populated areas.
            </li>
            <li>
              <strong>Transit</strong> &mdash; % of reachable cells with a public transport
              travel time. The old Proto API had poor coverage outside UK/Germany
              (e.g. Lyon 2.6%, Madrid airport ~0%). The H3 endpoint should improve this.
            </li>
          </ul>
          <p>
            A cell only appears in the results file if it is reachable by <em>at least one</em> mode,
            so the denominator is the union of driving-reachable and transit-reachable cells.
          </p>
          <p className="font-medium mt-3">What do the options do?</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>
              <strong>Merge with existing file</strong> &mdash; combines the old file on disk
              with freshly computed results per-cell. For each cell, the fastest driving time
              and fastest transit time from either source is kept. Coverage can only improve.
            </li>
            <li>
              <strong>Both H3 + Proto</strong> &mdash; calls the new H3 endpoint <em>and</em> the
              old Proto endpoint, then merges in-memory before saving. Proto gives precise
              per-coordinate driving times; H3 gives broader transit coverage. Taking the best
              of both yields the highest coverage. Proto is skipped for unsupported countries
              (e.g. China, Brazil).
            </li>
          </ul>
          <p>
            With both options enabled, each origin gets the best of three sources:
            old file + Proto + H3.
          </p>
        </div>
      </details>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Total Origins</p>
          <p className="text-2xl font-bold text-gray-900">{origins.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Have Data</p>
          <p className="text-2xl font-bold text-gray-900">
            {origins.filter((o) => o.hasFile).length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">No File (new)</p>
          <p className="text-2xl font-bold text-orange-600">{noFile.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Transit &lt; {threshold}%</p>
          <p className="text-2xl font-bold text-red-600">{lowTransit.length}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        {/* Threshold slider */}
        <div>
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Transit coverage threshold:
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              disabled={running}
              className="flex-1"
            />
            <span className="text-sm font-mono font-medium text-gray-900 w-12 text-right">
              {threshold}%
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Origins with transit coverage below this threshold are flagged for recomputation.
            Origins without any existing file are always included.
          </p>
        </div>

        {/* Merge toggle */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="merge-toggle"
            checked={mergeEnabled}
            onChange={(e) => setMergeEnabled(e.target.checked)}
            disabled={running}
            className="mt-0.5 rounded border-gray-300"
          />
          <div>
            <label htmlFor="merge-toggle" className="text-sm font-medium text-gray-700 cursor-pointer">
              Merge with existing file
            </label>
            <p className="text-xs text-gray-500 mt-0.5">
              {mergeEnabled
                ? "Per-cell best-of: keeps the fastest driving time from old file or new computation, and the fastest transit time. Coverage can only improve."
                : "Overwrite: replaces old file entirely with new results."}
            </p>
          </div>
        </div>

        {/* Dual API toggle */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="dual-toggle"
            checked={dualEnabled}
            onChange={(e) => setDualEnabled(e.target.checked)}
            disabled={running}
            className="mt-0.5 rounded border-gray-300"
          />
          <div>
            <label htmlFor="dual-toggle" className="text-sm font-medium text-gray-700 cursor-pointer">
              Call both H3 and Proto APIs
            </label>
            <p className="text-xs text-gray-500 mt-0.5">
              {dualEnabled
                ? "Calls both the new H3 endpoint and the old Proto endpoint, then takes the fastest time per cell per mode. Best coverage but uses 4 API calls per origin instead of 2. Proto is skipped for unsupported countries."
                : "H3 only. Faster (2 API calls per origin) but may have slightly lower driving precision than Proto."}
            </p>
          </div>
        </div>

        {/* Worker count */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Parallel workers:
          </label>
          <input
            type="range"
            min={1}
            max={6}
            value={workerCount}
            onChange={(e) => setWorkerCount(Number(e.target.value))}
            disabled={running}
            className="w-32"
          />
          <span className="text-sm font-mono font-medium text-gray-900 w-6 text-right">
            {workerCount}
          </span>
          <p className="text-xs text-gray-500">
            {dualEnabled
              ? `${workerCount * 4} API calls in flight (${workerCount} x 4)`
              : `${workerCount * 2} API calls in flight (${workerCount} x 2)`}
          </p>
        </div>
      </div>

      {/* Action buttons + status */}
      <div className="flex items-center gap-3 flex-wrap">
        {!running ? (
          <button
            onClick={startMigration}
            disabled={recomputeCount === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {paused ? "Resume" : "Recompute"} ({recomputeCount})
          </button>
        ) : (
          <button
            onClick={pauseMigration}
            className="px-4 py-2 bg-yellow-500 text-white text-sm font-medium rounded-lg hover:bg-yellow-600 transition-colors"
          >
            Pause
          </button>
        )}
        {running && computingCount > 0 && (
          <span className="text-sm text-blue-600 tabular-nums">
            {computingCount} worker{computingCount !== 1 ? "s" : ""} active
          </span>
        )}
        {doneCount > 0 && (
          <span className="text-sm text-green-600">
            {doneCount} updated{mergedCount > 0 && ` (${mergedCount} merged)`}
          </span>
        )}
        {errorCount > 0 && (
          <span className="text-sm text-red-600">
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        )}
        {running && elapsed > 0 && (
          <span className="text-xs text-gray-500 tabular-nums">
            {formatDuration(elapsed)} elapsed
            {etaMs ? ` / ~${formatDuration(etaMs)} remaining` : ""}
          </span>
        )}
        <button
          onClick={loadStats}
          disabled={running}
          className="ml-auto text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          Refresh stats
        </button>
      </div>

      {/* Progress bar */}
      {totalToProcess > 0 && (
        <div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${(processedCount / totalToProcess) * 100}%`,
              }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1 tabular-nums">
            {processedCount} / {totalToProcess}
          </p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-600">
              <th className="px-3 py-2.5 font-medium w-8"></th>
              <th className="px-3 py-2.5 font-medium">Origin</th>
              <th className="px-3 py-2.5 font-medium">Country</th>
              <th className="px-3 py-2.5 font-medium text-right">Cells</th>
              <th className="px-3 py-2.5 font-medium text-right">Driving</th>
              <th className="px-3 py-2.5 font-medium text-right">Transit</th>
              <th className="px-3 py-2.5 font-medium text-center">Status</th>
              <th className="px-3 py-2.5 font-medium text-right">New Driving</th>
              <th className="px-3 py-2.5 font-medium text-right">New Transit</th>
            </tr>
          </thead>
          <tbody>
            {origins.map((o) => (
              <tr
                key={o.id}
                className={`border-b border-gray-100 ${
                  o.status === "computing"
                    ? "bg-blue-50"
                    : o.status === "done"
                      ? "bg-green-50/50"
                      : o.status === "error"
                        ? "bg-red-50/50"
                        : ""
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={o.action === "recompute"}
                    onChange={() => toggleAction(o.id)}
                    disabled={running || o.status === "done"}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-3 py-2 font-medium text-gray-900">{o.name}</td>
                <td className="px-3 py-2 text-gray-500">{o.country}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {o.totalCells?.toLocaleString() ?? <span className="text-gray-400">&mdash;</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <CoverageBadge pct={o.drivingPct} />
                </td>
                <td className="px-3 py-2 text-right">
                  <CoverageBadge pct={o.transitPct} />
                </td>
                <td className="px-3 py-2 text-center">
                  {o.status === "computing" ? (
                    <StatusBadge status="computing" />
                  ) : o.status === "done" ? (
                    <span title={o.warnings?.join("\n")}>
                      <StatusBadge status="done" merged={o.wasMerged} proto={o.usedProto} />
                      {o.warnings && o.warnings.length > 0 && (
                        <span className="ml-1 text-amber-500 text-xs" title={o.warnings.join("\n")}>!</span>
                      )}
                    </span>
                  ) : o.status === "error" ? (
                    <span title={o.error}>
                      <StatusBadge status="error" />
                    </span>
                  ) : (
                    <StatusBadge status={o.action} />
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {o.newDrivingPct !== null ? (
                    <span>
                      <CoverageBadge pct={o.newDrivingPct} />
                      <Delta from={o.adjustedOldDrivingPct} to={o.newDrivingPct} />
                    </span>
                  ) : (
                    <span className="text-gray-400">&mdash;</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {o.newTransitPct !== null ? (
                    <span>
                      <CoverageBadge pct={o.newTransitPct} />
                      <Delta from={o.adjustedOldTransitPct} to={o.newTransitPct} />
                    </span>
                  ) : (
                    <span className="text-gray-400">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
