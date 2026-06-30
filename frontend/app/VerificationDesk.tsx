"use client";

import { useState, useEffect } from "react";
import { CONTRACTS } from "./config";
import { TransactionBuilder, BASE_FEE, Operation, xdr, rpc } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { useFreighter } from "./freighter-context";
import { server, NETWORK_PASSPHRASE } from "./stellar";

type MsgState = { kind: "ok" | "err"; text: string } | null;

function friendlyError(raw: string): string {
  if (raw.includes("Simulation failed"))
    return "Contract simulation failed — the case may not exist yet. Try refreshing.";
  if (raw.includes("Signing rejected") || raw.includes("User declined"))
    return "Transaction was cancelled in your wallet.";
  if (raw.includes("NOT_FOUND") || raw.includes("NOT_CONFIRMED"))
    return "Transaction submitted but confirmation is pending. Refresh the case list in a moment.";
  if (raw.includes("insufficient balance") || raw.includes("INSUFFICIENT_FUNDS"))
    return "Insufficient testnet XLM. Fund your wallet at friendbot.stellar.org.";
  return raw;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Could not complete this action.";
}

export default function VerificationDesk({
  caseId, onResolved,
}: { caseId: string | null; onResolved?: () => void }) {
  const { publicKey } = useFreighter();
  const [busy, setBusy] = useState<"verify" | "reject" | null>(null);
  const [message, setMessage] = useState<MsgState>(null);

  useEffect(() => { setMessage(null); setBusy(null); }, [caseId]);

  async function runCall(
    fn: "verify_compliance" | "reject_shipment",
    label: "verify" | "reject",
  ) {
    if (!publicKey || !caseId) return;
    setBusy(label); setMessage(null);

    try {
      const account = await server.getAccount(publicKey);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(Operation.invokeContractFunction({
          contract: CONTRACTS.complianceRegistry,
          function: fn,
          args: [xdr.ScVal.scvSymbol(caseId)],
        }))
        .setTimeout(30)
        .build();

      const simResult = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simResult))
        throw new Error(`Simulation failed: ${simResult.error}`);
      const preparedTx = rpc.assembleTransaction(tx, simResult).build();

      const signResult = await signTransaction(preparedTx.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE, address: publicKey,
      });
      if (signResult.error)
        throw new Error(signResult.error.message ?? "Signing rejected.");

      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, NETWORK_PASSPHRASE);
      const sendResult = await server.sendTransaction(signedTx);
      if (sendResult.status === "ERROR")
        throw new Error(JSON.stringify(sendResult.errorResult));

      let txResult = await server.getTransaction(sendResult.hash);
      let attempts = 0;
      while (txResult.status === "NOT_FOUND" && attempts < 10) {
        await new Promise(r => setTimeout(r, 1000));
        txResult = await server.getTransaction(sendResult.hash);
        attempts++;
      }
      if (txResult.status !== "SUCCESS")
        throw new Error(`Transaction did not succeed: ${txResult.status}`);

      setMessage({
        kind: "ok",
        text: label === "verify"
          ? "Custody check complete — result recorded on-chain."
          : "Case manually flagged — custody marked broken.",
      });
      onResolved?.();
    } catch (err: unknown) {
      setMessage({ kind: "err", text: friendlyError(errMessage(err)) });
    } finally {
      setBusy(null);
    }
  }

  if (!caseId) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <svg className="empty-state-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
        </svg>
        <p className="empty-state-text">Select a case to run a custody check.</p>
      </div>
    );
  }

  const isBusy = !!busy;

  return (
    <div style={{ flex: 1, padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border-strong)",
        borderRadius: 12, padding: "20px 22px",
      }}>
        <p style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "var(--muted)", marginBottom: 4,
        }}>
          Verification desk
        </p>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, marginBottom: 14, wordBreak: "break-all" }}>
          {caseId}
        </p>

        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
          Confirms the device attestation, custody handoff log, and witness signature are all
          present on-chain. If any are missing, custody is broken and the case cannot proceed
          to court intake.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <button
            className="primary-btn"
            onClick={() => runCall("verify_compliance", "verify")}
            disabled={isBusy || !publicKey}
          >
            {busy === "verify"
              ? <><span className="spinner" />Running custody check…</>
              : "Run custody check"}
          </button>
          <button
            className="ghost-btn"
            onClick={() => runCall("reject_shipment", "reject")}
            disabled={isBusy || !publicKey}
          >
            {busy === "reject"
              ? <><span className="spinner" style={{ borderTopColor: "var(--rejected)" }} />Flagging case…</>
              : "Manually flag as broken custody"}
          </button>
        </div>

        {!publicKey && (
          <p className="status-line warn" style={{ marginTop: 10 }}>
            Connect your wallet to run a custody check.
          </p>
        )}

        {message && (
          <div style={{ marginTop: 10 }}>
            {message.kind === "err" ? (
              <div className="error-banner">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{message.text}</span>
              </div>
            ) : (
              <p className="status-line ok">{message.text}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}