"use client";

import { useCallback, useState } from "react";
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

export default function MethodologyModal() {
  const [open, setOpen] = useState(false);
  useOpenModalEvent("methodology", useCallback(() => setOpen(true), []));

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <AlertDialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Methodology &amp; data caveats</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-sm">
              <section className="space-y-1.5">
                <h3 className="font-semibold text-gray-900">What this tool is</h3>
                <p>
                  Pop Squared answers two questions for any point on the map:
                  how many people live within a given radius, and how many
                  people are reachable within a given travel time. Both views
                  weight people by proximity — a 1/r<sup>n</sup> decay for
                  distance, 1/t<sup>n</sup> for travel time — so that a closer
                  resident counts more than a distant one.
                </p>
                <p>
                  Inspired by Tom Forth&apos;s{" "}
                  <a href="https://www.tomforth.co.uk/circlepopulations/" target="_blank" rel="noopener noreferrer" className="underline">
                    Circle Populations
                  </a>
                  , and built primarily to inform UK density and connectivity debates.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-semibold text-gray-900">Population data</h3>
                <p>
                  Two sources, swappable via the &ldquo;UK mode&rdquo; toggle:
                </p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>
                    <strong>GHS-POP (default, global).</strong>{" "}
                    <a href="https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php" target="_blank" rel="noopener noreferrer" className="underline">
                      JRC GHSL R2023A
                    </a>
                    , 2025 epoch, ~1km resolution, satellite-derived. Good for
                    cross-country comparability. <em>Known to underestimate
                    dense UK city cores</em> — Tom Forth measures{" "}
                    <a href="https://tomforth.co.uk/densityisdone/" target="_blank" rel="noopener noreferrer" className="underline">
                      ~40% short of true population
                    </a>{" "}
                    inside Manchester&apos;s 2km core. Modern high-rise flats are
                    poorly captured by built-volume estimation. The 2025 epoch is
                    also <em>modelled forward</em> from earlier imagery, so recent
                    construction lags reality.
                  </li>
                  <li>
                    <strong>UK mode (Great Britain, beta).</strong> A 100m raster
                    we bake from authoritative census output areas:
                    {" "}
                    <a href="https://www.ons.gov.uk/" target="_blank" rel="noopener noreferrer" className="underline">
                      ONS Census 2021
                    </a>{" "}
                    for England &amp; Wales (188,880 OAs, 59.6M residents) and{" "}
                    <a href="https://www.scotlandscensus.gov.uk/" target="_blank" rel="noopener noreferrer" className="underline">
                      NRS Census 2022
                    </a>{" "}
                    for Scotland (46,363 OAs, 5.4M residents). The toggle
                    auto-falls back to GHS for points outside Great Britain.
                  </li>
                </ul>
                <p className="text-xs text-gray-600">
                  <strong>UK mode v1 caveats:</strong> we redistribute each
                  OA&apos;s population uniformly across its polygon area
                  (&ldquo;uniform-within-OA dasymetric&rdquo;). This is much
                  better than satellite estimation at the OA scale (~300 people
                  / few hundred metres) but doesn&apos;t recover the very
                  fine-grained building-level density a true dasymetric
                  weighting on building footprints would. <strong>Northern
                  Ireland is not yet covered</strong> by UK mode; pins there
                  fall back to GHS.
                </p>
                <p className="text-xs text-gray-600">
                  <strong>UK mode vs GHS — what the differences mean:</strong>{" "}
                  in dense northern English cities (Manchester, Salford,
                  Liverpool) UK mode comes back higher, fixing the GHS
                  underestimate. In a few capital-ish places (London,
                  Edinburgh) UK mode comes back ~7–13% lower. Likely cause:
                  the census counts <em>usual residents</em> only, while GHS
                  appears to capture some of the daytime/visitor footprint
                  through building intensity. London also grew substantially
                  between the March 2021 census and the 2025 GHS epoch.
                </p>
                <p className="text-xs text-gray-600">
                  Below 2km radius the global raster&apos;s pixel size dominates
                  the answer, so we cap the slider there. UK mode could go
                  finer in principle (100m pixels) but we keep the same floor
                  for fair cross-mode comparison.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-semibold text-gray-900">Travel times</h3>
                <p>
                  We use the{" "}
                  <a href="https://docs.traveltime.com/api/overview/introduction" target="_blank" rel="noopener noreferrer" className="underline">
                    TravelTime API
                  </a>
                  {" "}to model door-to-door public transport, walking and
                  driving from a fixed set of city/airport origins, then
                  populate a precomputed isochrone grid. Coverage and quality
                  vary with the underlying GTFS feeds — UK and most of Western
                  Europe is good; large parts of the US and Asia are sparse.
                  Origins where transit data is too thin are dimmed in the
                  picker.
                </p>
                <p className="text-xs text-gray-600">
                  We&apos;ve cross-validated TravelTime against the open-source{" "}
                  <a href="https://github.com/conveyal/r5" target="_blank" rel="noopener noreferrer" className="underline">
                    Conveyal R5
                  </a>{" "}
                  routing engine for a sample of cities. The two engines
                  disagree by <strong>30+ minutes on average for places like
                  Berlin and Chicago</strong>. Treat absolute travel times as
                  estimates — within-region comparisons are far more reliable
                  than cross-country ones.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-semibold text-gray-900">What to be careful of</h3>
                <ul className="list-disc ml-5 space-y-1">
                  <li>
                    Cross-region comparisons in default GHS mode are biased
                    against UK high-rise cores. Use UK mode for both sides if
                    you&apos;re comparing two GB locations; expect some
                    apparent &ldquo;sparsity&rdquo; vs European mid-rise cores
                    that is partly a measurement artefact.
                  </li>
                  <li>
                    Census dates differ. ONS Census 2021 (E&amp;W) was
                    March 2021, mid-pandemic. NRS Census 2022 (Scotland) was
                    March 2022. Population shifts since then aren&apos;t
                    reflected in UK mode.
                  </li>
                  <li>
                    Travel-time bands &lt; 15 minutes inherit grid coarseness
                    near the origin and can be noisy.
                  </li>
                </ul>
              </section>

              <section className="space-y-1.5 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Built by{" "}
                  <a href="https://yimbyalliance.org" target="_blank" rel="noopener noreferrer" className="underline">
                    YIMBY Alliance
                  </a>
                  {" "}with{" "}
                  <a href="https://claude.com/claude-code" target="_blank" rel="noopener noreferrer" className="underline">
                    Claude Code
                  </a>
                  . Source: GHSL GHS-POP R2023A (JRC, CC&nbsp;BY&nbsp;4.0); ONS
                  Census 2021 (Open Government Licence v3); NRS Census 2022
                  (Crown copyright); TravelTime API; Mapbox; OpenStreetMap
                  contributors.
                </p>
              </section>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setOpen(false)}>Close</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
