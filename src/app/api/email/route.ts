import { NextRequest, NextResponse } from "next/server";

const CLAUDE_API = "https://api.anthropic.com/v1/messages";

// POST /api/email — generate a personalised follow-up email for a deal
export async function POST(req: NextRequest) {
  try {
    const { deal, transcript, directEmail } = await req.json();
    if (!deal) return NextResponse.json({ error: "Missing deal" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

    const hasTranscript = transcript && transcript.trim().length > 50;

    const prompt = `You are Kyle Dow from FlyFXFreight — an air cargo charter specialist.

Write a short, professional follow-up email to ${deal.name} (${deal.title} at ${deal.company}, ${deal.city}, ${deal.country}).

Context:
- We just spoke on the phone.
- FlyFX works exclusively with freight forwarders, never directly with shippers.
- We handle all 9 UN dangerous goods classes (incl. Class 1 and 7 — most brokers won't).
- We're ACA accredited with access to thousands of operators globally.
- Tone: expert, direct, peer-to-peer. No hype. No emojis. Oxford comma.
- Banned words: amazing, awesome, incredible, seamless, cutting-edge, game-changer, best-in-class, leverage, passionate, unique.

${hasTranscript ? `Call transcript notes:\n${transcript}\n\nPersonalise the email using specifics from the call above.` : `No transcript available. Use the following deal context:\n- Why today: ${deal.whyToday || ""}\n- Lead differentiator: ${deal.leadDifferentiator || ""}\n- Differentiator detail: ${deal.differentiatorDetail || ""}\n- Likely objection discussed: ${deal.objection || ""}\n- Follow-up trigger: ${deal.followUpTrigger || ""}`}

Produce JSON with exactly two fields:
- "subject": email subject line (concise, relevant, no clickbait)
- "body": email body (plain text, no HTML, 3-5 short paragraphs)

The body should:
1. Reference the call briefly ("Good speaking with you earlier")
2. Remind them of the one differentiator most relevant to their needs
3. Attach a note that we're sending our brochure/capability deck alongside
4. Clear, low-pressure next step
5. Sign off as Kyle from FlyFXFreight with: kdow@fly-fx.com | +44 203 576 56 34 | fly-fx.com

Return ONLY valid JSON, no markdown.`;

    const response = await fetch(CLAUDE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 });
    }

    const json = await response.json();
    const raw = json.content?.[0]?.text || "";

    let parsed: { subject: string; body: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try to extract JSON from the response
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        return NextResponse.json({ error: "Failed to parse email from Claude" }, { status: 500 });
      }
    }

    // Use directEmail if provided (prospect gave their personal email on the call)
    const toEmail = directEmail?.trim() || deal.email || "";

    return NextResponse.json({
      subject: parsed.subject,
      body: parsed.body,
      toEmail,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
