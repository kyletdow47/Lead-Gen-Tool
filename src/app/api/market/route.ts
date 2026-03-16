// POST /api/market — Auto-refreshing market intelligence snapshot
// GET  /api/market — Returns cached snapshot if fresh today

import { NextResponse } from "next/server";
import { MARKET_CACHE_FILE, readJSON, writeJSON } from "@/lib/data";

export const maxDuration = 60;

const CLAUDE_API = "https://api.anthropic.com/v1/messages";

const MARKET_SYSTEM = `You are a cargo charter market data analyst for FlyFXFreight. Search the web for TODAY's current values and return ONLY valid JSON, no markdown:

{
  "brent": "$X.XX (+/-Y.Y%)",
  "wti": "$X.XX",
  "ttfGas": "€X.XX/MWh (+/-Y%)",
  "jetFuel": "$X.XX/gal",
  "eurUsd": "X.XXXX",
  "gbpUsd": "X.XXXX",
  "hormuzStatus": "[OPEN/RESTRICTED/CLOSED] — [brief status with key details]",
  "topTalkingPoint": "[The #1 thing an air cargo charter broker should mention on every sales call today — one sentence, specific, referencing a real development]",
  "keyHeadlines": [
    "[Headline 1 relevant to air freight/cargo charter demand]",
    "[Headline 2]",
    "[Headline 3]"
  ]
}

Focus on developments that affect AIR CARGO CHARTER demand:
- Oil prices affect airline economics → route cuts → belly cargo loss → charter demand
- Trade disruptions → modal shift from sea to air → charter demand
- Geopolitical events → airspace closures → rerouting → charter demand
- Food/humanitarian crises → emergency logistics → charter demand

Be precise with numbers. Get today's actual prices.`;

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

export async function GET() {
  try {
    const cache = await readJSON(MARKET_CACHE_FILE);
    if (cache && cache.fetchedAt) {
      const today = new Date().toISOString().split("T")[0];
      const cachedDate = cache.fetchedAt.split("T")[0];
      if (cachedDate === today) {
        return NextResponse.json({ snapshot: cache, fresh: true });
      }
    }
    return NextResponse.json({ snapshot: null, fresh: false });
  } catch {
    return NextResponse.json({ snapshot: null, fresh: false });
  }
}

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
  }

  try {
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
        system: MARKET_SYSTEM,
        messages: [{ role: "user", content: "Get today's market data. Today is " + new Date().toISOString().split("T")[0] }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Claude API failed: ${res.status}` }, { status: 500 });
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    const snapshot = extractJSON(text);
    if (!snapshot) {
      return NextResponse.json({ error: "Failed to parse market data" }, { status: 500 });
    }

    const cacheData = { ...snapshot, fetchedAt: new Date().toISOString() };
    await writeJSON(MARKET_CACHE_FILE, cacheData);

    return NextResponse.json({ snapshot: cacheData, fresh: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
