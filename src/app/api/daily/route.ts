import { NextRequest, NextResponse } from "next/server";
import { LATEST_FILE, ensureDir, writeJSON, datedFile } from "@/lib/data";

// POST /api/daily — receive daily JSON from Claude pipeline
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.date || !body.deals || !Array.isArray(body.deals)) {
      return NextResponse.json(
        { error: "Invalid data: requires date and deals array" },
        { status: 400 }
      );
    }

    await ensureDir();

    const dateStr = body.date || new Date().toISOString().split("T")[0];
    await writeJSON(LATEST_FILE, body);
    await writeJSON(datedFile("deals", dateStr), body);

    return NextResponse.json({
      success: true,
      date: dateStr,
      dealsCount: body.deals.length,
      message: `${body.deals.length} deals loaded for ${dateStr}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
