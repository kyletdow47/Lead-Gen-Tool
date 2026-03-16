import { NextRequest, NextResponse } from "next/server";
import { STATUSES_FILE, readJSON, writeJSON } from "@/lib/data";

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;

// POST /api/hubspot — immediately create a contact in HubSpot
export async function POST(req: NextRequest) {
  try {
    const { deal } = await req.json();

    if (!deal) {
      return NextResponse.json({ error: "Requires deal object" }, { status: 400 });
    }

    if (!HUBSPOT_API_KEY) {
      return NextResponse.json(
        { error: "HUBSPOT_API_KEY not configured in .env.local" },
        { status: 500 }
      );
    }

    // Split name into first/last
    const nameParts = (deal.name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Create contact in HubSpot
    const hubspotRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          firstname: firstName,
          lastname: lastName,
          email: deal.email || "",
          phone: deal.phone || "",
          jobtitle: deal.title || "",
          company: deal.company || "",
          city: deal.city || "",
          country: deal.country || "",
          website: deal.domain ? `https://${deal.domain}` : "",
          hs_lead_status: "NEW",
          lifecyclestage: "lead",
          // Custom note with deal context
          notes_last_contacted: new Date().toISOString(),
        },
      }),
    });

    if (!hubspotRes.ok) {
      const errBody = await hubspotRes.text();
      // Check for duplicate contact (409 conflict)
      if (hubspotRes.status === 409) {
        // Update status to imported anyway — they already exist
        const statuses = (await readJSON(STATUSES_FILE)) || {};
        const key = `${deal.name}__${deal.company}`;
        statuses[key] = {
          ...statuses[key],
          status: "imported",
          updatedAt: new Date().toISOString(),
          hubspotNote: "Already existed in HubSpot",
        };
        await writeJSON(STATUSES_FILE, statuses);

        return NextResponse.json({
          success: true,
          alreadyExisted: true,
          message: `${deal.name} already exists in HubSpot`,
        });
      }
      return NextResponse.json(
        { error: `HubSpot API error: ${hubspotRes.status}`, detail: errBody },
        { status: 502 }
      );
    }

    const hubspotContact = await hubspotRes.json();

    // Update status to imported
    const statuses = (await readJSON(STATUSES_FILE)) || {};
    const key = `${deal.name}__${deal.company}`;
    statuses[key] = {
      ...statuses[key],
      status: "imported",
      updatedAt: new Date().toISOString(),
      hubspotId: hubspotContact.id,
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
    };
    await writeJSON(STATUSES_FILE, statuses);

    return NextResponse.json({
      success: true,
      hubspotId: hubspotContact.id,
      message: `${deal.name} imported to HubSpot`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
