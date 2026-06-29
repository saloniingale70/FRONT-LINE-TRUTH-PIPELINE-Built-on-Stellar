"use client";

import { useState } from "react";
import { CONTRACTS } from "./config";
import { TransactionBuilder, BASE_FEE, Operation, xdr, rpc } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { useFreighter } from "./freighter-context";
import { server, NETWORK_PASSPHRASE, textToBytes32 } from "./stellar";

type MsgState = { kind: "ok" | "err" | "warn"; text: string } | null;

function Field({
  icon, value, onChange, placeholder, disabled,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="field-row">
      <span className="field-icon">{icon}</span>
      <input
        className="field-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );
}

export default function FieldCaptureForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const { publicKey } = useFreighter();
  const [caseId, setCaseId] = useState("");
  const [sourceProof, setSourceProof] = useState("");
  const [custodyLog, setCustodyLog] = useState("");
  const [witnessAttestation, setWitnessAttestation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MsgState>(null);

  const caseIdTrimmed = caseId.trim();
  const canSubmit = !!publicKey && !!caseIdTrimmed && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true); setMessage(null);

    try {
      const account = await server.getAccount(publicKey!);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(Operation.invokeContractFunction({
          contract: CONTRACTS.complianceRegistry,
          function: "submit_shipment",
          args: [
            xdr.ScVal.scvSymbol(caseIdTrimmed),
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

      const signResult = await signTransaction(preparedTx.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE, address: publicKey!,
      });
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
      if (txResult.status !== "SUCCESS")
        throw new Error(`Transaction did not confirm (${txResult.status}). Check the network.`);

      setMessage({ kind: "ok", text: `Case ${caseIdTrimmed} logged to the pipeline.` });
      setCaseId(""); setSourceProof(""); setCustodyLog(""); setWitnessAttestation("");
      onSubmitted?.();
    } catch (err: any) {
      const raw = err.message ?? "Could not log this case.";
      // Friendlier error messages
      const msg = raw.includes("Simulation failed")
        ? "Contract simulation failed — ensure your wallet is funded on testnet."
        : raw.includes("Signing rejected") || raw.includes("User declined")
        ? "Transaction was cancelled in your wallet."
        : raw.includes("NOT_FOUND") || raw.includes("NOT_CONFIRMED")
        ? "Transaction submitted but not yet confirmed. Refresh cases in a moment."
        : raw;
      setMessage({ kind: "err", text: msg });
    } finally {
      setBusy(false);
    }
  }

  const videoIcon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 9l4-2v10l-4-2"/>
    </svg>
  );
  const checkIcon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  );
  const shieldIcon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <p className="section-label">Field capture</p>
          <p className="section-title">Log new footage</p>
        </div>
      </div>

      <div style={{ padding: "0 14px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
        <input
          className="field-input mono"
          value={caseId}
          onChange={e => setCaseId(e.target.value)}
          placeholder="Case ID — e.g. CASE-2026-0417"
          disabled={busy}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />

        <Field icon={videoIcon} value={sourceProof} onChange={setSourceProof}
          placeholder="Device + geolocation attestation hash" disabled={busy} />
        <Field icon={checkIcon} value={custodyLog} onChange={setCustodyLog}
          placeholder="Chain-of-custody handoff log hash" disabled={busy} />
        <Field icon={shieldIcon} value={witnessAttestation} onChange={setWitnessAttestation}
          placeholder="Press credential / witness signature hash" disabled={busy} />

        <button
          className="primary-btn"
          onClick={submit}
          disabled={!canSubmit}
          style={{ marginTop: 4 }}
        >
          {busy ? <><span className="spinner" />Logging…</> : "Log to pipeline"}
        </button>

        {!publicKey && (
          <p className="status-line warn" style={{ marginTop: 0 }}>
            Connect your Freighter wallet to log cases.
          </p>
        )}

        {message && (
          <p className={`status-line ${message.kind}`}>{message.text}</p>
        )}
      </div>
    </div>
  );
}