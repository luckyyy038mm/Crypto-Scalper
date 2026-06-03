import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COINS, type CoinSymbol } from "@/constants/coins";
import { useColors } from "@/hooks/useColors";
import {
  useOrderFlow,
  type AlertSeverity,
  type AlertType,
  type FlowBias,
  type OrderFlowAlert,
  type Strength,
  type TrendDir,
} from "@/hooks/useOrderFlow";

/* ── Formatters ────────────────────────────────────────────────────── */

function fmtVol(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(2)}`;
}

function fmtUSD(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-$" : "+$";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtUSDPos(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function tsAgo(ts: number) {
  if (!ts) return "–";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)  return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

/* ── Color helpers ─────────────────────────────────────────────────── */

function trendColor(d: TrendDir, colors: ReturnType<typeof useColors>) {
  if (d === "Increasing") return colors.up;
  if (d === "Decreasing") return colors.down;
  return colors.mutedForeground;
}

function biasColor(b: FlowBias, colors: ReturnType<typeof useColors>) {
  if (b === "Bullish") return colors.up;
  if (b === "Bearish") return colors.down;
  return colors.wait;
}

function severityColor(s: AlertSeverity, colors: ReturnType<typeof useColors>) {
  if (s === "high")   return colors.down;
  if (s === "medium") return colors.wait;
  return colors.mutedForeground;
}

function alertIcon(t: AlertType): React.ComponentProps<typeof Feather>["name"] {
  if (t === "aggressive_buying")       return "trending-up";
  if (t === "aggressive_selling")      return "trending-down";
  if (t === "delta_shift")             return "activity";
  if (t === "pressure_shift")          return "bar-chart-2";
  if (t === "strong_buy_imbalance")    return "chevrons-up";
  if (t === "strong_sell_imbalance")   return "chevrons-down";
  if (t === "reversal")                return "refresh-cw";
  return "alert-circle";
}

/* ── Sub-components ────────────────────────────────────────────────── */

function SectionHeader({ label }: { label: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.secHeader, { color: colors.mutedForeground }]}>{label}</Text>
  );
}

function TrendBadge({ dir, colors }: { dir: TrendDir; colors: ReturnType<typeof useColors> }) {
  const c = trendColor(dir, colors);
  const icon: React.ComponentProps<typeof Feather>["name"] =
    dir === "Increasing" ? "trending-up" : dir === "Decreasing" ? "trending-down" : "minus";
  return (
    <View style={[styles.badge, { backgroundColor: c + "20", borderColor: c + "50" }]}>
      <Feather name={icon} size={9} color={c} />
      <Text style={[styles.badgeText, { color: c }]}>{dir}</Text>
    </View>
  );
}

function StrengthDots({ strength, colors }: { strength: Strength; colors: ReturnType<typeof useColors> }) {
  const n = strength === "Strong" ? 3 : strength === "Moderate" ? 2 : 1;
  return (
    <View style={styles.dotsRow}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[styles.dot, { backgroundColor: i <= n ? colors.primary : colors.border }]}
        />
      ))}
    </View>
  );
}

/* ── Score Gauge ────────────────────────────────────────────────────── */

function ScoreGauge({ score, bias, strength: str, colors }: {
  score: number; bias: FlowBias; strength: Strength;
  colors: ReturnType<typeof useColors>;
}) {
  const bc = biasColor(bias, colors);
  const animRef = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animRef, { toValue: score, duration: 600, useNativeDriver: false }).start();
  }, [score, animRef]);

  const label = score >= 70 ? "Extremely Bullish"
    : score >= 58 ? "Bullish"
    : score >= 44 ? "Neutral"
    : score >= 30 ? "Bearish"
    : "Extremely Bearish";

  return (
    <View style={[styles.gaugeCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.gaugeTitle, { color: colors.mutedForeground }]}>ORDER FLOW SCORE</Text>

      <View style={styles.gaugeBody}>
        {/* Score circle */}
        <View style={[styles.scoreBubble, { borderColor: bc + "60", backgroundColor: bc + "12" }]}>
          <Text style={[styles.scoreNum, { color: bc }]}>{score}</Text>
          <Text style={[styles.scoreMax, { color: colors.mutedForeground }]}>/100</Text>
        </View>

        {/* Right side */}
        <View style={styles.gaugeRight}>
          <View style={[styles.biasPill, { backgroundColor: bc + "20", borderColor: bc + "50" }]}>
            <Text style={[styles.biasText, { color: bc }]}>{bias.toUpperCase()}</Text>
          </View>
          <Text style={[styles.gaugeLabel, { color: colors.foreground }]}>{label}</Text>
          <StrengthDots strength={str} colors={colors} />

          {/* Scale bar */}
          <View style={[styles.scaleTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.scaleFill, { width: `${score}%` as unknown as number, backgroundColor: bc }]} />
          </View>
          <View style={styles.scaleLabels}>
            <Text style={[styles.scaleLabel, { color: colors.down }]}>Bearish</Text>
            <Text style={[styles.scaleLabel, { color: colors.mutedForeground }]}>Neutral</Text>
            <Text style={[styles.scaleLabel, { color: colors.up }]}>Bullish</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ── Aggression Panel ───────────────────────────────────────────────── */

function AggressionPanel({ buyPct, sellPct, buyTrend, sellTrend, buyStr, sellStr, colors }: {
  buyPct: number; sellPct: number;
  buyTrend: TrendDir; sellTrend: TrendDir;
  buyStr: Strength; sellStr: Strength;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <SectionHeader label="BUYER vs SELLER AGGRESSION" />

      {/* Big split */}
      <View style={styles.aggrRow}>
        <View style={styles.aggrSide}>
          <Text style={[styles.aggrPct, { color: colors.up }]}>{buyPct}%</Text>
          <Text style={[styles.aggrLbl, { color: colors.up }]}>BUYERS</Text>
          <TrendBadge dir={buyTrend} colors={colors} />
          <StrengthDots strength={buyStr} colors={colors} />
        </View>

        {/* Centre bars */}
        <View style={styles.aggrBars}>
          <View style={[styles.aggrBar, { backgroundColor: colors.border }]}>
            <View style={[styles.aggrFill, {
              height: `${buyPct}%` as unknown as number,
              backgroundColor: colors.up,
              alignSelf: "flex-end",
            }]} />
          </View>
          <View style={[styles.aggrBar, { backgroundColor: colors.border }]}>
            <View style={[styles.aggrFill, {
              height: `${sellPct}%` as unknown as number,
              backgroundColor: colors.down,
              alignSelf: "flex-end",
            }]} />
          </View>
        </View>

        <View style={[styles.aggrSide, styles.aggrRight]}>
          <Text style={[styles.aggrPct, { color: colors.down }]}>{sellPct}%</Text>
          <Text style={[styles.aggrLbl, { color: colors.down }]}>SELLERS</Text>
          <TrendBadge dir={sellTrend} colors={colors} />
          <StrengthDots strength={sellStr} colors={colors} />
        </View>
      </View>

      {/* Horizontal bar */}
      <View style={[styles.splitBar, { backgroundColor: colors.border }]}>
        <View style={[styles.splitFill, { width: `${buyPct}%` as unknown as number, backgroundColor: colors.up }]} />
      </View>
    </View>
  );
}

/* ── Delta Panel ────────────────────────────────────────────────────── */

function DeltaPanel({ delta, deltaUSD, bias, strength: str, history, colors }: {
  delta: number; deltaUSD: number; bias: FlowBias; strength: Strength;
  history: number[]; colors: ReturnType<typeof useColors>;
}) {
  const bc = biasColor(bias, colors);
  const maxAbs = Math.max(1, ...history.map(Math.abs));

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <SectionHeader label="DELTA ANALYSIS  (BUY VOL − SELL VOL)" />

      <View style={styles.deltaTop}>
        <View>
          <Text style={[styles.deltaVal, { color: bc }]}>
            {delta >= 0 ? "+" : ""}{fmtVol(delta)}
          </Text>
          <Text style={[styles.deltaUSD, { color: colors.mutedForeground }]}>{fmtUSD(deltaUSD)}</Text>
        </View>
        <View style={styles.deltaRight}>
          <View style={[styles.biasPill, { backgroundColor: bc + "20", borderColor: bc + "50" }]}>
            <Text style={[styles.biasText, { color: bc }]}>{bias}</Text>
          </View>
          <StrengthDots strength={str} colors={colors} />
        </View>
      </View>

      {/* Mini delta history bars */}
      {history.length > 0 && (
        <View style={styles.histRow}>
          {history.map((v, i) => {
            const h = Math.round((Math.abs(v) / maxAbs) * 36);
            const c = v >= 0 ? colors.up : colors.down;
            return (
              <View key={i} style={styles.histBarWrap}>
                <View style={[styles.histBar, { height: h, backgroundColor: c + "CC", borderRadius: 2 }]} />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/* ── Pressure Panel ─────────────────────────────────────────────────── */

function PressurePanel({ buying, selling, trend: tr, strength: str, colors }: {
  buying: number; selling: number; trend: TrendDir; strength: Strength;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.cardHeaderRow}>
        <SectionHeader label="TRADE PRESSURE" />
        <View style={styles.badgeRow}>
          <TrendBadge dir={tr} colors={colors} />
          <StrengthDots strength={str} colors={colors} />
        </View>
      </View>
      <PressBar label="Buying Pressure" value={buying} barColor={colors.up} colors={colors} />
      <PressBar label="Selling Pressure" value={selling} barColor={colors.down} colors={colors} />
    </View>
  );
}

function PressBar({ label, value, barColor, colors }: {
  label: string; value: number; barColor: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.pressRow}>
      <Text style={[styles.pressLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.pressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.pressFill, { width: `${Math.min(100, value)}%` as unknown as number, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.pressPct, { color: barColor }]}>{value}%</Text>
    </View>
  );
}

/* ── Volume Imbalance Panel ─────────────────────────────────────────── */

function ImbalancePanel({ buyPct, sellPct, imbalance, bias, strength: str, colors }: {
  buyPct: number; sellPct: number; imbalance: number;
  bias: string; strength: Strength; colors: ReturnType<typeof useColors>;
}) {
  const bc = imbalance > 5 ? colors.up : imbalance < -5 ? colors.down : colors.wait;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.cardHeaderRow}>
        <SectionHeader label="VOLUME IMBALANCE" />
        <View style={[styles.biasPill, { backgroundColor: bc + "20", borderColor: bc + "50" }]}>
          <Text style={[styles.biasText, { color: bc }]}>{bias}</Text>
        </View>
      </View>

      <View style={styles.imbRow}>
        <View style={styles.imbSide}>
          <Text style={[styles.imbPct, { color: colors.up }]}>{buyPct}%</Text>
          <Text style={[styles.imbLbl, { color: colors.mutedForeground }]}>Buy Volume</Text>
        </View>
        <View style={styles.imbCenter}>
          <Text style={[styles.imbImbalance, { color: bc }]}>
            {imbalance > 0 ? "+" : ""}{imbalance}%
          </Text>
          <Text style={[styles.imbImbalanceSub, { color: colors.mutedForeground }]}>imbalance</Text>
          <StrengthDots strength={str} colors={colors} />
        </View>
        <View style={[styles.imbSide, styles.imbRight]}>
          <Text style={[styles.imbPct, { color: colors.down }]}>{sellPct}%</Text>
          <Text style={[styles.imbLbl, { color: colors.mutedForeground }]}>Sell Volume</Text>
        </View>
      </View>

      {/* Stacked bar */}
      <View style={[styles.imbBar, { backgroundColor: colors.down }]}>
        <View style={[styles.imbBarFill, { width: `${buyPct}%` as unknown as number, backgroundColor: colors.up }]} />
      </View>
    </View>
  );
}

/* ── Order Book Depth Panel ─────────────────────────────────────────── */

function OrderBookPanel({ bidAskRatio, totalBidUSD, totalAskUSD, colors }: {
  bidAskRatio: number; totalBidUSD: number; totalAskUSD: number;
  colors: ReturnType<typeof useColors>;
}) {
  const bias = bidAskRatio > 1.15 ? "Bid Heavy" : bidAskRatio < 0.87 ? "Ask Heavy" : "Balanced";
  const bc = bias === "Bid Heavy" ? colors.up : bias === "Ask Heavy" ? colors.down : colors.wait;
  const totalDepth = totalBidUSD + totalAskUSD;
  const bidBarPct  = totalDepth > 0 ? (totalBidUSD / totalDepth) * 100 : 50;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.cardHeaderRow}>
        <SectionHeader label="ORDER BOOK DEPTH" />
        <View style={[styles.biasPill, { backgroundColor: bc + "20", borderColor: bc + "50" }]}>
          <Text style={[styles.biasText, { color: bc }]}>{bias}</Text>
        </View>
      </View>
      <View style={styles.obRow}>
        <View style={styles.obSide}>
          <Text style={[styles.obVal, { color: colors.up }]}>{fmtUSDPos(totalBidUSD)}</Text>
          <Text style={[styles.obLbl, { color: colors.mutedForeground }]}>Total Bids</Text>
        </View>
        <View style={styles.obCenter}>
          <Text style={[styles.obRatio, { color: bc }]}>{bidAskRatio.toFixed(2)}x</Text>
          <Text style={[styles.obRatioSub, { color: colors.mutedForeground }]}>Bid/Ask</Text>
        </View>
        <View style={[styles.obSide, styles.obRight]}>
          <Text style={[styles.obVal, { color: colors.down }]}>{fmtUSDPos(totalAskUSD)}</Text>
          <Text style={[styles.obLbl, { color: colors.mutedForeground }]}>Total Asks</Text>
        </View>
      </View>
      <View style={[styles.imbBar, { backgroundColor: colors.down }]}>
        <View style={[styles.imbBarFill, { width: `${bidBarPct}%` as unknown as number, backgroundColor: colors.up }]} />
      </View>
    </View>
  );
}

/* ── Alerts Panel ───────────────────────────────────────────────────── */

function AlertItem({ alert, colors }: { alert: OrderFlowAlert; colors: ReturnType<typeof useColors> }) {
  const sc = severityColor(alert.severity, colors);
  return (
    <View style={[styles.alertItem, { borderLeftColor: sc }]}>
      <View style={[styles.alertIcon, { backgroundColor: sc + "20" }]}>
        <Feather name={alertIcon(alert.type)} size={12} color={sc} />
      </View>
      <View style={styles.alertBody}>
        <Text style={[styles.alertMsg, { color: colors.foreground }]}>{alert.message}</Text>
        <Text style={[styles.alertTime, { color: colors.mutedForeground }]}>{tsAgo(alert.timestamp)}</Text>
      </View>
      <View style={[styles.severityDot, { backgroundColor: sc }]} />
    </View>
  );
}

/* ── Market Explanation Panel ───────────────────────────────────────── */

function ExplanationPanel({ text, score, colors }: {
  text: string; score: number; colors: ReturnType<typeof useColors>;
}) {
  const bc = score >= 56 ? colors.up : score <= 44 ? colors.down : colors.wait;
  const icon: React.ComponentProps<typeof Feather>["name"] =
    score >= 56 ? "trending-up" : score <= 44 ? "trending-down" : "activity";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.cardHeaderRow}>
        <SectionHeader label="MARKET EXPLANATION" />
        <View style={[styles.iconRound, { backgroundColor: bc + "20" }]}>
          <Feather name={icon} size={14} color={bc} />
        </View>
      </View>
      <Text style={[styles.explainText, { color: colors.secondaryForeground }]}>{text}</Text>
    </View>
  );
}

/* ── Coming Soon Panel ──────────────────────────────────────────────── */

const FUTURE_FEATURES = [
  { icon: "layers" as const,    title: "Cumulative Volume Delta (CVD)",   desc: "Running total of buy minus sell. Reveals hidden divergences between price and flow." },
  { icon: "grid" as const,      title: "Footprint Charts",                desc: "Bid/ask volume at each price level per candle. Exposes absorption and imbalance." },
  { icon: "bar-chart" as const, title: "Volume Profile",                  desc: "Volume distributed by price. Highlights value areas and the point of control." },
  { icon: "shield" as const,    title: "Absorption Detection",            desc: "Identifies when passive orders absorb aggression — often precedes reversals." },
  { icon: "zap" as const,       title: "Liquidity Sweeps",                desc: "Detects when stop clusters are hunted before a directional move." },
  { icon: "list" as const,      title: "DOM Analysis",                    desc: "Depth-of-market order stacking and refresh rate analysis." },
  { icon: "target" as const,    title: "Liquidation Clusters",            desc: "Estimates leveraged positions from funding and open interest data." },
];

function FuturePanel({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View>
      <SectionHeader label="ADVANCED FEATURES  —  ARCHITECTURE READY" />
      {FUTURE_FEATURES.map((f) => (
        <View key={f.title} style={[styles.futureCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.futureIcon, { backgroundColor: colors.secondary }]}>
            <Feather name={f.icon} size={14} color={colors.mutedForeground} />
          </View>
          <View style={styles.futureBody}>
            <View style={styles.futureTitleRow}>
              <Text style={[styles.futureTitle, { color: colors.mutedForeground }]}>{f.title}</Text>
              <View style={[styles.soonBadge, { borderColor: colors.border }]}>
                <Text style={[styles.soonText, { color: colors.mutedForeground }]}>SOON</Text>
              </View>
            </View>
            <Text style={[styles.futureDesc, { color: colors.mutedForeground + "AA" }]}>{f.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ── Coin Selector ──────────────────────────────────────────────────── */

function CoinSelector({ selected, onSelect, colors }: {
  selected: CoinSymbol;
  onSelect: (c: CoinSymbol) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.coinRow}>
      {COINS.map((cfg) => {
        const active = cfg.symbol === selected;
        return (
          <Pressable
            key={cfg.symbol}
            onPress={() => onSelect(cfg.symbol)}
            style={[
              styles.coinBtn,
              { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "20" : "transparent" },
            ]}
          >
            <Text style={[styles.coinLabel, { color: active ? colors.primary : colors.mutedForeground }]}>{cfg.ticker}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Main Screen ────────────────────────────────────────────────────── */

export default function OrderFlowScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const topPad  = Platform.OS === "web" ? 24 : insets.top;

  const [coin, setCoin] = useState<CoinSymbol>("BTCUSDT");

  const flow = useOrderFlow(0, coin);

  /* Pulse animation for live indicator */
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  const isLive = flow.dataSource === "websocket";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Order Flow</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Intelligence Center</Text>
          </View>
          <View style={styles.liveIndicator}>
            <Animated.View style={[styles.liveDot, { backgroundColor: isLive ? colors.up : colors.wait, opacity: pulseAnim }]} />
            <Text style={[styles.liveText, { color: isLive ? colors.up : colors.wait }]}>
              {isLive ? "LIVE" : "LOADING"}
            </Text>
          </View>
        </View>

        {/* Stats strip */}
        {flow.ready && (
          <View style={styles.statsStrip}>
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: colors.primary }]}>{flow.tradesPerSecond}/s</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Trades/sec</Text>
            </View>
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: colors.foreground }]}>{flow.tradeCount}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>30s trades</Text>
            </View>
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: colors.foreground }]}>{flow.bidAskRatio.toFixed(2)}x</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Bid/Ask</Text>
            </View>
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: colors.foreground }]}>{tsAgo(flow.lastTradeTime)}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Last trade</Text>
            </View>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Coin selector */}
        <CoinSelector selected={coin} onSelect={setCoin} colors={colors} />

        {/* Loading state */}
        {!flow.ready && (
          <View style={[styles.loadCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="activity" size={22} color={colors.primary} />
            <Text style={[styles.loadText, { color: colors.mutedForeground }]}>
              Connecting to Binance trade stream…
            </Text>
            <Text style={[styles.loadSub, { color: colors.mutedForeground + "80" }]}>
              {coin} aggTrade WebSocket
            </Text>
          </View>
        )}

        {flow.ready && (
          <>
            {/* 1. OF Score */}
            <ScoreGauge
              score={flow.score.score}
              bias={flow.score.bias}
              strength={flow.score.strength}
              colors={colors}
            />

            {/* 2. Aggression */}
            <AggressionPanel
              buyPct={flow.buyerAggressionMetric.value}
              sellPct={flow.sellerAggressionMetric.value}
              buyTrend={flow.buyerAggressionMetric.trend}
              sellTrend={flow.sellerAggressionMetric.trend}
              buyStr={flow.buyerAggressionMetric.strength}
              sellStr={flow.sellerAggressionMetric.strength}
              colors={colors}
            />

            {/* 3. Delta */}
            <DeltaPanel
              delta={flow.deltaAnalysis.current}
              deltaUSD={flow.deltaAnalysis.currentUSD}
              bias={flow.deltaAnalysis.trend}
              strength={flow.deltaAnalysis.strength}
              history={flow.deltaAnalysis.history}
              colors={colors}
            />

            {/* 4. Pressure */}
            <PressurePanel
              buying={flow.tradePressure.buying}
              selling={flow.tradePressure.selling}
              trend={flow.tradePressure.trend}
              strength={flow.tradePressure.strength}
              colors={colors}
            />

            {/* 5. Volume Imbalance */}
            <ImbalancePanel
              buyPct={flow.volumeImbalanceData.buyPct}
              sellPct={flow.volumeImbalanceData.sellPct}
              imbalance={flow.volumeImbalanceData.imbalance}
              bias={flow.volumeImbalanceData.bias}
              strength={flow.volumeImbalanceData.strength}
              colors={colors}
            />

            {/* 6. Order Book */}
            {flow.totalBidDepthUSD > 0 && (
              <OrderBookPanel
                bidAskRatio={flow.bidAskRatio}
                totalBidUSD={flow.totalBidDepthUSD}
                totalAskUSD={flow.totalAskDepthUSD}
                colors={colors}
              />
            )}

            {/* 7. Signal Integration Summary */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <SectionHeader label="SIGNAL INTEGRATION" />
              <View style={styles.signalGrid}>
                <SignalTag
                  label="LONG confirmation"
                  active={flow.score.bias === "Bullish"}
                  strength={flow.score.strength}
                  color={colors.up}
                  colors={colors}
                />
                <SignalTag
                  label="SHORT confirmation"
                  active={flow.score.bias === "Bearish"}
                  strength={flow.score.strength}
                  color={colors.down}
                  colors={colors}
                />
              </View>
              <Text style={[styles.signalNote, { color: colors.mutedForeground }]}>
                {flow.score.bias === "Bullish"
                  ? `Buyer aggression ↑ · Positive delta · Buy imbalance — adds LONG confirmation.`
                  : flow.score.bias === "Bearish"
                  ? `Seller aggression ↑ · Negative delta · Sell imbalance — adds SHORT confirmation.`
                  : `Flow is neutral — no directional confirmation from order flow.`}
              </Text>
            </View>

            {/* 8. Market Explanation */}
            <ExplanationPanel text={flow.marketExplanation} score={flow.score.score} colors={colors} />

            {/* 9. Alerts */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.cardHeaderRow}>
                <SectionHeader label="ORDER FLOW ALERTS" />
                {flow.alerts.length > 0 && (
                  <View style={[styles.alertBadge, { backgroundColor: colors.primary + "25" }]}>
                    <Text style={[styles.alertBadgeText, { color: colors.primary }]}>{flow.alerts.length}</Text>
                  </View>
                )}
              </View>
              {flow.alerts.length === 0 ? (
                <Text style={[styles.noAlerts, { color: colors.mutedForeground }]}>
                  No alerts — order flow is within normal ranges.
                </Text>
              ) : (
                flow.alerts.map((a) => <AlertItem key={a.id} alert={a} colors={colors} />)
              )}
            </View>
          </>
        )}

        {/* 10. Future-ready section */}
        <FuturePanel colors={colors} />
      </ScrollView>
    </View>
  );
}

/* ── Signal Tag ─────────────────────────────────────────────────────── */

function SignalTag({ label, active, strength: str, color, colors }: {
  label: string; active: boolean; strength: Strength; color: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[
      styles.signalTag,
      { borderColor: active ? color + "60" : colors.border, backgroundColor: active ? color + "15" : colors.secondary },
    ]}>
      <Feather name={active ? "check-circle" : "circle"} size={12} color={active ? color : colors.mutedForeground} />
      <Text style={[styles.signalTagText, { color: active ? color : colors.mutedForeground }]}>{label}</Text>
      {active && <StrengthDots strength={str} colors={colors} />}
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1 },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  liveIndicator: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },

  statsStrip: { flexDirection: "row", alignItems: "center" },
  statItem: { flex: 1, alignItems: "center", gap: 1 },
  statVal: { fontSize: 13, fontFamily: "Inter_700Bold" },
  statLbl: { fontSize: 9, fontFamily: "Inter_400Regular" },
  statDiv: { width: 1, height: 24 },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 14, paddingTop: 12, gap: 12 },

  coinRow: { flexDirection: "row", gap: 8 },
  coinBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  coinLabel: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  loadCard: { borderRadius: 14, borderWidth: 1, padding: 28, alignItems: "center", gap: 12 },
  loadText: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
  loadSub: { fontSize: 11, fontFamily: "Inter_400Regular" },

  secHeader: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 },

  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },

  dotsRow: { flexDirection: "row", gap: 4, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  biasPill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  biasText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  /* Gauge */
  gaugeCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  gaugeTitle: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, marginBottom: 14 },
  gaugeBody: { flexDirection: "row", alignItems: "center", gap: 16 },
  scoreBubble: { width: 92, height: 92, borderRadius: 46, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  scoreNum: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  scoreMax: { fontSize: 10, fontFamily: "Inter_400Regular" },
  gaugeRight: { flex: 1, gap: 6 },
  gaugeLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  scaleTrack: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 4 },
  scaleFill: { height: 5, borderRadius: 3 },
  scaleLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  scaleLabel: { fontSize: 8, fontFamily: "Inter_400Regular" },

  /* Aggression */
  aggrRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  aggrSide: { flex: 1, gap: 4 },
  aggrRight: { alignItems: "flex-end" },
  aggrPct: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  aggrLbl: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  aggrBars: { flexDirection: "row", gap: 6, alignItems: "flex-end" },
  aggrBar: { width: 16, height: 80, borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" },
  aggrFill: { borderRadius: 4, width: "100%" },
  splitBar: { height: 5, borderRadius: 3, overflow: "hidden" },
  splitFill: { height: 5, borderRadius: 3 },

  /* Delta */
  deltaTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  deltaVal: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  deltaUSD: { fontSize: 12, fontFamily: "Inter_400Regular" },
  deltaRight: { alignItems: "flex-end", gap: 8 },
  histRow: { flexDirection: "row", gap: 4, alignItems: "flex-end", height: 36 },
  histBarWrap: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  histBar: { width: "100%", minHeight: 2 },

  /* Pressure */
  pressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  pressLabel: { fontSize: 11, fontFamily: "Inter_500Medium", width: 90 },
  pressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  pressFill: { height: 6, borderRadius: 3 },
  pressPct: { fontSize: 12, fontFamily: "Inter_700Bold", width: 36, textAlign: "right" },

  /* Imbalance */
  imbRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  imbSide: { flex: 1, gap: 4 },
  imbRight: { alignItems: "flex-end" },
  imbCenter: { alignItems: "center", gap: 4 },
  imbPct: { fontSize: 24, fontFamily: "Inter_700Bold" },
  imbLbl: { fontSize: 10, fontFamily: "Inter_400Regular" },
  imbImbalance: { fontSize: 18, fontFamily: "Inter_700Bold" },
  imbImbalanceSub: { fontSize: 9, fontFamily: "Inter_400Regular" },
  imbBar: { height: 5, borderRadius: 3, overflow: "hidden" },
  imbBarFill: { height: 5, borderRadius: 3 },

  /* Order book */
  obRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  obSide: { flex: 1, gap: 4 },
  obRight: { alignItems: "flex-end" },
  obCenter: { alignItems: "center", gap: 2 },
  obVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  obLbl: { fontSize: 10, fontFamily: "Inter_400Regular" },
  obRatio: { fontSize: 22, fontFamily: "Inter_700Bold" },
  obRatioSub: { fontSize: 9, fontFamily: "Inter_400Regular" },

  /* Signals */
  signalGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
  signalTag: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  signalTagText: { fontSize: 10, fontFamily: "Inter_600SemiBold", flex: 1 },
  signalNote: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 18 },

  /* Explanation */
  explainText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 21 },
  iconRound: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },

  /* Alerts */
  alertItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderLeftWidth: 2, paddingLeft: 10, paddingVertical: 8, marginBottom: 6 },
  alertIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 1 },
  alertBody: { flex: 1, gap: 2 },
  alertMsg: { fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },
  alertTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  severityDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  alertBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  alertBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  noAlerts: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 12 },

  /* Future */
  futureCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1, borderStyle: "dashed", borderRadius: 12, padding: 12, marginBottom: 8 },
  futureIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  futureBody: { flex: 1, gap: 4 },
  futureTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  futureTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 },
  futureDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 17 },
  soonBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 8 },
  soonText: { fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
});
