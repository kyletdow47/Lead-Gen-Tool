import { NextResponse } from "next/server";
import { IMPORT_QUEUE_FILE, STATUSES_FILE, readJSON, writeJSON, updateContactStatus, loadContacts, saveContacts } from "@/lib/data";

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const KYLE_OWNER_ID = "32686904";
const GUS_OWNER_ID = "79075901";
const HUBSPOT_PORTAL_ID = "145965136";

// POST /api/import-approved — push all pending import queue items to HubSpot
export async function POST() {
  if (!HUBSPOT_API_KEY) {
    return NextResponse.json({ error: "HUBSPOT_API_KEY not configured" }, { status: 500 });
  }

  const queue: any[] = (await readJSON(IMPORT_QUEUE_FILE)) || [];
  const pending = queue.filter((item) => !item.imported);

  if (pending.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: "No pending items in queue" });
  }

  let succeeded = 0;
  let failed = 0;
  const results: { name: string; company: string; success: boolean; hubspotUrl?: string; error?: string }[] = [];

  for (const item of pending) {
    const nameParts = (item.name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const ownerId = item.assignedTo === "gus" ? GUS_OWNER_ID : KYLE_OWNER_ID;

    try {
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
            email: item.email || "",
            phone: item.phone || "",
            jobtitle: item.title || "",
            company: item.company || "",
            city: item.city || "",
            country: item.country || "",
            website: item.domain ? `https://${item.domain}` : "",
            hs_lead_status: "NEW",
            lifecyclestage: "lead",
            hubspot_owner_id: ownerId,
          },
        }),
      });

      const key = `${item.name}__${item.company}`;

      if (hubspotRes.ok || hubspotRes.status === 409) {
        let hubspotUrl: string | undefined;

        if (hubspotRes.ok) {
          const contact = await hubspotRes.json();
          hubspotUrl = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/${contact.id}`;

          // Update statuses file
          const statuses = (await readJSON(STATUSES_FILE)) || {};
          statuses[key] = {
            ...statuses[key],
            status: "imported",
            updatedAt: new Date().toISOString(),
            hubspotId: contact.id,
            hubspotUrl,
            name: item.name,
            company: item.company,
          };
          await writeJSON(STATUSES_FILE, statuses);

          // Update contacts collection
          try {
            await updateContactStatus(key, "imported");
            const contacts = await loadContacts();
            if (contacts[key]) {
              contacts[key].hubspot_id = contact.id;
              await saveContacts(contacts);
            }
          } catch {}
        }

        item.imported = true;
        item.importedAt = new Date().toISOString();
        succeeded++;
        results.push({ name: item.name, company: item.company, success: true, hubspotUrl });
      } else {
        const errBody = await hubspotRes.text();
        failed++;
        results.push({ name: item.name, company: item.company, success: false, error: `HubSpot ${hubspotRes.status}: ${errBody}` });
      }
    } catch (err: any) {
      failed++;
      results.push({ name: item.name, company: item.company, success: false, error: err.message });
    }
  }

  // Write back the queue with imported items marked
  await writeJSON(IMPORT_QUEUE_FILE, queue);

  return NextResponse.json({
    success: true,
    processed: pending.length,
    succeeded,
    failed,
    results,
    message: `${succeeded} of ${pending.length} contacts imported to HubSpot`,
  });
}
