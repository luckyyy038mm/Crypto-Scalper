import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FootprintChart from "@/components/FootprintChart";
import { COINS, type CoinSymbol } from "@/constants/coins";
import { useColors } from "@/hooks/useColors";
import {
  TF_MS,
  useFootprintData,
  type FootprintTimeframe,
} from "@/hooks/useFootprintData";

const TIMEFRAMES: { label: string; value: FootprintTimeframe }[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
];

function fmtVol(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(2)}`;
}

function fmtVolAbs(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

function PulseDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 0.2,
          duration: 800,
          useNativeDriver: false,
        }),
        Animated.timing(anim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <Animated.View
      style={[styles.pulseDot, { backgroundColor: color, opacity: anim }]}
    />
  );
}

function StatCard({
  label,
  value,
  valueColor,
  sub,
  colors,
}: {
  label: string;
  value: string;
  valueColor: string;
  sub?: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
    >
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
      {!!sub && (
        <Text style={[styles.statSub, { color: colors.mutedForeground }]}>
          {sub}
        </Text>
      )}
    </View>
  );
}

export default function FootprintScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 24 : insets.top;

  const [coin, setCoin] = useState<CoinSymbol>("BTCUSDT");
  const [tf, setTf] = useState<FootprintTimeframe>("1m");

  const { completedBars, currentBar, isConnected, tradesCount, currentPrice } =
    useFootprintData(coin, tf);

  const allBars = [...completedBars, ...(currentBar ? [currentBar] : [])];
  const latestBar = currentBar ?? completedBars[completedBars.length - 1];

  const totalDelta = latestBar?.totalDelta ?? 0;
  const totalVol = latestBar?.totalVol ?? 0;
  const barCount = completedBars.length + (currentBar ? 1 : 0);

  const deltaColor = totalDelta >= 0 ? colors.up : colors.down;
  const connColor = isConnected ? colors.up : colors.down;

  const barMs = TF_MS[tf];
  const barProgress =
    currentBar
      ? Math.min(100, ((Date.now() - currentBar.openTime) / barMs) * 100)
      : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 10, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>

          <View style={styles.headerCenter}>
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.titleIcon,
                  { backgroundColor: colors.primary + "18" },
                ]}
              >
                <Feather name="grid" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                Footprint Chart
              </Text>
            </View>
            <Text
              style={[styles.headerSub, { color: colors.mutedForeground }]}
            >
              Bid / Ask volume at every price level
            </Text>
          </View>

          <View style={styles.liveGroup}>
            <PulseDot color={connColor} />
            <Text style={[styles.liveText, { color: connColor }]}>
              {isConnected ? "LIVE" : "OFF"}
            </Text>
          </View>
        </View>

        {/* Coin selector */}
        <View style={styles.coinRow}>
          {COINS.map((cfg) => {
            const active = cfg.symbol === coin;
            return (
              <Pressable
                key={cfg.symbol}
                onPress={() => {
                  Haptics.selectionAsync();
                  setCoin(cfg.symbol);
                }}
                style={[
                  styles.coinBtn,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active
                      ? colors.primary + "20"
                      : "transparent",
                  },
                ]}
              >
                <View
                  style={[
                    styles.coinDot,
                    { backgroundColor: cfg.color },
                  ]}
                />
                <Text
                  style={[
                    styles.coinLabel,
                    {
                      color: active ? colors.primary : colors.mutedForeground,
                    },
                  ]}
                >
                  {cfg.ticker}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Timeframe + bar progress */}
        <View style={styles.tfRow}>
          <View style={styles.tfBtns}>
            {TIMEFRAMES.map((t) => {
              const active = t.value === tf;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setTf(t.value);
                  }}
                  style={[
                    styles.tfBtn,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active
                        ? colors.primary
                        : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tfLabel,
                      { color: active ? "#fff" : colors.mutedForeground },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Bar timer progress */}
          {currentBar && (
            <View style={styles.barTimerWrap}>
              <View
                style={[
                  styles.barTimerTrack,
                  { backgroundColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.barTimerFill,
                    {
                      width: `${barProgress}%` as unknown as number,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
              <Text
                style={[styles.barTimerText, { color: colors.mutedForeground }]}
              >
                {tf} bar {Math.round(barProgress)}%
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard
            label="CUM DELTA"
            value={totalDelta !== 0 ? fmtVol(totalDelta) : "—"}
            valueColor={deltaColor}
            sub="Ask − Bid"
            colors={colors}
          />
          <StatCard
            label="TOTAL VOL"
            value={totalVol > 0 ? fmtVolAbs(totalVol) : "—"}
            valueColor={colors.foreground}
            sub={`${barCount} bar${barCount !== 1 ? "s" : ""}`}
            colors={colors}
          />
          <StatCard
            label="TRADES"
            value={tradesCount.toLocaleString()}
            valueColor={colors.foreground}
            sub="raw trades"
            colors={colors}
          />
        </View>

        {/* Dominant pressure badge */}
        {latestBar && latestBar.totalVol > 0 && (
          <View
            style={[
              styles.pressureBanner,
              {
                backgroundColor: deltaColor + "14",
                borderColor: deltaColor + "40",
              },
            ]}
          >
            <Feather
              name={
                totalDelta >= 0
                  ? "trending-up"
                  : "trending-down"
              }
              size={14}
              color={deltaColor}
            />
            <Text style={[styles.pressureText, { color: deltaColor }]}>
              {totalDelta >= 0 ? "Ask dominant" : "Bid dominant"} ·{" "}
              {Math.abs(
                Math.round((totalDelta / (latestBar.totalVol || 1)) * 100),
              )}
              % imbalance
            </Text>
            <Text
              style={[
                styles.pressureSub,
                { color: colors.mutedForeground },
              ]}
            >
              {totalDelta >= 0 ? "More aggressive buying" : "More aggressive selling"}
            </Text>
          </View>
        )}

        {/* Footprint Chart */}
        <FootprintChart
          completedBars={completedBars}
          currentBar={currentBar}
          currentPrice={currentPrice}
          isConnected={isConnected}
        />

        {/* Explanation cards */}
        <View
          style={[
            styles.explainCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <Text
            style={[styles.explainTitle, { color: colors.mutedForeground }]}
          >
            HOW TO READ
          </Text>
          {[
            {
              icon: "grid" as const,
              color: colors.primary,
              title: "Price Levels (rows)",
              desc: "Each row is a price tick. Left number = Bid vol (aggressive sellers). Right = Ask vol (aggressive buyers).",
            },
            {
              icon: "bar-chart-2" as const,
              color: colors.up,
              title: "Green cells",
              desc: "Ask volume exceeds bid — buyers are more aggressive at this price level (bullish pressure).",
            },
            {
              icon: "bar-chart-2" as const,
              color: colors.down,
              title: "Red cells",
              desc: "Bid volume exceeds ask — sellers are more aggressive at this price level (bearish pressure).",
            },
            {
              icon: "activity" as const,
              color: colors.wait,
              title: "Delta (Δ)",
              desc: "Ask − Bid per bar. Positive delta = net buying pressure. Negative = net selling pressure.",
            },
          ].map((item) => (
            <View key={item.title} style={styles.explainRow}>
              <View
                style={[
                  styles.explainIcon,
                  { backgroundColor: item.color + "18" },
                ]}
              >
                <Feather name={item.icon} size={13} color={item.color} />
              </View>
              <View style={styles.explainBody}>
                <Text
                  style={[styles.explainItemTitle, { color: colors.foreground }]}
                >
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.explainItemDesc,
                    { color: colors.secondaryForeground },
                  ]}
                >
                  {item.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.disc, { color: colors.mutedForeground }]}>
          Data from Binance spot trade stream · Not financial advice
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    borderBottomWidth: 1,
    paddingBottom: 10,
    paddingHorizontal: 16,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, alignItems: "center", gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  titleIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 10, fontFamily: "Inter_400Regular", letterSpacing: 0.2 },
  liveGroup: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  pulseDot: { width: 7, height: 7, borderRadius: 4 },

  coinRow: { flexDirection: "row", gap: 6 },
  coinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  coinDot: { width: 7, height: 7, borderRadius: 4 },
  coinLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  tfRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  tfBtns: { flexDirection: "row", gap: 6 },
  tfBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  tfLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  barTimerWrap: { flex: 1, gap: 3, alignItems: "flex-end" },
  barTimerTrack: {
    width: 90,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  barTimerFill: { height: 4, borderRadius: 2 },
  barTimerText: { fontSize: 9, fontFamily: "Inter_400Regular" },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 14, paddingTop: 12, gap: 12 },

  statsRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 3,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statSub: { fontSize: 9, fontFamily: "Inter_400Regular" },

  pressureBanner: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pressureText: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  pressureSub: { fontSize: 10, fontFamily: "Inter_400Regular", width: "100%" },

  explainCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  explainTitle: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  explainRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  explainIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  explainBody: { flex: 1, gap: 2 },
  explainItemTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  explainItemDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },

  disc: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    opacity: 0.6,
  },
});
