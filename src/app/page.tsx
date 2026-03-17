"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { DailyData, Deal, DealStatus, IntelSection, ConsequenceChain, CoachBrief, PracticeMessage, AgentMessage, PipelinePhase, PipelineResult } from "@/lib/types";

// ─── AUTH GATE ───────────────────────────────────────────────
function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    if (pw === "flyfxdeals2026") {
      sessionStorage.setItem("flyfx_auth", "1");
      onAuth();
    } else {
      setError(true);
      setTimeout(() => setError(false), 1500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-flyfx-dark px-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="flex flex-col items-center">
          <img src="/flyfxfreight-logo.svg" alt="FlyFXFreight" className="h-7" />
          <p className="text-flyfx-muted text-sm mt-1">Deals Machine</p>
        </div>
        <div className="space-y-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Password"
            className={`w-full px-4 py-3 bg-flyfx-card border rounded-lg text-white text-center outline-none transition ${
              error ? "border-red-500 shake" : "border-flyfx-border focus:border-flyfx-gold"
            }`}
            autoFocus
          />
          <button
            onClick={submit}
            className="w-full py-3 bg-flyfx-gold text-black font-semibold rounded-lg hover:opacity-90 transition"
          >
            Enter
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MARKET & INTELLIGENCE ───────────────────────────────────
function MarketPanel({ data }: { data: DailyData }) {
  const [tab, setTab] = useState<"snapshot" | "intelligence" | "chains">("snapshot");
  const [freshMarket, setFreshMarket] = useState<any>(null);
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const refreshAttempted = useRef(false);
  const { marketSnapshot: m, marketIntelligence: intel, consequenceChains: chains } = data;

  // Auto-refresh market data if daily data is stale
  useEffect(() => {
    if (refreshAttempted.current) return;
    refreshAttempted.current = true;
    const today = new Date().toISOString().split("T")[0];
    if (data.date === today && m.brent) return; // Fresh enough

    (async () => {
      // Check cache first
      try {
        const cacheRes = await fetch("/api/market");
        if (cacheRes.ok) {
          const cacheJson = await cacheRes.json();
          if (cacheJson.fresh && cacheJson.snapshot) {
            setFreshMarket(cacheJson.snapshot);
            return;
          }
        }
      } catch {}
      // Fetch fresh
      setMarketRefreshing(true);
      try {
        const res = await fetch("/api/market", { method: "POST" });
        if (res.ok) {
          const json = await res.json();
          if (json.snapshot) setFreshMarket(json.snapshot);
        }
      } catch {}
      setMarketRefreshing(false);
    })();
  }, [data.date, m.brent]);

  const refreshMarket = async () => {
    setMarketRefreshing(true);
    try {
      const res = await fetch("/api/market", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        if (json.snapshot) setFreshMarket(json.snapshot);
      }
    } catch {}
    setMarketRefreshing(false);
  };

  // Merge fresh data over daily data
  const displaySnapshot = freshMarket
    ? { ...m, ...freshMarket, keyHeadlines: freshMarket.keyHeadlines }
    : m;

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "snapshot", label: "Snapshot" },
    { key: "intelligence", label: "Intelligence" },
    { key: "chains", label: "Chains" },
  ];

  return (
    <div className="bg-flyfx-card border border-flyfx-border rounded-xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-flyfx-border px-4 pt-3 pb-0">
        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded-t-lg transition border-b-2 -mb-px ${
                tab === t.key
                  ? "text-flyfx-gold border-flyfx-gold bg-flyfx-dark/50"
                  : "text-flyfx-muted border-transparent hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          {freshMarket?.fetchedAt && (
            <span className="text-[10px] text-green-400">Live</span>
          )}
          <span className="text-xs text-flyfx-muted">{data.date}</span>
          <button onClick={refreshMarket} disabled={marketRefreshing}
            className="text-flyfx-muted hover:text-flyfx-gold transition disabled:opacity-50">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={marketRefreshing ? "animate-spin" : ""}>
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-4">
        {tab === "snapshot" && <SnapshotTab m={displaySnapshot} headlines={freshMarket?.keyHeadlines} />}
        {tab === "intelligence" && <IntelligenceTab intel={intel} />}
        {tab === "chains" && <ChainsTab chains={chains} />}
      </div>
    </div>
  );
}

function SnapshotTab({ m, headlines }: { m: DailyData["marketSnapshot"]; headlines?: string[] }) {
  const extraKeys = Object.keys(m).filter(
    (k) => !["brent", "ttfGas", "hormuzStatus", "topTalkingPoint", "keyHeadlines", "fetchedAt"].includes(k)
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Brent" value={m.brent} />
        <Stat label="TTF Gas" value={m.ttfGas} />
        <Stat label="Hormuz" value={m.hormuzStatus} />
        {extraKeys.slice(0, 5).map((k) => (
          <Stat key={k} label={k.replace(/([A-Z])/g, " $1").trim()} value={m[k]} />
        ))}
      </div>
      {m.topTalkingPoint && (
        <div className="bg-flyfx-dark rounded-lg p-3 border border-flyfx-gold/20">
          <p className="text-[10px] text-flyfx-gold uppercase tracking-wider mb-1">
            Say this on every call
          </p>
          <p className="text-sm leading-relaxed">{m.topTalkingPoint}</p>
        </div>
      )}
      {headlines && headlines.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-flyfx-muted uppercase tracking-wider">Key headlines</p>
          {headlines.map((h: string, i: number) => (
            <div key={i} className="bg-flyfx-dark rounded-lg px-3 py-2 border border-flyfx-border">
              <p className="text-xs leading-relaxed text-flyfx-muted">{h}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntelligenceTab({ intel }: { intel?: DailyData["marketIntelligence"] }) {
  const [openSection, setOpenSection] = useState<string | null>("geopolitical");

  if (!intel) {
    return (
      <div className="text-center py-8">
        <p className="text-flyfx-muted text-sm">
          No intelligence data yet. Run <code className="text-flyfx-gold">deals please</code> to
          generate today's analysis.
        </p>
      </div>
    );
  }

  const sections: { key: keyof typeof intel; label: string; icon: string }[] = [
    { key: "geopolitical", label: "Geopolitical & Conflict", icon: "GEO" },
    { key: "economic", label: "Economic & Markets", icon: "ECON" },
    { key: "freight", label: "Freight & Logistics", icon: "FRT" },
    { key: "humanitarian", label: "Humanitarian & Food", icon: "AID" },
    { key: "outlook48h", label: "48-Hour Outlook", icon: "48H" },
  ];

  return (
    <div className="space-y-2">
      {sections.map(({ key, label, icon }) => {
        const items = intel[key];
        if (!items || items.length === 0) return null;
        const isOpen = openSection === key;

        return (
          <div key={key} className="rounded-lg border border-flyfx-border overflow-hidden">
            <button
              onClick={() => setOpenSection(isOpen ? null : key)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] transition text-left"
            >
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-flyfx-gold/20 text-flyfx-gold flex-shrink-0">
                {icon}
              </span>
              <span className="text-sm font-medium flex-1">{label}</span>
              <span className="text-flyfx-muted text-xs">{items.length} items</span>
              <ChevronIcon open={isOpen} />
            </button>
            {isOpen && (
              <div className="border-t border-flyfx-border divide-y divide-flyfx-border">
                {items.map((item, i) => (
                  <IntelItem key={i} item={item} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IntelItem({ item }: { item: IntelSection }) {
  const impactColor =
    item.impact === "critical"
      ? "bg-red-500/20 text-red-400 border-red-500/30"
      : item.impact === "high"
      ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
      : item.impact === "medium"
      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
      : "bg-gray-500/20 text-gray-400 border-gray-500/30";

  return (
    <div className="px-3 py-3 bg-flyfx-dark/30">
      <div className="flex items-start gap-2 mb-1.5">
        <span
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase flex-shrink-0 mt-0.5 ${impactColor}`}
        >
          {item.impact}
        </span>
        {item.tag && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-flyfx-border text-flyfx-muted flex-shrink-0 mt-0.5">
            {item.tag}
          </span>
        )}
      </div>
      <h4 className="text-sm font-semibold text-white mb-1">{item.headline}</h4>
      <p className="text-xs text-flyfx-muted leading-relaxed whitespace-pre-wrap">{item.detail}</p>
    </div>
  );
}

function ChainsTab({ chains }: { chains?: ConsequenceChain[] }) {
  const [expandedChain, setExpandedChain] = useState<number | null>(0);

  if (!chains || chains.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-flyfx-muted text-sm">
          No consequence chains yet. Run <code className="text-flyfx-gold">deals please</code> to
          generate today's analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {chains.map((chain, i) => {
        const isOpen = expandedChain === i;
        return (
          <div key={i} className="rounded-lg border border-flyfx-border overflow-hidden">
            <button
              onClick={() => setExpandedChain(isOpen ? null : i)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] transition text-left"
            >
              <span className="text-flyfx-gold font-bold text-sm flex-shrink-0">#{i + 1}</span>
              <span className="text-sm font-medium flex-1">{chain.title}</span>
              <ChevronIcon open={isOpen} />
            </button>
            {isOpen && (
              <div className="border-t border-flyfx-border p-3 bg-flyfx-dark/30 space-y-3">
                <div className="bg-flyfx-dark rounded-lg p-2.5 border border-flyfx-border">
                  <p className="text-[10px] text-flyfx-muted uppercase mb-1">Event</p>
                  <p className="text-sm font-medium">{chain.event}</p>
                </div>
                <div className="relative pl-4 space-y-0">
                  {chain.steps.map((step, si) => (
                    <div key={si} className="relative pb-3 last:pb-0">
                      <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-flyfx-gold/60" />
                      {si < chain.steps.length - 1 && (
                        <div className="absolute left-[3px] top-3.5 w-0.5 h-full bg-flyfx-border" />
                      )}
                      <p className="text-xs text-flyfx-muted leading-relaxed pl-4">{step}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                  <p className="text-[10px] text-red-400 uppercase mb-1">Charter trigger</p>
                  <p className="text-xs leading-relaxed">{chain.charterTrigger}</p>
                </div>
                <div className="bg-flyfx-gold/10 border border-flyfx-gold/20 rounded-lg p-2.5">
                  <p className="text-[10px] text-flyfx-gold uppercase mb-1">Target</p>
                  <p className="text-xs leading-relaxed">{chain.target}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-flyfx-dark rounded-lg p-2.5">
      <p className="text-[10px] text-flyfx-muted uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold mt-0.5 truncate">{value}</p>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`text-flyfx-muted transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ─── SCRIPT INTELLIGENCE ─────────────────────────────────────
function ScriptIntel({ data }: { data: DailyData["scriptIntelligence"] }) {
  if (!data) return null;
  return (
    <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-flyfx-gold uppercase tracking-wider">
        Script Intelligence
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="bg-flyfx-dark rounded-lg p-3">
          <p className="text-[10px] text-flyfx-muted uppercase mb-1">Calls Analysed</p>
          <p className="font-semibold">{data.callsAnalysed}</p>
        </div>
        <div className="bg-flyfx-dark rounded-lg p-3">
          <p className="text-[10px] text-flyfx-muted uppercase mb-1">Top Opener</p>
          <p className="text-xs leading-relaxed">{data.topOpener}</p>
        </div>
        <div className="bg-flyfx-dark rounded-lg p-3">
          <p className="text-[10px] text-flyfx-muted uppercase mb-1">Common Objection</p>
          <p className="text-xs leading-relaxed">{data.commonObjection}</p>
        </div>
      </div>
      {data.scriptChanges && (
        <p className="text-xs text-flyfx-muted">
          <span className="text-flyfx-gold">Changes today:</span> {data.scriptChanges}
        </p>
      )}
    </div>
  );
}

// ─── DEAL CARD ───────────────────────────────────────────────
function DealCard({
  deal,
  isExpanded,
  onToggle,
  status,
  onStatusChange,
  onHubSpotImport,
  importing,
}: {
  deal: Deal;
  isExpanded: boolean;
  onToggle: () => void;
  status: DealStatus;
  onStatusChange: (status: DealStatus) => void;
  onHubSpotImport: () => void;
  importing: boolean;
}) {
  const priorityClass =
    deal.priority === "hot"
      ? "priority-hot"
      : deal.priority === "warm"
      ? "priority-warm"
      : "priority-nurture";

  const priorityBadge =
    deal.priority === "hot"
      ? "bg-red-500/20 text-red-400"
      : deal.priority === "warm"
      ? "bg-amber-500/20 text-amber-400"
      : "bg-gray-500/20 text-gray-400";

  return (
    <div
      className={`deal-card bg-flyfx-card border border-flyfx-border rounded-xl overflow-hidden card-enter ${priorityClass}`}
    >
      {/* Header — always visible */}
      <button onClick={onToggle} className="w-full text-left p-4 hover:bg-white/[0.02] transition">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-flyfx-gold font-bold text-lg">#{deal.rank}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${priorityBadge}`}>
                {deal.priority}
              </span>
              {deal.assignedTo && deal.assignedTo !== "shared" && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  deal.assignedTo === "kyle"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-purple-500/20 text-purple-400"
                }`}>
                  {deal.assignedTo === "kyle" ? "KYLE" : "GUS"}
                </span>
              )}
              {deal.phone ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                  CALL
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                  EMAIL
                </span>
              )}
            </div>
            <h3 className="font-semibold text-white truncate">{deal.name}</h3>
            <p className="text-sm text-flyfx-muted truncate">
              {deal.title} — {deal.company}
            </p>
            <p className="text-xs text-flyfx-muted mt-0.5">
              {deal.city}, {deal.country}
              {deal.employees && ` · ${deal.employees} staff`}
            </p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5 mt-1">
            {deal.phone && (
              <a
                href={`tel:${deal.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-500 transition"
              >
                <PhoneIcon /> Call
              </a>
            )}
            {deal.email && (
              <a
                href={`mailto:${deal.email}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-flyfx-border text-white text-xs font-medium rounded-lg hover:bg-white/10 transition"
              >
                <MailIcon /> Email
              </a>
            )}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-flyfx-border p-4 space-y-4 bg-flyfx-dark/50">
          {/* Contact details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {deal.phone && (
              <div>
                <span className="text-flyfx-muted text-xs">Phone:</span>{" "}
                <a href={`tel:${deal.phone}`} className="text-flyfx-gold hover:underline">
                  {deal.phone}
                </a>
              </div>
            )}
            {deal.email && (
              <div>
                <span className="text-flyfx-muted text-xs">Email:</span>{" "}
                <a href={`mailto:${deal.email}`} className="text-flyfx-gold hover:underline">
                  {deal.email}
                </a>
              </div>
            )}
            {deal.linkedin && (
              <div>
                <a
                  href={deal.linkedin}
                  target="_blank"
                  rel="noopener"
                  className="text-blue-400 hover:underline text-xs"
                >
                  View LinkedIn Profile →
                </a>
              </div>
            )}
            {deal.domain && (
              <div>
                <a
                  href={`https://${deal.domain}`}
                  target="_blank"
                  rel="noopener"
                  className="text-flyfx-muted hover:text-white text-xs"
                >
                  {deal.domain} →
                </a>
              </div>
            )}
          </div>

          {/* Why Today */}
          <Section title="Why Today" content={deal.whyToday} highlight />

          {/* Opening Line */}
          <Section title="Opening Line" content={`"${deal.openingLine}"`} />

          {/* Call Script */}
          {deal.callScript && <Section title="Call Script" content={deal.callScript} />}

          {/* Cold Email */}
          {deal.coldEmail && (
            <div>
              {deal.emailSubject && (
                <p className="text-xs text-flyfx-muted mb-1">
                  Subject: <span className="text-white">{deal.emailSubject}</span>
                </p>
              )}
              <Section title="Cold Email" content={deal.coldEmail} />
            </div>
          )}

          {/* Lead Differentiator */}
          <div className="flex items-start gap-2">
            <span className="text-flyfx-gold text-xs font-semibold uppercase flex-shrink-0 mt-0.5">
              Lead With:
            </span>
            <p className="text-sm">
              {deal.leadDifferentiator}
              {deal.differentiatorDetail && (
                <span className="text-flyfx-muted"> — {deal.differentiatorDetail}</span>
              )}
            </p>
          </div>

          {/* Objection */}
          <Section title="Likely Objection" content={deal.objection} />

          {/* Follow-up */}
          <Section title="Follow-up Trigger" content={deal.followUpTrigger} />

          {/* Meta */}
          <div className="flex items-center gap-3 text-[10px] text-flyfx-muted pt-2 border-t border-flyfx-border">
            <span>{deal.enrichmentStatus}</span>
            <span>{deal.source}</span>
            {deal.specialisation && <span>{deal.specialisation}</span>}
          </div>
        </div>
      )}

      {/* Status action bar — always visible at bottom */}
      <div
        className="border-t border-flyfx-border px-4 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {status === "new" && (
          <div className="flex items-center gap-2 w-full">
            <span className="text-[10px] text-flyfx-muted mr-auto">Done calling?</span>
            <button
              onClick={() => onStatusChange("called")}
              className="flex items-center gap-1 px-3 py-1.5 bg-flyfx-gold/10 text-flyfx-gold text-xs font-medium rounded-lg hover:bg-flyfx-gold/20 transition border border-flyfx-gold/20"
            >
              <CheckIcon /> Called
            </button>
          </div>
        )}

        {status === "called" && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-flyfx-gold/20 text-flyfx-gold font-medium">CALLED</span>
              <span className="text-[10px] text-flyfx-muted">How did it go?</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onHubSpotImport}
                disabled={importing}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-500/10 text-green-400 text-xs font-medium rounded-lg hover:bg-green-500/20 transition border border-green-500/20 disabled:opacity-50"
              >
                <HubSpotIcon /> {importing ? "Importing..." : "Import to HubSpot"}
              </button>
              <button
                onClick={() => onStatusChange("callback_later")}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-500/10 text-amber-400 text-xs font-medium rounded-lg hover:bg-amber-500/20 transition border border-amber-500/20"
              >
                <ClockIcon /> Call Back Later
              </button>
              <button
                onClick={() => onStatusChange("they_callback")}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-500/10 text-blue-400 text-xs font-medium rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20"
              >
                <IncomingIcon /> They'll Call Us
              </button>
              <button
                onClick={() => onStatusChange("deleted")}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/20 transition border border-red-500/20"
              >
                <TrashIcon /> Delete
              </button>
            </div>
          </div>
        )}

        {status === "imported" && (
          <div className="flex items-center gap-2 w-full">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">IMPORTED TO HUBSPOT</span>
          </div>
        )}

        {status === "callback_later" && (
          <div className="flex items-center gap-2 w-full">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">CALL BACK LATER</span>
            <button
              onClick={() => onStatusChange("called")}
              className="ml-auto flex items-center gap-1 px-2 py-1 text-[10px] text-flyfx-muted hover:text-white transition"
            >
              Change
            </button>
          </div>
        )}

        {status === "they_callback" && (
          <div className="flex items-center gap-2 w-full">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">THEY'LL CALL US</span>
            <button
              onClick={() => onStatusChange("called")}
              className="ml-auto flex items-center gap-1 px-2 py-1 text-[10px] text-flyfx-muted hover:text-white transition"
            >
              Change
            </button>
          </div>
        )}

        {status === "deleted" && (
          <div className="flex items-center gap-2 w-full">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">DELETED</span>
            <button
              onClick={() => onStatusChange("new")}
              className="ml-auto flex items-center gap-1 px-2 py-1 text-[10px] text-flyfx-muted hover:text-white transition"
            >
              Restore
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  content,
  highlight,
}: {
  title: string;
  content: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        highlight ? "bg-flyfx-gold/10 border border-flyfx-gold/20" : "bg-flyfx-dark"
      }`}
    >
      <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">{title}</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}

// ─── ICONS ───────────────────────────────────────────────────
function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

function ThumbsUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M7 22V11M2 13v7a2 2 0 002 2h12.4a2 2 0 002-1.6l1.2-8A2 2 0 0017.6 10H14V5a3 3 0 00-3-3l-4 9v11" />
    </svg>
  );
}

function ThumbsDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M17 2v11M22 11V4a2 2 0 00-2-2H7.6a2 2 0 00-2 1.6l-1.2 8A2 2 0 006.4 14H10v5a3 3 0 003 3l4-9V2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function HubSpotIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 2v10m0 0l4-4m-4 4l-4-4M5 18h14a2 2 0 002-2v-4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IncomingIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M16 2v6h6M22 2l-8.5 8.5M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

// ─── LIVE SEARCH TYPES & CONSTANTS ──────────────────────────
type LiveMode = "normal" | "political" | "private_jets";

const VERTICALS = [
  { id: "energy_oil_gas", label: "Energy / Oil & Gas", color: "text-red-400 border-red-500/40 bg-red-500/10" },
  { id: "dangerous_goods", label: "Dangerous Goods", color: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
  { id: "automotive_aog", label: "Automotive / AOG", color: "text-blue-400 border-blue-500/40 bg-blue-500/10" },
  { id: "pharma_cold_chain", label: "Pharma / Cold Chain", color: "text-green-400 border-green-500/40 bg-green-500/10" },
  { id: "perishables_food", label: "Perishables / Food", color: "text-green-400 border-green-500/40 bg-green-500/10" },
  { id: "humanitarian", label: "Humanitarian / Aid", color: "text-red-400 border-red-500/40 bg-red-500/10" },
  { id: "general_air_freight", label: "General Air Freight", color: "text-flyfx-gold border-flyfx-gold/40 bg-flyfx-gold/10" },
];

const LIVE_MODES: { id: LiveMode; label: string; desc: string; activeClass: string }[] = [
  { id: "normal", label: "Freight", desc: "Freight forwarder verticals", activeClass: "bg-flyfx-gold/20 border-flyfx-gold text-flyfx-gold" },
  { id: "political", label: "Political", desc: "Crisis-driven leads", activeClass: "bg-red-500/20 border-red-500 text-red-400" },
  { id: "private_jets", label: "Private Jets", desc: "Operator ICP", activeClass: "bg-purple-500/20 border-purple-500 text-purple-400" },
];

// ─── LIVE SEARCH INTEL PANEL ────────────────────────────────
function LiveIntelPanel({ intel }: { intel: any }) {
  if (!intel) return null;
  const ms = intel.market_snapshot || {};
  const chains = intel.consequence_chains || [];
  return (
    <div className="bg-flyfx-card border border-flyfx-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-flyfx-border bg-red-500/10">
        <p className="text-[10px] uppercase tracking-widest text-red-400 font-bold">Live Intelligence</p>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {ms.brent_crude && (
            <div className="bg-flyfx-dark rounded-lg p-3">
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider">Brent</p>
              <p className="text-xl font-bold text-flyfx-gold">{ms.brent_crude}</p>
            </div>
          )}
          {ms.hormuz_status && (
            <div className="bg-flyfx-dark rounded-lg p-3">
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider">Hormuz</p>
              <p className="text-sm font-semibold text-red-400">{ms.hormuz_status}</p>
            </div>
          )}
        </div>
        {ms.talking_point && (
          <div className="bg-flyfx-gold/10 border border-flyfx-gold/20 rounded-lg p-3">
            <p className="text-[10px] text-flyfx-gold uppercase tracking-wider mb-1">Say this on every call</p>
            <p className="text-sm leading-relaxed italic">&ldquo;{ms.talking_point}&rdquo;</p>
          </div>
        )}
        {chains.length > 0 && (
          <div>
            <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-2">Consequence chains</p>
            {chains.slice(0, 3).map((c: any, i: number) => (
              <div key={i} className="bg-flyfx-dark rounded-lg p-3 mb-2 border border-flyfx-border">
                <p className={`text-xs font-semibold mb-1 ${c.urgency === "high" ? "text-red-400" : "text-amber-400"}`}>
                  {c.event}
                </p>
                <p className="text-xs text-flyfx-muted">&rarr; {c.charter_trigger}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LIVE LEAD CARD ─────────────────────────────────────────
function LiveLeadCard({ lead, script, index, total, onAction }: {
  lead: any;
  script: any;
  index: number;
  total: number;
  onAction: (dir: string, lead: any, script: any) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const hasPhone = !!(lead.phone_numbers?.length || lead.sanitized_phone);
  const phone = lead.phone_numbers?.[0]?.sanitized_number || lead.sanitized_phone || null;
  const email = lead.email || lead.contact_emails?.[0]?.email || null;
  const org = lead.organization?.name || lead.organization_name || "Unknown";
  const city = lead.city || "";
  const country = lead.country || "";
  const title = lead.title || "";
  const name = `${lead.first_name || ""} ${lead.last_name || lead.last_name_obfuscated || ""}`.trim();
  const employees = lead.organization?.estimated_num_employees || "";
  const linkedin = lead.linkedin_url || null;
  const priority = script?.priority || (hasPhone ? "warm" : "nurture");

  const priorityBadge = priority === "hot" ? "bg-red-500/20 text-red-400"
    : priority === "warm" ? "bg-amber-500/20 text-amber-400" : "bg-gray-500/20 text-gray-400";

  if (flipped) return (
    <div className="w-full max-w-md card-enter">
      <div className="bg-flyfx-card rounded-xl border border-flyfx-border overflow-hidden max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-flyfx-card px-4 py-3 border-b border-flyfx-border flex items-center justify-between">
          <p className="text-sm font-semibold truncate">{name} <span className="text-flyfx-muted text-xs">— {org}</span></p>
          <button onClick={() => setFlipped(false)} className="text-xs text-flyfx-muted border border-flyfx-border rounded px-2 py-1 hover:text-white transition">Back</button>
        </div>
        <div className="p-4 space-y-3">
          {script?.opening_line && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <p className="text-[10px] text-green-400 uppercase tracking-wider mb-1">Opening line</p>
              <p className="text-sm italic leading-relaxed">&ldquo;{script.opening_line}&rdquo;</p>
            </div>
          )}
          {script?.call_script && (
            <div className="bg-flyfx-dark rounded-lg p-3 border border-flyfx-border">
              <p className="text-[10px] text-flyfx-gold uppercase tracking-wider mb-1">Call script</p>
              <p className="text-sm leading-relaxed whitespace-pre-line">{script.call_script}</p>
            </div>
          )}
          {script?.cold_email && !hasPhone && (
            <div className="bg-flyfx-dark rounded-lg p-3 border border-flyfx-border">
              <p className="text-[10px] text-blue-400 uppercase tracking-wider mb-1">Cold email</p>
              {script.email_subject && <p className="text-xs text-flyfx-muted mb-2">Subject: <span className="text-white">{script.email_subject}</span></p>}
              <p className="text-sm leading-relaxed whitespace-pre-line">{script.cold_email}</p>
            </div>
          )}
          {script?.why_today && (
            <div className="bg-flyfx-dark rounded-lg p-3 border border-flyfx-border">
              <p className="text-[10px] text-amber-400 uppercase tracking-wider mb-1">Why today</p>
              <p className="text-sm leading-relaxed">{script.why_today}</p>
            </div>
          )}
          {script?.lead_differentiator && (
            <div className="bg-flyfx-gold/10 border border-flyfx-gold/20 rounded-lg p-3">
              <p className="text-[10px] text-flyfx-gold uppercase tracking-wider mb-1">Lead with</p>
              <p className="text-sm font-semibold">{script.lead_differentiator}</p>
            </div>
          )}
          {script?.objection && (
            <div className="bg-red-500/10 rounded-lg p-3">
              <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Objection handling</p>
              <p className="text-sm leading-relaxed">{script.objection}</p>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-flyfx-card border-t border-flyfx-border flex">
          {[["left", "Skip", "text-red-400"], ["save", "Save", "text-amber-400"], ["right", "Called", "text-green-400"]].map(([dir, label, col]) => (
            <button key={dir} onClick={() => { setFlipped(false); onAction(dir, lead, script); }}
              className={`flex-1 py-3 text-xs font-semibold ${col} hover:bg-white/[0.02] transition border-r border-flyfx-border last:border-r-0`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-md card-enter">
      <div className="bg-flyfx-card rounded-xl border border-flyfx-border overflow-hidden">
        {/* Top bar */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-flyfx-border">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${priorityBadge}`}>{priority}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${hasPhone ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"}`}>
              {hasPhone ? "CALL" : "EMAIL"}
            </span>
          </div>
          <span className="text-xs text-flyfx-muted">{index + 1} / {total}</span>
        </div>
        {/* Identity */}
        <div className="p-4">
          <h3 className="text-2xl font-light tracking-tight">{name}</h3>
          <p className="text-sm text-flyfx-gold mt-1">{title}</p>
          <p className="text-xs text-flyfx-muted mt-0.5">{org} &middot; {[city, country].filter(Boolean).join(", ")}</p>
          {employees && <p className="text-[10px] text-flyfx-muted mt-1">~{employees} staff</p>}
        </div>
        {/* Contact actions */}
        <div className="px-4 pb-3 space-y-1.5">
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm font-medium">
              <PhoneIcon /> {phone}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="flex items-center gap-2 px-3 py-2 bg-flyfx-dark border border-flyfx-border rounded-lg text-xs">
              <MailIcon /> {email}
            </a>
          )}
          {linkedin && (
            <a href={linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-xs">
              LinkedIn
            </a>
          )}
        </div>
        {/* Script preview */}
        {script?.opening_line && (
          <div className="px-4 pb-3">
            <div className="bg-flyfx-dark rounded-lg p-3 border border-flyfx-border">
              <p className="text-[10px] text-flyfx-gold uppercase tracking-wider mb-1">Opening line</p>
              <p className="text-sm italic leading-relaxed">&ldquo;{script.opening_line}&rdquo;</p>
            </div>
          </div>
        )}
        {/* Flip button */}
        <div className="px-4 pb-3">
          <button onClick={() => setFlipped(true)} className="w-full py-2 rounded-lg bg-white/[0.02] border border-flyfx-border text-xs text-flyfx-muted hover:text-white transition">
            Full script &amp; intelligence
          </button>
        </div>
        {/* Actions */}
        <div className="flex border-t border-flyfx-border">
          {[["left", "Skip", "text-red-400"], ["save", "Save", "text-amber-400"], ["right", "Called", "text-green-400"]].map(([dir, label, col]) => (
            <button key={dir} onClick={() => onAction(dir, lead, script)}
              className={`flex-1 py-3 text-xs font-semibold ${col} hover:bg-white/[0.02] transition border-r border-flyfx-border last:border-r-0`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LIVE SEARCH VIEW ───────────────────────────────────────
function LiveSearchView() {
  const [mode, setMode] = useState<LiveMode>("normal");
  const [vertical, setVertical] = useState("energy_oil_gas");
  const [leads, setLeads] = useState<any[]>([]);
  const [scripts, setScripts] = useState<Record<string, any>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [actioned, setActioned] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intel, setIntel] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"deck" | "saved">("deck");

  const fetchLeads = useCallback(async (newMode?: LiveMode, newVertical?: string, newPage?: number) => {
    const m = newMode || mode;
    const v = newVertical || vertical;
    const p = newPage || page;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: m,
          vertical: v,
          page: p,
          ...(m === "political" && intel?.consequence_chains?.[0]?.apollo_search
            ? { customSearch: intel.consequence_chains[0].apollo_search }
            : {}),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const newLeads = data.people || [];
      if (p > 1) {
        setLeads((prev) => [...prev, ...newLeads]);
      } else {
        setLeads(newLeads);
        setCurrentIdx(0);
        setActioned([]);
      }
      setPage(p);
      if (newLeads.length > 0) generateScripts(newLeads, m);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [mode, vertical, page, intel]);

  const generateScripts = async (leadsToScript: any[], currentMode: LiveMode) => {
    setLoadingScripts(true);
    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_scripts", leads: leadsToScript.slice(0, 20), mode: currentMode }),
      });
      const data = await res.json();
      if (data.scripts) {
        const map: Record<string, any> = {};
        data.scripts.forEach((s: any, i: number) => { if (leadsToScript[i]) map[leadsToScript[i].id] = s; });
        setScripts((prev) => ({ ...prev, ...map }));
      }
    } catch (e) {
      console.error("Script generation failed:", e);
    }
    setLoadingScripts(false);
  };

  const runPoliticalScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "political_scan" }),
      });
      const data = await res.json();
      if (data.intelligence) {
        setIntel(data.intelligence);
        const chain = data.intelligence.consequence_chains?.[0];
        if (chain?.apollo_search) {
          const leadsRes = await fetch("/api/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "political", customSearch: chain.apollo_search, page: 1 }),
          });
          const leadsData = await leadsRes.json();
          setLeads(leadsData.people || []);
          setCurrentIdx(0);
          setActioned([]);
          if (leadsData.people?.length) generateScripts(leadsData.people, "political");
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleModeChange = (newMode: LiveMode) => {
    setMode(newMode);
    setLeads([]);
    setScripts({});
    setCurrentIdx(0);
    setActioned([]);
    setIntel(null);
    setPage(1);
    setView("deck");
  };

  const handleAction = (dir: string, lead: any, script: any) => {
    setActioned((prev) => [...prev, { ...lead, script, action: dir, ts: new Date().toISOString() }]);
    setTimeout(() => setCurrentIdx((prev) => prev + 1), 50);
  };

  const currentLead = leads[currentIdx];
  const savedLeads = actioned.filter((a) => a.action === "save");
  const calledLeads = actioned.filter((a) => a.action === "right");
  const remaining = leads.length - currentIdx;
  const allDone = currentIdx >= leads.length && leads.length > 0;

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex justify-center gap-2">
        {LIVE_MODES.map((m) => (
          <button key={m.id} onClick={() => handleModeChange(m.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition ${
              mode === m.id ? m.activeClass : "border-flyfx-border text-flyfx-muted hover:text-white"
            }`}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Vertical selector (Freight mode) */}
      {mode === "normal" && (
        <div className="flex justify-center gap-1.5 flex-wrap">
          {VERTICALS.map((v) => (
            <button key={v.id} onClick={() => { setVertical(v.id); fetchLeads("normal", v.id, 1); }}
              className={`px-3 py-1.5 rounded-md text-[10px] font-medium border transition ${
                vertical === v.id ? v.color : "border-flyfx-border text-flyfx-muted hover:text-white"
              }`}>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="flex justify-center gap-6">
        {[
          { l: "Leads", v: leads.length, c: "text-white" },
          { l: "Remaining", v: Math.max(remaining, 0), c: "text-flyfx-gold" },
          { l: "Called", v: calledLeads.length, c: "text-green-400" },
          { l: "Saved", v: savedLeads.length, c: "text-amber-400" },
        ].map((s, i) => (
          <div key={i} className="text-center">
            <p className={`text-lg font-bold ${s.c}`}>{s.v}</p>
            <p className="text-[9px] text-flyfx-muted uppercase tracking-wider">{s.l}</p>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex justify-center gap-2">
        <button onClick={() => setView("deck")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${view === "deck" ? "bg-flyfx-gold/20 border-flyfx-gold text-flyfx-gold" : "border-flyfx-border text-flyfx-muted"}`}>
          Deck
        </button>
        <button onClick={() => setView("saved")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${view === "saved" ? "bg-amber-500/20 border-amber-500 text-amber-400" : "border-flyfx-border text-flyfx-muted"}`}>
          Saved ({savedLeads.length})
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-xs text-red-400 flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">x</button>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col items-center">
        {/* Empty state */}
        {leads.length === 0 && !loading && view === "deck" && (
          <div className="text-center py-16 space-y-4">
            <p className="text-5xl opacity-20">
              {mode === "political" ? "🌍" : mode === "private_jets" ? "✈️" : "📦"}
            </p>
            <h2 className="text-xl font-light">
              {mode === "political" ? "Political Mode" : mode === "private_jets" ? "Private Jets Mode" : "Freight Mode"}
            </h2>
            <p className="text-sm text-flyfx-muted max-w-sm mx-auto leading-relaxed">
              {mode === "political"
                ? "Claude will search today's news, build consequence chains, and find leads directly affected by the current crisis."
                : mode === "private_jets"
                ? "Search Apollo for private jet operators matching the FlyFX Visuals ICP."
                : "Select a vertical above, or hit the button to search."}
            </p>
            <button onClick={() => mode === "political" ? runPoliticalScan() : fetchLeads(mode, vertical, 1)}
              className={`px-6 py-3 rounded-lg text-sm font-semibold text-black ${
                mode === "political" ? "bg-red-500" : mode === "private_jets" ? "bg-purple-500" : "bg-flyfx-gold"
              }`}>
              {mode === "political" ? "Run intelligence scan" : "Search for 20 leads"}
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <p className="text-sm text-flyfx-gold animate-pulse">
              {mode === "political" ? "Scanning news and building consequence chains..." : "Searching Apollo..."}
            </p>
            <p className="text-xs text-flyfx-muted mt-2">This takes 15-30 seconds</p>
          </div>
        )}

        {/* Script loading */}
        {loadingScripts && !loading && (
          <p className="text-xs text-flyfx-gold bg-flyfx-gold/10 px-4 py-2 rounded-lg mb-3">
            Claude is generating personalised scripts...
          </p>
        )}

        {/* Intel panel */}
        {mode === "political" && intel && view === "deck" && <div className="w-full max-w-md mb-3"><LiveIntelPanel intel={intel} /></div>}

        {/* Card view */}
        {view === "deck" && !loading && currentLead && (
          <LiveLeadCard
            key={currentIdx}
            lead={currentLead}
            script={scripts[currentLead.id] || null}
            index={currentIdx}
            total={leads.length}
            onAction={handleAction}
          />
        )}

        {/* All done */}
        {view === "deck" && allDone && !loading && (
          <div className="text-center py-16 space-y-4">
            <p className="text-5xl">✓</p>
            <h2 className="text-xl font-light">Deck complete</h2>
            <p className="text-sm text-flyfx-muted">
              {calledLeads.length} called &middot; {savedLeads.length} saved &middot; {actioned.filter((a) => a.action === "left").length} skipped
            </p>
            <button onClick={() => { setPage((p) => p + 1); fetchLeads(mode, vertical, page + 1); }}
              className="px-6 py-3 rounded-lg text-sm font-semibold border border-flyfx-gold text-flyfx-gold bg-flyfx-gold/10">
              Load 20 more
            </button>
          </div>
        )}

        {/* Saved view */}
        {view === "saved" && (
          <div className="w-full max-w-md space-y-2">
            <h3 className="text-lg font-light mb-3">Saved leads</h3>
            {savedLeads.length === 0 ? (
              <p className="text-center text-flyfx-muted text-sm py-8">No saved leads yet</p>
            ) : savedLeads.map((lead, i) => {
              const phone = lead.phone_numbers?.[0]?.sanitized_number || lead.sanitized_phone;
              const email = lead.email || lead.contact_emails?.[0]?.email;
              return (
                <div key={i} className="bg-flyfx-card rounded-lg p-3 border border-flyfx-border">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{lead.first_name} {lead.last_name || ""}</p>
                      <p className="text-xs text-flyfx-gold">{lead.title} — {lead.organization?.name || lead.organization_name}</p>
                    </div>
                    <div className="flex gap-1">
                      {phone && <a href={`tel:${phone}`} className="px-2 py-1 bg-green-500/10 rounded text-[10px] text-green-400">Call</a>}
                      {email && <a href={`mailto:${email}`} className="px-2 py-1 bg-blue-500/10 rounded text-[10px] text-blue-400">Email</a>}
                    </div>
                  </div>
                  {lead.script?.opening_line && (
                    <p className="text-xs text-flyfx-muted italic mt-2 leading-relaxed">&ldquo;{lead.script.opening_line}&rdquo;</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COACH VIEW ─────────────────────────────────────────────
function CoachView({ deals }: { deals?: Deal[] }) {
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [customLead, setCustomLead] = useState({ name: "", title: "", company: "", city: "", country: "", employees: "", specialisation: "" });
  const [brief, setBrief] = useState<CoachBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceMessages, setPracticeMessages] = useState<PracticeMessage[]>([]);
  const [practiceInput, setPracticeInput] = useState("");
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [inputMode, setInputMode] = useState<"select" | "custom">("select");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const kyleDeals = deals?.filter(d => d.assignedTo === "kyle" || d.assignedTo === "shared") || [];

  const getCoachBrief = async (lead: any) => {
    setLoading(true);
    setBrief(null);
    setPracticeMode(false);
    setPracticeMessages([]);
    setFeedback(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "brief", lead }),
      });
      const json = await res.json();
      if (json.brief) setBrief(json.brief);
    } catch {}
    setLoading(false);
  };

  const sendPractice = async () => {
    if (!practiceInput.trim()) return;
    const lead = selectedDeal || customLead;
    const newMsg: PracticeMessage = { role: "kyle", text: practiceInput.trim() };
    const updated = [...practiceMessages, newMsg];
    setPracticeMessages(updated);
    setPracticeInput("");
    setPracticeLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "practice", lead, messages: updated }),
      });
      const json = await res.json();
      if (json.response) {
        setPracticeMessages(prev => [...prev, { role: "prospect", text: json.response }]);
      }
    } catch {}
    setPracticeLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const getFeedback = async () => {
    const lead = selectedDeal || customLead;
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feedback", lead, messages: practiceMessages }),
      });
      const json = await res.json();
      if (json.feedback) setFeedback(json.feedback);
    } catch {}
    setFeedbackLoading(false);
  };

  const readinessColor = brief?.readiness === "ready" ? "text-green-400 bg-green-500/20 border-green-500/30"
    : brief?.readiness === "needs_prep" ? "text-amber-400 bg-amber-500/20 border-amber-500/30"
    : "text-red-400 bg-red-500/20 border-red-500/30";

  return (
    <div className="space-y-4">
      {/* Lead Selector */}
      <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Select a lead to coach</h2>
          <div className="flex items-center gap-0.5 bg-flyfx-dark rounded-lg p-0.5 border border-flyfx-border">
            <button onClick={() => setInputMode("select")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${inputMode === "select" ? "bg-flyfx-gold text-black" : "text-flyfx-muted"}`}>
              From deals
            </button>
            <button onClick={() => setInputMode("custom")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${inputMode === "custom" ? "bg-flyfx-gold text-black" : "text-flyfx-muted"}`}>
              Custom
            </button>
          </div>
        </div>

        {inputMode === "select" ? (
          kyleDeals.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {kyleDeals.map((d) => (
                <button key={d.rank} onClick={() => { setSelectedDeal(d); getCoachBrief(d); }}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition ${
                    selectedDeal?.rank === d.rank
                      ? "border-flyfx-gold bg-flyfx-gold/10"
                      : "border-flyfx-border hover:border-flyfx-gold/40"
                  }`}>
                  <span className="font-semibold">{d.name}</span>
                  <span className="text-flyfx-muted ml-1">— {d.title} at {d.company}, {d.city}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-flyfx-muted text-xs">No daily deals loaded. Use custom input or load deals first.</p>
          )
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(["name", "title", "company", "city", "country", "specialisation"] as const).map((field) => (
              <input key={field} placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                value={customLead[field]} onChange={(e) => setCustomLead(prev => ({ ...prev, [field]: e.target.value }))}
                className="px-3 py-2 bg-flyfx-dark border border-flyfx-border rounded-lg text-xs text-white outline-none focus:border-flyfx-gold transition" />
            ))}
            <button onClick={() => getCoachBrief(customLead)} disabled={!customLead.name || !customLead.company || loading}
              className="col-span-2 py-2 bg-flyfx-gold text-black rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50">
              {loading ? "Analysing..." : "Coach me"}
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-8 text-center">
          <div className="animate-pulse text-flyfx-gold text-sm">Analysing lead and preparing your coaching brief...</div>
        </div>
      )}

      {/* Coaching Brief */}
      {brief && !practiceMode && (
        <div className="bg-flyfx-card border border-flyfx-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-flyfx-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Pre-Call Brief</h3>
            <span className={`text-[10px] font-bold px-2 py-1 rounded border uppercase ${readinessColor}`}>
              {brief.readiness === "ready" ? "Ready to call" : brief.readiness === "needs_prep" ? "Needs prep" : "Consider skipping"}
            </span>
          </div>
          <div className="p-4 space-y-4">
            {/* Confidence */}
            <div className="bg-flyfx-dark rounded-lg p-3 border border-flyfx-border">
              <p className="text-xs leading-relaxed">{brief.confidenceNote}</p>
            </div>
            {/* Approach */}
            <div>
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">Approach</p>
              <p className="text-xs leading-relaxed">{brief.approach}</p>
            </div>
            {/* Opening Line */}
            <div className="bg-flyfx-gold/10 border border-flyfx-gold/20 rounded-lg p-3">
              <p className="text-[10px] text-flyfx-gold uppercase tracking-wider mb-1">Your opening line</p>
              <p className="text-sm leading-relaxed italic">&ldquo;{brief.openingLine}&rdquo;</p>
            </div>
            {/* Talking Points */}
            <div>
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">Key talking points</p>
              <ul className="space-y-1">
                {brief.keyTalkingPoints.map((p, i) => (
                  <li key={i} className="text-xs text-flyfx-muted flex items-start gap-2">
                    <span className="text-flyfx-gold mt-0.5">&#x2022;</span>{p}
                  </li>
                ))}
              </ul>
            </div>
            {/* Objections */}
            <div>
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">Likely objections</p>
              <div className="space-y-2">
                {brief.likelyObjections.map((o, i) => (
                  <div key={i} className="bg-red-500/5 border border-red-500/10 rounded-lg p-2.5">
                    <p className="text-xs font-semibold text-red-400 mb-1">&ldquo;{o.objection}&rdquo;</p>
                    <p className="text-xs text-flyfx-muted">{o.response}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* What not to say */}
            <div>
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">Avoid saying</p>
              <div className="flex flex-wrap gap-1.5">
                {brief.whatNotToSay.map((w, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{w}</span>
                ))}
              </div>
            </div>
            {/* Score Explanation */}
            <div className="bg-flyfx-dark rounded-lg p-3 border border-flyfx-border">
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">ICP score analysis</p>
              <p className="text-xs leading-relaxed text-flyfx-muted">{brief.scoreExplanation}</p>
            </div>
            {/* Next Step */}
            <div>
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">If interested — propose this</p>
              <p className="text-xs leading-relaxed">{brief.nextStep}</p>
            </div>
            {/* Practice button */}
            <button onClick={() => { setPracticeMode(true); setPracticeMessages([]); setFeedback(null); }}
              className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-500 transition">
              Practice this call
            </button>
          </div>
        </div>
      )}

      {/* Practice Mode */}
      {practiceMode && (
        <div className="bg-flyfx-card border border-flyfx-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-flyfx-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Practice call — {(selectedDeal || customLead).name}</h3>
            <button onClick={() => setPracticeMode(false)} className="text-xs text-flyfx-muted hover:text-white transition">Back to brief</button>
          </div>
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {practiceMessages.length === 0 && (
              <p className="text-xs text-flyfx-muted text-center py-4">Type your opening line to start the call. The prospect has just picked up the phone.</p>
            )}
            {practiceMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "kyle" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                  msg.role === "kyle"
                    ? "bg-flyfx-gold/20 text-white border border-flyfx-gold/30"
                    : "bg-flyfx-dark text-flyfx-muted border border-flyfx-border"
                }`}>
                  <p className="text-[10px] font-bold mb-0.5 uppercase tracking-wider opacity-60">
                    {msg.role === "kyle" ? "You (Kyle)" : "Prospect"}
                  </p>
                  {msg.text}
                </div>
              </div>
            ))}
            {practiceLoading && (
              <div className="flex justify-start">
                <div className="bg-flyfx-dark border border-flyfx-border rounded-xl px-3 py-2 text-xs text-flyfx-muted animate-pulse">
                  Prospect is thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t border-flyfx-border p-3 space-y-2">
            <div className="flex gap-2">
              <input value={practiceInput} onChange={(e) => setPracticeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !practiceLoading && sendPractice()}
                placeholder="What do you say?"
                className="flex-1 px-3 py-2 bg-flyfx-dark border border-flyfx-border rounded-lg text-xs text-white outline-none focus:border-flyfx-gold transition" />
              <button onClick={sendPractice} disabled={practiceLoading || !practiceInput.trim()}
                className="px-4 py-2 bg-flyfx-gold text-black rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50">
                Send
              </button>
            </div>
            {practiceMessages.length >= 4 && !feedback && (
              <button onClick={getFeedback} disabled={feedbackLoading}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-500 transition disabled:opacity-50">
                {feedbackLoading ? "Analysing..." : "Get coach feedback"}
              </button>
            )}
          </div>
          {/* Feedback */}
          {feedback && (
            <div className="border-t border-flyfx-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">Coach Feedback</h4>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  feedback.grade === "A" ? "bg-green-500/20 text-green-400"
                    : feedback.grade === "B" ? "bg-blue-500/20 text-blue-400"
                    : feedback.grade === "C" ? "bg-amber-500/20 text-amber-400"
                    : "bg-red-500/20 text-red-400"
                }`}>Grade: {feedback.grade}</span>
              </div>
              <p className="text-xs leading-relaxed">{feedback.overallNote}</p>
              {feedback.whatWorked?.length > 0 && (
                <div>
                  <p className="text-[10px] text-green-400 uppercase tracking-wider mb-1">What worked</p>
                  {feedback.whatWorked.map((w: string, i: number) => (
                    <p key={i} className="text-xs text-flyfx-muted">+ {w}</p>
                  ))}
                </div>
              )}
              {feedback.whatToImprove?.length > 0 && (
                <div>
                  <p className="text-[10px] text-amber-400 uppercase tracking-wider mb-1">What to improve</p>
                  {feedback.whatToImprove.map((w: string, i: number) => (
                    <p key={i} className="text-xs text-flyfx-muted">- {w}</p>
                  ))}
                </div>
              )}
              {feedback.missedOpportunity && (
                <div className="bg-flyfx-dark rounded-lg p-2.5 border border-flyfx-border">
                  <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">Missed opportunity</p>
                  <p className="text-xs leading-relaxed">{feedback.missedOpportunity}</p>
                </div>
              )}
              <button onClick={() => { setPracticeMessages([]); setFeedback(null); }}
                className="w-full py-2 bg-flyfx-card border border-flyfx-border rounded-lg text-xs text-flyfx-muted hover:text-white transition">
                Practice again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PIPELINE VIEW ───────────────────────────────────────────
const PIPELINE_PHASES = [
  { phase: 1, name: "Memory" },
  { phase: 2, name: "Market Intelligence" },
  { phase: 3, name: "Consequence Chains" },
  { phase: 4, name: "Apollo Discovery" },
  { phase: 5, name: "ICP Scoring" },
  { phase: 6, name: "Apollo Enrichment" },
  { phase: 7, name: "HubSpot Dedup" },
  { phase: 8, name: "Kyle/Gus Split" },
  { phase: 9, name: "Script Generation" },
  { phase: 10, name: "Saving" },
];

function PipelineView({ onDealsLoaded }: { onDealsLoaded: (data: DailyData) => void }) {
  const [running, setRunning] = useState(false);
  const [phases, setPhases] = useState<PipelinePhase[]>(
    PIPELINE_PHASES.map((p) => ({ ...p, status: "pending", message: "" }))
  );
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const updatePhase = (phaseNum: number, update: Partial<PipelinePhase>) => {
    setPhases((prev) =>
      prev.map((p) => (p.phase === phaseNum ? { ...p, ...update } : p))
    );
  };

  const runPipeline = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    setPhases(PIPELINE_PHASES.map((p) => ({ ...p, status: "pending", message: "" })));

    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      if (!res.ok || !res.body) {
        setError("Pipeline failed to start");
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.trim().split("\n");
          let eventType = "phase";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          try {
            const payload = JSON.parse(dataStr);
            if (eventType === "phase") {
              updatePhase(payload.phase, {
                status: payload.status,
                message: payload.message,
                data: payload.data,
              });
            } else if (eventType === "complete") {
              setResult(payload);
              setLastRun(new Date().toLocaleTimeString());
              // Reload daily data
              try {
                const dealsRes = await fetch("/api/deals");
                if (dealsRes.ok) {
                  const json = await dealsRes.json();
                  if (json.data?.deals?.length > 0) {
                    setTimeout(() => onDealsLoaded(json.data), 1500);
                  }
                }
              } catch {}
            } else if (eventType === "error") {
              setError(payload.message);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setError(e.message || "Pipeline error");
    }

    setRunning(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold">Run Today's Pipeline</h2>
            <p className="text-xs text-flyfx-muted mt-0.5">
              Searches Apollo, scores 6 verticals, enriches top 35, deduplicates HubSpot, generates scripts. ~2–3 minutes.
            </p>
          </div>
          {lastRun && (
            <span className="text-[10px] text-flyfx-muted">Last run: {lastRun}</span>
          )}
        </div>

        <button
          onClick={runPipeline}
          disabled={running}
          className="w-full py-3.5 bg-flyfx-gold text-black font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2"
        >
          {running ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin flex-shrink-0">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              Pipeline running...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Run Today's Deals
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && !running && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-green-400">Pipeline complete</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { l: "Deals", v: result.deals, c: "text-white" },
              { l: "HOT", v: result.hot, c: "text-red-400" },
              { l: "Kyle", v: result.kyle, c: "text-blue-400" },
              { l: "Gus", v: result.gus, c: "text-purple-400" },
            ].map((s) => (
              <div key={s.l} className="bg-flyfx-dark rounded-lg p-2 text-center">
                <p className={`text-lg font-bold ${s.c}`}>{s.v}</p>
                <p className="text-[9px] text-flyfx-muted uppercase">{s.l}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-green-400">Switching to Daily tab in a moment...</p>
        </div>
      )}

      {/* Phase progress */}
      {(running || phases.some((p) => p.status !== "pending")) && (
        <div className="bg-flyfx-card border border-flyfx-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-flyfx-border">
            <p className="text-[10px] uppercase tracking-widest text-flyfx-muted font-semibold">Pipeline progress</p>
          </div>
          <div className="divide-y divide-flyfx-border">
            {phases.map((p) => (
              <div key={p.phase} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {p.status === "done" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-400">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : p.status === "running" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-flyfx-gold">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  ) : p.status === "error" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400">
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-flyfx-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      p.status === "done" ? "text-white" :
                      p.status === "running" ? "text-flyfx-gold" :
                      p.status === "error" ? "text-red-400" :
                      "text-flyfx-muted"
                    }`}>
                      {p.name}
                    </span>
                    <span className="text-[10px] text-flyfx-muted truncate">{p.message}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What it does — shown when idle */}
      {!running && phases.every((p) => p.status === "pending") && (
        <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-flyfx-muted font-semibold">What happens when you hit Run</p>
          <div className="space-y-2">
            {[
              ["1", "Live market data", "Fetches Brent, TTF gas, Hormuz status from the web"],
              ["2", "Crisis chains", "Claude traces today's events into charter demand chains"],
              ["3", "Apollo search", "Searches 6 verticals across European logistics hubs"],
              ["4", "ICP scoring", "Scores every contact across 6 dimensions (100 points)"],
              ["5", "Enrichment", "Reveals phone numbers and verified emails for top 35"],
              ["6", "HubSpot dedup", "Removes Gus's contacts and flags existing CRM entries"],
              ["7", "Scripts", "Generates personalised opening lines and objection responses"],
              ["8", "Save", "Writes today's deals to the app — available instantly on Daily tab"],
            ].map(([n, title, desc]) => (
              <div key={n} className="flex items-start gap-3">
                <span className="text-[10px] w-4 h-4 rounded-full bg-flyfx-gold/20 text-flyfx-gold font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                <div>
                  <p className="text-xs font-medium">{title}</p>
                  <p className="text-[10px] text-flyfx-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-flyfx-muted border-t border-flyfx-border pt-3">
            Requires Vercel Pro plan for the 5-minute function timeout. Works locally without any plan restrictions.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── GRANOLA VIEW ────────────────────────────────────────────
function GranolaView({ deals }: { deals?: Deal[] }) {
  const [transcript, setTranscript] = useState("");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch("/api/granola")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  const analyseTranscript = async () => {
    if (!transcript.trim()) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/granola", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          dealContext: selectedDeal ? {
            name: selectedDeal.name,
            company: selectedDeal.company,
            title: selectedDeal.title,
          } : null,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis);

      // Auto-log outcome to memory
      if (data.analysis?.outcome) {
        await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "log_outcome",
            contactName: data.analysis.contactName || selectedDeal?.name,
            company: data.analysis.company || selectedDeal?.company,
            outcome: data.analysis.outcome,
            notes: data.analysis.outcomeDetail,
            angle: data.analysis.angleWorked,
          }),
        });
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const addToDnc = async (company: string, contactName: string, reason: string) => {
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_dnc", company, contactName, reason }),
    });
  };

  const outcomeBadge = (outcome: string) => {
    const map: Record<string, string> = {
      meeting_booked: "bg-green-500/20 text-green-400",
      positive: "bg-green-500/20 text-green-400",
      neutral: "bg-amber-500/20 text-amber-400",
      rejection: "bg-red-500/20 text-red-400",
      dead_vertical: "bg-red-500/20 text-red-400",
      voicemail: "bg-gray-500/20 text-gray-400",
      no_answer: "bg-gray-500/20 text-gray-400",
    };
    return map[outcome] || "bg-gray-500/20 text-gray-400";
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {stats?.stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { l: "Calls", v: stats.stats.totalCalls, c: "text-white" },
            { l: "Meetings", v: stats.stats.meetingsBooked, c: "text-green-400" },
            { l: "Positive", v: stats.stats.positiveResponses, c: "text-flyfx-gold" },
            { l: "Conv %", v: `${stats.stats.conversionRate}%`, c: "text-blue-400" },
          ].map((s) => (
            <div key={s.l} className="bg-flyfx-card border border-flyfx-border rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${s.c}`}>{s.v}</p>
              <p className="text-[9px] text-flyfx-muted uppercase tracking-wider mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
      )}

      {/* Transcript input */}
      <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">Analyse a call transcript</h2>
        <p className="text-xs text-flyfx-muted">Paste a transcript from Granola, Fireflies, or any notes. Claude extracts the outcome, updates memory, and gives coaching notes.</p>

        {/* Optional: link to a deal */}
        {deals && deals.length > 0 && (
          <div>
            <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1.5">Link to deal (optional)</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {deals.slice(0, 10).map((d) => (
                <button key={d.rank} onClick={() => setSelectedDeal(selectedDeal?.rank === d.rank ? null : d)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition ${selectedDeal?.rank === d.rank ? "border-flyfx-gold bg-flyfx-gold/10" : "border-flyfx-border hover:border-flyfx-gold/40"}`}>
                  {d.name} — {d.company}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste transcript or call notes here... (e.g. 'Called John Smith at ABC Logistics. He said they do handle air freight but have an existing broker at Chapman Freeborn. Willing to be a backup option. Will send email.')"
          className="w-full h-32 px-3 py-2 bg-flyfx-dark border border-flyfx-border rounded-lg text-xs text-white outline-none focus:border-flyfx-gold transition resize-none"
        />

        <button onClick={analyseTranscript} disabled={loading || !transcript.trim()}
          className="w-full py-2.5 bg-flyfx-gold text-black rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50">
          {loading ? "Analysing..." : "Analyse call"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">{error}</div>
      )}

      {/* Analysis result */}
      {analysis && (
        <div className="bg-flyfx-card border border-flyfx-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-flyfx-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Call analysis</h3>
            {analysis.outcome && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${outcomeBadge(analysis.outcome)}`}>
                {analysis.outcome.replace("_", " ")}
              </span>
            )}
          </div>
          <div className="p-4 space-y-3">
            {analysis.outcomeDetail && (
              <div className="bg-flyfx-dark rounded-lg p-3 border border-flyfx-border">
                <p className="text-xs leading-relaxed">{analysis.outcomeDetail}</p>
              </div>
            )}
            {analysis.coachingNote && (
              <div className="bg-flyfx-gold/10 border border-flyfx-gold/20 rounded-lg p-3">
                <p className="text-[10px] text-flyfx-gold uppercase tracking-wider mb-1">Coach note</p>
                <p className="text-xs leading-relaxed">{analysis.coachingNote}</p>
              </div>
            )}
            {analysis.angleWorked && (
              <div>
                <p className="text-[10px] text-green-400 uppercase tracking-wider mb-1">What worked</p>
                <p className="text-xs text-flyfx-muted">{analysis.angleWorked}</p>
              </div>
            )}
            {analysis.angleFailure && (
              <div>
                <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1">What didn't work</p>
                <p className="text-xs text-flyfx-muted">{analysis.angleFailure}</p>
              </div>
            )}
            {analysis.nextAction && analysis.nextAction !== "none" && (
              <div className="bg-flyfx-dark rounded-lg p-3 border border-flyfx-border">
                <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">Next action</p>
                <p className="text-xs font-semibold">{analysis.nextAction.replace("_", " ")}</p>
                {analysis.callbackDate && <p className="text-xs text-flyfx-muted mt-0.5">Callback: {analysis.callbackDate}</p>}
              </div>
            )}
            {/* Memory update buttons */}
            {analysis.memoryUpdates?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-flyfx-muted uppercase tracking-wider">Suggested memory updates</p>
                {analysis.memoryUpdates.map((u: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 bg-flyfx-dark rounded-lg p-2.5 border border-flyfx-border">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0 ${
                      u.type === "add_dnc" ? "bg-red-500/20 text-red-400" :
                      u.type === "winning_angle" ? "bg-green-500/20 text-green-400" :
                      "bg-amber-500/20 text-amber-400"
                    }`}>{u.type.replace("_", " ")}</span>
                    <p className="text-xs text-flyfx-muted flex-1">{u.description}</p>
                    {u.type === "add_dnc" && analysis.company && (
                      <button onClick={() => addToDnc(analysis.company, analysis.contactName, analysis.outcomeDetail || "Flagged by Granola")}
                        className="text-[10px] px-2 py-1 bg-red-500/20 text-red-400 rounded border border-red-500/20 hover:bg-red-500/30 transition flex-shrink-0">
                        Add DNC
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top angles */}
      {stats?.topAngles?.length > 0 && (
        <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-flyfx-muted font-semibold">Top working angles</p>
          {stats.topAngles.map((a: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-flyfx-gold w-4">{a.count}×</span>
              <p className="text-xs text-flyfx-muted">{a.angle}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AGENT VIEW ─────────────────────────────────────────────
function AgentView({ data }: { data?: DailyData | null }) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const SUGGESTIONS = [
    "What verticals should I focus on this week?",
    "Build a consequence chain for the current oil price movement",
    "How should I handle 'we already have a broker'?",
    "Critique my opening: 'Hi, Kyle from FlyFX, we do air cargo charters'",
    "What's the difference between a HOT and WARM lead?",
    "Generate a script for an energy logistics forwarder in Aberdeen",
  ];

  const buildContext = () => {
    if (!data) return undefined;
    const called = data.deals.filter(d => d.phone).length;
    const email = data.deals.filter(d => !d.phone && d.email).length;
    return `Today's deals: ${data.deals.length} loaded (${called} call track, ${email} email track). Date: ${data.date}. Market: Brent ${data.marketSnapshot.brent}, Hormuz: ${data.marketSnapshot.hormuzStatus}. Top talking point: ${data.marketSnapshot.topTalkingPoint}`;
  };

  const sendMessage = async (text?: string) => {
    const content = text || input.trim();
    if (!content) return;
    setInput("");

    const userMsg: AgentMessage = { role: "user", content };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    const assistantMsg: AgentMessage = { role: "assistant", content: "" };
    setMessages([...updated, assistantMsg]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          context: messages.length === 0 ? buildContext() : undefined,
        }),
      });

      if (!res.ok) {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: "Failed to connect to the agent. Check your API key." };
          return copy;
        });
        setLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: accumulated };
          return copy;
        });
      }
    } catch {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "Connection error. Please try again." };
        return copy;
      });
    }
    setLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // Simple markdown-ish rendering
  const renderText = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <h3 key={i} className="text-sm font-bold mt-3 mb-1">{line.slice(3)}</h3>;
      if (line.startsWith("### ")) return <h4 key={i} className="text-xs font-bold mt-2 mb-1 text-flyfx-gold">{line.slice(4)}</h4>;
      if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="text-xs font-bold mt-1">{line.slice(2, -2)}</p>;
      if (line.startsWith("- ")) return <p key={i} className="text-xs text-flyfx-muted ml-3">{line}</p>;
      if (line.match(/^\d+\. /)) return <p key={i} className="text-xs text-flyfx-muted ml-3">{line}</p>;
      if (line.trim() === "") return <br key={i} />;
      // Inline bold
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className="text-xs leading-relaxed">
          {parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**")
              ? <strong key={j} className="font-semibold text-white">{part.slice(2, -2)}</strong>
              : part
          )}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-6">
            <div>
              <h2 className="text-lg font-bold">FlyFX Sales Agent</h2>
              <p className="text-flyfx-muted text-xs mt-1">
                Your specialist cargo charter sales strategist. Ask anything about ICP scoring, scripts, verticals, market analysis, or objection handling.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => sendMessage(s)}
                  className="text-left px-3 py-2.5 bg-flyfx-card border border-flyfx-border rounded-lg text-xs text-flyfx-muted hover:text-white hover:border-flyfx-gold/40 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-3 py-2.5 rounded-xl ${
              msg.role === "user"
                ? "bg-flyfx-gold/20 border border-flyfx-gold/30"
                : "bg-flyfx-card border border-flyfx-border"
            }`}>
              {msg.role === "user"
                ? <p className="text-xs leading-relaxed">{msg.content}</p>
                : <div className="text-flyfx-muted">{msg.content ? renderText(msg.content) : <span className="text-xs animate-pulse">Thinking...</span>}</div>
              }
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-flyfx-border pt-3 pb-2">
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && sendMessage()}
            placeholder="Ask about ICP scoring, scripts, verticals, market analysis..."
            className="flex-1 px-3 py-2.5 bg-flyfx-card border border-flyfx-border rounded-lg text-xs text-white outline-none focus:border-flyfx-gold transition" />
          <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-flyfx-gold text-black rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50">
            {loading ? "..." : "Send"}
          </button>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="text-[10px] text-flyfx-muted hover:text-white mt-1.5 transition">
            Clear conversation
          </button>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────
export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<DailyData | null>(null);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "call" | "email">("all");
  const [personFilter, setPersonFilter] = useState<"all" | "kyle" | "gus">("all");
  const [statusFilter, setStatusFilter] = useState<"to_call" | "called" | "callback" | "imported" | "deleted">("to_call");
  const [searchFilter, setSearchFilter] = useState("");
  const [statuses, setStatuses] = useState<Record<string, DealStatus>>({});
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [appTab, setAppTab] = useState<"daily" | "live" | "coach" | "agent" | "pipeline" | "granola">("daily");

  // Check session auth
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("flyfx_auth") === "1") {
      setAuthed(true);
    }
  }, []);

  // Try to load daily data on mount
  useEffect(() => {
    if (authed) fetchDaily();
  }, [authed]);

  const fetchDaily = useCallback(async () => {
    setLoading(true);
    let loaded = false;
    // Try API first (has latest pushed data)
    try {
      const res = await fetch("/api/deals");
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.deals && json.data.deals.length > 0) {
          setData(json.data);
          setBanner("Daily intelligence loaded");
          setTimeout(() => setBanner(null), 4000);
          loaded = true;
        }
      }
    } catch {}
    // Fallback to static file (survives cold starts)
    if (!loaded) {
      try {
        const res = await fetch("/data.json");
        if (res.ok) {
          const json = await res.json();
          if (json && json.deals) {
            setData(json);
            setBanner("Daily intelligence loaded (static)");
            setTimeout(() => setBanner(null), 4000);
          }
        }
      } catch {}
    }
    // Load saved statuses
    try {
      const sRes = await fetch("/api/status");
      if (sRes.ok) {
        const sJson = await sRes.json();
        const loaded: Record<string, DealStatus> = {};
        for (const [key, val] of Object.entries(sJson.statuses || {})) {
          loaded[key] = (val as any).status;
        }
        setStatuses(loaded);
      }
    } catch {}
    setLoading(false);
  }, []);

  const handleStatusChange = useCallback(async (deal: Deal, newStatus: DealStatus) => {
    const key = `${deal.name}__${deal.company}`;
    setStatuses((prev) => ({ ...prev, [key]: newStatus }));

    try {
      await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal, status: newStatus }),
      });
      const labels: Record<DealStatus, string> = {
        new: "Restored",
        called: "Marked as called",
        callback_later: "Call back later",
        they_callback: "They'll call us",
        imported: "Imported to HubSpot",
        deleted: "Deleted",
      };
      setBanner(`${deal.name} — ${labels[newStatus]}`);
      setTimeout(() => setBanner(null), 3000);
    } catch {
      setBanner("Failed to update status");
      setTimeout(() => setBanner(null), 3000);
    }
  }, []);

  const handleHubSpotImport = useCallback(async (deal: Deal) => {
    const key = `${deal.name}__${deal.company}`;
    setImportingKey(key);

    try {
      const res = await fetch("/api/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal }),
      });
      const json = await res.json();

      if (json.success) {
        setStatuses((prev) => ({ ...prev, [key]: "imported" }));
        setBanner(json.alreadyExisted
          ? `${deal.name} — already in HubSpot`
          : `${deal.name} — imported to HubSpot`
        );
      } else {
        setBanner(`Import failed: ${json.error}`);
      }
      setTimeout(() => setBanner(null), 4000);
    } catch {
      setBanner("Failed to import to HubSpot");
      setTimeout(() => setBanner(null), 3000);
    } finally {
      setImportingKey(null);
    }
  }, []);

  // Handle JSON file upload
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as DailyData;
      // Save to API
      await fetch("/api/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      setData(json);
      setBanner("Deals loaded from file");
      setTimeout(() => setBanner(null), 4000);
    } catch {
      setBanner("Invalid JSON file");
      setTimeout(() => setBanner(null), 3000);
    }
    e.target.value = "";
  }, []);

  if (!authed) return <AuthGate onAuth={() => setAuthed(true)} />;

  const getDealStatus = (d: Deal): DealStatus => {
    const key = `${d.name}__${d.company}`;
    return statuses[key] || "new";
  };

  const filteredDeals = data?.deals.filter((d) => {
    // Status filter
    const s = getDealStatus(d);
    if (statusFilter === "to_call" && s !== "new") return false;
    if (statusFilter === "called" && s !== "called") return false;
    if (statusFilter === "callback" && s !== "callback_later" && s !== "they_callback") return false;
    if (statusFilter === "imported" && s !== "imported") return false;
    if (statusFilter === "deleted" && s !== "deleted") return false;

    if (filter === "call" && !d.phone) return false;
    if (filter === "email" && d.phone) return false;
    if (personFilter !== "all" && d.assignedTo !== personFilter && d.assignedTo !== "shared") return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.company.toLowerCase().includes(q) ||
        d.city.toLowerCase().includes(q) ||
        d.country.toLowerCase().includes(q) ||
        d.specialisation?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toCallCount = data?.deals.filter((d) => getDealStatus(d) === "new").length ?? 0;
  const calledCount = data?.deals.filter((d) => getDealStatus(d) === "called").length ?? 0;
  const callbackCount = data?.deals.filter((d) => {
    const s = getDealStatus(d);
    return s === "callback_later" || s === "they_callback";
  }).length ?? 0;
  const importedCount = data?.deals.filter((d) => getDealStatus(d) === "imported").length ?? 0;
  const deletedCount = data?.deals.filter((d) => getDealStatus(d) === "deleted").length ?? 0;
  const callCount = data?.deals.filter((d) => d.phone).length ?? 0;
  const emailCount = data?.deals.filter((d) => !d.phone && d.email).length ?? 0;
  const kyleCount = data?.deals.filter((d) => d.assignedTo === "kyle").length ?? 0;
  const gusCount = data?.deals.filter((d) => d.assignedTo === "gus").length ?? 0;

  return (
    <div className="min-h-screen bg-flyfx-dark pb-20">
      {/* Banner */}
      {banner && (
        <div className="bg-green-600 text-white text-center py-2 text-sm font-medium animate-pulse">
          {banner}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-flyfx-dark/95 backdrop-blur border-b border-flyfx-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/flyfxfreight-logo.svg" alt="FlyFXFreight" className="h-5" />
            <span className="text-flyfx-muted font-normal text-sm">Deals Machine</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Tab switcher */}
            <div className="flex items-center gap-0.5 bg-flyfx-card rounded-lg p-0.5 border border-flyfx-border">
              {([
                { key: "pipeline" as const, label: "Run" },
                { key: "daily" as const, label: "Daily" },
                { key: "live" as const, label: "Search" },
                { key: "coach" as const, label: "Coach" },
                { key: "agent" as const, label: "Agent" },
                { key: "granola" as const, label: "Calls" },
              ]).map((t) => (
                <button key={t.key} onClick={() => setAppTab(t.key)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
                    appTab === t.key
                      ? t.key === "pipeline" ? "bg-flyfx-gold text-black" : "bg-flyfx-gold text-black"
                      : "text-flyfx-muted hover:text-white"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            {appTab === "daily" && (
              <>
                <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 bg-flyfx-border rounded-lg hover:bg-white/10 transition text-xs">
                  <UploadIcon />
                  <span className="hidden sm:inline">Upload JSON</span>
                  <input type="file" accept=".json" onChange={handleUpload} className="hidden" />
                </label>
                <button
                  onClick={fetchDaily}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-flyfx-gold text-black rounded-lg hover:opacity-90 transition text-xs font-medium disabled:opacity-50"
                >
                  <RefreshIcon />
                  {loading ? "Loading..." : "Refresh"}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {appTab === "pipeline" ? (
          <PipelineView onDealsLoaded={(d) => { setData(d); setTimeout(() => setAppTab("daily"), 500); }} />
        ) : appTab === "granola" ? (
          <GranolaView deals={data?.deals} />
        ) : appTab === "agent" ? (
          <AgentView data={data} />
        ) : appTab === "coach" ? (
          <CoachView deals={data?.deals} />
        ) : appTab === "live" ? (
          <LiveSearchView />
        ) : !data ? (
          /* Empty state */
          <div className="text-center py-20 space-y-4">
            <div className="text-6xl opacity-20">📡</div>
            <h2 className="text-xl font-semibold">No deals loaded</h2>
            <p className="text-flyfx-muted text-sm max-w-md mx-auto">
              Hit <strong className="text-flyfx-gold">Run</strong> to generate today's leads automatically, or upload a deals JSON file.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setAppTab("pipeline")}
                className="flex items-center gap-2 px-5 py-2.5 bg-flyfx-gold text-black rounded-lg hover:opacity-90 transition text-sm font-bold"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" /></svg>
                Run Today's Pipeline
              </button>
              <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-flyfx-border rounded-lg cursor-pointer hover:bg-white/10 transition text-sm">
                <UploadIcon /> Upload JSON
                <input type="file" accept=".json" onChange={handleUpload} className="hidden" />
              </label>
            </div>
          </div>
        ) : (
          <>
            {/* Market & Intelligence */}
            <MarketPanel data={data} />

            {/* Script Intelligence */}
            <ScriptIntel data={data.scriptIntelligence} />

            {/* Deals Section */}
            <div className="space-y-3">
              {/* Person selector */}
              <div className="flex items-center gap-2">
                {(["all", "kyle", "gus"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPersonFilter(p)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition border ${
                      personFilter === p
                        ? p === "kyle"
                          ? "bg-blue-600 border-blue-500 text-white"
                          : p === "gus"
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "bg-flyfx-gold border-flyfx-gold text-black"
                        : "bg-flyfx-card border-flyfx-border text-flyfx-muted hover:text-white hover:border-white/20"
                    }`}
                  >
                    {p === "all" ? `All (${data.deals.length})` : p === "kyle" ? `Kyle (${kyleCount})` : `Gus (${gusCount})`}
                  </button>
                ))}
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-1 bg-flyfx-card rounded-lg p-0.5 border border-flyfx-border overflow-x-auto">
                {([
                  { key: "to_call" as const, label: "To Call", count: toCallCount, color: "text-flyfx-gold" },
                  { key: "called" as const, label: "Called", count: calledCount, color: "text-flyfx-gold" },
                  { key: "callback" as const, label: "Callback", count: callbackCount, color: "text-amber-400" },
                  { key: "imported" as const, label: "Imported", count: importedCount, color: "text-green-400" },
                  { key: "deleted" as const, label: "Deleted", count: deletedCount, color: "text-red-400" },
                ]).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
                      statusFilter === f.key
                        ? "bg-flyfx-gold text-black"
                        : `text-flyfx-muted hover:text-white`
                    }`}
                  >
                    {f.label} {f.count > 0 && <span className="opacity-70">({f.count})</span>}
                  </button>
                ))}
              </div>

              {/* Type filter & search */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1 bg-flyfx-card rounded-lg p-0.5 border border-flyfx-border">
                  {(["all", "call", "email"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                        filter === f
                          ? "bg-flyfx-gold text-black"
                          : "text-flyfx-muted hover:text-white"
                      }`}
                    >
                      {f === "all"
                        ? "All"
                        : f === "call"
                        ? `Call (${callCount})`
                        : `Email (${emailCount})`}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-32 sm:w-40 px-3 py-1.5 bg-flyfx-card border border-flyfx-border rounded-lg text-xs text-white outline-none focus:border-flyfx-gold transition"
                />
              </div>

              {/* Deal Cards */}
              <div className="space-y-3">
                {filteredDeals?.map((deal) => {
                  const key = `${deal.name}__${deal.company}`;
                  return (
                    <DealCard
                      key={deal.rank}
                      deal={deal}
                      isExpanded={expandedCard === deal.rank}
                      onToggle={() =>
                        setExpandedCard(expandedCard === deal.rank ? null : deal.rank)
                      }
                      status={getDealStatus(deal)}
                      onStatusChange={(s) => handleStatusChange(deal, s)}
                      onHubSpotImport={() => handleHubSpotImport(deal)}
                      importing={importingKey === key}
                    />
                  );
                })}
                {filteredDeals?.length === 0 && (
                  <p className="text-center text-flyfx-muted py-8 text-sm">
                    No deals match your filter.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
