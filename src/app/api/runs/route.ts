import { NextRequest, NextResponse } from "next/server";
import { loadRunsIndex, loadRun } from "@/lib/data";

// GET /api/runs — return run history index, or a specific run by date
// ?date=2026-03-18 — return full data for that run
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");

  if (date) {
    const run = await loadRun(date);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({ data: run });
  }

  const index = await loadRunsIndex();
  return NextResponse.json({ runs: index });
}
