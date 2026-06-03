import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import InteractiveAnalysisChart from "@/components/InteractiveAnalysisChart";
import { COIN_MAP, COINS, formatCoinPrice, type CoinSymbol } from "@/constants/coins";
import { useChartAnalysis, type ForecastScenario, type PatternResult, type TradeZone } from "@/hooks/useChartAnalysis";
import { useKlineData, type Interval } from "@/hooks/useKlineData";

/* ── Color theme ─────────────────────────────────────────────────── */

const C = {
  bg:       "#060B18",
  card:     "#0F1628",
  card2:    "#131D2E",
  border:   "rgba(255,255,255,0.07)",
  primary:  "#F7931A",
  up:       "#00E599",
  down:     "#FF4757",
  wait:     "#FFC107",
  text:     "#FFFFFF",
  muted:    "rgba(107,127,163,0.9)",
  mutedDim: "rgba(107,127,163,0.45)",
  purple:   "#9945FF",
} as const;

const TIMEFRAMES: Interval[] = ["1m", "5m", "15m", "1h", "4h"];
type AnalysisTab = "Levels" | "Structure" | "Patterns" | "Forecast" | "Trade";
const TABS: AnalysisTab[] = ["Levels", "Structure", "Patterns", "Forecast", "Trade"];
const SCREEN_W = Dimensions.get("window").width;

/* ── Small Helpers ───────────────────────────────────────────────── */

function fmtAuto(price: number): string {
  if (!price) return "—";
  if (price >= 10000) return price.toFixed(1);
  if (price >= 1000)  return price.toFixed(2);
  if (price >= 1)     return price.toFixed(3);
  return price.toFixed(5);
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color + "44", backgroundColor: color + "18" }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: string }) {
  return (
    <View style={styles.sectionHeader}>
      {icon && <Ionicons name={icon as any} size={14} color={C.primary} style={{ marginRight: 6 }} />}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function StatRow({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function ProbBar({
  label, value, color, isTop = false,
}: {
  label: string; value: number; color: string; isTop?: boolean;
}) {
  return (
    <View style={styles.probRow}>
      <Text style={[styles.probLabel, isTop && styles.probLabelTop]} numberOfLines={1}>{label}</Text>
      <View style={styles.probTrack}>
        <View style={[styles.probFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.probPct, { color: isTop ? color : C.muted }]}>{value}%</Text>
    </View>
  );
}

function PatternCard({ p }: { p: PatternResult }) {
  const biasColor = p.bias === "Bullish" ? C.up : p.bias === "Bearish" ? C.down : C.wait;
  const confColor = p.confidence >= 70 ? C.up : p.confidence >= 50 ? C.wait : C.muted;
  return (
    <View style={styles.patternCard}>
      <View style={styles.patternHeader}>
        <Text style={styles.patternName}>{p.name}</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Badge label={p.bias} color={biasColor} />
          <Badge label={`${p.confidence}%`} color={confColor} />
        </View>
      </View>
      <Text style={styles.patternDesc}>{p.description}</Text>
      {p.target !== undefined && (
        <Text style={[styles.patternTarget, { color: biasColor }]}>Target: {fmtAuto(p.target)}</Text>
      )}
    </View>
  );
}

function TradeZoneCard({ zone }: { zone: TradeZone }) {
  const isLong = zone.direction === "LONG";
  const dirColor = isLong ? C.up : C.down;
  const qualColor = zone.quality === "A+" ? C.up : zone.quality === "A" ? "#4FC3F7" : zone.quality === "B" ? C.wait : C.muted;
  return (
    <View style={[styles.tradeZone, { borderColor: dirColor + "30" }]}>
      <View style={styles.tradeZoneHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[styles.dirDot, { backgroundColor: dirColor }]} />
          <Text style={[styles.tradeZoneDir, { color: dirColor }]}>{zone.direction}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Badge label={zone.quality} color={qualColor} />
          <Badge label={`${zone.confidence}%`} color={dirColor} />
        </View>
      </View>
      <View style={styles.tradeLevels}>
        {[
          { label: "ENTRY",  val: `${fmtAuto(zone.entryLow)} – ${fmtAuto(zone.entryHigh)}`, color: C.text },
          { label: "STOP",   val: fmtAuto(zone.stopLoss),   color: C.down },
          { label: "TARGET", val: fmtAuto(zone.takeProfit), color: C.up },
          { label: "R/R",    val: `1:${zone.riskReward.toFixed(2)}`, color: zone.riskReward >= 2 ? C.up : C.wait },
        ].map((r) => (
          <View key={r.label} style={styles.tradeLevel}>
            <Text style={[styles.tradeLevelLabel, r.label !== "ENTRY" ? { color: r.color } : {}]}>{r.label}</Text>
            <Text style={[styles.tradeLevelVal, { color: r.color }]}>{r.val}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.tradeReasoning}>{zone.reasoning}</Text>
    </View>
  );
}

/* ── Forecast scenario color ─────────────────────────────────────── */

function scenarioColor(s: ForecastScenario): string {
  if (s === "Bullish Continuation") return C.up;
  if (s === "Bearish Continuation") return C.down;
  if (s === "Pullback")             return C.wait;
  if (s === "Reversal")             return C.purple;
  if (s === "Breakout")             return C.primary;
  return C.muted;
}

/* ── Main Screen ─────────────────────────────────────────────────── */

export default function ChartAnalysisScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedCoin, setSelectedCoin] = useState<CoinSymbol>("BTCUSDT");
  const [selectedTF,   setSelectedTF]   = useState<Interval>("15m");
  const [activeTab,    setActiveTab]     = useState<AnalysisTab>("Forecast");
  const [coinPickerOpen, setCoinPickerOpen] = useState(false);

  const { candles, loading } = useKlineData(selectedTF, selectedCoin);
  const coin = COIN_MAP[selectedCoin];

  const currentPrice = useMemo(
    () => (candles.length > 0 ? candles[candles.length - 1].close : 0),
    [candles],
  );

  const analysis = useChartAnalysis(candles, currentPrice, selectedCoin, selectedTF);

  const biasBullish =
    analysis.trend.direction === "Bullish" || analysis.summary.bias === "Bullish";

  const priceChange = useMemo(() => {
    if (candles.length < 2) return 0;
    return ((currentPrice - candles[0].close) / candles[0].close) * 100;
  }, [candles, currentPrice]);

  const chartOverlays = useMemo(() => ({
    supportLevels:    analysis.supportLevels.slice(0, 3),
    resistanceLevels: analysis.resistanceLevels.slice(0, 3),
    demandZones:      analysis.demandZones.slice(0, 2),
    supplyZones:      analysis.supplyZones.slice(0, 2),
    structurePoints:  analysis.structure.recentPoints,
    longZone:         analysis.longZone,
    shortZone:        analysis.shortZone,
    ema20:            analysis.trend.ema20,
    ema50:            analysis.trend.ema50,
    currentPrice,
    biasBullish,
  }), [analysis, currentPrice, biasBullish]);

  const trendColor  = analysis.trend.direction === "Bullish" ? C.up : analysis.trend.direction === "Bearish" ? C.down : C.wait;
  const structColor = analysis.structure.structure === "Bullish" ? C.up : analysis.structure.structure === "Bearish" ? C.down : C.wait;
  const changeColor = priceChange >= 0 ? C.up : C.down;

  /* Probability bar rows */
  const forecastRows: { label: string; key: keyof typeof analysis.forecast; color: string }[] = [
    { label: "Bullish Continuation", key: "bullishContinuation", color: C.up },
    { label: "Bearish Continuation", key: "bearishContinuation", color: C.down },
    { label: "Pullback",             key: "pullback",            color: C.wait },
    { label: "Reversal",             key: "reversal",            color: C.purple },
    { label: "Breakout",             key: "breakout",            color: C.primary },
    { label: "Range",                key: "range",               color: C.muted },
  ];

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Fixed Header ──────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Chart Analysis Center</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* ── Coin + TF Selectors ───────────────────────────────── */}
      <View style={styles.selectorRow}>
        <Pressable
          style={[styles.coinBtn, { borderColor: coin.color + "55" }]}
          onPress={() => setCoinPickerOpen((v) => !v)}
        >
          <View style={[styles.coinDot, { backgroundColor: coin.color }]} />
          <Text style={[styles.coinBtnLabel, { color: coin.color }]}>{coin.ticker}/USDT</Text>
          <Ionicons name={coinPickerOpen ? "chevron-up" : "chevron-down"} size={12} color={coin.color} />
        </Pressable>

        <View style={styles.priceChip}>
          <Text style={styles.priceChipPrice}>{formatCoinPrice(currentPrice, selectedCoin)}</Text>
          <Text style={[styles.priceChipChange, { color: changeColor }]}>
            {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}%
          </Text>
        </View>

        <View style={styles.tfRow}>
          {TIMEFRAMES.map((tf) => (
            <Pressable
              key={tf}
              style={[styles.tfBtn, selectedTF === tf && { backgroundColor: C.primary + "22", borderColor: C.primary + "66" }]}
              onPress={() => setSelectedTF(tf)}
            >
              <Text style={[styles.tfText, selectedTF === tf && { color: C.primary }]}>{tf}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Coin Picker ───────────────────────────────────────── */}
      {coinPickerOpen && (
        <View style={[styles.coinPicker, { backgroundColor: C.card }]}>
          {COINS.map((c) => (
            <Pressable
              key={c.symbol}
              style={[styles.coinPickerItem, selectedCoin === c.symbol && { backgroundColor: c.color + "14" }]}
              onPress={() => { setSelectedCoin(c.symbol as CoinSymbol); setCoinPickerOpen(false); }}
            >
              <View style={[styles.coinDot, { backgroundColor: c.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.coinPickerTicker, { color: c.color }]}>{c.ticker}</Text>
                <Text style={styles.coinPickerName}>{c.pairLabel}</Text>
              </View>
              {selectedCoin === c.symbol && <Ionicons name="checkmark-circle" size={14} color={c.color} />}
            </Pressable>
          ))}
        </View>
      )}

      {/* ── Scrollable Body ───────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Interactive Chart ─────────────────────────────── */}
        <View style={[styles.chartWrap, { backgroundColor: C.card }]}>
          <View style={styles.chartLegend}>
            {[
              { label: "EMA20", color: C.primary },
              { label: "EMA50", color: C.purple },
              { label: "Support", color: C.up },
              { label: "Resist",  color: C.down },
            ].map((l) => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: l.color }]} />
                <Text style={styles.legendText}>{l.label}</Text>
              </View>
            ))}
          </View>
          <InteractiveAnalysisChart
            candles={candles}
            loading={loading}
            overlays={chartOverlays}
            width={SCREEN_W}
            height={290}
            upColor={C.up}
            downColor={C.down}
            gridColor="rgba(255,255,255,0.04)"
            labelColor={C.muted}
            primaryColor={C.primary}
            bgColor={C.bg}
          />
        </View>

        {/* ── Summary Strip ─────────────────────────────────── */}
        <View style={[styles.summaryStrip, { backgroundColor: C.card }]}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryCellLabel}>TREND</Text>
            <Badge label={`${analysis.trend.strength} ${analysis.trend.direction}`} color={trendColor} />
          </View>
          <View style={[styles.summaryDiv, { backgroundColor: C.border }]} />
          <View style={styles.summaryCell}>
            <Text style={styles.summaryCellLabel}>STRUCTURE</Text>
            <Badge label={analysis.structure.structure} color={structColor} />
          </View>
          <View style={[styles.summaryDiv, { backgroundColor: C.border }]} />
          <View style={styles.summaryCell}>
            <Text style={styles.summaryCellLabel}>SETUP</Text>
            <Badge label={analysis.summary.bestSetup} color={C.primary} />
          </View>
          <View style={[styles.summaryDiv, { backgroundColor: C.border }]} />
          <View style={styles.summaryCell}>
            <Text style={styles.summaryCellLabel}>ATR</Text>
            <Text style={styles.summaryAtr}>{fmtAuto(analysis.atr)}</Text>
          </View>
        </View>

        {/* ── Tab Bar ───────────────────────────────────────── */}
        <View style={[styles.tabBarWrap, { backgroundColor: C.card }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.tabRow}>
              {TABS.map((tab) => (
                <Pressable key={tab} style={styles.tabBtn} onPress={() => setActiveTab(tab)}>
                  <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>{tab}</Text>
                  {activeTab === tab && <View style={[styles.tabUnderline, { backgroundColor: C.primary }]} />}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* ── Tab Content ───────────────────────────────────── */}
        <View style={[styles.tabContent, { backgroundColor: C.card }]}>

          {/* ═══ LEVELS ═══ */}
          {activeTab === "Levels" && (
            <View>
              <SectionHeader title="Support Levels" icon="trending-up" />
              {analysis.supportLevels.length === 0
                ? <Text style={styles.emptyMsg}>No support levels detected yet</Text>
                : analysis.supportLevels.map((l, i) => (
                  <View key={i} style={styles.levelRow}>
                    <View style={[styles.levelDot, { backgroundColor: C.up }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.levelPrice, { color: C.up }]}>{fmtAuto(l.price)}</Text>
                      <Text style={styles.levelMeta}>{l.strengthLabel} · {l.distancePct.toFixed(2)}% below</Text>
                    </View>
                    <View style={styles.dots5}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <View key={j} style={[styles.dot5, { backgroundColor: j < l.strength ? C.up : "rgba(255,255,255,0.1)" }]} />
                      ))}
                    </View>
                  </View>
                ))}

              <View style={styles.divider} />
              <SectionHeader title="Resistance Levels" icon="trending-down" />
              {analysis.resistanceLevels.length === 0
                ? <Text style={styles.emptyMsg}>No resistance levels detected yet</Text>
                : analysis.resistanceLevels.map((l, i) => (
                  <View key={i} style={styles.levelRow}>
                    <View style={[styles.levelDot, { backgroundColor: C.down }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.levelPrice, { color: C.down }]}>{fmtAuto(l.price)}</Text>
                      <Text style={styles.levelMeta}>{l.strengthLabel} · {l.distancePct.toFixed(2)}% above</Text>
                    </View>
                    <View style={styles.dots5}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <View key={j} style={[styles.dot5, { backgroundColor: j < l.strength ? C.down : "rgba(255,255,255,0.1)" }]} />
                      ))}
                    </View>
                  </View>
                ))}

              <View style={styles.divider} />
              <SectionHeader title="Demand Zones" icon="layers" />
              {analysis.demandZones.length === 0
                ? <Text style={styles.emptyMsg}>No demand zones detected</Text>
                : analysis.demandZones.map((z, i) => (
                  <View key={i} style={[styles.zoneCard, { borderLeftColor: C.up }]}>
                    <View style={styles.zoneCardHeader}>
                      <Badge label={`Demand · ${z.strength}`} color={C.up} />
                      <Text style={[styles.zoneDist, { color: C.muted }]}>{z.distancePct.toFixed(2)}% below</Text>
                    </View>
                    <Text style={[styles.zoneRange, { color: C.up }]}>{fmtAuto(z.bottom)} – {fmtAuto(z.top)}</Text>
                    <Text style={styles.zoneWidth}>Width: {z.widthPct.toFixed(3)}%</Text>
                  </View>
                ))}

              <View style={styles.divider} />
              <SectionHeader title="Supply Zones" icon="layers" />
              {analysis.supplyZones.length === 0
                ? <Text style={styles.emptyMsg}>No supply zones detected</Text>
                : analysis.supplyZones.map((z, i) => (
                  <View key={i} style={[styles.zoneCard, { borderLeftColor: C.down }]}>
                    <View style={styles.zoneCardHeader}>
                      <Badge label={`Supply · ${z.strength}`} color={C.down} />
                      <Text style={[styles.zoneDist, { color: C.muted }]}>{z.distancePct.toFixed(2)}% above</Text>
                    </View>
                    <Text style={[styles.zoneRange, { color: C.down }]}>{fmtAuto(z.bottom)} – {fmtAuto(z.top)}</Text>
                    <Text style={styles.zoneWidth}>Width: {z.widthPct.toFixed(3)}%</Text>
                  </View>
                ))}
            </View>
          )}

          {/* ═══ STRUCTURE ═══ */}
          {activeTab === "Structure" && (
            <View>
              <SectionHeader title="Market Structure" icon="git-branch" />
              <View style={[styles.structCard, { borderColor: structColor + "44" }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                  <Badge label={analysis.structure.structure} color={structColor} />
                  <Text style={styles.breakLabel}>Break: {fmtAuto(analysis.structure.breakLevel)}</Text>
                </View>
                <View style={styles.structGrid}>
                  {[
                    { label: "Higher Highs", val: analysis.structure.higherHighs, color: C.up },
                    { label: "Higher Lows",  val: analysis.structure.higherLows,  color: C.up },
                    { label: "Lower Highs",  val: analysis.structure.lowerHighs,  color: C.down },
                    { label: "Lower Lows",   val: analysis.structure.lowerLows,   color: C.down },
                  ].map((item) => (
                    <View key={item.label} style={styles.structStat}>
                      <Text style={[styles.structStatNum, { color: item.val > 0 ? item.color : C.mutedDim }]}>
                        {item.val}
                      </Text>
                      <Text style={styles.structStatLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.divider} />
              <SectionHeader title="Trend Analysis" icon="stats-chart" />
              <View style={[styles.card2, { borderColor: trendColor + "30" }]}>
                <StatRow label="Direction" value={analysis.trend.direction} color={trendColor} />
                <StatRow label="Strength"  value={analysis.trend.strength}  color={trendColor} />
                <StatRow label="Duration"  value={`${analysis.trend.durationCandles} candles`} />
                <StatRow label="EMA 20"    value={fmtAuto(analysis.trend.ema20)} color={C.primary} />
                <StatRow label="EMA 50"    value={fmtAuto(analysis.trend.ema50)} color={C.purple} />
                <StatRow
                  label="vs EMA20"
                  value={currentPrice > 0 && analysis.trend.ema20 > 0
                    ? `${((currentPrice - analysis.trend.ema20) / analysis.trend.ema20 * 100).toFixed(3)}%`
                    : "—"}
                  color={currentPrice >= analysis.trend.ema20 ? C.up : C.down}
                />
              </View>

              <View style={styles.divider} />
              <SectionHeader title="Recent Swing Points" icon="radio-button-on" />
              {analysis.structure.recentPoints.length === 0
                ? <Text style={styles.emptyMsg}>Insufficient data for swing analysis</Text>
                : (
                  <View style={styles.swingGrid}>
                    {analysis.structure.recentPoints.slice(-8).map((pt, i) => {
                      const pos = pt.kind === "HH" || pt.kind === "HL";
                      const ptColor = pos ? C.up : C.down;
                      return (
                        <View key={i} style={[styles.swingPt, { borderColor: ptColor + "33" }]}>
                          <Text style={[styles.swingKind, { color: ptColor }]}>{pt.kind}</Text>
                          <Text style={styles.swingPrice}>{fmtAuto(pt.price)}</Text>
                          <Text style={styles.swingIdx}>#{pt.index}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
            </View>
          )}

          {/* ═══ PATTERNS ═══ */}
          {activeTab === "Patterns" && (
            <View>
              <SectionHeader title="Detected Chart Patterns" icon="shapes" />
              {loading && analysis.patterns.length === 0
                ? (
                  <View style={styles.centeredLoading}>
                    <ActivityIndicator color={C.primary} />
                    <Text style={styles.loadText}>Scanning for patterns…</Text>
                  </View>
                )
                : analysis.patterns.length === 0
                ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="scan-outline" size={34} color={C.mutedDim} />
                    <Text style={styles.emptyMsg}>No chart patterns detected</Text>
                    <Text style={styles.emptyHint}>Try switching to 15m or 1h timeframe for clearer patterns.</Text>
                  </View>
                )
                : analysis.patterns.map((p, i) => <PatternCard key={i} p={p} />)
              }
            </View>
          )}

          {/* ═══ FORECAST ═══ */}
          {activeTab === "Forecast" && (
            <View>
              <SectionHeader title="Market Forecast Engine" icon="analytics" />

              <View style={[styles.forecastHero, {
                borderColor: scenarioColor(analysis.forecast.topScenario) + "40",
                backgroundColor: scenarioColor(analysis.forecast.topScenario) + "0C",
              }]}>
                <Text style={styles.forecastHeroLabel}>MOST LIKELY SCENARIO</Text>
                <Text style={[styles.forecastHeroScenario, { color: scenarioColor(analysis.forecast.topScenario) }]}>
                  {analysis.forecast.topScenario}
                </Text>
                <Text style={[styles.forecastHeroPct, { color: scenarioColor(analysis.forecast.topScenario) }]}>
                  {analysis.forecast.topProbability}% probability
                </Text>
              </View>

              <View style={styles.probBars}>
                {forecastRows.map(({ label, key, color }) => {
                  const val = typeof analysis.forecast[key] === "number"
                    ? (analysis.forecast[key] as number)
                    : 0;
                  const isTopBar =
                    (label === "Range" && analysis.forecast.topScenario === "Range") ||
                    label === analysis.forecast.topScenario;
                  return (
                    <ProbBar key={key} label={label} value={val} color={color} isTop={isTopBar} />
                  );
                })}
              </View>

              <View style={styles.divider} />
              <SectionHeader title="Forecast Reasoning" icon="chatbubble-ellipses" />
              <Text style={styles.forecastReason}>{analysis.forecast.explanation}</Text>
            </View>
          )}

          {/* ═══ TRADE ═══ */}
          {activeTab === "Trade" && (
            <View>
              <SectionHeader title="High-Probability Trade Zones" icon="flag" />
              {!analysis.longZone && !analysis.shortZone
                ? <Text style={styles.emptyMsg}>No trade zones identified — price may be mid-range. Wait for approach to key level.</Text>
                : (
                  <View style={{ gap: 12 }}>
                    {analysis.longZone  && <TradeZoneCard zone={analysis.longZone}  />}
                    {analysis.shortZone && <TradeZoneCard zone={analysis.shortZone} />}
                  </View>
                )}

              <View style={styles.divider} />
              <SectionHeader title="Why This Trade" icon="bulb" />
              <View style={[styles.whyCard, { borderColor: C.primary + "30" }]}>
                <Text style={styles.whyText}>{analysis.whyThisTrade}</Text>
              </View>
            </View>
          )}

        </View>

        {/* ── AI Market Analyst ─────────────────────────────── */}
        <View style={[styles.analystCard, { backgroundColor: C.card }]}>
          <View style={styles.analystHeader}>
            <View style={[styles.analystIcon, { backgroundColor: C.primary + "22" }]}>
              <Ionicons name="sparkles" size={14} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.analystTitle}>AI Market Analyst</Text>
              <Text style={styles.analystSub}>{coin.ticker} · {selectedTF} · Auto-updated</Text>
            </View>
          </View>
          {loading && !analysis.analystText
            ? <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} />
            : <Text style={styles.analystBody}>{analysis.analystText}</Text>
          }
        </View>

      </ScrollView>
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1 },

  /* Header */
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_700Bold", color: C.text },

  /* Selector row */
  selectorRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingBottom: 8, gap: 8, flexWrap: "wrap",
  },
  coinBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  coinDot: { width: 8, height: 8, borderRadius: 4 },
  coinBtnLabel: { fontSize: 12, fontFamily: "Inter_700Bold" },
  priceChip: { flexDirection: "row", alignItems: "baseline", gap: 5 },
  priceChipPrice: { fontSize: 15, fontFamily: "Inter_700Bold", color: C.text },
  priceChipChange: { fontSize: 12, fontFamily: "Inter_500Medium" },
  tfRow: { flexDirection: "row", gap: 3, marginLeft: "auto" },
  tfBtn: {
    paddingHorizontal: 7, paddingVertical: 5,
    borderRadius: 6, borderWidth: 1, borderColor: "transparent",
  },
  tfText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: C.muted },

  /* Coin picker */
  coinPicker: {
    marginHorizontal: 12, marginBottom: 4,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    overflow: "hidden",
  },
  coinPickerItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  coinPickerTicker: { fontSize: 13, fontFamily: "Inter_700Bold" },
  coinPickerName: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.muted },

  /* Chart */
  chartWrap: { overflow: "hidden" },
  chartLegend: {
    flexDirection: "row", gap: 14, paddingHorizontal: 14,
    paddingTop: 10, paddingBottom: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendLine: { width: 14, height: 2 },
  legendText: { fontSize: 9, fontFamily: "Inter_400Regular", color: C.muted },

  /* Summary strip */
  summaryStrip: {
    flexDirection: "row", marginTop: 8,
    paddingVertical: 10,
  },
  summaryCell: { flex: 1, alignItems: "center", gap: 4 },
  summaryCellLabel: { fontSize: 8, fontFamily: "Inter_600SemiBold", color: C.muted, letterSpacing: 0.8 },
  summaryAtr: { fontSize: 11, fontFamily: "Inter_700Bold", color: C.text },
  summaryDiv: { width: 1, alignSelf: "stretch" },

  /* Tab bar */
  tabBarWrap: { marginTop: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  tabRow: { flexDirection: "row", paddingHorizontal: 8 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 12, position: "relative", alignItems: "center" },
  tabLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: C.muted },
  tabLabelActive: { color: C.text, fontFamily: "Inter_700Bold" },
  tabUnderline: { position: "absolute", bottom: 0, left: 8, right: 8, height: 2, borderRadius: 1 },

  /* Tab content */
  tabContent: { padding: 16 },

  /* Section header */
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: C.text },

  /* Divider */
  divider: { height: 1, backgroundColor: C.border, marginVertical: 16 },

  /* Empty */
  emptyMsg: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted, textAlign: "center", paddingVertical: 8 },
  emptyState: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.mutedDim, textAlign: "center" },
  centeredLoading: { alignItems: "center", paddingVertical: 24, gap: 8 },
  loadText: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.muted },

  /* Badge */
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  /* Stat row */
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.muted },
  statValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: C.text },

  /* Levels */
  levelRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  levelDot: { width: 8, height: 8, borderRadius: 4 },
  levelPrice: { fontSize: 14, fontFamily: "Inter_700Bold" },
  levelMeta: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.muted, marginTop: 1 },
  dots5: { flexDirection: "row", gap: 3 },
  dot5: { width: 5, height: 5, borderRadius: 3 },

  /* Zones */
  zoneCard: { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 8, marginBottom: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.02)" },
  zoneCardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  zoneRange: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 2 },
  zoneWidth: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.muted },
  zoneDist: { fontSize: 11, fontFamily: "Inter_400Regular" },

  /* Structure */
  structCard: { borderWidth: 1, borderRadius: 10, padding: 14 },
  structGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  structStat: { flex: 1, minWidth: "45%", alignItems: "center", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 8, paddingVertical: 12 },
  structStatNum: { fontSize: 28, fontFamily: "Inter_700Bold" },
  structStatLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.muted, marginTop: 2 },
  breakLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: C.muted },
  card2: { borderWidth: 1, borderRadius: 10, padding: 12 },
  swingGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swingPt: { width: "22%", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.02)" },
  swingKind: { fontSize: 12, fontFamily: "Inter_700Bold" },
  swingPrice: { fontSize: 9, fontFamily: "Inter_500Medium", color: C.text, marginTop: 2 },
  swingIdx: { fontSize: 8, fontFamily: "Inter_400Regular", color: C.muted },

  /* Patterns */
  patternCard: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: "rgba(255,255,255,0.02)" },
  patternHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  patternName: { fontSize: 14, fontFamily: "Inter_700Bold", color: C.text, flex: 1 },
  patternDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.muted, lineHeight: 18 },
  patternTarget: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 4 },

  /* Forecast */
  forecastHero: { borderWidth: 1, borderRadius: 12, padding: 18, alignItems: "center", marginBottom: 18 },
  forecastHeroLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: C.muted, letterSpacing: 1.2, marginBottom: 6 },
  forecastHeroScenario: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 2 },
  forecastHeroPct: { fontSize: 13, fontFamily: "Inter_600SemiBold", opacity: 0.85 },
  probBars: { gap: 10 },
  probRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  probLabel: { width: 130, fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted },
  probLabelTop: { color: C.text, fontFamily: "Inter_600SemiBold" },
  probTrack: { flex: 1, height: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" },
  probFill: { height: "100%", borderRadius: 3 },
  probPct: { width: 36, textAlign: "right", fontSize: 12, fontFamily: "Inter_700Bold" },
  forecastReason: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted, lineHeight: 21 },

  /* Trade */
  tradeZone: { borderWidth: 1, borderRadius: 12, padding: 14, backgroundColor: "rgba(255,255,255,0.02)" },
  tradeZoneHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  tradeZoneDir: { fontSize: 17, fontFamily: "Inter_700Bold" },
  dirDot: { width: 8, height: 8, borderRadius: 4 },
  tradeLevels: { flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  tradeLevel: { flex: 1, minWidth: "22%" },
  tradeLevelLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: C.muted, letterSpacing: 0.8, marginBottom: 3 },
  tradeLevelVal: { fontSize: 11, fontFamily: "Inter_700Bold" },
  tradeReasoning: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted, lineHeight: 16 },
  whyCard: { borderWidth: 1, borderRadius: 12, padding: 14, backgroundColor: "rgba(247,147,26,0.04)" },
  whyText: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.muted, lineHeight: 20 },

  /* AI Analyst */
  analystCard: { margin: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14 },
  analystHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  analystIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  analystTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: C.text },
  analystSub: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.muted },
  analystBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted, lineHeight: 22 },
});
