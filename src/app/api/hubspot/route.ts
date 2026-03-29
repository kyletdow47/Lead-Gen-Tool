import { NextRequest, NextResponse } from "next/server";
import { STATUSES_FILE, readJSON, writeJSON, updateContactStatus, loadContacts, saveContacts } from "@/lib/data";

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const KYLE_OWNER_ID = "32686904";
const GUS_OWNER_ID = "79075901";
const HUBSPOT_PORTAL_ID = "145965136"; // For constructing contact URLs

// POST /api/hubspot — create a contact in HubSpot
export async function POST(req: NextRequest) {
  try {
    const { deal } = await req.json();

    if (!deal) {
      return NextResponse.json({ error: "Requires deal object" }, { status: 400 });
    }

    if (!HUBSPOT_API_KEY) {
      return NextResponse.json({ error: "HUBSPOT_API_KEY not configured" }, { status: 500 });
    }

    const nameParts = (deal.name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const ownerId = deal.assignedTo === "gus" ? GUS_OWNER_ID : KYLE_OWNER_ID;
    const ownerName = deal.assignedTo === "gus" ? "Gus" : "Kyle Dow";

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
          hubspot_owner_id: ownerId,
        },
      }),
    });

    const key = `${deal.name}__${deal.company}`;

    if (!hubspotRes.ok) {
      const errBody = await hubspotRes.text();

      // Handle duplicate (409)
      if (hubspotRes.status === 409) {
        const statuses = (await readJSON(STATUSES_FILE)) || {};
        statuses[key] = {
          ...statuses[key],
          status: "imported",
          updatedAt: new Date().toISOString(),
          hubspotNote: "Already existed in HubSpot",
        };
        await writeJSON(STATUSES_FILE, statuses);
        try { await updateContactStatus(key, "imported"); } catch {}

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
    const hubspotId = hubspotContact.id;
    const hubspotUrl = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/${hubspotId}`;

    // Update statuses
    const statuses = (await readJSON(STATUSES_FILE)) || {};
    statuses[key] = {
      ...statuses[key],
      status: "imported",
      updatedAt: new Date().toISOString(),
      hubspotId,
      hubspotUrl,
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

    // Update persistent contacts collection with hubspot_id
    try {
      await updateContactStatus(key, "imported");
      const contacts = await loadContacts();
      if (contacts[key]) {
        contacts[key].hubspot_id = hubspotId;
        await saveContacts(contacts);
      }
    } catch {}

    return NextResponse.json({
      success: true,
      hubspotId,
      hubspotUrl,
      message: `${deal.name} imported to HubSpot (owner: ${ownerName})`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
