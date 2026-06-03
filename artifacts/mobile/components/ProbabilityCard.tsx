import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { ProbabilityResult } from "@/hooks/useProbabilityEngine";

interface Props {
  probability: ProbabilityResult;
}

function Bar({ value, color, track }: { value: number; color: string; track: string }) {
  return (
    <View style={[barStyles.track, { backgroundColor: track }]}>
      <View style={[barStyles.fill, { width: `${Math.min(100, value)}%` as unknown as number, backgroundColor: color }]} />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: { flex: 1, height: 6, borderRadius: 4, overflow: "hidden" },
  fill:  { height: 6, borderRadius: 4 },
});

export default function ProbabilityCard({ probability: p }: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  if (!p.ready) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sec, { color: colors.mutedForeground }]}>PROBABILITY ENGINE</Text>
        <Text style={[styles.dim, { color: colors.mutedForeground }]}>Computing setup probability…</Text>
      </View>
    );
  }

  /* Colors --------------------------------------------------------- */
  const dirColor =
    p.direction === "LONG"  ? colors.long  :
    p.direction === "SHORT" ? colors.short : colors.wait;
  const dirBg =
    p.direction === "LONG"  ? colors.longBg  :
    p.direction === "SHORT" ? colors.shortBg : colors.waitBg;

  const probColor =
    p.probability >= 62 ? colors.up   :
    p.probability >= 42 ? colors.wait : colors.down;

  const riskColor =
    p.riskLevel === "Low"    ? colors.up   :
    p.riskLevel === "Medium" ? colors.wait : colors.down;

  const dirIcon = p.direction === "LONG" ? "trending-up" : p.direction === "SHORT" ? "trending-down" : "minus";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>

      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.sec, { color: colors.mutedForeground }]}>PROBABILITY ENGINE</Text>
        <View style={[styles.dirBadge, { backgroundColor: dirBg, borderColor: dirColor + "70" }]}>
          <Feather name={dirIcon} size={10} color={dirColor} />
          <Text style={[styles.dirBadgeText, { color: dirColor }]}>{p.direction}</Text>
        </View>
      </View>

      {/* Big probability display */}
      <View style={styles.probRow}>
        <View style={styles.probLeft}>
          <Text style={[styles.probNum, { color: probColor }]}>{p.probability}%</Text>
          <Text style={[styles.probSub, { color: colors.mutedForeground }]}>Probability of Success</Text>
          <View style={styles.probBarRow}>
            <Bar value={p.probability} color={probColor} track={colors.border} />
            <Text style={[styles.probBarPct, { color: colors.mutedForeground }]}>{p.probability}%</Text>
          </View>
        </View>
      </View>

      {/* Stat row: Risk · Quality · Hold Time */}
      <View style={[styles.statRow, { borderColor: colors.border }]}>
        <View style={styles.statCell}>
          <Text style={[styles.statKey, { color: colors.mutedForeground }]}>RISK LEVEL</Text>
          <View style={[styles.statBadge, { backgroundColor: riskColor + "18", borderColor: riskColor + "55" }]}>
            <Text style={[styles.statBadgeText, { color: riskColor }]}>{p.riskLevel}</Text>
          </View>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statCell}>
          <Text style={[styles.statKey, { color: colors.mutedForeground }]}>QUALITY</Text>
          <Text style={[styles.statVal, { color: colors.foreground }]}>{p.setupQuality}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statCell}>
          <Text style={[styles.statKey, { color: colors.mutedForeground }]}>HOLD TIME</Text>
          <Text style={[styles.statVal, { color: colors.foreground }]} numberOfLines={1}>{p.holdTime}</Text>
        </View>
      </View>

      {/* Confluence + Readiness */}
      <View style={styles.metricsBlock}>
        <View style={styles.metricRow}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>CONFLUENCE</Text>
          <Bar value={(p.confluenceScore / p.totalConditions) * 100} color={probColor} track={colors.border} />
          <Text style={[styles.metricRight, { color: probColor }]}>
            {p.confluenceScore} of {p.totalConditions}
          </Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>READINESS</Text>
          <Bar value={p.readiness} color={dirColor} track={colors.border} />
          <Text style={[styles.metricRight, { color: dirColor }]}>{p.readiness}%</Text>
        </View>
      </View>

      {/* Setup Readiness meter — per condition */}
      <View style={styles.metricsBlock}>
        <Text style={[styles.sec, { color: colors.mutedForeground }]}>SETUP READINESS METER</Text>
        {p.conditions.map((cond) => (
          <View key={cond.name} style={styles.condMeterRow}>
            <View style={[styles.condDot, { backgroundColor: cond.met ? probColor : colors.border }]} />
            <Text style={[styles.condMeterName, { color: cond.met ? colors.foreground : colors.mutedForeground }]}>
              {cond.name}
            </Text>
            <View style={[styles.condMeterTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.condMeterFill, { width: cond.met ? "100%" : "0%", backgroundColor: cond.met ? probColor : "transparent" }]} />
            </View>
          </View>
        ))}
      </View>

      {/* Expandable: full conditions + explanation */}
      <Pressable style={styles.expandBtn} onPress={() => setExpanded(!expanded)}>
        <Text style={[styles.expandLabel, { color: colors.mutedForeground }]}>
          {expanded ? "Hide" : "Show"} conditions &amp; explanation
        </Text>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={13} color={colors.mutedForeground} />
      </Pressable>

      {expanded && (
        <>
          {/* Conditions checklist */}
          <View style={[styles.condList, { borderColor: colors.border }]}>
            {p.conditions.map((cond, i) => (
              <View key={cond.name}>
                {i > 0 && <View style={[styles.condDivider, { backgroundColor: colors.border }]} />}
                <View style={styles.condRow}>
                  <View style={[styles.condIconBox, {
                    backgroundColor: cond.met ? probColor + "18" : colors.border + "30",
                  }]}>
                    <Feather
                      name={cond.met ? "check" : "x"}
                      size={11}
                      color={cond.met ? probColor : colors.mutedForeground}
                    />
                  </View>
                  <View style={styles.condText}>
                    <Text style={[styles.condName, { color: cond.met ? colors.foreground : colors.secondaryForeground }]}>
                      {cond.name}
                    </Text>
                    <Text style={[styles.condDetail, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {cond.detail}
                    </Text>
                  </View>
                  <Text style={[styles.condWeight, { color: cond.met ? probColor : colors.mutedForeground }]}>
                    +{cond.weight}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Why this probability */}
          {p.explanation.length > 0 && (
            <View style={[styles.explBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.explTitle, { color: colors.mutedForeground }]}>
                WHY {p.probability}%?
              </Text>
              {p.explanation.map((line, i) => (
                <View key={i} style={styles.explLine}>
                  <Text style={[styles.bullet, { color: probColor }]}>•</Text>
                  <Text style={[styles.explText, { color: colors.secondaryForeground }]}>{line}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },

  sec: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  dim: { fontSize: 13, fontFamily: "Inter_400Regular" },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dirBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  dirBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },

  probRow: { flexDirection: "row", alignItems: "center" },
  probLeft: { flex: 1, gap: 4 },
  probNum: { fontSize: 46, fontFamily: "Inter_700Bold", letterSpacing: -2 },
  probSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: -4 },
  probBarRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  probBarPct: { fontSize: 10, fontFamily: "Inter_400Regular", width: 28, textAlign: "right" },

  statRow: { flexDirection: "row", borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 4, gap: 5 },
  statDivider: { width: 1 },
  statKey: { fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2, textTransform: "uppercase" },
  statBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  statVal: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },

  metricsBlock: { gap: 8 },
  metricRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metricLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1, width: 80 },
  metricRight: { fontSize: 11, fontFamily: "Inter_700Bold", width: 40, textAlign: "right" },

  condMeterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  condDot: { width: 6, height: 6, borderRadius: 3 },
  condMeterName: { fontSize: 11, fontFamily: "Inter_400Regular", width: 130 },
  condMeterTrack: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  condMeterFill: { height: 4, borderRadius: 2 },

  expandBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 2 },
  expandLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },

  condList: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  condRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  condDivider: { height: 1 },
  condIconBox: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 1 },
  condText: { flex: 1, gap: 2 },
  condName: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  condDetail: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  condWeight: { fontSize: 11, fontFamily: "Inter_700Bold", width: 26, textAlign: "right" },

  explBox: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 6 },
  explTitle: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 2 },
  explLine: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bullet: { fontSize: 14, lineHeight: 18, fontFamily: "Inter_700Bold" },
  explText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
