import React from "react";
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getCoin } from "@/constants/coins";
import { useSelectedCoin } from "@/context/CoinContext";
import { useTradingData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";
import { useLiquidityData, type LiquidityWall, type LiquidityZone } from "@/hooks/useLiquidityData";

/* ── Formatters ─────────────────────────────────────────────────── */

function fmtUSD(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPrice(p: number, decimals: number): string {
  return p > 0 ? p.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "—";
}

function fmtDist(pct: number): string {
  return pct > 0 ? `${pct.toFixed(2)}% away` : "—";
}

/* ── Sub-components ─────────────────────────────────────────────── */

interface Colors {
  background: string;
  card: string;
  cardBorder: string;
  border: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  up: string;
  down: string;
  wait: string;
  secondary: string;
}

function SectionLabel({ text, colors }: { text: string; colors: Colors }) {
  return (
    <Text style={[sty.secLabel, { color: colors.mutedForeground }]}>{text}</Text>
  );
}

function ScoreArc({
  score,
  bias,
  strength,
  colors,
}: {
  score: number;
  bias: string;
  strength: string;
  colors: Colors;
}) {
  const biasColor =
    bias === "Bullish" ? colors.up :
    bias === "Bearish" ? colors.down : colors.wait;

  const filled = Math.round((score / 100) * 20);
  const bars = Array.from({ length: 20 }, (_, i) => i < filled);

  return (
    <View style={sty.scoreContainer}>
      <View style={sty.scoreTop}>
        <Text style={[sty.scoreNum, { color: biasColor }]}>{score}</Text>
        <Text style={[sty.scoreOf, { color: colors.mutedForeground }]}>/100</Text>
      </View>
      <View style={sty.scoreBars}>
        {bars.map((active, i) => (
          <View
            key={i}
            style={[
              sty.scoreBar,
              { backgroundColor: active ? biasColor : colors.border },
            ]}
          />
        ))}
      </View>
      <View style={sty.scoreRow}>
        <View style={[sty.badge, { backgroundColor: biasColor + "22", borderColor: biasColor + "55" }]}>
          <Text style={[sty.badgeText, { color: biasColor }]}>{bias}</Text>
        </View>
        <Text style={[sty.strengthText, { color: colors.mutedForeground }]}>{strength}</Text>
      </View>
    </View>
  );
}

function WallCard({
  label,
  side,
  wall,
  decimals,
  colors,
}: {
  label: string;
  side: "bid" | "ask";
  wall: LiquidityWall;
  decimals: number;
  colors: Colors;
}) {
  const sideColor = side === "bid" ? colors.up : colors.down;
  const ready = wall.price > 0;

  return (
    <View style={[sty.wallCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={[sty.wallSide, { backgroundColor: sideColor + "18" }]}>
        <Text style={[sty.wallSideText, { color: sideColor }]}>
          {side === "bid" ? "BID" : "ASK"}
        </Text>
      </View>
      <View style={sty.wallInfo}>
        <Text style={[sty.wallLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[sty.wallPrice, { color: colors.foreground }]}>
          {ready ? fmtPrice(wall.price, decimals) : "—"}
        </Text>
        <Text style={[sty.wallSize, { color: sideColor }]}>
          {ready ? fmtUSD(wall.sizeUSD) : "—"}
        </Text>
        <Text style={[sty.wallDist, { color: colors.mutedForeground }]}>
          {ready ? fmtDist(wall.distancePct) : "Calculating…"}
        </Text>
      </View>
    </View>
  );
}

function PressureBar({
  label,
  value,
  total,
  direction,
  strength,
  color,
  colors,
}: {
  label: string;
  value: number;
  total: number;
  direction: string;
  strength: string;
  color: string;
  colors: Colors;
}) {
  const pct = total > 0 ? (value / total) * 100 : 50;

  return (
    <View style={sty.pressureItem}>
      <View style={sty.pressureHeader}>
        <Text style={[sty.pressureLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <View style={sty.pressureMeta}>
          <View style={[sty.badge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
            <Text style={[sty.badgeText, { color }]}>{direction}</Text>
          </View>
          <Text style={[sty.strengthText, { color: colors.mutedForeground }]}>{strength}</Text>
        </View>
      </View>
      <View style={sty.pressureNumRow}>
        <Text style={[sty.pressureNum, { color }]}>{value}%</Text>
      </View>
      <View style={[sty.barTrack, { backgroundColor: colors.border }]}>
        <View style={[sty.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ZoneRow({ zone, decimals, colors }: { zone: LiquidityZone; decimals: number; colors: Colors }) {
  const typeColor = zone.type === "Support" ? colors.up : colors.down;
  const strengthColor =
    zone.strength === "Strong"   ? typeColor :
    zone.strength === "Moderate" ? colors.wait : colors.mutedForeground;

  return (
    <View style={[sty.zoneRow, { borderBottomColor: colors.border }]}>
      <View style={[sty.zoneTypeBadge, { backgroundColor: typeColor + "18" }]}>
        <Text style={[sty.zoneTypeText, { color: typeColor }]}>
          {zone.type === "Support" ? "SUP" : "RES"}
        </Text>
      </View>
      <Text style={[sty.zonePrice, { color: colors.foreground }]}>
        {fmtPrice(zone.price, decimals)}
      </Text>
      <Text style={[sty.zoneUSD, { color: colors.mutedForeground }]}>
        {fmtUSD(zone.sizeUSD)}
      </Text>
      <View style={[sty.badge, { backgroundColor: strengthColor + "22", borderColor: strengthColor + "55" }]}>
        <Text style={[sty.badgeText, { color: strengthColor }]}>{zone.strength}</Text>
      </View>
      <Text style={[sty.zoneDist, { color: colors.mutedForeground }]}>
        {fmtDist(zone.distancePct)}
      </Text>
    </View>
  );
}

/* ── Main Screen ────────────────────────────────────────────────── */

export default function LiquidityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 60 : insets.top;

  const { selectedCoin } = useSelectedCoin();
  const coin = getCoin(selectedCoin);
  const { data, orderFlow } = useTradingData();
  const liq = useLiquidityData(selectedCoin, data.price, orderFlow);

  const biasColor =
    liq.liquidityBias === "Bullish" ? colors.up :
    liq.liquidityBias === "Bearish" ? colors.down : colors.wait;

  const imbalanceColor =
    liq.imbalanceBias === "Bid Heavy" ? colors.up :
    liq.imbalanceBias === "Ask Heavy" ? colors.down : colors.wait;

  return (
    <View style={[sty.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[sty.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={sty.headerTop}>
          <View>
            <Text style={[sty.title, { color: colors.foreground }]}>Liquidity & Pressure</Text>
            <Text style={[sty.subtitle, { color: colors.mutedForeground }]}>
              Order book depth & market pressure
            </Text>
          </View>
          <View style={[sty.coinBadge, { backgroundColor: coin.color + "22", borderColor: coin.color + "55" }]}>
            <View style={[sty.coinDot, { backgroundColor: coin.color }]} />
            <Text style={[sty.coinLabel, { color: coin.color }]}>{coin.ticker}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={sty.scroll}
        contentContainerStyle={[sty.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Liquidity Score ─────────────────────────────────── */}
        <View style={[sty.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SectionLabel text="LIQUIDITY SCORE" colors={colors} />
          <ScoreArc
            score={liq.liquidityScore}
            bias={liq.liquidityBias}
            strength={liq.liquidityStrength}
            colors={colors}
          />
          <View style={[sty.divider, { backgroundColor: colors.border }]} />
          {/* Imbalance row */}
          <View style={sty.metaRow}>
            <View style={sty.metaItem}>
              <Text style={[sty.metaKey, { color: colors.mutedForeground }]}>Bid Volume</Text>
              <Text style={[sty.metaVal, { color: colors.up }]}>{fmtUSD(liq.totalBidUSD)}</Text>
            </View>
            <View style={[sty.metaDivider, { backgroundColor: colors.border }]} />
            <View style={sty.metaItem}>
              <Text style={[sty.metaKey, { color: colors.mutedForeground }]}>Ask Volume</Text>
              <Text style={[sty.metaVal, { color: colors.down }]}>{fmtUSD(liq.totalAskUSD)}</Text>
            </View>
            <View style={[sty.metaDivider, { backgroundColor: colors.border }]} />
            <View style={sty.metaItem}>
              <Text style={[sty.metaKey, { color: colors.mutedForeground }]}>Imbalance</Text>
              <Text style={[sty.metaVal, { color: imbalanceColor }]}>{liq.imbalanceBias}</Text>
            </View>
          </View>
        </View>

        {/* ── Liquidity Walls ─────────────────────────────────── */}
        <View style={[sty.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SectionLabel text="LIQUIDITY ANALYSIS" colors={colors} />
          <View style={sty.wallGrid}>
            <WallCard
              label="Largest Bid Wall"
              side="bid"
              wall={liq.largestBidWall}
              decimals={coin.decimals}
              colors={colors}
            />
            <WallCard
              label="Largest Ask Wall"
              side="ask"
              wall={liq.largestAskWall}
              decimals={coin.decimals}
              colors={colors}
            />
            <WallCard
              label="Nearest Support"
              side="bid"
              wall={liq.nearestSupportLiquidity}
              decimals={coin.decimals}
              colors={colors}
            />
            <WallCard
              label="Nearest Resistance"
              side="ask"
              wall={liq.nearestResistanceLiquidity}
              decimals={coin.decimals}
              colors={colors}
            />
          </View>
          <View style={[sty.divider, { backgroundColor: colors.border }]} />
          {/* Liquidity imbalance ratio */}
          <View style={sty.imbalanceRow}>
            <Text style={[sty.imbalanceLabel, { color: colors.mutedForeground }]}>
              Liquidity Imbalance
            </Text>
            <Text style={[sty.imbalanceVal, { color: imbalanceColor }]}>
              {liq.liquidityImbalance.toFixed(2)}x
            </Text>
          </View>
          <View style={[sty.barTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                sty.barFill,
                {
                  width: `${Math.min(100, (liq.liquidityImbalance / 2) * 100)}%`,
                  backgroundColor: imbalanceColor,
                },
              ]}
            />
          </View>
          <View style={sty.imbalanceLegend}>
            <Text style={[sty.legendText, { color: colors.mutedForeground }]}>Ask Heavy ◀</Text>
            <Text style={[sty.legendText, { color: colors.mutedForeground }]}>▶ Bid Heavy</Text>
          </View>
        </View>

        {/* ── Market Pressure ─────────────────────────────────── */}
        <View style={[sty.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SectionLabel text="MARKET PRESSURE" colors={colors} />
          <PressureBar
            label="Buying Pressure"
            value={liq.pressure.buyingPressure}
            total={100}
            direction={liq.pressure.trend === "Bullish" ? liq.pressure.direction : "Neutral"}
            strength={liq.pressure.trend === "Bullish" ? liq.pressure.strength : "Weak"}
            color={colors.up}
            colors={colors}
          />
          <View style={[sty.divider, { backgroundColor: colors.border }]} />
          <PressureBar
            label="Selling Pressure"
            value={liq.pressure.sellingPressure}
            total={100}
            direction={liq.pressure.trend === "Bearish" ? liq.pressure.direction : "Neutral"}
            strength={liq.pressure.trend === "Bearish" ? liq.pressure.strength : "Weak"}
            color={colors.down}
            colors={colors}
          />
        </View>

        {/* ── Liquidity Zones ─────────────────────────────────── */}
        <View style={[sty.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SectionLabel text="LIQUIDITY ZONES" colors={colors} />

          {/* Strong support / resistance highlight */}
          <View style={sty.zoneHighlights}>
            {liq.strongSupport ? (
              <View style={[sty.zoneHighlight, { borderColor: colors.up + "55", backgroundColor: colors.up + "0C" }]}>
                <Text style={[sty.zoneHighlightLabel, { color: colors.mutedForeground }]}>STRONG SUPPORT</Text>
                <Text style={[sty.zoneHighlightPrice, { color: colors.up }]}>
                  ${fmtPrice(liq.strongSupport.price, coin.decimals)}
                </Text>
                <Text style={[sty.zoneHighlightSub, { color: colors.mutedForeground }]}>
                  {fmtUSD(liq.strongSupport.sizeUSD)} · {fmtDist(liq.strongSupport.distancePct)}
                </Text>
              </View>
            ) : (
              <View style={[sty.zoneHighlight, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Text style={[sty.zoneHighlightLabel, { color: colors.mutedForeground }]}>STRONG SUPPORT</Text>
                <Text style={[sty.zoneHighlightPrice, { color: colors.mutedForeground }]}>—</Text>
                <Text style={[sty.zoneHighlightSub, { color: colors.mutedForeground }]}>Not identified</Text>
              </View>
            )}
            {liq.strongResistance ? (
              <View style={[sty.zoneHighlight, { borderColor: colors.down + "55", backgroundColor: colors.down + "0C" }]}>
                <Text style={[sty.zoneHighlightLabel, { color: colors.mutedForeground }]}>STRONG RESISTANCE</Text>
                <Text style={[sty.zoneHighlightPrice, { color: colors.down }]}>
                  ${fmtPrice(liq.strongResistance.price, coin.decimals)}
                </Text>
                <Text style={[sty.zoneHighlightSub, { color: colors.mutedForeground }]}>
                  {fmtUSD(liq.strongResistance.sizeUSD)} · {fmtDist(liq.strongResistance.distancePct)}
                </Text>
              </View>
            ) : (
              <View style={[sty.zoneHighlight, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Text style={[sty.zoneHighlightLabel, { color: colors.mutedForeground }]}>STRONG RESISTANCE</Text>
                <Text style={[sty.zoneHighlightPrice, { color: colors.mutedForeground }]}>—</Text>
                <Text style={[sty.zoneHighlightSub, { color: colors.mutedForeground }]}>Not identified</Text>
              </View>
            )}
          </View>

          {/* Cluster table */}
          {liq.liquidityClusters.length > 0 && (
            <>
              <View style={[sty.divider, { backgroundColor: colors.border }]} />
              <SectionLabel text="LIQUIDITY CLUSTERS" colors={colors} />
              <View style={sty.zoneTableHeader}>
                <Text style={[sty.zoneColHead, { color: colors.mutedForeground, flex: 0.4 }]}>TYPE</Text>
                <Text style={[sty.zoneColHead, { color: colors.mutedForeground, flex: 0.8 }]}>PRICE</Text>
                <Text style={[sty.zoneColHead, { color: colors.mutedForeground, flex: 0.6 }]}>SIZE</Text>
                <Text style={[sty.zoneColHead, { color: colors.mutedForeground, flex: 0.5 }]}>STR</Text>
                <Text style={[sty.zoneColHead, { color: colors.mutedForeground, flex: 0.7 }]}>DIST</Text>
              </View>
              {liq.liquidityClusters.map((z, i) => (
                <ZoneRow key={i} zone={z} decimals={coin.decimals} colors={colors} />
              ))}
            </>
          )}
        </View>

        {/* ── Market Explanation ──────────────────────────────── */}
        <View style={[sty.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <SectionLabel text="MARKET EXPLANATION" colors={colors} />
          {liq.explanationBullets.length > 0 ? (
            liq.explanationBullets.map((b, i) => (
              <View key={i} style={sty.bulletRow}>
                <View style={[sty.bullet, { backgroundColor: biasColor }]} />
                <Text style={[sty.bulletText, { color: colors.foreground }]}>{b}</Text>
              </View>
            ))
          ) : (
            <Text style={[sty.loadingText, { color: colors.mutedForeground }]}>
              {liq.ready ? "No significant liquidity signals detected." : "Analyzing order book…"}
            </Text>
          )}
        </View>

        {/* ── Signal Integration Note ──────────────────────────── */}
        <View style={[sty.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[sty.noteText, { color: colors.mutedForeground }]}>
            Liquidity signals are integrated into the Probability Score, Confidence Score,
            Setup Quality, and Best Trade Engine rankings.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */

const sty = StyleSheet.create({
  root:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { padding: 16, gap: 12 },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTop:  { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  title:      { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle:   { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  coinBadge:  { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  coinDot:    { width: 7, height: 7, borderRadius: 4 },
  coinLabel:  { fontSize: 11, fontFamily: "Inter_700Bold" },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  secLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.4,
  },
  divider:  { height: 1, marginVertical: 2 },

  /* Score */
  scoreContainer: { alignItems: "center", gap: 8, paddingVertical: 4 },
  scoreTop:       { flexDirection: "row", alignItems: "baseline", gap: 4 },
  scoreNum:       { fontSize: 52, fontFamily: "Inter_700Bold", lineHeight: 56 },
  scoreOf:        { fontSize: 16, fontFamily: "Inter_400Regular" },
  scoreBars:      { flexDirection: "row", gap: 3, flexWrap: "wrap", justifyContent: "center" },
  scoreBar:       { width: 12, height: 6, borderRadius: 3 },
  scoreRow:       { flexDirection: "row", alignItems: "center", gap: 8 },

  /* Badges */
  badge:      { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:  { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },
  strengthText: { fontSize: 10, fontFamily: "Inter_400Regular" },

  /* Meta row */
  metaRow:     { flexDirection: "row", justifyContent: "space-between" },
  metaItem:    { flex: 1, alignItems: "center", gap: 3 },
  metaDivider: { width: 1, marginVertical: 4 },
  metaKey:     { fontSize: 9, fontFamily: "Inter_400Regular", letterSpacing: 0.5 },
  metaVal:     { fontSize: 13, fontFamily: "Inter_700Bold" },

  /* Walls */
  wallGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  wallCard: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  wallSide:     { paddingVertical: 4, alignItems: "center" },
  wallSideText: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  wallInfo:     { padding: 8, gap: 2 },
  wallLabel:    { fontSize: 8, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
  wallPrice:    { fontSize: 13, fontFamily: "Inter_700Bold" },
  wallSize:     { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  wallDist:     { fontSize: 9, fontFamily: "Inter_400Regular" },

  /* Imbalance */
  imbalanceRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  imbalanceLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  imbalanceVal:   { fontSize: 13, fontFamily: "Inter_700Bold" },
  imbalanceLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  legendText:      { fontSize: 8, fontFamily: "Inter_400Regular" },

  /* Pressure */
  pressureItem: { gap: 6 },
  pressureHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pressureLabel:  { fontSize: 11, fontFamily: "Inter_500Medium" },
  pressureMeta:   { flexDirection: "row", alignItems: "center", gap: 6 },
  pressureNumRow: { flexDirection: "row", alignItems: "baseline" },
  pressureNum:    { fontSize: 32, fontFamily: "Inter_700Bold", lineHeight: 36 },

  barTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill:  { height: "100%", borderRadius: 3 },

  /* Zones */
  zoneHighlights: { flexDirection: "row", gap: 8 },
  zoneHighlight:  { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, gap: 3 },
  zoneHighlightLabel: { fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  zoneHighlightPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
  zoneHighlightSub:   { fontSize: 9, fontFamily: "Inter_400Regular" },

  zoneTableHeader: { flexDirection: "row", paddingVertical: 4 },
  zoneColHead: { fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },

  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 6,
  },
  zoneTypeBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, width: 34, alignItems: "center" },
  zoneTypeText:  { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  zonePrice:     { flex: 0.8, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  zoneUSD:       { flex: 0.6, fontSize: 10, fontFamily: "Inter_400Regular" },
  zoneDist:      { flex: 0.7, fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "right" },

  /* Explanation */
  bulletRow:   { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 3 },
  bullet:      { width: 6, height: 6, borderRadius: 3, marginTop: 4, flexShrink: 0 },
  bulletText:  { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  loadingText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  /* Note */
  noteCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  noteText: { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 15, textAlign: "center" },
});
