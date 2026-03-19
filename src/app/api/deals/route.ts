import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { LATEST_FILE, readJSON } from "@/lib/data";

// GET /api/deals — return the most recent daily data
export async function GET() {
  // Try blob/local storage first
  const data = await readJSON(LATEST_FILE);
  if (data && data.deals && data.deals.length > 0) {
    return NextResponse.json({ data, source: "latest" });
  }

  // Fallback: read from bundled public/data.json
  try {
    const staticPath = path.join(process.cwd(), "public", "data.json");
    const raw = await fs.readFile(staticPath, "utf-8");
    const staticData = JSON.parse(raw);
    if (staticData && staticData.deals && staticData.deals.length > 0) {
      return NextResponse.json({ data: staticData, source: "static" });
    }
  } catch {}

  return NextResponse.json({
    data: null,
    source: "none",
    error: "No deals data found. Run the pipeline to generate today's deals.",
  });
}
