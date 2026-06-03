import React from "react";
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Line, Path, Svg, Text as SvgText } from "react-native-svg";

import { useSelectedCoin } from "@/context/CoinContext";
import { getCoin } from "@/constants/coins";
import { useTradingData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";
import { useFundingOI, type FundingPoint, type OIPoint } from "@/hooks/useFundingOI";

/* ── Formatters ─────────────────────────────────────────────────── */

function fmtFR(r: number) {
  const pct = (r * 100).toFixed(4);
  return `${r >= 0 ? "+" : ""}${pct}%`;
}

function fmtOI(oi: number, ticker: string) {
  if (oi >= 1000) return `${(oi / 1000).toFixed(2)}K ${ticker}`;
  return `${oi.toFixed(0)} ${ticker}`;
}

function fmtTime(ts: number) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")} UTC`;
}

function fmtCountdown(ts: number) {
  if (!ts) return "—";
  const diff = ts - Date.now();
  if (diff <= 0) return "Any moment";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ── Mini SVG Line Chart ─────────────────────────────────────────── */

function FundingLineChart({ data, width, colors }: {
  data: FundingPoint[];
  width: number;
  colors: ReturnType<typeof useColors>;
}) {
  const H = 80;
  const PAD = { top: 10, right: 10, bottom: 18, left: 42 };
  const chartW = width - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (data.length < 2) {
    return (
      <View style={[lc.empty, { height: H }]}>
        <Text style={[lc.emptyText, { color: colors.mutedForeground }]}>Loading chart…</Text>
      </View>
    );
  }

  const rates = data.map((d) => d.rate);
  const minV  = Math.min(0, ...rates);
  const maxV  = Math.max(0, ...rates);
  const range = maxV - minV || 0.0001;

  const toX = (i: number) => PAD.left + (i / (data.length - 1)) * chartW;
  const toY = (v: number) => PAD.top + (1 - (v - minV) / range) * chartH;
  const zeroY = toY(0);

  const pointsStr = data.map((d, i) => `${toX(i)},${toY(d.rate)}`).join(" ");

  return (
    <Svg width={width} height={H}>
      {/* Zero line */}
      <Line x1={PAD.left} y1={zeroY} x2={width - PAD.right} y2={zeroY}
        stroke={colors.mutedForeground + "60"} strokeWidth="1" strokeDasharray="3,3" />
      {/* Rate line */}
      <Path
        d={`M ${data.map((d, i) => `${toX(i)},${toY(d.rate)}`).join(" L ")}`}
        stroke={colors.primary}
        strokeWidth="1.5"
        fill="none"
      />
      {/* Axis labels */}
      <SvgText x={PAD.left - 4} y={toY(maxV) + 4} fill={colors.mutedForeground}
        fontSize="8" textAnchor="end">{(maxV * 100).toFixed(3)}%</SvgText>
      <SvgText x={PAD.left - 4} y={toY(minV) + 4} fill={colors.mutedForeground}
        fontSize="8" textAnchor="end">{(minV * 100).toFixed(3)}%</SvgText>
      <SvgText x={PAD.left - 4} y={zeroY + 4} fill={colors.mutedForeground}
        fontSize="8" textAnchor="end">0%</SvgText>
      {/* First + last time label */}
      <SvgText x={PAD.left} y={H - 2} fill={colors.mutedForeground} fontSize="8">
        {fmtTime(data[0].time)}
      </SvgText>
      <SvgText x={width - PAD.right} y={H - 2} fill={colors.mutedForeground}
        fontSize="8" textAnchor="end">
        {fmtTime(data[data.length - 1].time)}
      </SvgText>
    </Svg>
  );
}

function OILineChart({ data, width, colors }: {
  data: OIPoint[];
  width: number;
  colors: ReturnType<typeof useColors>;
}) {
  const H = 80;
  const PAD = { top: 10, right: 10, bottom: 18, left: 46 };
  const chartW = width - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (data.length < 2) {
    return (
      <View style={[lc.empty, { height: H }]}>
        <Text style={[lc.emptyText, { color: colors.mutedForeground }]}>
          {data.length < 2 ? "Building OI history…" : "Loading chart…"}
        </Text>
      </View>
    );
  }

  const values = data.map((d) => d.oi);
  const minV   = Math.min(...values);
  const maxV   = Math.max(...values);
  const range  = maxV - minV || 1;

  const toX = (i: number) => PAD.left + (i / (data.length - 1)) * chartW;
  const toY = (v: number) => PAD.top + (1 - (v - minV) / range) * chartH;

  const lineColor = values[values.length - 1] > values[0] ? colors.up : colors.down;

  return (
    <Svg width={width} height={H}>
      <Path
        d={`M ${data.map((d, i) => `${toX(i)},${toY(d.oi)}`).join(" L ")}`}
        stroke={lineColor}
        strokeWidth="1.5"
        fill="none"
      />
      <SvgText x={PAD.left - 4} y={toY(maxV) + 4} fill={colors.mutedForeground}
        fontSize="8" textAnchor="end">{(maxV / 1000).toFixed(1)}K</SvgText>
      <SvgText x={PAD.left - 4} y={toY(minV) + 4} fill={colors.mutedForeground}
        fontSize="8" textAnchor="end">{(minV / 1000).toFixed(1)}K</SvgText>
      <SvgText x={PAD.left} y={H - 2} fill={colors.mutedForeground} fontSize="8">
        {fmtTime(data[0].time)}
      </SvgText>
      <SvgText x={width - PAD.right} y={H - 2} fill={colors.mutedForeground}
        fontSize="8" textAnchor="end">
        {fmtTime(data[data.length - 1].time)}
      </SvgText>
    </Svg>
  );
}

const lc = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

/* ── Screen ─────────────────────────────────────────────────────── */

function DirectionBadge({ label, colors }: { label: "Bullish" | "Bearish" | "Neutral" | "Mixed"; colors: ReturnType<typeof useColors> }) {
  const c = label === "Bullish" ? colors.up : label === "Bearish" ? colors.down : label === "Mixed" ? colors.wait : colors.mutedForeground;
  return (
    <View style={[db.root, { backgroundColor: c + "20", borderColor: c + "60" }]}>
      <Text style={[db.text, { color: c }]}>{label}</Text>
    </View>
  );
}

const db = StyleSheet.create({
  root: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 3 },
  text: { fontSize: 12, fontFamily: "Inter_700Bold" },
});

function TrendBadge({ label, colors }: { label: "Rising" | "Falling" | "Flat"; colors: ReturnType<typeof useColors> }) {
  const c = label === "Rising" ? colors.up : label === "Falling" ? colors.down : colors.mutedForeground;
  const icon = label === "Rising" ? "▲" : label === "Falling" ? "▼" : "–";
  return (
    <View style={[db.root, { backgroundColor: c + "15", borderColor: c + "50" }]}>
      <Text style={[db.text, { color: c }]}>{icon} {label}</Text>
    </View>
  );
}

function MetaRow({ label, value, valueColor, colors }: {
  label: string; value: string; valueColor?: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[mr.root, { borderColor: colors.border }]}>
      <Text style={[mr.key, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[mr.val, { color: valueColor ?? colors.foreground }]}>{value}</Text>
    </View>
  );
}

const mr = StyleSheet.create({
  root: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1 },
  key:  { fontSize: 12, fontFamily: "Inter_400Regular" },
  val:  { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

export default function FundingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 32 - 28; /* 16px horizontal padding × 2, 14px card padding × 2 */

  const { selectedCoin } = useSelectedCoin();
  const coin = getCoin(selectedCoin);
  const { data } = useTradingData();
  const foData = useFundingOI(data.priceChangePercent, selectedCoin);

  const frColor = foData.currentFundingRate < 0 ? colors.up : foData.currentFundingRate > 0 ? colors.down : colors.mutedForeground;
  const oiChgColor = foData.oiChange >= 0 ? colors.up : colors.down;

  const participationColor =
    foData.participationLevel === "High"     ? colors.up   :
    foData.participationLevel === "Moderate" ? colors.wait : colors.down;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Funding & Open Interest</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Futures positioning & market participation
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Combined bias summary */}
        <View style={[styles.biasCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>MARKET SUMMARY</Text>
          <View style={styles.biasRow}>
            <View style={styles.biasPart}>
              <Text style={[styles.biasKey, { color: colors.mutedForeground }]}>Funding</Text>
              <DirectionBadge label={foData.fundingBias} colors={colors} />
            </View>
            <View style={[styles.biasDivider, { backgroundColor: colors.border }]} />
            <View style={styles.biasPart}>
              <Text style={[styles.biasKey, { color: colors.mutedForeground }]}>OI Bias</Text>
              <DirectionBadge label={foData.oiBias} colors={colors} />
            </View>
            <View style={[styles.biasDivider, { backgroundColor: colors.border }]} />
            <View style={styles.biasPart}>
              <Text style={[styles.biasKey, { color: colors.mutedForeground }]}>Combined</Text>
              <DirectionBadge label={foData.combinedBias} colors={colors} />
            </View>
          </View>
          <View style={[styles.sentBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.sentText, { color: colors.secondaryForeground }]}>{foData.overallSentiment}</Text>
          </View>
        </View>

        {/* Funding Rate card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>FUNDING RATE</Text>
            <TrendBadge label={foData.fundingTrend} colors={colors} />
          </View>

          <View style={styles.bigNumRow}>
            <Text style={[styles.bigNum, { color: frColor }]}>{fmtFR(foData.currentFundingRate)}</Text>
            <DirectionBadge label={foData.fundingDirection} colors={colors} />
          </View>

          <View style={styles.metaBlock}>
            <MetaRow label="Annualized Rate"
              value={`${(foData.currentFundingRate * 100 * 3 * 365).toFixed(2)}% / yr`}
              colors={colors} />
            <MetaRow label="Next Funding In"
              value={fmtCountdown(foData.nextFundingTime)}
              colors={colors} />
            <MetaRow label="Next Funding At"
              value={fmtTime(foData.nextFundingTime)}
              colors={colors} />
          </View>

          {/* Interpretation */}
          <View style={[styles.interpBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.interpTitle, { color: colors.mutedForeground }]}>INTERPRETATION</Text>
            <Text style={[styles.interpText, { color: colors.secondaryForeground }]}>
              {foData.currentFundingRate < -0.0002
                ? "Funding is strongly negative — short sellers are paying a premium to hold positions. This is often a bullish contrarian signal as shorts may be squeezed."
                : foData.currentFundingRate < 0
                ? "Negative funding: shorts are paying longs. Market is positioned short-heavy, which can fuel upward pressure."
                : foData.currentFundingRate > 0.0002
                ? "Funding is strongly positive — long holders are paying. Market is over-levered to the upside, increasing risk of a flush."
                : foData.currentFundingRate > 0
                ? "Positive funding: longs are paying shorts. Moderate long bias in the market."
                : "Funding is near zero — market is neutrally positioned with no significant imbalance."}
            </Text>
          </View>
        </View>

        {/* Funding chart */}
        {foData.fundingHistory.length > 1 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>FUNDING RATE HISTORY</Text>
            <FundingLineChart data={foData.fundingHistory} width={chartWidth} colors={colors} />
            {/* Funding history table (last 5) */}
            <View style={[styles.histTable, { borderColor: colors.border }]}>
              {foData.fundingHistory.slice(-5).reverse().map((pt, i) => {
                const c = pt.rate < 0 ? colors.up : pt.rate > 0 ? colors.down : colors.mutedForeground;
                return (
                  <View key={i} style={[styles.histRow, { borderColor: colors.border }]}>
                    <Text style={[styles.histTime, { color: colors.mutedForeground }]}>{fmtTime(pt.time)}</Text>
                    <Text style={[styles.histVal, { color: c }]}>{fmtFR(pt.rate)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Open Interest card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>OPEN INTEREST</Text>
            <TrendBadge label={foData.oiTrend} colors={colors} />
          </View>

          <View style={styles.bigNumRow}>
            <Text style={[styles.bigNum, { color: colors.foreground }]}>{fmtOI(foData.currentOI, coin.ticker)}</Text>
            {foData.oiChange !== 0 && (
              <Text style={[styles.oiChg, { color: oiChgColor }]}>
                {foData.oiChange >= 0 ? "+" : ""}{foData.oiChange.toFixed(2)}%
              </Text>
            )}
          </View>

          {foData.currentOI > 0 && (
            <View style={styles.metaBlock}>
              <MetaRow label="OI Change"
                value={`${foData.oiChange >= 0 ? "+" : ""}${foData.oiChange.toFixed(2)}%`}
                valueColor={oiChgColor}
                colors={colors} />
              <MetaRow label="OI Trend" value={foData.oiTrend} colors={colors} />
            </View>
          )}

          <View style={[styles.interpBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.interpTitle, { color: colors.mutedForeground }]}>INTERPRETATION</Text>
            <Text style={[styles.interpText, { color: colors.secondaryForeground }]}>
              {foData.oiTrend === "Rising"
                ? "Rising open interest confirms new money entering the market. Combined with price direction, it shows whether trend continuation or reversal is more likely."
                : foData.oiTrend === "Falling"
                ? "Falling open interest means positions are closing. This reduces conviction in the current move — watch for exhaustion."
                : "Open interest is stable. Market participants are holding current positions without significant new entries or exits."}
            </Text>
          </View>
        </View>

        {/* OI chart */}
        {foData.oiHistory.length > 1 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>OPEN INTEREST HISTORY</Text>
            <OILineChart data={foData.oiHistory} width={chartWidth} colors={colors} />
          </View>
        )}

        {/* Market interpretation */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>MARKET INTERPRETATION</Text>
          <View style={[styles.interpHeadRow]}>
            <Text style={[styles.interpHeadText, { color: colors.foreground }]}>{foData.marketInterpretation}</Text>
          </View>
          <Text style={[styles.interpText, { color: colors.secondaryForeground }]}>{foData.marketDetail}</Text>

          {/* Scenario reference */}
          <View style={[styles.scenarioGrid, { borderColor: colors.border }]}>
            {[
              { oi: "Rising OI",  price: "Rising Price",  result: "Bullish Continuation", c: colors.up },
              { oi: "Rising OI",  price: "Falling Price", result: "Bearish Continuation", c: colors.down },
              { oi: "Falling OI", price: "Rising Price",  result: "Weak Bullish (Short Cover)", c: colors.wait },
              { oi: "Falling OI", price: "Falling Price", result: "Weak Bearish (Long Liq.)", c: colors.wait },
            ].map((s, i) => (
              <View key={i} style={[styles.scenRow, { borderColor: colors.border }]}>
                <Text style={[styles.scenCondition, { color: colors.mutedForeground }]}>{s.oi} + {s.price}</Text>
                <Text style={[styles.scenResult, { color: s.c }]}>→ {s.result}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Market Participation Score */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>MARKET PARTICIPATION</Text>
            <View style={[styles.partBadge, { backgroundColor: participationColor + "20", borderColor: participationColor + "60" }]}>
              <Text style={[styles.partBadgeText, { color: participationColor }]}>{foData.participationLevel}</Text>
            </View>
          </View>

          <View style={styles.scoreRow}>
            <Text style={[styles.scoreNum, { color: participationColor }]}>{foData.participationScore}</Text>
            <View style={styles.scoreBarWrap}>
              <View style={[styles.scoreTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.scoreFill, { width: `${foData.participationScore}%` as unknown as number, backgroundColor: participationColor }]} />
              </View>
              <View style={styles.scoreLabelRow}>
                <Text style={[styles.scoreLabelText, { color: colors.mutedForeground }]}>Low</Text>
                <Text style={[styles.scoreLabelText, { color: colors.mutedForeground }]}>Moderate</Text>
                <Text style={[styles.scoreLabelText, { color: colors.mutedForeground }]}>High</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.interpText, { color: colors.secondaryForeground }]}>
            {foData.participationLevel === "High"
              ? "High market participation — significant position changes are occurring. Volume and OI suggest strong institutional or leveraged trader activity."
              : foData.participationLevel === "Moderate"
              ? "Moderate participation — normal trading activity with some directional conviction. OI changes suggest active positioning."
              : "Low participation — minimal new positions being opened. Market is in a low-volume consolidation or accumulation phase."}
          </Text>
        </View>

        <Text style={[styles.disc, { color: colors.mutedForeground }]}>
          Not financial advice · For informational use only
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  header:  { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title:   { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle:{ fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },

  sec: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },

  biasCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  biasRow:  { flexDirection: "row", alignItems: "center" },
  biasPart: { flex: 1, alignItems: "center", gap: 6 },
  biasKey:  { fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase" },
  biasDivider: { width: 1, height: 36 },
  sentBox:  { borderRadius: 8, borderWidth: 1, padding: 10 },
  sentText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 19 },

  card:       { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  bigNumRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bigNum:    { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  oiChg:     { fontSize: 16, fontFamily: "Inter_600SemiBold" },

  metaBlock: { gap: 0 },

  interpBox:   { borderRadius: 8, borderWidth: 1, padding: 10, gap: 4 },
  interpTitle: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  interpText:  { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 19 },
  interpHeadRow: { },
  interpHeadText: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },

  histTable: { borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  histRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1 },
  histTime:  { fontSize: 11, fontFamily: "Inter_400Regular" },
  histVal:   { fontSize: 11, fontFamily: "Inter_700Bold" },

  scenarioGrid: { borderRadius: 8, borderWidth: 1, overflow: "hidden", gap: 0 },
  scenRow:      { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, gap: 2 },
  scenCondition:{ fontSize: 11, fontFamily: "Inter_400Regular" },
  scenResult:   { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  partBadge:     { borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 3 },
  partBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  scoreRow:      { flexDirection: "row", alignItems: "center", gap: 12 },
  scoreNum:      { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1, width: 54 },
  scoreBarWrap:  { flex: 1, gap: 4 },
  scoreTrack:    { height: 8, borderRadius: 4, overflow: "hidden" },
  scoreFill:     { height: 8, borderRadius: 4 },
  scoreLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  scoreLabelText:{ fontSize: 9, fontFamily: "Inter_400Regular" },

  disc: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 2 },
});
