import { NextRequest, NextResponse } from "next/server";
import { STATUSES_FILE, readJSON, writeJSON, updateContactStatus } from "@/lib/data";
import type { DealStatus } from "@/lib/types";
import path from "path";
import { promises as fs } from "fs";

const VALID_STATUSES: DealStatus[] = ["new", "called", "negative", "callback_later", "they_callback", "gatekeeper", "follow_up_email", "imported", "existing_hubspot", "deleted"];

const DEAD_COMPANIES_KEY = "dead_companies.json";
const DEAD_COMPANIES_SEED = path.join(process.cwd(), "public", "memory", "dead_companies.json");

// POST /api/status — update a deal's status
export async function POST(req: NextRequest) {
  try {
    const { deal, status, notes } = await req.json();

    if (!deal || !status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Requires deal object and valid status (${VALID_STATUSES.join(", ")})` },
        { status: 400 }
      );
    }

    const statuses = (await readJSON(STATUSES_FILE)) || {};
    const key = `${deal.name}__${deal.company}`;

    statuses[key] = {
      status,
      updatedAt: new Date().toISOString(),
      name: deal.name,
      company: deal.company,
      title: deal.title,
      email: deal.email,
      phone: deal.phone,
      linkedin: deal.linkedin,
      domain: deal.domain,
      city: deal.city,
      country: deal.country,
      specialisation: deal.specialisation,
      apolloId: deal.apolloId,
      notes: notes || null,
    };

    await writeJSON(STATUSES_FILE, statuses);

    // Sync status change to persistent contacts collection
    let contactsVerified = false;
    try {
      await updateContactStatus(key, status, notes || null);
      contactsVerified = true;
    } catch {}

    // Verify the status write persisted
    let verified = false;
    try {
      const check = await readJSON(STATUSES_FILE);
      verified = !!(check && check[key] && check[key].status === status);
    } catch {}

    // When a contact is flagged as already in HubSpot, add to dead_companies
    if (status === "existing_hubspot" && (deal.domain || deal.company)) {
      try {
        // Load dead companies (from blob/local, seed from public/memory/ on first access)
        let deadData = await readJSON(DEAD_COMPANIES_KEY);
        if (!deadData) {
          try {
            const raw = await fs.readFile(DEAD_COMPANIES_SEED, "utf-8");
            deadData = JSON.parse(raw);
          } catch {
            deadData = {};
          }
        }
        if (!deadData.doNotCall) deadData.doNotCall = [];

        const identifier = (deal.domain || deal.company || "").toLowerCase();
        const alreadyListed = deadData.doNotCall.some(
          (c: any) => (c.domain || c.company || "").toLowerCase() === identifier
        );

        if (!alreadyListed) {
          deadData.doNotCall.push({
            company: deal.company || null,
            domain: deal.domain || null,
            apolloId: deal.apolloId || null,
            date: new Date().toISOString().split("T")[0],
            reason: "Already in HubSpot — flagged via Deals Machine",
          });
          deadData.lastUpdated = new Date().toISOString().split("T")[0];
          await writeJSON(DEAD_COMPANIES_KEY, deadData);
        }
      } catch {}
    }

    return NextResponse.json({ success: true, status, key, verified, contactsVerified });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

const STATUSES_SEED_FILE = path.join(process.cwd(), "public", "memory", "statuses-seed.json");

// GET /api/status — return all statuses (seeds from static file on first access)
export async function GET() {
  let statuses = await readJSON(STATUSES_FILE);

  if (!statuses || Object.keys(statuses).length === 0) {
    try {
      const raw = await fs.readFile(STATUSES_SEED_FILE, "utf-8");
      const seed = JSON.parse(raw);
      if (seed && typeof seed === "object") {
        const { _note, _seededAt, ...contactEntries } = seed;
        statuses = contactEntries;
        await writeJSON(STATUSES_FILE, statuses);
      }
    } catch {}
  }

  return NextResponse.json({ statuses: statuses || {} });
}
