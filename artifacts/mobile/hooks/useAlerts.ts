import { useEffect, useRef, useState } from "react";

import type { BinanceData } from "./useBinanceData";
import type { MarketStructure } from "./useMarketStructure";
import type { ProbabilityResult } from "./useProbabilityEngine";
import type { SignalAnalysis } from "./useSignal";

/* ── Types ──────────────────────────────────────────────────────── */

export type AlertCategory =
  | "Signal"
  | "Trigger"
  | "Funding"
  | "Open Interest"
  | "Market Structure";

export type AlertPriority = "Low" | "Medium" | "High" | "Critical";

export interface AlertItem {
  id: string;
  timestamp: number;
  category: AlertCategory;
  priority: AlertPriority;
  title: string;
  description: string;
  coin: string;
}

export interface AlertStats {
  total: number;
  critical: number;
  high: number;
  lastAlertTime: number;
}

/* ── Helpers ────────────────────────────────────────────────────── */

let _idCounter = 0;
function makeId() { return `alert-${Date.now()}-${++_idCounter}`; }

function makeAlert(
  category: AlertCategory,
  priority: AlertPriority,
  title: string,
  description: string,
  coin: string,
): AlertItem {
  return { id: makeId(), timestamp: Date.now(), category, priority, title, description, coin };
}

/* ── Hook ───────────────────────────────────────────────────────── */

const MAX_ALERTS = 100;

export function useAlerts(
  analysis: SignalAnalysis,
  ms: MarketStructure,
  data: BinanceData,
  probability: ProbabilityResult,
  coin: string = "BTC",
): { alerts: AlertItem[]; stats: AlertStats } {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const prevSignalRef         = useRef<string | null>(null);
  const prevQualityRef        = useRef<string | null>(null);
  const prevLongReadRef       = useRef(-1);
  const prevShortReadRef      = useRef(-1);
  const prevFundingSignRef    = useRef<"pos" | "neg" | "zero" | null>(null);
  const prevOIRef             = useRef(0);
  const prevTrendRef          = useRef<string | null>(null);
  const prevProbRef           = useRef(-1);
  const initialized           = useRef(false);
  const prevCoinRef           = useRef(coin);

  /* Reset state on coin switch */
  useEffect(() => {
    if (prevCoinRef.current !== coin) {
      prevCoinRef.current = coin;
      initialized.current = false;
      prevSignalRef.current = null;
      prevQualityRef.current = null;
      prevLongReadRef.current = -1;
      prevShortReadRef.current = -1;
      prevFundingSignRef.current = null;
      prevOIRef.current = 0;
      prevTrendRef.current = null;
      prevProbRef.current = -1;
    }
  }, [coin]);

  const push = (item: AlertItem) => {
    setAlerts((prev) => [item, ...prev].slice(0, MAX_ALERTS));
  };

  useEffect(() => {
    if (!analysis.ready || !data.price) return;

    if (!initialized.current) {
      initialized.current = true;
      prevSignalRef.current      = analysis.signal;
      prevQualityRef.current     = analysis.qualityLabel;
      prevLongReadRef.current    = analysis.setupTriggers.longReadiness;
      prevShortReadRef.current   = analysis.setupTriggers.shortReadiness;
      prevFundingSignRef.current = data.fundingRate < 0 ? "neg" : data.fundingRate > 0 ? "pos" : "zero";
      prevOIRef.current          = data.openInterest;
      prevTrendRef.current       = ms.dominantTrend;
      prevProbRef.current        = probability.probability;
      return;
    }

    const newAlerts: AlertItem[] = [];

    /* ── Signal alerts ─────────────────────────────────────────── */
    if (prevSignalRef.current !== null && prevSignalRef.current !== analysis.signal) {
      const prev = prevSignalRef.current;
      const cur  = analysis.signal;
      if (cur === "LONG") {
        newAlerts.push(makeAlert("Signal", "High", `${coin} LONG signal confirmed`,
          `Signal flipped from ${prev} → LONG. Score: +${analysis.totalScore}/${analysis.maxTotalScore}.`, coin));
      } else if (cur === "SHORT") {
        newAlerts.push(makeAlert("Signal", "High", `${coin} SHORT signal confirmed`,
          `Signal flipped from ${prev} → SHORT. Score: ${analysis.totalScore}/${analysis.maxTotalScore}.`, coin));
      } else {
        newAlerts.push(makeAlert("Signal", "Medium", `${coin} signal returned to WAIT`,
          `Signal changed from ${prev} → WAIT. Confluence is below the entry threshold.`, coin));
      }
      prevSignalRef.current = analysis.signal;
    }

    /* Quality improvement alerts */
    const q = analysis.qualityLabel;
    if (prevQualityRef.current !== q && prevQualityRef.current !== null) {
      const highQ = q === "Strong Setup" || q === "High Conviction";
      const lowQ  = q === "Noise";
      if (highQ) {
        newAlerts.push(makeAlert("Signal", "High", `${coin} setup quality improved to ${q}`,
          `Signal quality upgraded from ${prevQualityRef.current} to ${q}.`, coin));
      } else if (lowQ) {
        newAlerts.push(makeAlert("Signal", "Low", `${coin} signal degraded to Noise`,
          "Signal strength fell below 20% — market conditions are unclear.", coin));
      }
      prevQualityRef.current = q;
    }

    /* ── Trigger readiness alerts ──────────────────────────────── */
    const { longReadiness, shortReadiness, longMet, shortMet, totalConditions } = analysis.setupTriggers;

    if (prevLongReadRef.current < 75 && longReadiness >= 75) {
      const crit = longMet === totalConditions;
      newAlerts.push(makeAlert("Trigger", crit ? "Critical" : "High",
        crit ? `${coin} LONG setup: ALL conditions met` : `${coin} LONG setup readiness reached ${longReadiness}%`,
        `${longMet} of ${totalConditions} long trigger conditions are now satisfied.`, coin,
      ));
    } else if (prevLongReadRef.current < 50 && longReadiness >= 50) {
      newAlerts.push(makeAlert("Trigger", "Medium", `${coin} LONG setup readiness at ${longReadiness}%`,
        `${longMet} of ${totalConditions} long trigger conditions satisfied.`, coin));
    }
    prevLongReadRef.current = longReadiness;

    if (prevShortReadRef.current < 75 && shortReadiness >= 75) {
      const crit = shortMet === totalConditions;
      newAlerts.push(makeAlert("Trigger", crit ? "Critical" : "High",
        crit ? `${coin} SHORT setup: ALL conditions met` : `${coin} SHORT setup readiness reached ${shortReadiness}%`,
        `${shortMet} of ${totalConditions} short trigger conditions are now satisfied.`, coin,
      ));
    } else if (prevShortReadRef.current < 50 && shortReadiness >= 50) {
      newAlerts.push(makeAlert("Trigger", "Medium", `${coin} SHORT setup readiness at ${shortReadiness}%`,
        `${shortMet} of ${totalConditions} short trigger conditions satisfied.`, coin));
    }
    prevShortReadRef.current = shortReadiness;

    /* ── Funding alerts ────────────────────────────────────────── */
    const fr    = data.fundingRate;
    const frPct = fr * 100;
    const frSign: "pos" | "neg" | "zero" = fr < -0.000001 ? "neg" : fr > 0.000001 ? "pos" : "zero";

    if (prevFundingSignRef.current !== null && prevFundingSignRef.current !== frSign) {
      if (frSign === "neg") {
        newAlerts.push(makeAlert("Funding", "High", `${coin} funding flipped bullish (shorts paying)`,
          `Funding changed from positive → negative (${frPct.toFixed(4)}%). Shorts are now paying longs.`, coin));
      } else if (frSign === "pos") {
        newAlerts.push(makeAlert("Funding", "High", `${coin} funding flipped bearish (longs paying)`,
          `Funding changed from negative → positive (${frPct.toFixed(4)}%). Longs are now paying shorts.`, coin));
      }
    }
    prevFundingSignRef.current = frSign;

    /* ── Open Interest alerts ──────────────────────────────────── */
    const curOI = data.openInterest;
    if (curOI > 0 && prevOIRef.current > 0) {
      const oiChg = ((curOI - prevOIRef.current) / prevOIRef.current) * 100;
      if (Math.abs(oiChg) >= 5) {
        const rising = oiChg > 0;
        newAlerts.push(makeAlert("Open Interest",
          Math.abs(oiChg) >= 8 ? "Critical" : "High",
          `${coin} Open Interest ${rising ? "surged" : "dropped"} ${Math.abs(oiChg).toFixed(1)}%`,
          `${coin} OI moved ${oiChg > 0 ? "+" : ""}${oiChg.toFixed(1)}%. ${rising ? "New positions opening." : "Positions closing/liquidated."}`, coin,
        ));
        prevOIRef.current = curOI;
      } else if (Math.abs(oiChg) >= 2) {
        newAlerts.push(makeAlert("Open Interest", "Medium",
          `${coin} Open Interest ${oiChg > 0 ? "increased" : "decreased"} ${Math.abs(oiChg).toFixed(1)}%`,
          `OI moved ${oiChg > 0 ? "+" : ""}${oiChg.toFixed(1)}% — ${oiChg > 0 ? "market participation increasing" : "positions unwinding"}.`, coin,
        ));
        prevOIRef.current = curOI;
      }
    } else if (curOI > 0) {
      prevOIRef.current = curOI;
    }

    /* ── Market Structure alerts ───────────────────────────────── */
    if (prevTrendRef.current !== null && ms.dominantTrend !== prevTrendRef.current && ms.lastUpdated > 0) {
      newAlerts.push(makeAlert("Market Structure", "Medium",
        `${coin} market structure turned ${ms.dominantTrend}`,
        `Dominant trend changed from ${prevTrendRef.current} → ${ms.dominantTrend}. ${ms.reasoning}`, coin,
      ));
      prevTrendRef.current = ms.dominantTrend;
    }

    /* ── Probability threshold alerts ─────────────────────────── */
    if (prevProbRef.current < 65 && probability.probability >= 65 && probability.ready) {
      newAlerts.push(makeAlert("Signal", "High",
        `${coin} setup probability reached ${probability.probability}%`,
        `Trade probability crossed the 65% threshold — ${probability.setupQuality} quality ${probability.direction} setup. Confluence: ${probability.confluenceScore}/${probability.totalConditions}.`, coin,
      ));
    }
    if (prevProbRef.current >= 65 && probability.probability < 65 && probability.ready) {
      newAlerts.push(makeAlert("Signal", "Low",
        `${coin} setup probability dropped to ${probability.probability}%`,
        "Probability fell below the 65% threshold — setup quality degraded.", coin,
      ));
    }
    prevProbRef.current = probability.probability;

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, MAX_ALERTS));
    }
  }, [analysis, ms, data, probability, coin]);

  const stats: AlertStats = {
    total:         alerts.length,
    critical:      alerts.filter((a) => a.priority === "Critical").length,
    high:          alerts.filter((a) => a.priority === "High").length,
    lastAlertTime: alerts[0]?.timestamp ?? 0,
  };

  return { alerts, stats };
}
