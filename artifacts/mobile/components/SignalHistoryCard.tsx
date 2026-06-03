import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { SignalEntry } from "@/hooks/useSignalHistory";

interface Props {
  history: SignalEntry[];
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export default function SignalHistoryCard({ history }: Props) {
  const colors = useColors();
  if (!history.length) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.title, { color: colors.mutedForeground }]}>SIGNAL HISTORY</Text>
      <View style={styles.list}>
        {history.map((entry, i) => {
          const sigColor =
            entry.signal === "LONG"
              ? colors.up
              : entry.signal === "SHORT"
                ? colors.down
                : colors.wait;
          const scoreStr = entry.score > 0 ? `+${entry.score}` : String(entry.score);
          const isFirst = i === 0;
          return (
            <View key={entry.time} style={styles.entryRow}>
              {/* Timeline indicator */}
              <View style={styles.timelineCol}>
                <View style={[styles.timelineDot, { backgroundColor: isFirst ? sigColor : colors.border }]} />
                {i < history.length - 1 && (
                  <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
                )}
              </View>

              {/* Content */}
              <View style={[styles.entryContent, { opacity: isFirst ? 1 : 0.7 }]}>
                <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
                  {fmtTime(entry.time)}
                </Text>
                <View style={[styles.signalBadge, { backgroundColor: sigColor + "15", borderColor: sigColor + "50" }]}>
                  <Text style={[styles.signalText, { color: sigColor }]}>{entry.signal}</Text>
                </View>
                <Text style={[styles.scoreText, { color: colors.mutedForeground }]}>
                  {scoreStr}/40
                </Text>
                <Text style={[styles.qualityText, { color: colors.mutedForeground }]}>
                  {entry.qualityLabel}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },
  title: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  list: { gap: 0 },

  entryRow: { flexDirection: "row", gap: 12 },
  timelineCol: { alignItems: "center", width: 12 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  timelineLine: { width: 2, flex: 1, marginTop: 4, marginBottom: -2 },

  entryContent: {
    flex: 1, flexDirection: "row", alignItems: "center",
    gap: 8, paddingVertical: 8, flexWrap: "wrap",
  },
  timeText: { fontSize: 12, fontFamily: "Inter_500Medium", width: 68 },
  signalBadge: {
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
  },
  signalText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  scoreText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  qualityText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
});
