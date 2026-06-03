import React from "react";
import { Platform, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SignalHistoryCard from "@/components/SignalHistoryCard";
import { useTradingData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const { analysis, history } = useTradingData();

  const signalColor = analysis.signal === "LONG" ? colors.long : analysis.signal === "SHORT" ? colors.short : colors.wait;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>History</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Last {history.length} signal change{history.length !== 1 ? "s" : ""}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Current snapshot */}
        <View style={[styles.currentCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>CURRENT SIGNAL</Text>
          <View style={styles.currentRow}>
            <View style={[styles.sigBadge, { backgroundColor: signalColor + "20", borderColor: signalColor + "50" }]}>
              <Text style={[styles.sigText, { color: signalColor }]}>{analysis.signal}</Text>
            </View>
            <Text style={[styles.currentScore, { color: colors.secondaryForeground }]}>
              {analysis.totalScore > 0 ? "+" : ""}{analysis.totalScore} / {analysis.maxTotalScore}
            </Text>
            <Text style={[styles.currentQuality, { color: colors.mutedForeground }]}>
              {analysis.qualityLabel}
            </Text>
          </View>
        </View>

        {/* History list */}
        {history.length > 0 ? (
          <>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>SIGNAL CHANGES</Text>
            <SignalHistoryCard history={history} />
          </>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>⏱</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No signal changes yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              History records are added automatically whenever the signal changes from LONG to SHORT, WAIT, or vice versa.
              Keep the app open and history will build over time.
            </Text>
          </View>
        )}

        {/* Notes */}
        <View style={[styles.noteCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.noteTitle, { color: colors.foreground }]}>About Signal History</Text>
          <Text style={[styles.noteText, { color: colors.secondaryForeground }]}>
            The system tracks the last 20 signal changes with their score and quality label.
            History is session-based and resets when the app is closed.
            Future versions will add trade journaling, accuracy tracking, and performance analytics.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  sec: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },

  currentCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  currentRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  sigBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  sigText: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  currentScore: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  currentQuality: { fontSize: 12, fontFamily: "Inter_400Regular" },

  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: "center", gap: 10 },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },

  noteCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  noteTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  noteText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
