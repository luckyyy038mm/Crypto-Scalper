import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HamburgerButton from "@/components/HamburgerButton";
import { COINS } from "@/constants/coins";
import { useMultiCoinData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";
import type { AlertCategory, AlertItem, AlertPriority } from "@/hooks/useAlerts";

/* ── Helpers ────────────────────────────────────────────────────── */

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const d = Date.now() - ts;
  if (d < 60_000) return `${Math.floor(d / 1_000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

const CATEGORY_ICONS: Record<AlertCategory, string> = {
  "Signal":           "trending-up",
  "Trigger":          "zap",
  "Funding":          "percent",
  "Open Interest":    "bar-chart-2",
  "Market Structure": "layers",
};

const PRIORITY_COLORS: Record<AlertPriority, string> = {
  Critical: "#FF2D55",
  High:     "#FF9500",
  Medium:   "#FFC107",
  Low:      "#8E9399",
};

const ALL_CATEGORIES: Array<"All" | AlertCategory> = [
  "All", "Signal", "Trigger", "Funding", "Open Interest", "Market Structure",
];

const COIN_FILTERS = ["All", ...COINS.map((c) => c.ticker)];

/* ── Sub-components ─────────────────────────────────────────────── */

function StatTile({ label, value, valueColor, icon, colors }: {
  label: string; value: string | number; valueColor?: string;
  icon: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[tile.root, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Feather name={icon as any} size={14} color={valueColor ?? colors.mutedForeground} />
      <Text style={[tile.val, { color: valueColor ?? colors.foreground }]}>{value}</Text>
      <Text style={[tile.lbl, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const tile = StyleSheet.create({
  root: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center", gap: 4 },
  val:  { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  lbl:  { fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase", textAlign: "center" },
});

function AlertCard({ alert, colors }: { alert: AlertItem; colors: ReturnType<typeof useColors> }) {
  const priorityColor = PRIORITY_COLORS[alert.priority];
  const icon = CATEGORY_ICONS[alert.category];
  const coin = COINS.find((c) => c.ticker === alert.coin);

  return (
    <View style={[acard.root, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={[acard.stripe, { backgroundColor: priorityColor }]} />
      <View style={acard.body}>
        <View style={acard.topRow}>
          {coin && (
            <View style={[acard.coinBadge, { backgroundColor: coin.color + "20", borderColor: coin.color + "50" }]}>
              <Text style={[acard.coinText, { color: coin.color }]}>{coin.ticker}</Text>
            </View>
          )}
          <View style={[acard.catBadge, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Feather name={icon as any} size={9} color={colors.mutedForeground} />
            <Text style={[acard.catText, { color: colors.mutedForeground }]}>{alert.category}</Text>
          </View>
          <View style={[acard.prioBadge, { backgroundColor: priorityColor + "22", borderColor: priorityColor + "66" }]}>
            <Text style={[acard.prioText, { color: priorityColor }]}>{alert.priority}</Text>
          </View>
          <Text style={[acard.time, { color: colors.mutedForeground }]}>{timeAgo(alert.timestamp)}</Text>
        </View>
        <Text style={[acard.title, { color: colors.foreground }]}>{alert.title}</Text>
        <Text style={[acard.desc, { color: colors.secondaryForeground }]}>{alert.description}</Text>
      </View>
    </View>
  );
}

const acard = StyleSheet.create({
  root:      { flexDirection: "row", borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  stripe:    { width: 4 },
  body:      { flex: 1, padding: 12, gap: 6 },
  topRow:    { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  coinBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  coinText:  { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  catBadge:  { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  catText:   { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  prioBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  prioText:  { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  time:      { fontSize: 9, fontFamily: "Inter_400Regular", marginLeft: "auto" },
  title:     { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  desc:      { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});

/* ── Screen ─────────────────────────────────────────────────────── */

export default function AlertsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const topPad  = Platform.OS === "web" ? 60 : insets.top;
  const allEngines = useMultiCoinData();

  const [activeCat, setActiveCat] = useState<"All" | AlertCategory>("All");
  const [activeCoin, setActiveCoin] = useState("All");

  /* Merge all coins' alerts, sorted by timestamp */
  const allAlerts = useMemo(() => {
    const merged: AlertItem[] = [];
    for (const engine of Object.values(allEngines)) {
      merged.push(...engine.alerts);
    }
    return merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
  }, [allEngines]);

  const filtered = useMemo(() => {
    return allAlerts.filter((a) => {
      const catOk = activeCat === "All" || a.category === activeCat;
      const coinOk = activeCoin === "All" || a.coin === activeCoin;
      return catOk && coinOk;
    });
  }, [allAlerts, activeCat, activeCoin]);

  const totalAlerts = allAlerts.length;
  const criticalAlerts = allAlerts.filter((a) => a.priority === "Critical").length;
  const highAlerts = allAlerts.filter((a) => a.priority === "High").length;
  const lastAlertTime = allAlerts[0]?.timestamp ?? 0;

  const critColor  = criticalAlerts > 0 ? PRIORITY_COLORS.Critical : colors.mutedForeground;
  const highColor  = highAlerts > 0     ? PRIORITY_COLORS.High     : colors.mutedForeground;
  const totalColor = totalAlerts > 0    ? colors.foreground         : colors.mutedForeground;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={styles.titleGroup}>
          <HamburgerButton />
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Alerts Center</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              All coins · Live notifications
            </Text>
          </View>
        </View>
        {criticalAlerts > 0 && (
          <View style={[styles.critBadge, { backgroundColor: PRIORITY_COLORS.Critical + "22", borderColor: PRIORITY_COLORS.Critical + "66" }]}>
            <Text style={[styles.critText, { color: PRIORITY_COLORS.Critical }]}>
              {criticalAlerts} CRITICAL
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        <View style={styles.statRow}>
          <StatTile label="Total Alerts" value={totalAlerts} valueColor={totalColor} icon="bell" colors={colors} />
          <StatTile label="Critical" value={criticalAlerts} valueColor={critColor} icon="alert-circle" colors={colors} />
          <StatTile label="High" value={highAlerts} valueColor={highColor} icon="alert-triangle" colors={colors} />
        </View>

        {lastAlertTime > 0 && (
          <View style={[styles.lastCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>LAST ALERT</Text>
            <Text style={[styles.lastTime, { color: colors.foreground }]}>
              {timeAgo(lastAlertTime)}
            </Text>
          </View>
        )}

        {/* Coin filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {COIN_FILTERS.map((coin) => {
            const active = coin === activeCoin;
            const coinConfig = COINS.find((c) => c.ticker === coin);
            const activeColor = coinConfig ? coinConfig.color : colors.primary;
            return (
              <TouchableOpacity
                key={coin}
                onPress={() => setActiveCoin(coin)}
                style={[styles.filterBtn, {
                  backgroundColor: active ? activeColor + "22" : colors.card,
                  borderColor: active ? activeColor : colors.border,
                }]}
              >
                <Text style={[styles.filterText, { color: active ? (coinConfig?.color ?? colors.primary) : colors.mutedForeground }]}>
                  {coin}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {ALL_CATEGORIES.map((cat) => {
            const active = cat === activeCat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setActiveCat(cat)}
                style={[styles.filterBtn, {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                }]}
              >
                <Text style={[styles.filterText, { color: active ? "#fff" : colors.mutedForeground }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Alerts list */}
        {filtered.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="bell-off" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No alerts yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Alerts are generated automatically when market conditions change across BTC, ETH, SOL, and XRP.
            </Text>
          </View>
        ) : (
          filtered.map((alert) => (
            <AlertCard key={alert.id} alert={alert} colors={colors} />
          ))
        )}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>NOTIFICATION CHANNELS</Text>
          {[
            { icon: "smartphone", label: "Push Notifications", desc: "In-app and device-level alerts when conditions change.", status: "Active" },
            { icon: "send",       label: "Telegram Bot",       desc: "Send alerts directly to your Telegram channel or group.", status: "Coming Soon" },
            { icon: "mail",       label: "Email Alerts",       desc: "Daily or instant email summaries of key alert events.", status: "Coming Soon" },
          ].map((ch) => {
            const isActive = ch.status === "Active";
            return (
              <View key={ch.label} style={[styles.chRow, { borderColor: colors.border }]}>
                <View style={[styles.chIcon, { backgroundColor: isActive ? colors.primary + "20" : colors.border + "30" }]}>
                  <Feather name={ch.icon as any} size={14} color={isActive ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={styles.chText}>
                  <Text style={[styles.chLabel, { color: colors.foreground }]}>{ch.label}</Text>
                  <Text style={[styles.chDesc, { color: colors.mutedForeground }]}>{ch.desc}</Text>
                </View>
                <View style={[styles.chBadge, {
                  backgroundColor: isActive ? colors.up + "18" : colors.card,
                  borderColor: isActive ? colors.up + "55" : colors.border,
                }]}>
                  <Text style={[styles.chBadgeText, { color: isActive ? colors.up : colors.mutedForeground }]}>
                    {ch.status}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <Text style={[styles.disc, { color: colors.mutedForeground }]}>
          Not financial advice · For informational use only
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  titleGroup: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  critBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  critText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },

  statRow: { flexDirection: "row", gap: 10 },

  lastCard: { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sec: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  lastTime: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  filterRow: { gap: 8, paddingRight: 4 },
  filterBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  filterText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 28, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },

  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  chRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  chIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  chText: { flex: 1, gap: 2 },
  chLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  chDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  chBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  disc: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
});
