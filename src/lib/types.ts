export type DealStatus = "new" | "called" | "callback_later" | "they_callback" | "imported" | "deleted";

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
