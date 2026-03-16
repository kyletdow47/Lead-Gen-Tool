import { NextRequest, NextResponse } from "next/server";
import { LATEST_FILE, PHONES_LOG, readJSON, writeJSON } from "@/lib/data";

// POST /api/webhook/phones — receives Apollo direct dial reveals
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Log every webhook payload
    const log = (await readJSON(PHONES_LOG)) || [];
    log.push({ received: new Date().toISOString(), payload: body });
    await writeJSON(PHONES_LOG, log);

    // Extract phone data
    const person = body.person || body;
    const name = person.name || `${person.first_name || ""} ${person.last_name || ""}`.trim();
    const contact = person.contact || {};
    const phoneNumbers = contact.phone_numbers || person.phone_numbers || [];

    const directPhones = phoneNumbers
      .filter((p: any) => p.type !== "work_hq")
      .map((p: any) => p.raw_number || p.sanitized_number);

    const bestPhone = directPhones[0] || null;

    if (!bestPhone) {
      return NextResponse.json({
        success: true,
        message: `Received webhook for ${name} — no direct phone found`,
      });
    }

    // Update latest.json
    const data = await readJSON(LATEST_FILE);
    if (data) {
      let updated = false;
      for (const deal of data.deals || []) {
        const dealName = (deal.name || "").toLowerCase();
        const personName = name.toLowerCase();
        if (dealName === personName || dealName.includes(personName) || personName.includes(dealName)) {
          deal.phone = bestPhone;
          deal.enrichmentStatus = "verified — direct phone";
          updated = true;
          break;
        }
      }
      if (updated) await writeJSON(LATEST_FILE, data);
    }

    return NextResponse.json({ success: true, name, phone: bestPhone });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/webhook/phones — view received phone reveals
export async function GET() {
  const log = (await readJSON(PHONES_LOG)) || [];
  return NextResponse.json({ count: log.length, reveals: log });
}
