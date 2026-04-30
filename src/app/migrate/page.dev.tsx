import { notFound } from "next/navigation";
import MigrateDashboard from "@/components/MigrateDashboard";

export const metadata = {
  title: "Migrate to H3 — Pop Squared",
  description: "Review and recompute travel-time data using the H3 endpoint",
};

export default function MigratePage() {
  if (process.env.NEXT_PUBLIC_DEV_MODE !== "true") {
    notFound();
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Migrate to H3</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review existing travel-time data and recompute origins with low transit coverage
            using the new H3 endpoint. Adjust the threshold to control which origins get recomputed.
          </p>
        </div>
        <MigrateDashboard />
      </div>
    </div>
  );
}
