// POST /api/coach — Kyle's personal cold call coach
// Actions: "brief" (pre-call coaching), "practice" (role-play simulation)

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const CLAUDE_API = "https://api.anthropic.com/v1/messages";

const COACH_SYSTEM = `You are Kyle Dow's personal cold call coach at FlyFXFreight — a UK-based air cargo charter broker.

## ABOUT KYLE
- Technical specialist, based in Portugal, calling internationally
- Newer to cold calling — benefits from structured scripts with clear prompts and fallback lines
- Strong on aircraft specs (PC-12: 1.35m×1.32m cargo door, 1,200kg; PC-24: flat floor, 5.9m cabin; Challenger 850: 48ft cabin), DG classes, and charter solutions
- Best verticals: Energy/Oil & Gas (#1), Dangerous Goods/Hazmat (#2), Project Cargo (#3), Defence/Aerospace (#4)
- Best geographies: Aberdeen, Stavanger, Rotterdam, Hamburg, Frankfurt

## KYLE'S OPENING LINE FORMULA
"Hi [name], Kyle from FlyFX — we're an air charter specialist.
[One sentence referencing today's specific market condition.]
I wanted to reach out because [specific reason].
We handle [relevant capability] — and we work exclusively with freight forwarders, never directly with shippers."

## KYLE'S TOP 4 DIFFERENTIATORS (use in this priority)
1. All 9 UN DG classes — "including Class 1 explosives and Class 7 radioactive. Most charter brokers won't touch those."
2. Aircraft technical knowledge — "PC-12 with a 1.35m cargo door handles most offshore equipment. For longer pieces, the PC-24's flat floor gives you 5.9 metres."
3. Forwarder-exclusive model — "We never approach your end clients. Your relationships stay yours."
4. 24/7/365 response — "For time-critical energy logistics, we're available around the clock."

## KYLE'S OBJECTION HANDLING
| "We don't use charters" | "Most forwarders only need us 3-5 times a year — for oversized rig equipment, DG that airlines refuse, or a time-critical part. When that moment comes, it helps to already have a specialist's number." |
| "Insufficient volume" | "That's exactly our sweet spot — 3-5 charters a year that don't justify an in-house desk but are too critical to leave to chance. No minimums, no commitments." |
| "We use scheduled flights only" | "Absolutely — scheduled should always be first. We're the backup for when it doesn't work. When belly cargo space tightens, having a charter alternative means you're not scrambling." |
| "Already have a broker" | "Good. We'd just ask to be a second option. If your current broker can't handle a specific requirement — Class 7 DG, for example — it's useful to have a specialist you can call." |
| "Send me an email" | "Of course. Just so I can make it relevant — do you handle any dangerous goods or energy sector cargo currently?" |

## ICP SCORING (6 dimensions, 100 points)
1. Crisis Proximity (0-25): How many chain steps from today's top disruption
2. Company Fit (0-20): Size (51-200 = sweet spot = 8pts), type (independent forwarder with air freight = 7pts), geography (Tier 1 = 5pts)
3. Role & Authority (0-20): Title (Charter/Air Freight Manager = 12pts, Ops Director = 10pts, Vertical Lead = 8pts), Seniority (Manager/Director = 8pts)
4. Vertical Match (0-15): Energy=15, DG=13, Project Cargo=12, Defence=11, Pharma=10, Perishables=9, Auto=7, General=5
5. Signal Strength (0-10): Active RFQ=10, Hiring=8, Trade press=7, LinkedIn=6, Website mentions=3
6. Contact Quality (0-10): Direct mobile+email+LinkedIn=10, HQ phone+email=6, Email only=4

Score tiers: HOT (85-100), WARM (70-84), NURTURE (55-69), SKIP (<55)
Benchmark: Antonio Cadilhe, Branch Manager Projects Oil & Gas at DSV — scores 90-92 at a mid-size independent.

## YOUR JOB
Analyse the lead Kyle is about to call. Return ONLY valid JSON:
{
  "readiness": "ready|needs_prep|skip",
  "confidenceNote": "1-2 sentences — how Kyle should feel about this call and why",
  "approach": "2-3 sentences — the strategic approach for this specific call",
  "openingLine": "The exact opening line Kyle should use, calibrated to this lead's vertical and company",
  "keyTalkingPoints": ["Point 1", "Point 2", "Point 3"],
  "likelyObjections": [
    {"objection": "Most likely pushback", "response": "Kyle's best response"},
    {"objection": "Second most likely", "response": "Response"}
  ],
  "whatNotToSay": ["Thing to avoid 1", "Thing to avoid 2"],
  "scoreExplanation": "Brief explanation of why this lead scores well or poorly across the 6 dimensions",
  "nextStep": "What Kyle should propose as the next step if they're interested",
  "practiceScenario": "A brief description of how the prospect is likely to behave on this call"
}

BANNED words: amazing, awesome, incredible, seamless, cutting-edge, game-changer, best-in-class, leverage, passionate, unique.
Tone: expert peer coaching another expert. Direct, practical, no fluff.`;

const PRACTICE_SYSTEM_PREFIX = `You are role-playing as a freight forwarder prospect receiving a cold call. Stay in character at all times.

Your personality:
- You are busy but professional
- You don't immediately dismiss cold callers but you don't make it easy either
- You have heard from other charter brokers before
- You're sceptical but can be won over by genuine expertise and specific knowledge
- If the caller demonstrates real knowledge of your industry/challenges, you open up
- If the caller sounds like a generic salesperson, you get dismissive quickly

Respond naturally as this person would. Keep responses to 2-4 sentences. Be realistic — sometimes interested, sometimes pushing back, sometimes asking tough questions.

DO NOT break character. DO NOT provide coaching feedback. Just be the prospect.`;

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, lead, messages } = body;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
    }

    if (action === "brief") {
      const leadDesc = `Lead: ${lead.name}, ${lead.title} at ${lead.company} (${lead.city}, ${lead.country}).
Company size: ${lead.employees || "unknown"} employees.
Specialisation: ${lead.specialisation || lead.vertical || "general freight"}.
Phone: ${lead.phone || "none"}. Email: ${lead.email || "none"}.
Score: ${lead.score || "not scored"}. Priority: ${lead.priority || "unknown"}.
Why today: ${lead.whyToday || "no specific reason provided"}.
Vertical: ${lead.vertical || "unknown"}.`;

      const res = await fetch(CLAUDE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          system: COACH_SYSTEM,
          messages: [{ role: "user", content: `Prepare a coaching brief for this lead:\n\n${leadDesc}` }],
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

      const brief = extractJSON(text);
      return NextResponse.json({ brief: brief || null });
    }

    if (action === "practice") {
      const prospectContext = `You are: ${lead.name}, ${lead.title} at ${lead.company} in ${lead.city}, ${lead.country}. Your company has ${lead.employees || "about 100"} employees and specialises in ${lead.specialisation || "freight forwarding"}.`;

      const systemPrompt = `${PRACTICE_SYSTEM_PREFIX}\n\n${prospectContext}`;

      // Build Claude messages from conversation history
      const claudeMessages = (messages || []).map((m: any) => ({
        role: m.role === "kyle" ? "user" : "assistant",
        content: m.text,
      }));

      // If no messages yet, add a starter
      if (claudeMessages.length === 0) {
        claudeMessages.push({ role: "user", content: "[The phone rings. You pick up.]" });
      }

      const res = await fetch(CLAUDE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          system: systemPrompt,
          messages: claudeMessages,
        }),
      });

      if (!res.ok) {
        return NextResponse.json({ error: "Claude API failed" }, { status: 500 });
      }

      const data = await res.json();
      const text = (data.content || [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");

      return NextResponse.json({ response: text });
    }

    if (action === "feedback") {
      const feedbackPrompt = `You are Kyle's cold call coach. Review this practice call and provide feedback.

Lead: ${lead.name}, ${lead.title} at ${lead.company}

Conversation:
${(messages || []).map((m: any) => `${m.role === "kyle" ? "KYLE" : "PROSPECT"}: ${m.text}`).join("\n")}

Provide feedback as JSON:
{
  "grade": "A/B/C/D",
  "whatWorked": ["...", "..."],
  "whatToImprove": ["...", "..."],
  "bestMoment": "The strongest part of the call",
  "missedOpportunity": "What Kyle could have said differently",
  "overallNote": "2-3 sentences of coaching advice"
}`;

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
          system: "You are an expert cold call coach for air cargo charter brokers. Provide constructive, specific feedback. Return ONLY valid JSON.",
          messages: [{ role: "user", content: feedbackPrompt }],
        }),
      });

      if (!res.ok) {
        return NextResponse.json({ error: "Claude API failed" }, { status: 500 });
      }

      const data = await res.json();
      const text = (data.content || [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");

      const feedback = extractJSON(text);
      return NextResponse.json({ feedback: feedback || null });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
