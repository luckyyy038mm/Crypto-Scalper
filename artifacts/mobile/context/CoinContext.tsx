import React, { createContext, useCallback, useContext, useState } from "react";

import type { CoinSymbol } from "@/constants/coins";

interface CoinContextValue {
  selectedCoin: CoinSymbol;
  setCoin: (coin: CoinSymbol) => void;
}

const CoinContext = createContext<CoinContextValue>({
  selectedCoin: "BTCUSDT",
  setCoin: () => {},
});

export function CoinProvider({ children }: { children: React.ReactNode }) {
  const [selectedCoin, setSelectedCoin] = useState<CoinSymbol>("BTCUSDT");

  const setCoin = useCallback((coin: CoinSymbol) => {
    setSelectedCoin(coin);
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
