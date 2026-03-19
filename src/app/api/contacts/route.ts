import { NextResponse } from "next/server";
import { loadContacts, readJSON, STATUSES_FILE } from "@/lib/data";
import type { Contact, DealStatus } from "@/lib/types";

// GET /api/contacts — return all contacts with summary stats
// Merges contacts.json (base data) with statuses.json (latest statuses from Daily tab)
export async function GET() {
  const contacts = await loadContacts();

  // Merge statuses from statuses.json — this is where Daily tab status changes live
  const statuses = (await readJSON(STATUSES_FILE)) || {};
  for (const [key, statusEntry] of Object.entries(statuses) as [string, any][]) {
    if (contacts[key]) {
      // Contact exists — update its status from the statuses store
      contacts[key].status = statusEntry.status;
      contacts[key].lastUpdated = statusEntry.updatedAt || contacts[key].lastUpdated;
      if (statusEntry.notes) contacts[key].notes = statusEntry.notes;
    } else {
      // Contact only exists in statuses (added from Daily tab but not in seed)
      // Create a contact entry from the status data
      contacts[key] = {
        id: key,
        name: statusEntry.name || key.split("__")[0],
        title: statusEntry.title || "",
        company: statusEntry.company || key.split("__")[1] || "",
        city: statusEntry.city || "",
        country: statusEntry.country || "",
        phone: statusEntry.phone || null,
        domain: statusEntry.domain || null,
        linkedin: statusEntry.linkedin || null,
        email: statusEntry.email || null,
        source: "daily-tab",
        dateAdded: statusEntry.updatedAt || new Date().toISOString(),
        lastUpdated: statusEntry.updatedAt || new Date().toISOString(),
        status: statusEntry.status || "new",
        tags: [statusEntry.specialisation || "Air Freight"].filter(Boolean),
        notes: statusEntry.notes || null,
        assignedTo: "kyle",
        score: null,
        specialisation: statusEntry.specialisation || null,
        apolloId: statusEntry.apolloId || null,
        employees: null,
        priority: "warm",
        hubspot_id: statusEntry.hubspotId || null,
        disqualify_reason: null,
      };
    }
  }

  const values = Object.values(contacts) as Contact[];

  const byStatus: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  const byAssignedTo = { kyle: 0, gus: 0, shared: 0 };
  let callsMade = 0;
  let meetingsBooked = 0;
  let positiveResponses = 0;

  for (const c of values) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;

    if (c.country) {
      byCountry[c.country] = (byCountry[c.country] || 0) + 1;
    }

    if (c.assignedTo && byAssignedTo[c.assignedTo] !== undefined) {
      byAssignedTo[c.assignedTo]++;
    }

    const calledStatuses: DealStatus[] = ["called", "negative", "callback_later", "they_callback", "gatekeeper", "follow_up_email", "imported"];
    if (calledStatuses.includes(c.status)) callsMade++;
    if (c.status === "imported") meetingsBooked++;
    if (c.status === "callback_later" || c.status === "they_callback" || c.status === "follow_up_email" || c.status === "imported") {
      positiveResponses++;
    }
  }

  const stats = {
    total: values.length,
    byStatus,
    byCountry,
    byAssignedTo,
    callsMade,
    meetingsBooked,
    positiveResponses,
    conversionRate: callsMade > 0 ? Math.round((positiveResponses / callsMade) * 100) : 0,
  };

  return NextResponse.json({ contacts, stats });
}
