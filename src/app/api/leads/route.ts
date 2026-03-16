// POST /api/leads — Apollo People API search and enrichment
// Supports three modes: normal (freight verticals), political (crisis-driven), private_jets (operator ICP)
// Ported from flyfx-deals-deck v1, aligned with CLAUDE.md v3.0

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const APOLLO_BASE = "https://api.apollo.io/api/v1";

// Excluded Tier 1 companies (freight mode) — from CLAUDE.md exclusion rules
const EXCLUDED_FREIGHT = [
  "dhl", "kuehne", "nagel", "dsv", "schenker", "ceva", "geodis", "rhenus",
  "hellmann", "bollore", "dachser", "senator", "expeditors", "robinson",
  "ups supply", "fedex", "nippon express", "kintetsu", "yusen", "agility",
  "kerry logistics", "chapman freeborn", "air partner", "air charter service",
];

// Excluded from private jets mode (competing brokers)
const EXCLUDED_JETS = [
  "netjets", "vistajet", "flexjet", "air partner", "chapman freeborn",
  "air charter service", "privatefly", "lunajets", "paramount",
  "hunt & palmer", "avinode",
];

// Preset search configs for Normal Mode verticals
const VERTICAL_PRESETS: Record<string, any> = {
  energy_oil_gas: {
    person_titles: ["Air Freight Manager", "Freight Manager", "Charter Manager", "Branch Manager", "Energy Logistics Manager", "Project Cargo Manager"],
    organization_locations: ["United Kingdom", "Norway", "Netherlands", "Germany"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director", "vp"],
  },
  dangerous_goods: {
    person_titles: ["Air Freight Manager", "DG Manager", "Special Cargo Manager", "Hazmat Manager"],
    organization_locations: ["Belgium", "Netherlands", "Germany", "France", "Switzerland", "United Kingdom"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director"],
  },
  automotive_aog: {
    person_titles: ["Air Freight Manager", "AOG Manager", "Aerospace Logistics Manager", "Operations Director"],
    organization_locations: ["Germany", "United Kingdom", "France", "Czech Republic", "Poland"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director"],
  },
  pharma_cold_chain: {
    person_titles: ["Air Freight Manager", "Pharma Logistics Manager", "Cold Chain Manager", "GDP Manager", "Logistics Manager"],
    organization_locations: ["Belgium", "Netherlands", "Denmark", "Ireland", "Germany", "United Kingdom"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director"],
  },
  perishables_food: {
    person_titles: ["Air Freight Manager", "Perishables Manager", "Cold Chain Manager", "Logistics Manager"],
    organization_locations: ["Netherlands", "Belgium", "France", "Spain", "United Kingdom"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director"],
  },
  general_air_freight: {
    person_titles: ["Air Freight Manager", "Air Cargo Manager", "Charter Coordinator", "Export Manager"],
    organization_locations: ["United Kingdom", "Norway", "Netherlands", "Germany", "France", "Belgium", "Sweden", "Denmark", "Spain"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "senior", "director"],
  },
  humanitarian: {
    person_titles: ["Logistics Manager", "Air Freight Manager", "Operations Director", "Supply Chain Manager"],
    organization_locations: ["Belgium", "Netherlands", "Switzerland", "United Kingdom", "Denmark", "Germany"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director"],
  },
};

// Private Jets mode search config — FlyFXVisuals ICP
const PRIVATE_JET_PRESETS: Record<string, any> = {
  operators_iberia: {
    person_titles: ["Managing Director", "Commercial Director", "Head of Charter", "Fleet Manager", "VP Operations", "Owner"],
    organization_locations: ["Portugal", "Spain"],
    organization_num_employees_ranges: ["11,50", "51,200"],
    person_seniorities: ["director", "vp", "c_suite", "owner", "founder"],
  },
  operators_france_italy: {
    person_titles: ["Managing Director", "Commercial Director", "Head of Charter Sales", "Fleet Manager", "CEO"],
    organization_locations: ["France", "Italy", "Switzerland"],
    organization_num_employees_ranges: ["11,50", "51,200"],
    person_seniorities: ["director", "vp", "c_suite", "owner", "founder"],
  },
  operators_northern_europe: {
    person_titles: ["Managing Director", "Commercial Director", "Head of Charter", "CEO", "Fleet Manager"],
    organization_locations: ["Germany", "Netherlands", "Belgium", "Austria", "United Kingdom"],
    organization_num_employees_ranges: ["11,50", "51,200"],
    person_seniorities: ["director", "vp", "c_suite", "owner", "founder"],
  },
};

function isExcluded(orgName: string | undefined, mode: string): boolean {
  if (!orgName) return false;
  const lower = orgName.toLowerCase();
  const list = mode === "private_jets" ? EXCLUDED_JETS : EXCLUDED_FREIGHT;
  return list.some((ex) => lower.includes(ex));
}

async function apolloSearch(params: any, apiKey: string) {
  const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({ ...params, per_page: params.per_page || 25, page: params.page || 1 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Apollo search failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function apolloEnrich(params: any, apiKey: string) {
  const res = await fetch(`${APOLLO_BASE}/people/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({
      ...params,
      reveal_personal_emails: true,
      reveal_phone_number: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn(`Enrichment failed for ${params.first_name}: ${res.status} ${err}`);
    return null;
  }
  const data = await res.json();
  if (data.message && data.message.includes("maximum number")) {
    console.warn("Apollo enrichment rate limit hit");
    return null;
  }
  return data;
}

// Enrich leads in parallel with concurrency limit
async function enrichLeads(leads: any[], apiKey: string, maxConcurrent = 5) {
  const results: any[] = [];
  for (let i = 0; i < leads.length; i += maxConcurrent) {
    const batch = leads.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async (person: any) => {
        const result = await apolloEnrich(
          {
            id: person.id,
            first_name: person.first_name,
            last_name: person.last_name,
            organization_name: person.organization?.name,
          },
          apiKey
        );
        if (result?.person) {
          return { ...person, ...result.person };
        }
        return person;
      })
    );
    results.push(...batchResults);
  }
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, vertical, page, customSearch, enrichIds } = body;
    const apiKey = process.env.APOLLO_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Apollo API key not configured" },
        { status: 500 }
      );
    }

    // Enrichment-only request
    if (enrichIds && enrichIds.length > 0) {
      const enriched = await enrichLeads(enrichIds, apiKey, 3);
      return NextResponse.json({ enriched });
    }

    // Search request
    let searchParams: any = {};

    if (mode === "normal") {
      if (customSearch) {
        searchParams = customSearch;
      } else if (vertical && VERTICAL_PRESETS[vertical]) {
        searchParams = { ...VERTICAL_PRESETS[vertical] };
      } else {
        searchParams = { ...VERTICAL_PRESETS.general_air_freight };
      }
    } else if (mode === "political") {
      if (customSearch) {
        searchParams = customSearch;
      } else {
        searchParams = {
          person_titles: ["Air Freight Manager", "Freight Manager", "Logistics Manager", "Operations Director", "Charter Manager"],
          organization_locations: ["United Kingdom", "Norway", "Netherlands", "Germany", "France", "Belgium", "Sweden", "Denmark", "Spain"],
          organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
          person_seniorities: ["manager", "director"],
        };
      }
    } else if (mode === "private_jets") {
      if (customSearch) {
        searchParams = customSearch;
      } else {
        const presetKeys = Object.keys(PRIVATE_JET_PRESETS);
        const presetKey = presetKeys[(page || 1) % presetKeys.length];
        searchParams = { ...PRIVATE_JET_PRESETS[presetKey] };
      }
    }

    searchParams.page = page || 1;
    searchParams.per_page = 25;

    const data = await apolloSearch(searchParams, apiKey);

    // Filter excluded companies
    const filtered = (data.people || []).filter(
      (p: any) => !isExcluded(p.organization?.name, mode)
    );

    // Auto-enrich to get full contact details
    const enriched = await enrichLeads(filtered, apiKey, 5);

    // Sort: phone first, then email, then no contact
    enriched.sort((a: any, b: any) => {
      const aPhone = !!(a.phone_numbers?.length || a.sanitized_phone);
      const bPhone = !!(b.phone_numbers?.length || b.sanitized_phone);
      const aEmail = !!a.email;
      const bEmail = !!b.email;
      if (aPhone && !bPhone) return -1;
      if (!aPhone && bPhone) return 1;
      if (aEmail && !bEmail) return -1;
      if (!aEmail && bEmail) return 1;
      return 0;
    });

    return NextResponse.json({
      people: enriched,
      total: data.total_entries || 0,
      page: searchParams.page,
      mode,
      vertical,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
