"use client";

interface DistanceControlsProps {
  activePin: "A" | "B";
  onActivePinChange: (pin: "A" | "B") => void;
  latA: number | null;
  lngA: number | null;
  latB: number | null;
  lngB: number | null;
  radiusKm: number;
  onRadiusChange: (r: number) => void;
  exponent: number;
  onExponentChange: (e: number) => void;
}

function formatCoord(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return "Click map...";
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

function formatExp(n: number): string {
  return n === Math.round(n) ? String(n) : n.toFixed(1);
}

export default function DistanceControls({
  activePin,
  onActivePinChange,
  latA,
  lngA,
  latB,
  lngB,
  radiusKm,
  onRadiusChange,
  exponent,
  onExponentChange,
}: DistanceControlsProps) {
  return (
    <div className="space-y-4">
      {/* A/B Pin Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Place Markers
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onActivePinChange("A")}
            className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm text-left transition-colors ${
              activePin === "A"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
              A
            </span>
            <span className={`truncate ${latA !== null ? "text-gray-900" : "text-gray-400"}`}>
              {formatCoord(latA, lngA)}
            </span>
          </button>
          <button
            onClick={() => onActivePinChange("B")}
            className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm text-left transition-colors ${
              activePin === "B"
                ? "border-orange-500 bg-orange-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
              B
            </span>
            <span className={`truncate ${latB !== null ? "text-gray-900" : "text-gray-400"}`}>
              {formatCoord(latB, lngB)}
            </span>
          </button>
        </div>
      </div>

      {/* Radius Slider */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Radius: {radiusKm} km
        </label>
        <input
          type="range"
          min={2}
          max={100}
          step={1}
          value={radiusKm}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>2 km</span>
          <span>100 km</span>
        </div>
      </div>

      {/* Exponent Slider */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Exponent: {exponent.toFixed(1)} &mdash; 1/r<sup>{formatExp(exponent)}</sup>
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
    </div>
  );
}
