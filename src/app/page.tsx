"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { DailyData, Deal, DealStatus, IntelSection, ConsequenceChain, CoachBrief, PracticeMessage, AgentMessage, PipelinePhase, PipelineResult } from "@/lib/types";

// ─── AUTH GATE ───────────────────────────────────────────────
function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!pw) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        onAuth();
      } else {
        setError(true);
        setTimeout(() => setError(false), 1500);
      }
    } catch {
      setError(true);
      setTimeout(() => setError(false), 1500);
    } finally {
      setLoading(false);
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
            disabled={loading}
            className="w-full py-3 bg-flyfx-gold text-black font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? "Checking..." : "Enter"}
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
  // 10 charter-focused data points for call prep
  const metrics: Array<{ label: string; value: string; icon: string; color: string }> = [
    { label: "Air Cargo Capacity", value: m.airCargoCapacity || "~18% offline from Gulf hub disruptions", icon: "!", color: "text-red-400" },
    { label: "Charter Demand", value: m.charterDemand || "HIGH — forwarders seeking alternatives", icon: "^", color: (m.charterDemand || "HIGH").includes("HIGH") ? "text-red-400" : "text-amber-400" },
    { label: "Gulf Hubs", value: m.gulfHubStatus || "Emirates ~50% · Qatar suspended · Etihad limited", icon: "~", color: "text-amber-400" },
    { label: "Hormuz Strait", value: m.hormuzStatus || "Check latest status", icon: "X", color: (m.hormuzStatus || "").toLowerCase().includes("closed") ? "text-red-400" : "text-amber-400" },
    { label: "Brent Crude", value: m.brent || "Check oilprice.com", icon: "$", color: "text-white" },
    { label: "Jet Fuel", value: m.jetFuel || "Elevated — airline cost pressure rising", icon: "$", color: "text-white" },
    { label: "Air Freight Rates", value: m.airFreightRates || "Asia-Europe +16-65% · rates surging", icon: "^", color: "text-red-400" },
    { label: "Airline Disruptions", value: m.airlineDisruptions || "Gulf airspace closures · route suspensions", icon: "!", color: "text-amber-400" },
    { label: "Suez / Red Sea", value: m.suezStatus || "Container lines rerouting via Cape +10-14 days", icon: "~", color: "text-amber-400" },
    { label: "Crisis Angle", value: m.crisisAngle || m.topTalkingPoint?.split(".")[0] || "Gulf disruption — charter alternatives needed", icon: "*", color: "text-flyfx-gold" },
  ];

  return (
    <div className="space-y-3">
      {/* Metrics as bullet-point list — clean and scannable */}
      <div className="bg-flyfx-dark rounded-lg border border-flyfx-border divide-y divide-flyfx-border">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-start gap-3 px-3 py-2.5">
            <span className="text-[10px] text-flyfx-muted uppercase tracking-wider w-28 flex-shrink-0 pt-0.5">{metric.label}</span>
            <span className={`text-xs leading-relaxed ${metric.color}`}>{metric.value}</span>
          </div>
        ))}
      </div>

      {/* Top talking point */}
      {m.topTalkingPoint && (
        <div className="bg-flyfx-dark rounded-lg p-3 border border-flyfx-gold/20">
          <p className="text-[10px] text-flyfx-gold uppercase tracking-wider mb-1">
            Say this on every call
          </p>
          <p className="text-sm leading-relaxed">{m.topTalkingPoint}</p>
        </div>
      )}

      {/* Headlines */}
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
  const [openSection, setOpenSection] = useState<string | null>("openers");

  const toggle = (id: string) => setOpenSection(openSection === id ? null : id);

  function Section({ id, title, color, children }: { id: string; title: string; color: string; children: React.ReactNode }) {
    const isOpen = openSection === id;
    return (
      <div className="border border-flyfx-border rounded-lg overflow-hidden">
        <button
          onClick={() => toggle(id)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-flyfx-dark hover:bg-white/5 transition text-left"
        >
          <span className={`text-xs font-semibold ${color}`}>{title}</span>
          <span className="text-flyfx-muted text-xs">{isOpen ? "−" : "+"}</span>
        </button>
        {isOpen && <div className="px-3 py-3 space-y-3 bg-flyfx-card/50">{children}</div>}
      </div>
    );
  }

  function Line({ label, text, labelColor }: { label?: string; text: string; labelColor?: string }) {
    return (
      <div className="text-xs leading-relaxed">
        {label && <span className={`font-semibold ${labelColor || "text-flyfx-gold"}`}>{label} </span>}
        <span className="text-white/85">{text}</span>
      </div>
    );
  }

  return (
    <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4 space-y-2">
      <h2 className="text-sm font-semibold text-flyfx-gold uppercase tracking-wider mb-1">
        Call Playbook
      </h2>

      <Section id="openers" title="Opening Lines — First 15 Seconds" color="text-flyfx-gold">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-flyfx-gold uppercase mb-1 font-semibold">Primary — use by default</p>
            <p className="text-xs text-white/90 leading-relaxed italic">&quot;Hi [Name], Kyle from FlyFX — air charter specialist. With the Gulf airspace closure now in its fourth week, forwarders are looking for charter alternatives. Does charter come up for your team at all?&quot;</p>
          </div>
          <div>
            <p className="text-[10px] text-amber-400 uppercase mb-1 font-semibold">Variant — if you know their vertical</p>
            <p className="text-xs text-white/80 leading-relaxed italic">&quot;Hi [Name], Kyle from FlyFX. I saw you handle [auto parts / DG chemicals / pharma]. With airlines refusing DG uplift on Gulf-adjacent routes, we&apos;ve been helping forwarders fill that gap. Is that something you&apos;re seeing?&quot;</p>
          </div>
          <div>
            <p className="text-[10px] text-amber-400 uppercase mb-1 font-semibold">Variant — if you have company intel</p>
            <p className="text-xs text-white/80 leading-relaxed italic">&quot;Hi [Name], Kyle from FlyFX. I noticed [CEO posted about charter / you recently got IATA registered / you handle North Sea rig logistics]. I work with forwarders in exactly that space — got 60 seconds?&quot;</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded p-2">
            <p className="text-[10px] text-green-400 uppercase font-bold mb-0.5">Say this on EVERY call — early, not late</p>
            <p className="text-xs text-white font-medium">&quot;We work exclusively with freight forwarders — we will never approach your end clients directly.&quot;</p>
          </div>
        </div>
      </Section>

      <Section id="qualifying" title="Qualifying Questions" color="text-blue-400">
        <div className="space-y-2">
          <Line label="IF YES:" text="&quot;What kind of situations trigger it? Oversized, time-critical, DG, or something else?&quot;" labelColor="text-green-400" />
          <Line label="DIG DEEPER:" text="&quot;How often does that come up — monthly, quarterly, once a year?&quot;" labelColor="text-blue-400" />
          <Line label="THE GOLD Q:" text="&quot;What happens when a client calls on a Friday with something that won't fit on scheduled? Who do you call?&quot;" labelColor="text-flyfx-gold" />
          <Line label="LOST DEALS:" text="&quot;Have you ever had a charter enquiry you couldn't fulfil? What was the cargo?&quot;" labelColor="text-amber-400" />
          <Line label="LOST REVENUE:" text="&quot;If you'd had a charter partner handling it end-to-end, would you have quoted that deal? How much was it worth?&quot;" labelColor="text-amber-400" />
          <Line label="MISCONCEPTION:" text="&quot;You mentioned you don't have the capacity — just to clarify, you don't need to fill a whole aircraft. We do part charters. Does that change things?&quot;" labelColor="text-red-400" />
        </div>
      </Section>

      <Section id="objections" title="The 8 Objections — 95% of Calls" color="text-red-400">
        <div className="space-y-3">
          {[
            { obj: "\"We don't do charters / We don't need charter.\"", resp: "\"Fair enough — most forwarders only need us 3-5 times a year. For the DG shipment airlines refuse, the oversized piece that can't wait for sea, the Sunday night emergency. When that moment comes, it helps to already have a specialist's number. That's all I'm asking for.\"" },
            { obj: "\"We already have a broker / We have preferred partners.\"", resp: "\"I completely respect that — I'm not asking to replace anyone. Our strongest relationships started as backup only. The first time your primary comes back empty-handed on a DG full-freighter at short notice, you'll want a second name ready. Can I be that second name?\"" },
            { obj: "\"We book direct with airlines — we don't need a broker.\"", resp: "\"That works perfectly for regular lanes. We cover the situations airlines can't — oversized, DG class restrictions, Sunday night cutoffs, routes that don't exist on scheduled. Has there been a shipment you couldn't place on your usual airlines?\"" },
            { obj: "\"Just send me some info / Send a brochure.\"", resp: "\"Happy to — so I send the right thing: is it mainly oversized, time-critical, or DG situations where charter tends to come up for you? And what's your direct email so it doesn't land in a generic inbox?\"" },
            { obj: "\"Your price / charters are too expensive.\"", resp: "\"Charter isn't about regular cargo — it's about the 3 AM Friday call where nothing fits and your client is screaming. The question isn't the cost of the charter — it's the cost of NOT having one. A stopped production line dwarfs the freight bill.\"" },
            { obj: "\"We're too small / Not at that stage yet.\"", resp: "\"No problem — happy to stay in touch as you grow. Quick question before I go: do you know anyone in your network who handles oversized or time-critical air freight? Even a name would be really useful.\"" },
            { obj: "\"We go direct to operators / We don't need a middleman.\"", resp: "\"Works well for regular routes. A broker earns its place when things get complicated — permits for unusual destinations, alternative aircraft on a tech issue, 3 AM on a Saturday with a stuck shipment. When a charter goes wrong, you want someone whose only job is fixing it.\"" },
            { obj: "\"Not interested. / No thanks.\"", resp: "\"Understood — I appreciate you being straight with me. Thanks for your time.\" [Hang up. Do NOT push. Move to next call.]" },
          ].map((item, i) => (
            <div key={i} className="space-y-1">
              <p className="text-[10px] text-red-400 font-semibold">THEY SAY: <span className="text-white/90 font-normal">{item.obj}</span></p>
              <p className="text-[10px] text-green-400 font-semibold">YOU SAY: <span className="text-white/80 font-normal">{item.resp}</span></p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="spin" title="SPIN Questions — When Engaged 2+ Min" color="text-purple-400">
        <div className="space-y-2">
          <Line label="SITUATION:" text="&quot;How does your air freight desk currently handle charter requests when they come in?&quot;" labelColor="text-blue-400" />
          <Line label="PROBLEM:" text="&quot;What causes the most stress when a charter situation arises — availability, price, or timeline?&quot;" labelColor="text-amber-400" />
          <Line label="IMPLICATION:" text="&quot;When a charter has fallen through or come in late, what's the impact on your client relationship?&quot;" labelColor="text-red-400" />
          <Line label="NEED-PAYOFF:" text="&quot;If you had a broker who responded with options within the hour, any time of day — how would that change things?&quot;" labelColor="text-green-400" />
        </div>
      </Section>

      <Section id="closing" title="Closing — How to End Every Call" color="text-green-400">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-amber-400 uppercase font-semibold mb-1">Warm — interested</p>
            <p className="text-xs text-white/80 leading-relaxed italic">&quot;I&apos;ll send our brochure within the hour. What&apos;s your direct email? And is it fine if I follow up in two weeks?&quot;</p>
            <p className="text-[10px] text-flyfx-muted mt-1">Capture: name, email, follow-up date</p>
          </div>
          <div>
            <p className="text-[10px] text-red-400 uppercase font-semibold mb-1">Hot — live requirement</p>
            <p className="text-xs text-white/80 leading-relaxed italic">&quot;Let me take some quick details and I&apos;ll turn around a quote today. Origin, destination, cargo type, dimensions, weight?&quot;</p>
            <p className="text-[10px] text-flyfx-muted mt-1">Get specifics. Quote same day.</p>
          </div>
        </div>
      </Section>

      <Section id="disqualify" title="True Disqualifiers — Hang Up Fast" color="text-flyfx-muted">
        <div className="space-y-1.5 text-xs text-white/70">
          <p>✕ No air freight desk at all — road or ocean only</p>
          <p>✕ Books direct with airlines AND firm. Pushed back twice = dead end.</p>
          <p>✕ Under 10 employees / startup with no charter history</p>
          <p>✕ Handles their own charters internally AND satisfied (e.g. PML Sea Free)</p>
        </div>
      </Section>
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
  onFollowUpEmail,
  showAsCompleted,
  onEdit,
}: {
  deal: Deal;
  isExpanded: boolean;
  onToggle: () => void;
  status: DealStatus;
  onStatusChange: (status: DealStatus) => void;
  onHubSpotImport: () => void;
  importing: boolean;
  onFollowUpEmail: () => void;
  showAsCompleted?: boolean;
  onEdit?: (fields: Partial<Deal>) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmHubspotExisting, setConfirmHubspotExisting] = useState(false);
  const [pendingSentiment, setPendingSentiment] = useState<"" | "positive" | "negative" | "gatekeeper">("");
  const [pendingNextStep, setPendingNextStep] = useState<"" | "callback" | "followup">("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(deal.name);
  const [editTitle, setEditTitle] = useState(deal.title);
  const [editPhone, setEditPhone] = useState(deal.phone || "");
  const [editEmail, setEditEmail] = useState(deal.email || "");

  const priorityBadge =
    deal.priority === "hot"
      ? "bg-red-500/20 text-red-400"
      : deal.priority === "warm"
      ? "bg-amber-500/20 text-amber-400"
      : "bg-gray-500/20 text-gray-400";

  // Overlay logic: callback_later never shows overlay. Follow-up overrules sentiment.
  const shouldOverlay = showAsCompleted && status !== "callback_later";

  // Determine overlay label — follow-up overrules sentiment tags
  const getOverlayLabel = () => {
    if (status === "existing_hubspot") return "ALREADY IN HUBSPOT";
    if (status === "follow_up_email") return "FOLLOW-UP";
    if (status === "imported") return "IN HUBSPOT";
    if (status === "they_callback") return "POSITIVE";
    if (status === "negative") return "NEGATIVE";
    if (status === "gatekeeper") return "GATEKEEPER";
    return "COMPLETED";
  };

  const getOverlayBg = () => {
    if (status === "existing_hubspot") return "rgba(249, 115, 22, 0.15)";
    if (status === "follow_up_email") return "rgba(59, 130, 246, 0.15)";
    if (status === "imported") return "rgba(20, 184, 166, 0.15)";
    if (status === "they_callback") return "rgba(34, 197, 94, 0.15)";
    if (status === "negative") return "rgba(239, 68, 68, 0.12)";
    if (status === "gatekeeper") return "rgba(239, 68, 68, 0.12)";
    return "rgba(0, 0, 0, 0.08)";
  };

  const getOverlayTextColor = () => {
    if (status === "existing_hubspot") return "rgba(249, 115, 22, 0.25)";
    if (status === "follow_up_email") return "rgba(59, 130, 246, 0.25)";
    if (status === "imported") return "rgba(20, 184, 166, 0.25)";
    if (status === "they_callback") return "rgba(34, 197, 94, 0.25)";
    if (status === "negative") return "rgba(239, 68, 68, 0.20)";
    if (status === "gatekeeper") return "rgba(239, 68, 68, 0.20)";
    return "rgba(0, 0, 0, 0.08)";
  };

  const saveEdit = () => {
    if (onEdit) {
      onEdit({
        name: editName,
        title: editTitle,
        phone: editPhone || null,
        email: editEmail || null,
      });
    }
    setEditing(false);
  };

  const priorityClass =
    deal.priority === "hot"
      ? "priority-hot"
      : deal.priority === "warm"
      ? "priority-warm"
      : "priority-nurture";

  return (
    <div
      className={`deal-card relative rounded-xl overflow-hidden card-enter transition ${
        shouldOverlay ? "opacity-50" : deal.priority === "hot" ? "priority-hot" : ""
      }`}
      style={{ background: `var(--card)`, borderColor: `var(--border)`, border: `1px solid var(--border)` }}
    >
      {/* HOT badge — corner sticker */}
      {deal.priority === "hot" && !shouldOverlay && (
        <div className="absolute top-0 right-0 bg-flyfx-gold text-black text-[9px] font-black px-2 py-0.5 rounded-bl-lg z-10">
          HOT
        </div>
      )}

      {/* Completed overlay — full color wash with embossed text */}
      {shouldOverlay && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-xl overflow-hidden"
          style={{ background: getOverlayBg() }}
          onClick={onToggle}
        >
          <span
            className="text-3xl sm:text-4xl font-black tracking-[0.2em] uppercase select-none"
            style={{ color: getOverlayTextColor() }}
          >
            {getOverlayLabel()}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange("new"); }}
            className="absolute top-2 right-2 text-[9px] font-semibold px-2 py-0.5 rounded transition hover:opacity-100"
            style={{ color: `var(--muted)`, background: `var(--card)`, border: `1px solid var(--border)`, opacity: 0.7 }}
          >
            Restore
          </button>
        </div>
      )}

      {/* Header — clean, readable card face */}
      <div onClick={onToggle} className="w-full text-left p-4 cursor-pointer transition hover:opacity-90">
        {/* Main info */}
        <div className="flex items-start justify-between gap-4">
          {/* Left: person + company */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded px-2 py-1 text-sm outline-none border border-flyfx-gold/50" style={{ background: `var(--subtle)`, color: `var(--text)` }} placeholder="Name" />
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded px-2 py-1 text-xs outline-none border border-flyfx-gold/50" style={{ background: `var(--subtle)`, color: `var(--text)` }} placeholder="Title" />
              </div>
            ) : (
              <>
                <h3 className="font-semibold text-base truncate" style={{ color: `var(--text)` }}>{deal.name}</h3>
                <p className="text-sm truncate" style={{ color: `var(--muted)` }}>{deal.title}</p>
              </>
            )}
            <p className="text-xs mt-1.5 font-medium truncate" style={{ color: `var(--text)` }}>
              {deal.company}
            </p>
            <p className="text-xs truncate" style={{ color: `var(--muted)` }}>
              {deal.city}{deal.city && deal.country ? ", " : ""}{deal.country}
            </p>
          </div>

          {/* Right: contact details + score */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0 text-right">
            {(deal as any).score && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-flyfx-gold/10 text-flyfx-gold font-semibold">
                {(deal as any).score}
              </span>
            )}
            {deal.phone && (
              <a href={`tel:${deal.phone}`} onClick={(e) => e.stopPropagation()} className="text-xs text-flyfx-gold hover:underline">
                {deal.phone}
              </a>
            )}
            {deal.domain && (
              <a href={`https://${deal.domain}`} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="text-[11px] hover:underline" style={{ color: `var(--muted)` }}>
                {deal.domain}
              </a>
            )}
          </div>
        </div>

      </div>

      {/* Expanded detail — company intel and call prep */}
      {isExpanded && (
        <div className="border-t border-flyfx-border p-4 space-y-3 bg-flyfx-dark/50">
          {/* Verified / source meta — gray box */}
          <div className="flex flex-wrap items-center gap-2 bg-flyfx-dark rounded-lg px-3 py-2">
            {deal.enrichmentStatus && <span className="text-[10px] text-flyfx-muted">{deal.enrichmentStatus}</span>}
            {deal.source && <span className="text-[10px] text-flyfx-muted">{deal.source}</span>}
            {deal.specialisation && <span className="text-[10px] text-flyfx-muted">{deal.specialisation}</span>}
            {deal.employees && <span className="text-[10px] text-flyfx-muted">{deal.employees} staff</span>}
          </div>

          {/* Why Today — bullet-pointed with company intel */}
          <div className="rounded-lg p-3 bg-flyfx-gold/10 border border-flyfx-gold/20">
            <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-2">Why Today</p>
            <ul className="space-y-1.5 text-sm leading-snug">
              {deal.whyToday && deal.whyToday.split(/[.\n]+/).filter((s: string) => s.trim()).map((point: string, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-flyfx-gold mt-0.5 flex-shrink-0">-</span>
                  <span>{point.trim()}</span>
                </li>
              ))}
              {deal.companyIntel && deal.companyIntel.split(/[.\n]+/).filter((s: string) => s.trim()).map((point: string, i: number) => (
                <li key={`ci-${i}`} className="flex items-start gap-2">
                  <span className="text-flyfx-muted mt-0.5 flex-shrink-0">-</span>
                  <span className="text-flyfx-muted">{point.trim()}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Opening Line */}
          <Section title="Opening Line" content={`"${deal.openingLine}"`} />

          {/* Lead Differentiator */}
          <div className="flex items-start gap-2 px-1">
            <span className="text-flyfx-gold text-xs font-semibold uppercase flex-shrink-0 mt-0.5">Lead With:</span>
            <p className="text-sm">
              {deal.leadDifferentiator}
              {deal.differentiatorDetail && <span className="text-flyfx-muted"> — {deal.differentiatorDetail}</span>}
            </p>
          </div>

          {/* Objection */}
          <Section title="Likely Objection" content={deal.objection} />

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

          {/* Follow-up */}
          <Section title="Follow-up Trigger" content={deal.followUpTrigger} />

          {/* Inline Coach — Pre-call brief */}
          <div className="rounded-lg p-3 bg-blue-500/5 border border-blue-500/20">
            <p className="text-[10px] text-blue-400 uppercase tracking-wider mb-2 font-semibold">Pre-Call Coach</p>
            <ul className="space-y-1 text-xs text-white/80">
              <li>- FlyFX works exclusively with freight forwarders — say this early</li>
              <li>- Position as "additional option, not replacement" — they likely have existing brokers</li>
              <li>- Ask: "Does charter come up for your team at all?" — open-ended, non-threatening</li>
              <li>- If positive: suggest a 15-min call to discuss their trickiest routing challenges</li>
            </ul>
            <p className="text-[10px] text-red-400 mt-2 font-medium">DO NOT SAY: amazing, incredible, seamless, cutting-edge, game-changer, leverage</p>
          </div>
        </div>
      )}

      {/* Follow-up composer — shown when expanded and status is follow_up_email */}
      {isExpanded && status === "follow_up_email" && (
        <FollowUpComposer
          deal={deal}
          onSent={() => onStatusChange("imported")}
        />
      )}

      {/* Status action bar — always visible at bottom */}
      <div className="border-t border-flyfx-border px-3 py-2 space-y-2" onClick={(e) => e.stopPropagation()}>
        {status === "existing_hubspot" ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-medium">ALREADY IN HUBSPOT</span>
            <span className="text-[10px] text-flyfx-muted">Won't appear in future searches</span>
          </div>
        ) : status === "imported" ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">IN HUBSPOT</span>
            <button onClick={() => onStatusChange("new")} className="ml-auto text-[10px] text-flyfx-muted hover:text-white transition">Restore</button>
          </div>
        ) : confirmHubspotExisting ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-orange-400 font-medium flex-1">Mark {deal.company} as already in HubSpot?</span>
            <button
              onClick={() => { onStatusChange("existing_hubspot"); setConfirmHubspotExisting(false); }}
              className="px-2.5 py-1 text-[11px] rounded-lg bg-orange-500/20 border border-orange-500 text-orange-400 font-semibold hover:bg-orange-500/30 transition"
            >Confirm</button>
            <button onClick={() => setConfirmHubspotExisting(false)} className="px-2.5 py-1 text-[11px] rounded-lg border border-flyfx-border text-flyfx-muted hover:text-white transition">Cancel</button>
          </div>
        ) : (
          <>
            {/* Quick actions — single row of outcome buttons */}
            <div className="flex items-center gap-1.5">
              {[
                { label: "Called", status: "called" as DealStatus, style: "border-flyfx-gold/40 text-flyfx-gold" },
                { label: "Positive", status: "they_callback" as DealStatus, style: "border-green-500/40 text-green-600 dark:text-green-400" },
                { label: "Callback", status: "callback_later" as DealStatus, style: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
                { label: "Email", status: "follow_up_email" as DealStatus, style: "border-blue-500/40 text-blue-600 dark:text-blue-400" },
                { label: "Negative", status: "negative" as DealStatus, style: "border-red-500/40 text-red-500" },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={(e) => { e.stopPropagation(); onStatusChange(a.status); }}
                  className={`flex-1 py-2 text-[11px] font-semibold rounded-lg border transition hover:opacity-80 ${a.style}`}
                  style={{ background: `var(--subtle)` }}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {/* Secondary actions */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); onHubSpotImport(); }}
                disabled={importing}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-lg border border-teal-500/30 text-teal-600 dark:text-teal-400 transition hover:opacity-80 disabled:opacity-50"
                style={{ background: `var(--subtle)` }}
              >
                <HubSpotIcon /> {importing ? "Importing..." : "HubSpot"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmHubspotExisting(true); }}
                className="flex-1 py-1.5 text-[11px] font-medium rounded-lg border border-orange-500/30 text-orange-600 dark:text-orange-400 transition hover:opacity-80"
                style={{ background: `var(--subtle)` }}
              >
                Already in HS
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onStatusChange("deleted"); }}
                className="py-1.5 px-3 text-[11px] font-medium rounded-lg border transition hover:opacity-80"
                style={{ background: `var(--subtle)`, borderColor: `var(--border)`, color: `var(--muted)` }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── FOLLOW-UP EMAIL COMPOSER ────────────────────────────────
function FollowUpComposer({ deal, onSent }: { deal: Deal; onSent: () => void }) {
  const [directEmail, setDirectEmail] = useState(deal.email || "");
  const [subject, setSubject] = useState(deal.emailSubject || "");
  const [body, setBody] = useState(deal.coldEmail || "");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal, transcript: transcript || undefined, directEmail: directEmail || undefined }),
      });
      const json = await res.json();
      if (json.subject) setSubject(json.subject);
      if (json.body) setBody(json.body);
      if (json.toEmail && !directEmail) setDirectEmail(json.toEmail);
    } catch {}
    setLoading(false);
  };

  const copy = () => {
    const text = `To: ${directEmail}\nSubject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="border-t border-flyfx-border bg-blue-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold">Follow-up Email</p>
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="text-[10px] text-flyfx-muted hover:text-white transition border border-flyfx-border rounded px-2 py-0.5"
        >
          {showTranscript ? "Hide transcript" : "+ Add call notes"}
        </button>
      </div>

      {showTranscript && (
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste call notes or transcript here to personalise the email..."
          className="w-full h-24 px-3 py-2 bg-flyfx-dark border border-flyfx-border rounded-lg text-xs text-white placeholder-flyfx-muted outline-none focus:border-blue-500 transition resize-none"
        />
      )}

      <button
        onClick={generate}
        disabled={loading}
        className="w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition disabled:opacity-50"
      >
        {loading ? "Generating..." : body ? "Re-generate email" : "Generate personalised email"}
      </button>

      {body && (
        <>
          <div className="space-y-2">
            <div>
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">To</p>
              <input
                value={directEmail}
                onChange={(e) => setDirectEmail(e.target.value)}
                placeholder="Email address"
                className="w-full px-3 py-2 bg-flyfx-dark border border-flyfx-border rounded-lg text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>
            <div>
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">Subject</p>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 bg-flyfx-dark border border-flyfx-border rounded-lg text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>
            <div>
              <p className="text-[10px] text-flyfx-muted uppercase tracking-wider mb-1">Body</p>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full h-48 px-3 py-2 bg-flyfx-dark border border-flyfx-border rounded-lg text-xs text-white outline-none focus:border-blue-500 transition resize-none leading-relaxed"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex-1 py-2 rounded-lg bg-flyfx-card border border-flyfx-border text-xs font-medium hover:bg-white/10 transition"
            >
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
            {directEmail && (
              <a
                href={`mailto:${directEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium text-center hover:bg-blue-500 transition"
              >
                Open in mail app
              </a>
            )}
          </div>
          <button
            onClick={onSent}
            className="w-full py-2 rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 text-xs font-semibold hover:bg-green-600/30 transition"
          >
            Mark as sent — move to Imported
          </button>
        </>
      )}
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
function GranolaView({ deals, preSelectedDeal, onClear }: {
  deals?: Deal[];
  preSelectedDeal?: { deal: Deal; outcome: "positive" | "negative" } | null;
  onClear?: () => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  // Pre-select a deal when navigated here from a card action
  useEffect(() => {
    if (preSelectedDeal) {
      setSelectedDeal(preSelectedDeal.deal);
      setAnalysis(null);
      setTranscript("");
      onClear?.();
    }
  }, [preSelectedDeal]);

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

// ─── CHAT VIEW (Intelligence Brain) ─────────────────────────
interface BrainInsightUI {
  id: string;
  type: "adjust_scoring" | "adjust_script" | "exclude_or_prioritize";
  date: string;
  reason: string;
  active: boolean;
  dimension?: string;
  filter?: Record<string, string>;
  modifier?: number;
  target?: string;
  instruction?: string;
  action?: "exclude" | "prioritize";
  scope?: string;
  value?: string;
  geography?: string;
}

function InsightCard({ insight, onDelete, onToggle }: {
  insight: BrainInsightUI;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  const typeColors: Record<string, string> = {
    adjust_scoring: "border-blue-500/40 bg-blue-500/10",
    adjust_script: "border-green-500/40 bg-green-500/10",
    exclude_or_prioritize: "border-orange-500/40 bg-orange-500/10",
  };
  const typeIcons: Record<string, string> = {
    adjust_scoring: "##",
    adjust_script: "Aa",
    exclude_or_prioritize: "!!",
  };
  const typeLabels: Record<string, string> = {
    adjust_scoring: "Scoring",
    adjust_script: "Script",
    exclude_or_prioritize: "Rule",
  };

  const summary = insight.type === "adjust_scoring"
    ? `${insight.dimension} ${(insight.modifier || 0) > 0 ? "+" : ""}${insight.modifier} when ${insight.filter ? Object.entries(insight.filter).map(([k, v]) => `${k}=${v}`).join(", ") : "all"}`
    : insight.type === "adjust_script"
    ? `${insight.target}: "${insight.instruction?.slice(0, 60)}${(insight.instruction?.length || 0) > 60 ? "..." : ""}"`
    : `${insight.action} ${insight.scope}="${insight.value}"${insight.geography ? ` in ${insight.geography}` : ""}`;

  return (
    <div className={`border rounded-lg p-2.5 ${typeColors[insight.type]} ${!insight.active ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/20 shrink-0">
            {typeIcons[insight.type]}
          </span>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{typeLabels[insight.type]}</span>
            <p className="text-xs font-medium truncate">{summary}</p>
            <p className="text-[10px] opacity-60 mt-0.5">{insight.reason}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggle(insight.id, !insight.active)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 hover:border-white/30 transition"
            title={insight.active ? "Disable" : "Enable"}
          >
            {insight.active ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => onDelete(insight.id)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/20 transition"
            title="Delete"
          >
            X
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatView({ data }: { data?: DailyData | null }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string; insights?: BrainInsightUI[] }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [brainInsights, setBrainInsights] = useState<BrainInsightUI[]>([]);
  const [showBrain, setShowBrain] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load brain on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/brain");
        if (res.ok) {
          const brain = await res.json();
          setBrainInsights(brain.insights || []);
        }
      } catch {}
    })();
  }, []);

  const SUGGESTIONS = [
    "What verticals should I focus on this week?",
    "Debrief my recent calls — what patterns do you see?",
    "DG forwarders in Antwerp are converting well. Should we adjust scoring?",
    "Build a consequence chain for the current oil price movement",
    "I think France is going to be huge for us",
    "What's working and what's not in our cold outreach?",
  ];

  const sendMessage = async (text?: string) => {
    const content = text || input.trim();
    if (!content || loading) return;
    setInput("");

    const userMsg = { role: "user" as const, content, insights: [] as BrainInsightUI[] };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    const assistantMsg = { role: "assistant" as const, content: "", insights: [] as BrainInsightUI[] };
    setMessages([...updated, assistantMsg]);

    try {
      // Build message history for API (only role + content)
      const apiMessages = [...updated].map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, mode: "chat" }),
      });

      if (!res.ok) {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: "Failed to connect. Check API key.", insights: [] };
          return copy;
        });
        setLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      const sessionInsights: BrainInsightUI[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            // SSE event type — store for next data line
            continue;
          }
          if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            try {
              const parsed = JSON.parse(raw);
              if (parsed.message && !parsed.text && !parsed.id) {
                // Error event
                accumulated = `Error: ${parsed.message}`;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: accumulated, insights: [] };
                  return copy;
                });
              } else if (parsed.text !== undefined) {
                // Text chunk
                accumulated += parsed.text;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: accumulated, insights: [...sessionInsights] };
                  return copy;
                });
              } else if (parsed.id && parsed.type) {
                // Brain insight
                sessionInsights.push(parsed);
                setBrainInsights(prev => [...prev, parsed]);
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { ...copy[copy.length - 1], insights: [...sessionInsights] };
                  return copy;
                });
              }
            } catch {}
          }
        }
      }
    } catch {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "Connection error. Please try again.", insights: [] };
        return copy;
      });
    }
    setLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleDeleteInsight = async (id: string) => {
    try {
      await fetch("/api/brain", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setBrainInsights(prev => prev.filter(i => i.id !== id));
    } catch {}
  };

  const handleToggleInsight = async (id: string, active: boolean) => {
    try {
      await fetch("/api/brain", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      setBrainInsights(prev => prev.map(i => i.id === id ? { ...i, active } : i));
    } catch {}
  };

  // Simple markdown rendering (reuse pattern from AgentView)
  const renderText = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <h3 key={i} className="text-sm font-bold mt-3 mb-1">{line.slice(3)}</h3>;
      if (line.startsWith("### ")) return <h4 key={i} className="text-xs font-bold mt-2 mb-1 text-flyfx-gold">{line.slice(4)}</h4>;
      if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="text-xs font-bold mt-1">{line.slice(2, -2)}</p>;
      if (line.startsWith("- ")) return <p key={i} className="text-xs text-flyfx-muted ml-3">{line}</p>;
      if (line.match(/^\d+\. /)) return <p key={i} className="text-xs text-flyfx-muted ml-3">{line}</p>;
      if (line.trim() === "") return <br key={i} />;
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

  const activeInsights = brainInsights.filter(i => i.active);

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 130px)" }}>
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-4">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-6">
              <div>
                <h2 className="text-lg font-bold">FlyFX Intelligence Partner</h2>
                <p className="text-flyfx-muted text-xs mt-1">
                  Your sparring partner for market strategy, call debriefs, and pipeline tuning.
                  Insights from conversations feed directly into the deals machine.
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
              {activeInsights.length > 0 && (
                <p className="text-[10px] text-flyfx-muted">
                  {activeInsights.length} active brain insight{activeInsights.length !== 1 ? "s" : ""} modifying the pipeline
                </p>
              )}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i}>
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
              {/* Insight cards after assistant messages */}
              {msg.role === "assistant" && msg.insights && msg.insights.length > 0 && (
                <div className="ml-0 mt-2 space-y-1.5 max-w-[85%]">
                  {msg.insights.map((ins) => (
                    <InsightCard
                      key={ins.id}
                      insight={ins}
                      onDelete={handleDeleteInsight}
                      onToggle={handleToggleInsight}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-flyfx-border pt-3 pb-2">
          <div className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && sendMessage()}
              placeholder="Ask about the market, debrief a call, adjust the pipeline..."
              className="flex-1 px-3 py-2.5 bg-flyfx-card border border-flyfx-border rounded-lg text-xs text-white outline-none focus:border-flyfx-gold transition" />
            <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-flyfx-gold text-black rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50">
              {loading ? "..." : "Send"}
            </button>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} className="text-[10px] text-flyfx-muted hover:text-white transition">
                Clear conversation
              </button>
            )}
            <button
              onClick={() => setShowBrain(!showBrain)}
              className="text-[10px] text-flyfx-muted hover:text-flyfx-gold transition ml-auto"
            >
              Brain ({activeInsights.length}) {showBrain ? "▼" : "▶"}
            </button>
          </div>
        </div>
      </div>

      {/* Brain sidebar (collapsible) */}
      {showBrain && (
        <div className="w-72 shrink-0 border-l border-flyfx-border pl-4 overflow-y-auto">
          <h3 className="text-xs font-bold mb-2 flex items-center gap-1.5">
            <span className="text-flyfx-gold">Brain</span>
            <span className="text-flyfx-muted font-normal">({activeInsights.length} active)</span>
          </h3>
          {brainInsights.length === 0 ? (
            <p className="text-[10px] text-flyfx-muted">No insights yet. Chat about the market to build up the brain.</p>
          ) : (
            <div className="space-y-2">
              {brainInsights.map((ins) => (
                <InsightCard
                  key={ins.id}
                  insight={ins}
                  onDelete={handleDeleteInsight}
                  onToggle={handleToggleInsight}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ANALYTICS VIEW ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════
// MONTHLY PROGRESS BAR
// ══════════════════════════════════════════════════════════
function ProgressBar() {
  // Verified from HubSpot API — 37 contacts owned by Kyle (owner 32686904)
  const count = 37;
  const target = 100;
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  const pct = Math.min(Math.round((count / target) * 100), 100);

  return (
    <div className="bg-flyfx-card border border-flyfx-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-white">{month} — {count}/{target} contacts in HubSpot</span>
        <span className="text-xs font-bold text-flyfx-gold">{pct}%</span>
      </div>
      <div className="w-full bg-flyfx-border rounded-full h-2">
        <div
          className="bg-flyfx-gold h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// CONTACTS CRM VIEW
// ══════════════════════════════════════════════════════════
function ContactsView({ liveStatuses }: { liveStatuses?: Record<string, any> }) {
  const [baseContacts, setBaseContacts] = useState<any[]>([]);
  const [stats, setContactStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "kyle" | "gus">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"dateAdded" | "company" | "country" | "status" | "owner">("dateAdded");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [localStatusOverrides, setLocalStatusOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((data) => {
        const arr = Object.values(data.contacts || {}) as any[];
        setBaseContacts(arr);
        setContactStats(data.stats);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Merge live statuses from Daily tab into contacts
  const contacts = baseContacts.map((c) => {
    const key = `${c.name}__${c.company}`;
    // Local overrides take priority (from Contacts tab actions)
    if (localStatusOverrides[c.id]) {
      return { ...c, status: localStatusOverrides[c.id] };
    }
    // Then check live statuses from Daily tab
    if (liveStatuses?.[key]?.status) {
      return { ...c, status: liveStatuses[key].status };
    }
    return c;
  });

  const filtered = contacts
    .filter((c) => {
      if (filter === "all") return c.status !== "deleted";
      return c.status === filter;
    })
    .filter((c) => {
      if (ownerFilter === "all") return true;
      return c.assignedTo === ownerFilter || (ownerFilter === "gus" && c.assignedTo === "shared");
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (c.name || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "dateAdded") return (b.dateAdded || "").localeCompare(a.dateAdded || "");
      if (sortBy === "company") return (a.company || "").localeCompare(b.company || "");
      if (sortBy === "country") return (a.country || "").localeCompare(b.country || "");
      if (sortBy === "status") return (a.status || "").localeCompare(b.status || "");
      if (sortBy === "owner") return (a.assignedTo || "").localeCompare(b.assignedTo || "");
      return 0;
    });

  const statusColors: Record<string, string> = {
    new: "bg-blue-500/20 text-blue-400",
    called: "bg-yellow-500/20 text-yellow-400",
    negative: "bg-red-500/20 text-red-400",
    callback_later: "bg-orange-500/20 text-orange-400",
    they_callback: "bg-green-500/20 text-green-400",
    follow_up_email: "bg-purple-500/20 text-purple-400",
    gatekeeper: "bg-gray-500/20 text-gray-400",
    imported: "bg-emerald-500/20 text-emerald-400",
    existing_hubspot: "bg-gray-600/20 text-gray-500",
    deleted: "bg-red-900/20 text-red-600",
  };

  const statusLabels: Record<string, string> = {
    new: "New", called: "Called", negative: "Negative",
    callback_later: "Callback", they_callback: "They Callback",
    follow_up_email: "Follow Up", gatekeeper: "Gatekeeper",
    imported: "In HubSpot", existing_hubspot: "Existing HS", deleted: "Deleted",
  };

  async function updateStatus(contact: any, newStatus: string) {
    setSaveStatus("saving");
    // Build a deal-shaped object that /api/status expects
    const deal = {
      name: contact.name,
      company: contact.company,
      title: contact.title || "",
      email: contact.email || null,
      phone: contact.phone || null,
      linkedin: contact.linkedin || null,
      domain: contact.domain || null,
      city: contact.city || "",
      country: contact.country || "",
      specialisation: contact.specialisation || null,
      apolloId: contact.apolloId || null,
    };
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus("saved");
        // Update local override so the UI reflects immediately
        setLocalStatusOverrides((prev) => ({ ...prev, [contact.id]: newStatus }));
        if (newStatus === "deleted") {
          if (selected?.id === contact.id) setSelected(null);
        } else {
          if (selected?.id === contact.id) setSelected({ ...selected, status: newStatus });
        }
      } else {
        setSaveStatus("failed");
      }
    } catch {
      setSaveStatus("failed");
    }
    setTimeout(() => setSaveStatus("idle"), 3000);
  }

  async function saveNotes(contact: any) {
    setSaveStatus("saving");
    const deal = {
      name: contact.name,
      company: contact.company,
      title: contact.title || "",
      email: contact.email || null,
      phone: contact.phone || null,
      linkedin: contact.linkedin || null,
      domain: contact.domain || null,
      city: contact.city || "",
      country: contact.country || "",
      specialisation: contact.specialisation || null,
      apolloId: contact.apolloId || null,
    };
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal, status: contact.status, notes: notesText }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus("saved");
        setBaseContacts((prev) =>
          prev.map((c) => (c.id === contact.id ? { ...c, notes: notesText } : c))
        );
        if (selected?.id === contact.id) setSelected({ ...selected, notes: notesText });
        setEditingNotes(false);
      } else {
        setSaveStatus("failed");
      }
    } catch {
      setSaveStatus("failed");
    }
    setTimeout(() => setSaveStatus("idle"), 3000);
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-flyfx-muted">
        <div className="animate-spin text-3xl mb-4">&#x21BB;</div>
        Loading contacts...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Save status indicator */}
      {saveStatus !== "idle" && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium ${
          saveStatus === "saving" ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
          saveStatus === "saved" ? "bg-green-500/20 text-green-400 border border-green-500/30" :
          "bg-red-500/20 text-red-400 border border-red-500/30"
        }`}>
          {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save failed — try again"}
        </div>
      )}

      {/* Stats bar — same verified numbers as Stats tab */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { l: "Calls Made", v: 106 },
          { l: "In HubSpot", v: 37 },
          { l: "Conversion", v: "35%" },
          { l: "Remaining", v: 63 },
        ].map((s) => (
          <div key={s.l} className="bg-flyfx-card border border-flyfx-border rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-white">{s.v}</div>
            <div className="text-[10px] text-flyfx-muted">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search name or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 bg-flyfx-card border border-flyfx-border rounded-lg text-sm text-white placeholder-flyfx-muted"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-2 py-1.5 bg-flyfx-card border border-flyfx-border rounded-lg text-xs text-white"
        >
          <option value="all">All Status</option>
          {Object.entries(statusLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value as any)}
          className="px-2 py-1.5 bg-flyfx-card border border-flyfx-border rounded-lg text-xs text-white"
        >
          <option value="all">All Owners</option>
          <option value="kyle">Kyle</option>
          <option value="gus">Gus</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-2 py-1.5 bg-flyfx-card border border-flyfx-border rounded-lg text-xs text-white"
        >
          <option value="dateAdded">Newest</option>
          <option value="company">Company</option>
          <option value="country">Country</option>
          <option value="status">Status</option>
          <option value="owner">Owner</option>
        </select>
      </div>

      <div className="text-xs text-flyfx-muted">{filtered.length} contacts</div>

      {/* Contact list + detail */}
      <div className="space-y-2">
        {filtered.map((c) => {
          const isActioned = c.status !== "new";
          return (
          <div
            key={c.id}
            className={`border rounded-lg transition cursor-pointer ${
              selected?.id === c.id
                ? "border-flyfx-gold bg-flyfx-card"
                : isActioned
                ? "border-flyfx-border/50 bg-flyfx-card/40 opacity-60"
                : "border-flyfx-border bg-flyfx-card hover:border-flyfx-gold/40"
            }`}
          >
            {/* Summary row */}
            <div
              onClick={() => {
                setSelected(selected?.id === c.id ? null : c);
                setNotesText(c.notes || "");
                setEditingNotes(false);
              }}
              className="flex items-center gap-3 p-3"
            >
              {/* Kyle/Gus badge */}
              {c.assignedTo && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
                  c.assignedTo === "kyle" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                }`}>
                  {c.assignedTo === "kyle" ? "K" : "G"}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${isActioned ? "text-white/60" : "text-white"}`}>{c.name}</div>
                <div className="text-xs text-flyfx-muted truncate">{c.title} at {c.company}</div>
              </div>
              <div className="text-xs text-flyfx-muted hidden sm:block">{c.city}, {c.country}</div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[c.status] || "bg-gray-500/20 text-gray-400"}`}>
                {statusLabels[c.status] || c.status}
              </span>
            </div>

            {/* Expanded detail */}
            {selected?.id === c.id && (
              <div className="border-t border-flyfx-border p-3 space-y-3">
                {/* Contact info */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {c.phone && (
                    <div>
                      <span className="text-flyfx-muted">Phone: </span>
                      <a href={`tel:${c.phone}`} className="text-flyfx-gold">{c.phone}</a>
                    </div>
                  )}
                  {c.domain && (
                    <div>
                      <span className="text-flyfx-muted">Website: </span>
                      <a href={`https://${c.domain}`} target="_blank" rel="noopener" className="text-blue-400 hover:underline">{c.domain}</a>
                    </div>
                  )}
                  {c.linkedin && (
                    <div>
                      <span className="text-flyfx-muted">LinkedIn: </span>
                      <a href={c.linkedin} target="_blank" rel="noopener" className="text-blue-400 hover:underline">Profile</a>
                    </div>
                  )}
                  {c.email && (
                    <div>
                      <span className="text-flyfx-muted">Email: </span>
                      <a href={`mailto:${c.email}`} className="text-blue-400">{c.email}</a>
                    </div>
                  )}
                  {c.employees && (
                    <div><span className="text-flyfx-muted">Size: </span><span className="text-white">{c.employees} staff</span></div>
                  )}
                  {c.specialisation && (
                    <div><span className="text-flyfx-muted">Vertical: </span><span className="text-white">{c.specialisation}</span></div>
                  )}
                </div>

                {/* Meta */}
                <div className="flex flex-wrap gap-2 text-[10px] text-flyfx-muted">
                  <span>Added: {c.dateAdded ? new Date(c.dateAdded).toLocaleDateString() : "—"}</span>
                  <span>Source: {c.source || "—"}</span>
                  <span>Assigned: {c.assignedTo || "—"}</span>
                  {c.score && <span>Score: {c.score}/100</span>}
                </div>

                {/* Notes */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-flyfx-muted font-medium">Notes</span>
                    {!editingNotes ? (
                      <button
                        onClick={() => { setEditingNotes(true); setNotesText(c.notes || ""); }}
                        className="text-[10px] text-flyfx-gold hover:underline"
                      >Edit</button>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={() => saveNotes(c)}
                          className="text-[10px] text-green-400 hover:underline"
                        >Save</button>
                        <button
                          onClick={() => setEditingNotes(false)}
                          className="text-[10px] text-flyfx-muted hover:underline"
                        >Cancel</button>
                      </div>
                    )}
                  </div>
                  {editingNotes ? (
                    <textarea
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      rows={3}
                      className="w-full bg-black/30 border border-flyfx-border rounded-lg p-2 text-xs text-white placeholder-flyfx-muted"
                      placeholder="Add notes about this contact..."
                    />
                  ) : (
                    <div className="text-xs text-white/70 bg-black/20 rounded p-2 min-h-[40px]">
                      {c.notes || <span className="text-flyfx-muted italic">No notes</span>}
                    </div>
                  )}
                </div>

                {/* Status actions */}
                <div className="flex flex-wrap gap-1.5">
                  {(["new", "called", "callback_later", "they_callback", "follow_up_email", "negative", "gatekeeper", "imported", "deleted"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(c, s)}
                      disabled={c.status === s}
                      className={`text-[10px] px-2 py-1 rounded transition ${
                        c.status === s
                          ? "bg-flyfx-gold/20 text-flyfx-gold border border-flyfx-gold/40"
                          : "bg-flyfx-card border border-flyfx-border text-flyfx-muted hover:text-white hover:border-flyfx-gold/30"
                      }`}
                    >
                      {statusLabels[s]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10 text-flyfx-muted text-sm">
          {contacts.length === 0
            ? "No contacts yet. Run the pipeline to generate your first deals."
            : "No contacts match your filters."}
        </div>
      )}
    </div>
  );
}

function AnalyticsView({
  deals,
  statuses,
}: {
  deals: Deal[] | undefined;
  statuses: Record<string, any>;
}) {
  const [contactStats, setContactStats] = useState<any>(null);
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [poolStats, setPoolStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/contacts").then((r) => r.json()).catch(() => ({ contacts: {}, stats: {} })),
      fetch("/api/source-leads").then((r) => r.json()).catch(() => ({})),
    ]).then(([contactsData, poolData]) => {
      setContactStats(contactsData.stats || {});
      setAllContacts(Object.values(contactsData.contacts || {}));
      setPoolStats(poolData);
      setLoading(false);
    });
  }, []);

  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });

  // Hard facts — verified by Kyle on 18 March 2026
  const totalCalls = 106;       // unique phone numbers called (Granola, verified by Kyle)
  const totalInHubSpot = 37;    // Kyle's contacts in HubSpot (HubSpot API, owner 32686904)
  const conversionRate = totalCalls > 0 ? Math.round((totalInHubSpot / totalCalls) * 100) : 0;
  const importedCount = contactStats?.byStatus?.imported || 0;
  const byStatus = contactStats?.byStatus || {};
  const byCountry = contactStats?.byCountry || {};
  const byAssigned = contactStats?.byAssignedTo || { kyle: 0, gus: 0, shared: 0 };

  // Top countries
  const topCountries = Object.entries(byCountry)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 8);
  const maxCountryCount = topCountries.length > 0 ? (topCountries[0][1] as number) : 1;

  // Status bars
  const statusItems = [
    { label: "New", key: "new", color: "bg-blue-500" },
    { label: "Called", key: "called", color: "bg-flyfx-gold" },
    { label: "Positive", key: "they_callback", color: "bg-green-500" },
    { label: "Gatekeeper", key: "gatekeeper", color: "bg-red-500" },
    { label: "Callback", key: "callback_later", color: "bg-amber-500" },
    { label: "Follow-up", key: "follow_up_email", color: "bg-blue-400" },
    { label: "Negative", key: "negative", color: "bg-red-400" },
    { label: "In HubSpot", key: "imported", color: "bg-teal-500" },
    { label: "Deleted", key: "deleted", color: "bg-gray-600" },
  ];
  const maxStatusCount = Math.max(...statusItems.map((s) => byStatus[s.key] || 0), 1);

  function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
    return (
      <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-3 flex flex-col gap-0.5">
        <p className="text-[10px] text-flyfx-muted uppercase tracking-wider">{label}</p>
        <p className={`text-2xl font-bold ${color || "text-white"}`}>{value}</p>
        {sub && <p className="text-[10px] text-flyfx-muted">{sub}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-flyfx-muted">
        <div className="animate-spin text-3xl mb-4">&#x21BB;</div>
        Loading analytics...
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Analytics — All Time</h2>
          <p className="text-[11px] text-flyfx-muted mt-0.5">{month} · {totalCalls} calls · {totalInHubSpot} in HubSpot</p>
        </div>
        {poolStats?.poolSize > 0 && (
          <div className="text-right">
            <p className="text-xs text-flyfx-gold font-semibold">{poolStats.uncalled || 0} in pool</p>
            <p className="text-[10px] text-flyfx-muted">{poolStats.poolSize} total sourced</p>
          </div>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-3 gap-2">
        <KpiCard label="Calls Made" value={totalCalls} sub="unique contacts" />
        <KpiCard label="In HubSpot" value={totalInHubSpot} color="text-teal-400" sub="of 100 target" />
        <KpiCard
          label="Conversion"
          value={`${conversionRate}%`}
          sub={`${totalInHubSpot} / ${totalCalls}`}
          color={conversionRate >= 30 ? "text-green-400" : conversionRate >= 15 ? "text-amber-400" : "text-flyfx-muted"}
        />
        <KpiCard label="Remaining" value={100 - totalInHubSpot} sub="to hit 100" color="text-flyfx-gold" />
        <KpiCard label="Calls Needed" value={Math.ceil((100 - totalInHubSpot) / (conversionRate / 100))} sub={`at ${conversionRate}% rate`} color="text-amber-400" />
        <KpiCard label="Lead Pool" value={poolStats?.uncalled || 0} sub="uncalled" color="text-flyfx-muted" />
      </div>

      {/* Monthly Progress */}
      <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4">
        <p className="text-[10px] text-flyfx-muted uppercase tracking-wider font-semibold mb-2">{month} — Sprint to 100</p>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-white">{totalInHubSpot} / 100 contacts in HubSpot</span>
          <span className="text-xs font-bold text-flyfx-gold">{totalInHubSpot}%</span>
        </div>
        <div className="w-full bg-flyfx-dark rounded-full h-3 overflow-hidden">
          <div className="bg-flyfx-gold h-3 rounded-full transition-all" style={{ width: `${totalInHubSpot}%` }} />
        </div>
      </div>

      {/* Call Funnel */}
      <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4 space-y-3">
        <p className="text-[10px] text-flyfx-muted uppercase tracking-wider font-semibold">Call Funnel</p>
        {[
          { label: "Calls made", value: totalCalls, max: totalCalls, color: "bg-flyfx-border" },
          { label: "In HubSpot", value: totalInHubSpot, max: totalCalls, color: "bg-flyfx-gold" },
        ].map(({ label, value, max, color }) => (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-flyfx-muted">{label}</span>
              <span className="text-xs font-semibold text-white">{value}</span>
            </div>
            <div className="w-full bg-flyfx-dark rounded-full h-2 overflow-hidden">
              <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${(value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Status breakdown + Contacts by Country */}
      <div className="grid grid-cols-2 gap-3">
        {/* Status breakdown */}
        <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4 space-y-2">
          <p className="text-[10px] text-flyfx-muted uppercase tracking-wider font-semibold">Status Breakdown</p>
          {statusItems.map(({ label, key, color }) => {
            const val = byStatus[key] || 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-flyfx-muted w-16 flex-shrink-0">{label}</span>
                <div className="flex-1 bg-flyfx-dark rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max((val / maxStatusCount) * 100, val > 0 ? 4 : 0)}%` }} />
                </div>
                <span className="text-[10px] text-white w-4 text-right">{val}</span>
              </div>
            );
          })}
        </div>

        {/* Contacts by country */}
        <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4 space-y-2">
          <p className="text-[10px] text-flyfx-muted uppercase tracking-wider font-semibold">By Country</p>
          {topCountries.length > 0 ? topCountries.map(([country, count]) => (
            <div key={country} className="flex items-center gap-2">
              <span className="text-[10px] text-flyfx-muted w-20 flex-shrink-0 truncate">{country}</span>
              <div className="flex-1 bg-flyfx-dark rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full bg-flyfx-gold transition-all" style={{ width: `${((count as number) / maxCountryCount) * 100}%` }} />
              </div>
              <span className="text-[10px] text-white w-4 text-right">{count as number}</span>
            </div>
          )) : (
            <p className="text-[10px] text-flyfx-muted">No country data yet</p>
          )}
        </div>
      </div>

      {/* Kyle vs Gus */}
      <div className="bg-flyfx-card border border-flyfx-border rounded-xl p-4">
        <p className="text-[10px] text-flyfx-muted uppercase tracking-wider font-semibold mb-3">Kyle vs Gus — All Time</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { name: "Kyle", count: byAssigned.kyle, color: "text-blue-400", bar: "bg-blue-500" },
            { name: "Gus", count: byAssigned.gus + byAssigned.shared, color: "text-purple-400", bar: "bg-purple-500" },
          ].map(({ name, count: c, color, bar }) => (
            <div key={name} className="space-y-2">
              <p className={`text-sm font-semibold ${color}`}>{name}</p>
              <p className="text-2xl font-bold text-white">{c}</p>
              <p className="text-[10px] text-flyfx-muted">contacts assigned</p>
              <div className="w-full bg-flyfx-dark rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full ${bar}`} style={{ width: totalCalls > 0 ? `${(c / totalCalls) * 100}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {totalCalls < 1 && (
        <div className="text-center py-12 text-flyfx-muted">
          <p className="text-4xl mb-3 opacity-30">&#x1F4CA;</p>
          <p className="text-sm">No contacts yet.</p>
          <p className="text-xs mt-1">Run the pipeline to source your first leads.</p>
        </div>
      )}
    </div>
  );
}

// ─── PERSISTENCE HELPERS ─────────────────────────────────────
const DEALS_CACHE_KEY = "flyfx_deals_v2";
const FILTERS_KEY = "flyfx_filters_v1";

function readLocalStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function writeLocalStorage(key: string, val: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ─── MAIN APP ────────────────────────────────────────────────
export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [data, setData] = useState<DailyData | null>(() => readLocalStorage<DailyData>(DEALS_CACHE_KEY));

  // Apply dark mode class to html element
  useEffect(() => {
    const saved = localStorage.getItem("flyfx_dark_mode");
    if (saved === "true") { setDarkMode(true); document.documentElement.classList.add("dark"); }
  }, []);
  useEffect(() => {
    if (darkMode) { document.documentElement.classList.add("dark"); } else { document.documentElement.classList.remove("dark"); }
    localStorage.setItem("flyfx_dark_mode", String(darkMode));
  }, [darkMode]);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Filters — restored from localStorage
  const savedFilters = readLocalStorage<{ filter: string; personFilter: string; statusFilter: string }>(FILTERS_KEY);
  const [filter, setFilter] = useState<"all" | "call" | "email">((savedFilters?.filter as any) || "all");
  const [personFilter, setPersonFilter] = useState<"all" | "kyle" | "gus">((savedFilters?.personFilter as any) || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | "to_call" | "completed" | "callback" | "follow_up">((savedFilters?.statusFilter as any) || "all");
  const [bulkPushing, setBulkPushing] = useState(false);

  const [lastActionedDeal, setLastActionedDeal] = useState<{ deal: Deal; outcome: "positive" | "negative" } | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [statuses, setStatuses] = useState<Record<string, DealStatus>>({});
  const [rawStatuses, setRawStatuses] = useState<Record<string, any>>({});
  const [statusByApolloId, setStatusByApolloId] = useState<Record<string, DealStatus>>({});
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [importingQueue, setImportingQueue] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [appTab, setAppTab] = useState<"daily" | "pipeline" | "analytics" | "contacts" | "chat">("daily");
  const [contactsRefreshKey, setContactsRefreshKey] = useState(0);

  // Persist filter changes
  useEffect(() => {
    writeLocalStorage(FILTERS_KEY, { filter, personFilter, statusFilter });
  }, [filter, personFilter, statusFilter]);

  // Check session auth via server-side cookie validation
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((j) => { if (j.authed) setAuthed(true); })
      .catch(() => {});
  }, []);

  // Fetch pending import queue count on auth
  useEffect(() => {
    if (!authed) return;
    fetch("/api/rate/queue")
      .then((r) => r.json())
      .then((j) => setQueueCount(j.pending || 0))
      .catch(() => {});
  }, [authed]);

  // On auth: always reload statuses; only fetch deals if cache is stale (different date than today)
  useEffect(() => {
    if (!authed) return;
    const today = new Date().toISOString().split("T")[0];
    const cachedDate = readLocalStorage<DailyData>(DEALS_CACHE_KEY)?.date;
    if (cachedDate === today) {
      // Cache is today's data — just refresh statuses silently
      loadStatuses();
    } else {
      // Cache is stale or empty — fetch everything
      fetchDaily();
    }
  }, [authed]);

  const loadStatuses = useCallback(async () => {
    try {
      const sRes = await fetch("/api/status");
      if (sRes.ok) {
        const sJson = await sRes.json();
        const loaded: Record<string, DealStatus> = {};
        const loadedByApolloId: Record<string, DealStatus> = {};
        for (const [key, val] of Object.entries(sJson.statuses || {})) {
          loaded[key] = (val as any).status;
          if ((val as any).apolloId) {
            loadedByApolloId[(val as any).apolloId] = (val as any).status;
          }
        }
        setStatuses(loaded);
        setRawStatuses(sJson.statuses || {});
        setStatusByApolloId(loadedByApolloId);
      }
    } catch {}
  }, []);

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
          writeLocalStorage(DEALS_CACHE_KEY, json.data);
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
            writeLocalStorage(DEALS_CACHE_KEY, json);
            setBanner("Daily intelligence loaded (static)");
            setTimeout(() => setBanner(null), 4000);
          }
        }
      } catch {}
    }
    // Load saved statuses
    await loadStatuses();
    setLoading(false);
  }, [loadStatuses]);

  const handleStatusChange = useCallback(async (deal: Deal, newStatus: DealStatus) => {
    const key = `${deal.name}__${deal.company}`;
    setStatuses((prev) => ({ ...prev, [key]: newStatus }));
    setRawStatuses((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        status: newStatus,
        updatedAt: new Date().toISOString(),
        name: deal.name,
        company: deal.company,
        title: deal.title,
        city: deal.city,
        country: deal.country,
        specialisation: deal.specialisation,
      },
    }));
    if (deal.apolloId) {
      setStatusByApolloId((prev) => ({ ...prev, [deal.apolloId!]: newStatus }));
    }

    // When marking a meaningful outcome, set lastActionedDeal so the Calls tab
    // can pre-select this contact for Granola transcript analysis.
    if (newStatus === "they_callback" || newStatus === "deleted") {
      setLastActionedDeal({
        deal,
        outcome: newStatus === "they_callback" ? "positive" : "negative",
      });

      // Fire-and-forget: log the outcome to memory for AI training
      fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "log_outcome",
          contactName: deal.name,
          company: deal.company,
          outcome: newStatus === "they_callback" ? "positive" : "rejection",
          notes: `${deal.whyToday || ""} Vertical: ${deal.specialisation || ""}`.trim(),
          angle: deal.leadDifferentiator || null,
          addedBy: deal.assignedTo === "gus" ? "Gus" : "Kyle",
        }),
      }).catch(() => {});
    }

    try {
      await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal, status: newStatus }),
      });
      const labels: Record<DealStatus, string> = {
        new: "Restored",
        called: "Marked as called",
        negative: "Negative — completed",
        callback_later: "Call back later",
        they_callback: "Positive — go to Calls tab to add transcript",
        imported: "Imported to HubSpot",
        gatekeeper: "Logged as gatekeeper",
        follow_up_email: "Marked for follow-up email",
        existing_hubspot: "Flagged — company added to exclusion list",
        deleted: "Deleted — go to Calls tab to add transcript",
      };
      setBanner(`${deal.name} — ${labels[newStatus]}`);
      setTimeout(() => setBanner(null), 5000);
      // Trigger contacts tab refresh on next visit
      setContactsRefreshKey((prev) => prev + 1);
    } catch {
      setBanner("Failed to update status");
      setTimeout(() => setBanner(null), 3000);
    }
  }, []);

  const handleDealEdit = useCallback((deal: Deal, fields: Partial<Deal>) => {
    // Update the deal in the data state
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        deals: prev.deals.map((d) =>
          d.name === deal.name && d.company === deal.company ? { ...d, ...fields } : d
        ),
      };
    });
    // Persist edited fields via status API
    const updatedDeal = { ...deal, ...fields };
    fetch("/api/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal: updatedDeal, status: "new", notes: "Contact details edited" }),
    }).catch(() => {});
    setBanner(`${fields.name || deal.name} — details updated`);
    setTimeout(() => setBanner(null), 3000);
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
        if (deal.apolloId) {
          setStatusByApolloId((prev) => ({ ...prev, [deal.apolloId!]: "imported" }));
        }
        const hubspotLink = json.hubspotUrl ? ` — <a href="${json.hubspotUrl}" target="_blank" class="underline">View in HubSpot</a>` : "";
        setBanner(json.alreadyExisted
          ? `${deal.name} — already in HubSpot`
          : `${deal.name} — imported to HubSpot (Owner: ${deal.assignedTo === "gus" ? "Gus" : "Kyle Dow"})${json.hubspotUrl ? " ✓" : ""}`
        );
        // Open HubSpot URL if available
        if (json.hubspotUrl && !json.alreadyExisted) {
          window.open(json.hubspotUrl, "_blank");
        }
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

  // Bulk push all positive + follow-up deals to HubSpot
  const handleBulkHubSpotPush = useCallback(async (deals: Deal[]) => {
    if (!deals.length) return;
    setBulkPushing(true);
    setBanner(`Pushing ${deals.length} contact${deals.length > 1 ? "s" : ""} to HubSpot...`);
    let succeeded = 0;
    for (const deal of deals) {
      try {
        const res = await fetch("/api/hubspot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal }),
        });
        const json = await res.json();
        if (json.success) {
          const key = `${deal.name}__${deal.company}`;
          setStatuses((prev) => ({ ...prev, [key]: "imported" }));
          if (deal.apolloId) {
            setStatusByApolloId((prev) => ({ ...prev, [deal.apolloId!]: "imported" }));
          }
          await fetch("/api/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deal, status: "imported" }),
          });
          succeeded++;
        }
      } catch {}
    }
    setBulkPushing(false);
    setBanner(`${succeeded} of ${deals.length} contacts pushed to HubSpot`);
    setTimeout(() => setBanner(null), 5000);
  }, []);

  // Import approved leads from queue into HubSpot
  const handleImportApproved = useCallback(async () => {
    setImportingQueue(true);
    setBanner("Importing approved leads to HubSpot...");
    try {
      const res = await fetch("/api/import-approved", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setQueueCount(0);
        setBanner(json.message || `${json.succeeded} contact(s) imported to HubSpot`);
      } else {
        setBanner(`Import failed: ${json.error}`);
      }
    } catch {
      setBanner("Failed to import approved leads");
    } finally {
      setImportingQueue(false);
      setTimeout(() => setBanner(null), 5000);
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
      writeLocalStorage(DEALS_CACHE_KEY, json);
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
    if (statuses[key]) return statuses[key];
    if (d.apolloId && statusByApolloId[d.apolloId]) return statusByApolloId[d.apolloId];
    return "new";
  };

  const filteredDeals = data?.deals.filter((d) => {
    // Status filter
    const s = getDealStatus(d);
    if (statusFilter === "to_call" && s !== "new") return false;
    if (statusFilter === "completed" && s !== "called" && s !== "they_callback" && s !== "negative" && s !== "gatekeeper" && s !== "deleted" && s !== "imported" && s !== "existing_hubspot") return false;
    if (statusFilter === "callback" && s !== "callback_later") return false;
    if (statusFilter === "follow_up" && s !== "follow_up_email") return false;

    if (filter === "call" && !d.phone) return false;
    if (filter === "email" && d.phone) return false;
    if (personFilter !== "all" && d.assignedTo !== personFilter) return false;
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
  }).sort((a, b) => a.rank - b.rank);

  const statusMatch = (d: Deal) => {
    const s = getDealStatus(d);
    if (statusFilter === "all") return true;
    if (statusFilter === "to_call") return s === "new";
    if (statusFilter === "completed") return s === "called" || s === "they_callback" || s === "negative" || s === "gatekeeper" || s === "deleted" || s === "imported" || s === "existing_hubspot";
    if (statusFilter === "callback") return s === "callback_later";
    if (statusFilter === "follow_up") return s === "follow_up_email";
    return true;
  };
  const activeDeals = data?.deals.filter(statusMatch) ?? [];
  const toCallCount = data?.deals.filter((d) => getDealStatus(d) === "new").length ?? 0;
  const completedCount = data?.deals.filter((d) => { const s = getDealStatus(d); return s === "called" || s === "they_callback" || s === "negative" || s === "gatekeeper" || s === "deleted" || s === "imported" || s === "existing_hubspot"; }).length ?? 0;
  const callbackCount = data?.deals.filter((d) => getDealStatus(d) === "callback_later").length ?? 0;
  const followUpCount = data?.deals.filter((d) => getDealStatus(d) === "follow_up_email").length ?? 0;
  // Deals eligible for bulk HubSpot push: positive outcomes + follow-up emails
  const pushableDeals = data?.deals.filter((d) => {
    const s = getDealStatus(d);
    return s === "they_callback" || s === "follow_up_email";
  }) ?? [];
  const callCount = activeDeals.filter((d) => d.phone).length;
  const emailCount = activeDeals.filter((d) => !d.phone && d.email).length;
  const kyleCount = activeDeals.filter((d) => d.assignedTo === "kyle").length;
  const gusCount = activeDeals.filter((d) => d.assignedTo === "gus").length;

  return (
    <div className="min-h-screen pb-20 theme-bg" style={{ background: `var(--bg)` }}>
      {/* Banner */}
      {banner && (
        <div className="bg-green-600 text-white text-center py-2 text-sm font-medium animate-pulse">
          {banner}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-lg border-b" style={{ background: `var(--card)`, borderColor: `var(--border)` }}>
        {/* Row 1: logo — title — actions */}
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 pt-4 pb-3">
          {/* Left: Logo */}
          <div className="flex items-center w-40">
            <img src={darkMode ? "/flyfxfreight-logo.svg" : "/flyfxfreight-logo-dark.svg"} alt="FlyFXFreight" className="h-7" />
          </div>

          {/* Center: Title */}
          <div className="text-center">
            <h1 className="text-base font-bold tracking-wide" style={{ color: `var(--text)` }}>Deals Machine</h1>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 w-40 justify-end">
            {/* Theme toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? "Light mode" : "Dark mode"}
              className="flex items-center justify-center w-8 h-8 rounded-lg border transition text-sm font-medium"
              style={{ background: `var(--subtle)`, borderColor: `var(--border)`, color: `var(--text)` }}
            >
              {darkMode ? "☀" : "☾"}
            </button>
            {/* Upload JSON */}
            <label className="cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg border transition"
              style={{ background: `var(--subtle)`, borderColor: `var(--border)` }}
              title="Upload JSON">
              <UploadIcon />
              <input type="file" accept=".json" onChange={handleUpload} className="hidden" />
            </label>
            {/* Run + date */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => setAppTab("pipeline")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition ${
                  appTab === "pipeline"
                    ? "bg-flyfx-gold text-black"
                    : "bg-flyfx-gold/20 border border-flyfx-gold/50 text-flyfx-gold hover:bg-flyfx-gold/30"
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                Run
              </button>
              {data && (
                <span className="text-[10px] font-medium mt-1" style={{ color: `var(--muted)` }}>{data.date}</span>
              )}
            </div>
          </div>
        </div>
        {/* Row 2: tab nav */}
        <div className="max-w-5xl mx-auto px-4 pb-0">
          <div className="flex items-center gap-1">
            {([
              { key: "daily" as const, label: "Daily" },
              { key: "contacts" as const, label: "Contacts" },
              { key: "analytics" as const, label: "Stats" },
              { key: "chat" as const, label: "Chat" },
            ]).map((t) => (
              <button key={t.key} onClick={() => setAppTab(t.key)}
                className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition ${
                  appTab === t.key
                    ? "border-flyfx-gold text-flyfx-gold"
                    : "border-transparent"
                }`}
                style={appTab !== t.key ? { color: `var(--muted)` } : undefined}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {appTab === "pipeline" ? (
          <PipelineView onDealsLoaded={(d) => { setData(d); writeLocalStorage(DEALS_CACHE_KEY, d); setTimeout(() => setAppTab("daily"), 500); }} />
        ) : appTab === "contacts" ? (
          <ContactsView liveStatuses={rawStatuses} />
        ) : appTab === "analytics" ? (
          <AnalyticsView deals={data?.deals} statuses={rawStatuses} />
        ) : appTab === "chat" ? (
          <ChatView data={data} />
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
            {/* Monthly Progress Bar */}
            <ProgressBar />

            {/* Side by side: Market Intel + Call Playbook */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <MarketPanel data={data} />
              <ScriptIntel data={data.scriptIntelligence} />
            </div>

            {/* Deals Section — split by Kyle and Gus */}
            <div className="space-y-3">

              {/* Status filter */}
              <div className="flex items-center gap-1 bg-flyfx-card rounded-lg p-0.5 border border-flyfx-border overflow-x-auto">
                {([
                  { key: "all" as const, label: "All", count: data.deals.length },
                  { key: "to_call" as const, label: "To Call", count: toCallCount },
                  { key: "completed" as const, label: "Completed", count: completedCount },
                  { key: "callback" as const, label: "Call Back", count: callbackCount },
                  { key: "follow_up" as const, label: "Follow-up", count: followUpCount },
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

              {/* Bulk HubSpot push */}
              {pushableDeals.length > 0 && (
                <button
                  onClick={() => handleBulkHubSpotPush(pushableDeals)}
                  disabled={bulkPushing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600/20 border border-teal-500/40 text-teal-400 text-sm font-semibold hover:bg-teal-600/30 transition disabled:opacity-50"
                >
                  <HubSpotIcon />
                  {bulkPushing ? "Pushing to HubSpot..." : `Push ${pushableDeals.length} contact${pushableDeals.length > 1 ? "s" : ""} to HubSpot`}
                </button>
              )}

              {/* Import approved leads from rating queue */}
              {queueCount > 0 && (
                <button
                  onClick={handleImportApproved}
                  disabled={importingQueue}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-flyfx-gold/10 border border-flyfx-gold/40 text-flyfx-gold text-sm font-semibold hover:bg-flyfx-gold/20 transition disabled:opacity-50"
                >
                  <HubSpotIcon />
                  {importingQueue ? "Importing..." : `Import ${queueCount} approved lead${queueCount > 1 ? "s" : ""} to HubSpot`}
                </button>
              )}

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

              {/* Deal Cards — Split by Kyle and Gus */}
              {(() => {
                const kylesDeals = filteredDeals?.filter((d) => d.assignedTo === "kyle") || [];
                const gusDeals = filteredDeals?.filter((d) => d.assignedTo === "gus" || d.assignedTo === "shared") || [];

                const renderCard = (deal: Deal) => {
                  const key = `${deal.name}__${deal.company}`;
                  const cardId = deal.apolloId ?? key;
                  return (
                    <DealCard
                      key={cardId}
                      deal={deal}
                      isExpanded={expandedCard === cardId}
                      onToggle={() => setExpandedCard(expandedCard === cardId ? null : cardId)}
                      status={getDealStatus(deal)}
                      onStatusChange={(s) => handleStatusChange(deal, s)}
                      onHubSpotImport={() => handleHubSpotImport(deal)}
                      importing={importingKey === key}
                      onFollowUpEmail={() => setExpandedCard(cardId)}
                      onEdit={(fields) => handleDealEdit(deal, fields)}
                      showAsCompleted={getDealStatus(deal) !== "new"}
                    />
                  );
                };

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Kyle's deals */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Kyle</span>
                        <span className="text-[10px] text-flyfx-muted">{kylesDeals.length} deals</span>
                      </div>
                      {kylesDeals.map(renderCard)}
                      {kylesDeals.length === 0 && (
                        <p className="text-center text-flyfx-muted py-4 text-xs">No deals for Kyle</p>
                      )}
                    </div>
                    {/* Gus's deals */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Gus</span>
                        <span className="text-[10px] text-flyfx-muted">{gusDeals.length} deals</span>
                      </div>
                      {gusDeals.map(renderCard)}
                      {gusDeals.length === 0 && (
                        <p className="text-center text-flyfx-muted py-4 text-xs">No deals for Gus</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
