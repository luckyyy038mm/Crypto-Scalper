export type CoinSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT" | "XRPUSDT";

export interface CoinConfig {
  symbol: CoinSymbol;
  ticker: string;
  name: string;
  color: string;
  pairLabel: string;
  decimals: number;
}

export const COINS: CoinConfig[] = [
  { symbol: "BTCUSDT", ticker: "BTC", name: "Bitcoin",  color: "#F7931A", pairLabel: "BTC / USDT · PERP", decimals: 2 },
  { symbol: "ETHUSDT", ticker: "ETH", name: "Ethereum", color: "#627EEA", pairLabel: "ETH / USDT · PERP", decimals: 2 },
  { symbol: "SOLUSDT", ticker: "SOL", name: "Solana",   color: "#9945FF", pairLabel: "SOL / USDT · PERP", decimals: 3 },
  { symbol: "XRPUSDT", ticker: "XRP", name: "Ripple",   color: "#00AAE4", pairLabel: "XRP / USDT · PERP", decimals: 4 },
];

export const COIN_MAP = Object.fromEntries(
  COINS.map((c) => [c.symbol, c]),
) as Record<CoinSymbol, CoinConfig>;

export function getCoin(symbol: CoinSymbol): CoinConfig {
  return COIN_MAP[symbol];
}

export function formatCoinPrice(price: number, symbol: CoinSymbol): string {
  if (!price) return "0.00";
  const { decimals } = COIN_MAP[symbol];
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
