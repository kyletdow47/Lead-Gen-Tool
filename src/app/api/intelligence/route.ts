// POST /api/intelligence — Claude-powered intelligence layer
// Handles: crisis analysis (political mode), script generation (freight + private jets)
// Ported from flyfx-deals-deck v1

import { NextRequest, NextResponse } from "next/server";
import { loadBrain } from "@/lib/data";

export const maxDuration = 60;

const CLAUDE_API = "https://api.anthropic.com/v1/messages";

async function callClaude(system: string, prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(CLAUDE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  return text;
}

function extractJSON(text: string): any {
  const match = text.match(/\[[\s\S]*\]/m) || text.match(/\{[\s\S]*\}/m);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      return JSON.parse(match[0].replace(/```json|```/g, "").trim());
    }
  }
  return null;
}

const SCRIPT_SYSTEM = `You are a senior cargo charter broker at FlyFXFreight writing personalised cold call scripts.
You speak like an aviation industry insider — specific, credible, direct.
From Granola call analysis: the best performing structure is:
1. "Kyle from FlyFX" — name + company
2. "Air charter specialist" — specialist positioning
3. "Oversized, dangerous goods, time-critical" — specific services
4. "Additional option, not replacement" — partnership frame
5. "17 years experience" — credibility

NEVER use: amazing, awesome, incredible, seamless, cutting-edge, game-changer, best-in-class, leverage.
NEVER name specific airlines, operators, or competing brokers.
ALWAYS include: "FlyFX works exclusively with freight forwarders — never directly with shippers."
Tone: expert peer calling another expert peer. Not a salesperson.`;

const JETS_SCRIPT_SYSTEM = `You are writing outreach scripts for FlyFX Visuals targeting private jet operators.
The pitch: FlyFX produces cinematic video content for charter operators. The value proposition is that idle aircraft are burning money, and premium content drives charter bookings.
Key framing: "Aircraft on ground is burning money" — the anchor phrase.
Use their vocabulary: "more flights" not "more engagement", "new clients" not "lead generation".
Position as aviation professional who produces content, not content agency trying to understand aviation.
Never mention brokerage margin, internal costs, platform algorithms, or that this is a new service.
Never mention price in outreach — pricing only at face-to-face meeting.
Tone: confident, knowledgeable, grounded. Aviation insider.`;

const POLITICAL_SYSTEM = `You are an elite cargo charter market intelligence analyst for FlyFXFreight.
Your job: search the web for TODAY's developments and build CONSEQUENCE CHAINS — tracing events forward from headline to charter demand.

For every major development, trace it through 3-4 steps:
EVENT → FIRST ORDER (immediate logistics impact) → SECOND ORDER (who is affected) → THIRD ORDER (which forwarder needs what) → CHARTER TRIGGER → APOLLO SEARCH PARAMS

Cover: Iran-US war, Strait of Hormuz, oil/gas prices, Middle East food imports, airspace closures, refinery damage, LNG disruptions, freight rate movements, airline route cuts, sanctions, humanitarian logistics.

Return ONLY valid JSON. No markdown.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, leads, mode } = body;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    // Action: generate scripts for leads
    if (action === "generate_scripts") {
      let systemPrompt = mode === "private_jets" ? JETS_SCRIPT_SYSTEM : SCRIPT_SYSTEM;

      // Inject brain script adjustments
      if (mode !== "private_jets") {
        try {
          const brain = await loadBrain();
          const scriptAdjustments = brain.insights.filter(
            (i) => i.active && i.type === "adjust_script"
          );
          if (scriptAdjustments.length > 0) {
            const adjustmentLines = scriptAdjustments.map(
              (s) => `- ${s.target || "general"}: ${s.instruction}`
            );
            systemPrompt += `\n\nBRAIN ADJUSTMENTS (from Kyle's market intelligence — apply these to today's scripts):\n${adjustmentLines.join("\n")}`;
          }
        } catch {}
      }
      const leadsText = leads
        .map(
          (l: any, i: number) =>
            `Lead ${i + 1}: ${l.first_name} ${l.last_name || ""}, ${l.title} at ${l.organization?.name || "Unknown"} (${l.city || ""}, ${l.country || ""}). Specialisation: ${l.organization?.industry || "freight"}. Company size: ${l.organization?.estimated_num_employees || "unknown"}.`
        )
        .join("\n");

      const prompt =
        mode === "private_jets"
          ? `Generate outreach scripts for these private jet operators. For each person, provide:
- opening_line: first thing to say (reference idle aircraft / content opportunity)
- call_script: full 30-second opener
- email_subject: max 60 chars
- cold_email: full email for those without phone (short, operator language)
- lead_differentiator: which FlyFX Visuals value prop to lead with
- objection: most likely pushback and response
- qualification_score: 0-14 based on the ICP scoring matrix (fleet size, marketing capability, utilisation, AOC, competitive landscape, decision-maker access, geography)

Return as JSON array, one object per lead.

${leadsText}`
          : `Generate call scripts for these freight forwarder contacts. For each person, provide:
- opening_line: first 10 seconds, crisis-relevant, specific
- call_script: full 30-second opener, natural broker tone
- email_subject: max 60 chars for cold email
- cold_email: full email for those without phone numbers
- lead_differentiator: which FlyFX capability to lead with (DG/energy/24-7/biz_jet/neutral/forwarder_only)
- why_today: why calling today specifically matters (tie to current events)
- objection: most likely pushback and how to handle
- priority: hot/warm/nurture

Return as JSON array, one object per lead. No markdown.

${leadsText}`;

      const result = await callClaude(systemPrompt, prompt, apiKey);
      const scripts = extractJSON(result);
      return NextResponse.json({ scripts: scripts || [] });
    }

    // Action: political intelligence scan
    if (action === "political_scan") {
      const prompt = `Search the web for TODAY's latest developments across:
1. Iran-US war / Strait of Hormuz / Middle East conflict
2. Oil prices (Brent, WTI) and energy market movements
3. Food/agricultural supply chain disruptions to Middle East
4. Airspace closures and flight diversions
5. Freight rate changes and capacity disruptions
6. Any major economic indicators (PMI, currency, trade restrictions)

Build 6-8 CONSEQUENCE CHAINS, each ending with specific Apollo search parameters.

Return JSON:
{
  "market_snapshot": {
    "brent_crude": "$X",
    "hormuz_status": "open/closed/restricted",
    "top_headline": "...",
    "talking_point": "The #1 thing to mention on every call today"
  },
  "consequence_chains": [
    {
      "event": "...",
      "first_order": "...",
      "second_order": "...",
      "third_order": "...",
      "charter_trigger": "...",
      "urgency": "high/medium/low",
      "apollo_search": {
        "person_titles": [...],
        "q_keywords": "...",
        "organization_locations": [...],
        "person_seniorities": [...]
      }
    }
  ],
  "food_crisis": {
    "status": "...",
    "charter_implications": "..."
  }
}`;

      const result = await callClaude(POLITICAL_SYSTEM, prompt, apiKey);
      const intel = extractJSON(result);
      return NextResponse.json({ intelligence: intel });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
