export type DealStatus = "new" | "called" | "negative" | "callback_later" | "they_callback" | "gatekeeper" | "follow_up_email" | "imported" | "existing_hubspot" | "deleted";
export type CallOutcome = "meeting_booked" | "positive" | "neutral" | "rejection" | "dead_vertical" | "voicemail" | "no_answer";

export interface PipelinePhase {
  phase: number;
  name: string;
  status: "pending" | "running" | "done" | "error";
  message: string;
  data?: any;
}

export interface PipelineResult {
  success: boolean;
  deals: number;
  date: string;
  hot: number;
  warm: number;
  kyle: number;
  gus: number;
}

export interface Deal {
  rank: number;
  name: string;
  title: string;
  company: string;
  city: string;
  country: string;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
  domain: string | null;
  employees: string | null;
  specialisation: string | null;
  priority: "hot" | "warm" | "nurture";
  assignedTo: "kyle" | "gus" | "shared";
  crisisAngle: string;
  companyIntel?: string;
  whyToday: string;
  openingLine: string;
  callScript: string | null;
  coldEmail: string | null;
  emailSubject: string | null;
  leadDifferentiator: string;
  differentiatorDetail: string;
  objection: string;
  followUpTrigger: string;
  enrichmentStatus: string;
  apolloId: string | null;
  source: string;
}

export interface MarketSnapshot {
  brent: string;
  ttfGas: string;
  hormuzStatus: string;
  topTalkingPoint: string;
  [key: string]: string;
}

export interface ConsequenceChain {
  title: string;
  event: string;
  steps: string[];
  charterTrigger: string;
  target: string;
}

export interface MarketIntelligence {
  geopolitical: IntelSection[];
  economic: IntelSection[];
  freight: IntelSection[];
  humanitarian: IntelSection[];
  outlook48h: IntelSection[];
}

export interface IntelSection {
  headline: string;
  detail: string;
  impact: "critical" | "high" | "medium" | "low";
  tag: string;
}

export interface ScriptIntelligence {
  callsAnalysed: number;
  topOpener: string;
  commonObjection: string;
  scriptChanges: string;
}

export interface DailyData {
  date: string;
  marketSnapshot: MarketSnapshot;
  marketIntelligence?: MarketIntelligence;
  consequenceChains?: ConsequenceChain[];
  scriptIntelligence: ScriptIntelligence;
  deals: Deal[];
}

// Persistent contacts collection — survives across pipeline runs
export interface Contact {
  id: string;                    // deterministic key: `${name}__${company}`
  name: string;
  title: string;
  company: string;
  city: string;
  country: string;
  phone: string | null;
  domain: string | null;
  linkedin: string | null;
  email: string | null;
  source: string;                // which pipeline run: "pipeline-2026-03-18"
  dateAdded: string;             // ISO date
  lastUpdated: string;           // ISO datetime
  status: DealStatus;
  tags: string[];                // e.g. ["air freight", "chartering"]
  notes: string | null;
  assignedTo: "kyle" | "gus" | "shared";
  score: number | null;
  specialisation: string | null;
  apolloId: string | null;
  employees: string | null;
  priority: "hot" | "warm" | "nurture";
  hubspot_id: string | null;
  disqualify_reason: string | null;
}

// Lead pool — persistent store of 100-500 scored leads from Apollo
export interface LeadPoolEntry {
  apolloId: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  domain: string | null;
  city: string;
  country: string;
  employees: number | null;
  industry: string | null;
  keywords: string[];
  linkedinUrl: string | null;
  score: number;
  tier: "hot" | "warm" | "nurture";
  verticalLabel: string;
  assignedTo: "kyle" | "gus" | "shared";
  openingLine: string;
  addedAt: string;              // ISO datetime
  status: "pool" | "today" | "contacted" | "disqualified";
}

// Pipeline run history
export interface PipelineRunMeta {
  date: string;
  dealCount: number;
  hotCount: number;
  warmCount: number;
  kyleCount: number;
  gusCount: number;
}

// Coach types
export interface CoachBrief {
  readiness: "ready" | "needs_prep" | "skip";
  confidenceNote: string;
  approach: string;
  openingLine: string;
  keyTalkingPoints: string[];
  likelyObjections: { objection: string; response: string }[];
  whatNotToSay: string[];
  scoreExplanation: string;
  nextStep: string;
  practiceScenario: string;
}

export interface PracticeMessage {
  role: "kyle" | "prospect" | "coach";
  text: string;
}

// Agent types
export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Brain types ─────────────────────────────────────────────
export type BrainInsightType = "adjust_scoring" | "adjust_script" | "exclude_or_prioritize";

export interface BrainInsight {
  id: string;                              // "ins_001", auto-generated
  type: BrainInsightType;
  date: string;                            // ISO date
  reason: string;                          // Why this was stored
  active: boolean;                         // Can be disabled without deleting
  // adjust_scoring fields:
  dimension?: string;                      // e.g. "verticalMatch", "crisisProximity"
  filter?: Record<string, string>;         // e.g. { vertical: "DG", country: "Belgium" }
  modifier?: number;                       // e.g. +5 or -3
  // adjust_script fields:
  target?: string;                         // e.g. "crisis_hook", "opening_line", "objection"
  instruction?: string;                    // natural language instruction for Claude
  // exclude_or_prioritize fields:
  action?: "exclude" | "prioritize";
  scope?: string;                          // "vertical", "company", "country"
  value?: string;                          // e.g. "ocean freight", "France"
  geography?: string;                      // optional geographic scope
}

export interface Brain {
  insights: BrainInsight[];
  lastUpdated: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  insightExtracted?: BrainInsight | null;  // What auto-extract produced (if any)
}
