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

function SkeletonRow() {
  return (
    <div className="case-row-skeleton">
      <div className="skeleton" style={{ height: 12, width: "55%", borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 18, width: 60, borderRadius: 4 }} />
    </div>
  );
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
        try {
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
        } catch {
          return { id, status: "Unknown" as const };
        }
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Header */}
      <div className="section-header" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <p className="section-label">Pipeline</p>
          <p className="section-title">Cases</p>
        </div>
        <button className="refresh-btn" onClick={load} disabled={loading} aria-label="Refresh case list">
          {loading
            ? <><span className="spinner dark" />&nbsp;Loading</>
            : "Refresh"}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Error */}
        {error && (
          <div style={{ padding: "10px 12px" }}>
            <div className="error-banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{ flex: 1 }}>{error}</span>
              <button className="error-banner-retry" onClick={load}>Retry</button>
            </div>
          </div>
        )}

        {/* Skeleton while first load */}
        {loading && rows.length === 0 && !error && (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        )}

        {/* Empty state */}
        {!error && !loading && rows.length === 0 && (
          <div className="empty-state">
            <svg className="empty-state-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 9l4-2v10l-4-2"/>
            </svg>
            <p className="empty-state-text">No cases yet.</p>
            <p className="empty-state-sub">Log footage in Field Capture to start the pipeline.</p>
          </div>
        )}

        {/* Rows */}
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