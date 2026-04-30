"use client";

import { useState, useRef, useEffect, useMemo } from "react";

interface Origin {
  id: string;
  name: string;
  type: "city" | "airport";
  country: string;
  computed: boolean;
  transitNearPct: number | null;
}

interface OriginComboboxProps {
  origins: Origin[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** When set, origins under this transit coverage are dimmed and labelled "no transit data". */
  transitMode?: boolean;
}

const TRANSIT_OK_PCT = 5;

function IconCity({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 14V6l4-3v11M6 14V3l5-2v13M11 14V1l3 2v11" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4 7.5h0M4 9.5h0M4 11.5h0M8 5h0M8 7h0M8 9h0M8 11h0M12.5 5h0M12.5 7h0M12.5 9h0M12.5 11h0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="1" y1="14" x2="15" y2="14" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconPlane({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 9.5L7 8l1-5.5a.5.5 0 01.97 0L10 8l5.5 1.5-5.5 1L9 14.5a.5.5 0 01-.97 0L7 10.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function OriginCombobox({ origins, value, onChange, transitMode }: OriginComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const computed = origins.filter((o) => o.computed);
  const selected = computed.find((o) => o.id === value) ?? null;

  const filtered = useMemo(() => {
    if (!query) return computed;
    const q = query.toLowerCase();
    return computed.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.country.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q)
    );
  }, [computed, query]);

  const cities = filtered.filter((o) => o.type === "city");
  const airports = filtered.filter((o) => o.type === "airport");
  // Flat list for keyboard nav: cities then airports
  const flatList = useMemo(() => [...cities, ...airports], [cities, airports]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open]);

  function handleOpen() {
    setOpen(true);
    setQuery("");
    setHighlightIdx(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatList[highlightIdx]) {
      e.preventDefault();
      handleSelect(flatList[highlightIdx].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Which flat index does an origin map to?
  function flatIndex(origin: Origin): number {
    return flatList.indexOf(origin);
  }

  function renderGroup(label: string, items: Origin[], icon: React.ReactNode) {
    if (items.length === 0) return null;
    return (
      <>
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </div>
        {items.map((o) => {
          const idx = flatIndex(o);
          const isHighlighted = idx === highlightIdx;
          const isSelected = o.id === value;
          const lowTransit = transitMode && (o.transitNearPct ?? 0) < TRANSIT_OK_PCT;
          return (
            <button
              key={o.id}
              data-idx={idx}
              onMouseEnter={() => setHighlightIdx(idx)}
              onClick={() => handleSelect(o.id)}
              disabled={lowTransit}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                isHighlighted && !lowTransit ? "bg-blue-50" : ""
              } ${lowTransit ? "opacity-40 cursor-not-allowed" : ""}`}
              title={lowTransit ? "No transit data — pick driving or fastest mode" : undefined}
            >
              <span className={`w-4 h-4 shrink-0 ${isSelected ? "text-blue-600" : "text-gray-400"}`}>
                {icon}
              </span>
              <span className={`flex-1 truncate ${isSelected ? "font-medium text-blue-600" : "text-gray-700"}`}>
                {o.name}
              </span>
              {lowTransit && (
                <span className="text-[10px] uppercase tracking-wider text-gray-400 shrink-0">
                  no transit
                </span>
              )}
              <span className="text-xs text-gray-400 shrink-0">{o.country}</span>
              {isSelected && (
                <svg className="w-4 h-4 text-blue-600 shrink-0" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Origin
      </label>

      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
          open
            ? "border-blue-500 ring-2 ring-blue-100"
            : "border-gray-200 hover:border-gray-300"
        } bg-white`}
      >
        {selected ? (
          <>
            <span className="w-4 h-4 shrink-0 text-gray-500">
              {selected.type === "airport" ? <IconPlane className="w-4 h-4" /> : <IconCity className="w-4 h-4" />}
            </span>
            <span className="flex-1 truncate text-gray-900">{selected.name}</span>
            <span className="text-xs text-gray-400">{selected.country}</span>
            <span
              role="button"
              onClick={handleClear}
              className="shrink-0 p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <XIcon className="w-3.5 h-3.5" />
            </span>
          </>
        ) : (
          <>
            <span className="flex-1 text-gray-400">Select an origin...</span>
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          </>
        )}
      </button>

      {computed.length === 0 && (
        <p className="text-xs text-amber-600 mt-1">
          No computed origins yet. Use the Compute page first.
        </p>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-white rounded-xl border border-gray-200 shadow-lg shadow-gray-200/50 overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <SearchIcon className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search cities or airports..."
              className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-gray-400 hover:text-gray-600">
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {flatList.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">
                No results for &ldquo;{query}&rdquo;
              </p>
            ) : (
              <>
                {renderGroup("Cities", cities, <IconCity className="w-4 h-4" />)}
                {renderGroup("Airports", airports, <IconPlane className="w-4 h-4" />)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
