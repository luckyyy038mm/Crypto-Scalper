import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CoinSymbol } from "@/constants/coins";

const COIN_STORAGE_KEY = "pt_selected_coin";

interface CoinContextValue {
  selectedCoin: CoinSymbol;
  setCoin: (coin: CoinSymbol) => void;
}

const CoinContext = createContext<CoinContextValue>({
  selectedCoin: "BTCUSDT",
  setCoin: () => {},
});

export function CoinProvider({ children }: { children: React.ReactNode }) {
  const [selectedCoin, setSelectedCoinState] = useState<CoinSymbol>("BTCUSDT");

  // Load persisted coin on mount
  useEffect(() => {
    AsyncStorage.getItem(COIN_STORAGE_KEY).then((raw) => {
      if (raw && ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"].includes(raw)) {
        setSelectedCoinState(raw as CoinSymbol);
      }
    });
  }, []);

  const setCoin = useCallback((coin: CoinSymbol) => {
    setSelectedCoinState(coin);
    AsyncStorage.setItem(COIN_STORAGE_KEY, coin).catch(() => {});
  }, []);

  return (
    <CoinContext.Provider value={{ selectedCoin, setCoin }}>
      {children}
    </CoinContext.Provider>
  );
}

export function useSelectedCoin(): CoinContextValue {
  return useContext(CoinContext);
}
