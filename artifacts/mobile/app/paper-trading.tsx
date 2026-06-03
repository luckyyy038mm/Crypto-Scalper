import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMultiCoinData } from "@/context/TradingContext";
import { useBinanceData } from "@/hooks/useBinanceData";
import { useAutoTrader } from "@/hooks/useAutoTrader";
import { useColors } from "@/hooks/useColors";
import { useSignalAnalysis } from "@/hooks/useSignal";
import {
  COIN_LABEL,
  LEVERAGES,
  PAPER_COINS,
  STARTING_BALANCE,
  TAKER_FEE,
  calcLiquidation,
  calcUnrealizedPnl,
  calcPnlPct,
  usePaperTrading,
  type LeverageValue,
  type PaperCoin,
  type PaperDirection,
  type PaperPosition,
  type PaperTrade,
} from "@/hooks/usePaperTrading";

/* ── Helpers ─────────────────────────────────────────────────────── */

function fmt$(v: number, dp = 2) {
  const abs = Math.abs(v);
  const str = abs >= 1000 ? abs.toFixed(dp === 0 ? 0 : 2) : abs.toFixed(dp);
  return `${v < 0 ? "-" : ""}$${str}`;
}
function fmtPct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function fmtDur(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
function fmtPrice(p: number) {
  if (p >= 10000) return p.toFixed(1);
  if (p >= 100)   return p.toFixed(2);
  if (p >= 1)     return p.toFixed(3);
  return p.toFixed(4);
}

type Tab = "trade" | "history" | "stats" | "signals";
const TABS: { id: Tab; label: string }[] = [
  { id: "trade",   label: "Trade"   },
  { id: "history", label: "History" },
  { id: "stats",   label: "Stats"   },
  { id: "signals", label: "Signals" },
];

/* ── Sub-components ──────────────────────────────────────────────── */

function Pill({
  label, active, color, onPress,
}: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.pill, active && { backgroundColor: color + "28", borderColor: color }]}
    >
      <Text style={[s.pillText, { color: active ? color : "#6B7280" }]}>{label}</Text>
    </Pressable>
  );
}

function StatCell({
  label, value, color, colors,
}: { label: string; value: string; color?: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={s.statCell}>
      <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[s.statValue, { color: color ?? colors.foreground }]}>{value}</Text>
    </View>
  );
}

/* ── Account Summary ────────────────────────────────────────────── */

function AccountBar({ analytics, colors }: { analytics: ReturnType<typeof usePaperTrading>["analytics"]; colors: ReturnType<typeof useColors> }) {
  const pnlColor = analytics.totalPnl >= 0 ? colors.up : colors.down;
  return (
    <View style={[s.accountBar, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={s.accountItem}>
        <Text style={[s.accountLabel, { color: colors.mutedForeground }]}>Balance</Text>
        <Text style={[s.accountValue, { color: colors.foreground }]}>{fmt$(analytics.totalBalance)}</Text>
      </View>
      <View style={[s.accountDiv, { backgroundColor: colors.border }]} />
      <View style={s.accountItem}>
        <Text style={[s.accountLabel, { color: colors.mutedForeground }]}>Available</Text>
        <Text style={[s.accountValue, { color: colors.foreground }]}>{fmt$(analytics.cashBalance)}</Text>
      </View>
      <View style={[s.accountDiv, { backgroundColor: colors.border }]} />
      <View style={s.accountItem}>
        <Text style={[s.accountLabel, { color: colors.mutedForeground }]}>Total PnL</Text>
        <Text style={[s.accountValue, { color: pnlColor }]}>{fmt$(analytics.totalPnl)}</Text>
      </View>
      <View style={[s.accountDiv, { backgroundColor: colors.border }]} />
      <View style={s.accountItem}>
        <Text style={[s.accountLabel, { color: colors.mutedForeground }]}>Win Rate</Text>
        <Text style={[s.accountValue, { color: analytics.winRate >= 50 ? colors.up : colors.down }]}>
          {analytics.totalTrades > 0 ? `${analytics.winRate.toFixed(0)}%` : "—"}
        </Text>
      </View>
    </View>
  );
}

/* ── Position Card ──────────────────────────────────────────────── */

function PositionCard({
  pos, currentPrice, onClose, onMoveSL, onAdjustTP, colors,
}: {
  pos: PaperPosition;
  currentPrice: number;
  onClose: () => void;
  onMoveSL: () => void;
  onAdjustTP: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const unrealized = currentPrice > 0 ? calcUnrealizedPnl(pos, currentPrice) - 0 : 0;
  const pnlPct     = calcPnlPct(unrealized, pos.margin);
  const pnlColor   = unrealized >= 0 ? colors.up : colors.down;
  const dirColor   = pos.direction === "LONG" ? colors.up : colors.down;
  const elapsed    = Date.now() - pos.openedAt;
  const ticker     = COIN_LABEL[pos.coin];

  return (
    <View style={[s.posCard, { backgroundColor: colors.card, borderColor: pos.direction === "LONG" ? colors.up + "44" : colors.down + "44" }]}>
      <View style={s.posHeader}>
        <View style={s.posLeft}>
          <View style={[s.dirBadge, { backgroundColor: dirColor + "22" }]}>
            <Text style={[s.dirText, { color: dirColor }]}>{pos.direction}</Text>
          </View>
          <Text style={[s.posCoin, { color: colors.foreground }]}>{ticker}/USDT</Text>
          <Text style={[s.posLev, { color: colors.mutedForeground }]}>{pos.leverage}×</Text>
          {pos.signalFollowed && (
            <View style={[s.sigBadge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[s.sigBadgeText, { color: colors.primary }]}>AUTO</Text>
            </View>
          )}
        </View>
        <View style={s.posRight}>
          <Text style={[s.posPnl, { color: pnlColor }]}>{fmt$(unrealized)}</Text>
          <Text style={[s.posPnlPct, { color: pnlColor }]}>{fmtPct(pnlPct)}</Text>
        </View>
      </View>

      <View style={s.posGrid}>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>Entry</Text>
          <Text style={[s.posGVal, { color: colors.foreground }]}>${fmtPrice(pos.entryPrice)}</Text>
        </View>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>Current</Text>
          <Text style={[s.posGVal, { color: colors.foreground }]}>
            {currentPrice > 0 ? `$${fmtPrice(currentPrice)}` : "—"}
          </Text>
        </View>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>Liq. Price</Text>
          <Text style={[s.posGVal, { color: colors.down }]}>${fmtPrice(pos.liquidationPrice)}</Text>
        </View>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>Size</Text>
          <Text style={[s.posGVal, { color: colors.foreground }]}>{fmt$(pos.notional, 0)}</Text>
        </View>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>SL</Text>
          <Text style={[s.posGVal, { color: colors.down }]}>{pos.stopLoss ? `$${fmtPrice(pos.stopLoss)}` : "—"}</Text>
        </View>
        <View style={s.posGridItem}>
          <Text style={[s.posGKey, { color: colors.mutedForeground }]}>TP</Text>
          <Text style={[s.posGVal, { color: colors.up }]}>{pos.takeProfit ? `$${fmtPrice(pos.takeProfit)}` : "—"}</Text>
        </View>
      </View>

      <View style={[s.posDivider, { backgroundColor: colors.border }]} />
      <View style={s.posActions}>
        <Text style={[s.posTime, { color: colors.mutedForeground }]}>{fmtDur(elapsed)}</Text>
        <View style={s.posButtons}>
          <Pressable style={[s.posBtn, { borderColor: colors.border }]} onPress={onMoveSL}>
            <Text style={[s.posBtnText, { color: colors.mutedForeground }]}>Move SL</Text>
          </Pressable>
          <Pressable style={[s.posBtn, { borderColor: colors.border }]} onPress={onAdjustTP}>
            <Text style={[s.posBtnText, { color: colors.mutedForeground }]}>Adjust TP</Text>
          </Pressable>
          <Pressable style={[s.closePosBtn, { backgroundColor: colors.down + "22", borderColor: colors.down + "55" }]} onPress={onClose}>
            <Text style={[s.posBtnText, { color: colors.down, fontFamily: "Inter_600SemiBold" }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* ── Order Form ──────────────────────────────────────────────────── */

function OrderForm({
  selectedCoin, prices, cashBalance, onExecute, colors,
}: {
  selectedCoin: PaperCoin;
  prices: Record<PaperCoin, number>;
  cashBalance: number;
  onExecute: (params: {
    direction: PaperDirection;
    marginUSDT: number;
    leverage: LeverageValue;
    orderType: "market" | "limit";
    limitPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [direction, setDirection] = useState<PaperDirection>("LONG");
  const [leverage, setLeverage]   = useState<LeverageValue>(5);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [sizeInput, setSizeInput] = useState("");
  const [slInput, setSlInput]     = useState("");
  const [tpInput, setTpInput]     = useState("");
  const [limitInput, setLimitInput] = useState("");

  const currentPrice = prices[selectedCoin] ?? 0;
  const marginUSDT   = parseFloat(sizeInput) || 0;
  const notional     = marginUSDT * leverage;
  const entryPrice   = orderType === "limit" && parseFloat(limitInput) > 0 ? parseFloat(limitInput) : currentPrice;
  const liqPrice     = entryPrice > 0 ? calcLiquidation(entryPrice, leverage, direction) : 0;
  const entryFee     = notional * TAKER_FEE;
  const riskUSD      = parseFloat(slInput) > 0 && entryPrice > 0
    ? Math.abs(parseFloat(slInput) - entryPrice) / entryPrice * notional
    : 0;
  const rewardUSD    = parseFloat(tpInput) > 0 && entryPrice > 0
    ? Math.abs(parseFloat(tpInput) - entryPrice) / entryPrice * notional
    : 0;
  const rr           = riskUSD > 0 ? rewardUSD / riskUSD : 0;

  const setPct = (pct: number) => {
    setSizeInput(((cashBalance * pct) / 100).toFixed(2));
  };

  const canExecute = marginUSDT >= 0.5 && marginUSDT <= cashBalance && currentPrice > 0;

  const execute = () => {
    if (!canExecute) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onExecute({
      direction, marginUSDT: parseFloat(sizeInput), leverage,
      orderType,
      limitPrice: orderType === "limit" ? parseFloat(limitInput) : undefined,
      stopLoss: parseFloat(slInput) > 0 ? parseFloat(slInput) : undefined,
      takeProfit: parseFloat(tpInput) > 0 ? parseFloat(tpInput) : undefined,
    });
    setSizeInput(""); setSlInput(""); setTpInput(""); setLimitInput("");
  };

  return (
    <View style={[s.form, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[s.formTitle, { color: colors.mutedForeground }]}>NEW ORDER</Text>

      {/* Direction */}
      <View style={s.dirRow}>
        <Pressable
          style={[s.dirBtn, direction === "LONG" && { backgroundColor: colors.up + "22", borderColor: colors.up }]}
          onPress={() => setDirection("LONG")}
        >
          <Text style={[s.dirBtnText, { color: direction === "LONG" ? colors.up : colors.mutedForeground }]}>▲ LONG</Text>
        </Pressable>
        <Pressable
          style={[s.dirBtn, direction === "SHORT" && { backgroundColor: colors.down + "22", borderColor: colors.down }]}
          onPress={() => setDirection("SHORT")}
        >
          <Text style={[s.dirBtnText, { color: direction === "SHORT" ? colors.down : colors.mutedForeground }]}>▼ SHORT</Text>
        </Pressable>
      </View>

      {/* Order type */}
      <View style={s.rowGap}>
        {(["market", "limit"] as const).map((t) => (
          <Pressable key={t} onPress={() => setOrderType(t)} style={[s.smallPill, orderType === t && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
            <Text style={[s.smallPillText, { color: orderType === t ? colors.primary : colors.mutedForeground }]}>
              {t === "market" ? "Market" : "Limit"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Limit price */}
      {orderType === "limit" && (
        <View style={[s.inputRow, { borderColor: colors.border }]}>
          <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>Limit Price $</Text>
          <TextInput
            style={[s.input, { color: colors.foreground }]}
            value={limitInput}
            onChangeText={setLimitInput}
            keyboardType="decimal-pad"
            placeholder={currentPrice > 0 ? fmtPrice(currentPrice) : "0.00"}
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
      )}

      {/* Size input */}
      <View style={[s.inputRow, { borderColor: colors.border }]}>
        <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>Margin (USDT)</Text>
        <TextInput
          style={[s.input, { color: colors.foreground }]}
          value={sizeInput}
          onChangeText={setSizeInput}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      <View style={s.pctRow}>
        {[25, 50, 75, 100].map((pct) => (
          <Pressable key={pct} onPress={() => setPct(pct)} style={[s.pctBtn, { borderColor: colors.border }]}>
            <Text style={[s.pctText, { color: colors.mutedForeground }]}>{pct}%</Text>
          </Pressable>
        ))}
      </View>

      {/* Leverage */}
      <Text style={[s.subLabel, { color: colors.mutedForeground }]}>LEVERAGE</Text>
      <View style={s.levRow}>
        {LEVERAGES.map((lev) => (
          <Pressable key={lev} onPress={() => setLeverage(lev)}
            style={[s.levBtn, { borderColor: colors.border }, leverage === lev && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
          >
            <Text style={[s.levText, { color: leverage === lev ? colors.primary : colors.mutedForeground }]}>{lev}×</Text>
          </Pressable>
        ))}
      </View>

      {/* SL / TP */}
      <View style={s.slTpRow}>
        <View style={[s.inputRow, s.half, { borderColor: colors.border }]}>
          <Text style={[s.inputLabel, { color: colors.down }]}>SL $</Text>
          <TextInput style={[s.input, { color: colors.foreground }]} value={slInput} onChangeText={setSlInput}
            keyboardType="decimal-pad" placeholder="optional" placeholderTextColor={colors.mutedForeground} />
        </View>
        <View style={[s.inputRow, s.half, { borderColor: colors.border }]}>
          <Text style={[s.inputLabel, { color: colors.up }]}>TP $</Text>
          <TextInput style={[s.input, { color: colors.foreground }]} value={tpInput} onChangeText={setTpInput}
            keyboardType="decimal-pad" placeholder="optional" placeholderTextColor={colors.mutedForeground} />
        </View>
      </View>

      {/* Preview */}
      {marginUSDT > 0 && entryPrice > 0 && (
        <View style={[s.preview, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={s.previewRow}>
            <Text style={[s.previewKey, { color: colors.mutedForeground }]}>Entry</Text>
            <Text style={[s.previewVal, { color: colors.foreground }]}>${fmtPrice(entryPrice)}</Text>
          </View>
          <View style={s.previewRow}>
            <Text style={[s.previewKey, { color: colors.mutedForeground }]}>Position Size</Text>
            <Text style={[s.previewVal, { color: colors.foreground }]}>{fmt$(notional, 0)}</Text>
          </View>
          <View style={s.previewRow}>
            <Text style={[s.previewKey, { color: colors.mutedForeground }]}>Liquidation</Text>
            <Text style={[s.previewVal, { color: colors.down }]}>${fmtPrice(liqPrice)}</Text>
          </View>
          <View style={s.previewRow}>
            <Text style={[s.previewKey, { color: colors.mutedForeground }]}>Est. Fee</Text>
            <Text style={[s.previewVal, { color: colors.mutedForeground }]}>{fmt$(entryFee, 3)}</Text>
          </View>
          {rr > 0 && (
            <View style={s.previewRow}>
              <Text style={[s.previewKey, { color: colors.mutedForeground }]}>Risk/Reward</Text>
              <Text style={[s.previewVal, { color: colors.wait }]}>1:{rr.toFixed(2)}</Text>
            </View>
          )}
        </View>
      )}

      <Pressable
        style={[s.execBtn, { backgroundColor: canExecute ? (direction === "LONG" ? colors.up : colors.down) : colors.border }]}
        onPress={execute}
        disabled={!canExecute}
      >
        <Text style={[s.execText, { color: canExecute ? "#fff" : colors.mutedForeground }]}>
          {direction === "LONG" ? "▲ OPEN LONG" : "▼ OPEN SHORT"}
        </Text>
      </Pressable>
    </View>
  );
}

/* ── Trade History Item ──────────────────────────────────────────── */

function HistoryItem({ trade, colors }: { trade: PaperTrade; colors: ReturnType<typeof useColors> }) {
  const pnlColor = trade.pnl >= 0 ? colors.up : colors.down;
  const dirColor = trade.direction === "LONG" ? colors.up : colors.down;
  return (
    <View style={[s.histItem, { borderBottomColor: colors.border }]}>
      <View style={s.histLeft}>
        <View style={[s.dirBadge, { backgroundColor: dirColor + "22" }]}>
          <Text style={[s.dirText, { color: dirColor }]}>{trade.direction[0]}</Text>
        </View>
        <View>
          <Text style={[s.histCoin, { color: colors.foreground }]}>{COIN_LABEL[trade.coin]}/USDT · {trade.leverage}×</Text>
          <Text style={[s.histSub, { color: colors.mutedForeground }]}>
            {new Date(trade.closedAt).toLocaleDateString()} · {fmtDur(trade.duration)}
          </Text>
        </View>
      </View>
      <View style={s.histRight}>
        <Text style={[s.histPnl, { color: pnlColor }]}>{fmt$(trade.pnl)}</Text>
        <Text style={[s.histPct, { color: pnlColor }]}>{fmtPct(trade.pnlPct)}</Text>
        <Text style={[s.histReason, { color: colors.mutedForeground }]}>{trade.exitReason}</Text>
      </View>
    </View>
  );
}

/* ── Main Screen ─────────────────────────────────────────────────── */

export default function PaperTradingScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const topPad   = Platform.OS === "web" ? 60 : insets.top;

  const [activeTab, setActiveTab]       = useState<Tab>("trade");
  const [selectedCoin, setSelectedCoin] = useState<PaperCoin>("BTCUSDT");
  const [signalFollow, setSignalFollow] = useState(false);
  const [followLeverage, setFollowLev]  = useState<LeverageValue>(2);
  const [followRisk, setFollowRisk]     = useState(10);
  const [autoTradeEnabled, setAutoTrade] = useState(false);
  const [autoThreshold, setAutoThreshold] = useState(62);

  /* Live prices for all coins */
  const btcData = useBinanceData("BTCUSDT");
  const ethData = useBinanceData("ETHUSDT");
  const solData = useBinanceData("SOLUSDT");
  const xrpData = useBinanceData("XRPUSDT");

  const prices = useMemo<Record<PaperCoin, number>>(() => ({
    BTCUSDT: btcData.price,
    ETHUSDT: ethData.price,
    SOLUSDT: solData.price,
    XRPUSDT: xrpData.price,
  }), [btcData.price, ethData.price, solData.price, xrpData.price]);

  const currentData = useMemo(() => {
    switch (selectedCoin) {
      case "ETHUSDT": return ethData;
      case "SOLUSDT": return solData;
      case "XRPUSDT": return xrpData;
      default:         return btcData;
    }
  }, [selectedCoin, btcData, ethData, solData, xrpData]);

  /* Multi-coin engines for auto trader */
  const allEngines = useMultiCoinData();
  const autoState  = useAutoTrader(allEngines, autoTradeEnabled, autoThreshold);

  /* Signal for selected coin */
  const signalAnalysis = useSignalAnalysis(currentData, selectedCoin);
  const currentSignal  = signalAnalysis.signal;

  const {
    loaded, positions, history, cashBalance, analytics,
    openTrade, closeTrade, moveStopLoss, adjustTakeProfit, resetAccount, followSignal,
    prevSignalRef,
  } = usePaperTrading(prices);

  /* Signal follow — trigger when signal changes */
  const prevSignal = prevSignalRef.current;
  if (signalFollow && currentSignal !== "WAIT" && currentSignal !== prevSignal) {
    prevSignalRef.current = currentSignal;
    followSignal({ coin: selectedCoin, signal: currentSignal as "LONG" | "SHORT", leverage: followLeverage, riskPct: followRisk });
  } else if (currentSignal !== prevSignal) {
    prevSignalRef.current = currentSignal;
  }

  const handleOpen = useCallback((params: {
    direction: "LONG" | "SHORT";
    marginUSDT: number;
    leverage: LeverageValue;
    orderType: "market" | "limit";
    limitPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => {
    openTrade({ coin: selectedCoin, ...params, signalFollowed: false });
  }, [openTrade, selectedCoin]);

  const handleClose = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeTrade(id, "manual");
  }, [closeTrade]);

  const handleMoveSL = useCallback((pos: PaperPosition) => {
    Alert.prompt("Move Stop Loss", "Enter new stop loss price:", (val) => {
      const p = parseFloat(val ?? "");
      if (p > 0) moveStopLoss(pos.id, p);
    }, "plain-text", pos.stopLoss?.toString() ?? "");
  }, [moveStopLoss]);

  const handleAdjustTP = useCallback((pos: PaperPosition) => {
    Alert.prompt("Adjust Take Profit", "Enter new take profit price:", (val) => {
      const p = parseFloat(val ?? "");
      if (p > 0) adjustTakeProfit(pos.id, p);
    }, "plain-text", pos.takeProfit?.toString() ?? "");
  }, [adjustTakeProfit]);

  const handleReset = () => {
    Alert.alert("Reset Account", `This will reset your balance to $${STARTING_BALANCE} and clear all trades. Continue?`,
      [{ text: "Cancel", style: "cancel" }, { text: "Reset", style: "destructive", onPress: resetAccount }]);
  };

  /* Signal color */
  const sigColor = currentSignal === "LONG" ? colors.up : currentSignal === "SHORT" ? colors.down : colors.wait;

  if (!loaded) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <View style={s.headerLeft}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <View>
            <Text style={[s.title, { color: colors.foreground }]}>Paper Trading</Text>
            <Text style={[s.subtitle, { color: colors.mutedForeground }]}>Simulated · Real Market Data</Text>
          </View>
        </View>
        <Pressable onPress={handleReset} style={[s.resetBtn, { borderColor: colors.border }]}>
          <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
          <Text style={[s.resetText, { color: colors.mutedForeground }]}>Reset</Text>
        </Pressable>
      </View>

      {/* Account bar */}
      <AccountBar analytics={analytics} colors={colors} />

      {/* Tabs */}
      <View style={[s.tabBar, { borderBottomColor: colors.border }]}>
        {TABS.map((tab) => (
          <Pressable key={tab.id} style={s.tab} onPress={() => setActiveTab(tab.id)}>
            <Text style={[s.tabText, { color: activeTab === tab.id ? colors.primary : colors.mutedForeground }]}>
              {tab.label}
            </Text>
            {activeTab === tab.id && <View style={[s.tabLine, { backgroundColor: colors.primary }]} />}
          </Pressable>
        ))}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>

        {/* ── TRADE TAB ──────────────────────────────────────── */}
        {activeTab === "trade" && (
          <>
            {/* Coin selector */}
            <View style={s.coinRow}>
              {PAPER_COINS.map((c) => (
                <Pressable key={c} onPress={() => setSelectedCoin(c)}
                  style={[s.coinPill, selectedCoin === c && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                >
                  <Text style={[s.coinPillText, { color: selectedCoin === c ? colors.primary : colors.mutedForeground }]}>
                    {COIN_LABEL[c]}
                  </Text>
                </Pressable>
              ))}
              <View style={[s.pricePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.priceText, { color: colors.foreground }]}>
                  {prices[selectedCoin] > 0 ? `$${fmtPrice(prices[selectedCoin])}` : "—"}
                </Text>
              </View>
            </View>

            {/* Signal follow toggle */}
            <View style={[s.followCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={s.followHeader}>
                <View>
                  <Text style={[s.followTitle, { color: colors.foreground }]}>Signal Follow Mode</Text>
                  <Text style={[s.followSub, { color: colors.mutedForeground }]}>
                    Auto-trade {COIN_LABEL[selectedCoin]} signals
                  </Text>
                </View>
                <Switch
                  value={signalFollow}
                  onValueChange={setSignalFollow}
                  thumbColor={signalFollow ? colors.primary : "#6B7280"}
                  trackColor={{ false: colors.border, true: colors.primary + "88" }}
                />
              </View>
              {/* Current signal */}
              <View style={s.followSignal}>
                <Text style={[s.followSigLabel, { color: colors.mutedForeground }]}>Current Signal</Text>
                <View style={[s.signalBadge, { backgroundColor: sigColor + "22", borderColor: sigColor + "55" }]}>
                  <Text style={[s.signalText, { color: sigColor }]}>{currentSignal}</Text>
                </View>
              </View>
              {signalFollow && (
                <View style={s.followConfig}>
                  <View style={s.followRow}>
                    <Text style={[s.followConfigLabel, { color: colors.mutedForeground }]}>Leverage</Text>
                    <View style={s.levRowSmall}>
                      {([1, 2, 3, 5] as LeverageValue[]).map((lev) => (
                        <Pressable key={lev} onPress={() => setFollowLev(lev)}
                          style={[s.levBtnSm, { borderColor: colors.border }, followLeverage === lev && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                        >
                          <Text style={[s.levTextSm, { color: followLeverage === lev ? colors.primary : colors.mutedForeground }]}>{lev}×</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View style={s.followRow}>
                    <Text style={[s.followConfigLabel, { color: colors.mutedForeground }]}>Risk per trade</Text>
                    <View style={s.levRowSmall}>
                      {[5, 10, 15, 20].map((r) => (
                        <Pressable key={r} onPress={() => setFollowRisk(r)}
                          style={[s.levBtnSm, { borderColor: colors.border }, followRisk === r && { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}
                        >
                          <Text style={[s.levTextSm, { color: followRisk === r ? colors.primary : colors.mutedForeground }]}>{r}%</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <Text style={[s.followNote, { color: colors.mutedForeground }]}>
                    Signals only tracked while this screen is open.
                  </Text>
                </View>
              )}
            </View>

            {/* Auto Trade Mode */}
            <View style={[s.followCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={s.followHeader}>
                <View>
                  <Text style={[s.followTitle, { color: colors.foreground }]}>Auto Trade Mode</Text>
                  <Text style={[s.followSub, { color: colors.mutedForeground }]}>
                    All 4 coins · Quality ≥ {autoThreshold}
                  </Text>
                </View>
                <Switch
                  value={autoTradeEnabled}
                  onValueChange={setAutoTrade}
                  thumbColor={autoTradeEnabled ? "#F7931A" : "#6B7280"}
                  trackColor={{ false: colors.border, true: "#F7931A88" }}
                />
              </View>

              {/* Quality threshold selector */}
              <View style={s.followRow}>
                <Text style={[s.followConfigLabel, { color: colors.mutedForeground }]}>Quality Threshold</Text>
                <View style={s.levRowSmall}>
                  {[45, 55, 62, 70, 78].map((t) => (
                    <Pressable key={t} onPress={() => setAutoThreshold(t)}
                      style={[s.levBtnSm, { borderColor: colors.border }, autoThreshold === t && { backgroundColor: "#F7931A22", borderColor: "#F7931A" }]}
                    >
                      <Text style={[s.levTextSm, { color: autoThreshold === t ? "#F7931A" : colors.mutedForeground }]}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Per-coin quality status */}
              <View style={s.atCoinsGrid}>
                {autoState.coinStatuses.map((cs) => {
                  const qColor = cs.qualityScore >= autoThreshold ? colors.up
                    : cs.qualityScore >= autoThreshold * 0.75 ? colors.wait : colors.mutedForeground;
                  const sigColor = cs.signal === "LONG" ? colors.up : cs.signal === "SHORT" ? colors.down : colors.mutedForeground;
                  return (
                    <View key={cs.coin} style={[s.atCoinCard, { borderColor: colors.border }]}>
                      <Text style={[s.atCoinTicker, { color: colors.foreground }]}>{cs.ticker}</Text>
                      <View style={[s.atCoinSig, { backgroundColor: sigColor + "18" }]}>
                        <Text style={[s.atCoinSigText, { color: sigColor }]}>{cs.signal}</Text>
                      </View>
                      <Text style={[s.atQScore, { color: qColor }]}>{cs.qualityScore}</Text>
                      <Text style={[s.atQLabel, { color: colors.mutedForeground }]}>{cs.timeframe}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Best opportunity */}
              {autoTradeEnabled && autoState.bestOpportunity && (
                <View style={[s.atBestCard, { backgroundColor: "#F7931A12", borderColor: "#F7931A40" }]}>
                  <View style={s.atBestRow}>
                    <Text style={[s.atBestLabel, { color: "#F7931A" }]}>TOP OPPORTUNITY</Text>
                    <View style={[s.atBestSig, { backgroundColor: (autoState.bestOpportunity.signal === "LONG" ? colors.up : colors.down) + "22" }]}>
                      <Text style={[s.atBestSigText, { color: autoState.bestOpportunity.signal === "LONG" ? colors.up : colors.down }]}>
                        {autoState.bestOpportunity.signal}
                      </Text>
                    </View>
                  </View>
                  <Text style={[s.atBestCoin, { color: colors.foreground }]}>
                    {autoState.bestOpportunity.ticker} · {autoState.bestOpportunity.timeframe} · {autoState.bestOpportunity.qualityScore}/100
                  </Text>
                  <Text style={[s.atBestExpl, { color: colors.mutedForeground }]}>
                    {autoState.bestOpportunity.explanation}
                  </Text>
                  <Pressable
                    onPress={() => {
                      const opp = autoState.bestOpportunity;
                      if (!opp) return;
                      followSignal({
                        coin: opp.coin as PaperCoin,
                        signal: opp.signal,
                        leverage: followLeverage,
                        riskPct: followRisk,
                      });
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }}
                    style={[s.atBestBtn, { backgroundColor: "#F7931A", borderColor: "#F7931A" }]}
                  >
                    <Text style={[s.atBestBtnText, { color: "#fff" }]}>Execute Best Setup</Text>
                  </Pressable>
                </View>
              )}

              {autoTradeEnabled && !autoState.bestOpportunity && (
                <View style={[s.atNoneCard, { backgroundColor: colors.border + "40" }]}>
                  <Text style={[s.atNoneText, { color: colors.mutedForeground }]}>
                    No coin exceeds quality {autoThreshold}. Watching for opportunities…
                  </Text>
                </View>
              )}
            </View>

            {/* Open positions */}
            {positions.filter((p) => p.coin === selectedCoin).length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>OPEN POSITIONS</Text>
                {positions.filter((p) => p.coin === selectedCoin).map((pos) => (
                  <PositionCard
                    key={pos.id}
                    pos={pos}
                    currentPrice={prices[pos.coin] ?? 0}
                    onClose={() => handleClose(pos.id)}
                    onMoveSL={() => handleMoveSL(pos)}
                    onAdjustTP={() => handleAdjustTP(pos)}
                    colors={colors}
                  />
                ))}
              </>
            )}

            {/* All other coins with open positions */}
            {positions.filter((p) => p.coin !== selectedCoin).length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>OTHER POSITIONS</Text>
                {positions.filter((p) => p.coin !== selectedCoin).map((pos) => (
                  <PositionCard
                    key={pos.id}
                    pos={pos}
                    currentPrice={prices[pos.coin] ?? 0}
                    onClose={() => handleClose(pos.id)}
                    onMoveSL={() => handleMoveSL(pos)}
                    onAdjustTP={() => handleAdjustTP(pos)}
                    colors={colors}
                  />
                ))}
              </>
            )}

            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>ORDER FORM</Text>
            <OrderForm
              selectedCoin={selectedCoin}
              prices={prices}
              cashBalance={cashBalance}
              onExecute={handleOpen}
              colors={colors}
            />
          </>
        )}

        {/* ── HISTORY TAB ───────────────────────────────────── */}
        {activeTab === "history" && (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {history.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No closed trades yet.</Text>
            ) : (
              history.map((t) => <HistoryItem key={t.id} trade={t} colors={colors} />)
            )}
          </View>
        )}

        {/* ── STATS TAB ─────────────────────────────────────── */}
        {activeTab === "stats" && (
          <>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>PERFORMANCE</Text>
              <View style={s.statsGrid}>
                <StatCell label="Total Trades" value={`${analytics.totalTrades}`} colors={colors} />
                <StatCell label="Win Rate"     value={analytics.totalTrades > 0 ? `${analytics.winRate.toFixed(1)}%` : "—"} color={analytics.winRate >= 50 ? colors.up : colors.down} colors={colors} />
                <StatCell label="Profit Factor" value={analytics.profitFactor > 0 ? analytics.profitFactor.toFixed(2) : "—"} color={analytics.profitFactor >= 1.5 ? colors.up : analytics.profitFactor >= 1 ? colors.wait : colors.down} colors={colors} />
                <StatCell label="Avg RR"       value={analytics.avgRR > 0 ? `1:${analytics.avgRR.toFixed(2)}` : "—"} colors={colors} />
                <StatCell label="Avg Win"      value={analytics.avgWin > 0 ? fmt$(analytics.avgWin) : "—"} color={colors.up} colors={colors} />
                <StatCell label="Avg Loss"     value={analytics.avgLoss > 0 ? fmt$(analytics.avgLoss) : "—"} color={colors.down} colors={colors} />
                <StatCell label="Best Trade"   value={analytics.bestTrade ? fmt$(analytics.bestTrade.pnl) : "—"} color={colors.up} colors={colors} />
                <StatCell label="Worst Trade"  value={analytics.worstTrade ? fmt$(analytics.worstTrade.pnl) : "—"} color={colors.down} colors={colors} />
              </View>
            </View>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>STREAKS</Text>
              <View style={s.statsGrid}>
                <StatCell label="Current Streak" value={analytics.curStreak === 0 ? "—" : analytics.curStreak > 0 ? `+${analytics.curStreak} W` : `${analytics.curStreak} L`}
                  color={analytics.curStreak > 0 ? colors.up : analytics.curStreak < 0 ? colors.down : undefined} colors={colors} />
                <StatCell label="Longest Win"    value={analytics.longestWin > 0 ? `${analytics.longestWin} W` : "—"} color={colors.up} colors={colors} />
                <StatCell label="Longest Loss"   value={analytics.longestLoss > 0 ? `${analytics.longestLoss} L` : "—"} color={colors.down} colors={colors} />
                <StatCell label="Daily PnL"      value={fmt$(analytics.dailyPnl)} color={analytics.dailyPnl >= 0 ? colors.up : colors.down} colors={colors} />
              </View>
            </View>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>ACCOUNT</Text>
              <View style={s.statsGrid}>
                <StatCell label="Starting Balance" value={`$${STARTING_BALANCE}`} colors={colors} />
                <StatCell label="Current Balance"  value={fmt$(analytics.totalBalance)} color={analytics.totalPnl >= 0 ? colors.up : colors.down} colors={colors} />
                <StatCell label="Total Return"     value={fmtPct(analytics.totalPnlPct)} color={analytics.totalPnlPct >= 0 ? colors.up : colors.down} colors={colors} />
                <StatCell label="Used Margin"      value={analytics.usedMargin > 0 ? fmt$(analytics.usedMargin) : "$0.00"} colors={colors} />
              </View>
            </View>
          </>
        )}

        {/* ── SIGNALS TAB ───────────────────────────────────── */}
        {activeTab === "signals" && (
          <>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>SIGNAL ACCURACY</Text>
              {analytics.coinAccuracy.length === 0 ? (
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                  No signal-followed trades yet. Enable Signal Follow Mode and let the system trade automatically.
                </Text>
              ) : (
                analytics.coinAccuracy.map((c) => {
                  const pct = c.total > 0 ? (c.wins / c.total) * 100 : 0;
                  const color = pct >= 60 ? colors.up : pct >= 45 ? colors.wait : colors.down;
                  return (
                    <View key={c.coin} style={[s.sigAccRow, { borderBottomColor: colors.border }]}>
                      <Text style={[s.sigAccCoin, { color: colors.foreground }]}>{COIN_LABEL[c.coin]}/USDT</Text>
                      <Text style={[s.sigAccTotal, { color: colors.mutedForeground }]}>{c.total} trades</Text>
                      <View style={[s.sigAccBar, { backgroundColor: colors.border }]}>
                        <View style={[s.sigAccFill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
                      </View>
                      <Text style={[s.sigAccPct, { color }]}>{c.total > 0 ? `${pct.toFixed(0)}%` : "—"}</Text>
                    </View>
                  );
                })
              )}
            </View>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[s.cardTitle, { color: colors.mutedForeground }]}>HIGHLIGHTS</Text>
              <View style={s.statsGrid}>
                <StatCell label="Most Profitable" value={analytics.mostProfitableCoin} color={colors.up} colors={colors} />
                <StatCell label="Most Accurate"   value={analytics.mostAccurateCoin}   color={colors.primary} colors={colors} />
                <StatCell label="Signal Trades"   value={`${history.filter((t) => t.signalFollowed).length}`} colors={colors} />
                <StatCell label="Manual Trades"   value={`${history.filter((t) => !t.signalFollowed).length}`} colors={colors} />
              </View>
            </View>
            <View style={[s.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.noteText, { color: colors.mutedForeground }]}>
                Signal accuracy is tracked only for auto-followed trades. Manual trades are excluded from signal statistics.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  root:        { flex: 1 },
  loadingText: { flex: 1, textAlign: "center", marginTop: 100, fontSize: 14, fontFamily: "Inter_400Regular" },

  header:      { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft:  { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn:     { padding: 4 },
  title:       { fontSize: 17, fontFamily: "Inter_700Bold" },
  subtitle:    { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  resetBtn:    { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  resetText:   { fontSize: 10, fontFamily: "Inter_500Medium" },

  accountBar:  { flexDirection: "row", marginHorizontal: 12, marginTop: 10, borderRadius: 12, borderWidth: 1, padding: 10 },
  accountItem: { flex: 1, alignItems: "center", gap: 2 },
  accountDiv:  { width: 1, marginVertical: 4 },
  accountLabel:{ fontSize: 8, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
  accountValue:{ fontSize: 12, fontFamily: "Inter_700Bold" },

  tabBar:     { flexDirection: "row", borderBottomWidth: 1, marginTop: 10 },
  tab:        { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabText:    { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tabLine:    { position: "absolute", bottom: 0, left: "10%", right: "10%", height: 2, borderRadius: 1 },

  scroll:     { flex: 1 },
  content:    { padding: 12, gap: 10 },

  coinRow:    { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  coinPill:   { borderWidth: 1, borderRadius: 8, borderColor: "#374151", paddingHorizontal: 10, paddingVertical: 5 },
  coinPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  pricePill:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginLeft: "auto" },
  priceText:  { fontSize: 11, fontFamily: "Inter_700Bold" },

  sectionLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2, marginTop: 4 },

  card:       { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  cardTitle:  { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.4 },

  followCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  followHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  followTitle:  { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  followSub:    { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  followSignal: { flexDirection: "row", alignItems: "center", gap: 8 },
  followSigLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  signalBadge:  { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  signalText:   { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  followConfig: { gap: 8 },
  followRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  followConfigLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  followNote:   { fontSize: 9, fontFamily: "Inter_400Regular", fontStyle: "italic" },

  levRowSmall: { flexDirection: "row", gap: 4 },
  levBtnSm:   { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  levTextSm:  { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  posCard:    { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  posHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  posLeft:    { flexDirection: "row", alignItems: "center", gap: 6 },
  posRight:   { alignItems: "flex-end" },
  dirBadge:   { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  dirText:    { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  posCoin:    { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  posLev:     { fontSize: 11, fontFamily: "Inter_400Regular" },
  sigBadge:   { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  sigBadgeText: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  posPnl:     { fontSize: 15, fontFamily: "Inter_700Bold" },
  posPnlPct:  { fontSize: 10, fontFamily: "Inter_400Regular" },

  posGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  posGridItem:{ width: "30%", gap: 2 },
  posGKey:    { fontSize: 8, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
  posGVal:    { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  posDivider: { height: 1 },
  posActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  posTime:    { fontSize: 9, fontFamily: "Inter_400Regular" },
  posButtons: { flexDirection: "row", gap: 6 },
  posBtn:     { borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  closePosBtn:{ borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  posBtnText: { fontSize: 10, fontFamily: "Inter_500Medium" },

  form:       { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  formTitle:  { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.4 },
  dirRow:     { flexDirection: "row", gap: 8 },
  dirBtn:     { flex: 1, borderWidth: 1, borderRadius: 10, borderColor: "#374151", paddingVertical: 10, alignItems: "center" },
  dirBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  rowGap:     { flexDirection: "row", gap: 6 },
  smallPill:  { borderWidth: 1, borderRadius: 8, borderColor: "#374151", paddingHorizontal: 10, paddingVertical: 5 },
  smallPillText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  inputRow:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  inputLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  input:      { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right", minWidth: 80 },
  half:       { flex: 1 },
  slTpRow:    { flexDirection: "row", gap: 8 },

  pctRow:     { flexDirection: "row", gap: 6 },
  pctBtn:     { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 6, alignItems: "center" },
  pctText:    { fontSize: 10, fontFamily: "Inter_500Medium" },

  subLabel:   { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  levRow:     { flexDirection: "row", gap: 6 },
  levBtn:     { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 7, alignItems: "center" },
  levText:    { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  preview:    { borderRadius: 10, borderWidth: 1, padding: 10, gap: 5 },
  previewRow: { flexDirection: "row", justifyContent: "space-between" },
  previewKey: { fontSize: 11, fontFamily: "Inter_400Regular" },
  previewVal: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  execBtn:    { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  execText:   { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  histItem:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  histLeft:   { flexDirection: "row", alignItems: "center", gap: 8 },
  histCoin:   { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  histSub:    { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 1 },
  histRight:  { alignItems: "flex-end" },
  histPnl:    { fontSize: 13, fontFamily: "Inter_700Bold" },
  histPct:    { fontSize: 10, fontFamily: "Inter_400Regular" },
  histReason: { fontSize: 9, fontFamily: "Inter_400Regular" },

  statsGrid:  { flexDirection: "row", flexWrap: "wrap", gap: 0 },
  statCell:   { width: "50%", paddingVertical: 8, paddingHorizontal: 4, gap: 2 },
  statLabel:  { fontSize: 9, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
  statValue:  { fontSize: 15, fontFamily: "Inter_700Bold" },

  sigAccRow:  { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
  sigAccCoin: { width: 60, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sigAccTotal:{ width: 55, fontSize: 9, fontFamily: "Inter_400Regular" },
  sigAccBar:  { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  sigAccFill: { height: "100%", borderRadius: 3 },
  sigAccPct:  { width: 36, textAlign: "right", fontSize: 11, fontFamily: "Inter_700Bold" },

  emptyText:  { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 20 },

  pill:       { borderWidth: 1, borderRadius: 8, borderColor: "#374151", paddingHorizontal: 8, paddingVertical: 4 },
  pillText:   { fontSize: 10, fontFamily: "Inter_500Medium" },

  noteCard:   { borderRadius: 10, borderWidth: 1, padding: 12 },
  noteText:   { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 15, textAlign: "center" },

  /* Auto Trade Mode */
  atCoinsGrid:  { flexDirection: "row", gap: 6 },
  atCoinCard:   { flex: 1, borderWidth: 1, borderRadius: 10, padding: 8, alignItems: "center", gap: 4 },
  atCoinTicker: { fontSize: 11, fontFamily: "Inter_700Bold" },
  atCoinSig:    { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  atCoinSigText:{ fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  atQScore:     { fontSize: 16, fontFamily: "Inter_700Bold" },
  atQLabel:     { fontSize: 8, fontFamily: "Inter_400Regular" },

  atBestCard:   { borderRadius: 10, borderWidth: 1, padding: 10, gap: 6 },
  atBestRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  atBestLabel:  { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  atBestSig:    { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  atBestSigText:{ fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  atBestCoin:   { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  atBestExpl:   { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 14 },
  atBestBtn:    { borderRadius: 8, paddingVertical: 9, alignItems: "center", marginTop: 2 },
  atBestBtnText:{ fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },

  atNoneCard:   { borderRadius: 8, padding: 10 },
  atNoneText:   { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 15 },
});
