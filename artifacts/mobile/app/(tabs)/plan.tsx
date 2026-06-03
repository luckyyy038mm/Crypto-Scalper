import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HamburgerButton from "@/components/HamburgerButton";
import ProbabilityCard from "@/components/ProbabilityCard";
import { useTradingData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";
import type { Signal } from "@/hooks/useSignal";

const fmt2 = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getRiskLevel(confidence: number, signal: Signal): { label: string; color: string; description: string } {
  if (signal === "WAIT") return { label: "High", color: "#FF4757", description: "No active signal — entering now carries elevated risk without confirmation." };
  if (confidence >= 75) return { label: "Low", color: "#00E599", description: "High-conviction setup with strong factor alignment. Risk is well-defined." };
  if (confidence >= 50) return { label: "Medium", color: "#FFC107", description: "Moderate-quality setup. Use tighter position sizing and watch for confirmation." };
  return { label: "High", color: "#FF4757", description: "Weak signal quality. Consider waiting for stronger confluence before entering." };
}

function LevelRow({ label, value, pct, isStop, isMuted, colors }: {
  label: string; value: number; pct?: number; isStop?: boolean; isMuted?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const c = isMuted ? colors.mutedForeground : isStop ? colors.down : colors.up;
  return (
    <View style={styles.lvRow}>
      <Text style={[styles.lvKey, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.lvRight}>
        {pct !== undefined && (
          <Text style={[styles.lvPct, { color: c }]}>
            {isStop ? "▼" : "▲"} {pct.toFixed(2)}%
          </Text>
        )}
        <Text style={[styles.lvVal, { color: c }]}>${fmt2(value)}</Text>
      </View>
    </View>
  );
}

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const [showExpl, setShowExpl] = useState(false);
  const { analysis, probability } = useTradingData();
  const { signal, entry, reasoning, traderExplanation, qualityLabel, totalScore, maxTotalScore } = analysis;

  const confidence = Math.round((Math.abs(totalScore) / maxTotalScore) * 100);
  const risk = getRiskLevel(confidence, signal);
  const sigColor = signal === "LONG" ? colors.long : signal === "SHORT" ? colors.short : colors.wait;
  const sigBg = signal === "LONG" ? colors.longBg : signal === "SHORT" ? colors.shortBg : colors.waitBg;
  const icon = signal === "LONG" ? "trending-up" : signal === "SHORT" ? "trending-down" : "minus";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <HamburgerButton />
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Trade Plan</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Execution levels based on live ATR
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Signal direction card */}
        <View style={[styles.dirCard, { backgroundColor: sigBg, borderColor: sigColor }]}>
          <View style={styles.dirRow}>
            <Feather name={icon} size={24} color={sigColor} />
            <View style={styles.dirMid}>
              <Text style={[styles.dirSignal, { color: sigColor }]}>{signal}</Text>
              <Text style={[styles.dirQuality, { color: colors.secondaryForeground }]}>{qualityLabel}</Text>
            </View>
            <View style={[styles.dirBadge, { borderColor: sigColor + "60" }]}>
              <Text style={[styles.dirBadgeText, { color: sigColor }]}>{totalScore > 0 ? "+" : ""}{totalScore}/{maxTotalScore}</Text>
            </View>
          </View>
          {!!reasoning && (
            <Text style={[styles.dirReason, { color: colors.secondaryForeground }]}>{reasoning}</Text>
          )}
        </View>

        {/* Trade Probability Engine — placed prominently after signal */}
        <ProbabilityCard probability={probability} />

        {/* Risk level */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.riskTop}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>RISK LEVEL</Text>
            <View style={[styles.riskBadge, { backgroundColor: risk.color + "20", borderColor: risk.color + "60" }]}>
              <Text style={[styles.riskLabel, { color: risk.color }]}>{risk.label}</Text>
            </View>
          </View>
          <Text style={[styles.riskDesc, { color: colors.secondaryForeground }]}>{risk.description}</Text>
        </View>

        {/* Entry analysis */}
        {entry ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.entryHead}>
              <Text style={[styles.sec, { color: colors.mutedForeground }]}>ENTRY ANALYSIS</Text>
              {entry.isHypothetical && (
                <View style={[styles.hypoBadge, { borderColor: colors.wait + "50" }]}>
                  <Text style={[styles.hypoText, { color: colors.wait }]}>HYPOTHETICAL</Text>
                </View>
              )}
            </View>

            <View style={[styles.zoneBox, { backgroundColor: sigColor + "10", borderColor: sigColor + "30" }]}>
              <Text style={[styles.zoneKey, { color: colors.mutedForeground }]}>Entry Zone</Text>
              <Text style={[styles.zoneVal, { color: sigColor }]}>${fmt2(entry.entryLow)} – ${fmt2(entry.entryHigh)}</Text>
            </View>

            <View style={[styles.lvTable, { borderColor: colors.border }]}>
              <LevelRow label="Stop Loss" value={entry.stopLoss} pct={entry.riskPct} isStop colors={colors} isMuted={entry.isHypothetical} />
              <View style={[styles.thin, { backgroundColor: colors.border }]} />
              <LevelRow label="Take Profit 1" value={entry.takeProfit1} pct={entry.tp1Pct} colors={colors} isMuted={entry.isHypothetical} />
              <View style={[styles.thin, { backgroundColor: colors.border }]} />
              <LevelRow label="Take Profit 2" value={entry.takeProfit2} pct={entry.tp2Pct} colors={colors} isMuted={entry.isHypothetical} />
              <View style={[styles.thin, { backgroundColor: colors.border }]} />
              <LevelRow label="Take Profit 3" value={entry.takeProfit3} pct={entry.tp3Pct} colors={colors} isMuted={entry.isHypothetical} />
            </View>

            <View style={styles.metaGrid}>
              {[
                { k: "Risk / Reward", v: entry.rrLabel },
                { k: "Setup Quality", v: entry.expectedQuality },
                { k: "Est. Window",   v: entry.setupWindow },
              ].map((m) => (
                <View key={m.k} style={[styles.metaItem, { borderColor: colors.border }]}>
                  <Text style={[styles.metaKey, { color: colors.mutedForeground }]}>{m.k}</Text>
                  <Text style={[styles.metaVal, { color: colors.foreground }]}>{m.v}</Text>
                </View>
              ))}
            </View>

            <Pressable style={styles.explBtn} onPress={() => setShowExpl(!showExpl)}>
              <Feather name="info" size={12} color={colors.mutedForeground} />
              <Text style={[styles.explBtnText, { color: colors.mutedForeground }]}>Why these levels?</Text>
              <Feather name={showExpl ? "chevron-up" : "chevron-down"} size={12} color={colors.mutedForeground} />
            </Pressable>
            {showExpl && (
              <Text style={[styles.explText, { color: colors.secondaryForeground }]}>{entry.entryExplanation}</Text>
            )}
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, alignItems: "center", paddingVertical: 24 }]}>
            <Text style={[styles.dimText, { color: colors.mutedForeground }]}>Calculating entry levels…</Text>
          </View>
        )}

        {/* Full explanation */}
        {!!traderExplanation && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>TRADE REASONING</Text>
            {traderExplanation.split("\n\n").map((para, i) => (
              <Text key={i} style={[styles.para, { color: colors.secondaryForeground }]}>{para}</Text>
            ))}
          </View>
        )}

        <Text style={[styles.disc, { color: colors.mutedForeground }]}>Not financial advice · For informational use only</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  sec: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  thin: { height: 1 },

  dirCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  dirRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dirMid: { flex: 1, gap: 2 },
  dirSignal: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  dirQuality: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dirBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  dirBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  dirReason: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },

  riskTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  riskBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  riskLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  riskDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },

  entryHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hypoBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  hypoText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  zoneBox: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  zoneKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  zoneVal: { fontSize: 13, fontFamily: "Inter_700Bold" },
  lvTable: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  lvRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9 },
  lvKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  lvRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  lvPct: { fontSize: 11, fontFamily: "Inter_500Medium" },
  lvVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  metaGrid: { gap: 0 },
  metaItem: { paddingVertical: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1 },
  metaKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaVal: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  explBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  explBtnText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  explText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 19 },
  para: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 21 },
  dimText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  disc: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 2 },
});
