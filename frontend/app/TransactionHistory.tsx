"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CONTRACTS } from "./config";
import { server } from "./stellar";
import { scValToNative, xdr } from "@stellar/stellar-sdk";

const STELLAR_EXPERT_BASE = "https://stellar.expert/explorer/testnet";

const WATCHED_CONTRACTS = [
  { id: CONTRACTS.complianceRegistry, label: "Evidence Registry" },
  { id: CONTRACTS.shipmentApproval,   label: "Court Approval" },
];

interface TxEntry {
  hash: string;
  contract: string;
  contractId: string;
  functionName: string;
  ledger: number;
  createdAt: string;
  topics: string[];
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5)     return "just now";
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function safeScValToString(val: xdr.ScVal): string {
  try {
    const native = scValToNative(val);
    if (typeof native === "string") return native;
    if (native instanceof Uint8Array)
      return Buffer.from(native).toString("hex").slice(0, 12) + "…";
    if (typeof native === "bigint") return native.toString();
    return JSON.stringify(native);
  } catch {
    return "?";
  }
}

function errMsg(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

async function tryGetEvents(contractId: string, startLedger: number) {
  try {
    return await server.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds: [contractId] }],
      limit: 100,
    });
  } catch (err: unknown) {
    const msg = errMsg(err).toLowerCase();
    if (msg.includes("retention") || msg.includes("startledger") || msg.includes("ledger")) {
      return null;
    }
    throw err;
  }
}

async function fetchEventsForContract(
  contractId: string,
  label: string,
  caseId: string,
): Promise<TxEntry[]> {
  const latestLedger = await server.getLatestLedger();
  const LOOKBACKS = [4000, 2000, 720, 120];
  let response = null;

  for (const lookback of LOOKBACKS) {
    const startLedger = Math.max(1, latestLedger.sequence - lookback);
    response = await tryGetEvents(contractId, startLedger);
    if (response !== null) break;
  }

  if (!response?.events?.length) return [];

  const entries: TxEntry[] = [];
  for (const event of response.events) {
    const topics = event.topic ?? [];
    const fnName = topics.length > 0 ? safeScValToString(topics[0]) : "invoke";
    const allTopicStrings = topics.map(safeScValToString).join(" ");
    let valueStr = "";
    try { valueStr = safeScValToString(event.value); } catch { /* ignore */ }
    if (!allTopicStrings.includes(caseId) && !valueStr.includes(caseId)) continue;

    const closeTime: string = (event as any).ledgerClosedAt ?? new Date().toISOString();
    entries.push({
      hash: event.txHash,
      contract: label,
      contractId,
      functionName: fnName,
      ledger: event.ledger,
      createdAt: closeTime,
      topics: topics.map(safeScValToString),
    });
  }

  return entries;
}

function TxHashLink({ hash }: { hash: string }) {
  return (
    <a
      href={`${STELLAR_EXPERT_BASE}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: "var(--accent)", textDecoration: "none",
        display: "inline-flex", alignItems: "center", gap: 4,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
      }}
    >
      {shortHash(hash)}
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ opacity: 0.6 }}>
        <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4"/>
        <path d="M14 4h6v6"/><path d="M20 4L10 14"/>
      </svg>
    </a>
  );
}

function ContractBadge({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 10.5, fontFamily: "'Plus Jakarta Sans', sans-serif",
      padding: "2px 7px", borderRadius: 4,
      background: "var(--accent-light)", color: "var(--accent)",
      border: "1px solid #bfdbfe", fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

interface Props {
  caseId: string | null;
  station: "capture" | "verify" | "intake";
  refreshKey?: number;
}

export default function TransactionHistory({ caseId, station, refreshKey }: Props) {
  const [entries, setEntries] = useState<TxEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!caseId) { setEntries([]); return; }
    setLoading(true); setErrors([]);

    const newErrors: string[] = [];
    const allEntries: TxEntry[] = [];

    await Promise.all(
      WATCHED_CONTRACTS.map(async c => {
        try {
          const evts = await fetchEventsForContract(c.id, c.label, caseId);
          allEntries.push(...evts);
        } catch (err: unknown) {
          newErrors.push(`${c.label}: ${errMsg(err)}`);
        }
      }),
    );

    const sorted = allEntries.sort((a, b) => b.ledger - a.ledger);
    const seen = new Set<string>();
    const deduped = sorted.filter(e => {
      const key = `${e.hash}:${e.contractId}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    setEntries(deduped);
    setErrors(newErrors);
    setLastUpdated(new Date());
    setLoading(false);
  }, [caseId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!caseId) return;
    timerRef.current = setInterval(load, 8_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [caseId, load]);

  if (!caseId) return null;

  const stationLabel =
    station === "capture" ? "Field Capture"
    : station === "verify" ? "Verification Desk"
    : "Court Intake";

  return (
    <div style={{
      margin: "0 24px 24px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "11px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-2)",
        gap: 8, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--muted)",
            fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap",
          }}>
            On-chain activity
          </span>
          <ContractBadge label={stationLabel} />
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
            color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: 140, whiteSpace: "nowrap",
          }}>
            {caseId}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
          {lastUpdated && !loading && (
            <span style={{ fontSize: 10, color: "var(--dim)", fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap" }}>
              {relativeTime(lastUpdated.toISOString())}
            </span>
          )}
          {loading && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--accent)" }}>
              <span className="spinner dark" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
              Scanning
            </span>
          )}
          <button className="refresh-btn" onClick={load} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ padding: "8px 14px" }}>
          <div className="error-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ flex: 1 }}>
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
            <button className="error-banner-retry" onClick={load}>Retry</button>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && entries.length === 0 && (
        <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2].map(i => (
            <div key={i} className="skeleton" style={{ height: 36, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && errors.length === 0 && (
        <div className="empty-state" style={{ padding: "28px 20px" }}>
          <p className="empty-state-text" style={{ fontSize: 12 }}>
            No on-chain events found for <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{caseId}</code>.
          </p>
          <p className="empty-state-sub">Events appear after a successful contract invocation.</p>
        </div>
      )}

      {/* Desktop table */}
      {entries.length > 0 && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="tx-table">
              <thead>
                <tr>
                  {["Tx Hash", "Contract", "Function", "Topics", "Ledger", "Time"].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr
                    key={`${e.hash}:${e.contractId}:${i}`}
                    onMouseEnter={ev => (ev.currentTarget.style.background = "var(--accent-light)")}
                    onMouseLeave={ev => (ev.currentTarget.style.background = "")}
                  >
                    <td><TxHashLink hash={e.hash} /></td>
                    <td><ContractBadge label={e.contract} /></td>
                    <td style={{ color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5 }}>
                      {e.functionName}
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {e.topics.slice(1).map((t, ti) => (
                          <span key={ti} style={{
                            fontSize: 10, padding: "1px 6px", borderRadius: 3,
                            background: "var(--surface-2)", color: "var(--text-2)",
                            border: "1px solid var(--border)", whiteSpace: "nowrap",
                            maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
                            fontFamily: "'IBM Plex Mono', monospace",
                          }} title={t}>{t}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>
                      #{e.ledger}
                    </td>
                    <td style={{ color: "var(--muted)", whiteSpace: "nowrap", fontSize: 11 }}>
                      {relativeTime(e.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div>
            {entries.map((e, i) => (
              <div key={`m-${e.hash}:${i}`} className="tx-card">
                <div className="tx-card-row">
                  <TxHashLink hash={e.hash} />
                  <ContractBadge label={e.contract} />
                </div>
                <div className="tx-card-row" style={{ marginTop: 6 }}>
                  <div>
                    <div className="tx-card-label">Function</div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "var(--text)" }}>
                      {e.functionName}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="tx-card-label">Ledger</div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--muted)" }}>
                      #{e.ledger}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: 5 }}>
                  <div className="tx-card-label" style={{ marginBottom: 3 }}>Topics</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {e.topics.slice(1).map((t, ti) => (
                      <span key={ti} style={{
                        fontSize: 10, padding: "1px 6px", borderRadius: 3,
                        background: "var(--surface-2)", color: "var(--text-2)",
                        border: "1px solid var(--border)",
                        fontFamily: "'IBM Plex Mono', monospace",
                        maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
                      }} title={t}>{t}</span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 5, fontSize: 10.5, color: "var(--dim)" }}>
                  {relativeTime(e.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}