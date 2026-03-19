// ICP Scoring Model v5.0 — Aligned with Lead Gen Engine spec
// 6 dimensions, 100 points max
// Kyle territory (verticalScore >= 11): Energy, DG, Project Cargo, Defence
// Gus territory  (verticalScore <= 10): Pharma, Perishables, Automotive, General

export interface ScoreBreakdown {
  crisisProximity: number;  // 0-20
  companyFit: number;       // 0-20
  roleAuthority: number;    // 0-20
  verticalMatch: number;    // 0-15
  signalStrength: number;   // 0-10
  contactQuality: number;   // 0-15
  total: number;
  tier: "hot" | "warm" | "nurture";
  assignedTo: "kyle" | "gus" | "shared";
  verticalLabel: string;
}

// ── Geography tiers for Crisis Proximity ────────────────────
const CRISIS_TIER1 = ["germany", "belgium", "netherlands", "france"]; // 16-20
const CRISIS_TIER2 = ["united kingdom", "spain", "italy", "switzerland"]; // 14-16
const CRISIS_TIER3 = ["denmark", "sweden", "norway", "finland", "poland", "austria", "ireland", "portugal", "czech republic", "turkey", "romania", "hungary"]; // 10-14

const TIER1_HUBS = [
  "aberdeen", "stavanger", "rotterdam", "hamburg", "amsterdam",
  "london", "frankfurt", "antwerp",
];
const TIER2_HUBS = [
  "oslo", "copenhagen", "brussels", "paris", "milan", "madrid",
  "lisbon", "edinburgh", "munich", "düsseldorf", "dusseldorf",
];

// ── Dimension 4: Vertical Match (0-15) ─────────────────────
export function getVerticalScore(
  industry: string | undefined,
  tags: string[] = []
): { score: number; label: string } {
  const combined = [industry || "", ...tags].join(" ").toLowerCase();

  if (/energy|oil\b|gas\b|petroleum|offshore|upstream|downstream|lng/.test(combined))
    return { score: 15, label: "Energy / Oil & Gas" };
  if (/dangerous.goods|dg\b|hazmat|hazardous|class [1-9]/.test(combined))
    return { score: 13, label: "Dangerous Goods" };
  if (/project.cargo|heavy.lift|oversized|oog\b/.test(combined))
    return { score: 12, label: "Project Cargo" };
  if (/defen|aerospace|military|government|defence/.test(combined))
    return { score: 11, label: "Defence / Aerospace" };
  if (/pharma|pharmaceutical|clinical|biologic|gdp/.test(combined))
    return { score: 10, label: "Pharma" };
  if (/cold.chain|temperature.control|perishable/.test(combined))
    return { score: 9, label: "Cold Chain / Perishables" };
  if (/food|fresh|seafood|meat|produce/.test(combined))
    return { score: 8, label: "Food / Perishables" };
  if (/automotive|auto\b|aog\b|aircraft.on.ground|marine|ship.spare/.test(combined))
    return { score: 7, label: "Automotive / AOG" };
  if (/e.?commerce|consumer.goods|retail\b/.test(combined))
    return { score: 5, label: "E-commerce" };

  return { score: 7, label: "General Air Freight" };
}

// ── Dimension 1: Crisis Proximity (0-20) ────────────────────
function getCrisisProximityScore(person: any): number {
  const country = (person.country || person.organization?.country || "").toLowerCase();

  // Direct Gulf exposure countries
  if (CRISIS_TIER1.some((c) => country.includes(c))) {
    // Germany/Belgium/Netherlands get 18-20, France gets 16-18
    if (country.includes("france")) return 17;
    return 19;
  }
  if (CRISIS_TIER2.some((c) => country.includes(c))) return 15;
  if (CRISIS_TIER3.some((c) => country.includes(c))) return 12;

  return 10; // unknown country
}

// ── Dimension 2: Company Fit (0-20) ─────────────────────────
function getCompanyFitScore(person: any): number {
  let score = 0;
  const employees =
    person.organization?.estimated_num_employees ||
    parseInt(person.employees || "0", 10);
  const orgName = (person.organization?.name || person.company || "").toLowerCase();

  // Size (0-8): spec says 20-200 = max, 11-19 or 201-500 = 15 (scaled to 0-8)
  if (employees >= 20 && employees <= 200) score += 8;
  else if ((employees >= 11 && employees <= 19) || (employees >= 201 && employees <= 500)) score += 6;
  else if (employees > 500) score += 2;
  else score += 5; // unknown size

  // Type (0-7): independent forwarder ideal
  const isBigCo =
    /dhl|kuehne|nagel|dsv\b|schenker|ceva|geodis|rhenus|hellmann|bollore|dachser|senator|maersk|msc /.test(orgName);
  if (!isBigCo) score += 7;

  // Geography (0-5)
  const city = (person.city || "").toLowerCase();
  if (TIER1_HUBS.some((h) => city.includes(h))) score += 5;
  else if (TIER2_HUBS.some((h) => city.includes(h))) score += 4;
  else score += 3;

  return Math.min(score, 20);
}

// ── Dimension 3: Role & Authority (0-20) ────────────────────
function getRoleScore(person: any): number {
  const title = (person.title || "").toLowerCase();
  const seniority = (person.seniority || "").toLowerCase();

  // Title score (0-12)
  let titleScore: number;
  if (/director.*air|head of air|director.*freight/.test(title)) titleScore = 12;
  else if (/charter manager|charter director|charter desk/.test(title)) titleScore = 12;
  else if (/air freight manager|air cargo manager/.test(title)) titleScore = 10;
  else if (/operations director|managing director|branch manager/.test(title)) titleScore = 10;
  else if (/freight manager|export manager|logistics manager/.test(title)) titleScore = 9;
  else if (/dg manager|energy logistics|project cargo|hazmat/.test(title)) titleScore = 9;
  else if (/logistics director|supply chain director/.test(title)) titleScore = 9;
  else if (/manager|director/.test(title)) titleScore = 8;
  else if (/vp|vice president|ceo|coo|owner|founder/.test(title)) titleScore = 8;
  else if (/coordinator|specialist|executive/.test(title)) titleScore = 6;
  else titleScore = 5;

  // +2 bonus for "Air Freight" or "Charter" in title (spec requirement)
  if (/air freight|air cargo|charter/.test(title)) titleScore = Math.min(titleScore + 2, 12);

  // Seniority score (0-8)
  let seniorityScore: number;
  if (/director|vp|c_suite|owner|founder/.test(seniority) || /director|vp|md\b|ceo|coo/.test(title)) {
    seniorityScore = 8;
  } else if (/manager|senior/.test(seniority) || /manager|senior/.test(title)) {
    seniorityScore = 7;
  } else {
    seniorityScore = 5;
  }

  return Math.min(titleScore + seniorityScore, 20);
}

// ── Dimension 5: Signal Strength (0-10) ─────────────────────
function getSignalScore(person: any): number {
  const title = (person.title || "").toLowerCase();
  if (/charter/.test(title)) return 8;
  if (/air freight manager|air cargo manager/.test(title)) return 7;
  if (/energy logistics|dg manager|project cargo/.test(title)) return 7;
  if (/manager|director/.test(title)) return 6;
  if (/specialist|coordinator/.test(title)) return 5;
  return 4;
}

// ── Dimension 6: Contact Quality (0-15) ─────────────────────
function getContactQualityScore(person: any): number {
  let score = 0;

  // Verified email (0-10)
  const emailStatus = person.email_status || person.contact?.email_status || "";
  if (person.email) {
    if (emailStatus === "verified") score += 10;
    else if (emailStatus === "likely to engage") score += 7;
    else score += 3; // unverified
  }

  // Direct mobile (+5)
  const hasDirectMobile = !!(
    person.phone_numbers?.some((p: any) => p.type === "mobile" || p.type === "direct") ||
    (person.sanitized_phone && person.sanitized_phone.length > 8)
  );
  if (hasDirectMobile) score += 5;

  // LinkedIn (+2)
  if (person.linkedin_url) score += 2;

  // Baseline: if we have nothing but the search found them, give 5
  if (score === 0) score = 5;

  return Math.min(score, 15);
}

// ── Opening Line Generator (templated, no Claude API) ───────
const CRISIS_HOOKS: Record<string, string> = {
  "Energy / Oil & Gas": "With oil above $95 and North Sea activity ramping up, we're seeing energy forwarders need charter capacity for rig equipment and DG chemicals.",
  "Dangerous Goods": "We handle all 9 UN DG classes including Class 1 and 7 — most brokers cap out at Class 3.",
  "Project Cargo": "For oversized and heavy-lift moves that scheduled carriers can't accommodate, we match cargo dimensions to aircraft capabilities in real-time.",
  "Defence / Aerospace": "For security-sensitive and time-critical defence logistics, we offer 24/7 charter response with classified cargo handling.",
  "Pharma": "For temperature-controlled pharma shipments where timing and cold chain integrity are non-negotiable.",
  "Cold Chain / Perishables": "With Gulf sea routes disrupted, perishable exporters are looking at air charter for temperature-sensitive cargo.",
  "Food / Perishables": "With Gulf food imports blocked by Hormuz, European food exporters need air alternatives urgently.",
  "Automotive / AOG": "When a production line is down waiting for a part, a charter that arrives in hours pays for itself by avoiding $500K/day in downtime.",
  "General Air Freight": "With 15% of global air cargo capacity offline from the Gulf crisis, we're seeing forwarders need charter alternatives for overflow.",
};

export function generateOpeningLine(person: any, verticalLabel: string): string {
  const name = person.first_name || person.name?.split(" ")[0] || "there";
  const hook = CRISIS_HOOKS[verticalLabel] || CRISIS_HOOKS["General Air Freight"];

  return `Hi ${name}, Kyle from FlyFX — air charter specialist. ${hook} We work exclusively with freight forwarders, never directly with shippers. Does charter come up for your team at all?`;
}

// ── Brain modifiers (from chatbot insights) ─────────────────
import type { BrainInsight } from "./types";

// Dimension max values for clamping
const DIMENSION_MAX: Record<string, number> = {
  crisisProximity: 20,
  companyFit: 20,
  roleAuthority: 20,
  verticalMatch: 15,
  signalStrength: 10,
  contactQuality: 15,
};

export function applyBrainModifiers(
  baseScore: { crisisProximity: number; companyFit: number; roleAuthority: number; verticalMatch: number; signalStrength: number; contactQuality: number },
  lead: { country?: string; city?: string; vertical?: string; company?: string; industry?: string },
  modifiers: BrainInsight[],
): typeof baseScore {
  const result = { ...baseScore };

  for (const mod of modifiers) {
    if (mod.type !== "adjust_scoring" || !mod.active || !mod.dimension || mod.modifier === undefined) continue;

    // Check if lead matches the filter
    const filter = mod.filter || {};
    let matches = true;

    for (const [key, val] of Object.entries(filter)) {
      const filterVal = val.toLowerCase();
      if (key === "country" && lead.country && !lead.country.toLowerCase().includes(filterVal)) { matches = false; break; }
      if (key === "city" && lead.city && !lead.city.toLowerCase().includes(filterVal)) { matches = false; break; }
      if (key === "vertical" && lead.vertical && !lead.vertical.toLowerCase().includes(filterVal)) { matches = false; break; }
      if (key === "company" && lead.company && !lead.company.toLowerCase().includes(filterVal)) { matches = false; break; }
      if (key === "industry" && lead.industry && !lead.industry.toLowerCase().includes(filterVal)) { matches = false; break; }
    }

    if (!matches) continue;

    // Apply the modifier to the dimension, clamping to max
    const dim = mod.dimension as keyof typeof result;
    if (dim in result) {
      const max = DIMENSION_MAX[dim] || 25;
      result[dim] = Math.max(0, Math.min(max, result[dim] + mod.modifier));
    }
  }

  return result;
}

// ── Main scoring function ───────────────────────────────────
export function scoreContact(
  person: any,
  deadCompanies: string[] = [],
  brainModifiers: BrainInsight[] = [],
): ScoreBreakdown | null {
  const orgName = (person.organization?.name || person.company || "").toLowerCase();

  // Hard exclusion: DO NOT CALL list
  if (deadCompanies.some((c) => orgName.includes(c.toLowerCase()))) return null;

  // Hard exclusion: Gus's HubSpot contacts
  if (person._hubspot?.isGusContact) return null;

  let crisisProximity = getCrisisProximityScore(person);
  let companyFit = getCompanyFitScore(person);
  let roleAuthority = getRoleScore(person);

  const industryTags = person.organization?.keywords || [];
  const industry = person.organization?.industry || person.specialisation || "";
  const { score: verticalMatch, label: verticalLabel } = getVerticalScore(industry, industryTags);

  let signalStrength = getSignalScore(person);
  let contactQuality = getContactQualityScore(person);

  // Apply brain modifiers if any
  if (brainModifiers.length > 0) {
    const adjusted = applyBrainModifiers(
      { crisisProximity, companyFit, roleAuthority, verticalMatch, signalStrength, contactQuality },
      {
        country: person.country || person.organization?.country || "",
        city: person.city || "",
        vertical: verticalLabel,
        company: orgName,
        industry,
      },
      brainModifiers,
    );
    crisisProximity = adjusted.crisisProximity;
    companyFit = adjusted.companyFit;
    roleAuthority = adjusted.roleAuthority;
    signalStrength = adjusted.signalStrength;
    contactQuality = adjusted.contactQuality;
    // Note: verticalMatch from brain is applied but we keep the label from base scoring
  }

  const total = crisisProximity + companyFit + roleAuthority + verticalMatch + signalStrength + contactQuality;

  // Tier thresholds from spec: Hot 75+, Warm 50-74, Nurture 0-49
  let tier: "hot" | "warm" | "nurture";
  if (total >= 75) tier = "hot";
  else if (total >= 50) tier = "warm";
  else tier = "nurture";

  // Kyle/Gus assignment
  let assignedTo: "kyle" | "gus" | "shared";
  if (verticalMatch >= 11) assignedTo = "kyle";
  else assignedTo = "gus";

  return {
    crisisProximity, companyFit, roleAuthority, verticalMatch,
    signalStrength, contactQuality, total, tier, assignedTo, verticalLabel,
  };
}

// Score a batch — returns ALL scored contacts sorted by score
export function scoreBatch(
  people: any[],
  deadCompanies: string[] = [],
  brainModifiers: BrainInsight[] = [],
): Array<{ person: any; score: ScoreBreakdown }> {
  const scored: Array<{ person: any; score: ScoreBreakdown }> = [];

  for (const person of people) {
    const score = scoreContact(person, deadCompanies, brainModifiers);
    if (score) {
      scored.push({ person, score });
    }
  }

  return scored.sort((a, b) => b.score.total - a.score.total);
}
