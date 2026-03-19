// POST /api/check-hubspot — Standalone dedup check against HubSpot
// Checks leads against Kyle's AND Gus's contacts. Read-only — never modifies HubSpot.
// Caches HubSpot contact list in Blob, refreshes every 24h.

import { NextRequest, NextResponse } from "next/server";
import { loadHubSpotCache, saveHubSpotCache } from "@/lib/data";

const HUBSPOT_API = "https://api.hubapi.com";
const GUS_OWNER_ID = "79075901";

interface CheckResult {
  name: string;
  company: string;
  status: "clean" | "duplicate" | "gus_territory";
}

async function fetchAllHubSpotContacts(hsKey: string): Promise<Array<{ email: string | null; company: string; ownerId: string | null }>> {
  const contacts: Array<{ email: string | null; company: string; ownerId: string | null }> = [];
  let after: string | null = null;

  // Paginate through all contacts
  for (let i = 0; i < 20; i++) { // max 20 pages = 2000 contacts
    const url = new URL(`${HUBSPOT_API}/crm/v3/objects/contacts`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", "email,company,hubspot_owner_id,firstname,lastname");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${hsKey}` },
    });

    if (!res.ok) break;
    const data = await res.json();

    for (const result of data.results || []) {
      contacts.push({
        email: result.properties?.email || null,
        company: result.properties?.company || "",
        ownerId: result.properties?.hubspot_owner_id || null,
      });
    }

    if (data.paging?.next?.after) {
      after = data.paging.next.after;
    } else {
      break;
    }
  }

  return contacts;
}

export async function POST(req: NextRequest) {
  const hsKey = process.env.HUBSPOT_API_KEY;
  if (!hsKey) {
    return NextResponse.json({ error: "HUBSPOT_API_KEY not set" }, { status: 500 });
  }

  try {
    const { leads } = await req.json();
    if (!leads || !Array.isArray(leads)) {
      return NextResponse.json({ error: "Requires leads array with {name, company, email?}" }, { status: 400 });
    }

    // Load or refresh cache
    let cache = await loadHubSpotCache();
    if (!cache) {
      const contacts = await fetchAllHubSpotContacts(hsKey);
      cache = { contacts, fetchedAt: new Date().toISOString() };
      await saveHubSpotCache(cache);
    }

    // Check each lead against cache
    const results: CheckResult[] = leads.map((lead: any) => {
      const leadCompany = (lead.company || "").toLowerCase();
      const leadEmail = (lead.email || "").toLowerCase();

      for (const c of cache!.contacts) {
        // Email match (exact)
        if (leadEmail && c.email && c.email.toLowerCase() === leadEmail) {
          if (c.ownerId === GUS_OWNER_ID) {
            return { name: lead.name, company: lead.company, status: "gus_territory" as const };
          }
          return { name: lead.name, company: lead.company, status: "duplicate" as const };
        }
        // Company match (contains)
        if (leadCompany && c.company && c.company.toLowerCase().includes(leadCompany)) {
          if (c.ownerId === GUS_OWNER_ID) {
            return { name: lead.name, company: lead.company, status: "gus_territory" as const };
          }
          return { name: lead.name, company: lead.company, status: "duplicate" as const };
        }
      }

      return { name: lead.name, company: lead.company, status: "clean" as const };
    });

    const clean = results.filter((r) => r.status === "clean").length;
    const duplicate = results.filter((r) => r.status === "duplicate").length;
    const gusTerritory = results.filter((r) => r.status === "gus_territory").length;

    return NextResponse.json({
      results,
      summary: { total: results.length, clean, duplicate, gusTerritory },
      cacheAge: cache.fetchedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — return cache status
export async function GET() {
  const cache = await loadHubSpotCache();
  return NextResponse.json({
    cached: !!cache,
    contactCount: cache?.contacts?.length || 0,
    fetchedAt: cache?.fetchedAt || null,
  });
}
