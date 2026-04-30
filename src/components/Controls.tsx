"use client";

import { useState } from "react";
import type { ColorBy } from "@/lib/circle-geojson";
import Tooltip from "./Tooltip";

const DEFAULT_MAX = 100;
const UNLIMITED_MAX = 500;

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "\u2070", "1": "\u00B9", "2": "\u00B2", "3": "\u00B3",
  "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077",
  "8": "\u2078", "9": "\u2079", ".": "\u02D9",
};

function superscript(n: number): string {
  const s = n === Math.round(n) ? String(n) : n.toFixed(1);
  return s.split("").map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join("");
}

interface ControlsProps {
  radiusKm: number;
  onRadiusChange: (radius: number) => void;
  exponent: number;
  onExponentChange: (exponent: number) => void;
  colorBy: ColorBy;
  onColorByChange: (colorBy: ColorBy) => void;
  ukMode: boolean;
  onUkModeChange: (v: boolean) => void;
  /** True when at least one query point is inside the UK bbox. */
  ukAvailable: boolean;
  /** When true, only render the colour-by toggle */
  colorByOnly?: boolean;
}

export default function Controls({
  radiusKm,
  onRadiusChange,
  exponent,
  onExponentChange,
  colorBy,
  onColorByChange,
  ukMode,
  onUkModeChange,
  ukAvailable,
  colorByOnly,
}: ControlsProps) {
  const [maxKm, setMaxKm] = useState(DEFAULT_MAX);
  const unlimited = maxKm === UNLIMITED_MAX;

  const toggleLimit = () => {
    if (unlimited) {
      setMaxKm(DEFAULT_MAX);
      if (radiusKm > DEFAULT_MAX) onRadiusChange(DEFAULT_MAX);
    } else {
      setMaxKm(UNLIMITED_MAX);
    }
  };

  const colorByToggle = (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Colour by
      </label>
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        {([
          { value: "population" as const, label: "Population" },
          { value: "density" as const, label: "Density" },
          { value: "inverse-square" as const, label: `pop/r${superscript(exponent)}` },
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
  );

  const ukToggle = (
    <div className="flex items-center justify-between">
      <Tooltip text={
        ukAvailable
          ? "Use the higher-resolution ONS-derived raster instead of the global GHS-POP. Falls back to GHS for points outside the UK."
          : "UK mode is only available when the query point is inside the UK."
      }>
        <span className={`text-sm font-medium cursor-help border-b border-dashed ${
          ukAvailable ? "text-gray-700 border-gray-300" : "text-gray-400 border-gray-200"
        }`}>
          UK mode (ONS) <span className="text-xs font-normal text-amber-600">beta</span>
        </span>
      </Tooltip>
      <button
        onClick={() => onUkModeChange(!ukMode)}
        disabled={!ukAvailable}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          !ukAvailable
            ? "bg-gray-200 cursor-not-allowed"
            : ukMode
              ? "bg-blue-600"
              : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            ukMode && ukAvailable ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );

  if (colorByOnly) {
    return (
      <div className="space-y-4">
        {colorByToggle}
        {ukToggle}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label className="text-sm font-medium text-gray-700">
            Radius: {radiusKm} km
          </label>
          <button
            onClick={toggleLimit}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {unlimited ? `Cap at ${DEFAULT_MAX} km` : "Remove limit"}
          </button>
        </div>
        <input
          type="range"
          min={2}
          max={maxKm}
          step={1}
          value={radiusKm}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>2 km</span>
          <span>{maxKm} km</span>
        </div>
      </div>

      <div className="space-y-2">
        <Tooltip text="Controls how fast weight drops with distance. n=1: gentle. n=2: inverse-square (gravity). n=3: very local.">
          <label className="text-sm font-medium text-gray-700 cursor-help border-b border-dashed border-gray-300">
            Exponent: {exponent.toFixed(1)} &mdash; 1/r<sup>{exponent === Math.round(exponent) ? exponent : exponent.toFixed(1)}</sup>
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

      {colorByToggle}
      {ukToggle}
    </div>
  );
}
