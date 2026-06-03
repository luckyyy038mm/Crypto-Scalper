import { useEffect, useRef, useState } from "react";

import type { Signal } from "./useSignal";

export interface SignalEntry {
  time: number;
  signal: Signal;
  score: number;
  qualityLabel: string;
}

export function useSignalHistory(
  signal: Signal,
  score: number,
  qualityLabel: string,
  ready: boolean,
): SignalEntry[] {
  const [history, setHistory] = useState<SignalEntry[]>([]);
  const lastSignal = useRef<Signal | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (lastSignal.current !== signal) {
      lastSignal.current = signal;
      setHistory((prev) =>
        [{ time: Date.now(), signal, score, qualityLabel }, ...prev].slice(0, 20),
      );
    }
  }, [signal, score, qualityLabel, ready]);

  return history;
}
