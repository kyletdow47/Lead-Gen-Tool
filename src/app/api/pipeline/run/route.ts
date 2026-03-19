// POST /api/pipeline/run — Fast daily pipeline: pull 25 from lead pool, dedup, serve
// v3: Uses lead pool (no Apollo search during run), no Claude calls, completes in <30s
//
// Flow:
// 1. Load memory (dead companies, existing contacts)
// 2. Check lead pool (if <50 uncalled, repopulate via /api/source-leads)
// 3. Score & rank pool leads
// 4. Dedup against HubSpot + contacts.json + one-per-company
// 5. Select daily 25
// 6. Generate opening lines (templates, no Claude)
// 7. Save to latest.json + contacts.json + run history

import { NextRequest } from "next/server";
import {
  writeJSON, readJSON, LATEST_FILE,
  loadContacts, upsertContact, getContactKeys, saveRun,
  loadLeadPool, saveLeadPool, loadHubSpotCache, loadBrain,
} from "@/lib/data";
import { scoreBatch, generateOpeningLine } from "@/lib/scoring";
import type { Contact, LeadPoolEntry, BrainInsight } from "@/lib/types";
import path from "path";

export const maxDuration = 300;

const EXCLUDED_COMPANIES = [
  "dhl", "kuehne", "nagel", "dsv", "schenker", "ceva", "geodis", "rhenus",
  "hellmann", "bollore", "dachser", "senator", "expeditors", "robinson",
  "ups supply", "fedex", "nippon express", "kintetsu", "yusen", "agility",
  "kerry logistics", "chapman freeborn", "air partner", "air charter service",
  "maersk", "msc ", "hapag", "cma cgm", "pml seafrigo",
];

export async function POST(request: NextRequest) {
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

      try {
        const today = new Date().toISOString().split("T")[0];

        // ── Phase 1: Load memory ───────────────────────────────
        phaseStart(1, "Memory", "Loading exclusions and contact history...");

        const deadCompanies: string[] = [...EXCLUDED_COMPANIES];
        try {
          const { promises: fs } = await import("fs");
          const seedPath = path.join(process.cwd(), "public", "memory", "dead_companies.json");
          const raw = await fs.readFile(seedPath, "utf-8");
          const dead = JSON.parse(raw);
          for (const c of dead.doNotCall || []) {
            const id = (c.domain || c.company || "").toLowerCase();
            if (id) deadCompanies.push(id);
          }
        } catch {}

        // Load existing contacts for dedup
        const existingContactKeys = await getContactKeys();
        const existingContacts = await loadContacts();
        const existingCompanies = new Set<string>();
        for (const c of Object.values(existingContacts)) {
          if (c.company) existingCompanies.add(c.company.toLowerCase());
        }

        // Load brain insights
        const brain = await loadBrain();
        const brainModifiers = brain.insights.filter((i: BrainInsight) => i.active && i.type === "adjust_scoring");
        const brainExclusions = brain.insights.filter((i: BrainInsight) => i.active && i.type === "exclude_or_prioritize" && i.action === "exclude");
        const brainPriorities = brain.insights.filter((i: BrainInsight) => i.active && i.type === "exclude_or_prioritize" && i.action === "prioritize");

        // Apply brain exclusions to dead companies list
        for (const excl of brainExclusions) {
          if (excl.scope === "company" && excl.value) {
            deadCompanies.push(excl.value.toLowerCase());
          }
        }

        phaseDone(1, "Memory", `${deadCompanies.length} exclusions, ${existingContactKeys.size} existing contacts, ${brainModifiers.length} brain modifiers`);

        // ── Phase 2: Check lead pool ───────────────────────────
        phaseStart(2, "Lead Pool", "Checking lead pool...");

        let pool = await loadLeadPool();
        const uncalled = pool.filter((p) => p.status === "pool");

        if (uncalled.length < 30) {
          // Pool is low — need to repopulate
          send("phase", { phase: 2, name: "Lead Pool", status: "running", message: `Only ${uncalled.length} uncalled leads in pool. Searching Apollo for more...` });

          // Call the source-leads endpoint internally
          const apolloKey = process.env.APOLLO_API_KEY;
          if (apolloKey) {
            try {
              const baseUrl = request.nextUrl.origin || "http://localhost:3000";
              const sourceRes = await fetch(`${baseUrl}/api/source-leads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              });
              if (sourceRes.ok) {
                const result = await sourceRes.json();
                pool = await loadLeadPool(); // reload
                send("phase", { phase: 2, name: "Lead Pool", status: "running", message: `Apollo search complete: ${result.poolSize} leads in pool` });
              }
            } catch {}
          }
        }

        const availablePool = pool.filter((p) => p.status === "pool");
        phaseDone(2, "Lead Pool", `${availablePool.length} uncalled leads available in pool`);

        // ── Phase 3: Dedup against contacts + HubSpot ──────────
        phaseStart(3, "Dedup", "Removing already-contacted and HubSpot duplicates...");

        // Remove leads from companies already in contacts
        let candidates = availablePool.filter((p) => {
          const companyLower = p.company.toLowerCase();
          return !existingCompanies.has(companyLower);
        });

        // Remove dead companies
        candidates = candidates.filter((p) => {
          const companyLower = p.company.toLowerCase();
          return !deadCompanies.some((dc) => companyLower.includes(dc));
        });

        // Check against HubSpot cache (if available)
        const hsCache = await loadHubSpotCache();
        if (hsCache?.contacts) {
          candidates = candidates.filter((p) => {
            const companyLower = p.company.toLowerCase();
            return !hsCache.contacts.some((c) =>
              c.company && c.company.toLowerCase().includes(companyLower)
            );
          });
        }

        // Apply brain vertical/country exclusions
        for (const excl of brainExclusions) {
          if (excl.scope === "vertical" && excl.value) {
            const val = excl.value.toLowerCase();
            const geo = excl.geography?.toLowerCase();
            candidates = candidates.filter((p) => {
              const matchesVertical = p.verticalLabel.toLowerCase().includes(val);
              const matchesGeo = !geo || p.country.toLowerCase().includes(geo);
              return !(matchesVertical && matchesGeo);
            });
          }
          if (excl.scope === "country" && excl.value) {
            const val = excl.value.toLowerCase();
            candidates = candidates.filter((p) => !p.country.toLowerCase().includes(val));
          }
        }

        phaseDone(3, "Dedup", `${candidates.length} leads after dedup (${availablePool.length - candidates.length} removed)`);

        // ── Phase 4: Select daily 25 ───────────────────────────
        phaseStart(4, "Daily Selection", "Picking top 25 leads by score...");

        // Apply brain scoring modifiers to lead pool scores
        if (brainModifiers.length > 0) {
          const { applyBrainModifiers } = await import("@/lib/scoring");
          for (const c of candidates) {
            const adjusted = applyBrainModifiers(
              { crisisProximity: 0, companyFit: 0, roleAuthority: 0, verticalMatch: 0, signalStrength: 0, contactQuality: 0 },
              { country: c.country, city: c.city, vertical: c.verticalLabel, company: c.company },
              brainModifiers,
            );
            // Sum modifiers and add to existing score (modifiers are additive)
            const bonus = Object.values(adjusted).reduce((sum, v) => sum + v, 0);
            c.score = c.score + bonus;
          }
        }

        // Apply brain priorities — boost matching leads to top
        for (const prio of brainPriorities) {
          if (prio.scope === "country" && prio.value) {
            const val = prio.value.toLowerCase();
            for (const c of candidates) {
              if (c.country.toLowerCase().includes(val)) c.score += 10;
            }
          }
          if (prio.scope === "vertical" && prio.value) {
            const val = prio.value.toLowerCase();
            for (const c of candidates) {
              if (c.verticalLabel.toLowerCase().includes(val)) c.score += 10;
            }
          }
        }

        // Sort by score descending
        candidates.sort((a, b) => b.score - a.score);

        // Split Kyle and Gus — aim for balanced lists
        const kylePool = candidates.filter((p) => p.assignedTo === "kyle");
        const gusPool = candidates.filter((p) => p.assignedTo === "gus" || p.assignedTo === "shared");

        // Take up to 13 from each (to get at least 25 total), balance later
        const kyleDeals = kylePool.slice(0, 13);
        const gusDeals = gusPool.slice(0, 13);

        // If one side is short, fill from the other
        const totalNeeded = 25;
        let combined = [...kyleDeals, ...gusDeals];
        if (combined.length < totalNeeded) {
          // Add more from whichever pool has remaining
          const used = new Set(combined.map((c) => c.apolloId));
          const remaining = candidates.filter((c) => !used.has(c.apolloId));
          combined.push(...remaining.slice(0, totalNeeded - combined.length));
        }

        const daily25 = combined.slice(0, totalNeeded);

        // Mark selected leads as "today" in the pool
        const selectedIds = new Set(daily25.map((d) => d.apolloId));
        pool = pool.map((p) =>
          selectedIds.has(p.apolloId) ? { ...p, status: "today" as const } : p
        );
        await saveLeadPool(pool);

        const kyleCount = daily25.filter((d) => d.assignedTo === "kyle").length;
        const gusCount = daily25.filter((d) => d.assignedTo === "gus" || d.assignedTo === "shared").length;

        phaseDone(4, "Daily Selection", `${daily25.length} deals selected: Kyle ${kyleCount}, Gus ${gusCount}`);

        // ── Phase 5: Build output ──────────────────────────────
        phaseStart(5, "Building Output", "Generating deal cards...");

        const deals = daily25.map((entry, i) => {
          const name = [entry.firstName, entry.lastName].filter(Boolean).join(" ");
          const org = { name: entry.company, phone: null as string | null };

          return {
            rank: i + 1,
            name,
            title: entry.title,
            company: entry.company,
            city: entry.city,
            country: entry.country,
            phone: null as string | null, // user finds from website
            email: null as string | null,
            linkedin: entry.linkedinUrl,
            domain: entry.domain,
            employees: entry.employees ? String(entry.employees) : null,
            specialisation: entry.verticalLabel,
            priority: entry.tier,
            assignedTo: entry.assignedTo,
            crisisAngle: `${entry.verticalLabel} specialist in ${entry.country}`,
            whyToday: `${entry.title} at ${entry.company} (${entry.city}, ${entry.country}) — ${entry.verticalLabel}`,
            openingLine: entry.openingLine,
            callScript: null,
            coldEmail: null,
            emailSubject: null,
            leadDifferentiator: entry.assignedTo === "kyle" ? "All 9 DG classes + aircraft specs" : "17 years experience + forwarder-exclusive",
            differentiatorDetail: "",
            objection: "We don't use charters — Most forwarders only need us 3-5 times a year, for the situations scheduled can't handle.",
            followUpTrigger: "Market disruption or capacity crunch",
            enrichmentStatus: "from lead pool",
            apolloId: entry.apolloId,
            source: "Lead pool",
            score: entry.score,
          };
        });

        // Load market data from cache (if available)
        const { MARKET_CACHE_FILE } = await import("@/lib/data");
        const marketSnapshot = (await readJSON(MARKET_CACHE_FILE)) || {
          brent: "Check oilprice.com",
          ttfGas: "Check trading economics",
          hormuzStatus: "Check latest news",
          topTalkingPoint: "Air cargo capacity is tight — charter alternatives are in demand.",
        };

        const outputData = {
          date: today,
          marketSnapshot,
          scriptIntelligence: {
            callsAnalysed: 0,
            topOpener: "Kyle from FlyFX — air charter specialist. [Crisis hook]. We work exclusively with freight forwarders.",
            commonObjection: "We don't use charters — Most forwarders only need us 3-5 times a year.",
            scriptChanges: `Pipeline v3 run ${today} — from lead pool, ${daily25.length} deals`,
          },
          deals,
        };

        // Save to latest.json
        await writeJSON(LATEST_FILE, outputData);

        // Save to run history
        await saveRun(today, outputData);

        // Upsert each deal into contacts collection
        for (const deal of deals) {
          const contact: Contact = {
            id: `${deal.name}__${deal.company}`,
            name: deal.name,
            title: deal.title,
            company: deal.company,
            city: deal.city,
            country: deal.country,
            phone: deal.phone,
            domain: deal.domain,
            linkedin: deal.linkedin,
            email: deal.email,
            source: `pipeline-${today}`,
            dateAdded: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            status: "new",
            tags: [deal.specialisation || "Air Freight"],
            notes: null,
            assignedTo: deal.assignedTo,
            score: deal.score || null,
            specialisation: deal.specialisation,
            apolloId: deal.apolloId,
            employees: deal.employees,
            priority: deal.priority,
            hubspot_id: null,
            disqualify_reason: null,
          };
          await upsertContact(contact);
        }

        // Also update public/data.json as fallback
        try {
          const { promises: fsPromises } = await import("fs");
          const publicPath = path.join(process.cwd(), "public", "data.json");
          await fsPromises.writeFile(publicPath, JSON.stringify(outputData, null, 2));
        } catch {}

        phaseDone(5, "Building Output", `${deals.length} deals saved`);

        send("complete", {
          success: true,
          deals: deals.length,
          date: today,
          hot: deals.filter((d) => d.priority === "hot").length,
          warm: deals.filter((d) => d.priority === "warm").length,
          kyle: deals.filter((d) => d.assignedTo === "kyle").length,
          gus: deals.filter((d) => d.assignedTo === "gus" || d.assignedTo === "shared").length,
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
