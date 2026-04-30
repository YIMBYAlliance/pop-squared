"use client";

import { useState } from "react";
import type { RingResult } from "@/lib/types";

interface RingTableProps {
  rings: RingResult[];
  exponent: number;
}

export default function RingTable({ rings, exponent }: RingTableProps) {
  const [view, setView] = useState<"cumulative" | "per-band">("cumulative");

  if (rings.length === 0) return null;

  // Build cumulative sums
  let cumPop = 0;
  let cumWeight = 0;
  const rows = rings.map((ring) => {
    cumPop += ring.population;
    cumWeight += ring.inverseSqContribution;
    return {
      ...ring,
      cumPop,
      cumWeight,
    };
  });

  const isCum = view === "cumulative";

  return (
    <div className="space-y-2">
      <div className="flex rounded-md border border-gray-200 overflow-hidden w-fit text-xs">
        <button
          onClick={() => setView("cumulative")}
          className={`px-2.5 py-1 font-medium transition-colors ${
            isCum ? "bg-gray-800 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
          }`}
        >
          Cumulative
        </button>
        <button
          onClick={() => setView("per-band")}
          className={`px-2.5 py-1 font-medium transition-colors ${
            !isCum ? "bg-gray-800 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
          }`}
        >
          Per-band
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5 pr-2">Ring (km)</th>
              <th className="py-1.5 pr-2 text-right">Population</th>
              <th className="py-1.5 pr-2 text-right">Area (km&sup2;)</th>
              <th className="py-1.5 pr-2 text-right">Density</th>
              <th className="py-1.5 text-right">pop/r<sup>{exponent === Math.round(exponent) ? exponent : exponent.toFixed(1)}</sup></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-gray-100 text-gray-700"
              >
                <td className="py-1.5 pr-2">
                  {isCum ? `0\u2013${row.outerKm}` : `${row.innerKm}\u2013${row.outerKm}`}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {(isCum ? row.cumPop : row.population).toLocaleString()}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {row.areaSqKm.toLocaleString()}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {row.density.toLocaleString()}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {(isCum ? row.cumWeight : row.inverseSqContribution).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
