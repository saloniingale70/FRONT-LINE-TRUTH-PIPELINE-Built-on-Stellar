"use client";

import { useFreighter } from "./freighter-context";

export default function ConnectWalletButton() {
  const { publicKey, connecting, error, connect } = useFreighter();

  if (publicKey) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          display: "flex", alignItems: "center", gap: 5,
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
          color: "var(--text-2)", background: "var(--surface-2)",
          border: "1px solid var(--border)", padding: "3px 9px", borderRadius: 5,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--compliant)", flexShrink: 0,
          }} />
          {publicKey.slice(0, 5)}…{publicKey.slice(-5)}
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
        title={error ?? undefined}
      >
        {connecting
          ? <><span className="spinner dark" style={{ width: 11, height: 11 }} />Connecting</>
          : "Connect Freighter"}
      </button>
      {error && (
        <p style={{
          fontSize: 10.5, color: "var(--rejected)", marginTop: 4,
          maxWidth: 200, lineHeight: 1.4,
        }}>
          {error.includes("not detected")
            ? <>Freighter not found. <a href="https://freighter.app" target="_blank" rel="noopener noreferrer">Install it here.</a></>
            : error}
        </p>
      )}
    </div>
  );
}