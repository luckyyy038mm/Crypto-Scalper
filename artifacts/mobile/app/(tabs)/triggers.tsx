import React from "react";
import { Platform, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SetupTriggersCard from "@/components/SetupTriggersCard";
import { useTradingData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";

export default function TriggersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const { analysis } = useTradingData();
  const { setupTriggers, signal } = analysis;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Triggers</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Conditions required to flip from {signal}
        </Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        <SetupTriggersCard signal={signal} triggers={setupTriggers} />
        <View style={[styles.note, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.noteTitle, { color: colors.foreground }]}>How triggers work</Text>
          <Text style={[styles.noteText, { color: colors.secondaryForeground }]}>
            Each condition is evaluated against live Binance data updated every 30 seconds.
            Readiness percentage shows how close the market is to generating a confirmed signal.
            A score of 100% means all conditions are met — this may or may not coincide with a signal change.
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
  note: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  noteTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  noteText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
