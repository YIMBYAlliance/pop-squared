import { NextRequest, NextResponse } from "next/server";
import { computePopulation } from "@/lib/population";
import { isInUk, type DataSource, type PopulationQuery } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lat, lng, radiusKm, exponent, dataSource } =
      body as Partial<PopulationQuery>;

    if (typeof lat !== "number" || lat < -90 || lat > 90) {
      return NextResponse.json(
        { error: "lat must be a number between -90 and 90" },
        { status: 400 }
      );
    }
    if (typeof lng !== "number" || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: "lng must be a number between -180 and 180" },
        { status: 400 }
      );
    }
    if (typeof radiusKm !== "number" || radiusKm < 2 || radiusKm > 500) {
      return NextResponse.json(
        { error: "radiusKm must be a number between 2 and 500" },
        { status: 400 }
      );
    }
    const exp = typeof exponent === "number" ? exponent : 2;
    if (exp < 0.1 || exp > 3) {
      return NextResponse.json(
        { error: "exponent must be between 0.1 and 3" },
        { status: 400 }
      );
    }

    let source: DataSource = "ghs";
    if (dataSource === "uk") {
      if (!isInUk(lat, lng)) {
        return NextResponse.json(
          { error: "UK mode only supports query points inside the UK." },
          { status: 400 }
        );
      }
      source = "uk";
    }

    const result = await computePopulation({
      lat,
      lng,
      radiusKm,
      exponent: exp,
      dataSource: source,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Population API error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
