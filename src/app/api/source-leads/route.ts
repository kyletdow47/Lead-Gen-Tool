// POST /api/source-leads — Populate the lead pool from Apollo People Search
// Uses lead credits only (no enrichment credits). Stores 100-500 scored leads.
// Run weekly to refresh the pool.

import { NextRequest, NextResponse } from "next/server";
import { loadLeadPool, saveLeadPool, loadContacts, getContactKeys } from "@/lib/data";
import { scoreBatch, generateOpeningLine } from "@/lib/scoring";
import type { LeadPoolEntry } from "@/lib/types";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

const EXCLUDED_COMPANIES = [
  "dhl", "kuehne", "nagel", "dsv", "schenker", "ceva", "geodis", "rhenus",
  "hellmann", "bollore", "dachser", "senator", "expeditors", "robinson",
  "ups supply", "fedex", "nippon express", "kintetsu", "yusen", "agility",
  "kerry logistics", "chapman freeborn", "air partner", "air charter service",
  "maersk", "msc ", "hapag", "cma cgm", "pml seafrigo",
];

const PERSON_TITLES = [
  "Air Freight Manager", "Air Freight Director", "Air Cargo Manager",
  "Chartering Manager", "Head of Air Freight", "Charter Manager",
  "Charter Desk Manager", "Export Manager", "Director Air Freight",
  "Logistics Manager",
];

// Split locations into batches to get broader coverage
const LOCATION_BATCHES = [
  ["Germany", "France", "United Kingdom", "Belgium", "Netherlands"],
  ["Denmark", "Sweden", "Norway", "Finland", "Poland"],
  ["Italy", "Spain", "Switzerland", "Turkey", "Ireland"],
  ["Austria", "Portugal", "Czech Republic", "Romania", "Hungary"],
];

const KEYWORD_TAGS = ["freight forwarding", "air freight", "logistics", "cargo", "transport"];

async function apolloSearch(params: any, apiKey: string): Promise<any[]> {
  try {
    const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(params),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.people || [];
  } catch { return []; }
}

export async function POST(req: NextRequest) {
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return NextResponse.json({ error: "APOLLO_API_KEY not set" }, { status: 500 });
  }

  try {
    // Load existing contacts for dedup
    const existingKeys = await getContactKeys();
    const existingContacts = await loadContacts();
    const existingCompanies = new Set<string>();
    for (const c of Object.values(existingContacts)) {
      if (c.company) existingCompanies.add(c.company.toLowerCase());
    }

    // Load dead companies
    const { promises: fs } = await import("fs");
    const path = await import("path");
    let deadCompanies: string[] = [...EXCLUDED_COMPANIES];
    try {
      const seedPath = path.join(process.cwd(), "public", "memory", "dead_companies.json");
      const raw = await fs.readFile(seedPath, "utf-8");
      const dead = JSON.parse(raw);
      for (const c of dead.doNotCall || []) {
        const id = (c.domain || c.company || "").toLowerCase();
        if (id) deadCompanies.push(id);
      }
    } catch {}

    // Run Apollo searches across all location batches
    const allPeople: any[] = [];

    for (const locations of LOCATION_BATCHES) {
      // Page 1 and 2 of each batch
      for (const page of [1, 2]) {
        const results = await apolloSearch({
          person_titles: PERSON_TITLES,
          organization_locations: locations,
          organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
          person_seniorities: ["manager", "director", "vp"],
          q_organization_keyword_tags: KEYWORD_TAGS,
          contact_email_status: ["verified", "likely to engage"],
          per_page: 100,
          page,
        }, apolloKey);
        allPeople.push(...results);
      }
    }

    // Deduplicate by Apollo ID
    const seenIds = new Set<string>();
    const deduped: any[] = [];
    for (const p of allPeople) {
      if (p.id && !seenIds.has(p.id)) {
        seenIds.add(p.id);
        deduped.push(p);
      }
    }

    // Filter out excluded companies
    const filtered = deduped.filter((p) => {
      const orgName = (p.organization?.name || "").toLowerCase();
      return !deadCompanies.some((ex) => orgName.includes(ex));
    });

    // Filter out already-contacted companies
    const fresh = filtered.filter((p) => {
      const orgName = (p.organization?.name || "").toLowerCase();
      return !existingCompanies.has(orgName);
    });

    // One per company
    const byCompany = new Map<string, any>();
    const seniorityRank: Record<string, number> = { vp: 4, director: 3, manager: 2, senior: 1 };
    for (const p of fresh) {
      const orgKey = (p.organization?.name || "unknown").toLowerCase();
      const existing = byCompany.get(orgKey);
      const pRank = seniorityRank[p.seniority || ""] || 0;
      const eRank = existing ? (seniorityRank[existing.seniority || ""] || 0) : -1;
      if (!existing || pRank > eRank) byCompany.set(orgKey, p);
    }
    const onePerCompany = Array.from(byCompany.values());

    // Score all leads
    const scored = scoreBatch(onePerCompany, deadCompanies);

    // Convert to LeadPoolEntry format
    const pool: LeadPoolEntry[] = scored.map((entry) => {
      const p = entry.person;
      const s = entry.score;
      const org = p.organization || {};

      return {
        apolloId: p.id,
        firstName: p.first_name || "",
        lastName: p.last_name_obfuscated || p.last_name || "",
        title: p.title || "",
        company: org.name || "",
        domain: org.website_url?.replace(/^https?:\/\//, "").split("/")[0] || org.primary_domain || null,
        city: p.city || org.city || "",
        country: p.country || org.country || "",
        employees: org.estimated_num_employees || null,
        industry: org.industry || null,
        keywords: org.keywords?.slice(0, 10) || [],
        linkedinUrl: p.linkedin_url || null,
        score: s.total,
        tier: s.tier,
        verticalLabel: s.verticalLabel,
        assignedTo: s.assignedTo,
        openingLine: generateOpeningLine(p, s.verticalLabel),
        addedAt: new Date().toISOString(),
        status: "pool",
      };
    });

    await saveLeadPool(pool);

    return NextResponse.json({
      success: true,
      totalSearched: allPeople.length,
      afterDedup: deduped.length,
      afterExclusions: filtered.length,
      afterCompanyDedup: onePerCompany.length,
      poolSize: pool.length,
      hot: pool.filter((p) => p.tier === "hot").length,
      warm: pool.filter((p) => p.tier === "warm").length,
      nurture: pool.filter((p) => p.tier === "nurture").length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — return current lead pool stats
export async function GET() {
  const pool = await loadLeadPool();
  const uncalled = pool.filter((p) => p.status === "pool");
  return NextResponse.json({
    poolSize: pool.length,
    uncalled: uncalled.length,
    hot: uncalled.filter((p) => p.tier === "hot").length,
    warm: uncalled.filter((p) => p.tier === "warm").length,
  });
}
