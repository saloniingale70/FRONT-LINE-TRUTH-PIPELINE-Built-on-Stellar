"use client";

import { useState, useEffect } from "react";
import { CONTRACTS, EXPORTER_ADDRESS } from "./config";
import { TransactionBuilder, BASE_FEE, Operation, Address, xdr, rpc } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { useFreighter } from "./freighter-context";
import { server, NETWORK_PASSPHRASE } from "./stellar";

type Stage = "idle" | "building" | "signing" | "submitting" | "done" | "error";

const STAGE_LABELS: Record<Stage, string> = {
  idle: "Submit for court intake",
  building: "Preparing submission…",
  signing: "Awaiting signature…",
  submitting: "Submitting to network…",
  done: "Submitted",
  error: "Retry submission",
};

const DOT_STATE: Record<Stage, [string, string, string]> = {
  idle:       ["", "", ""],
  building:   ["active", "", ""],
  signing:    ["done", "active", ""],
  submitting: ["done", "done", "active"],
  done:       ["done", "done", "done"],
  error:      ["", "", ""],
};

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
    setErrorMsg("");
    setAdmissible(null);

    try {
      setStage("building");
      const account = await server.getAccount(publicKey);

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
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
        throw new Error(signResult.error.message ?? "Signing was rejected.");

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

      // Check final compliance status
      const accountForQuery = await server.getAccount(publicKey);
      const checkTx = new TransactionBuilder(accountForQuery, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
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
      setErrorMsg(err.message ?? "Something went wrong.");
      setStage("error");
    }
  }

  if (!caseId) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 12, padding: "60px 40px",
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
          style={{ opacity: 0.25, color: "var(--accent)" }}>
          <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"/>
        </svg>
        <p style={{ fontSize: 13, textAlign: "center", maxWidth: 220, color: "var(--muted)" }}>
          Select a case that has passed the verification desk to submit it for court intake.
        </p>
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
    <div style={{ flex: 1, padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{
        background: "var(--card)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: 16,
        }}>
          <div>
            <p style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
            }}>
              Case file
            </p>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 500 }}>
              {caseId}
            </p>
          </div>
          <span className={stampClass}>{stampText}</span>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            className="primary-btn"
            onClick={submitForIntake}
            disabled={busy || !publicKey || stage === "done"}
          >
            {!publicKey ? "Connect wallet to submit" : STAGE_LABELS[stage]}
          </button>

          {busy && (
            <div className="step-dots">
              {dots.map((s, i) => (
                <span key={i} className={`step-dot${s ? ` ${s}` : ""}`} />
              ))}
            </div>
          )}

          {stage === "error" && (
            <p className="status-line err">{errorMsg}</p>
          )}

          {stage === "done" && (
            <p className="status-line ok">
              Custody status:{" "}
              <span style={{ color: admitted ? "var(--compliant)" : "var(--rejected)" }}>
                {admissible}
              </span>
              {admitted
                ? " — accepted into the case record."
                : " — rejected, custody chain incomplete."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}