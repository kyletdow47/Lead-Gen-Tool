import { NextRequest, NextResponse } from "next/server";
import { STATUSES_FILE, readJSON, writeJSON } from "@/lib/data";
import type { DealStatus } from "@/lib/types";

const VALID_STATUSES: DealStatus[] = ["new", "called", "callback_later", "they_callback", "imported", "deleted"];

// POST /api/status — update a deal's status
export async function POST(req: NextRequest) {
  try {
    const { deal, status, notes } = await req.json();

    if (!deal || !status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Requires deal object and valid status (${VALID_STATUSES.join(", ")})` },
        { status: 400 }
      );
    }

    const statuses = (await readJSON(STATUSES_FILE)) || {};
    const key = `${deal.name}__${deal.company}`;

    statuses[key] = {
      status,
      updatedAt: new Date().toISOString(),
      name: deal.name,
      company: deal.company,
      title: deal.title,
      email: deal.email,
      phone: deal.phone,
      linkedin: deal.linkedin,
      domain: deal.domain,
      city: deal.city,
      country: deal.country,
      specialisation: deal.specialisation,
      apolloId: deal.apolloId,
      notes: notes || null,
    };

    await writeJSON(STATUSES_FILE, statuses);

    return NextResponse.json({ success: true, status, key });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/status — return all statuses
export async function GET() {
  const statuses = (await readJSON(STATUSES_FILE)) || {};
  return NextResponse.json({ statuses });
}
