// POST /api/pipeline/run — Full automated deal pipeline with SSE progress streaming
// Requires Vercel Pro plan for maxDuration = 300 (5 minutes)
// Phases: market → intelligence → Apollo search → ICP scoring → enrich → dedup → scripts → save
//
// SSE event format:
//   event: phase
//   data: {"phase": N, "name": "...", "status": "running|done|error", "message": "...", "data": {...}}
//
//   event: complete
//   data: {"success": true, "deals": 25, "date": "2026-03-17"}
//
//   event: error
//   data: {"message": "..."}

import { NextRequest } from "next/server";
import { writeJSON, readJSON, LATEST_FILE, MARKET_CACHE_FILE } from "@/lib/data";
import { scoreBatch, getVerticalScore } from "@/lib/scoring";
import path from "path";

export const maxDuration = 300;

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const GUS_OWNER_ID = "79075901";
const HUBSPOT_API = "https://api.hubapi.com";

// Verticals to search — in priority order
// Each gets a crisis proximity step count based on current conditions
const SEARCH_VERTICALS = [
  {
    id: "energy_oil_gas",
    label: "Energy / Oil & Gas",
    crisisSteps: 2, // close to Hormuz crisis
    person_titles: ["Air Freight Manager", "Freight Manager", "Charter Manager", "Branch Manager", "Energy Logistics Manager", "Project Cargo Manager"],
    organization_locations: ["United Kingdom", "Norway", "Netherlands", "Germany"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director", "vp"],
    q_organization_keyword_tags: ["oil and gas", "energy", "offshore"],
  },
  {
    id: "dangerous_goods",
    label: "Dangerous Goods",
    crisisSteps: 3,
    person_titles: ["Air Freight Manager", "DG Manager", "Special Cargo Manager", "Hazmat Manager", "Operations Manager"],
    organization_locations: ["Belgium", "Netherlands", "Germany", "France", "United Kingdom"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director"],
    q_organization_keyword_tags: ["dangerous goods", "hazardous", "chemical"],
  },
  {
    id: "project_cargo",
    label: "Project Cargo",
    crisisSteps: 3,
    person_titles: ["Project Cargo Manager", "Air Freight Manager", "Operations Director", "Branch Manager"],
    organization_locations: ["Netherlands", "Germany", "United Kingdom", "Belgium", "Norway"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director"],
    q_organization_keyword_tags: ["project cargo", "heavy lift", "logistics"],
  },
  {
    id: "pharma_cold_chain",
    label: "Pharma / Cold Chain",
    crisisSteps: 3,
    person_titles: ["Air Freight Manager", "Pharma Logistics Manager", "Cold Chain Manager", "GDP Manager", "Logistics Manager"],
    organization_locations: ["Belgium", "Netherlands", "Denmark", "Ireland", "Germany", "United Kingdom"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director"],
    q_organization_keyword_tags: ["pharmaceutical", "cold chain", "temperature controlled"],
  },
  {
    id: "perishables_food",
    label: "Perishables / Food",
    crisisSteps: 2, // Gulf food import disruption
    person_titles: ["Air Freight Manager", "Perishables Manager", "Cold Chain Manager", "Logistics Manager"],
    organization_locations: ["Netherlands", "Belgium", "France", "Spain", "United Kingdom"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "director"],
    q_organization_keyword_tags: ["perishables", "food logistics", "fresh produce"],
  },
  {
    id: "general_air_freight",
    label: "General Air Freight",
    crisisSteps: 3,
    person_titles: ["Air Freight Manager", "Air Cargo Manager", "Charter Coordinator", "Export Manager", "Branch Manager"],
    organization_locations: ["United Kingdom", "Netherlands", "Germany", "France", "Belgium", "Sweden", "Denmark", "Spain"],
    organization_num_employees_ranges: ["11,50", "51,200", "201,500"],
    person_seniorities: ["manager", "senior", "director"],
  },
];

const EXCLUDED_FREIGHT = [
  "dhl", "kuehne", "nagel", "dsv", "schenker", "ceva", "geodis", "rhenus",
  "hellmann", "bollore", "dachser", "senator", "expeditors", "robinson",
  "ups supply", "fedex", "nippon express", "kintetsu", "yusen", "agility",
  "kerry logistics", "chapman freeborn", "air partner", "air charter service",
];

function extractJSON(text: string): any {
  const match = text.match(/\{[\s\S]*\}/m) || text.match(/\[[\s\S]*\]/m);
  if (!match) return null;
  try { return JSON.parse(match[0]); }
  catch { try { return JSON.parse(match[0].replace(/```json|```/g, "").trim()); } catch { return null; } }
}

async function callClaude(system: string, user: string, apiKey: string, tools?: any[]): Promise<string> {
  const body: any = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (tools) body.tools = tools;
  const res = await fetch(CLAUDE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  return (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
}

async function apolloSearch(params: any, apiKey: string): Promise<any[]> {
  try {
    const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({ ...params, per_page: 25, page: 1 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.people || [];
  } catch { return []; }
}

async function apolloEnrich(person: any, apiKey: string): Promise<any> {
  try {
    const res = await fetch(`${APOLLO_BASE}/people/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({
        id: person.id,
        first_name: person.first_name,
        last_name: person.last_name,
        organization_name: person.organization?.name,
        reveal_personal_emails: true,
        reveal_phone_number: true,
      }),
    });
    if (!res.ok) return person;
    const data = await res.json();
    if (data.message?.includes("maximum")) return person; // rate limit
    return data.person ? { ...person, ...data.person } : person;
  } catch { return person; }
}

async function hubspotCheck(email: string | null, firstName: string, lastName: string, hsKey: string): Promise<{ isGusContact: boolean; exists: boolean }> {
  if (!hsKey) return { isGusContact: false, exists: false };
  if (email) {
    try {
      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${hsKey}` },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
          properties: ["email", "hubspot_owner_id"],
          limit: 1,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.total > 0) {
          const ownerId = data.results[0].properties?.hubspot_owner_id;
          return { exists: true, isGusContact: ownerId === GUS_OWNER_ID };
        }
      }
    } catch {}
  }
  return { isGusContact: false, exists: false };
}

function formatPhone(person: any): string | null {
  return person.phone_numbers?.[0]?.sanitized_number
    || person.sanitized_phone
    || person.phone_numbers?.[0]?.raw_number
    || null;
}

function formatEmail(person: any): string | null {
  return person.email
    || person.contact_emails?.[0]?.email
    || null;
}

function formatLinkedIn(person: any): string | null {
  return person.linkedin_url || null;
}

function formatEmployees(person: any): string | null {
  const n = person.organization?.estimated_num_employees;
  if (!n) return null;
  if (n < 50) return `${n}`;
  if (n < 200) return `${Math.round(n / 10) * 10}`;
  return `${Math.round(n / 50) * 50}`;
}

export async function POST(request: NextRequest) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const apolloKey = process.env.APOLLO_API_KEY;
  const hubspotKey = process.env.HUBSPOT_API_KEY;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      const phaseStart = (phase: number, name: string, message: string) =>
        send("phase", { phase, name, status: "running", message });
      const phaseDone = (phase: number, name: string, message: string, data?: object) =>
        send("phase", { phase, name, status: "done", message, ...(data ? { data } : {}) });
      const phaseError = (phase: number, name: string, message: string) =>
        send("phase", { phase, name, status: "error", message });

      try {
        if (!anthropicKey || !apolloKey) {
          send("error", { message: "Missing API keys (ANTHROPIC_API_KEY and APOLLO_API_KEY required)" });
          controller.close();
          return;
        }

        const today = new Date().toISOString().split("T")[0];

        // ── Phase 1: Load memory ─────────────────────────────────
        phaseStart(1, "Memory", "Loading dead verticals and winning angles...");
        const deadMemory = await readJSON(
          path.join(process.cwd(), "public", "memory", "dead_companies.json")
        );
        const deadCompanies: string[] = (deadMemory?.doNotCall || []).map((c: any) =>
          (c.domain || c.company || "").toLowerCase()
        );
        phaseDone(1, "Memory", `${deadCompanies.length} DNC entries loaded`);

        // ── Phase 2: Market data ─────────────────────────────────
        phaseStart(2, "Market Intelligence", "Fetching live market data...");
        let marketSnapshot: any = null;

        // Check cache first
        const cachedMarket = await readJSON(MARKET_CACHE_FILE);
        if (cachedMarket?.fetchedAt) {
          const cachedDate = cachedMarket.fetchedAt.split("T")[0];
          if (cachedDate === today) {
            marketSnapshot = cachedMarket;
          }
        }

        if (!marketSnapshot) {
          try {
            const marketText = await callClaude(
              `You are a market data analyst for FlyFXFreight. Search the web and return ONLY valid JSON with today's data:
{"brent": "$X.XX", "ttfGas": "€X.XX/MWh", "hormuzStatus": "OPEN|RESTRICTED|CLOSED — brief status", "topTalkingPoint": "one sentence for sales calls", "wti": "$X.XX", "eurUsd": "X.XXXX", "keyHeadlines": ["headline1", "headline2", "headline3"]}`,
              `Get today's market data. Date: ${today}`,
              anthropicKey,
              [{ type: "web_search_20250305", name: "web_search" }]
            );
            marketSnapshot = extractJSON(marketText) || {
              brent: "Live data unavailable",
              ttfGas: "Live data unavailable",
              hormuzStatus: "Check TradeWinds",
              topTalkingPoint: "Check current market conditions before calling",
            };
            if (marketSnapshot.brent !== "Live data unavailable") {
              marketSnapshot.fetchedAt = new Date().toISOString();
              await writeJSON(MARKET_CACHE_FILE, marketSnapshot);
            }
          } catch {
            marketSnapshot = { brent: "N/A", ttfGas: "N/A", hormuzStatus: "N/A", topTalkingPoint: "Check market conditions" };
          }
        }

        phaseDone(2, "Market Intelligence", `Brent ${marketSnapshot.brent || "N/A"} · TTF ${marketSnapshot.ttfGas || "N/A"}`, { snapshot: marketSnapshot });

        // ── Phase 3: Intelligence scan ───────────────────────────
        phaseStart(3, "Consequence Chains", "Building crisis consequence chains from today's events...");
        let consequenceChains: any[] = [];
        let marketIntelligence: any = null;

        try {
          const intelText = await callClaude(
            `You are an elite cargo charter market intelligence analyst for FlyFXFreight. Search the web for today's top developments and trace them forward into CONSEQUENCE CHAINS showing how each event creates air charter demand. Return ONLY valid JSON.`,
            `Today is ${today}. Search for: Hormuz status, oil prices, airspace closures, food supply disruptions, airline route cuts, freight capacity issues. Build 5 consequence chains. Each chain: {"title":"...", "event":"...", "steps":["step1","step2","step3"], "charterTrigger":"...", "target":"target forwarder type and geography"}. Also return market intelligence: {"geopolitical":[{"headline":"...","detail":"...","impact":"high|medium|low","tag":"..."}], "economic":[...], "freight":[...], "humanitarian":[...], "outlook48h":[...]}. Return JSON: {"consequenceChains":[...],"marketIntelligence":{...}}`,
            anthropicKey,
            [{ type: "web_search_20250305", name: "web_search" }]
          );
          const intelData = extractJSON(intelText);
          if (intelData?.consequenceChains) consequenceChains = intelData.consequenceChains;
          if (intelData?.marketIntelligence) marketIntelligence = intelData.marketIntelligence;
        } catch {}

        phaseDone(3, "Consequence Chains", `${consequenceChains.length} chains built`);

        // ── Phase 4: Apollo search ───────────────────────────────
        phaseStart(4, "Apollo Discovery", `Searching ${SEARCH_VERTICALS.length} verticals in Apollo...`);

        const searchResults = await Promise.all(
          SEARCH_VERTICALS.map(async (v) => {
            const { id, label, crisisSteps, q_organization_keyword_tags, ...params } = v;
            const people = await apolloSearch(
              q_organization_keyword_tags
                ? { ...params, q_organization_keyword_tags }
                : params,
              apolloKey
            );
            // Filter excluded companies
            const filtered = people.filter(
              (p) => !EXCLUDED_FREIGHT.some((ex) => (p.organization?.name || "").toLowerCase().includes(ex))
            );
            return { vertical: id, label, crisisSteps, people: filtered };
          })
        );

        const totalFound = searchResults.reduce((sum, r) => sum + r.people.length, 0);
        phaseDone(4, "Apollo Discovery", `${totalFound} people found across all verticals`);

        // ── Phase 5: ICP scoring ─────────────────────────────────
        phaseStart(5, "ICP Scoring", "Scoring all leads against 6-dimension ICP model...");

        // Combine all results, tag with vertical, score each
        const allPeople: any[] = [];
        for (const result of searchResults) {
          for (const person of result.people) {
            allPeople.push({ ...person, _searchVertical: result.vertical, _crisisSteps: result.crisisSteps });
          }
        }

        // Deduplicate by Apollo ID
        const seenIds = new Set<string>();
        const deduped: any[] = [];
        for (const p of allPeople) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            deduped.push(p);
          }
        }

        const scored = scoreBatch(deduped, 3, deadCompanies);
        // Override crisis proximity per vertical
        for (const entry of scored) {
          const v = SEARCH_VERTICALS.find((v) => v.id === entry.person._searchVertical);
          if (v) {
            const steps = v.crisisSteps;
            if (steps === 1) entry.score.crisisProximity = 25;
            else if (steps === 2) entry.score.crisisProximity = 20;
            else entry.score.crisisProximity = 15;
            entry.score.total = entry.score.crisisProximity + entry.score.companyFit +
              entry.score.roleAuthority + entry.score.verticalMatch +
              entry.score.signalStrength + entry.score.contactQuality;
            if (entry.score.total >= 85) entry.score.tier = "hot";
            else if (entry.score.total >= 70) entry.score.tier = "warm";
            else if (entry.score.total >= 55) entry.score.tier = "nurture";
            else entry.score.tier = "skip";
          }
        }

        // Take top 35 for enrichment
        const top35 = scored.filter((e) => e.score.tier !== "skip").slice(0, 35);
        phaseDone(5, "ICP Scoring", `${scored.length} scored, top ${top35.length} selected for enrichment`);

        // ── Phase 6: Enrichment ──────────────────────────────────
        phaseStart(6, "Apollo Enrichment", `Enriching ${top35.length} contacts for phone + email...`);

        const enriched: any[] = [];
        for (let i = 0; i < top35.length; i += 5) {
          const batch = top35.slice(i, i + 5);
          const batchResults = await Promise.all(
            batch.map(async (entry) => {
              const enrichedPerson = await apolloEnrich(entry.person, apolloKey);
              return { ...entry, person: enrichedPerson };
            })
          );
          enriched.push(...batchResults);
        }

        const withContact = enriched.filter(
          (e) => formatEmail(e.person) || formatPhone(e.person)
        );
        phaseDone(6, "Apollo Enrichment", `${withContact.length}/${top35.length} have phone or email`);

        // ── Phase 7: HubSpot deduplication ──────────────────────
        phaseStart(7, "HubSpot Dedup", "Checking all contacts against HubSpot CRM...");

        const notGusContacts: typeof enriched = [];
        if (hubspotKey) {
          for (let i = 0; i < withContact.length; i += 5) {
            const batch = withContact.slice(i, i + 5);
            const checked = await Promise.all(
              batch.map(async (entry) => {
                const email = formatEmail(entry.person);
                const hs = await hubspotCheck(
                  email,
                  entry.person.first_name || "",
                  entry.person.last_name || "",
                  hubspotKey
                );
                if (hs.isGusContact) return null; // Hard exclusion
                return { ...entry, _inHubspot: hs.exists };
              })
            );
            notGusContacts.push(...checked.filter(Boolean) as typeof enriched);
          }
        } else {
          notGusContacts.push(...withContact);
        }

        phaseDone(7, "HubSpot Dedup", `${notGusContacts.length} contacts after dedup (Gus's contacts excluded)`);

        // ── Phase 8: Kyle/Gus split + final top 25 ──────────────
        phaseStart(8, "Kyle/Gus Split", "Sorting and ranking final 25...");

        // Sort by score, then by contact quality (phone first)
        notGusContacts.sort((a, b) => {
          if (b.score.total !== a.score.total) return b.score.total - a.score.total;
          const aPhone = formatPhone(a.person) ? 1 : 0;
          const bPhone = formatPhone(b.person) ? 1 : 0;
          return bPhone - aPhone;
        });

        const final25 = notGusContacts.slice(0, 25);
        const kyleCount = final25.filter((e) => e.score.assignedTo === "kyle").length;
        const gusCount = final25.filter((e) => e.score.assignedTo === "gus").length;
        phaseDone(8, "Kyle/Gus Split", `25 selected: Kyle ${kyleCount}, Gus ${gusCount}`);

        // ── Phase 9: Script generation ───────────────────────────
        phaseStart(9, "Script Generation", "Generating personalised opening lines and scripts...");

        const leadsText = final25.map((e, i) => {
          const p = e.person;
          return `Lead ${i + 1}: ${p.first_name} ${p.last_name || ""}, ${p.title} at ${p.organization?.name || "Unknown"} (${p.city || ""}, ${p.country || ""}). Vertical: ${e.score.verticalLabel}. Score: ${e.score.total}. Crisis angle: ${consequenceChains[0]?.title || "general market disruption"}.`;
        }).join("\n");

        let scripts: any[] = [];
        try {
          const scriptText = await callClaude(
            `You are a senior cargo charter broker at FlyFXFreight writing personalised cold call scripts for freight forwarder leads.
Script structure that converts: (1) Name + company, (2) "air charter specialist", (3) specific services, (4) "additional option, not replacement", (5) credibility.
ALWAYS include: "FlyFX works exclusively with freight forwarders — never directly with shippers."
BANNED: amazing, awesome, incredible, seamless, cutting-edge, game-changer, leverage.
Return a JSON array, one object per lead with: opening_line, call_script, cold_email, email_subject, lead_differentiator, differentiator_detail, why_today, objection, follow_up_trigger`,
            `Today is ${today}. Market: Brent ${marketSnapshot.brent}, TTF ${marketSnapshot.ttfGas}. Top talking point: "${marketSnapshot.topTalkingPoint}". Top crisis: "${consequenceChains[0]?.title || "global freight disruption"}".

Generate scripts for ${final25.length} leads:
${leadsText}

Return ONLY a JSON array, no markdown.`,
            anthropicKey
          );
          scripts = extractJSON(scriptText) || [];
        } catch {}

        phaseDone(9, "Script Generation", `${scripts.length} scripts generated`);

        // ── Phase 10: Build output + save ────────────────────────
        phaseStart(10, "Saving", "Building output and saving to app...");

        const deals = final25.map((entry, i) => {
          const p = entry.person;
          const s = entry.score;
          const script = scripts[i] || {};
          const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
          const phone = formatPhone(p);
          const email = formatEmail(p);
          const linkedin = formatLinkedIn(p);

          return {
            rank: i + 1,
            name,
            title: p.title || "",
            company: p.organization?.name || "",
            city: p.city || "",
            country: p.country || "",
            phone: phone || null,
            email: email || null,
            linkedin: linkedin || null,
            domain: p.organization?.website_url?.replace(/^https?:\/\//, "").split("/")[0] || null,
            employees: formatEmployees(p),
            specialisation: s.verticalLabel,
            priority: s.tier === "hot" ? "hot" : s.tier === "warm" ? "warm" : "nurture" as "hot" | "warm" | "nurture",
            assignedTo: s.assignedTo,
            crisisAngle: consequenceChains[0]?.title || "Global freight disruption",
            whyToday: script.why_today || `${s.verticalLabel} specialist in ${p.city} — ${consequenceChains[0]?.charterTrigger || "active charter demand expected"}`,
            openingLine: script.opening_line || `Hi ${p.first_name}, it's Kyle from FlyFX — we're an air charter specialist. ${marketSnapshot.topTalkingPoint} We work exclusively with freight forwarders.`,
            callScript: script.call_script || null,
            coldEmail: script.cold_email || null,
            emailSubject: script.email_subject || null,
            leadDifferentiator: script.lead_differentiator || (s.verticalMatch >= 13 ? "DG / Hazmat expertise" : s.verticalMatch >= 11 ? "Energy / offshore capability" : "Forwarder-exclusive model"),
            differentiatorDetail: script.differentiator_detail || "",
            objection: script.objection || "We already have a broker — Good. We'd be a second option for specialist requirements.",
            followUpTrigger: script.follow_up_trigger || "Market movement or capacity crunch",
            enrichmentStatus: email && phone ? "Phone + Email" : email ? "Email only" : "Phone only",
            apolloId: p.id || null,
            source: `Apollo — ${s.verticalLabel}`,
            score: s.total,
            scoreBreakdown: s,
          };
        });

        const outputData = {
          date: today,
          marketSnapshot,
          marketIntelligence: marketIntelligence || undefined,
          consequenceChains: consequenceChains.length > 0 ? consequenceChains : undefined,
          scriptIntelligence: {
            callsAnalysed: 0,
            topOpener: "Kyle from FlyFX — air charter specialist, dangerous goods and energy logistics",
            commonObjection: "We already have a broker",
            scriptChanges: `Pipeline run ${today}`,
          },
          deals,
        };

        // Save to data store
        await writeJSON(LATEST_FILE, outputData);

        // Also save to public/data.json as cold-start fallback
        try {
          const publicPath = path.join(process.cwd(), "public", "data.json");
          const { promises: fs } = await import("fs");
          await fs.writeFile(publicPath, JSON.stringify(outputData, null, 2));
        } catch {}

        phaseDone(10, "Saving", `${deals.length} deals saved`, { dealCount: deals.length });

        send("complete", {
          success: true,
          deals: deals.length,
          date: today,
          hot: deals.filter((d) => d.priority === "hot").length,
          warm: deals.filter((d) => d.priority === "warm").length,
          kyle: deals.filter((d) => d.assignedTo === "kyle").length,
          gus: deals.filter((d) => d.assignedTo === "gus").length,
        });

        controller.close();
      } catch (err: any) {
        send("error", { message: err.message || "Pipeline failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
