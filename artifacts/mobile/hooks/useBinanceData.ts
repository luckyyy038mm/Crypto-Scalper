import { useCallback, useEffect, useRef, useState } from "react";

export type FreshnessStatus = "live" | "warning" | "delayed" | "disconnected";

export interface BinanceData {
  price: number;
  priceChange: number;
  priceChangePercent: number;
  quoteVolume: number;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  openInterest: number;
  isConnected: boolean;
  lastUpdated: number;
  dataAge: number;
  freshnessStatus: FreshnessStatus;
}

const DEFAULT_DATA: BinanceData = {
  price: 0, priceChange: 0, priceChangePercent: 0, quoteVolume: 0,
  markPrice: 0, indexPrice: 0, fundingRate: 0, nextFundingTime: 0,
  openInterest: 0, isConnected: false, lastUpdated: 0,
  dataAge: 0, freshnessStatus: "disconnected",
};

/* ── WebSocket helper ─────────────────────────────────────────────── */
function makeWs(
  url: string,
  onMessage: (d: Record<string, unknown>) => void,
  onDead: () => void,
): () => void {
  let ws: WebSocket | null = null;
  let dead = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (dead) return;
    try {
      ws = new WebSocket(url);
      ws.onmessage = (e) => {
        try { onMessage(JSON.parse(e.data as string)); } catch {}
      };
      ws.onerror = () => { ws?.close(); };
      ws.onclose = () => {
        if (dead) return;
        timer = setTimeout(connect, 3_000);
      };
    } catch {
      timer = setTimeout(connect, 5_000);
    }
  }

  connect();
  return () => {
    dead = true;
    if (timer) clearTimeout(timer);
    if (ws) { ws.onclose = null; ws.close(); }
  };
}

/* ── REST helpers ────────────────────────────────────────────────── */

async function tryFetch(urls: string[]): Promise<Record<string, unknown> | null> {
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch {}
  }
  return null;
}

async function fetchPrice(symbol: string): Promise<number> {
  const j1 = await tryFetch([`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`]);
  if (j1 && parseFloat(j1["price"] as string) > 0) return parseFloat(j1["price"] as string);

  const j2 = await tryFetch([`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`]);
  if (j2 && parseFloat(j2["price"] as string) > 0) return parseFloat(j2["price"] as string);

  const j3 = await tryFetch([`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=1`]);
  if (Array.isArray(j3) && j3.length > 0) {
    const price = parseFloat((j3 as unknown[][])[0][4] as string);
    if (price > 0) return price;
  }

  const j4 = await tryFetch([`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=1`]);
  if (Array.isArray(j4) && j4.length > 0) {
    const price = parseFloat((j4 as unknown[][])[0][4] as string);
    if (price > 0) return price;
  }

  return 0;
}

async function fetch24h(symbol: string): Promise<Partial<BinanceData>> {
  const j = await tryFetch([
    `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`,
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
  ]);
  if (!j) return {};
  return {
    priceChange: parseFloat(j["priceChange"] as string) || 0,
    priceChangePercent: parseFloat(j["priceChangePercent"] as string) || 0,
    quoteVolume: parseFloat((j["quoteVolume"] ?? j["volume"]) as string) || 0,
  };
}

async function fetchPremium(symbol: string): Promise<Partial<BinanceData>> {
  const j = await tryFetch([`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`]);
  if (!j) return {};
  return {
    markPrice: parseFloat(j["markPrice"] as string) || 0,
    indexPrice: parseFloat(j["indexPrice"] as string) || 0,
    fundingRate: parseFloat(j["lastFundingRate"] as string) || 0,
    nextFundingTime: parseInt(j["nextFundingTime"] as string) || 0,
  };
}

async function fetchOI(symbol: string): Promise<number> {
  const j = await tryFetch([`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`]);
  if (!j) return 0;
  return parseFloat(j["openInterest"] as string) || 0;
}

/* ── Main hook ────────────────────────────────────────────────────── */
export function useBinanceData(symbol: string = "BTCUSDT"): BinanceData {
  const [data, setData] = useState<BinanceData>(DEFAULT_DATA);
  const lastUpdatedRef = useRef(0);
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  const stamp = useCallback((updates: Partial<BinanceData>) => {
    const now = Date.now();
    lastUpdatedRef.current = now;
    setData((prev) => ({
      ...prev,
      ...updates,
      isConnected: true,
      lastUpdated: now,
      dataAge: 0,
      freshnessStatus: "live" as FreshnessStatus,
    }));
  }, []);

  /* Reset state when symbol changes */
  useEffect(() => {
    setData(DEFAULT_DATA);
    lastUpdatedRef.current = 0;
  }, [symbol]);

  /* ── WebSocket A: aggTrade ────────────────────────────────────── */
  useEffect(() => {
    const sym = symbol.toLowerCase();
    const teardown = makeWs(
      `wss://fstream.binance.com/ws/${sym}@aggTrade`,
      (msg) => {
        const price = parseFloat(msg["p"] as string) || 0;
        if (price > 0) stamp({ price });
      },
      () => {},
    );
    return teardown;
  }, [symbol, stamp]);

  /* ── WebSocket B: markPrice ───────────────────────────────────── */
  useEffect(() => {
    const sym = symbol.toLowerCase();
    const teardown = makeWs(
      `wss://fstream.binance.com/ws/${sym}@markPrice@1s`,
      (msg) => {
        const markPrice = parseFloat(msg["p"] as string) || 0;
        const indexPrice = parseFloat(msg["i"] as string) || 0;
        const fundingRate = parseFloat(msg["r"] as string) || 0;
        const nextFundingTime = parseInt(msg["T"] as string) || 0;
        if (!markPrice) return;
        setData((prev) => ({
          ...prev, markPrice, indexPrice, fundingRate, nextFundingTime,
          lastUpdated: prev.lastUpdated || Date.now(),
        }));
      },
      () => {},
    );
    return teardown;
  }, [symbol]);

  /* ── REST bootstrap + periodic fallback ──────────────────────── */
  useEffect(() => {
    let active = true;

    async function boot() {
      const price = await fetchPrice(symbol);
      if (!active) return;
      if (price > 0) stamp({ price });

      const [stats, premium, oi] = await Promise.all([fetch24h(symbol), fetchPremium(symbol), fetchOI(symbol)]);
      if (!active) return;

      setData((prev) => ({
        ...prev,
        ...(stats.priceChange !== undefined ? stats : {}),
        ...(premium.markPrice ? premium : {}),
        ...(oi ? { openInterest: oi } : {}),
        isConnected: prev.isConnected || price > 0,
        lastUpdated: prev.lastUpdated || (price > 0 ? Date.now() : 0),
      }));
    }

    boot();
    const boot2 = setTimeout(boot, 1_000);

    const priceTimer = setInterval(async () => {
      if (!active) return;
      const stale = Date.now() - lastUpdatedRef.current > 2_000;
      if (!stale) return;
      const price = await fetchPrice(symbol);
      if (price > 0 && active) stamp({ price });
    }, 2_000);

    const oiTimer = setInterval(async () => {
      if (!active) return;
      const oi = await fetchOI(symbol);
      if (oi && active) setData((p) => ({ ...p, openInterest: oi }));
    }, 30_000);

    const fundTimer = setInterval(async () => {
      if (!active) return;
      const premium = await fetchPremium(symbol);
      if (premium.markPrice && active) setData((p) => ({ ...p, ...premium }));
    }, 60_000);

    const statsTimer = setInterval(async () => {
      if (!active) return;
      const stats = await fetch24h(symbol);
      if (stats.priceChange !== undefined && active) setData((p) => ({ ...p, ...stats }));
    }, 60_000);

    return () => {
      active = false;
      clearTimeout(boot2);
      clearInterval(priceTimer);
      clearInterval(oiTimer);
      clearInterval(fundTimer);
      clearInterval(statsTimer);
    };
  }, [symbol, stamp]);

  /* ── Freshness ticker ─────────────────────────────────────────── */
  useEffect(() => {
    const t = setInterval(() => {
      setData((prev) => {
        const age = prev.lastUpdated
          ? Math.round((Date.now() - prev.lastUpdated) / 1_000)
          : 999;
        const freshnessStatus: FreshnessStatus =
          !prev.lastUpdated || age > 30 ? "disconnected" :
          age < 4  ? "live" :
          age < 12 ? "warning" : "delayed";
        if (prev.dataAge === age && prev.freshnessStatus === freshnessStatus) return prev;
        return { ...prev, dataAge: age, freshnessStatus };
      });
    }, 1_000);
    return () => clearInterval(t);
  }, []);

  return data;
}

/* ── legacy exports ─────────────────────────────────────────────── */
export type Signal = "LONG" | "SHORT" | "WAIT";

export interface SignalResult {
  signal: Signal;
  score: number;
  maxScore: number;
  confidence: number;
  reasons: string[];
}

export function computeSignal(data: BinanceData): SignalResult {
  let score = 0;
  const reasons: string[] = [];
  const fr = data.fundingRate;
  if (fr < -0.0001) { score += 2; reasons.push("Funding rate strongly negative (bullish)"); }
  else if (fr < 0) { score += 1; reasons.push("Funding rate negative (bullish)"); }
  else if (fr > 0.0001) { score -= 2; reasons.push("Funding rate strongly positive (bearish)"); }
  else if (fr > 0) { score -= 1; reasons.push("Funding rate positive (bearish)"); }
  else { reasons.push("Funding rate neutral"); }
  const pct = data.priceChangePercent;
  if (pct > 3) { score += 2; reasons.push("Strong 24h momentum up"); }
  else if (pct > 1) { score += 1; reasons.push("Positive 24h momentum"); }
  else if (pct < -3) { score -= 2; reasons.push("Strong 24h momentum down"); }
  else if (pct < -1) { score -= 1; reasons.push("Negative 24h momentum"); }
  else { reasons.push("24h momentum neutral"); }
  const maxScore = 4;
  const confidence = Math.round((Math.abs(score) / maxScore) * 100);
  let signal: Signal = "WAIT";
  if (score >= 2) signal = "LONG";
  else if (score <= -2) signal = "SHORT";
  return { signal, score, maxScore, confidence, reasons };
}
