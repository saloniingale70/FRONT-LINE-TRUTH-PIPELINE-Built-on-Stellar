"use client";

import { useState, useEffect } from "react";
import { CONTRACTS } from "./config";
import { TransactionBuilder, BASE_FEE, Operation, xdr, rpc } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { useFreighter } from "./freighter-context";
import { server, NETWORK_PASSPHRASE } from "./stellar";

export default function VerificationDesk({
  caseId, onResolved,
}: { caseId: string | null; onResolved?: () => void }) {
  const { publicKey } = useFreighter();
  const [busy, setBusy] = useState<"verify" | "reject" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => { setMessage(null); }, [caseId]);

  async function runCall(fn: "verify_compliance" | "reject_shipment", label: "verify" | "reject") {
    if (!publicKey || !caseId) return;
    setBusy(label); setMessage(null);
    try {
      const account = await server.getAccount(publicKey);
      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(Operation.invokeContractFunction({
          contract: CONTRACTS.complianceRegistry,
          function: fn,
          args: [xdr.ScVal.scvSymbol(caseId)],
        }))
        .setTimeout(30)
        .build();

      const simResult = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simResult)) throw new Error(`Simulation failed: ${simResult.error}`);
      const preparedTx = rpc.assembleTransaction(tx, simResult).build();

      const signResult = await signTransaction(preparedTx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE, address: publicKey });
      if (signResult.error) throw new Error(signResult.error.message ?? "Signing rejected.");

      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, NETWORK_PASSPHRASE);
      const sendResult = await server.sendTransaction(signedTx);
      if (sendResult.status === "ERROR") throw new Error(JSON.stringify(sendResult.errorResult));

      let txResult = await server.getTransaction(sendResult.hash);
      let attempts = 0;
      while (txResult.status === "NOT_FOUND" && attempts < 10) {
        await new Promise(r => setTimeout(r, 1000));
        txResult = await server.getTransaction(sendResult.hash);
        attempts++;
      }
      if (txResult.status !== "SUCCESS") throw new Error(`Transaction did not succeed: ${txResult.status}`);

      setMessage({
        kind: "ok",
        text: label === "verify"
          ? "Custody check complete — result recorded on-chain."
          : "Case manually flagged — custody marked broken.",
      });
      onResolved?.();
    } catch (err: any) {
      setMessage({ kind: "err", text: err.message ?? "Could not complete this action." });
    } finally {
      setBusy(null);
    }
  }

  if (!caseId) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 60, color: "var(--muted)" }}>
        <p style={{ fontSize: 13, textAlign: "center", maxWidth: 240 }}>
          Select a case from the pipeline to run a custody check.
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
          Verification desk
        </p>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, marginBottom: 18 }}>{caseId}</p>

        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18, lineHeight: 1.5 }}>
          Confirms the device attestation, custody handoff log, and witness signature are all present on-chain
          for this case. If any are missing, custody is broken and the case cannot proceed to court intake.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="primary-btn" onClick={() => runCall("verify_compliance", "verify")}
            disabled={!!busy || !publicKey}>
            {busy === "verify" ? "Running custody check…" : "Run custody check"}
          </button>
          <button className="ghost-btn" onClick={() => runCall("reject_shipment", "reject")}
            disabled={!!busy || !publicKey}>
            {busy === "reject" ? "Flagging case…" : "Manually flag as broken custody"}
          </button>
        </div>

        {message && <p className={`status-line ${message.kind}`} style={{ marginTop: 12 }}>{message.text}</p>}
      </div>
    </div>
  );
}