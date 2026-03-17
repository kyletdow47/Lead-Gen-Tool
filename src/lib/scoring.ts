// ICP Scoring Model v3.0 — Ported from CLAUDE.md
// 6 dimensions, 100 points max
// Kyle territory (verticalScore >= 11): Energy, DG, Project Cargo, Defence
// Gus territory  (verticalScore <= 10): Pharma, Perishables, Automotive, General

export interface ScoreBreakdown {
  crisisProximity: number;  // 0-25
  companyFit: number;       // 0-20
  roleAuthority: number;    // 0-20
  verticalMatch: number;    // 0-15
  signalStrength: number;   // 0-10
  contactQuality: number;   // 0-10
  total: number;
  tier: "hot" | "warm" | "nurture" | "skip";
  assignedTo: "kyle" | "gus" | "shared";
  verticalLabel: string;
}

const TIER1_HUBS = [
  "aberdeen", "stavanger", "rotterdam", "hamburg", "amsterdam",
  "london", "frankfurt", "antwerp",
];
const TIER2_HUBS = [
  "oslo", "copenhagen", "brussels", "paris", "milan", "madrid",
  "lisbon", "edinburgh", "munich", "düsseldorf", "dusseldorf",
];

// Returns { score, label } for Dimension 4
export function getVerticalScore(
  industry: string | undefined,
  tags: string[] = []
): { score: number; label: string } {
  const combined = [industry || "", ...tags].join(" ").toLowerCase();

  if (/energy|oil\b|gas\b|petroleum|offshore|upstream|downstream|lng|lng/.test(combined))
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
  if (/food|fresh|seafood|meat|produce|perishable/.test(combined))
    return { score: 8, label: "Food / Perishables" };
  if (/automotive|auto\b|aog\b|aircraft.on.ground/.test(combined))
    return { score: 7, label: "Automotive / AOG" };
  if (/e.?commerce|consumer.goods|retail\b/.test(combined))
    return { score: 3, label: "E-commerce" };

  return { score: 5, label: "General Air Freight" };
}

function getCompanyFitScore(person: any): number {
  let score = 0;
  const employees =
    person.organization?.estimated_num_employees ||
    parseInt(person.employees || "0", 10);
  const orgName = (person.organization?.name || person.company || "").toLowerCase();

  // Size (0-8)
  if (employees >= 51 && employees <= 200) score += 8;
  else if (employees >= 11 && employees <= 50) score += 6;
  else if (employees >= 201 && employees <= 500) score += 4;
  else if (employees > 500) score += 2;
  else score += 3; // unknown size — slight penalty

  // Type (0-7): independent forwarder ideal; big-co penalty
  const isBigCo =
    /dhl|kuehne|nagel|dsv\b|schenker|ceva|geodis|rhenus|hellmann|bollore|dachser|senator/.test(
      orgName
    );
  if (!isBigCo) score += 7;

  // Geography (0-5)
  const city = (person.city || "").toLowerCase();
  if (TIER1_HUBS.some((h) => city.includes(h))) score += 5;
  else if (TIER2_HUBS.some((h) => city.includes(h))) score += 4;
  else score += 3; // Tier 3 or unknown

  return Math.min(score, 20);
}

function getRoleScore(person: any): number {
  const title = (person.title || "").toLowerCase();
  const seniority = (person.seniority || "").toLowerCase();

  // Title score (0-12)
  let titleScore: number;
  if (/charter manager|charter director/.test(title)) titleScore = 12;
  else if (/air freight manager|air cargo manager|freight manager/.test(title)) titleScore = 10;
  else if (/operations director|ops director|managing director|branch manager/.test(title)) titleScore = 10;
  else if (/dg manager|energy logistics|project cargo|hazmat manager/.test(title)) titleScore = 9;
  else if (/logistics director|supply chain director/.test(title)) titleScore = 9;
  else if (/logistics manager|export manager|import manager/.test(title)) titleScore = 8;
  else if (/manager|director/.test(title)) titleScore = 7;
  else if (/coordinator|specialist|executive/.test(title)) titleScore = 6;
  else if (/vp|vice president|ceo|coo|owner|founder/.test(title)) titleScore = 8;
  else titleScore = 5;

  // Seniority multiplier (0-8)
  let seniorityScore: number;
  if (
    /director|vp|c_suite|owner|founder/.test(seniority) ||
    /director|vp|md\b|ceo|coo|owner|founder/.test(title)
  ) {
    seniorityScore = 8;
  } else if (/manager|senior/.test(seniority) || /manager|senior/.test(title)) {
    seniorityScore = 7;
  } else {
    seniorityScore = 5;
  }

  return Math.min(Math.round(titleScore * 0.6 + seniorityScore * 0.4), 20);
}

function getContactQualityScore(person: any): number {
  const hasDirectMobile = !!(
    person.phone_numbers?.some((p: any) => p.type === "mobile") ||
    (person.sanitized_phone && !person.sanitized_phone.startsWith("+44 20")) // exclude main HQ London lines
  );
  const hasPhone = !!(person.phone_numbers?.length || person.sanitized_phone);
  const hasEmail = !!(person.email);
  const hasLinkedIn = !!(person.linkedin_url);

  if (hasDirectMobile && hasEmail && hasLinkedIn) return 10;
  if (hasDirectMobile && hasEmail) return 9;
  if (hasPhone && hasEmail && hasLinkedIn) return 8;
  if (hasPhone && hasEmail) return 7;
  if (hasEmail && hasLinkedIn) return 6;
  if (hasEmail) return 4;
  if (hasPhone) return 3;
  return 1;
}

function getSignalScore(person: any): number {
  const title = (person.title || "").toLowerCase();
  // Inferred signals from title specificity and available data
  if (/charter/.test(title)) return 8; // charter-specific role = active need signal
  if (/air freight manager|air cargo manager/.test(title)) return 7;
  if (/energy logistics|dg manager|project cargo/.test(title)) return 7;
  if (/manager|director/.test(title)) return 6;
  if (/specialist|coordinator/.test(title)) return 5;
  return 4; // baseline
}

// Main scoring function
// crisisProximitySteps: how many domino steps from today's top disruption
// 1 = direct (energy forwarder during Hormuz crisis)
// 2 = one step removed
// 3 = two steps
// 4+ = indirect
export function scoreContact(
  person: any,
  crisisProximitySteps: number = 3,
  deadCompanies: string[] = []
): ScoreBreakdown | null {
  const orgName = (person.organization?.name || person.company || "").toLowerCase();

  // Hard exclusion: DO NOT CALL list
  if (deadCompanies.some((c) => orgName.includes(c.toLowerCase()))) {
    return null;
  }

  // Hard exclusion: Gus's HubSpot contacts (already handled upstream, but double-check)
  if (person._hubspot?.isGusContact) return null;

  // Dimension 1: Crisis Proximity
  let crisisProximity: number;
  if (crisisProximitySteps === 1) crisisProximity = 25;
  else if (crisisProximitySteps === 2) crisisProximity = 20;
  else if (crisisProximitySteps === 3) crisisProximity = 15;
  else crisisProximity = 10;

  // Dimension 2: Company Fit
  const companyFit = getCompanyFitScore(person);

  // Dimension 3: Role & Authority
  const roleAuthority = getRoleScore(person);

  // Dimension 4: Vertical Match
  const industryTags = person.organization?.keywords || [];
  const industry =
    person.organization?.industry ||
    person.specialisation ||
    person.industry ||
    "";
  const { score: verticalMatch, label: verticalLabel } = getVerticalScore(
    industry,
    industryTags
  );

  // Dimension 5: Signal Strength
  const signalStrength = getSignalScore(person);

  // Dimension 6: Contact Quality
  const contactQuality = getContactQualityScore(person);

  const total =
    crisisProximity +
    companyFit +
    roleAuthority +
    verticalMatch +
    signalStrength +
    contactQuality;

  let tier: "hot" | "warm" | "nurture" | "skip";
  if (total >= 85) tier = "hot";
  else if (total >= 70) tier = "warm";
  else if (total >= 55) tier = "nurture";
  else tier = "skip";

  // Kyle/Gus assignment
  let assignedTo: "kyle" | "gus" | "shared";
  if (verticalMatch >= 11) assignedTo = "kyle";
  else assignedTo = "gus";

  return {
    crisisProximity,
    companyFit,
    roleAuthority,
    verticalMatch,
    signalStrength,
    contactQuality,
    total,
    tier,
    assignedTo,
    verticalLabel,
  };
}

// Score a batch of contacts and return sorted by score (descending), skips excluded
export function scoreBatch(
  people: any[],
  crisisProximitySteps: number = 3,
  deadCompanies: string[] = []
): Array<{ person: any; score: ScoreBreakdown }> {
  const scored: Array<{ person: any; score: ScoreBreakdown }> = [];

  for (const person of people) {
    const score = scoreContact(person, crisisProximitySteps, deadCompanies);
    if (score && score.tier !== "skip") {
      scored.push({ person, score });
    }
  }

  return scored.sort((a, b) => b.score.total - a.score.total);
}
