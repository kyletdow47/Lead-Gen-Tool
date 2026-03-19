// POST /api/agent — FlyFX Sales Intelligence Agent
// mode: 'quick' (default) — simple streaming text, no tools, no history (backward compatible)
// mode: 'chat'  — full brain mode: sparring partner, tool_use, insight extraction, conversation history

import { NextRequest, NextResponse } from "next/server";
import {
  loadBrain, appendInsight, deleteInsight,
  loadChatHistory, saveChatHistory,
  readJSON, GRANOLA_CACHE_FILE,
} from "@/lib/data";
import type { BrainInsight, ChatMessage } from "@/lib/types";

export const maxDuration = 120; // Chat mode may need multi-turn tool loops

const CLAUDE_API = "https://api.anthropic.com/v1/messages";

// ── Shared FlyFX context (used by both modes) ──────────────────

const FLYFX_CONTEXT = `## WHO YOU WORK FOR

FlyFXFreight — UK-based air cargo charter broker (HQ: Mildenhall, Bury St Edmunds). Pure broker model: no AOC, neutral aircraft selection from thousands of global operators. ACA accredited.

Sub-brands: FlyFXJets (private jet), FlyFXFreight (cargo charter), FlyFXVisuals (aviation content).
Contact: sales@fly-fx.com | +44 203 576 56 34

## THE TEAM

Kyle Dow — Technical Specialist, based in Portugal. Handles energy, DG, project cargo, defence. Newer to cold calling, strong on aircraft specs and technical solutions.
Gustavo "Gus" Mundel — Commercial Director, based in UK. 17 years in air charter. Handles pharma, perishables, general freight, automotive. Experienced cold caller, conversational style.

## ICP — WHO WE SELL TO
Mid-size independent freight forwarders (51-200 employees) with air freight capabilities in European logistics hubs. They need charters 3-5 times per year — enough to matter, not enough for an in-house charter desk.

## WHY THEY BUY FROM US
1. All 9 UN DG classes — Class 1 (explosives) through Class 9 (miscellaneous). Most brokers cap at Class 3.
2. Aircraft expertise — PC-12: 1.35m cargo door, 1,200kg; PC-24: flat floor, 5.9m; Challenger 850: 48ft cabin.
3. Forwarder-exclusive — "We never approach your end clients." Trust signal on every call.
4. Neutral broker — Thousands of operators, best aircraft for the specific requirement.
5. 24/7/365 availability — Time-critical energy, offshore, humanitarian logistics.

## SCORING MODEL (6 dimensions, 100 points)
1. Crisis Proximity (0-25): Chain steps from disruption. 1 step=25, 2=20, 3=15, 4+=10.
2. Company Fit (0-20): Size (51-200=8), Type (independent forwarder=7), Geography (Tier 1=5, Tier 2=4, Tier 3=3).
3. Role & Authority (0-20): Title (Charter Manager=12, Ops Director=10, Vertical Lead=8, Commercial=6). Seniority (Manager/Director=8, VP=6).
4. Vertical Match (0-15): Energy=15, DG=13, Project Cargo=12, Defence=11, Pharma=10, Perishables=9, Auto=7, General=5, E-commerce=3.
5. Signal Strength (0-10): Active RFQ=10, Hiring=8, Trade press=7, LinkedIn=6, Expansion=5, Events=4, Website=3.
6. Contact Quality (0-10): Direct mobile+email+LinkedIn=10, Direct phone+email=8, HQ phone+email=6, Email only=4.

Score tiers: HOT 85-100, WARM 70-84, NURTURE 55-69, SKIP <55.
Benchmark: Antonio Cadilhe — Branch Manager Projects Oil & Gas at DSV = 90-92.

## CONSEQUENCE CHAIN THINKING
Every world event is a domino. Trace forward:
EVENT → FIRST ORDER (logistics impact) → SECOND ORDER (downstream affected) → THIRD ORDER (forwarder needs what) → CHARTER TRIGGER

## VERTICALS
Kyle's territory (≥11pts): Energy/Oil & Gas (15), DG/Hazmat (13), Project Cargo (12), Defence/Aerospace (11).
Gus's territory (≤10pts): Pharma (10), Perishables (9), Automotive (7), General Air Freight (5).

## GEOGRAPHIES
Tier 1: Aberdeen, Stavanger, Rotterdam, Hamburg, Amsterdam, London, Frankfurt, Antwerp
Tier 2: Oslo, Copenhagen, Brussels, Paris, Milan, Madrid, Lisbon, Edinburgh, Munich, Düsseldorf
Tier 3: Helsinki, Warsaw, Vienna, Prague, Dublin, Gothenburg, Bergen, Basel

## OBJECTION HANDLING — KYLE
"We don't use charters" → "Most forwarders need us 3-5 times a year — oversized rig equipment, DG airlines refuse, time-critical parts."
"Insufficient volume" → "That's our sweet spot — 3-5 charters that don't justify an in-house desk. No minimums."
"Already have a broker" → "Good. We'd be a second option — especially for Class 7 DG or specialist requirements."
"Send me an email" → "Of course. Do you handle DG or energy cargo? I'll include relevant examples."

## OBJECTION HANDLING — GUS
"We don't use charters" → "Fair enough — most don't, until they suddenly do. Forwarders with a charter contact don't lose clients when things go sideways."
"Already have a broker" → "Good. All I'd ask is to be your second call. Different networks, sometimes better rates."
"Not a good time" → "No worries — can I send a one-pager and check back in a couple weeks?"

## EXCLUSION RULES
NEVER target: DHL, Kuehne+Nagel, DSV, DB Schenker, CEVA, Geodis, Rhenus, Hellmann, Bolloré, Dachser, Senator, Expeditors, C.H. Robinson, UPS Supply Chain, FedEx Logistics, Nippon Express, Kintetsu, Yusen, Agility, Kerry Logistics.
NEVER target: IT, HR, Finance, Marketing, Ocean-only, Road-only, Warehouse-only roles.

## BRAND VOICE
Company name: FlyFX (capital F, capital X, no space). Sub-brands: FlyFXFreight, FlyFXJets, FlyFXVisuals.
BANNED: amazing, awesome, incredible, seamless, cutting-edge, game-changer, best-in-class, leverage, passionate, unique.
Tone: expert, precise, professional, direct. Earned authority. Oxford comma always.`;

// ── Quick mode system prompt (original behavior) ────────────────

const QUICK_SYSTEM = `You are the FlyFXFreight Sales Intelligence Agent — an always-on strategic advisor for Kyle Dow and the FlyFX charter brokerage team.

You have the analytical mind of a commodity trader, the market instincts of a veteran freight broker, and the sales coaching skills of a world-class B2B consultant.

${FLYFX_CONTEXT}

## WHAT YOU CAN DO
1. Answer questions about selling charters to freight forwarders
2. Analyse leads and explain ICP scores across all 6 dimensions
3. Generate custom scripts calibrated to Kyle or Gus's style
4. Build consequence chains from any geopolitical/economic event
5. Explain market dynamics and charter demand impacts
6. Suggest verticals and geographies to prioritise
7. Critique call approaches and suggest improvements
8. Role-play objection handling
9. Analyse conversion patterns and suggest scoring adjustments

You are a specialist cargo charter sales strategist. Every response shows deep domain knowledge. You think in consequence chains, not headlines. You measure in ICP scores, not gut feelings.`;

// ── Chat mode system prompt (sparring partner + brain) ──────────

function buildChatSystem(brainSummary: string, callStats: string): string {
  return `You are Kyle Dow's intelligence partner for the FlyFXFreight deals machine — a sparring partner who challenges assumptions, cites real data, and helps Kyle think sharper about the charter market.

You are NOT a yes-man. When Kyle shares a market hunch or strategy idea, your job is to:
- Ask what evidence he has for the claim
- Ask what would change his mind
- Ask what the risk is if he's wrong
- Present counter-arguments before agreeing
- Reference actual call data and conversion rates when available (use the query_granola tool)
- Compare his intuition against the scoring model and pipeline data

You think in consequence chains, not headlines. You measure in ICP scores, not gut feelings.

${FLYFX_CONTEXT}

## YOUR TOOLS

You have tools to interact with the FlyFX "brain" — a structured knowledge base that the deals pipeline reads when generating leads.

**When you identify an actionable insight from the conversation, use save_insight to store it.** An actionable insight is one that changes the pipeline's output — a scoring modifier, a script adjustment, or an exclusion/priority rule.

There are exactly 3 types of brain insight:
1. **adjust_scoring** — Changes a scoring dimension weight. Must be structured data: dimension, filter, modifier (number). The scoring engine applies these arithmetically. Example: "+5 to verticalMatch for DG companies in Belgium."
2. **adjust_script** — Changes an opening line template, crisis angle, or objection response. This is a natural language instruction that Claude interprets when generating scripts. Example: "Shift crisis hook from urgency to long-term partnership positioning."
3. **exclude_or_prioritize** — Adds to an exclusion list or priority list. Example: "Exclude ocean-only companies in Scandinavia" or "Prioritize France for the next 2 weeks."

**Rules for insight extraction:**
- If the conversation doesn't produce a pipeline-changing insight, don't force one. Not every exchange needs a brain entry.
- After saving an insight, tell Kyle what you stored and how it will affect the pipeline.
- Numbers must be deterministic (structured data). Words can be AI-generated (prompt-based).
- Call debriefs and general notes do NOT go in the brain — that's what Granola and HubSpot are for. Only store insights that change the pipeline's output.

## ACTIVE BRAIN STATE

These are the current modifiers the pipeline is using:

${brainSummary || "No active brain insights yet. The pipeline is running on base scoring weights."}

## CALL DATA SUMMARY

${callStats || "No call data available yet. Use query_granola to pull recent call analyses."}

## CONVERSATION STYLE
- Be direct. Challenge Kyle. Don't pad responses with pleasantries.
- When Kyle shares a market observation, respond with "What's the evidence?" before agreeing.
- Reference specific numbers: scoring weights, conversion rates, lead counts.
- If Kyle is wrong about something, say so clearly and explain why.
- Keep responses concise — Kyle is busy making calls.`;
}

// ── Tool definitions for chat mode ──────────────────────────────

const CHAT_TOOLS = [
  { type: "web_search_20250305" as const, name: "web_search" },
  {
    name: "save_insight",
    description: "Save a structured insight to the FlyFX brain. Only use this when the conversation produces an actionable pipeline change — a scoring modifier, script adjustment, or exclusion/priority rule. After saving, tell Kyle what was stored and how it affects the pipeline.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string" as const, enum: ["adjust_scoring", "adjust_script", "exclude_or_prioritize"], description: "The type of brain insight" },
        reason: { type: "string" as const, description: "Why this insight is being stored (1-2 sentences)" },
        // adjust_scoring fields
        dimension: { type: "string" as const, description: "For adjust_scoring: which scoring dimension (crisisProximity, companyFit, roleAuthority, verticalMatch, signalStrength, contactQuality)" },
        filter: { type: "object" as const, description: "For adjust_scoring: filter conditions e.g. {\"vertical\": \"DG\", \"country\": \"Belgium\"}", additionalProperties: { type: "string" as const } },
        modifier: { type: "number" as const, description: "For adjust_scoring: points to add (positive) or subtract (negative)" },
        // adjust_script fields
        target: { type: "string" as const, description: "For adjust_script: what to change (crisis_hook, opening_line, objection_response, closing)" },
        instruction: { type: "string" as const, description: "For adjust_script: natural language instruction for script generation" },
        // exclude_or_prioritize fields
        action: { type: "string" as const, enum: ["exclude", "prioritize"], description: "For exclude_or_prioritize: exclude or prioritize" },
        scope: { type: "string" as const, description: "For exclude_or_prioritize: what scope (vertical, company, country, geography)" },
        value: { type: "string" as const, description: "For exclude_or_prioritize: the value to exclude/prioritize" },
        geography: { type: "string" as const, description: "For exclude_or_prioritize: optional geographic scope" },
      },
      required: ["type", "reason"],
    },
  },
  {
    name: "read_brain",
    description: "Read the current state of the FlyFX brain — all active insights that are modifying the pipeline's scoring, scripts, and lead selection.",
    input_schema: {
      type: "object" as const,
      properties: {
        type_filter: { type: "string" as const, enum: ["adjust_scoring", "adjust_script", "exclude_or_prioritize"], description: "Optional: filter by insight type" },
      },
    },
  },
  {
    name: "delete_insight",
    description: "Remove a brain insight by ID. Use when Kyle says an insight is wrong or no longer relevant.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const, description: "The insight ID to delete (e.g. ins_1234_1)" },
      },
      required: ["id"],
    },
  },
  {
    name: "query_granola",
    description: "Query recent cold call analyses — outcomes, winning angles, objections, conversion rates. Use this to ground advice in real call data rather than theory.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, description: "What to look for in call data (e.g. 'conversion rates by country', 'common objections', 'winning angles')" },
      },
      required: ["query"],
    },
  },
];

// ── Tool execution ──────────────────────────────────────────────

async function executeTool(name: string, input: any): Promise<{ content: string; insight?: BrainInsight }> {
  switch (name) {
    case "save_insight": {
      const insight = await appendInsight({
        type: input.type,
        date: new Date().toISOString().split("T")[0],
        reason: input.reason,
        active: true,
        dimension: input.dimension,
        filter: input.filter,
        modifier: input.modifier,
        target: input.target,
        instruction: input.instruction,
        action: input.action,
        scope: input.scope,
        value: input.value,
        geography: input.geography,
      });
      return {
        content: JSON.stringify({ saved: true, insight }),
        insight,
      };
    }
    case "read_brain": {
      const brain = await loadBrain();
      let insights = brain.insights.filter((i) => i.active);
      if (input.type_filter) {
        insights = insights.filter((i) => i.type === input.type_filter);
      }
      return {
        content: JSON.stringify({
          total: insights.length,
          insights,
          lastUpdated: brain.lastUpdated,
        }),
      };
    }
    case "delete_insight": {
      const deleted = await deleteInsight(input.id);
      return {
        content: JSON.stringify({ deleted, id: input.id }),
      };
    }
    case "query_granola": {
      const cache = await readJSON(GRANOLA_CACHE_FILE);
      const analyses = cache?.analyses || [];
      if (analyses.length === 0) {
        return { content: JSON.stringify({ message: "No call data available yet. Kyle needs to paste call transcripts into the Granola analysis endpoint first.", analyses: [] }) };
      }

      // Build summary stats
      const total = analyses.length;
      const outcomes: Record<string, number> = {};
      const angleMap: Record<string, number> = {};
      const objectionMap: Record<string, number> = {};
      for (const a of analyses) {
        outcomes[a.outcome] = (outcomes[a.outcome] || 0) + 1;
        if (a.angleWorked) angleMap[a.angleWorked] = (angleMap[a.angleWorked] || 0) + 1;
        if (a.objectionUsed) objectionMap[a.objectionUsed] = (objectionMap[a.objectionUsed] || 0) + 1;
      }

      const topAngles = Object.entries(angleMap).sort(([, a], [, b]) => b - a).slice(0, 5);
      const topObjections = Object.entries(objectionMap).sort(([, a], [, b]) => b - a).slice(0, 5);
      const positiveRate = total > 0
        ? Math.round(((outcomes.positive || 0) + (outcomes.meeting_booked || 0)) / total * 100)
        : 0;

      return {
        content: JSON.stringify({
          totalCalls: total,
          outcomes,
          positiveRate: `${positiveRate}%`,
          topWinningAngles: topAngles,
          topObjections,
          recentCalls: analyses.slice(-10).map((a: any) => ({
            contact: a.contactName,
            company: a.company,
            outcome: a.outcome,
            angleWorked: a.angleWorked,
            objection: a.objectionUsed,
            coachingNote: a.coachingNote,
          })),
        }),
      };
    }
    default:
      return { content: JSON.stringify({ error: `Unknown tool: ${name}` }) };
  }
}

// ── Brain summary for system prompt ─────────────────────────────

function formatBrainSummary(insights: BrainInsight[]): string {
  const active = insights.filter((i) => i.active);
  if (active.length === 0) return "";

  const lines: string[] = [];
  const scoring = active.filter((i) => i.type === "adjust_scoring");
  const scripts = active.filter((i) => i.type === "adjust_script");
  const rules = active.filter((i) => i.type === "exclude_or_prioritize");

  if (scoring.length > 0) {
    lines.push("**Scoring Modifiers:**");
    for (const s of scoring) {
      const filterStr = s.filter ? Object.entries(s.filter).map(([k, v]) => `${k}=${v}`).join(", ") : "all";
      lines.push(`- [${s.id}] ${s.dimension} ${s.modifier! > 0 ? "+" : ""}${s.modifier} when ${filterStr} — "${s.reason}"`);
    }
  }
  if (scripts.length > 0) {
    lines.push("**Script Adjustments:**");
    for (const s of scripts) {
      lines.push(`- [${s.id}] ${s.target}: "${s.instruction}" — "${s.reason}"`);
    }
  }
  if (rules.length > 0) {
    lines.push("**Exclusions & Priorities:**");
    for (const r of rules) {
      lines.push(`- [${r.id}] ${r.action} ${r.scope}="${r.value}"${r.geography ? ` in ${r.geography}` : ""} — "${r.reason}"`);
    }
  }

  return lines.join("\n");
}

// ── Claude API call (streaming) ─────────────────────────────────

async function callClaudeStreaming(
  apiKey: string,
  system: string,
  messages: any[],
  tools: any[],
): Promise<Response> {
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
      stream: true,
      system,
      messages,
      tools,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API failed: ${res.status} ${err}`);
  }
  return res;
}

// ── SSE helper ──────────────────────────────────────────────────

function sseEncode(event: string, data: any): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Main handler ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { messages, context, mode } = body;

    // ─── QUICK MODE (default — backward compatible) ───────────
    if (mode !== "chat") {
      const claudeMessages = messages.map((m: any, i: number) => {
        if (i === 0 && m.role === "user" && context) {
          return { role: m.role, content: `[Context: ${context}]\n\n${m.content}` };
        }
        return { role: m.role, content: m.content };
      });

      const res = await callClaudeStreaming(apiKey, QUICK_SYSTEM, claudeMessages, [
        { type: "web_search_20250305", name: "web_search" },
      ]);

      const stream = new ReadableStream({
        async start(controller) {
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6).trim();
                  if (data === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                      controller.enqueue(new TextEncoder().encode(parsed.delta.text));
                    }
                  } catch {}
                }
              }
            }
            if (buffer.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(buffer.slice(6).trim());
                if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                  controller.enqueue(new TextEncoder().encode(parsed.delta.text));
                }
              } catch {}
            }
          } catch {
            controller.enqueue(new TextEncoder().encode("\n\n[Error: Connection interrupted]"));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // ─── CHAT MODE ────────────────────────────────────────────
    // Load brain and call data for system prompt
    const brain = await loadBrain();
    const brainSummary = formatBrainSummary(brain.insights);

    // Load cached granola stats for system prompt
    const granolaCache = await readJSON(GRANOLA_CACHE_FILE);
    const analyses = granolaCache?.analyses || [];
    const callStats = analyses.length > 0
      ? `${analyses.length} calls analysed. Positive rate: ${Math.round(((analyses.filter((a: any) => a.outcome === "positive" || a.outcome === "meeting_booked").length) / analyses.length) * 100)}%. Recent outcomes: ${analyses.slice(-5).map((a: any) => `${a.contactName || "Unknown"} @ ${a.company || "?"}: ${a.outcome}`).join("; ")}`
      : "";

    const chatSystem = buildChatSystem(brainSummary, callStats);

    // Load conversation history and merge with current messages
    const history = await loadChatHistory();
    const recentHistory = history.slice(-20);

    const historyMessages = recentHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const currentUserMessage = messages[messages.length - 1]?.content || "";

    const allMessages = [
      ...historyMessages,
      ...messages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // Streaming chat with tool handling
    const stream = new ReadableStream({
      async start(controller) {
        const savedInsights: BrainInsight[] = [];
        let fullResponseText = "";

        try {
          let conversationMessages = [...allMessages];
          let rounds = 0;
          const MAX_ROUNDS = 5;

          while (rounds < MAX_ROUNDS) {
            rounds++;

            // Make a STREAMING call to Claude
            const claudeRes = await callClaudeStreaming(
              apiKey, chatSystem, conversationMessages, CHAT_TOOLS,
            );

            // Parse the stream: forward text deltas, accumulate tool_use blocks
            const reader = claudeRes.body!.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = "";
            let stopReason = "";
            let roundText = "";

            // Track content blocks for tool_use
            const contentBlocks: any[] = [];
            let currentBlockIndex = -1;
            let currentBlockType = "";
            let currentToolId = "";
            let currentToolName = "";
            let toolInputJson = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              sseBuffer += decoder.decode(value, { stream: true });
              const lines = sseBuffer.split("\n");
              sseBuffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6).trim();
                if (raw === "[DONE]") continue;

                let event: any;
                try { event = JSON.parse(raw); } catch { continue; }

                switch (event.type) {
                  case "content_block_start": {
                    currentBlockIndex = event.index;
                    const block = event.content_block;
                    currentBlockType = block.type;
                    if (block.type === "tool_use") {
                      currentToolId = block.id;
                      currentToolName = block.name;
                      toolInputJson = "";
                    }
                    break;
                  }
                  case "content_block_delta": {
                    if (event.delta?.type === "text_delta" && currentBlockType === "text") {
                      // Stream text to client immediately
                      const text = event.delta.text;
                      roundText += text;
                      controller.enqueue(sseEncode("text", { text }));
                    } else if (event.delta?.type === "input_json_delta") {
                      toolInputJson += event.delta.partial_json;
                    }
                    break;
                  }
                  case "content_block_stop": {
                    if (currentBlockType === "text" && roundText) {
                      contentBlocks.push({ type: "text", text: roundText });
                    } else if (currentBlockType === "tool_use") {
                      let parsedInput = {};
                      try { parsedInput = JSON.parse(toolInputJson); } catch {}
                      contentBlocks.push({
                        type: "tool_use",
                        id: currentToolId,
                        name: currentToolName,
                        input: parsedInput,
                      });
                    }
                    currentBlockType = "";
                    break;
                  }
                  case "message_delta": {
                    if (event.delta?.stop_reason) {
                      stopReason = event.delta.stop_reason;
                    }
                    break;
                  }
                }
              }
            }

            fullResponseText += roundText;

            // If stop_reason is tool_use, execute tools and loop
            const toolCalls = contentBlocks.filter((b) => b.type === "tool_use");

            if (stopReason === "tool_use" && toolCalls.length > 0) {
              const toolResults: any[] = [];
              for (const tc of toolCalls) {
                if (tc.name === "web_search") continue;

                controller.enqueue(sseEncode("tool_status", { tool: tc.name, status: "running" }));
                const result = await executeTool(tc.name, tc.input);
                toolResults.push({ id: tc.id, content: result.content });

                if (result.insight) {
                  savedInsights.push(result.insight);
                  controller.enqueue(sseEncode("insight", result.insight));
                }
              }

              // Add assistant turn + tool results for next round
              conversationMessages.push({ role: "assistant", content: contentBlocks });
              for (const tr of toolResults) {
                conversationMessages.push({
                  role: "user",
                  content: [{ type: "tool_result", tool_use_id: tr.id, content: tr.content }],
                });
              }
              // Reset for next round — text from this round was already streamed
              continue;
            }

            // end_turn — we're done
            break;
          }

          // Save chat history
          const now = new Date().toISOString();
          const newMessages: ChatMessage[] = [
            ...history,
            { role: "user", content: currentUserMessage, timestamp: now, insightExtracted: null },
            { role: "assistant", content: fullResponseText, timestamp: now, insightExtracted: savedInsights.length > 0 ? savedInsights[0] : null },
          ];
          await saveChatHistory(newMessages);

          controller.enqueue(sseEncode("done", { insightsCount: savedInsights.length }));
        } catch (err: any) {
          controller.enqueue(sseEncode("error", { message: err.message || "Chat failed" }));
        } finally {
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
