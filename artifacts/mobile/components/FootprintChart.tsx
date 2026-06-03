import React, { useCallback, useMemo, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import type { FootprintBar, FootprintLevel } from "@/hooks/useFootprintData";

const PRICE_COL_W = 64;
const BAR_COL_W = 84;
const CELL_H = 22;
const HEADER_H = 36;
const MAX_LEVELS = 22;

function fmtVol(n: number): string {
  if (n >= 100_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function fmtPrice(price: number): string {
  if (price >= 10_000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1_000) return price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (price >= 100) return price.toFixed(2);
  if (price >= 10) return price.toFixed(3);
  return price.toFixed(4);
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function hexAlpha(ratio: number): string {
  const clamped = Math.max(0.04, Math.min(0.85, ratio));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
}

function deltaColor(
  delta: number,
  totalVol: number,
  upColor: string,
  downColor: string,
): string {
  if (totalVol === 0) return "transparent";
  const ratio = Math.min(1, Math.abs(delta) / (totalVol || 1));
  if (delta > 0) return upColor + hexAlpha(ratio * 0.85);
  if (delta < 0) return downColor + hexAlpha(ratio * 0.85);
  return "transparent";
}

interface BarColumnProps {
  bar: FootprintBar;
  priceAxis: number[];
  isCurrent: boolean;
  upColor: string;
  downColor: string;
  primaryColor: string;
  mutedFg: string;
  borderColor: string;
  fgColor: string;
  currentPrice: number;
}

function BarColumn({
  bar,
  priceAxis,
  isCurrent,
  upColor,
  downColor,
  primaryColor,
  mutedFg,
  borderColor,
  fgColor,
  currentPrice,
}: BarColumnProps) {
  const levelMap = useMemo(
    () => new Map<number, FootprintLevel>(bar.levels.map((l) => [l.price, l])),
    [bar.levels],
  );

  const deltaColor_ = bar.totalDelta >= 0 ? upColor : downColor;

  return (
    <View style={{ width: BAR_COL_W }}>
      {/* Column header */}
      <View
        style={[
          styles.barHeader,
          {
            height: HEADER_H,
            borderColor,
            backgroundColor: isCurrent ? primaryColor + "14" : "transparent",
            borderTopColor: isCurrent ? primaryColor : borderColor,
            borderTopWidth: isCurrent ? 2 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.barHeaderTime,
            { color: isCurrent ? primaryColor : mutedFg },
          ]}
          numberOfLines={1}
        >
          {isCurrent ? "LIVE" : fmtTime(bar.openTime)}
        </Text>
        <Text
          style={[styles.barHeaderDelta, { color: deltaColor_ }]}
          numberOfLines={1}
        >
          Δ {bar.totalDelta >= 0 ? "+" : ""}
          {fmtVol(bar.totalDelta)}
        </Text>
      </View>

      {/* Price level cells */}
      {priceAxis.map((price) => {
        const level = levelMap.get(price);
        const isCurrentPrice =
          currentPrice > 0 && Math.abs(price - currentPrice) < 0.01 * price;

        if (!level) {
          return (
            <View
              key={price}
              style={[
                styles.emptyCell,
                {
                  height: CELL_H,
                  borderColor,
                  backgroundColor: isCurrentPrice
                    ? primaryColor + "08"
                    : "transparent",
                },
              ]}
            />
          );
        }

        const bgColor = deltaColor(
          level.delta,
          level.totalVol,
          upColor,
          downColor,
        );

        const bidTextColor = level.bidVol > level.askVol ? downColor : mutedFg;
        const askTextColor = level.askVol > level.bidVol ? upColor : mutedFg;

        return (
          <View
            key={price}
            style={[
              styles.cell,
              {
                height: CELL_H,
                borderColor: isCurrentPrice ? primaryColor + "60" : borderColor,
                backgroundColor: bgColor,
              },
            ]}
          >
            <Text
              style={[styles.volText, { color: bidTextColor }]}
              numberOfLines={1}
            >
              {fmtVol(level.bidVol)}
            </Text>
            <Text
              style={[styles.volText, { color: askTextColor }]}
              numberOfLines={1}
            >
              {fmtVol(level.askVol)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

interface Props {
  completedBars: FootprintBar[];
  currentBar: FootprintBar | null;
  currentPrice: number;
  isConnected: boolean;
}

export default function FootprintChart({
  completedBars,
  currentBar,
  currentPrice,
  isConnected,
}: Props) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);

  const allBars = useMemo(() => {
    const arr = [...completedBars];
    if (currentBar) arr.push(currentBar);
    return arr;
  }, [completedBars, currentBar]);

  const priceAxis = useMemo(() => {
    const priceSet = new Set<number>();
    allBars.forEach((bar) => bar.levels.forEach((l) => priceSet.add(l.price)));
    const sorted = Array.from(priceSet).sort((a, b) => b - a);

    if (sorted.length <= MAX_LEVELS) return sorted;

    // Center around current price
    const ref =
      currentPrice > 0
        ? sorted.reduce((best, p) =>
            Math.abs(p - currentPrice) < Math.abs(best - currentPrice)
              ? p
              : best,
          sorted[0])
        : sorted[Math.floor(sorted.length / 2)];

    const idx = sorted.indexOf(ref);
    const half = Math.floor(MAX_LEVELS / 2);
    const start = Math.max(0, idx - half);
    return sorted.slice(start, start + MAX_LEVELS);
  }, [allBars, currentPrice]);

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  if (!isConnected && allBars.length === 0) {
    return (
      <View
        style={[
          styles.waiting,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}
      >
        <Text style={[styles.waitingText, { color: colors.mutedForeground }]}>
          Connecting to Binance trade stream…
        </Text>
      </View>
    );
  }

  if (allBars.length === 0) {
    return (
      <View
        style={[
          styles.waiting,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}
      >
        <Text style={[styles.waitingText, { color: colors.mutedForeground }]}>
          Aggregating trades into bars…
        </Text>
        <Text
          style={[styles.waitingSubText, { color: colors.mutedForeground }]}
        >
          First bar appears at the next minute mark
        </Text>
      </View>
    );
  }

  const chartH = priceAxis.length * CELL_H + HEADER_H;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Column headers row */}
      <View style={styles.grid}>
        {/* Fixed price axis header */}
        <View style={{ width: PRICE_COL_W }}>
          <View
            style={[
              styles.priceHeader,
              { height: HEADER_H, borderColor: colors.border },
            ]}
          >
            <Text
              style={[styles.priceHeaderText, { color: colors.mutedForeground }]}
            >
              PRICE
            </Text>
            <View style={styles.bidAskLabels}>
              <Text style={[styles.bidLabel, { color: colors.down }]}>B</Text>
              <Text style={[styles.askLabel, { color: colors.up }]}>A</Text>
            </View>
          </View>
          {priceAxis.map((price) => {
            const isCurrentPrice =
              currentPrice > 0 &&
              Math.abs(price - currentPrice) < 0.01 * price;
            return (
              <View
                key={price}
                style={[
                  styles.priceCell,
                  {
                    height: CELL_H,
                    borderColor: isCurrentPrice
                      ? colors.primary + "60"
                      : colors.border,
                    backgroundColor: isCurrentPrice
                      ? colors.primary + "12"
                      : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.priceCellText,
                    {
                      color: isCurrentPrice
                        ? colors.primary
                        : colors.mutedForeground,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {fmtPrice(price)}
                </Text>
                {isCurrentPrice && (
                  <View
                    style={[
                      styles.currentPriceDot,
                      { backgroundColor: colors.primary },
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>

        {/* Scrollable bar columns */}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
          style={{ flex: 1 }}
          contentContainerStyle={{ height: chartH }}
        >
          {allBars.map((bar, idx) => (
            <BarColumn
              key={bar.openTime}
              bar={bar}
              priceAxis={priceAxis}
              isCurrent={idx === allBars.length - 1}
              upColor={colors.up}
              downColor={colors.down}
              primaryColor={colors.primary}
              mutedFg={colors.mutedForeground}
              borderColor={colors.border}
              fgColor={colors.foreground}
              currentPrice={currentPrice}
            />
          ))}
        </ScrollView>
      </View>

      {/* Legend */}
      <View
        style={[styles.legend, { borderTopColor: colors.border }]}
      >
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: colors.down + "CC" },
            ]}
          />
          <Text
            style={[styles.legendText, { color: colors.mutedForeground }]}
          >
            Bid (aggressive sell)
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: colors.up + "CC" },
            ]}
          />
          <Text
            style={[styles.legendText, { color: colors.mutedForeground }]}
          >
            Ask (aggressive buy)
          </Text>
        </View>
        <View style={styles.legendItem}>
          <Text
            style={[
              styles.legendText,
              { color: colors.mutedForeground },
            ]}
          >
            Δ = Ask − Bid
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  grid: {
    flexDirection: "row",
  },

  /* Price axis */
  priceHeader: {
    height: HEADER_H,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 6,
    justifyContent: "center",
    gap: 2,
  },
  priceHeaderText: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  bidAskLabels: {
    flexDirection: "row",
    gap: 4,
  },
  bidLabel: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  askLabel: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  priceCell: {
    height: CELL_H,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceCellText: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  currentPriceDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginLeft: 2,
  },

  /* Bar columns */
  barHeader: {
    height: HEADER_H,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 4,
    justifyContent: "center",
    gap: 1,
  },
  barHeaderTime: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  barHeaderDelta: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  cell: {
    height: CELL_H,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 3,
  },
  emptyCell: {
    height: CELL_H,
    borderBottomWidth: 1,
    borderRightWidth: 1,
  },
  volText: {
    fontSize: 8.5,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    flex: 1,
  },

  /* Legend */
  legend: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    flexWrap: "wrap",
    gap: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
  },

  /* Waiting states */
  waiting: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
  },
  waitingText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  waitingSubText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    opacity: 0.7,
  },
});
