import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { G, Line, Rect, Svg, Text as SvgText } from "react-native-svg";

import type { AnalysisLevel, AnalysisZone, StructurePoint, TradeZone } from "@/hooks/useChartAnalysis";
import type { Candle } from "@/hooks/useKlineData";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface AnalysisChartOverlays {
  supportLevels?: AnalysisLevel[];
  resistanceLevels?: AnalysisLevel[];
  demandZones?: AnalysisZone[];
  supplyZones?: AnalysisZone[];
  structurePoints?: StructurePoint[];
  longZone?: TradeZone | null;
  shortZone?: TradeZone | null;
  ema20?: number;
  ema50?: number;
  currentPrice?: number;
  biasBullish?: boolean;
}

interface CrosshairState {
  x: number;
  y: number;
  candleIdx: number;
}

interface Props {
  candles: Candle[];
  loading: boolean;
  overlays: AnalysisChartOverlays;
  width: number;
  height?: number;
  upColor?: string;
  downColor?: string;
  gridColor?: string;
  labelColor?: string;
  primaryColor?: string;
  bgColor?: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const PAD = { top: 12, bottom: 28, left: 4, right: 60 };
const GAP_RATIO = 0.22;
const DEFAULT_VISIBLE = 60;
const MIN_VISIBLE = 15;

/* ── Price formatter ───────────────────────────────────────────────── */

function fmtPrice(p: number): string {
  if (p >= 10000) return `${(p / 1000).toFixed(1)}k`;
  if (p >= 1000) return p.toFixed(0);
  if (p >= 100) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function fmtPriceFull(p: number): string {
  if (p >= 10000) return p.toFixed(1);
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(3);
  return p.toFixed(5);
}

function fmtTime(ts: number, interval: string): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  if (interval === "1h" || interval === "4h") {
    const mo = (d.getMonth() + 1).toString().padStart(2, "0");
    const dy = d.getDate().toString().padStart(2, "0");
    return `${mo}/${dy} ${h}:${m}`;
  }
  return `${h}:${m}`;
}

/* ── Main Component ─────────────────────────────────────────────────── */

export default function InteractiveAnalysisChart({
  candles,
  loading,
  overlays,
  width,
  height = 300,
  upColor = "#00E599",
  downColor = "#FF4757",
  gridColor = "rgba(255,255,255,0.05)",
  labelColor = "rgba(107,127,163,0.9)",
  primaryColor = "#F7931A",
  bgColor = "#060B18",
}: Props) {
  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  /* ── Viewport state ──────────────────────────────────────────────── */
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE);
  const [visibleStart, setVisibleStart] = useState(0);
  const [crosshair, setCrosshair] = useState<CrosshairState | null>(null);

  /* Refs for gesture tracking (avoid stale closure issues) */
  const panStartRef = useRef(0);
  const pinchStartRef = useRef(DEFAULT_VISIBLE);
  const visibleStartRef = useRef(0);
  const visibleCountRef = useRef(DEFAULT_VISIBLE);

  visibleStartRef.current = visibleStart;
  visibleCountRef.current = visibleCount;

  /* Derived: effective start (clamped to candle array) */
  const totalCandles = candles.length;
  const effectiveCount = Math.min(visibleCount, totalCandles);
  const maxStart = Math.max(0, totalCandles - effectiveCount);
  const effectiveStart = Math.min(visibleStart, maxStart);
  const visSlice = candles.slice(effectiveStart, effectiveStart + effectiveCount);

  /* Candle pixel width */
  const candlePixelWidth = chartW / Math.max(1, effectiveCount);

  /* ── Gesture handlers (JS-thread via runOnJS) ────────────────────── */

  const savePanStart = useCallback(() => {
    panStartRef.current = visibleStartRef.current;
  }, []);

  const handlePanUpdate = useCallback((translationX: number) => {
    const cw = chartW / Math.max(1, visibleCountRef.current);
    const delta = Math.round(-translationX / cw);
    const maxS = Math.max(0, totalCandles - visibleCountRef.current);
    const newStart = Math.max(0, Math.min(maxS, panStartRef.current + delta));
    setVisibleStart(newStart);
    visibleStartRef.current = newStart;
  }, [chartW, totalCandles]);

  const savePinchStart = useCallback(() => {
    pinchStartRef.current = visibleCountRef.current;
  }, []);

  const handlePinchUpdate = useCallback((scale: number) => {
    const newCount = Math.max(MIN_VISIBLE, Math.min(totalCandles, Math.round(pinchStartRef.current / scale)));
    setVisibleCount(newCount);
    visibleCountRef.current = newCount;
    const maxS = Math.max(0, totalCandles - newCount);
    setVisibleStart((s) => Math.min(s, maxS));
  }, [totalCandles]);

  const handleLongPress = useCallback((touchX: number, touchY: number) => {
    const relX = touchX - PAD.left;
    const cw = chartW / Math.max(1, visibleCountRef.current);
    const sliceIdx = Math.max(0, Math.min(visibleCountRef.current - 1, Math.floor(relX / cw)));
    const absIdx = visibleStartRef.current + sliceIdx;
    if (absIdx < candles.length) {
      setCrosshair({ x: PAD.left + sliceIdx * cw + cw / 2, y: touchY, candleIdx: absIdx });
    }
  }, [chartW, candles.length]);

  const dismissCrosshair = useCallback(() => {
    setCrosshair(null);
  }, []);

  /* ── Gestures ────────────────────────────────────────────────────── */

  const panGesture = Gesture.Pan()
    .minDistance(8)
    .onBegin(() => { "worklet"; runOnJS(savePanStart)(); })
    .onUpdate((e) => { "worklet"; runOnJS(handlePanUpdate)(e.translationX); })
    .onEnd(() => { "worklet"; });

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => { "worklet"; runOnJS(savePinchStart)(); })
    .onUpdate((e) => { "worklet"; runOnJS(handlePinchUpdate)(e.scale); });

  const longPressGesture = Gesture.LongPress()
    .minDuration(280)
    .onStart((e) => { "worklet"; runOnJS(handleLongPress)(e.x, e.y); });

  const tapGesture = Gesture.Tap()
    .maxDuration(200)
    .onEnd(() => { "worklet"; runOnJS(dismissCrosshair)(); });

  const navGesture = Gesture.Simultaneous(panGesture, pinchGesture);
  const allGestures = Gesture.Simultaneous(navGesture, Gesture.Exclusive(longPressGesture, tapGesture));

  /* ── SVG Computation ─────────────────────────────────────────────── */

  const computed = useMemo(() => {
    if (!visSlice.length) return null;

    const ovLevels: number[] = [
      ...(overlays.supportLevels?.map((l) => l.price) ?? []),
      ...(overlays.resistanceLevels?.map((l) => l.price) ?? []),
      ...(overlays.demandZones?.flatMap((z) => [z.top, z.bottom]) ?? []),
      ...(overlays.supplyZones?.flatMap((z) => [z.top, z.bottom]) ?? []),
      overlays.ema20 ?? 0,
      overlays.ema50 ?? 0,
      overlays.longZone?.entryLow ?? 0,
      overlays.longZone?.entryHigh ?? 0,
      overlays.longZone?.stopLoss ?? 0,
      overlays.longZone?.takeProfit ?? 0,
      overlays.shortZone?.entryLow ?? 0,
      overlays.shortZone?.entryHigh ?? 0,
      overlays.shortZone?.stopLoss ?? 0,
      overlays.shortZone?.takeProfit ?? 0,
      overlays.currentPrice ?? 0,
    ].filter((v) => v > 0);

    let pMax = Math.max(...visSlice.map((c) => c.high), ...ovLevels);
    let pMin = Math.min(...visSlice.map((c) => c.low), ...ovLevels.filter((v) => v > 0));
    if (ovLevels.length) {
      pMax = Math.max(pMax, ...ovLevels);
      pMin = Math.min(pMin, ...ovLevels.filter((v) => v > 0));
    }

    const pad = (pMax - pMin) * 0.08;
    pMax += pad; pMin -= pad;
    const range = pMax - pMin || 1;

    const cw = chartW / Math.max(1, visSlice.length);
    const bw = cw * (1 - GAP_RATIO);

    const toY = (p: number) => ((pMax - p) / range) * chartH;
    const toX = (i: number) => i * cw + cw / 2;

    /* Candle shapes */
    const shapes = visSlice.map((c, i) => {
      const x = toX(i);
      const bTop = toY(Math.max(c.open, c.close));
      const bBot = toY(Math.min(c.open, c.close));
      const isUp = c.close >= c.open;
      return {
        key: String(c.openTime),
        wickX: x, wickTop: toY(c.high), wickBot: toY(c.low),
        bodyX: x - bw / 2, bodyY: bTop,
        bodyW: Math.max(bw, 1), bodyH: Math.max(bBot - bTop, 1),
        color: isUp ? upColor : downColor,
        isUp,
        open: c.open, high: c.high, low: c.low, close: c.close,
        volume: c.volume,
        openTime: c.openTime,
      };
    });

    /* Grid labels */
    const numLabels = 5;
    const gridLabels = Array.from({ length: numLabels + 1 }, (_, i) => {
      const price = pMin + (range * i) / numLabels;
      const y = toY(price);
      return { y, text: fmtPrice(price), price };
    });

    /* Time labels (bottom) - show every Nth candle */
    const timeStep = Math.max(1, Math.floor(visSlice.length / 4));
    const timeLabels = visSlice
      .filter((_, i) => i % timeStep === 0 || i === visSlice.length - 1)
      .map((c, i) => ({ x: toX(i * timeStep), label: fmtTime(c.openTime, "5m") }));

    /* S/R lines */
    const inRange = (p: number) => p >= pMin && p <= pMax;
    const supLines = (overlays.supportLevels ?? []).filter((l) => inRange(l.price)).slice(0, 4)
      .map((l) => ({ y: toY(l.price), price: l.price, strength: l.strengthLabel }));
    const resLines = (overlays.resistanceLevels ?? []).filter((l) => inRange(l.price)).slice(0, 4)
      .map((l) => ({ y: toY(l.price), price: l.price, strength: l.strengthLabel }));

    /* Demand/Supply zones */
    const demandRects = (overlays.demandZones ?? []).slice(0, 3).map((z) => {
      const yTop = toY(Math.min(pMax, z.top));
      const yBot = toY(Math.max(pMin, z.bottom));
      return { y: yTop, h: Math.max(yBot - yTop, 1), strength: z.strength };
    }).filter((z) => z.h > 0);

    const supplyRects = (overlays.supplyZones ?? []).slice(0, 3).map((z) => {
      const yTop = toY(Math.min(pMax, z.top));
      const yBot = toY(Math.max(pMin, z.bottom));
      return { y: yTop, h: Math.max(yBot - yTop, 1), strength: z.strength };
    }).filter((z) => z.h > 0);

    /* Trade zones */
    const activeZone = overlays.biasBullish ? overlays.longZone : overlays.shortZone;
    const tradeColor = overlays.biasBullish ? upColor : downColor;
    let entryRect = null, slLine = null, tpLine = null;
    if (activeZone) {
      if (inRange(activeZone.entryHigh) || inRange(activeZone.entryLow)) {
        const yTop = toY(Math.min(pMax, activeZone.entryHigh));
        const yBot = toY(Math.max(pMin, activeZone.entryLow));
        entryRect = { y: yTop, h: Math.max(yBot - yTop, 1) };
      }
      if (inRange(activeZone.stopLoss)) slLine = { y: toY(activeZone.stopLoss), price: activeZone.stopLoss };
      if (inRange(activeZone.takeProfit)) tpLine = { y: toY(activeZone.takeProfit), price: activeZone.takeProfit };
    }

    /* EMA lines */
    const ema20Y = overlays.ema20 && inRange(overlays.ema20) ? toY(overlays.ema20) : null;
    const ema50Y = overlays.ema50 && inRange(overlays.ema50) ? toY(overlays.ema50) : null;

    /* Current price line */
    const curPriceY = overlays.currentPrice && inRange(overlays.currentPrice) ? toY(overlays.currentPrice) : null;

    /* Structure point labels */
    const structLabels = (overlays.structurePoints ?? []).slice(-8).map((pt) => {
      const sliceIdx = pt.index - effectiveStart;
      if (sliceIdx < 0 || sliceIdx >= visSlice.length) return null;
      const x = toX(sliceIdx);
      const isHigh = pt.kind === "HH" || pt.kind === "LH";
      const y = isHigh ? toY(visSlice[sliceIdx]?.high ?? 0) - 10 : toY(visSlice[sliceIdx]?.low ?? 0) + 14;
      const color = (pt.kind === "HH" || pt.kind === "HL") ? upColor : downColor;
      return { x, y, label: pt.kind, color };
    }).filter(Boolean) as { x: number; y: number; label: string; color: string }[];

    /* Crosshair candle data */
    let crosshairCandle = null;
    if (crosshair) {
      const sliceIdx = crosshair.candleIdx - effectiveStart;
      if (sliceIdx >= 0 && sliceIdx < visSlice.length) {
        const c = visSlice[sliceIdx];
        const cx = toX(sliceIdx);
        const cy = toY(c.close);
        const isUp = c.close >= c.open;
        crosshairCandle = { ...c, cx, cy, sliceIdx, isUp };
      }
    }

    return {
      shapes, gridLabels, timeLabels,
      supLines, resLines, demandRects, supplyRects,
      entryRect, slLine, tpLine, tradeColor,
      ema20Y, ema50Y, curPriceY,
      structLabels, crosshairCandle,
      pMin, pMax, toY, range,
    };
  }, [visSlice, overlays, chartW, chartH, upColor, downColor, crosshair, effectiveStart]);

  /* ── Render ───────────────────────────────────────────────────────── */

  if (loading && candles.length === 0) {
    return (
      <View style={[styles.placeholder, { width, height, backgroundColor: bgColor }]}>
        <ActivityIndicator color={primaryColor} size="small" />
        <Text style={[styles.loadText, { color: labelColor }]}>Loading chart…</Text>
      </View>
    );
  }

  if (!computed) {
    return (
      <View style={[styles.placeholder, { width, height, backgroundColor: bgColor }]}>
        <Text style={[styles.loadText, { color: labelColor }]}>No data available</Text>
      </View>
    );
  }

  const {
    shapes, gridLabels, timeLabels,
    supLines, resLines, demandRects, supplyRects,
    entryRect, slLine, tpLine, tradeColor,
    ema20Y, ema50Y, curPriceY,
    structLabels, crosshairCandle,
  } = computed;

  /* Crosshair SVG position */
  const chX = crosshairCandle ? crosshairCandle.cx : -100;
  const chY = crosshairCandle ? crosshairCandle.cy : -100;
  const showCrosshair = !!crosshairCandle;

  return (
    <View style={{ width, height }}>
      <GestureDetector gesture={allGestures}>
        <View style={{ width, height }}>
          <Svg width={width} height={height}>
            <G x={PAD.left} y={PAD.top}>

              {/* Grid lines */}
              {gridLabels.map((l, i) => (
                <Line key={`g${i}`} x1={0} y1={l.y} x2={chartW} y2={l.y}
                  stroke={gridColor} strokeWidth={1} />
              ))}

              {/* Demand zones */}
              {demandRects.map((z, i) => (
                <Rect key={`dz${i}`} x={0} y={z.y} width={chartW} height={z.h}
                  fill={upColor} opacity={z.strength === "Strong" ? 0.1 : 0.06} />
              ))}
              {/* Supply zones */}
              {supplyRects.map((z, i) => (
                <Rect key={`sz${i}`} x={0} y={z.y} width={chartW} height={z.h}
                  fill={downColor} opacity={z.strength === "Strong" ? 0.1 : 0.06} />
              ))}

              {/* Entry zone */}
              {entryRect && (
                <Rect x={0} y={entryRect.y} width={chartW} height={entryRect.h}
                  fill={tradeColor} opacity={0.15} />
              )}

              {/* EMA lines */}
              {ema50Y !== null && (
                <Line x1={0} y1={ema50Y} x2={chartW} y2={ema50Y}
                  stroke="#9945FF" strokeWidth={1} opacity={0.6} strokeDasharray="6,3" />
              )}
              {ema20Y !== null && (
                <Line x1={0} y1={ema20Y} x2={chartW} y2={ema20Y}
                  stroke={primaryColor} strokeWidth={1} opacity={0.7} strokeDasharray="4,2" />
              )}

              {/* Support lines */}
              {supLines.map((l, i) => (
                <React.Fragment key={`sl${i}`}>
                  <Line x1={0} y1={l.y} x2={chartW} y2={l.y}
                    stroke={upColor} strokeWidth={l.strength === "Strong" ? 1.5 : 1}
                    strokeDasharray="5,3" opacity={0.65} />
                  <SvgText x={2} y={l.y - 2} fontSize={8} fill={upColor} opacity={0.8}>
                    S
                  </SvgText>
                </React.Fragment>
              ))}
              {/* Resistance lines */}
              {resLines.map((l, i) => (
                <React.Fragment key={`rl${i}`}>
                  <Line x1={0} y1={l.y} x2={chartW} y2={l.y}
                    stroke={downColor} strokeWidth={l.strength === "Strong" ? 1.5 : 1}
                    strokeDasharray="5,3" opacity={0.65} />
                  <SvgText x={2} y={l.y - 2} fontSize={8} fill={downColor} opacity={0.8}>
                    R
                  </SvgText>
                </React.Fragment>
              ))}

              {/* Stop loss line */}
              {slLine && (
                <Line x1={0} y1={slLine.y} x2={chartW} y2={slLine.y}
                  stroke={downColor} strokeWidth={1.5} strokeDasharray="6,3" opacity={0.9} />
              )}
              {/* Take profit line */}
              {tpLine && (
                <Line x1={0} y1={tpLine.y} x2={chartW} y2={tpLine.y}
                  stroke={upColor} strokeWidth={1.5} strokeDasharray="6,3" opacity={0.9} />
              )}

              {/* Current price line */}
              {curPriceY !== null && (
                <Line x1={0} y1={curPriceY} x2={chartW} y2={curPriceY}
                  stroke={primaryColor} strokeWidth={1} opacity={0.5} strokeDasharray="2,4" />
              )}

              {/* Candles */}
              {shapes.map((s) => (
                <G key={s.key}>
                  <Line x1={s.wickX} y1={s.wickTop} x2={s.wickX} y2={s.wickBot}
                    stroke={s.color} strokeWidth={1} opacity={0.8} />
                  <Rect x={s.bodyX} y={s.bodyY} width={s.bodyW} height={s.bodyH}
                    fill={s.color} rx={1} />
                </G>
              ))}

              {/* Structure labels */}
              {structLabels.map((l, i) => (
                <SvgText key={`sp${i}`} x={l.x} y={l.y} fontSize={8}
                  fill={l.color} textAnchor="middle" fontWeight="bold" opacity={0.9}>
                  {l.label}
                </SvgText>
              ))}

              {/* Crosshair */}
              {showCrosshair && (
                <G>
                  {/* Vertical line */}
                  <Line x1={chX} y1={0} x2={chX} y2={chartH}
                    stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="3,3" />
                  {/* Horizontal line */}
                  <Line x1={0} y1={chY} x2={chartW} y2={chY}
                    stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="3,3" />
                  {/* Crosshair dot */}
                  <Rect x={chX - 3} y={chY - 3} width={6} height={6}
                    fill="white" rx={3} opacity={0.9} />
                </G>
              )}

              {/* Time labels */}
              {timeLabels.map((l, i) => (
                <SvgText key={`t${i}`} x={l.x} y={chartH + 16} fontSize={8}
                  fill={labelColor} textAnchor="middle">
                  {l.label}
                </SvgText>
              ))}

            </G>
          </Svg>

          {/* Y-axis price labels (absolute positioned Text for crisp rendering) */}
          {gridLabels.map((l, i) => (
            <Text key={`gl${i}`}
              style={[styles.yLabel, { color: labelColor, top: PAD.top + l.y - 7, right: 0, width: PAD.right - 4 }]}>
              {l.text}
            </Text>
          ))}

          {/* Overlay price labels on right */}
          {supLines.map((l, i) => (
            <Text key={`sl${i}`}
              style={[styles.overlayLabel, { color: upColor, top: PAD.top + l.y - 7, right: 0, width: PAD.right - 4 }]}>
              {fmtPrice(l.price)}
            </Text>
          ))}
          {resLines.map((l, i) => (
            <Text key={`rl${i}`}
              style={[styles.overlayLabel, { color: downColor, top: PAD.top + l.y - 7, right: 0, width: PAD.right - 4 }]}>
              {fmtPrice(l.price)}
            </Text>
          ))}
          {slLine && (
            <Text style={[styles.overlayLabel, { color: downColor, top: PAD.top + slLine.y - 7, right: 0, width: PAD.right - 4 }]}>
              SL
            </Text>
          )}
          {tpLine && (
            <Text style={[styles.overlayLabel, { color: upColor, top: PAD.top + tpLine.y - 7, right: 0, width: PAD.right - 4 }]}>
              TP
            </Text>
          )}
          {curPriceY !== null && overlays.currentPrice && (
            <View style={[styles.curPriceBadge, { top: PAD.top + curPriceY - 9, right: 0, backgroundColor: primaryColor }]}>
              <Text style={styles.curPriceBadgeText}>{fmtPrice(overlays.currentPrice)}</Text>
            </View>
          )}
        </View>
      </GestureDetector>

      {/* Crosshair Tooltip */}
      {showCrosshair && crosshairCandle && (
        <View
          style={[
            styles.tooltip,
            {
              backgroundColor: "#0F1628",
              borderColor: "rgba(255,255,255,0.12)",
              left: crosshairCandle.cx + PAD.left < width / 2 ? crosshairCandle.cx + PAD.left + 8 : undefined,
              right: crosshairCandle.cx + PAD.left >= width / 2 ? width - crosshairCandle.cx - PAD.left + 8 : undefined,
              top: Math.min(PAD.top, Math.max(10, crosshairCandle.cy + PAD.top - 50)),
            },
          ]}
        >
          <Text style={[styles.tooltipTime, { color: labelColor }]}>
            {fmtTime(crosshairCandle.openTime, "5m")}
          </Text>
          {[
            { k: "O", v: fmtPriceFull(crosshairCandle.open), c: crosshairCandle.isUp ? upColor : downColor },
            { k: "H", v: fmtPriceFull(crosshairCandle.high), c: upColor },
            { k: "L", v: fmtPriceFull(crosshairCandle.low),  c: downColor },
            { k: "C", v: fmtPriceFull(crosshairCandle.close), c: crosshairCandle.isUp ? upColor : downColor },
          ].map((row) => (
            <View key={row.k} style={styles.tooltipRow}>
              <Text style={[styles.tooltipKey, { color: labelColor }]}>{row.k}</Text>
              <Text style={[styles.tooltipVal, { color: row.c }]}>{row.v}</Text>
            </View>
          ))}
          <Text style={[styles.tooltipVol, { color: labelColor }]}>
            Vol {crosshairCandle.volume >= 1000 ? `${(crosshairCandle.volume / 1000).toFixed(1)}k` : crosshairCandle.volume.toFixed(0)}
          </Text>
        </View>
      )}

      {/* Zoom hint */}
      {!crosshair && (
        <View style={styles.hint}>
          <Text style={[styles.hintText, { color: labelColor }]}>
            Pinch to zoom · Pan to scroll · Hold for details
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: "center", justifyContent: "center", gap: 8 },
  loadText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  yLabel: {
    fontSize: 9, fontFamily: "Inter_400Regular",
    position: "absolute", textAlign: "right",
  },
  overlayLabel: {
    fontSize: 9, fontFamily: "Inter_700Bold",
    position: "absolute", textAlign: "right",
  },
  curPriceBadge: {
    position: "absolute", borderRadius: 3,
    paddingHorizontal: 4, paddingVertical: 2,
    right: 0, minWidth: 40, alignItems: "center",
  },
  curPriceBadgeText: { fontSize: 8, fontFamily: "Inter_700Bold", color: "#fff" },
  tooltip: {
    position: "absolute",
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    gap: 3, zIndex: 100,
    ...Platform.select({ ios: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 6 } }),
  },
  tooltipTime: { fontSize: 9, fontFamily: "Inter_500Medium", marginBottom: 2, letterSpacing: 0.3 },
  tooltipRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  tooltipKey: { fontSize: 10, fontFamily: "Inter_500Medium" },
  tooltipVal: { fontSize: 10, fontFamily: "Inter_700Bold" },
  tooltipVol: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  hint: { position: "absolute", bottom: 2, left: 0, right: 0, alignItems: "center" },
  hintText: { fontSize: 8, fontFamily: "Inter_400Regular", opacity: 0.5 },
});
