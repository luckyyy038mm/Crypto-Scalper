import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { SetupTriggers, Signal, TriggerCondition } from "@/hooks/useSignal";

interface Props {
  signal: Signal;
  triggers: SetupTriggers;
}

/* ── ReadinessBar ───────────────────────────────────────────────── */
function ReadinessBar({
  label,
  readiness,
  met,
  total,
  barColor,
  colors,
}: {
  label: string;
  readiness: number;
  met: number;
  total: number;
  barColor: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.readinessRow}>
      <View style={styles.readinessMeta}>
        <Text style={[styles.readinessLabel, { color: barColor }]}>{label}</Text>
        <View style={styles.readinessRight}>
          <Text style={[styles.readinessPct, { color: barColor }]}>{readiness}%</Text>
          <Text style={[styles.readinessCount, { color: colors.mutedForeground }]}>
            {met} of {total} met
          </Text>
        </View>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.barFill,
            {
              backgroundColor: barColor,
              width: `${readiness}%` as unknown as number,
              opacity: readiness === 0 ? 0 : 1,
            },
          ]}
        />
      </View>
    </View>
  );
}

/* ── ConditionRow ───────────────────────────────────────────────── */
function ConditionRow({
  condition,
  colors,
}: {
  condition: TriggerCondition;
  colors: ReturnType<typeof useColors>;
}) {
  const statusColor = condition.met ? colors.up : colors.down;
  const statusIcon = condition.met ? "✓" : "✗";
  const statusLabel = condition.met ? "Met" : "Not Met";

  return (
    <View style={[styles.conditionCard, { backgroundColor: condition.met ? colors.up + "08" : colors.down + "06", borderColor: condition.met ? colors.up + "30" : colors.border }]}>
      {/* Top row: name + status */}
      <View style={styles.conditionTop}>
        <Text style={[styles.conditionName, { color: colors.foreground }]}>{condition.name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18", borderColor: statusColor + "50" }]}>
          <Text style={[styles.statusIcon, { color: statusColor }]}>{statusIcon}</Text>
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Bottom row: current → required */}
      <View style={styles.valuesRow}>
        <View style={styles.valueItem}>
          <Text style={[styles.valueKey, { color: colors.mutedForeground }]}>Current</Text>
          <Text style={[styles.valueVal, { color: colors.secondaryForeground }]}>{condition.currentValue}</Text>
        </View>
        <Text style={[styles.arrow, { color: colors.mutedForeground }]}>→</Text>
        <View style={styles.valueItem}>
          <Text style={[styles.valueKey, { color: colors.mutedForeground }]}>Required</Text>
          <Text style={[styles.valueVal, { color: colors.secondaryForeground }]}>{condition.targetValue}</Text>
        </View>
      </View>
    </View>
  );
}

/* ── TriggerSection ─────────────────────────────────────────────── */
function TriggerSection({
  label,
  conditions,
  sigColor,
  colors,
  expanded,
  onToggle,
}: {
  label: string;
  conditions: TriggerCondition[];
  sigColor: string;
  colors: ReturnType<typeof useColors>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.triggerSection}>
      <Pressable style={styles.triggerHeader} onPress={onToggle}>
        <View style={[styles.triggerHeaderBadge, { backgroundColor: sigColor + "15", borderColor: sigColor + "50" }]}>
          <Text style={[styles.triggerHeaderText, { color: sigColor }]}>→ {label}</Text>
        </View>
        <Text style={[styles.chevron, { color: colors.mutedForeground }]}>{expanded ? "▲" : "▼"}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.conditionList}>
          {conditions.map((c, i) => (
            <ConditionRow key={i} condition={c} colors={colors} />
          ))}
        </View>
      )}
    </View>
  );
}

/* ── SetupTriggersCard ──────────────────────────────────────────── */
export default function SetupTriggersCard({ signal, triggers }: Props) {
  const colors = useColors();
  const [longExpanded, setLongExpanded] = useState(true);
  const [shortExpanded, setShortExpanded] = useState(true);

  if (!triggers.longTriggers.length && !triggers.shortTriggers.length) return null;

  const sigStatusColor =
    signal === "LONG" ? colors.long : signal === "SHORT" ? colors.short : colors.wait;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.mutedForeground }]}>SETUP TRIGGERS</Text>
        <View style={[styles.currentBadge, { borderColor: sigStatusColor + "50" }]}>
          <Text style={[styles.currentText, { color: sigStatusColor }]}>
            Current: {signal}
          </Text>
        </View>
      </View>

      {/* Readiness bars */}
      <View style={[styles.readinessBlock, { borderColor: colors.border }]}>
        <ReadinessBar
          label="LONG Readiness"
          readiness={triggers.longReadiness}
          met={triggers.longMet}
          total={triggers.totalConditions}
          barColor={colors.up}
          colors={colors}
        />
        <View style={[styles.thin, { backgroundColor: colors.border }]} />
        <ReadinessBar
          label="SHORT Readiness"
          readiness={triggers.shortReadiness}
          met={triggers.shortMet}
          total={triggers.totalConditions}
          barColor={colors.down}
          colors={colors}
        />
      </View>

      {/* LONG conditions */}
      <TriggerSection
        label="LONG requires"
        conditions={triggers.longTriggers}
        sigColor={colors.long}
        colors={colors}
        expanded={longExpanded}
        onToggle={() => setLongExpanded((v) => !v)}
      />

      {/* SHORT conditions */}
      <TriggerSection
        label="SHORT requires"
        conditions={triggers.shortTriggers}
        sigColor={colors.short}
        colors={colors}
        expanded={shortExpanded}
        onToggle={() => setShortExpanded((v) => !v)}
      />
    </View>
  );
}

/* ── styles ─────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  currentBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  currentText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },

  readinessBlock: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 10 },
  readinessRow: { gap: 6 },
  readinessMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  readinessLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  readinessRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  readinessPct: { fontSize: 14, fontFamily: "Inter_700Bold" },
  readinessCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  barTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 5, borderRadius: 3 },
  thin: { height: 1 },

  triggerSection: { gap: 8 },
  triggerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  triggerHeaderBadge: {
    borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5,
  },
  triggerHeaderText: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  chevron: { fontSize: 10, fontFamily: "Inter_500Medium" },

  conditionList: { gap: 6 },
  conditionCard: {
    borderRadius: 10, borderWidth: 1, padding: 10, gap: 7,
  },
  conditionTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  conditionName: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1, marginRight: 8 },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0,
  },
  statusIcon: { fontSize: 11, fontFamily: "Inter_700Bold" },
  statusLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },

  valuesRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  valueItem: { gap: 1 },
  valueKey: { fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase" },
  valueVal: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  arrow: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
