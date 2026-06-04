/**
 * Signal Follow Service
 * Global service that persists signal follow state and can operate
 * in the background to monitor signals and execute trades.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";

const SIGNAL_FOLLOW_KEY = "signal_follow_global_state";

export interface GlobalSignalFollowState {
  enabled: boolean;
  mode: "scalper" | "normal" | "manual";
  selectedCoin: string | null;
  leverage: number;
  riskPct: number;
  autoModeEnabled: boolean;
  qualityThreshold: number;
}

const DEFAULT_STATE: GlobalSignalFollowState = {
  enabled: false,
  mode: "manual",
  selectedCoin: null,
  leverage: 5,
  riskPct: 10,
  autoModeEnabled: false,
  qualityThreshold: 62,
};

export function useSignalFollowService() {
  const [state, setState] = useState<GlobalSignalFollowState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    AsyncStorage.getItem(SIGNAL_FOLLOW_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setState({ ...DEFAULT_STATE, ...parsed });
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  // Persist state changes
  const persistState = (next: GlobalSignalFollowState) => {
    setState(next);
    AsyncStorage.setItem(SIGNAL_FOLLOW_KEY, JSON.stringify(next)).catch(() => {});
  };

  // Toggle signal follow
  const toggleSignalFollow = (enabled: boolean) => {
    persistState({ ...state, enabled });
  };

  // Update settings
  const updateSettings = (updates: Partial<GlobalSignalFollowState>) => {
    persistState({ ...state, ...updates });
  };

  // Select coin for signal following
  const selectCoin = (coin: string | null) => {
    persistState({ ...state, selectedCoin: coin });
  };

  // Set mode
  const setMode = (mode: "scalper" | "normal" | "manual") => {
    persistState({ ...state, mode });
  };

  return {
    loaded,
    state,
    toggleSignalFollow,
    updateSettings,
    selectCoin,
    setMode,
    persistState,
  };
}

// Singleton instance for global access
let globalService: ReturnType<typeof useSignalFollowService> | null = null;

export function getSignalFollowService() {
  if (!globalService) {
    globalService = useSignalFollowService();
  }
  return globalService;
}