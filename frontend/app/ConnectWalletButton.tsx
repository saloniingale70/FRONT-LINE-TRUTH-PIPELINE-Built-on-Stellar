"use client";

import { useFreighter } from "./freighter-context";

export default function ConnectWalletButton() {
  const { publicKey, connecting, error, connect } = useFreighter();

  if (publicKey) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5,
          color: "var(--text-2)", background: "var(--surface-2)",
          border: "1px solid var(--border)", padding: "3px 10px", borderRadius: 5,
        }}>
          {publicKey.slice(0, 6)}…{publicKey.slice(-6)}
        </span>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "right" }}>
      <button
        onClick={connect}
        disabled={connecting}
        className="wallet-btn"
      >
        {connecting ? "Connecting…" : "Connect Freighter"}
      </button>
      {error && (
        <p style={{ fontSize: 11, color: "var(--rejected)", marginTop: 5, maxWidth: 220 }}>
          {error}
        </p>
      )}
    </div>
  );
}