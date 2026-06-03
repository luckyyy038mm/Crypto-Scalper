import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { G, Line, Path, Rect, Svg } from "react-native-svg";

import type { Candle } from "@/hooks/useKlineData";
import type { Zone } from "@/hooks/useLevelAnalysis";

export interface ChartOverlays {
  supportLevels?: number[];
  resistanceLevels?: number[];
  supplyZones?: Zone[];
  demandZones?: Zone[];
  swingHighPrices?: number[];
  swingLowPrices?: number[];
  entryZone?: { top: number; bottom: number };
  stopLoss?: number;
  takeProfits?: number[];
  signalColor?: string;
}

interface Props {
  candles: Candle[];
  loading: boolean;
  width: number;
  height?: number;
  upColor?: string;
  downColor?: string;
  gridColor?: string;
  labelColor?: string;
  overlays?: ChartOverlays;
  maxCandles?: number;
  showVolume?: boolean;
}

const PAD = { top: 10, bottom: 30, left: 0, right: 58 };
const GAP_RATIO = 0.25;
const VOLUME_HEIGHT = 30;
const VOLUME_GAP = 8;

export default function CandleChart({
  candles,
  loading,
  width,
  height = 180,
  upColor = "#00E599",
  downColor = "#FF4757",
  gridColor = "rgba(255,255,255,0.05)",
  labelColor = "rgba(107,127,163,0.9)",
  overlays,
  maxCandles = 70,
  showVolume = true,
}: Props) {
  const [priceLineY, setPriceLineY] = useState<number | null>(null);
  const lastPriceRef = useRef<number>(0);
  
  // Chart dimensions
  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom - (showVolume ? VOLUME_HEIGHT + VOLUME_GAP : 0);
  const volY = PAD.top + chartH + VOLUME_GAP;

  const computed = useMemo(() => {
    if (!candles.length) return null;
    
    const vis = candles.slice(-maxCandles);
    const highs = vis.map((c) => c.high);
    const lows = vis.map((c) => c.low);
    let pMax = Math.max(...highs);
    let pMin = Math.min(...lows);

    // Update last price for real-time line
    if (vis.length > 0) {
      lastPriceRef.current = vis[vis.length - 1].close;
    }

    /* Expand range to fit overlay levels */
    const ovLevels = [
      ...(overlays?.supportLevels ?? []),
      ...(overlays?.resistanceLevels ?? []),
      ...(overlays?.supplyZones?.map((z) => z.top) ?? []),
      ...(overlays?.demandZones?.map((z) => z.bottom) ?? []),
      overlays?.entryZone?.top,
      overlays?.entryZone?.bottom,
      overlays?.stopLoss,
      ...(overlays?.takeProfits ?? []),
    ].filter((v): v is number => v !== undefined);
    if (ovLevels.length) {
      pMax = Math.max(pMax, ...ovLevels);
      pMin = Math.min(pMin, ...ovLevels);
    }

    const pad = (pMax - pMin) * 0.06;
    pMax += pad; pMin -= pad;
    const range = pMax - pMin || 1;

    const count = vis.length;
    const cw = chartW / count;
    const bw = cw * (1 - GAP_RATIO);

    const toY = (p: number) => ((pMax - p) / range) * chartH;

    // Build candle shapes
    const shapes = vis.map((c, i) => {
      const x = i * cw + cw / 2;
      const bTop = toY(Math.max(c.open, c.close));
      const bBot = toY(Math.min(c.open, c.close));
      const isUp = c.close >= c.open;
      return {
        key: String(c.openTime),
        x,
        wickTop: toY(c.high),
        wickBot: toY(c.low),
        bodyX: x - bw / 2,
        bodyY: bTop,
        bodyW: bw,
        bodyH: Math.max(bBot - bTop, 1),
        color: isUp ? upColor : downColor,
      };
    });

    // Price grid labels
    const numLabels = 5;
    const gridLabels = Array.from({ length: numLabels + 1 }, (_, i) => {
      const price = pMin + (range * i) / numLabels;
      const y = toY(price);
      return { y, text: price >= 10000 ? `${(price / 1000).toFixed(1)}k` : price.toFixed(1), price };
    });

    // Volume bars
    const maxVol = showVolume ? Math.max(...vis.map(c => c.volume), 1) : 1;
    const volShapes = showVolume ? vis.map((c, i) => {
      const x = i * cw + cw / 2;
      const h = (c.volume / maxVol) * VOLUME_HEIGHT;
      return {
        key: String(c.openTime),
        x: x - bw / 2,
        y: volY + VOLUME_HEIGHT - h,
        w: bw,
        h,
        color: c.close >= c.open ? upColor + "60" : downColor + "60",
      };
    }) : [];

    // Overlay computation
    const inRange = (p: number) => p >= pMin && p <= pMax;

    const supLines = (overlays?.supportLevels ?? []).filter(inRange).map((p) => ({ y: toY(p), price: p }));
    const resLines = (overlays?.resistanceLevels ?? []).filter(inRange).map((p) => ({ y: toY(p), price: p }));

    const supZones = (overlays?.demandZones ?? []).map((z) => ({
      y: toY(Math.min(pMax, z.top)),
      h: Math.abs(toY(Math.max(pMin, z.bottom)) - toY(Math.min(pMax, z.top))),
    })).filter((z) => z.h > 0);

    const resZones = (overlays?.supplyZones ?? []).map((z) => ({
      y: toY(Math.min(pMax, z.top)),
      h: Math.abs(toY(Math.max(pMin, z.bottom)) - toY(Math.min(pMax, z.top))),
    })).filter((z) => z.h > 0);

    const entryZoneShape = overlays?.entryZone && inRange(overlays.entryZone.top) ? {
      y: toY(overlays.entryZone.top),
      h: Math.abs(toY(overlays.entryZone.bottom) - toY(overlays.entryZone.top)),
    } : null;

    const slLine = overlays?.stopLoss && inRange(overlays.stopLoss) ? { y: toY(overlays.stopLoss), price: overlays.stopLoss } : null;
    const tpLines = (overlays?.takeProfits ?? []).filter(inRange).map((p, i) => ({ y: toY(p), price: p, label: `TP${i + 1}` }));

    const sigColor = overlays?.signalColor ?? upColor;

    return {
      shapes,
      gridLabels,
      pMin,
      pMax,
      toY,
      supLines,
      resLines,
      supZones,
      resZones,
      entryZoneShape,
      slLine,
      tpLines,
      sigColor,
      chartW,
      volShapes,
    };
  }, [candles, chartW, chartH, upColor, downColor, overlays, maxCandles, showVolume, volY]);

  // Update price line position on candle changes
  useEffect(() => {
    if (computed && lastPriceRef.current > 0) {
      const y = computed.toY(lastPriceRef.current);
      setPriceLineY(y);
    }
  }, [computed, candles]);

  if (loading) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <ActivityIndicator color={upColor} size="small" />
      </View>
    );
  }
  if (!computed) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <Text style={[styles.empty, { color: labelColor }]}>No data</Text>
      </View>
    );
  }

  const { shapes, gridLabels, supLines, resLines, supZones, resZones, entryZoneShape, slLine, tpLines, sigColor, volShapes } = computed;

  const overlayLabels: { y: number; text: string; color: string }[] = [
    ...supLines.map((l) => ({ y: l.y, text: `S ${(l.price / 1000).toFixed(2)}k`, color: upColor })),
    ...resLines.map((l) => ({ y: l.y, text: `R ${(l.price / 1000).toFixed(2)}k`, color: downColor })),
    ...(slLine ? [{ y: slLine.y, text: `SL`, color: downColor }] : []),
    ...tpLines.map((l) => ({ y: l.y, text: l.label, color: upColor })),
    ...(entryZoneShape ? [{ y: entryZoneShape.y + entryZoneShape.h / 2, text: "ENTRY", color: sigColor }] : []),
  ];

  // Real-time price line position
  const priceLineYPos = priceLineY !== null ? priceLineY : null;
  const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const priceLineColor = lastPrice >= (candles[candles.length - 2]?.close ?? lastPrice) ? upColor : downColor;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <G x={PAD.left} y={PAD.top}>
          {/* Grid lines */}
          {gridLabels.map((l, i) => (
            <Line key={i} x1={0} y1={l.y} x2={chartW} y2={l.y} stroke={gridColor} strokeWidth={1} />
          ))}

          {/* Demand zones */}
          {supZones.map((z, i) => (
            <Rect key={`dz${i}`} x={0} y={z.y} width={chartW} height={z.h} fill={upColor} opacity={0.06} />
          ))}
          {/* Supply zones */}
          {resZones.map((z, i) => (
            <Rect key={`sz${i}`} x={0} y={z.y} width={chartW} height={z.h} fill={downColor} opacity={0.06} />
          ))}

          {/* Entry zone */}
          {entryZoneShape && (
            <Rect x={0} y={entryZoneShape.y} width={chartW} height={entryZoneShape.h} fill={sigColor} opacity={0.15} />
          )}

          {/* Support lines */}
          {supLines.map((l, i) => (
            <Line key={`sl${i}`} x1={0} y1={l.y} x2={chartW} y2={l.y}
              stroke={upColor} strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
          ))}
          {/* Resistance lines */}
          {resLines.map((l, i) => (
            <Line key={`rl${i}`} x1={0} y1={l.y} x2={chartW} y2={l.y}
              stroke={downColor} strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
          ))}
          {/* Stop loss line */}
          {slLine && (
            <Line x1={0} y1={slLine.y} x2={chartW} y2={slLine.y}
              stroke={downColor} strokeWidth={1.5} strokeDasharray="6,3" opacity={0.9} />
          ))}
          {/* Take profit lines */}
          {tpLines.map((l, i) => (
            <Line key={`tp${i}`} x1={0} y1={l.y} x2={chartW} y2={l.y}
              stroke={upColor} strokeWidth={1} strokeDasharray="6,3" opacity={0.8} />
          ))}

          {/* Real-time price line */}
          {priceLineYPos !== null && (
            <Line x1={0} y1={priceLineYPos} x2={chartW} y2={priceLineYPos}
              stroke={priceLineColor} strokeWidth={1.5} opacity={0.9} />
          )}

          {/* Candles */}
          {shapes.map((s) => (
            <G key={s.key}>
              <Line x1={s.x} y1={s.wickTop} x2={s.x} y2={s.wickBot}
                stroke={s.color} strokeWidth={1} opacity={0.7} />
              <Rect x={s.bodyX} y={s.bodyY} width={s.bodyW} height={s.bodyH}
                fill={s.color} rx={1} />
            </G>
          ))}
        </G>

        {/* Volume bars */}
        {showVolume && (
          <G x={PAD.left} y={0}>
            {volShapes.map((v) => (
              <Rect key={v.key} x={v.x} y={v.y} width={v.w} height={v.h} fill={v.color} rx={1} />
            ))}
          </G>
        )}
      </Svg>

      {/* Grid price labels */}
      {gridLabels.map((l, i) => (
        <Text key={i} style={[styles.label, { color: labelColor, top: PAD.top + l.y - 7, right: 0, width: PAD.right - 4 }]}>
          {l.text}
        </Text>
      ))}

      {/* Real-time price label */}
      {priceLineYPos !== null && (
        <View style={[styles.priceTag, { top: PAD.top + priceLineYPos - 9, right: 0, width: PAD.right - 4 }]}>
          <Text style={[styles.priceTagText, { color: priceLineColor }]}>
            {lastPrice >= 10000 ? `${(lastPrice / 1000).toFixed(2)}k` : lastPrice.toFixed(1)}
          </Text>
        </View>
      )}

      {/* Overlay labels */}
      {overlayLabels.map((l, i) => (
        <Text key={`ol${i}`} style={[styles.overlayLabel, { color: l.color, top: PAD.top + l.y - 7, right: 0, width: PAD.right - 4 }]}>
          {l.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 12, fontFamily: "Inter_400Regular" },
  label: { fontSize: 10, fontFamily: "Inter_400Regular", position: "absolute", textAlign: "right" },
  overlayLabel: { fontSize: 9, fontFamily: "Inter_700Bold", position: "absolute", textAlign: "right" },
  priceTag: { position: "absolute" },
  priceTagText: { fontSize: 10, fontFamily: "Inter_700Bold", textAlign: "right" },
});
