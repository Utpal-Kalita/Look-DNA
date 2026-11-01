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
  MatchResponse,
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
  /** Full /api/match response (product details, adapted targets, swaps). */
  matchResult: MatchResponse | null;
  /** Product ids the user swapped away from in the cart. */
  excluded: string[];
  /** Why a later step asked for a new selfie, shown on the selfie screen. */
  retakeMessage: string | null;
  /** True when the items came from mock mode, not from reading the image. */
  itemsMock: boolean;
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
  matchResult: null,
  excluded: [],
  retakeMessage: null,
  itemsMock: false,
};

/** Clears everything computed from the inspiration image. */
export const CLEAR_LOOK: Partial<FlowState> = {
  items: [],
  matches: [],
  total: 0,
  matchResult: null,
  excluded: [],
  tryOn: null,
  tryOnFor: null,
};

/** Clears everything computed from matching (keeps extracted items). */
export const CLEAR_MATCHES: Partial<FlowState> = {
  matches: [],
  total: 0,
  matchResult: null,
  excluded: [],
  retakeMessage: null,
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
