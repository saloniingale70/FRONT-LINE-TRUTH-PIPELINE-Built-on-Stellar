"use client";

import { useState } from "react";
import { CONTRACTS } from "./config";
import { TransactionBuilder, BASE_FEE, Operation, xdr, rpc } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { useFreighter } from "./freighter-context";
import { server, NETWORK_PASSPHRASE, textToBytes32 } from "./stellar";

export default function FieldCaptureForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const { publicKey } = useFreighter();
  const [caseId, setCaseId] = useState("");
  const [sourceProof, setSourceProof] = useState("");      // -> gst_hash slot
  const [custodyLog, setCustodyLog] = useState("");          // -> customs_hash slot
  const [witnessAttestation, setWitnessAttestation] = useState(""); // -> sustainability_hash slot
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit() {
    if (!publicKey || !caseId.trim()) return;
    setBusy(true); setMessage(null);
    try {
      const account = await server.getAccount(publicKey);
      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(Operation.invokeContractFunction({
          contract: CONTRACTS.complianceRegistry,
          function: "submit_shipment",
          args: [
            xdr.ScVal.scvSymbol(caseId.trim()),
            xdr.ScVal.scvBytes(Buffer.from(textToBytes32(sourceProof))),
            xdr.ScVal.scvBytes(Buffer.from(textToBytes32(custodyLog))),
            xdr.ScVal.scvBytes(Buffer.from(textToBytes32(witnessAttestation))),
          ],
        }))
        .setTimeout(30)
        .build();

      const simResult = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simResult)) throw new Error(simResult.error);
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

      setMessage({ kind: "ok", text: `Case ${caseId.trim()} logged to the pipeline.` });
      setCaseId(""); setSourceProof(""); setCustodyLog(""); setWitnessAttestation("");
      onSubmitted?.();
    } catch (err: any) {
      setMessage({ kind: "err", text: err.message ?? "Could not log this case." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <p className="section-label">Field capture</p>
          <p className="section-title">Log new footage</p>
        </div>
      </div>

      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        <input className="field-input mono" value={caseId} onChange={e => setCaseId(e.target.value)}
          placeholder="Case ID — e.g. CASE-2026-0417" />

        <div className="field-row">
          <span className="field-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 9l4-2v10l-4-2"/></svg>
          </span>
          <input className="field-input" value={sourceProof} onChange={e => setSourceProof(e.target.value)}
            placeholder="Device + geolocation attestation hash" />
        </div>

        <div className="field-row">
          <span className="field-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          </span>
          <input className="field-input" value={custodyLog} onChange={e => setCustodyLog(e.target.value)}
            placeholder="Chain-of-custody handoff log hash" />
        </div>

        <div className="field-row">
          <span className="field-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </span>
          <input className="field-input" value={witnessAttestation} onChange={e => setWitnessAttestation(e.target.value)}
            placeholder="Press credential / witness signature hash" />
        </div>

        <button className="primary-btn" onClick={submit} disabled={busy || !publicKey || !caseId.trim()} style={{ marginTop: 4 }}>
          {busy ? "Logging…" : "Log to pipeline"}
        </button>

        {message && <p className={`status-line ${message.kind}`}>{message.text}</p>}
      </div>
    </div>
  );
}