"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import {
  isConnected,
  isAllowed,
  setAllowed,
  getAddress,
} from "@stellar/freighter-api";

interface FreighterContextValue {
  publicKey: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
}

const FreighterContext = createContext<FreighterContextValue | undefined>(undefined);

export function FreighterProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const connectedResult = await isConnected();
      if (connectedResult.error || !connectedResult.isConnected) {
        setError("Freighter extension not detected. Please install it from freighter.app.");
        return;
      }

      const allowedResult = await isAllowed();
      if (!allowedResult.isAllowed) {
        const setAllowedResult = await setAllowed();
        if (setAllowedResult.error || !setAllowedResult.isAllowed) {
          setError("Permission to connect was denied.");
          return;
        }
      }

      const addressResult = await getAddress();
      if (addressResult.error) {
        setError(addressResult.error.message ?? "Could not get address from Freighter.");
        return;
      }

      setPublicKey(addressResult.address);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error connecting to Freighter.");
    } finally {
      setConnecting(false);
    }
  }, []);

  return (
    <FreighterContext.Provider value={{ publicKey, connecting, error, connect }}>
      {children}
    </FreighterContext.Provider>
  );
}

export function useFreighter() {
  const ctx = useContext(FreighterContext);
  if (!ctx) throw new Error("useFreighter must be used within a FreighterProvider");
  return ctx;
}