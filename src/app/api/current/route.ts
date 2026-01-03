export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

const LIVE_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";

export async function GET() {
  try {
    const res = await fetch(LIVE_URL, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed (${res.status})` },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch error" },
      { status: 502 }
    );
  }
}

