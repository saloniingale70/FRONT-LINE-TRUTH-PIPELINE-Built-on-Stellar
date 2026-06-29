"use client";

import { useState, useEffect } from "react";
import { CONTRACTS, EXPORTER_ADDRESS } from "./config";
import { TransactionBuilder, BASE_FEE, Operation, Address, xdr, rpc } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { useFreighter } from "./freighter-context";
import { server, NETWORK_PASSPHRASE } from "./stellar";

type Stage = "idle" | "building" | "signing" | "submitting" | "done" | "error";

const STAGE_LABELS: Record<Stage, string> = {
  idle:       "Submit for court intake",
  building:   "Preparing submission…",
  signing:    "Awaiting wallet signature…",
  submitting: "Submitting to network…",
  done:       "Submitted",
  error:      "Retry submission",
};

const DOT_STATE: Record<Stage, [string, string, string]> = {
  idle:       ["", "", ""],
  building:   ["active", "", ""],
  signing:    ["done", "active", ""],
  submitting: ["done", "done", "active"],
  done:       ["done", "done", "done"],
  error:      ["", "", ""],
};

const STEP_HINTS: Record<Stage, string> = {
  idle:       "",
  building:   "Simulating transaction against contract…",
  signing:    "Open Freighter and approve the transaction.",
  submitting: "Waiting for on-chain confirmation…",
  done:       "",
  error:      "",
};

function friendlyError(raw: string): string {
  if (raw.includes("Simulation failed"))
    return "Contract simulation failed — ensure the case exists and has a pending status.";
  if (raw.includes("Signing rejected") || raw.includes("User declined"))
    return "Transaction was cancelled in your wallet.";
  if (raw.includes("INSUFFICIENT_FUNDS") || raw.includes("insufficient balance"))
    return "Insufficient testnet XLM. Fund your wallet at friendbot.stellar.org.";
  if (raw.includes("NOT_FOUND") || raw.includes("NOT_CONFIRMED"))
    return "Transaction was submitted but did not confirm. Try again in a moment.";
  return raw;
}

export default function CourtIntake({
  caseId,
  onResolved,
}: {
  caseId: string | null;
  onResolved?: () => void;
}) {
  const { publicKey } = useFreighter();
  const [stage, setStage] = useState<Stage>("idle");
  const [admissible, setAdmissible] = useState<"true" | "false" | "unknown" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setStage("idle");
    setAdmissible(null);
    setErrorMsg("");
  }, [caseId]);

  const busy = stage === "building" || stage === "signing" || stage === "submitting";

  async function submitForIntake() {
    if (!publicKey || !caseId) return;
    setErrorMsg(""); setAdmissible(null);

    try {
      setStage("building");
      const account = await server.getAccount(publicKey);

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: CONTRACTS.shipmentApproval,
            function: "approve_shipment",
            args: [
              new Address(CONTRACTS.complianceRegistry).toScVal(),
              xdr.ScVal.scvSymbol(caseId),
              new Address(EXPORTER_ADDRESS).toScVal(),
            ],
          }),
        )
        .setTimeout(30)
        .build();

      const simResult = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simResult))
        throw new Error(`Simulation failed: ${simResult.error}`);
      const preparedTx = rpc.assembleTransaction(tx, simResult).build();

      setStage("signing");
      const signResult = await signTransaction(preparedTx.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: publicKey,
      });
      if (signResult.error)
        throw new Error(signResult.error.message ?? "Signing rejected.");

      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, NETWORK_PASSPHRASE);

      setStage("submitting");
      const sendResult = await server.sendTransaction(signedTx);
      if (sendResult.status === "ERROR")
        throw new Error(`Transaction failed: ${JSON.stringify(sendResult.errorResult)}`);

      let txResult = await server.getTransaction(sendResult.hash);
      let attempts = 0;
      while (txResult.status === "NOT_FOUND" && attempts < 10) {
        await new Promise(r => setTimeout(r, 1000));
        txResult = await server.getTransaction(sendResult.hash);
        attempts++;
      }
      if (txResult.status !== "SUCCESS")
        throw new Error(`Transaction did not succeed: ${txResult.status}`);

      // Check final compliance
      const accountForQuery = await server.getAccount(publicKey);
      const checkTx = new TransactionBuilder(accountForQuery, {
        fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: CONTRACTS.complianceRegistry,
            function: "is_compliant",
            args: [xdr.ScVal.scvSymbol(caseId)],
          }),
        )
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(checkTx);
      let result: "true" | "false" | "unknown" = "unknown";
      if (rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
        const val = sim.result.retval;
        if (val.switch().name === "scvBool") result = val.b() ? "true" : "false";
      }

      setAdmissible(result);
      setStage("done");
      onResolved?.();
    } catch (err: any) {
      setErrorMsg(friendlyError(err.message ?? "Something went wrong."));
      setStage("error");
    }
  }

  if (!caseId) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <svg className="empty-state-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"/>
        </svg>
        <p className="empty-state-text">Select a verified case to submit it for court intake.</p>
      </div>
    );
  }

  const admitted = admissible === "true";
  const dots = DOT_STATE[stage];
  const stampClass =
    stage !== "done" ? "stamp pending-stamp"
    : admitted       ? "stamp cleared-stamp"
    :                  "stamp rejected-stamp";
  const stampText =
    stage !== "done" ? "Awaiting intake"
    : admitted       ? "Admissible"
    :                  "Not admissible";

  return (
    <div style={{ flex: 1, padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        overflow: "hidden",
      }}>
        {/* Card header */}
        <div style={{
          padding: "18px 22px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "var(--muted)", marginBottom: 5,
            }}>
              Case file
            </p>
            <p style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 500,
              wordBreak: "break-all",
            }}>
              {caseId}
            </p>
          </div>
          <span className={stampClass}>{stampText}</span>
        </div>

        {/* Card body */}
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            className="primary-btn"
            onClick={submitForIntake}
            disabled={busy || !publicKey || stage === "done"}
          >
            {busy
              ? <><span className="spinner" />{STAGE_LABELS[stage]}</>
              : !publicKey
              ? "Connect wallet to submit"
              : STAGE_LABELS[stage]}
          </button>

          {/* Stage hint */}
          {busy && STEP_HINTS[stage] && (
            <p style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", margin: 0 }}>
              {STEP_HINTS[stage]}
            </p>
          )}

          {/* Progress dots */}
          {busy && (
            <div className="step-dots">
              {dots.map((s, i) => (
                <span key={i} className={`step-dot${s ? ` ${s}` : ""}`} />
              ))}
            </div>
          )}

          {/* Error state */}
          {stage === "error" && (
            <div className="error-banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{ flex: 1 }}>{errorMsg}</span>
            </div>
          )}

          {/* Success state */}
          {stage === "done" && (
            <p className="status-line ok">
              Admissibility:{" "}
              <strong style={{ color: admitted ? "var(--compliant)" : "var(--rejected)" }}>
                {admissible}
              </strong>
              {admitted
                ? " — accepted into the case record."
                : " — rejected, custody chain incomplete."}
            </p>
          )}

          {!publicKey && (
            <p className="status-line warn" style={{ marginTop: 0 }}>
              Connect your Freighter wallet to submit.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}