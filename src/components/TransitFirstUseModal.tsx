"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOpenModalEvent } from "@/lib/modal-events";

const STORAGE_KEY = "pop-squared:transit-modal-seen";

export default function TransitFirstUseModal({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    setOpen(true);
  }, [active]);

  useOpenModalEvent("transit", useCallback(() => setOpen(true), []));

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
          <AlertDialogTitle>About transit data</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2.5 text-sm">
              <p>
                Transit times come from the{" "}
                <a
                  href="https://docs.traveltime.com/api/overview/introduction"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  TravelTime API
                </a>
                , which models public transport from published GTFS feeds.
                Coverage and quality vary a lot between regions:
              </p>
              <ul className="list-disc ml-5 space-y-1">
                <li>UK and most of Western Europe: usually good.</li>
                <li>
                  Many US cities, parts of Southern/Eastern Europe and most of Asia: sparse
                  feeds, sometimes essentially no transit data — those origins are dimmed
                  in the picker when you select transit mode.
                </li>
              </ul>
              <p>
                We&apos;ve cross-checked TravelTime against the open-source{" "}
                <a
                  href="https://github.com/conveyal/r5"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  R5 routing engine
                </a>
                {" "}from Conveyal. The two disagree by{" "}
                <strong>30+ minutes on average in cities like Berlin and Chicago</strong>.
                Treat absolute travel times as estimates — comparisons within a single
                region are more reliable than cross-country ones.
              </p>
              <p className="text-xs text-gray-500">
                You won&apos;t see this dialog again. Specific origins still surface a
                warning when their data is too sparse to be useful.
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
