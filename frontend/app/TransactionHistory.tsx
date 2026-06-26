"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CONTRACTS } from "./config";
import { server } from "./stellar";
import { scValToNative, xdr } from "@stellar/stellar-sdk";

const STELLAR_EXPERT_BASE = "https://stellar.expert/explorer/testnet";

// Only two real contracts — no exporter contract exists
const WATCHED_CONTRACTS = [
  { id: CONTRACTS.complianceRegistry, label: "Compliance Registry" },
  { id: CONTRACTS.shipmentApproval,   label: "Shipment Approval" },
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

async function tryGetEvents(
  contractId: string,
  startLedger: number,
): Promise<Awaited<ReturnType<typeof server.getEvents>> | null> {
  try {
    return await server.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds: [contractId] }],
      limit: 100,
    });
  } catch (err: unknown) {
    const msg = errMsg(err).toLowerCase();
    if (msg.includes("retention") || msg.includes("startledger") || msg.includes("ledger")) {
      return null; // retry with smaller window
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

  // Try progressively smaller lookback windows until RPC accepts
  const LOOKBACKS = [4000, 2000, 720, 120];
  let response: Awaited<ReturnType<typeof server.getEvents>> | null = null;

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

    // Only include events that mention this caseId in topics or value
    const allTopicStrings = topics.map(safeScValToString).join(" ");
    let valueStr = "";
    try { valueStr = safeScValToString(event.value); } catch { /* ignore */ }

    if (!allTopicStrings.includes(caseId) && !valueStr.includes(caseId)) continue;

    const closeTime: string =
      (event as any).ledgerClosedAt ?? new Date().toISOString();

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
    setLoading(true);
    setErrors([]);

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
      seen.add(key);
      return true;
    });

    setEntries(deduped);
    setErrors(newErrors);
    setLastUpdated(new Date());
    setLoading(false);
  }, [caseId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Auto-poll every 8s while a case is selected
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
      margin: "0 32px 32px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "13px 18px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--muted)",
            fontFamily: "'Inter', sans-serif",
          }}>
            On-chain activity
          </span>
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 4,
            background: "var(--accent-light)", color: "var(--accent)",
            border: "1px solid #bfdbfe", fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
          }}>
            {stationLabel}
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--muted)" }}>
            {caseId}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastUpdated && !loading && (
            <span style={{ fontSize: 10, color: "var(--dim)", fontFamily: "'Inter', sans-serif" }}>
              Updated {relativeTime(lastUpdated.toISOString())}
            </span>
          )}
          {loading && (
            <span style={{ fontSize: 10, color: "var(--accent)", fontFamily: "'Inter', sans-serif" }}>
              Scanning…
            </span>
          )}
          <button className="refresh-btn" onClick={load} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Per-contract errors */}
      {errors.length > 0 && (
        <div style={{
          padding: "8px 18px", fontSize: 11,
          color: "var(--rejected)", background: "var(--rejected-bg)",
          borderBottom: "1px solid var(--rejected-border)",
          fontFamily: "'Inter', sans-serif",
          display: "flex", flexDirection: "column", gap: 2,
        }}>
          {errors.map((e, i) => <span key={i}>⚠ {e}</span>)}
        </div>
      )}

      {/* Loading */}
      {loading && entries.length === 0 && (
        <div style={{
          padding: "28px 18px", fontSize: 12, color: "var(--muted)",
          textAlign: "center", fontFamily: "'Inter', sans-serif",
        }}>
          Scanning Soroban events for{" "}
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{caseId}</span>…
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && errors.length === 0 && (
        <div style={{
          padding: "28px 18px", fontSize: 12, color: "var(--muted)",
          textAlign: "center", fontFamily: "'Inter', sans-serif",
        }}>
          No on-chain events found for{" "}
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{caseId}</span>.
          <span style={{ fontSize: 11, color: "var(--dim)", marginTop: 4, display: "block" }}>
            Events appear after a successful contract invocation referencing this case ID.
          </span>
        </div>
      )}

      {/* Table */}
      {entries.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%", borderCollapse: "collapse",
            fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
          }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                {["Tx Hash", "Contract", "Function", "Topics", "Ledger", "Time"].map(h => (
                  <th key={h} style={{
                    padding: "8px 14px", textAlign: "left", fontWeight: 700,
                    fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "var(--muted)", borderBottom: "1px solid var(--border)",
                    fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr
                  key={`${e.hash}:${e.contractId}:${i}`}
                  style={{
                    borderBottom: i < entries.length - 1 ? "1px solid var(--border)" : "none",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = "var(--accent-light)")}
                  onMouseLeave={ev => (ev.currentTarget.style.background = "")}
                >
                  {/* Tx hash */}
                  <td style={{ padding: "10px 14px" }}>
                    <a
                      href={`${STELLAR_EXPERT_BASE}/tx/${e.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--accent)", textDecoration: "none",
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}
                      onMouseEnter={ev => ((ev.currentTarget as HTMLElement).style.textDecoration = "underline")}
                      onMouseLeave={ev => ((ev.currentTarget as HTMLElement).style.textDecoration = "none")}
                    >
                      {shortHash(e.hash)}
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                        style={{ opacity: 0.6 }}>
                        <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4"/>
                        <path d="M14 4h6v6"/><path d="M20 4L10 14"/>
                      </svg>
                    </a>
                  </td>

                  {/* Contract badge */}
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{
                      fontSize: 11, fontFamily: "'Inter', sans-serif",
                      padding: "2px 7px", borderRadius: 4,
                      background: "var(--accent-light)", color: "var(--accent)",
                      border: "1px solid #bfdbfe", fontWeight: 600, whiteSpace: "nowrap",
                    }}>
                      {e.contract}
                    </span>
                  </td>

                  {/* Function */}
                  <td style={{ padding: "10px 14px", color: "var(--text)" }}>
                    {e.functionName}
                  </td>

                  {/* Topics (skip topic[0] = fn name) */}
                  <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {e.topics.slice(1).map((t, ti) => (
                        <span key={ti} style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 3,
                          background: "var(--surface-2)", color: "var(--text-2)",
                          border: "1px solid var(--border)", whiteSpace: "nowrap",
                          maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis",
                        }} title={t}>{t}</span>
                      ))}
                    </div>
                  </td>

                  {/* Ledger */}
                  <td style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 11 }}>
                    #{e.ledger}
                  </td>

                  {/* Time */}
                  <td style={{ padding: "10px 14px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {relativeTime(e.createdAt)}
                    <span style={{ fontSize: 9.5, display: "block", opacity: 0.65 }}>
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}