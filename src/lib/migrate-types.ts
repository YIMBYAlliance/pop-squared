export interface MigrateOriginStats {
  id: string;
  name: string;
  country: string;
  type: "city" | "airport";
  hasFile: boolean;
  totalCells: number | null;
  drivingReachable: number | null;
  transitReachable: number | null;
  drivingPct: number | null;
  transitPct: number | null;
  computedAt: string | null;
}
