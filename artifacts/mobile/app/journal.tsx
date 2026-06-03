import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const STORAGE_KEY = "btc_trade_journal_v1";

export type TradeDirection = "LONG" | "SHORT";
export type TradeStatus = "Open" | "Closed" | "Cancelled";

export interface TradeEntry {
  id: string;
  date: string;
  time: string;
  coin: string;
  direction: TradeDirection;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  exitPrice: number | null;
  status: TradeStatus;
  pnlPct: number | null;
  riskReward: number | null;
  signalConfidence: number | null;
  setupQuality: string;
  notes: string;
}

const DEFAULT_ENTRY: Omit<TradeEntry, "id" | "date" | "time"> = {
  coin: "BTC/USDT",
  direction: "LONG",
  entry: 0,
  stopLoss: 0,
  takeProfit: 0,
  exitPrice: null,
  status: "Open",
  pnlPct: null,
  riskReward: null,
  signalConfidence: null,
  setupQuality: "",
  notes: "",
};

function fmt2(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcPnl(direction: TradeDirection, entry: number, exit: number): number {
  if (!entry || !exit) return 0;
  return direction === "LONG"
    ? ((exit - entry) / entry) * 100
    : ((entry - exit) / entry) * 100;
}

function calcRR(direction: TradeDirection, entry: number, sl: number, tp: number): number {
  if (!entry || !sl || !tp) return 0;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  return risk > 0 ? reward / risk : 0;
}

/* ── Summary Cards ─────────────────────────────────────────────── */
function SummaryCard({ label, value, color, icon, colors }: {
  label: string; value: string | number; color?: string; icon: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[scard.root, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Feather name={icon as any} size={13} color={color ?? colors.mutedForeground} />
      <Text style={[scard.val, { color: color ?? colors.foreground }]}>{value}</Text>
      <Text style={[scard.lbl, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}
const scard = StyleSheet.create({
  root: { flex: 1, minWidth: "22%", borderRadius: 12, borderWidth: 1, padding: 10, alignItems: "center", gap: 4 },
  val:  { fontSize: 18, fontFamily: "Inter_700Bold" },
  lbl:  { fontSize: 8, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase", textAlign: "center" },
});

/* ── Trade Row ──────────────────────────────────────────────────── */
function TradeRow({ trade, onDelete, onEdit, colors }: {
  trade: TradeEntry; onDelete: (id: string) => void; onEdit: (t: TradeEntry) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const isLong = trade.direction === "LONG";
  const dirColor = isLong ? colors.long : colors.short;
  const statusColor = trade.status === "Open" ? colors.wait : trade.status === "Closed" ? colors.foreground : colors.mutedForeground;
  const pnlColor = trade.pnlPct === null ? colors.mutedForeground : trade.pnlPct >= 0 ? colors.up : colors.down;

  return (
    <View style={[trow.root, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={[trow.stripe, { backgroundColor: dirColor }]} />
      <View style={trow.body}>
        <View style={trow.top}>
          <View style={trow.topLeft}>
            <View style={[trow.dirBadge, { backgroundColor: dirColor + "18", borderColor: dirColor + "40" }]}>
              <Text style={[trow.dirText, { color: dirColor }]}>{trade.direction}</Text>
            </View>
            <Text style={[trow.coin, { color: colors.foreground }]}>{trade.coin}</Text>
            <Text style={[trow.dateText, { color: colors.mutedForeground }]}>{trade.date} {trade.time}</Text>
          </View>
          <View style={trow.topRight}>
            <View style={[trow.statusBadge, { borderColor: statusColor + "50" }]}>
              <Text style={[trow.statusText, { color: statusColor }]}>{trade.status}</Text>
            </View>
          </View>
        </View>

        <View style={trow.levels}>
          <View style={trow.levelItem}>
            <Text style={[trow.levelKey, { color: colors.mutedForeground }]}>Entry</Text>
            <Text style={[trow.levelVal, { color: colors.foreground }]}>${fmt2(trade.entry)}</Text>
          </View>
          <View style={trow.levelItem}>
            <Text style={[trow.levelKey, { color: colors.mutedForeground }]}>SL</Text>
            <Text style={[trow.levelVal, { color: colors.down }]}>${fmt2(trade.stopLoss)}</Text>
          </View>
          <View style={trow.levelItem}>
            <Text style={[trow.levelKey, { color: colors.mutedForeground }]}>TP</Text>
            <Text style={[trow.levelVal, { color: colors.up }]}>${fmt2(trade.takeProfit)}</Text>
          </View>
          {trade.exitPrice !== null && (
            <View style={trow.levelItem}>
              <Text style={[trow.levelKey, { color: colors.mutedForeground }]}>Exit</Text>
              <Text style={[trow.levelVal, { color: colors.foreground }]}>${fmt2(trade.exitPrice)}</Text>
            </View>
          )}
          {trade.pnlPct !== null && (
            <View style={trow.levelItem}>
              <Text style={[trow.levelKey, { color: colors.mutedForeground }]}>PnL</Text>
              <Text style={[trow.levelVal, { color: pnlColor }]}>
                {trade.pnlPct >= 0 ? "+" : ""}{trade.pnlPct.toFixed(2)}%
              </Text>
            </View>
          )}
          {trade.riskReward !== null && trade.riskReward > 0 && (
            <View style={trow.levelItem}>
              <Text style={[trow.levelKey, { color: colors.mutedForeground }]}>RR</Text>
              <Text style={[trow.levelVal, { color: colors.foreground }]}>{trade.riskReward.toFixed(2)}</Text>
            </View>
          )}
        </View>

        <View style={trow.actions}>
          {trade.setupQuality ? (
            <Text style={[trow.quality, { color: colors.mutedForeground }]}>{trade.setupQuality}</Text>
          ) : null}
          <View style={trow.actionBtns}>
            <TouchableOpacity onPress={() => onEdit(trade)} style={[trow.actionBtn, { borderColor: colors.border }]}>
              <Feather name="edit-2" size={12} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(trade.id)} style={[trow.actionBtn, { borderColor: colors.down + "40" }]}>
              <Feather name="trash-2" size={12} color={colors.down} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}
const trow = StyleSheet.create({
  root: { flexDirection: "row", borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  stripe: { width: 4 },
  body: { flex: 1, padding: 12, gap: 8 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  topLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  topRight: {},
  dirBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  dirText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  coin: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dateText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  statusBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  levels: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  levelItem: { gap: 1 },
  levelKey: { fontSize: 8, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase" },
  levelVal: { fontSize: 13, fontFamily: "Inter_700Bold" },
  actions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  quality: { fontSize: 10, fontFamily: "Inter_400Regular" },
  actionBtns: { flexDirection: "row", gap: 6 },
  actionBtn: { borderWidth: 1, borderRadius: 6, padding: 6 },
});

/* ── Add / Edit Modal ───────────────────────────────────────────── */
function TradeModal({ visible, existing, onSave, onClose, colors }: {
  visible: boolean;
  existing: TradeEntry | null;
  onSave: (t: TradeEntry) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const now = new Date();
  const [coin, setCoin] = useState("BTC/USDT");
  const [direction, setDirection] = useState<TradeDirection>("LONG");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [exit, setExit] = useState("");
  const [status, setStatus] = useState<TradeStatus>("Open");
  const [confidence, setConfidence] = useState("");
  const [quality, setQuality] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (existing) {
      setCoin(existing.coin);
      setDirection(existing.direction);
      setEntry(existing.entry ? String(existing.entry) : "");
      setSl(existing.stopLoss ? String(existing.stopLoss) : "");
      setTp(existing.takeProfit ? String(existing.takeProfit) : "");
      setExit(existing.exitPrice !== null ? String(existing.exitPrice) : "");
      setStatus(existing.status);
      setConfidence(existing.signalConfidence !== null ? String(existing.signalConfidence) : "");
      setQuality(existing.setupQuality ?? "");
      setNotes(existing.notes ?? "");
    } else {
      setCoin("BTC/USDT");
      setDirection("LONG");
      setEntry(""); setSl(""); setTp(""); setExit("");
      setStatus("Open");
      setConfidence(""); setQuality(""); setNotes("");
    }
  }, [existing, visible]);

  const handleSave = () => {
    const entryNum = parseFloat(entry);
    const slNum = parseFloat(sl);
    const tpNum = parseFloat(tp);
    const exitNum = exit ? parseFloat(exit) : null;
    if (!entryNum || !slNum || !tpNum) {
      Alert.alert("Missing fields", "Please fill in Entry, Stop Loss and Take Profit.");
      return;
    }
    const pnl = exitNum !== null ? calcPnl(direction, entryNum, exitNum) : null;
    const rr = calcRR(direction, entryNum, slNum, tpNum);
    onSave({
      id: existing?.id ?? Date.now().toString(),
      date: existing?.date ?? now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      time: existing?.time ?? now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      coin, direction, entry: entryNum, stopLoss: slNum, takeProfit: tpNum,
      exitPrice: exitNum, status, pnlPct: pnl,
      riskReward: rr > 0 ? parseFloat(rr.toFixed(2)) : null,
      signalConfidence: confidence ? parseFloat(confidence) : null,
      setupQuality: quality, notes,
    });
  };

  const inputStyle = [modal.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }];
  const labelStyle = [modal.label, { color: colors.mutedForeground }];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modal.overlay}>
        <View style={[modal.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={[modal.handle, { backgroundColor: colors.border }]} />
          <View style={modal.sheetHeader}>
            <Text style={[modal.sheetTitle, { color: colors.foreground }]}>{existing ? "Edit Trade" : "Log Trade"}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={modal.fields} showsVerticalScrollIndicator={false}>
            <Text style={labelStyle}>Pair</Text>
            <TextInput style={inputStyle} value={coin} onChangeText={setCoin} placeholderTextColor={colors.mutedForeground} />

            <Text style={labelStyle}>Direction</Text>
            <View style={modal.segRow}>
              {(["LONG", "SHORT"] as TradeDirection[]).map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDirection(d)}
                  style={[modal.seg, {
                    backgroundColor: direction === d ? (d === "LONG" ? colors.long + "22" : colors.short + "22") : "transparent",
                    borderColor: direction === d ? (d === "LONG" ? colors.long : colors.short) : colors.border,
                  }]}
                >
                  <Text style={[modal.segText, { color: direction === d ? (d === "LONG" ? colors.long : colors.short) : colors.mutedForeground }]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            <View style={modal.row}>
              <View style={modal.col}>
                <Text style={labelStyle}>Entry Price</Text>
                <TextInput style={inputStyle} value={entry} onChangeText={setEntry} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
              </View>
              <View style={modal.col}>
                <Text style={labelStyle}>Stop Loss</Text>
                <TextInput style={[inputStyle, { borderColor: colors.down + "60" }]} value={sl} onChangeText={setSl} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
              </View>
            </View>

            <View style={modal.row}>
              <View style={modal.col}>
                <Text style={labelStyle}>Take Profit</Text>
                <TextInput style={[inputStyle, { borderColor: colors.up + "60" }]} value={tp} onChangeText={setTp} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
              </View>
              <View style={modal.col}>
                <Text style={labelStyle}>Exit Price (opt)</Text>
                <TextInput style={inputStyle} value={exit} onChangeText={setExit} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
              </View>
            </View>

            <Text style={labelStyle}>Status</Text>
            <View style={modal.segRow}>
              {(["Open", "Closed", "Cancelled"] as TradeStatus[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setStatus(s)}
                  style={[modal.seg, { flex: 1,
                    backgroundColor: status === s ? colors.primary + "22" : "transparent",
                    borderColor: status === s ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={[modal.segText, { color: status === s ? colors.primary : colors.mutedForeground }]}>{s}</Text>
                </Pressable>
              ))}
            </View>

            <View style={modal.row}>
              <View style={modal.col}>
                <Text style={labelStyle}>Signal Confidence %</Text>
                <TextInput style={inputStyle} value={confidence} onChangeText={setConfidence} keyboardType="number-pad" placeholder="0–100" placeholderTextColor={colors.mutedForeground} />
              </View>
              <View style={modal.col}>
                <Text style={labelStyle}>Setup Quality</Text>
                <TextInput style={inputStyle} value={quality} onChangeText={setQuality} placeholder="e.g. Strong" placeholderTextColor={colors.mutedForeground} />
              </View>
            </View>

            <Text style={labelStyle}>Notes</Text>
            <TextInput
              style={[inputStyle, { height: 72, textAlignVertical: "top" }]}
              value={notes} onChangeText={setNotes}
              multiline placeholder="Optional trade notes…"
              placeholderTextColor={colors.mutedForeground}
            />

            <Pressable onPress={handleSave} style={[modal.saveBtn, { backgroundColor: colors.primary }]}>
              <Text style={[modal.saveBtnText, { color: "#fff" }]}>{existing ? "Save Changes" : "Log Trade"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const modal = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, maxHeight: "92%", paddingHorizontal: 16, paddingBottom: 32 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 8 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  fields: { gap: 10, paddingBottom: 20 },
  label: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 2 },
  input: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", gap: 10 },
  col: { flex: 1, gap: 4 },
  segRow: { flexDirection: "row", gap: 8 },
  seg: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 10, alignItems: "center" },
  segText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  saveBtn: { borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});

/* ── Screen ─────────────────────────────────────────────────────── */

type FilterDir = "All" | "LONG" | "SHORT";
type FilterStatus = "All" | "Closed" | "Open" | "Cancelled";
type FilterWinLoss = "All" | "Win" | "Loss";

export default function JournalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 60 : insets.top;

  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTrade, setEditingTrade] = useState<TradeEntry | null>(null);

  const [filterDir, setFilterDir] = useState<FilterDir>("All");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("All");
  const [filterWL, setFilterWL] = useState<FilterWinLoss>("All");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setTrades(JSON.parse(raw) as TradeEntry[]);
    });
  }, []);

  const persist = useCallback((next: TradeEntry[]) => {
    setTrades(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const handleSave = useCallback((t: TradeEntry) => {
    setTrades((prev) => {
      const next = prev.find((p) => p.id === t.id)
        ? prev.map((p) => (p.id === t.id ? t : p))
        : [t, ...prev];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setModalVisible(false);
    setEditingTrade(null);
  }, []);

  const handleDelete = useCallback((id: string) => {
    Alert.alert("Delete Trade", "Remove this trade from your journal?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        setTrades((prev) => { const next = prev.filter((p) => p.id !== id); AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); return next; });
      }},
    ]);
  }, []);

  const closedTrades = useMemo(() => trades.filter((t) => t.status === "Closed" && t.pnlPct !== null), [trades]);
  const wins = useMemo(() => closedTrades.filter((t) => (t.pnlPct ?? 0) > 0), [closedTrades]);
  const losses = useMemo(() => closedTrades.filter((t) => (t.pnlPct ?? 0) <= 0), [closedTrades]);
  const winRate = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0;
  const avgWin = wins.length > 0 ? (wins.reduce((a, t) => a + (t.pnlPct ?? 0), 0) / wins.length) : 0;
  const avgLoss = losses.length > 0 ? (losses.reduce((a, t) => a + (t.pnlPct ?? 0), 0) / losses.length) : 0;
  const best = closedTrades.reduce((a, t) => ((t.pnlPct ?? -999) > (a?.pnlPct ?? -999) ? t : a), null as TradeEntry | null);
  const worst = closedTrades.reduce((a, t) => ((t.pnlPct ?? 999) < (a?.pnlPct ?? 999) ? t : a), null as TradeEntry | null);

  const filtered = useMemo(() => trades.filter((t) => {
    if (filterDir !== "All" && t.direction !== filterDir) return false;
    if (filterStatus !== "All" && t.status !== filterStatus) return false;
    if (filterWL === "Win" && (t.pnlPct === null || t.pnlPct <= 0)) return false;
    if (filterWL === "Loss" && (t.pnlPct === null || t.pnlPct > 0)) return false;
    return true;
  }), [trades, filterDir, filterStatus, filterWL]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.mutedForeground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground }]}>Trade Journal</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{trades.length} trades logged</Text>
        </View>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditingTrade(null); setModalVisible(true); }}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Log</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <View style={styles.summaryGrid}>
          <SummaryCard label="Total" value={trades.length} icon="list" colors={colors} />
          <SummaryCard label="Wins" value={wins.length} color={colors.up} icon="trending-up" colors={colors} />
          <SummaryCard label="Losses" value={losses.length} color={colors.down} icon="trending-down" colors={colors} />
          <SummaryCard label="Win Rate" value={`${winRate}%`} color={winRate >= 50 ? colors.up : colors.down} icon="percent" colors={colors} />
        </View>
        <View style={styles.summaryGrid}>
          <SummaryCard label="Avg Win" value={avgWin ? `+${avgWin.toFixed(1)}%` : "—"} color={colors.up} icon="arrow-up" colors={colors} />
          <SummaryCard label="Avg Loss" value={avgLoss ? `${avgLoss.toFixed(1)}%` : "—"} color={colors.down} icon="arrow-down" colors={colors} />
          <SummaryCard label="Best" value={best?.pnlPct !== undefined && best?.pnlPct !== null ? `+${best.pnlPct.toFixed(1)}%` : "—"} color={colors.up} icon="award" colors={colors} />
          <SummaryCard label="Worst" value={worst?.pnlPct !== undefined && worst?.pnlPct !== null ? `${worst.pnlPct.toFixed(1)}%` : "—"} color={colors.down} icon="x-circle" colors={colors} />
        </View>

        {/* Filters */}
        <View style={[styles.filterSection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>FILTER</Text>
          <View style={styles.filterRow}>
            {(["All", "LONG", "SHORT"] as FilterDir[]).map((d) => (
              <Pressable key={d} onPress={() => setFilterDir(d)}
                style={[styles.chip, { backgroundColor: filterDir === d ? colors.primary + "22" : "transparent", borderColor: filterDir === d ? colors.primary : colors.border }]}>
                <Text style={[styles.chipText, { color: filterDir === d ? colors.primary : colors.mutedForeground }]}>{d}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.filterRow}>
            {(["All", "Open", "Closed", "Cancelled"] as FilterStatus[]).map((s) => (
              <Pressable key={s} onPress={() => setFilterStatus(s)}
                style={[styles.chip, { backgroundColor: filterStatus === s ? colors.primary + "22" : "transparent", borderColor: filterStatus === s ? colors.primary : colors.border }]}>
                <Text style={[styles.chipText, { color: filterStatus === s ? colors.primary : colors.mutedForeground }]}>{s}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.filterRow}>
            {(["All", "Win", "Loss"] as FilterWinLoss[]).map((w) => (
              <Pressable key={w} onPress={() => setFilterWL(w)}
                style={[styles.chip, {
                  backgroundColor: filterWL === w ? (w === "Win" ? colors.up + "22" : w === "Loss" ? colors.down + "22" : colors.primary + "22") : "transparent",
                  borderColor: filterWL === w ? (w === "Win" ? colors.up : w === "Loss" ? colors.down : colors.primary) : colors.border,
                }]}>
                <Text style={[styles.chipText, { color: filterWL === w ? (w === "Win" ? colors.up : w === "Loss" ? colors.down : colors.primary) : colors.mutedForeground }]}>{w}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Trade list */}
        {filtered.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="book" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No trades yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Tap + Log to record your first trade. Track entries, stops, targets and outcomes to improve your edge.
            </Text>
          </View>
        ) : (
          filtered.map((t) => (
            <TradeRow key={t.id} trade={t} colors={colors}
              onDelete={handleDelete}
              onEdit={(tr) => { setEditingTrade(tr); setModalVisible(true); }}
            />
          ))
        )}
      </ScrollView>

      <TradeModal
        visible={modalVisible}
        existing={editingTrade}
        onSave={handleSave}
        onClose={() => { setModalVisible(false); setEditingTrade(null); }}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  summaryGrid: { flexDirection: "row", gap: 8 },
  filterSection: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  sec: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { borderRadius: 14, borderWidth: 1, padding: 28, alignItems: "center", gap: 10, marginTop: 8 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center", color: "#666" },
});
