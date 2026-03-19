// GET  /api/memory — return dead companies + winning angles
// POST /api/memory — update memory (add DNC entry, log call outcome)

import { NextRequest, NextResponse } from "next/server";
import { readJSON, writeJSON, DATA_DIR } from "@/lib/data";
import path from "path";
import { promises as fs } from "fs";

const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
const PUBLIC_DEAD = path.join(process.cwd(), "public", "memory", "dead_companies.json");
const PUBLIC_ANGLES = path.join(process.cwd(), "public", "memory", "winning_angles.json");
const MEMORY_SEED_FILE = path.join(process.cwd(), "public", "memory", "memory-seed.json");

async function loadMemory() {
  // Load static public memory (bundled, survives cold starts)
  let [deadStatic, anglesStatic, overrides] = await Promise.all([
    readJSON(PUBLIC_DEAD),
    readJSON(PUBLIC_ANGLES),
    readJSON(MEMORY_FILE),
  ]);

  // Seed runtime memory from static file on first access (cold start)
  if (!overrides || (!overrides.callOutcomes?.length && !overrides.doNotCall?.length)) {
    try {
      const seed = await readJSON(MEMORY_SEED_FILE);
      if (seed && (seed.callOutcomes?.length || seed.doNotCall?.length)) {
        const { _note, _seededAt, ...seedData } = seed;
        overrides = { ...seedData };
        await writeJSON(MEMORY_FILE, overrides);
      }
    } catch {}
  }

  const dead = deadStatic || { doNotCall: [], deadVerticals: [], suspectedDead: [] };
  const angles = anglesStatic || { workingAngles: [], failingAngles: [] };

  // Merge runtime overrides (from /tmp/ or local data/)
  if (overrides?.doNotCall) {
    dead.doNotCall = [...dead.doNotCall, ...overrides.doNotCall];
  }
  if (overrides?.callOutcomes) {
    // Deduplicate DNC entries
    const dncKeys = new Set(dead.doNotCall.map((c: any) => c.domain || c.company));
    for (const outcome of overrides.callOutcomes) {
      if (outcome.outcome === "dead_vertical" && !dncKeys.has(outcome.company)) {
        dead.doNotCall.push({
          company: outcome.company,
          contactTried: outcome.contactName,
          date: outcome.date,
          reason: outcome.notes || "Dead vertical — rude or irrelevant",
          addedBy: outcome.addedBy || "App",
        });
      }
    }
  }

  return { dead, angles, overrides: overrides || {} };
}

export async function GET() {
  try {
    const memory = await loadMemory();
    return NextResponse.json({ memory });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    const overrides = (await readJSON(MEMORY_FILE)) || {
      doNotCall: [],
      callOutcomes: [],
    };

    if (action === "add_dnc") {
      // Add a company to the Do Not Call list
      const { company, domain, contactName, reason, addedBy } = body;
      if (!company) return NextResponse.json({ error: "company required" }, { status: 400 });

      overrides.doNotCall = overrides.doNotCall || [];
      overrides.doNotCall.push({
        company,
        domain: domain || null,
        contactTried: contactName || null,
        date: new Date().toISOString().split("T")[0],
        reason: reason || "Added via app",
        addedBy: addedBy || "App",
      });

      await writeJSON(MEMORY_FILE, overrides);

      // Also update the markdown file (local dev only — silently skips on Vercel)
      try {
        const mdPath = path.join(
          process.cwd(),
          "..",
          "output",
          "memory",
          "dead_verticals.md"
        );
        const existing = await fs.readFile(mdPath, "utf-8");
        const newRow = `| ${company} | ${contactName || "—"} | ${new Date().toISOString().split("T")[0]} | ${reason || "Added via app"} | App |\n`;
        const updated = existing.replace(
          "---\n\n## REMOVED FROM DEAD LIST",
          newRow + "\n---\n\n## REMOVED FROM DEAD LIST"
        );
        await fs.writeFile(mdPath, updated);
      } catch {
        // Not on local dev or file not found — skip
      }

      return NextResponse.json({ success: true, action: "add_dnc" });
    }

    if (action === "log_outcome") {
      // Log a call outcome (positive, neutral, rejection, dead_vertical)
      const { contactName, company, outcome, notes, angle, addedBy } = body;
      if (!contactName || !company || !outcome) {
        return NextResponse.json(
          { error: "contactName, company, and outcome required" },
          { status: 400 }
        );
      }

      overrides.callOutcomes = overrides.callOutcomes || [];
      overrides.callOutcomes.push({
        contactName,
        company,
        outcome, // "positive" | "meeting_booked" | "neutral" | "rejection" | "dead_vertical"
        notes: notes || null,
        angle: angle || null,
        date: new Date().toISOString().split("T")[0],
        addedBy: addedBy || "App",
      });

      await writeJSON(MEMORY_FILE, overrides);
      return NextResponse.json({ success: true, action: "log_outcome", outcome });
    }

    if (action === "get_dnc_list") {
      const memory = await loadMemory();
      return NextResponse.json({
        dnc: memory.dead.doNotCall,
        domains: memory.dead.doNotCall
          .filter((c: any) => c.domain)
          .map((c: any) => c.domain.toLowerCase()),
        companies: memory.dead.doNotCall.map((c: any) =>
          (c.company || "").toLowerCase()
        ),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
