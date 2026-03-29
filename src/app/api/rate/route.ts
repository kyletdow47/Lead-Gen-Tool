import { NextRequest, NextResponse } from "next/server";
import { RATINGS_FILE, IMPORT_QUEUE_FILE, readJSON, writeJSON } from "@/lib/data";

// POST /api/rate — rate a deal good/bad
export async function POST(req: NextRequest) {
  try {
    const { deal, rating } = await req.json();

    if (!deal || !rating || !["good", "bad"].includes(rating)) {
      return NextResponse.json(
        { error: "Requires deal object and rating ('good' or 'bad')" },
        { status: 400 }
      );
    }

    const ratings = (await readJSON(RATINGS_FILE)) || {};
    const key = `${deal.name}__${deal.company}`;

    ratings[key] = {
      rating,
      ratedAt: new Date().toISOString(),
      name: deal.name,
      company: deal.company,
      title: deal.title,
      email: deal.email,
      phone: deal.phone,
      domain: deal.domain,
      city: deal.city,
      country: deal.country,
      rank: deal.rank,
      imported: false,
    };

    await writeJSON(RATINGS_FILE, ratings);

    // If "good", also add to import queue
    if (rating === "good") {
      const queue = (await readJSON(IMPORT_QUEUE_FILE)) || [];
      queue.push({
        name: deal.name,
        company: deal.company,
        title: deal.title,
        email: deal.email,
        phone: deal.phone,
        domain: deal.domain,
        city: deal.city,
        country: deal.country,
        queuedAt: new Date().toISOString(),
      });
      await writeJSON(IMPORT_QUEUE_FILE, queue);
    }

    return NextResponse.json({
      success: true,
      rating,
      name: deal.name,
      company: deal.company,
      message: rating === "good"
        ? "Queued for Apollo/HubSpot import — run 'import approved' to push"
        : "Skipped",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/rate — return all ratings
export async function GET() {
  const ratings = (await readJSON(RATINGS_FILE)) || {};
  return NextResponse.json({ ratings });
}
