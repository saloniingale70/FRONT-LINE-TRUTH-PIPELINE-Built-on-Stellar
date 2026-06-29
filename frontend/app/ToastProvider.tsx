"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ToastKind = "ok" | "err";

interface ToastEntry {
  id: number;
  text: string;
  kind: ToastKind;
}

interface ToastContextValue {
  toast: (text: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let _id = 0;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const toast = useCallback((text: string, kind: ToastKind = "ok") => {
    const id = ++_id;
    setToasts(prev => [...prev, { id, text, kind }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3800);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === "ok" ? "✓ " : "✕ "}{t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}