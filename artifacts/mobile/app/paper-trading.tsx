import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMultiCoinData, useTradingData } from "@/context/TradingContext";
import { useSelectedCoin } from "@/context/CoinContext";
import { useBinanceData } from "@/hooks/useBinanceData";
import { useAutoTrader } from "@/hooks/useAutoTrader";
import { useColors } from "@/hooks/useColors";
import { useSignalAnalysis } from "@/hooks/useSignal";
import {
  COIN_LABEL,
  LEVERAGES,
  PAPER_COINS,
  STARTING_BALANCE,
  TAKER_FEE,
  calcLiquidation,
  calcUnrealizedPnl,
  calcPnlPct,
  usePaperTrading,
  type LeverageValue,
  type PaperCoin,
  type PaperDirection,
  type PaperPosition,
  type PaperTrade,
  type TradeMode,
  type MarketRegime,
  REGIME_LABELS,
} from "@/hooks/usePaperTrading";

/* ── New Auto Trading State ──────────────────────────────────── */

const AUTO_TRADING_KEY = "pt_auto_trading_v2";

export type AutoTradingMode = "conservative" | "balanced" | "aggressive";

interface PersistedAutoTrading {
  enabled: boolean;
  autoExecute: boolean;
  mode: AutoTradingMode;
  leverage: number;
  riskPct: number;
  selectedCoins: PaperCoin[];
  minQuality: number;
  minConfidence: number;
  minProbability: number;
  allowedTimeframes: ConfigTimeframe[];
  allowedDirection: ConfigDirection;
  maxConcurrentTrades: number;
  maxDailyTrades: number;
  stopLossPct: number;
  takeProfitPct: number;
}

const DEFAULT_AUTO_STATE: PersistedAutoTrading = {
  enabled: false,
  autoExecute: false,
  mode: "balanced",
  leverage: 5,
  riskPct: 10,
  selectedCoins: [...PAPER_COINS],
  minQuality: 55,
  minConfidence: 50,
  minProbability: 50,
  allowedTimeframes: ["15m", "1h", "4h"],
  allowedDirection: "BOTH",
  maxConcurrentTrades: 2,
  maxDailyTrades: 5,
  stopLossPct: 1.5,
  takeProfitPct: 3.0,
};

// Mode presets
const MODE_PRESETS: Record<AutoTradingMode, { minQuality: number; minConfidence: number; maxConcurrent: number; stopLoss: number; takeProfit: number }> = {
  conservative: { minQuality: 65, minConfidence: 60, maxConcurrent: 1, stopLoss: 1.0, takeProfit: 2.0 },
  balanced: { minQuality: 55, minConfidence: 50, maxConcurrent: 2, stopLoss: 1.5, takeProfit: 3.0 },
  aggressive: { minQuality: 42, minConfidence: 40, maxConcurrent: 3, stopLoss: 2.0, takeProfit: 4.0 },
};

/* ── Auto Trading Component ─────────────────────────────────── */

function AutoTradingCard({
  autoState,
  allEngines,
  atState,
  onExecute,
  colors,
}: {
  autoState: PersistedAutoTrading;
  allEngines: ReturnType<typeof useMultiCoinData>;
  atState: AutoTraderState;
  onExecute: (coin: PaperCoin, signal: "LONG" | "SHORT", quality: number, confidence: number, probability: number, timeframe: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<AutoOpportunity | null>(null);

  // Filter opportunities based on auto trading settings
  const filteredOpportunities = useMemo(() => {
    return atState.opportunities.filter(opp => {
      if (!autoState.selectedCoins.includes(opp.coin as PaperCoin)) return false;
      if (autoState.allowedDirection !== "BOTH" && autoState.allowedDirection !== opp.signal) return false;
      if (autoState.allowedTimeframes.length > 0 && !autoState.allowedTimeframes.includes(opp.timeframe as ConfigTimeframe)) return false;
      return true;
    });
  }, [atState.opportunities, autoState]);

  const bestOpportunity = filteredOpportunities[0] ?? null;
  const totalOpportunities = filteredOpportunities.length;

  return (
    <View style={[s.autoTradingCard, { backgroundColor: colors.card, borderColor: autoState.enabled ? colors.primary + "44" : colors.cardBorder }]}>
      {/* Header */}
      <Pressable onPress={() => setExpanded(!expanded)}>
        <View style={s.autoTradingHeader}>
          <View style={s.autoTradingLeft}>
            <View style={[s.autoTradingBadge, { backgroundColor: autoState.enabled ? colors.primary + "22" : colors.border + "44" }]}>
              <Text style={[s.autoTradingBadgeText, { color: autoState.enabled ? colors.primary : colors.mutedForeground }]}>
                AUTO
              </Text>
            </View>
            <View>
              <Text style={[s.autoTradingTitle, { color: colors.foreground }]}>Auto Trading</Text>
              <Text style={[s.autoTradingSubtitle, { color: colors.mutedForeground }]}>
                {autoState.enabled 
                  ? autoState.autoExecute 
                    ? `Active · Auto-executing · ${totalOpportunities} opportunities` 
                    : `Active · ${totalOpportunities} opportunities found`
                  : "Disabled"
                }
              </Text>
            </View>
          </View>
          <View style={s.autoTradingRight}>
            <Switch
              value={autoState.enabled}
              onValueChange={() => {}}
              thumbColor={autoState.enabled ? colors.primary : "#6B7280"}
              trackColor={{ false: colors.border, true: colors.primary + "88" }}
            />
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View style={s.autoTradingContent}>
          {/* Quick Stats */}
          <View style={s.autoTradingStats}>
            <View style={[s.autoTradingStatItem, { borderColor: colors.border }]}>
              <Text style={[s.autoTradingStatValue, { color: totalOpportunities > 0 ? colors.up : colors.mutedForeground }]}>
                {totalOpportunities}
              </Text>
              <Text style={[s.autoTradingStatLabel, { color: colors.mutedForeground }]}>Opportunities</Text>
            </View>
            <View style={[s.autoTradingStatItem, { borderColor: colors.border }]}>
              <Text style={[s.autoTradingStatValue, { color: colors.foreground }]}>
                {atState.highestQuality}
              </Text>
              <Text style={[s.autoTradingStatLabel, { color: colors.mutedForeground }]}>Best Quality</Text>
            </View>
            <View style={[s.autoTradingStatItem, { borderColor: colors.border }]}>
              <Text style={[s.autoTradingStatValue, { color: colors.primary }]}>
                {autoState.selectedCoins.length}
              </Text>
              <Text style={[s.autoTradingStatLabel, { color: colors.mutedForeground }]}>Coins</Text>
            </View>
          </View>

          {/* Mode Selector */}
          <View style={s.autoTradingSection}>
            <Text style={[s.autoTradingSectionTitle, { color: colors.mutedForeground }]}>TRADING MODE</Text>
            <View style={s.autoTradingModes}>
              {(["conservative", "balanced", "aggressive"] as AutoTradingMode[]).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => {}}
                  style={[s.autoTradingModeBtn, { borderColor: colors.border }, autoState.mode === mode && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                >
                  <Text style={[s.autoTradingModeText, { color: autoState.mode === mode ? colors.primary : colors.mutedForeground }]}>
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[s.autoTradingModeHint, { color: colors.mutedForeground }]}>
              {autoState.mode === "conservative" && "High quality signals only, tight risk management"}
              {autoState.mode === "balanced" && "Balanced approach with moderate settings"}
              {autoState.mode === "aggressive" && "More opportunities, higher risk exposure"}
            </Text>
          </View>

          {/* Thresholds */}
          <View style={s.autoTradingSection}>
            <Text style={[s.autoTradingSectionTitle, { color: colors.mutedForeground }]}>THRESHOLDS</Text>
            
            <View style={s.autoTradingRow}>
              <Text style={[s.autoTradingLabel, { color: colors.foreground }]}>Quality Min</Text>
              <View style={s.autoTradingPills}>
                {[45, 55, 65, 75].map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => {}}
                    style={[s.autoTradingPill, { borderColor: colors.border }, autoState.minQuality === q && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                  >
                    <Text style={[s.autoTradingPillText, { color: autoState.minQuality === q ? colors.primary : colors.mutedForeground }]}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={s.autoTradingRow}>
              <Text style={[s.autoTradingLabel, { color: colors.foreground }]}>Confidence Min</Text>
              <View style={s.autoTradingPills}>
                {[40, 50, 60, 70].map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => {}}
                    style={[s.autoTradingPill, { borderColor: colors.border }, autoState.minConfidence === c && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                  >
                    <Text style={[s.autoTradingPillText, { color: autoState.minConfidence === c ? colors.primary : colors.mutedForeground }]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={s.autoTradingRow}>
              <Text style={[s.autoTradingLabel, { color: colors.foreground }]}>Probability Min</Text>
              <View style={s.autoTradingPills}>
                {[40, 50, 60, 70].map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => {}}
                    style={[s.autoTradingPill, { borderColor: colors.border }, autoState.minProbability === p && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                  >
                    <Text style={[s.autoTradingPillText, { color: autoState.minProbability === p ? colors.primary : colors.mutedForeground }]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Direction & Timeframes */}
          <View style={s.autoTradingSection}>
            <Text style={[s.autoTradingSectionTitle, { color: colors.mutedForeground }]}>FILTERS</Text>
            
            <View style={s.autoTradingRow}>
              <Text style={[s.autoTradingLabel, { color: colors.foreground }]}>Direction</Text>
              <View style={s.autoTradingPills}>
                {(["BOTH", "LONG", "SHORT"] as const).map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => {}}
                    style={[s.autoTradingPill, { borderColor: colors.border }, autoState.allowedDirection === d && { backgroundColor: (d === "LONG" ? colors.up : d === "SHORT" ? colors.down : colors.primary) + "22", borderColor: d === "LONG" ? colors.up : d === "SHORT" ? colors.down : colors.primary }]}
                  >
                    <Text style={[s.autoTradingPillText, { color: autoState.allowedDirection === d ? (d === "LONG" ? colors.up : d === "SHORT" ? colors.down : colors.primary) : colors.mutedForeground }]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={s.autoTradingRow}>
              <Text style={[s.autoTradingLabel, { color: colors.foreground }]}>Timeframes</Text>
              <View style={s.autoTradingPills}>
                {(["1m", "5m", "15m", "1h", "4h"] as const).map((tf) => (
                  <Pressable
                    key={tf}
                    onPress={() => {}}
                    style={[s.autoTradingPill, { borderColor: colors.border }, autoState.allowedTimeframes.includes(tf) && { backgroundColor: colors.up + "22", borderColor: colors.up }]}
                  >
                    <Text style={[s.autoTradingPillText, { color: autoState.allowedTimeframes.includes(tf) ? colors.up : colors.mutedForeground }]}>{tf}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Risk Management */}
          <View style={s.autoTradingSection}>
            <Text style={[s.autoTradingSectionTitle, { color: colors.mutedForeground }]}>RISK MANAGEMENT</Text>
            
            <View style={s.autoTradingRow}>
              <Text style={[s.autoTradingLabel, { color: colors.foreground }]}>Leverage</Text>
              <View style={s.autoTradingPills}>
                {[3, 5, 10, 15, 20].map((l) => (
                  <Pressable
                    key={l}
                    onPress={() => {}}
                    style={[s.autoTradingPill, { borderColor: colors.border }, autoState.leverage === l && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                  >
                    <Text style={[s.autoTradingPillText, { color: autoState.leverage === l ? colors.primary : colors.mutedForeground }]}>{l}×</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={s.autoTradingRow}>
              <Text style={[s.autoTradingLabel, { color: colors.foreground }]}>Risk per Trade</Text>
              <View style={s.autoTradingPills}>
                {[5, 10, 15, 20].map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => {}}
                    style={[s.autoTradingPill, { borderColor: colors.border }, autoState.riskPct === r && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                  >
                    <Text style={[s.autoTradingPillText, { color: autoState.riskPct === r ? colors.primary : colors.mutedForeground }]}>{r}%</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={s.autoTradingRow}>
              <Text style={[s.autoTradingLabel, { color: colors.foreground }]}>Max Concurrent</Text>
              <View style={s.autoTradingPills}>
                {[1, 2, 3].map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {}}
                    style={[s.autoTradingPill, { borderColor: colors.border }, autoState.maxConcurrentTrades === m && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                  >
                    <Text style={[s.autoTradingPillText, { color: autoState.maxConcurrentTrades === m ? colors.primary : colors.mutedForeground }]}>{m}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={s.autoTradingRow}>
              <Text style={[s.autoTradingLabel, { color: colors.foreground }]}>Max Daily</Text>
              <View style={s.autoTradingPills}>
                {[3, 5, 8, 10].map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {}}
                    style={[s.autoTradingPill, { borderColor: colors.border }, autoState.maxDailyTrades === m && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                  >
                    <Text style={[s.autoTradingPillText, { color: autoState.maxDailyTrades === m ? colors.primary : colors.mutedForeground }]}>{m}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Auto Execute Toggle */}
          <View style={[s.autoTradingSection, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }]}>
            <View style={s.autoTradingToggleRow}>
              <View>
                <Text style={[s.autoTradingToggleTitle, { color: colors.foreground }]}>Auto Execute</Text>
                <Text style={[s.autoTradingToggleSub, { color: colors.mutedForeground }]}>
                  Automatically open trades when opportunities match thresholds
                </Text>
              </View>
              <Switch
                value={autoState.autoExecute}
                onValueChange={() => {}}
                thumbColor={autoState.autoExecute ? colors.primary : "#6B7280"}
                trackColor={{ false: colors.border, true: colors.primary + "88" }}
              />
            </View>
          </View>

          {/* Best Opportunity */}
          {bestOpportunity && (
            <View style={[s.autoTradingOppCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "44" }]}>
              <View style={s.autoTradingOppHeader}>
                <Text style={[s.autoTradingOppLabel, { color: colors.primary }]}>TOP OPPORTUNITY</Text>
                <View style={[s.autoTradingOppSig, { backgroundColor: (bestOpportunity.signal === "LONG" ? colors.up : colors.down) + "22" }]}>
                  <Text style={[s.autoTradingOppSigText, { color: bestOpportunity.signal === "LONG" ? colors.up : colors.down }]}>
                    {bestOpportunity.signal}
                  </Text>
                </View>
              </View>
              <Text style={[s.autoTradingOppCoin, { color: colors.foreground }]}>
                {bestOpportunity.ticker} · {bestOpportunity.timeframe} · Q:{bestOpportunity.qualityScore} C:{bestOpportunity.probability.toFixed(0)}%
              </Text>
              <Text style={[s.autoTradingOppExpl, { color: colors.mutedForeground }]}>
                {bestOpportunity.explanation}
              </Text>
              <View style={s.autoTradingOppDetails}>
                <View style={s.autoTradingOppDetail}>
                  <Text style={[s.autoTradingOppDetailLabel, { color: colors.mutedForeground }]}>Entry</Text>
                  <Text style={[s.autoTradingOppDetailValue, { color: colors.foreground }]}>${fmtPrice(bestOpportunity.entryPrice)}</Text>
                </View>
                <View style={s.autoTradingOppDetail}>
                  <Text style={[s.autoTradingOppDetailLabel, { color: colors.mutedForeground }]}>Stop</Text>
                  <Text style={[s.autoTradingOppDetailValue, { color: colors.down }]}>${fmtPrice(bestOpportunity.stopLoss)}</Text>
                </View>
                <View style={s.autoTradingOppDetail}>
                  <Text style={[s.autoTradingOppDetailLabel, { color: colors.mutedForeground }]}>Target</Text>
                  <Text style={[s.autoTradingOppDetailValue, { color: colors.up }]}>${fmtPrice(bestOpportunity.takeProfit)}</Text>
                </View>
                <View style={s.autoTradingOppDetail}>
                  <Text style={[s.autoTradingOppDetailLabel, { color: colors.mutedForeground }]}>Factors</Text>
                  <Text style={[s.autoTradingOppDetailValue, { color: colors.foreground }]}>{bestOpportunity.confirmedFactors}/{bestOpportunity.totalFactors}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  onExecute(
                    bestOpportunity.coin as PaperCoin,
                    bestOpportunity.signal,
                    bestOpportunity.qualityScore,
                    bestOpportunity.probability,
                    bestOpportunity.probability,
                    bestOpportunity.timeframe
                  );
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
                style={[s.autoTradingOppBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[s.autoTradingOppBtnText, { color: "#fff" }]}>Execute Trade</Text>
              </Pressable>
            </View>
          )}

          {/* All Opportunities */}
          {filteredOpportunities.length > 1 && (
            <View style={s.autoTradingOppList}>
              <Text style={[s.autoTradingOppListTitle, { color: colors.mutedForeground }]}>ALL OPPORTUNITIES</Text>
              {filteredOpportunities.slice(0, 3).map((opp) => (
                <Pressable
                  key={opp.coin}
                  onPress={() => setSelectedOpp(opp === selectedOpp ? null : opp)}
                  style={[s.autoTradingOppItem, { borderColor: colors.border }, opp === selectedOpp && { backgroundColor: colors.primary + "08" }]}
                >
                  <View style={s.autoTradingOppItemLeft}>
                    <View style={[s.autoTradingOppItemSig, { backgroundColor: (opp.signal === "LONG" ? colors.up : colors.down) + "18" }]}>
                      <Text style={[s.autoTradingOppItemSigText, { color: opp.signal === "LONG" ? colors.up : colors.down }]}>{opp.signal}</Text>
                    </View>
                    <Text style={[s.autoTradingOppItemCoin, { color: colors.foreground }]}>{opp.ticker}</Text>
                  </View>
                  <View style={s.autoTradingOppItemRight}>
                    <Text style={[s.autoTradingOppItemQuality, { color: opp.qualityScore >= 60 ? colors.up : opp.qualityScore >= 45 ? colors.wait : colors.down }]}>
                      {opp.qualityScore}
                    </Text>
                    <Text style={[s.autoTradingOppItemTF, { color: colors.mutedForeground }]}>{opp.timeframe}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {autoState.enabled && !bestOpportunity && (
            <View style={[s.autoTradingNoOpp, { backgroundColor: colors.border + "30" }]}>
              <Text style={[s.autoTradingNoOppText, { color: colors.mutedForeground }]}>
                No opportunities match your criteria. Adjust thresholds or wait for better signals.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function fmt$(v: number, dp = 2) {
  const abs = Math.abs(v);
  const str = abs >= 1000 ? abs.toFixed(dp === 0 ? 0 : 2) : abs.toFixed(dp);
  return `${v < 0 ? "-" : ""}$${str}`;
}
function fmtPct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function fmtDur(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
function fmtPrice(p: number) {
  if (p >= 10000) return p.toFixed(1);
  if (p >= 100)   return p.toFixed(2);
  if (p >= 1)     return p.toFixed(3);
  return p.toFixed(4);
}

type Tab = "trade" | "history" | "stats" | "signals" | "modes" | "killswitch" | "regime" | "reviews";
const TABS: { id: Tab; label: string }[] = [
  { id: "trade",      label: "Trade"      },
  { id: "history",    label: "History"    },
  { id: "stats",      label: "Stats"      },
  { id: "modes",      label: "Modes"      },
  { id: "killswitch", label: "Kill"      },
  { id: "regime",     label: "Regime"     },
  { id: "reviews",    label: "Reviews"    },
  { id: "signals",    label: "Signals"    },
];

/* ── Sub-components ──────────────────────────────────────────────── */

function Pill({
  label, active, color, onPress,
}: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.pill, active && { backgroundColor: color + "28", borderColor: color }]}
    >
      <Text style={[s.pillText, { color: active ? color : "#6B7280" }]}>{label}</Text>
    </Pressable>
  );
}

function StatCell({
  label, value, color, colors,
}: { label: string; value: string; color?: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={s.statCell}>
      <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[s.statValue, { color: color ?? colors.foreground }]}>{value}</Text>
    </View>
  );
}

/* ── Account Summary ────────────────────────────────────────────── */

function AccountBar({ analytics, colors }: { analytics: ReturnType<typeof usePaperTrading>["analytics"]; colors: ReturnType<typeof useColors> }) {
  const pnlColor = analytics.totalPnl >= 0 ? colors.up : colors.down;
  return (
    <View style={[s.accountBar, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={s.accountItem}>
        <Text style={[s.accountLabel, { color: colors.mutedForeground }]}>Balance</Text>
        <Text style={[s.accountValue, { color: colors.foreground }]}>{fmt$(analytics.totalBalance)}</Text>
      </View>
      <View style={[s.accountDiv, { backgroundColor: colors.border }]} />
      <View style={s.accountItem}>
        <Text style={[s.accountLabel, { color: colors.mutedForeground }]}>Available</Text>
        <Text style={[s.accountValue, { color: colors.foreground }]}>{fmt$(analytics.cashBalance)}</Text>
      </View>
      <View style={[s.accountDiv, { backgroundColor: colors.border }]} />
      <View style={s.accountItem}>
        <Text style={[s.accountLabel, { color: colors.mutedForeground }]}>Total PnL</Text>
        <Text style={[s.accountValue, { color: pnlColor }]}>{fmt$(analytics.totalPnl)}</Text>
      </View>
      <View style={[s.accountDiv, { backgroundColor: colors.border }]} />
      <View style={s.accountItem}>
        <Text style={[s.accountLabel, { color: colors.mutedForeground }]}>Win Rate</Text>
        <Text style={[s.accountValue, { color: analytics.winRate >= 50 ? colors.up : colors.down }]}>
          {analytics.totalTrades > 0 ? `${analytics.winRate.toFixed(0)}%` : "—"}
        </Text>
      </View>
    </View>
  );
}

/* ── Position Card ──────────────────────────────────────────────── */

function PositionCard({
  pos, currentPrice, onClose, onMoveSL, onAdjustTP, colors,
}: {
  pos: PaperPosition;
  currentPrice: number;
  onClose: () => void;
  onMoveSL: () => void;
  onAdjustTP: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const unrealized = currentPrice > 0 ? calcUnrealizedPnl(pos, currentPrice) - 0 : 0;
  const pnlPct     = calcPnlPct(unrealized, pos.margin);
  const pnlColor   = unrealized >= 0 ? colors.up : colors.down;
  const dirColor   = pos.direction === "LONG" ? colors.up : colors.down;
  const elapsed    = Date.now() - pos.openedAt;
  const ticker     = COIN_LABEL[pos.coin];

  return (
    <View style={[s.posCard, { backgroundColor: colors.card, borderColor: pos.direction === "LONG" ? colors.up + "44" : colors.down + "44" }]}>
      <View style={s.posHeader}>
        <View style={s.posLeft}>
          <View style={[s.dirBadge, { backgroundColor: dirColor + "22" }]}>
            <Text style={[s.dirText, { color: dirColor }]}>{pos.direction}</Text>
          </View>
          <Text style={[s.posCoin, { color: colors.foreground }]}>{ticker}/USDT</Text>
          <Text style={[s.posLev, { color: colors.mutedForeground }]}>{pos.leverage}×</Text>
          {pos.signalFollowed && (
            <View style={[s.sigBadge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[s.sigBadgeText, { color: colors.primary }]}>AUTO</Text>
            </View>
          )}
        </View>
        <View style={s.posRight}>
          <Text style={[s.posPnl, { color: pnlColor }]}>{fmt$(unrealized)}</Text>
          <Text style={[s.posPnlPct, { color: pnlColor }]}>{fmtPct(pnlPct)}</Text>
        </View>
      </View>

      <View style={s.posGrid}>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>Entry</Text>
          <Text style={[s.posGVal, { color: colors.foreground }]}>${fmtPrice(pos.entryPrice)}</Text>
        </View>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>Current</Text>
          <Text style={[s.posGVal, { color: colors.foreground }]}>
            {currentPrice > 0 ? `$${fmtPrice(currentPrice)}` : "—"}
          </Text>
        </View>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>Liq. Price</Text>
          <Text style={[s.posGVal, { color: colors.down }]}>${fmtPrice(pos.liquidationPrice)}</Text>
        </View>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>Size</Text>
          <Text style={[s.posGVal, { color: colors.foreground }]}>{fmt$(pos.notional, 0)}</Text>
        </View>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>SL</Text>
          <Text style={[s.posGVal, { color: colors.down }]}>{pos.stopLoss ? `$${fmtPrice(pos.stopLoss)}` : "—"}</Text>
        </View>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>TP</Text>
          <Text style={[s.posGVal, { color: colors.up }]}>{pos.takeProfit ? `$${fmtPrice(pos.takeProfit)}` : "—"}</Text>
        </View>
      </View>

      <View style={[s.posDivider, { backgroundColor: colors.border }]} />
      <View style={s.posActions}>
        <Text style={[s.posTime, { color: colors.mutedForeground }]}>{fmtDur(elapsed)}</Text>
        <View style={s.posButtons}>
          <Pressable style={[s.posBtn, { borderColor: colors.border }]} onPress={onMoveSL}>
            <Text style={[s.posBtnText, { color: colors.mutedForeground }]}>Move SL</Text>
          </Pressable>
          <Pressable style={[s.posBtn, { borderColor: colors.border }]} onPress={onAdjustTP}>
            <Text style={[s.posBtnText, { color: colors.mutedForeground }]}>Adjust TP</Text>
          </Pressable>
          <Pressable style={[s.closePosBtn, { backgroundColor: colors.down + "22", borderColor: colors.down + "55" }]} onPress={onClose}>
            <Text style={[s.posBtnText, { color: colors.down, fontFamily: "Inter_600SemiBold" }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* ── Order Form ──────────────────────────────────────────────────── */

function OrderForm({
  selectedCoin, prices, cashBalance, onExecute, colors,
}: {
  selectedCoin: PaperCoin;
  prices: Record<PaperCoin, number>;
  cashBalance: number;
  onExecute: (params: {
    direction: PaperDirection;
    marginUSDT: number;
    leverage: LeverageValue;
    orderType: "market" | "limit";
    limitPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [direction, setDirection] = useState<PaperDirection>("LONG");
  const [leverage, setLeverage]   = useState<LeverageValue>(5);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [sizeInput, setSizeInput] = useState("");
  const [slInput, setSlInput]     = useState("");
  const [tpInput, setTpInput]     = useState("");
  const [limitInput, setLimitInput] = useState("");

  const currentPrice = prices[selectedCoin] ?? 0;
  const marginUSDT   = parseFloat(sizeInput) || 0;
  const notional     = marginUSDT * leverage;
  const entryPrice   = orderType === "limit" && parseFloat(limitInput) > 0 ? parseFloat(limitInput) : currentPrice;
  const liqPrice     = entryPrice > 0 ? calcLiquidation(entryPrice, leverage, direction) : 0;
  const entryFee     = notional * TAKER_FEE;
  const riskUSD      = parseFloat(slInput) > 0 && entryPrice > 0
    ? Math.abs(parseFloat(slInput) - entryPrice) / entryPrice * notional
    : 0;
  const rewardUSD    = parseFloat(tpInput) > 0 && entryPrice > 0
    ? Math.abs(parseFloat(tpInput) - entryPrice) / entryPrice * notional
    : 0;
  const rr           = riskUSD > 0 ? rewardUSD / riskUSD : 0;

  const setPct = (pct: number) => {
    setSizeInput(((cashBalance * pct) / 100).toFixed(2));
  };

  const canExecute = marginUSDT >= 0.5 && marginUSDT <= cashBalance && currentPrice > 0;

  const execute = () => {
    if (!canExecute) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onExecute({
      direction, marginUSDT: parseFloat(sizeInput), leverage,
      orderType,
      limitPrice: orderType === "limit" ? parseFloat(limitInput) : undefined,
      stopLoss: parseFloat(slInput) > 0 ? parseFloat(slInput) : undefined,
      takeProfit: parseFloat(tpInput) > 0 ? parseFloat(tpInput) : undefined,
    });
    setSizeInput(""); setSlInput(""); setTpInput(""); setLimitInput("");
  };

  return (
    <View style={[s.form, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[s.formTitle, { color: colors.mutedForeground }]}>NEW ORDER</Text>

      {/* Direction */}
      <View style={s.dirRow}>
        <Pressable
          style={[s.dirBtn, direction === "LONG" && { backgroundColor: colors.up + "22", borderColor: colors.up }]}
          onPress={() => setDirection("LONG")}
        >
          <Text style={[s.dirBtnText, { color: direction === "LONG" ? colors.up : colors.mutedForeground }]}>▲ LONG</Text>
        </Pressable>
        <Pressable
          style={[s.dirBtn, direction === "SHORT" && { backgroundColor: colors.down + "22", borderColor: colors.down }]}
          onPress={() => setDirection("SHORT")}
        >
          <Text style={[s.dirBtnText, { color: direction === "SHORT" ? colors.down : colors.mutedForeground }]}>▼ SHORT</Text>
        </Pressable>
      </View>

      {/* Order type */}
      <View style={s.rowGap}>
        {(["market", "limit"] as const).map((t) => (
          <Pressable key={t} onPress={() => setOrderType(t)} style={[s.smallPill, orderType === t && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
            <Text style={[s.smallPillText, { color: orderType === t ? colors.primary : colors.mutedForeground }]}>
              {t === "market" ? "Market" : "Limit"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Limit price */}
      {orderType === "limit" && (
        <View style={[s.inputRow, { borderColor: colors.border }]}>
          <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>Limit Price $</Text>
          <TextInput
            style={[s.input, { color: colors.foreground }]}
            value={limitInput}
            onChangeText={setLimitInput}
            keyboardType="decimal-pad"
            placeholder={currentPrice > 0 ? fmtPrice(currentPrice) : "0.00"}
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
      )}

      {/* Size input */}
      <View style={[s.inputRow, { borderColor: colors.border }]}>
        <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>Margin (USDT)</Text>
        <TextInput
          style={[s.input, { color: colors.foreground }]}
          value={sizeInput}
          onChangeText={setSizeInput}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      <View style={s.pctRow}>
        {[25, 50, 75, 100].map((pct) => (
          <Pressable key={pct} onPress={() => setPct(pct)} style={[s.pctBtn, { borderColor: colors.border }]}>
            <Text style={[s.pctText, { color: colors.mutedForeground }]}>{pct}%</Text>
          </Pressable>
        ))}
      </View>

      {/* Leverage */}
      <Text style={[s.subLabel, { color: colors.mutedForeground }]}>LEVERAGE</Text>
      <View style={s.levRow}>
        {LEVERAGES.map((lev) => (
          <Pressable key={lev} onPress={() => setLeverage(lev)}
            style={[s.levBtn, { borderColor: colors.border }, leverage === lev && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
          >
            <Text style={[s.levText, { color: leverage === lev ? colors.primary : colors.mutedForeground }]}>{lev}×</Text>
          </Pressable>
        ))}
      </View>

      {/* SL / TP */}
      <View style={s.slTpRow}>
        <View style={[s.inputRow, s.half, { borderColor: colors.border }]}>
          <Text style={[s.inputLabel, { color: colors.down }]}>SL $</Text>
          <TextInput style={[s.input, { color: colors.foreground }]} value={slInput} onChangeText={setSlInput}
            keyboardType="decimal-pad" placeholder="optional" placeholderTextColor={colors.mutedForeground} />
        </View>
        <View style={[s.inputRow, s.half, { borderColor: colors.border }]}>
          <Text style={[s.inputLabel, { color: colors.up }]}>TP $</Text>
          <TextInput style={[s.input, { color: colors.foreground }]} value={tpInput} onChangeText={setTpInput}
            keyboardType="decimal-pad" placeholder="optional" placeholderTextColor={colors.mutedForeground} />
        </View>
      </View>

      {/* Preview */}
      {marginUSDT > 0 && entryPrice > 0 && (
        <View style={[s.preview, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={s.previewRow}>
            <Text style={[s.previewKey, { color: colors.mutedForeground }]}>Entry</Text>
            <Text style={[s.previewVal, { color: colors.foreground }]}>${fmtPrice(entryPrice)}</Text>
          </View>
          <View style={s.previewRow}>
            <Text style={[s.previewKey, { color: colors.mutedForeground }]}>Position Size</Text>
            <Text style={[s.previewVal, { color: colors.foreground }]}>{fmt$(notional, 0)}</Text>
          </View>
          <View style={s.previewRow}>
            <Text style={[s.previewKey, { color: colors.mutedForeground }]}>Liquidation</Text>
            <Text style={[s.previewVal, { color: colors.down }]}>${fmtPrice(liqPrice)}</Text>
          </View>
          <View style={s.previewRow}>
            <Text style={[s.previewKey, { color: colors.mutedForeground }]}>Est. Fee</Text>
            <Text style={[s.previewVal, { color: colors.mutedForeground }]}>{fmt$(entryFee, 3)}</Text>
          </View>
          {rr > 0 && (
            <View style={s.previewRow}>
              <Text style={[s.previewKey, { color: colors.mutedForeground }]}>Risk/Reward</Text>
              <Text style={[s.previewVal, { color: colors.wait }]}>1:{rr.toFixed(2)}</Text>
            </View>
          )}
        </View>
      )}

      <Pressable
        style={[s.execBtn, { backgroundColor: canExecute ? (direction === "LONG" ? colors.up : colors.down) : colors.border }]}
        onPress={execute}
        disabled={!canExecute}
      >
        <Text style={[s.execText, { color: canExecute ? "#fff" : colors.mutedForeground }]}>
          {direction === "LONG" ? "▲ OPEN LONG" : "▼ OPEN SHORT"}
        </Text>
      </Pressable>
    </View>
  );
}

/* ── Trade History Item ──────────────────────────────────────────── */

function HistoryItem({ trade, colors }: { trade: PaperTrade; colors: ReturnType<typeof useColors> }) {
  const pnlColor = trade.pnl >= 0 ? colors.up : colors.down;
  const dirColor = trade.direction === "LONG" ? colors.up : colors.down;
  return (
    <View style={[s.histItem, { borderBottomColor: colors.border }]}>
      <View style={s.histLeft}>
        <View style={[s.dirBadge, { backgroundColor: dirColor + "22" }]}>
          <Text style={[s.dirText, { color: dirColor }]}>{trade.direction[0]}</Text>
        </View>
        <View>
          <Text style={[s.histCoin, { color: colors.foreground }]}>{COIN_LABEL[trade.coin]}/USDT · {trade.leverage}×</Text>
          <Text style={[s.histSub, { color: colors.mutedForeground }]}>
            {new Date(trade.closedAt).toLocaleDateString()} · {fmtDur(trade.duration)}
          </Text>
        </View>
      </View>
      <View style={s.histRight}>
        <Text style={[s.histPnl, { color: pnlColor }]}>{fmt$(trade.pnl)}</Text>
        <Text style={[s.histPct, { color: pnlColor }]}>{fmtPct(trade.pnlPct)}</Text>
        <Text style={[s.histReason, { color: colors.mutedForeground }]}>{trade.exitReason}</Text>
      </View>
    </View>
  );
}

/* ── Main Screen ─────────────────────────────────────────────────── */

export default function PaperTradingScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const topPad   = Platform.OS === "web" ? 60 : insets.top;

  const [activeTab, setActiveTab]       = useState<Tab>("trade");
  // Use CoinContext for persistent coin selection
  const { selectedCoin, setCoin } = useSelectedCoin();
  
  // Persistent Auto Trading State
  const [atState, setAtState] = useState<PersistedAutoTrading>(DEFAULT_AUTO_STATE);
  
  // Load persisted auto trading state on mount
  useEffect(() => {
    AsyncStorage.getItem(AUTO_TRADING_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setAtState({ ...DEFAULT_AUTO_STATE, ...parsed });
        } catch {}
      }
    });
  }, []);

  // Persist auto trading state changes
  const persistAtState = (next: PersistedAutoTrading) => {
    setAtState(next);
    AsyncStorage.setItem(AUTO_TRADING_KEY, JSON.stringify(next)).catch(() => {});
  };

  /* Live prices for all coins */
  const btcData = useBinanceData("BTCUSDT");
  const ethData = useBinanceData("ETHUSDT");
  const solData = useBinanceData("SOLUSDT");
  const xrpData = useBinanceData("XRPUSDT");

  const prices = useMemo<Record<PaperCoin, number>>(() => ({
    BTCUSDT: btcData.price,
    ETHUSDT: ethData.price,
    SOLUSDT: solData.price,
    XRPUSDT: xrpData.price,
  }), [btcData.price, ethData.price, solData.price, xrpData.price]);

  const currentData = useMemo(() => {
    switch (selectedCoin) {
      case "ETHUSDT": return ethData;
      case "SOLUSDT": return solData;
      case "XRPUSDT": return xrpData;
      default:         return btcData;
    }
  }, [selectedCoin, btcData, ethData, solData, xrpData]);

  /* Multi-coin engines for auto trader */
  const allEngines = useMultiCoinData();
  
  // Auto trader state
  const autoState  = useAutoTrader(allEngines, atState.enabled, atState.minQuality);

  /* Signal for selected coin - use TradingContext for full signal analysis with extras */
  const engine = useTradingData();
  const signalAnalysis = engine.analysis;
  const currentSignal  = signalAnalysis.signal;

  const {
    loaded, positions, history, cashBalance, analytics,
    openTrade, closeTrade, moveStopLoss, adjustTakeProfit, resetAccount, followSignal,
    prevSignalRef, detectMarketRegime, killSwitchConfig,
  } = usePaperTrading(prices);

  const modeStats = analytics.modeStats;
  const regimeStats = analytics.regimeStats;

  // Detect current market regime
  const btcRegime = useMemo(() => {
    return detectMarketRegime(
      btcData.priceChangePercent,
      btcData.quoteVolume,
      0, // funding rate not available
    );
  }, [btcData.priceChangePercent, btcData.quoteVolume]);

  /* Auto Execute - trigger when auto trading opportunities match criteria */
  const prevAutoSignal = useRef<Record<string, string>>({});
  
  useEffect(() => {
    if (!atState.enabled || !atState.autoExecute) return;
    
    // Check all opportunities for auto execution
    for (const opp of autoState.opportunities) {
      if (!atState.selectedCoins.includes(opp.coin as PaperCoin)) continue;
      if (atState.allowedDirection !== "BOTH" && atState.allowedDirection !== opp.signal) continue;
      if (opp.qualityScore < atState.minQuality) continue;
      if (opp.probability < atState.minProbability) continue;
      if (positions.length >= atState.maxConcurrentTrades) break;
      
      // Check if we've already triggered this signal
      const signalKey = `${opp.coin}_${opp.signal}_${opp.timeframe}`;
      if (prevAutoSignal.current[signalKey] === signalKey) continue;
      
      // Execute the trade
      prevAutoSignal.current[signalKey] = signalKey;
      followSignal({ 
        coin: opp.coin as PaperCoin, 
        signal: opp.signal,
        leverage: atState.leverage as LeverageValue, 
        riskPct: atState.riskPct,
        timeframe: opp.timeframe as ConfigTimeframe,
        signalQuality: opp.qualityScore,
        confidence: opp.probability,
        probability: opp.probability,
        marketRegime: btcRegime.regime,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [autoState.opportunities, atState, positions.length, followSignal, btcRegime]);

  // Handle manual execution from Auto Trading card
  const handleAutoExecute = useCallback((
    coin: PaperCoin, 
    signal: "LONG" | "SHORT", 
    quality: number, 
    confidence: number, 
    probability: number, 
    timeframe: string
  ) => {
    followSignal({ 
      coin, 
      signal,
      leverage: atState.leverage as LeverageValue, 
      riskPct: atState.riskPct,
      timeframe: timeframe as ConfigTimeframe,
      signalQuality: quality,
      confidence,
      probability,
      marketRegime: btcRegime.regime,
    });
  }, [followSignal, atState, btcRegime]);

  const handleOpen = useCallback((params: {
    direction: "LONG" | "SHORT";
    marginUSDT: number;
    leverage: LeverageValue;
    orderType: "market" | "limit";
    limitPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => {
    openTrade({ coin: selectedCoin, ...params, signalFollowed: false });
  }, [openTrade, selectedCoin]);

  const handleClose = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeTrade(id, "manual");
  }, [closeTrade]);

  const handleMoveSL = useCallback((pos: PaperPosition) => {
    Alert.prompt("Move Stop Loss", "Enter new stop loss price:", (val) => {
      const p = parseFloat(val ?? "");
      if (p > 0) moveStopLoss(pos.id, p);
    }, "plain-text", pos.stopLoss?.toString() ?? "");
  }, [moveStopLoss]);

  const handleAdjustTP = useCallback((pos: PaperPosition) => {
    Alert.prompt("Adjust Take Profit", "Enter new take profit price:", (val) => {
      const p = parseFloat(val ?? "");
      if (p > 0) adjustTakeProfit(pos.id, p);
    }, "plain-text", pos.takeProfit?.toString() ?? "");
  }, [adjustTakeProfit]);

  const handleReset = () => {
    Alert.alert(
      "Reset Account",
      `Current Balance: ${fmt$(analytics.totalBalance)}\nWin Rate: ${analytics.winRate > 0 ? `${analytics.winRate.toFixed(1)}%` : "—"}\nTotal Trades: ${analytics.totalTrades}\nTotal PnL: ${fmt$(analytics.totalPnl)}\n\n⚠️ This will reset balance to $${STARTING_BALANCE}. Trade history will be preserved.\n\nContinue?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => resetAccount(true) },
      ]
    );
  };

  /* Signal color - kept for backwards compatibility */
  // const sigColor = currentSignal === "LONG" ? colors.up : currentSignal === "SHORT" ? colors.down : colors.wait;

  if (!loaded) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <View style={s.headerLeft}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <View>
            <Text style={[s.title, { color: colors.foreground }]}>Paper Trading</Text>
            <Text style={[s.subtitle, { color: colors.mutedForeground }]}>Simulated · Real Market Data</Text>
          </View>
        </View>
        <Pressable onPress={handleReset} style={[s.resetBtn, { borderColor: colors.border }]}>
          <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
          <Text style={[s.resetText, { color: colors.mutedForeground }]}>Reset</Text>
        </Pressable>
      </View>

      {/* Account bar */}
      <AccountBar analytics={analytics} colors={colors} />

      {/* Tabs */}
      <View style={[s.tabBar, { borderBottomColor: colors.border }]}>
        {TABS.map((tab) => (
          <Pressable key={tab.id} style={s.tab} onPress={() => setActiveTab(tab.id)}>
            <Text style={[s.tabText, { color: activeTab === tab.id ? colors.primary : colors.mutedForeground }]}>
              {tab.label}
            </Text>
            {activeTab === tab.id && <View style={[s.tabLine, { backgroundColor: colors.primary }]} />}
          </Pressable>
        ))}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>

        {/* ── TRADE TAB ──────────────────────────────────────── */}
        {activeTab === "trade" && (
          <>
            {/* Coin selector */}
            <View style={s.coinRow}>
              {PAPER_COINS.map((c) => (
                <Pressable key={c} onPress={() => setSelectedCoin(c)}
                  style={[s.coinPill, selectedCoin === c && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                >
                  <Text style={[s.coinPillText, { color: selectedCoin === c ? colors.primary : colors.mutedForeground }]}>
                    {COIN_LABEL[c]}
                  </Text>
                </Pressable>
              ))}
              <View style={[s.pricePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.priceText, { color: colors.foreground }]}>
                  {prices[selectedCoin] > 0 ? `$${fmtPrice(prices[selectedCoin])}` : "—"}
                </Text>
              </View>
            </View>

            {/* New Auto Trading Card */}
            <AutoTradingCard
              autoState={atState}
              allEngines={allEngines}
              atState={autoState}
              onExecute={handleAutoExecute}
              colors={colors}
            />

            {/* Open positions */}
            {positions.filter((p) => p.coin === selectedCoin).length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>OPEN POSITIONS</Text>
                {positions.filter((p) => p.coin === selectedCoin).map((pos) => (
                  <PositionCard
                    key={pos.id}
                    pos={pos}
                    currentPrice={prices[pos.coin] ?? 0}
                    onClose={() => handleClose(pos.id)}
                    onMoveSL={() => handleMoveSL(pos)}
                    onAdjustTP={() => handleAdjustTP(pos)}
                    colors={colors}
                  />
                ))}
              </>
            )}

            {/* All other coins with open positions */}
            {positions.filter((p) => p.coin !== selectedCoin).length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>OTHER POSITIONS</Text>
                {positions.filter((p) => p.coin !== selectedCoin).map((pos) => (
                  <PositionCard
                    key={pos.id}
                    pos={pos}
                    currentPrice={prices[pos.coin] ?? 0}
                    onClose={() => handleClose(pos.id)}
                    onMoveSL={() => handleMoveSL(pos)}
                    onAdjustTP={() => handleAdjustTP(pos)}
                    colors={colors}
                  />
                ))}
              </>
            )}

            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>ORDER FORM</Text>
            <OrderForm
              selectedCoin={selectedCoin}
              prices={prices}
              cashBalance={cashBalance}
              onExecute={handleOpen}
              colors={colors}
            />
          </>
        )}

        {/* ── HISTORY TAB ───────────────────────────────────── */}
        {activeTab === "history" && (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {history.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No closed trades yet.</Text>
            ) : (
              history.map((t) => <HistoryItem key={t.id} trade={t} colors={colors} />)
            )}
          </View>
        )}

        {/* ── STATS TAB ─────────────────────────────────────── */}
        {activeTab === "stats" && (
          <>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>PERFORMANCE</Text>
              <View style={s.statsGrid}>
                <StatCell label="Total Trades" value={`${analytics.totalTrades}`} colors={colors} />
                <StatCell label="Win Rate"     value={analytics.totalTrades > 0 ? `${analytics.winRate.toFixed(1)}%` : "—"} color={analytics.winRate >= 50 ? colors.up : colors.down} colors={colors} />
                <StatCell label="Profit Factor" value={analytics.profitFactor > 0 ? analytics.profitFactor.toFixed(2) : "—"} color={analytics.profitFactor >= 1.5 ? colors.up : analytics.profitFactor >= 1 ? colors.wait : colors.down} colors={colors} />
                <StatCell label="Avg RR"       value={analytics.avgRR > 0 ? `1:${analytics.avgRR.toFixed(2)}` : "—"} colors={colors} />
                <StatCell label="Avg Win"      value={analytics.avgWin > 0 ? fmt$(analytics.avgWin) : "—"} color={colors.up} colors={colors} />
                <StatCell label="Avg Loss"     value={analytics.avgLoss > 0 ? fmt$(analytics.avgLoss) : "—"} color={colors.down} colors={colors} />
                <StatCell label="Best Trade"   value={analytics.bestTrade ? fmt$(analytics.bestTrade.pnl) : "—"} color={colors.up} colors={colors} />
                <StatCell label="Worst Trade"  value={analytics.worstTrade ? fmt$(analytics.worstTrade.pnl) : "—"} color={colors.down} colors={colors} />
              </View>
            </View>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>STREAKS</Text>
              <View style={s.statsGrid}>
                <StatCell label="Current Streak" value={analytics.curStreak === 0 ? "—" : analytics.curStreak > 0 ? `+${analytics.curStreak} W` : `${analytics.curStreak} L`}
                  color={analytics.curStreak > 0 ? colors.up : analytics.curStreak < 0 ? colors.down : undefined} colors={colors} />
                <StatCell label="Longest Win"    value={analytics.longestWin > 0 ? `${analytics.longestWin} W` : "—"} color={colors.up} colors={colors} />
                <StatCell label="Longest Loss"   value={analytics.longestLoss > 0 ? `${analytics.longestLoss} L` : "—"} color={colors.down} colors={colors} />
                <StatCell label="Daily PnL"      value={fmt$(analytics.dailyPnl)} color={analytics.dailyPnl >= 0 ? colors.up : colors.down} colors={colors} />
              </View>
            </View>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>ACCOUNT</Text>
              <View style={s.statsGrid}>
                <StatCell label="Starting Balance" value={`$${STARTING_BALANCE}`} colors={colors} />
                <StatCell label="Current Balance"  value={fmt$(analytics.totalBalance)} color={analytics.totalPnl >= 0 ? colors.up : colors.down} colors={colors} />
                <StatCell label="Total Return"     value={fmtPct(analytics.totalPnlPct)} color={analytics.totalPnlPct >= 0 ? colors.up : colors.down} colors={colors} />
                <StatCell label="Used Margin"      value={analytics.usedMargin > 0 ? fmt$(analytics.usedMargin) : "$0.00"} colors={colors} />
              </View>
            </View>
          </>
        )}

        {/* ── SIGNALS TAB ───────────────────────────────────── */}
        {activeTab === "signals" && (
          <>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>SIGNAL ACCURACY</Text>
              {analytics.coinAccuracy.length === 0 ? (
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                  No signal-followed trades yet. Enable Signal Follow Mode and let the system trade automatically.
                </Text>
              ) : (
                analytics.coinAccuracy.map((c) => {
                  const pct = c.total > 0 ? (c.wins / c.total) * 100 : 0;
                  const color = pct >= 60 ? colors.up : pct >= 45 ? colors.wait : colors.down;
                  return (
                    <View key={c.coin} style={[s.sigAccRow, { borderBottomColor: colors.border }]}>
                      <Text style={[s.sigAccCoin, { color: colors.foreground }]}>{COIN_LABEL[c.coin]}/USDT</Text>
                      <Text style={[s.sigAccTotal, { color: colors.mutedForeground }]}>{c.total} trades</Text>
                      <View style={[s.sigAccBar, { backgroundColor: colors.border }]}>
                        <View style={[s.sigAccFill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
                      </View>
                      <Text style={[s.sigAccPct, { color }]}>{c.total > 0 ? `${pct.toFixed(0)}%` : "—"}</Text>
                    </View>
                  );
                })
              )}
            </View>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>HIGHLIGHTS</Text>
              <View style={s.statsGrid}>
                <StatCell label="Most Profitable" value={analytics.mostProfitableCoin} color={colors.up} colors={colors} />
                <StatCell label="Most Accurate"   value={analytics.mostAccurateCoin}   color={colors.primary} colors={colors} />
                <StatCell label="Signal Trades"   value={`${history.filter((t) => t.signalFollowed).length}`} colors={colors} />
                <StatCell label="Manual Trades"   value={`${history.filter((t) => !t.signalFollowed).length}`} colors={colors} />
              </View>
            </View>
            <View style={[s.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.noteText, { color: colors.mutedForeground }]}>
                Signal accuracy is tracked only for auto-followed trades. Manual trades are excluded from signal statistics.
              </Text>
            </View>
          </>
        )}

        {/* ── MODES TAB ─────────────────────────────────────── */}
        {activeTab === "modes" && (
          <>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>SCALPER MODE</Text>
              <View style={s.statsGrid}>
                <StatCell label="Scalper Trades" value={`${modeStats?.scalper?.totalTrades ?? 0}`} colors={colors} />
                <StatCell label="Win Rate" value={modeStats?.scalper?.winRate ? `${modeStats.scalper.winRate.toFixed(1)}%` : "—"} color={modeStats?.scalper?.winRate >= 50 ? colors.up : colors.down} colors={colors} />
                <StatCell label="Profit Factor" value={modeStats?.scalper?.profitFactor ? modeStats.scalper.profitFactor.toFixed(2) : "—"} colors={colors} />
                <StatCell label="Avg Duration" value={modeStats?.scalper?.avgDuration ? fmtDur(modeStats.scalper.avgDuration) : "—"} colors={colors} />
                <StatCell label="Total PnL" value={modeStats?.scalper?.totalPnl ? fmt$(modeStats.scalper.totalPnl) : "—"} color={modeStats?.scalper?.totalPnl >= 0 ? colors.up : colors.down} colors={colors} />
              </View>
              <Text style={[s.noteText, { color: colors.mutedForeground, marginTop: 8 }]}>Focus: 1m, 5m, 15m timeframes. Fast entries, higher frequency.</Text>
            </View>
            
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>NORMAL MODE</Text>
              <View style={s.statsGrid}>
                <StatCell label="Normal Trades" value={`${modeStats?.normal?.totalTrades ?? 0}`} colors={colors} />
                <StatCell label="Win Rate" value={modeStats?.normal?.winRate ? `${modeStats.normal.winRate.toFixed(1)}%` : "—"} color={modeStats?.normal?.winRate >= 50 ? colors.up : colors.down} colors={colors} />
                <StatCell label="Profit Factor" value={modeStats?.normal?.profitFactor ? modeStats.normal.profitFactor.toFixed(2) : "—"} colors={colors} />
                <StatCell label="Avg Duration" value={modeStats?.normal?.avgDuration ? fmtDur(modeStats.normal.avgDuration) : "—"} colors={colors} />
                <StatCell label="Total PnL" value={modeStats?.normal?.totalPnl ? fmt$(modeStats.normal.totalPnl) : "—"} color={modeStats?.normal?.totalPnl >= 0 ? colors.up : colors.down} colors={colors} />
              </View>
              <Text style={[s.noteText, { color: colors.mutedForeground, marginTop: 8 }]}>Focus: 15m, 1h, 4h timeframes. Higher quality setups.</Text>
            </View>
          </>
        )}

        {/* ── KILLSWITCH TAB ─────────────────────────────────────── */}
        {activeTab === "killswitch" && (
          <>
            <View style={[s.card, { backgroundColor: analytics.settings?.killSwitchActive ? colors.down + "22" : colors.card, borderColor: analytics.settings?.killSwitchActive ? colors.down + "44" : colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: analytics.settings?.killSwitchActive ? colors.down : colors.mutedForeground }]}>KILL SWITCH</Text>
              <View style={s.statsGrid}>
                <StatCell label="Status" value={analytics.settings?.killSwitchActive ? "ACTIVE" : "INACTIVE"} color={analytics.settings?.killSwitchActive ? colors.down : colors.up} colors={colors} />
                {analytics.settings?.killSwitchReason && (
                  <StatCell label="Reason" value={analytics.settings.killSwitchReason} color={colors.down} colors={colors} />
                )}
              </View>
            </View>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>CONFIGURED LIMITS</Text>
              <View style={s.statsGrid}>
                <StatCell label="Max Consecutive Losses" value={`${killSwitchConfig?.maxConsecutiveLosses ?? 3}`} colors={colors} />
                <StatCell label="Max Daily Loss ($)" value={`$${killSwitchConfig?.maxDailyLoss ?? 20}`} colors={colors} />
                <StatCell label="Max Drawdown (%)" value={`${killSwitchConfig?.maxDailyDrawdown ?? 25}%`} colors={colors} />
                <StatCell label="Max Losing Trades/Day" value={`${killSwitchConfig?.maxLosingTradesPerDay ?? 5}`} colors={colors} />
                <StatCell label="Recovery Mode" value={killSwitchConfig?.recoveryMode ?? "manual"} colors={colors} />
              </View>
            </View>
          </>
        )}

        {/* ── REGIME TAB ─────────────────────────────────────── */}
        {activeTab === "regime" && (
          <>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>CURRENT REGIME</Text>
              <View style={[s.regimeHeader, { backgroundColor: colors.primary + "15", padding: 16, borderRadius: 12, alignItems: "center" }]}>
                <Text style={[s.regimeName, { color: colors.primary }]}>{REGIME_LABELS[btcRegime.regime] ?? "Unknown"}</Text>
                <Text style={[s.regimeConf, { color: colors.mutedForeground }]}>Confidence: {btcRegime.confidence}%</Text>
              </View>
              <Text style={[s.noteText, { color: colors.mutedForeground, marginTop: 12 }]}>{btcRegime.explanation}</Text>
            </View>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>REGIME PERFORMANCE</Text>
              {Object.entries(regimeStats as Record<string, { totalTrades: number; winRate: number; totalPnl: number }> ?? {}).filter(([_, v]) => v.totalTrades > 0).map(([key, stats]) => (
                <View key={key} style={[s.regimeRow, { borderBottomColor: colors.border }]}>
                  <Text style={[s.regimeLabel, { color: colors.foreground }]}>{REGIME_LABELS[key as MarketRegime] ?? key}</Text>
                  <Text style={[s.regimeStat, { color: colors.mutedForeground }]}>{stats.totalTrades} trades</Text>
                  <Text style={[s.regimeStat, { color: stats.winRate >= 50 ? colors.up : colors.down }]}>{stats.winRate.toFixed(0)}%</Text>
                  <Text style={[s.regimeStat, { color: stats.totalPnl >= 0 ? colors.up : colors.down }]}>{fmt$(stats.totalPnl)}</Text>
                </View>
              ))}
              {Object.values(regimeStats as Record<string, { totalTrades: number }> ?? {}).filter(v => v.totalTrades > 0).length === 0 && (
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No regime data yet. Trade to build statistics.</Text>
              )}
            </View>
          </>
        )}

        {/* ── REVIEWS TAB ─────────────────────────────────────── */}
        {activeTab === "reviews" && (
          <>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>TRADE REVIEWS</Text>
              {history.length === 0 ? (
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No trades completed yet.</Text>
              ) : (
                history.slice(0, 20).map((trade) => (
                  <View key={trade.id} style={[s.reviewItem, { borderBottomColor: colors.border }]}>
                    <View style={s.reviewHeader}>
                      <View style={[s.dirBadge, { backgroundColor: trade.direction === "LONG" ? colors.up + "22" : colors.down + "22" }]}>
                        <Text style={[s.dirText, { color: trade.direction === "LONG" ? colors.up : colors.down }]}>{trade.direction}</Text>
                      </View>
                      <Text style={[s.reviewCoin, { color: colors.foreground }]}>{COIN_LABEL[trade.coin]}/{trade.timeframe}</Text>
                      <Text style={[s.reviewPnl, { color: trade.pnl >= 0 ? colors.up : colors.down }]}>{fmt$(trade.pnl)}</Text>
                    </View>
                    {trade.tradeReview && (
                      <Text style={[s.reviewText, { color: colors.mutedForeground }]}>{trade.tradeReview}</Text>
                    )}
                    <Text style={[s.reviewMeta, { color: colors.mutedForeground }]}>
                      {new Date(trade.closedAt).toLocaleDateString()} · {fmtDur(trade.duration)} · Q:{trade.signalQuality} C:{trade.confidence}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* ── SIGNALS TAB ───────────────────────────────────── */}
        {activeTab === "signals" && (
          <>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>SIGNAL ACCURACY</Text>
              {analytics.coinAccuracy.length === 0 ? (
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                  No signal-followed trades yet. Enable Signal Follow Mode and let the system trade automatically.
                </Text>
              ) : (
                analytics.coinAccuracy.map((c) => {
                  const pct = c.total > 0 ? (c.wins / c.total) * 100 : 0;
                  const color = pct >= 60 ? colors.up : pct >= 45 ? colors.wait : colors.down;
                  return (
                    <View key={c.coin} style={[s.sigAccRow, { borderBottomColor: colors.border }]}>
                      <Text style={[s.sigAccCoin, { color: colors.foreground }]}>{COIN_LABEL[c.coin]}/USDT</Text>
                      <Text style={[s.sigAccTotal, { color: colors.mutedForeground }]}>{c.total} trades</Text>
                      <View style={[s.sigAccBar, { backgroundColor: colors.border }]}>
                        <View style={[s.sigAccFill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
                      </View>
                      <Text style={[s.sigAccPct, { color }]}>{c.total > 0 ? `${pct.toFixed(0)}%` : "—"}</Text>
                    </View>
                  );
                })
              )}
            </View>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>HIGHLIGHTS</Text>
              <View style={s.statsGrid}>
                <StatCell label="Most Profitable" value={analytics.mostProfitableCoin} color={colors.up} colors={colors} />
                <StatCell label="Most Accurate"   value={analytics.mostAccurateCoin}   color={colors.primary} colors={colors} />
                <StatCell label="Signal Trades"   value={`${history.filter((t) => t.signalFollowed).length}`} colors={colors} />
                <StatCell label="Manual Trades"   value={`${history.filter((t) => !t.signalFollowed).length}`} colors={colors} />
              </View>
            </View>
            <View style={[s.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.noteText, { color: colors.mutedForeground }]}>
                Signal accuracy is tracked only for auto-followed trades. Manual trades are excluded from signal statistics.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  root:        { flex: 1 },
  loadingText: { flex: 1, textAlign: "center", marginTop: 100, fontSize: 14, fontFamily: "Inter_400Regular" },

  header:      { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft:  { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn:     { padding: 4 },
  title:       { fontSize: 17, fontFamily: "Inter_700Bold" },
  subtitle:    { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  resetBtn:    { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  resetText:   { fontSize: 10, fontFamily: "Inter_500Medium" },

  accountBar:  { flexDirection: "row", marginHorizontal: 12, marginTop: 10, borderRadius: 12, borderWidth: 1, padding: 10 },
  accountItem: { flex: 1, alignItems: "center", gap: 2 },
  accountDiv:  { width: 1, marginVertical: 4 },
  accountLabel:{ fontSize: 8, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
  accountValue:{ fontSize: 12, fontFamily: "Inter_700Bold" },

  tabBar:     { flexDirection: "row", borderBottomWidth: 1, marginTop: 10 },
  tab:        { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabText:    { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tabLine:    { position: "absolute", bottom: 0, left: "10%", right: "10%", height: 2, borderRadius: 1 },

  scroll:     { flex: 1 },
  content:    { padding: 12, gap: 10 },

  coinRow:    { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  coinPill:   { borderWidth: 1, borderRadius: 8, borderColor: "#374151", paddingHorizontal: 10, paddingVertical: 5 },
  coinPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  pricePill:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginLeft: "auto" },
  priceText:  { fontSize: 11, fontFamily: "Inter_700Bold" },

  sectionLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2, marginTop: 4 },

  card:       { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  cardTitle:  { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.4 },

  followCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  followHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  followTitle:  { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  followSub:    { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  followSignal: { flexDirection: "row", alignItems: "center", gap: 8 },
  followSigLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  signalBadge:  { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  signalText:   { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  followConfig: { gap: 8 },
  followRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  followConfigLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  followNote:   { fontSize: 9, fontFamily: "Inter_400Regular", fontStyle: "italic" },

  levRowSmall: { flexDirection: "row", gap: 4 },
  levBtnSm:   { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  levTextSm:  { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  posCard:    { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  posHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  posLeft:    { flexDirection: "row", alignItems: "center", gap: 6 },
  posRight:   { alignItems: "flex-end" },
  dirBadge:   { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  dirText:    { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  posCoin:    { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  posLev:     { fontSize: 11, fontFamily: "Inter_400Regular" },
  sigBadge:   { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  sigBadgeText: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  posPnl:     { fontSize: 15, fontFamily: "Inter_700Bold" },
  posPnlPct:  { fontSize: 10, fontFamily: "Inter_400Regular" },

  posGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  posGridItem:{ width: "30%", gap: 2 },
  posGKey:    { fontSize: 8, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
  posGVal:    { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  posDivider: { height: 1 },
  posActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  posTime:    { fontSize: 9, fontFamily: "Inter_400Regular" },
  posButtons: { flexDirection: "row", gap: 6 },
  posBtn:     { borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  closePosBtn:{ borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  posBtnText: { fontSize: 10, fontFamily: "Inter_500Medium" },

  form:       { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  formTitle:  { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.4 },
  dirRow:     { flexDirection: "row", gap: 8 },
  dirBtn:     { flex: 1, borderWidth: 1, borderRadius: 10, borderColor: "#374151", paddingVertical: 10, alignItems: "center" },
  dirBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  rowGap:     { flexDirection: "row", gap: 6 },
  smallPill:  { borderWidth: 1, borderRadius: 8, borderColor: "#374151", paddingHorizontal: 10, paddingVertical: 5 },
  smallPillText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  inputRow:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  inputLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  input:      { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right", minWidth: 80 },
  half:       { flex: 1 },
  slTpRow:    { flexDirection: "row", gap: 8 },

  pctRow:     { flexDirection: "row", gap: 6 },
  pctBtn:     { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 6, alignItems: "center" },
  pctText:    { fontSize: 10, fontFamily: "Inter_500Medium" },

  subLabel:   { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  levRow:     { flexDirection: "row", gap: 6 },
  levBtn:     { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 7, alignItems: "center" },
  levText:    { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  preview:    { borderRadius: 10, borderWidth: 1, padding: 10, gap: 5 },
  previewRow: { flexDirection: "row", justifyContent: "space-between" },
  previewKey: { fontSize: 11, fontFamily: "Inter_400Regular" },
  previewVal: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  execBtn:    { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  execText:   { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  histItem:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  histLeft:   { flexDirection: "row", alignItems: "center", gap: 8 },
  histCoin:   { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  histSub:    { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 1 },
  histRight:  { alignItems: "flex-end" },
  histPnl:    { fontSize: 13, fontFamily: "Inter_700Bold" },
  histPct:    { fontSize: 10, fontFamily: "Inter_400Regular" },
  histReason: { fontSize: 9, fontFamily: "Inter_400Regular" },

  statsGrid:  { flexDirection: "row", flexWrap: "wrap", gap: 0 },
  statCell:   { width: "50%", paddingVertical: 8, paddingHorizontal: 4, gap: 2 },
  statLabel:  { fontSize: 9, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
  statValue:  { fontSize: 15, fontFamily: "Inter_700Bold" },

  sigAccRow:  { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
  sigAccCoin: { width: 60, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sigAccTotal:{ width: 55, fontSize: 9, fontFamily: "Inter_400Regular" },
  sigAccBar:  { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  sigAccFill: { height: "100%", borderRadius: 3 },
  sigAccPct:  { width: 36, textAlign: "right", fontSize: 11, fontFamily: "Inter_700Bold" },

  emptyText:  { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 20 },

  pill:       { borderWidth: 1, borderRadius: 8, borderColor: "#374151", paddingHorizontal: 8, paddingVertical: 4 },
  pillText:   { fontSize: 10, fontFamily: "Inter_500Medium" },

  noteCard:   { borderRadius: 10, borderWidth: 1, padding: 12 },
  noteText:   { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 15, textAlign: "center" },
  followSignal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 12 },
  followSigLeft: { alignItems: "center", gap: 4 },
  followSigRight: { alignItems: "center", gap: 4 },
  followSigLabel: { fontSize: 9, fontFamily: "Inter_500Medium" },
  followQualText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  followFactors: { borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  followFactorsTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  factorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  factorItem: { width: "47%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderRadius: 6 },
  factorName: { fontSize: 9, fontFamily: "Inter_500Medium" },
  factorScore: { fontSize: 11, fontFamily: "Inter_700Bold" },
  signalSettingsSection: { borderTopWidth: 1, paddingTop: 12, marginTop: 8 },
  signalSettingsTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  settingLabel: { fontSize: 11, fontFamily: "Inter_500Medium", flex: 1 },
  followNoteContainer: { borderRadius: 8, padding: 8 },
  followNotePersistent: { fontSize: 10, fontFamily: "Inter_500Medium" },

  /* Auto Trade Mode */
  atCoinsGrid:  { flexDirection: "row", gap: 6 },
  atCoinCard:   { flex: 1, borderWidth: 1, borderRadius: 10, padding: 8, alignItems: "center", gap: 4 },
  atCoinTicker: { fontSize: 11, fontFamily: "Inter_700Bold" },
  atCoinSig:    { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  atCoinSigText:{ fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  atQScore:     { fontSize: 16, fontFamily: "Inter_700Bold" },
  atQLabel:     { fontSize: 8, fontFamily: "Inter_400Regular" },

  atBestCard:   { borderRadius: 10, borderWidth: 1, padding: 10, gap: 6 },
  atBestRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  atBestLabel:  { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  atBestSig:    { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  atBestSigText:{ fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  atBestCoin:   { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  atBestExpl:   { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 14 },
  atBestBtn:    { borderRadius: 8, paddingVertical: 9, alignItems: "center", marginTop: 2 },
  atBestBtnText:{ fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },

  atNoneCard:   { borderRadius: 8, padding: 10 },
  atNoneText:   { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 15 },

  /* Regime styles */
  regimeHeader: { alignItems: "center" },
  regimeName:   { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  regimeConf:   { fontSize: 11, fontFamily: "Inter_500Medium" },
  regimeRow:    { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  regimeLabel:  { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  regimeStat:   { fontSize: 10, fontFamily: "Inter_400Regular", marginLeft: 12 },

  /* Review styles */
  reviewItem:   { paddingVertical: 12, borderBottomWidth: 1 },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  reviewCoin:   { fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 },
  reviewPnl:    { fontSize: 14, fontFamily: "Inter_700Bold" },
  reviewText:   { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, marginBottom: 4 },
  reviewMeta:   { fontSize: 9, fontFamily: "Inter_400Regular" },

  /* New Auto Trading Styles */
  autoTradingCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 12 },
  autoTradingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  autoTradingLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  autoTradingBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  autoTradingBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  autoTradingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  autoTradingSubtitle: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  autoTradingRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  autoTradingContent: { gap: 12 },
  autoTradingStats: { flexDirection: "row", gap: 8 },
  autoTradingStatItem: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, alignItems: "center" },
  autoTradingStatValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  autoTradingStatLabel: { fontSize: 8, fontFamily: "Inter_400Regular", marginTop: 2 },
  autoTradingSection: { gap: 8 },
  autoTradingSectionTitle: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  autoTradingModes: { flexDirection: "row", gap: 6 },
  autoTradingModeBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  autoTradingModeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  autoTradingModeHint: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 4 },
  autoTradingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  autoTradingLabel: { fontSize: 11, fontFamily: "Inter_500Medium", flex: 1 },
  autoTradingPills: { flexDirection: "row", gap: 4 },
  autoTradingPill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  autoTradingPillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  autoTradingToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  autoTradingToggleTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  autoTradingToggleSub: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2, maxWidth: 200 },
  autoTradingOppCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  autoTradingOppHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  autoTradingOppLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  autoTradingOppSig: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  autoTradingOppSigText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  autoTradingOppCoin: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  autoTradingOppExpl: { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 14 },
  autoTradingOppDetails: { flexDirection: "row", gap: 8 },
  autoTradingOppDetail: { flex: 1, alignItems: "center" },
  autoTradingOppDetailLabel: { fontSize: 8, fontFamily: "Inter_400Regular" },
  autoTradingOppDetailValue: { fontSize: 11, fontFamily: "Inter_700Bold", marginTop: 2 },
  autoTradingOppBtn: { borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 4 },
  autoTradingOppBtnText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  autoTradingOppList: { gap: 6 },
  autoTradingOppListTitle: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  autoTradingOppItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 8, padding: 8 },
  autoTradingOppItemLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  autoTradingOppItemSig: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  autoTradingOppItemSigText: { fontSize: 8, fontFamily: "Inter_700Bold" },
  autoTradingOppItemCoin: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  autoTradingOppItemRight: { alignItems: "flex-end" },
  autoTradingOppItemQuality: { fontSize: 14, fontFamily: "Inter_700Bold" },
  autoTradingOppItemTF: { fontSize: 8, fontFamily: "Inter_400Regular" },
  autoTradingNoOpp: { borderRadius: 8, padding: 12 },
  autoTradingNoOppText: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 14 },
});
