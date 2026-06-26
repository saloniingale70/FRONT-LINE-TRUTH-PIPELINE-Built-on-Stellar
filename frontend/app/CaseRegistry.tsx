"use client";

import { useEffect, useState, useCallback } from "react";
import { CONTRACTS } from "./config";
import {
  TransactionBuilder, Account, Operation, BASE_FEE,
  xdr, scValToNative, Keypair,
} from "@stellar/stellar-sdk";
import { server, NETWORK_PASSPHRASE } from "./stellar";

type CaseRow = { id: string; status: "Pending" | "Compliant" | "Rejected" | "Unknown" };

const dummyKeypair = Keypair.random();
const DUMMY_ACCOUNT = new Account(dummyKeypair.publicKey(), "0");

async function simulateRead(fn: string, args: xdr.ScVal[]) {
  const tx = new TransactionBuilder(DUMMY_ACCOUNT, {
    fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.invokeContractFunction({
      contract: CONTRACTS.complianceRegistry, function: fn, args,
    }))
    .setTimeout(30)
    .build();
  return server.simulateTransaction(tx);
}

function extractEnumVariant(value: unknown): string {
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  if (typeof value === "string") return value;
  return "Unknown";
}

export default function CaseRegistry({
  onSelect, selectedId, refreshKey,
}: {
  onSelect: (id: string) => void;
  selectedId: string | null;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const listSim = await simulateRead("list_shipments", []);
      if ("error" in listSim) throw new Error(listSim.error);
      if (!("result" in listSim) || !listSim.result?.retval) { setRows([]); return; }

      const ids: string[] = scValToNative(listSim.result.retval);
      const statusResults = await Promise.all(ids.map(async id => {
        const statusSim = await simulateRead("get_shipment", [xdr.ScVal.scvSymbol(id)]);
        if ("error" in statusSim || !("result" in statusSim) || !statusSim.result?.retval)
          return { id, status: "Unknown" as const };
        const native = scValToNative(statusSim.result.retval);
        if (!native) return { id, status: "Unknown" as const };
        const variantName = extractEnumVariant(native.status);
        const normalized = (
          ["Compliant", "Pending", "Rejected"].includes(variantName) ? variantName : "Unknown"
        ) as CaseRow["status"];
        return { id, status: normalized };
      }));
      setRows(statusResults);
    } catch (err: any) {
      setError(err.message ?? "Could not load case registry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div className="section-header" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <p className="section-label">Pipeline</p>
          <p className="section-title">Cases</p>
        </div>
        <button className="refresh-btn" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Case rows */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {error && (
          <p style={{ padding: "14px 16px", fontSize: 12, color: "var(--rejected)", background: "var(--rejected-bg)", margin: 12, borderRadius: 6 }}>
            {error}
          </p>
        )}
        {!error && !loading && rows.length === 0 && (
          <p style={{ padding: "36px 20px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            No cases yet. Log footage in Field Capture.
          </p>
        )}
        {rows.map(row => (
          <button
            key={row.id}
            onClick={() => onSelect(row.id)}
            className={`case-row${selectedId === row.id ? " selected" : ""}`}
            title={`View case ${row.id}`}
          >
            <span className="case-row-id">{row.id}</span>
            <span className={`badge ${row.status.toLowerCase()}`}>{row.status}</span>
          </button>
        ))}
      </div>
    </div>
  );
}