"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STORAGE_KEY = "pop-squared:data-quality-modal-seen";

export default function DataQualityFirstUseModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    setOpen(true);
  }, []);

  function handleClose() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>About the population data</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2.5 text-sm">
              <p>
                Pop Squared uses the{" "}
                <a
                  href="https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  GHSL GHS-POP
                </a>{" "}
                global raster (~1km resolution), which estimates population
                from satellite imagery of built structures. This is great for
                global comparability but has known biases worth keeping in mind:
              </p>
              <ul className="list-disc ml-5 space-y-1">
                <li>
                  <strong>Dense city cores are underestimated.</strong> Modern
                  high-rise residential buildings (post-2000 Manchester, Leeds,
                  Salford, etc.) are hard for satellites to count. Tom Forth
                  finds GHS-POP{" "}
                  <a
                    href="https://tomforth.co.uk/densityisdone/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    underestimates Manchester&apos;s 2km core by ~40%
                  </a>
                  .
                </li>
                <li>
                  <strong>Resolution is ~1km.</strong> Numbers below ~2km
                  radius are noisy — we&apos;ve set the slider to start there.
                </li>
                <li>
                  <strong>The 2025 epoch is modelled, not measured.</strong>{" "}
                  Recent construction lags reality.
                </li>
              </ul>
              <p>
                Cross-region comparisons inherit these biases unevenly — UK and
                other high-rise contexts come out artificially sparse vs.
                mid-rise European cores. A higher-fidelity{" "}
                <strong>UK mode</strong> backed by ONS data is on the way.
              </p>
              <p className="text-xs text-gray-500">
                You won&apos;t see this dialog again.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleClose}>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
