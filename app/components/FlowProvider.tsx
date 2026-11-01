"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  LookItem,
  ProductMatch,
  TryOnResult,
  UserTone,
} from "@/lib/types";

/**
 * Client-side flow state shared by all six screens.
 * Images are stored as JPEG data URLs so the state survives a page refresh
 * (sessionStorage) and can be turned back into a Blob for uploads.
 */
export interface FlowState {
  inspiration: string | null;
  selfie: string | null;
  budget: number;
  items: LookItem[];
  userTone: UserTone | null;
  matches: ProductMatch[];
  total: number;
  tryOn: TryOnResult | null;
  /** Key of the selfie + matches the try-on was rendered for. */
  tryOnFor: string | null;
}

export const DEFAULT_BUDGET = 3000;

const INITIAL_STATE: FlowState = {
  inspiration: null,
  selfie: null,
  budget: DEFAULT_BUDGET,
  items: [],
  userTone: null,
  matches: [],
  total: 0,
  tryOn: null,
  tryOnFor: null,
};

const STORAGE_KEY = "look-dna:flow:v1";

interface FlowContextValue {
  state: FlowState;
  /** False until sessionStorage has been read; guard redirects on this. */
  hydrated: boolean;
  update: (patch: Partial<FlowState>) => void;
  reset: () => void;
}

const FlowContext = createContext<FlowContextValue | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        setState({ ...INITIAL_STATE, ...(JSON.parse(saved) as FlowState) });
      }
    } catch {
      // Storage unavailable or corrupt: start fresh.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded or storage blocked: state still lives in memory.
    }
  }, [state, hydrated]);

  const update = useCallback((patch: Partial<FlowState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const value = useMemo(
    () => ({ state, hydrated, update, reset }),
    [state, hydrated, update, reset],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowContextValue {
  const context = useContext(FlowContext);
  if (!context) {
    throw new Error("useFlow must be used inside <FlowProvider>.");
  }
  return context;
}
