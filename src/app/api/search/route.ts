import { NextRequest, NextResponse } from "next/server";

// POST /api/search — proxy Apollo people search (for manual mode)
export async function POST(req: NextRequest) {
  try {
    const apolloKey = process.env.APOLLO_API_KEY;
    if (!apolloKey) {
      return NextResponse.json(
        { error: "Apollo API key not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();

    const apolloRes = await fetch(
      "https://api.apollo.io/api/v1/mixed_people/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apolloKey,
        },
        body: JSON.stringify({
          person_titles: body.titles || ["Air Freight Manager", "Operations Director"],
          organization_locations: body.locations || ["United Kingdom"],
          organization_num_employees_ranges: body.sizes || ["11,50", "51,200", "201,500"],
          person_seniorities: body.seniorities || ["manager", "director", "vp"],
          q_keywords: body.keywords || "",
          q_organization_keyword_tags: body.tags || ["logistics", "freight"],
          per_page: body.per_page || 15,
          page: body.page || 1,
        }),
      }
    );

    const apolloData = await apolloRes.json();

    return NextResponse.json({
      people: apolloData.people || [],
      total: apolloData.pagination?.total_entries || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
