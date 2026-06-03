import React from "react";
import { Platform, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HamburgerButton from "@/components/HamburgerButton";
import MarketStructureCard from "@/components/MarketStructureCard";
import { useTradingData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";
import type { FactorScore } from "@/hooks/useSignal";

function PageHeader({ title, colors }: { title: string; colors: ReturnType<typeof useColors> }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 60 : insets.top;
  return (
    <View style={[styles.pageHeader, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
      <HamburgerButton />
      <Text style={[styles.pageTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

function ConfluenceCard({ colors, analysis }: { colors: ReturnType<typeof useColors>; analysis: ReturnType<typeof useTradingData>["analysis"] }) {
  const { signal, factors, totalScore, maxTotalScore, qualityLabel, marketBias } = analysis;
  const confidence = Math.round((Math.abs(totalScore) / maxTotalScore) * 100);
  const sigColor = signal === "LONG" ? colors.long : signal === "SHORT" ? colors.short : colors.wait;
  const biasColor = marketBias === "Bullish" ? colors.up : marketBias === "Bearish" ? colors.down : colors.mutedForeground;

  const aligned = factors.filter((f) =>
    signal === "LONG" ? f.sentiment === "bullish" :
    signal === "SHORT" ? f.sentiment === "bearish" :
    marketBias === "Bullish" ? f.sentiment === "bullish" : f.sentiment === "bearish",
  ).length;
  const confluenceScore = factors.length ? Math.round((aligned / factors.length) * 100) : 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.sec, { color: colors.mutedForeground }]}>CONFLUENCE SCORE</Text>
      <View style={styles.confRow}>
        <View style={styles.confLeft}>
          <Text style={[styles.confPct, { color: sigColor }]}>{confluenceScore}%</Text>
          <Text style={[styles.confLbl, { color: colors.secondaryForeground }]}>
            {aligned} of {factors.length} factors aligned
          </Text>
        </View>
        <View style={styles.confRight}>
          <View style={[styles.confBadge, { backgroundColor: sigColor + "20", borderColor: sigColor + "50" }]}>
            <Text style={[styles.confBadgeText, { color: sigColor }]}>{qualityLabel}</Text>
          </View>
          <View style={[styles.confBias, { borderColor: biasColor + "50" }]}>
            <Text style={[styles.confBiasText, { color: biasColor }]}>Bias: {marketBias}</Text>
          </View>
        </View>
      </View>
      <View style={[styles.bigBarTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.bigBarFill, { width: `${confluenceScore}%` as unknown as number, backgroundColor: sigColor }]} />
      </View>
      <View style={styles.confMeta}>
        <Text style={[styles.confMetaText, { color: colors.mutedForeground }]}>Signal confidence: {confidence}%</Text>
        <Text style={[styles.confMetaText, { color: colors.mutedForeground }]}>Score: {totalScore > 0 ? "+" : ""}{totalScore} / {maxTotalScore}</Text>
      </View>
    </View>
  );
}

function FactorBreakdownCard({ factors, colors }: { factors: FactorScore[]; colors: ReturnType<typeof useColors> }) {
  if (!factors.length) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.sec, { color: colors.mutedForeground }]}>SIGNAL BREAKDOWN</Text>
      {factors.map((f, i) => {
        const c = f.sentiment === "bullish" ? colors.up : f.sentiment === "bearish" ? colors.down : colors.mutedForeground;
        const pct = Math.abs(f.score) / f.maxScore;
        return (
          <React.Fragment key={f.shortName}>
            <View style={styles.factorRow}>
              <View style={styles.factorTop}>
                <View style={styles.factorLeft}>
                  <Text style={[styles.factorName, { color: colors.foreground }]}>{f.name}</Text>
                  <Text style={[styles.factorReason, { color: colors.mutedForeground }]}>{f.reason}</Text>
                </View>
                <View style={styles.factorRight}>
                  <Text style={[styles.factorLabel, { color: c }]}>{f.label}</Text>
                  <Text style={[styles.factorScore, { color: c }]}>{f.score > 0 ? "+" : ""}{f.score}</Text>
                </View>
              </View>
              <View style={[styles.scoreTrack, { backgroundColor: colors.border }]}>
                <View style={styles.scoreMid} />
                {f.score < 0 && <View style={[styles.scoreFillL, { width: `${pct * 50}%` as unknown as number, backgroundColor: c }]} />}
                {f.score > 0 && <View style={[styles.scoreFillR, { width: `${pct * 50}%` as unknown as number, backgroundColor: c }]} />}
              </View>
            </View>
            {i < factors.length - 1 && <View style={[styles.thin, { backgroundColor: colors.border }]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function ReasonsCard({ analysis, colors }: { analysis: ReturnType<typeof useTradingData>["analysis"]; colors: ReturnType<typeof useColors> }) {
  const { reasons, traderExplanation, reasoning } = analysis;
  if (!reasoning) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.sec, { color: colors.mutedForeground }]}>DETAILED REASONING</Text>
      {traderExplanation.split("\n\n").map((para, i) => (
        <Text key={i} style={[styles.para, { color: colors.secondaryForeground }]}>{para}</Text>
      ))}
      {reasons.length > 0 && (
        <>
          <View style={[styles.thin, { backgroundColor: colors.border }]} />
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>FACTOR REASONS</Text>
          {reasons.map((r, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: colors.mutedForeground }]}>•</Text>
              <Text style={[styles.bulletText, { color: colors.secondaryForeground }]}>{r}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

export default function AnalysisScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { analysis, ms } = useTradingData();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <PageHeader title="Analysis" colors={colors} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        <ConfluenceCard colors={colors} analysis={analysis} />
        <FactorBreakdownCard factors={analysis.factors} colors={colors} />
        <Text style={[styles.sec, { color: colors.mutedForeground }]}>MARKET STRUCTURE</Text>
        <MarketStructureCard ms={ms} />
        <ReasonsCard analysis={analysis} colors={colors} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageHeader: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  pageTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  sec: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  thin: { height: 1 },

  confRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  confLeft: { gap: 4 },
  confPct: { fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  confLbl: { fontSize: 12, fontFamily: "Inter_400Regular" },
  confRight: { gap: 6, alignItems: "flex-end" },
  confBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  confBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  confBias: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  confBiasText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  bigBarTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  bigBarFill: { height: 6, borderRadius: 3 },
  confMeta: { flexDirection: "row", justifyContent: "space-between" },
  confMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  factorRow: { gap: 8, paddingVertical: 4 },
  factorTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  factorLeft: { flex: 1, gap: 2, marginRight: 8 },
  factorName: { fontSize: 13, fontFamily: "Inter_500Medium" },
  factorReason: { fontSize: 11, fontFamily: "Inter_400Regular" },
  factorRight: { alignItems: "flex-end", gap: 2 },
  factorLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  factorScore: { fontSize: 15, fontFamily: "Inter_700Bold" },
  scoreTrack: { height: 5, borderRadius: 3, overflow: "hidden", position: "relative" },
  scoreMid: { position: "absolute", left: "50%" as unknown as number, top: 0, width: 1, height: 5, backgroundColor: "rgba(255,255,255,0.15)", zIndex: 1 },
  scoreFillL: { position: "absolute", right: "50%" as unknown as number, top: 0, height: 5, borderRadius: 3, opacity: 0.85 },
  scoreFillR: { position: "absolute", left: "50%" as unknown as number, top: 0, height: 5, borderRadius: 3, opacity: 0.85 },

  para: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bulletRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  bullet: { fontSize: 14, lineHeight: 20 },
  bulletText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, flex: 1 },
});
