// POST /api/granola — Granola call transcript analysis
// Accepts a raw transcript and uses Claude to extract call outcomes,
// identify memory-worthy patterns, and suggest scoring updates.
// Also supports listing recent call summaries if Granola API key is set.

import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON, DATA_DIR } from "@/lib/data";
import path from "path";

export const maxDuration = 60;

const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const GRANOLA_CACHE = path.join(DATA_DIR, "granola_cache.json");

const ANALYSIS_SYSTEM = `You are analysing a cold call transcript for FlyFXFreight — a UK air cargo charter broker.

Extract the following and return ONLY valid JSON:

{
  "contactName": "Name of person called (or null if not clear)",
  "company": "Company name (or null)",
  "callerName": "kyle or gus",
  "duration": "estimated call duration in seconds (or null)",
  "outcome": "one of: meeting_booked | positive | neutral | rejection | dead_vertical | voicemail | no_answer",
  "outcomeDetail": "1-2 sentence description of what happened",
  "objectionUsed": "The main objection they raised (or null)",
  "angleWorked": "What angle or approach generated positive response (or null)",
  "angleFailure": "What approach clearly failed (or null)",
  "nextAction": "callback | send_email | import_to_hubspot | add_dnc | none",
  "callbackDate": "date string if callback agreed (or null)",
  "memoryUpdates": [
    {
      "type": "winning_angle | failing_angle | dead_vertical | add_dnc",
      "description": "What should be updated in memory files"
    }
  ],
  "icpSignals": {
    "verticalConfirmed": "confirmed vertical type or null",
    "usesCharters": true | false | null,
    "existingBroker": true | false | null,
    "estimatedCharterFrequency": "1-2x/year | 3-5x/year | 10+/year | null"
  },
  "coachingNote": "1 sentence coaching note for Kyle or Gus based on this call"
}

Context about FlyFX:
- Kyle Dow (technical specialist): handles energy, DG, project cargo, defence
- Gus Mundel (commercial): handles pharma, perishables, general freight
- The #1 message: "We work exclusively with freight forwarders, never directly with shippers"
- Dead verticals: pure ocean/road operators, warehouse-only companies`;

function extractJSON(text: string): any {
  const match = text.match(/\{[\s\S]*\}/m);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    try {
      return JSON.parse(match[0].replace(/```json|```/g, "").trim());
    } catch {
      return null;
    }
  }
}

// POST /api/granola — analyse a transcript
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { transcript, dealContext } = body;

    if (!transcript || transcript.trim().length < 50) {
      return NextResponse.json(
        { error: "transcript required (minimum 50 characters)" },
        { status: 400 }
      );
    }

    const prompt = dealContext
      ? `Analyse this call transcript. Context: calling ${dealContext.name} at ${dealContext.company}, ${dealContext.title}.\n\nTranscript:\n${transcript}`
      : `Analyse this call transcript:\n\n${transcript}`;

    const res = await fetch(CLAUDE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: ANALYSIS_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Claude API failed: ${res.status}` }, { status: 500 });
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    const analysis = extractJSON(text);
    if (!analysis) {
      return NextResponse.json({ error: "Could not parse transcript analysis" }, { status: 500 });
    }

    // Cache the analysis
    const cache = (await readJSON(GRANOLA_CACHE)) || { analyses: [] };
    cache.analyses.push({
      ...analysis,
      analysedAt: new Date().toISOString(),
      transcriptLength: transcript.length,
    });
    // Keep last 100 analyses
    if (cache.analyses.length > 100) {
      cache.analyses = cache.analyses.slice(-100);
    }
    await writeJSON(GRANOLA_CACHE, cache);

    return NextResponse.json({ analysis });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/granola — return cached analyses + summary stats
export async function GET() {
  try {
    const cache = (await readJSON(GRANOLA_CACHE)) || { analyses: [] };
    const analyses = cache.analyses || [];

    // Build stats
    const stats = {
      totalCalls: analyses.length,
      meetingsBooked: analyses.filter((a: any) => a.outcome === "meeting_booked").length,
      positiveResponses: analyses.filter(
        (a: any) => a.outcome === "positive" || a.outcome === "meeting_booked"
      ).length,
      rejections: analyses.filter((a: any) => a.outcome === "rejection").length,
      deadVerticals: analyses.filter((a: any) => a.outcome === "dead_vertical").length,
      conversionRate: analyses.length > 0
        ? Math.round(
            (analyses.filter(
              (a: any) => a.outcome === "positive" || a.outcome === "meeting_booked"
            ).length /
              analyses.length) *
              100
          )
        : 0,
    };

    // Aggregate winning angles
    const anglesMap: Record<string, number> = {};
    for (const a of analyses) {
      if (a.angleWorked) {
        anglesMap[a.angleWorked] = (anglesMap[a.angleWorked] || 0) + 1;
      }
    }
    const topAngles = Object.entries(anglesMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([angle, count]) => ({ angle, count }));

    return NextResponse.json({
      analyses: analyses.slice(-20), // last 20
      stats,
      topAngles,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
