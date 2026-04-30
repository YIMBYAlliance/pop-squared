"use client";

import { useState } from "react";
import OriginCombobox from "@/components/OriginCombobox";
import type { TransportMode } from "@/lib/travel-time-types";

const DEFAULT_MAX_TIME = 120;
const UNLIMITED_MAX_TIME = 180;

interface OriginInfo {
  id: string;
  name: string;
  type: "city" | "airport";
  country: string;
  computed: boolean;
  transitNearPct: number | null;
}

interface TimeControlsProps {
  origins: OriginInfo[];
  originA: string | null;
  onOriginAChange: (id: string | null) => void;
  originB: string | null;
  onOriginBChange: (id: string | null) => void;
  transportMode: TransportMode;
  onTransportModeChange: (m: TransportMode) => void;
  exponent: number;
  onExponentChange: (e: number) => void;
  maxTimeMin: number;
  onMaxTimeChange: (m: number) => void;
}

function formatExp(n: number): string {
  return n === Math.round(n) ? String(n) : n.toFixed(1);
}

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

export default function TimeControls({
  origins,
  originA,
  onOriginAChange,
  originB,
  onOriginBChange,
  transportMode,
  onTransportModeChange,
  exponent,
  onExponentChange,
  maxTimeMin,
  onMaxTimeChange,
}: TimeControlsProps) {
  return (
    <div className="space-y-4">
      {/* Origin A */}
      <div className="flex items-start gap-2">
        <span className="mt-7 w-3 h-3 rounded-full bg-blue-600 shrink-0" />
        <div className="flex-1">
          <OriginCombobox
            origins={origins}
            value={originA}
            onChange={onOriginAChange}
            transitMode={transportMode === "transit"}
          />
        </div>
      </div>

      {/* Origin B */}
      <div className="flex items-start gap-2">
        <span className="mt-7 w-3 h-3 rounded-full bg-orange-600 shrink-0" />
        <div className="flex-1">
          <OriginCombobox
            origins={origins}
            value={originB}
            onChange={onOriginBChange}
            transitMode={transportMode === "transit"}
          />
        </div>
      </div>

      {/* Transport Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Transport Mode
        </label>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(["driving", "transit", "fastest"] as TransportMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onTransportModeChange(m)}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                transportMode === m
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
        <label className="text-sm font-medium text-gray-700">
          Exponent: {exponent.toFixed(1)} &mdash; 1/t<sup>{formatExp(exponent)}</sup>
        </label>
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
    </div>
  );
}
