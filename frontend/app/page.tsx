"use client";

import { useState } from "react";
import ConnectWalletButton from "./ConnectWalletButton";
import FieldCaptureForm from "./FieldCaptureForm";
import CaseRegistry from "./CaseRegistry";
import VerificationDesk from "./VerificationDesk";
import CourtIntake from "./CourtIntake";
import TransactionHistory from "./TransactionHistory";
import StellarMark from "./StellarMark";
import { PIPELINE } from "./config";

type Station = "capture" | "verify" | "intake";

export default function Page() {
  const [station, setStation] = useState<Station>("capture");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const bump = () => setRefreshKey(k => k + 1);

  return (
    <div className="root">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-name">{PIPELINE.name}</span>
          <span className="topbar-divider" />
          <span className="powered-by">
            <StellarMark size={18} />
            <span className="label">{PIPELINE.network}</span>
          </span>
        </div>
        <ConnectWalletButton />
      </header>

      <nav className="station-tabs">
        <button className={`station-tab${station === "capture" ? " active" : ""}`} onClick={() => setStation("capture")}>
          Field Capture
        </button>
        <button className={`station-tab${station === "verify" ? " active" : ""}`} onClick={() => setStation("verify")}>
          Verification Desk
        </button>
        <button className={`station-tab${station === "intake" ? " active" : ""}`} onClick={() => setStation("intake")}>
          Court Intake
        </button>
      </nav>

      <div className="layout">
        <div className="left-panel">
          {station === "capture" && <FieldCaptureForm onSubmitted={bump} />}
          <CaseRegistry onSelect={setSelectedId} selectedId={selectedId} refreshKey={refreshKey} />
        </div>

        <div className="right-panel">
          <div className="panel-header">
            <p className="panel-eyebrow">
              {station === "capture" ? "Field capture" : station === "verify" ? "Verification desk" : "Court intake"}
            </p>
            <h1 className="panel-title">
              {station === "capture" ? "Pipeline overview" : station === "verify" ? "Custody check" : "Submit for admissibility"}
            </h1>
          </div>

          {station === "capture" && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--muted)", fontSize: 13, padding: "40px 40px 24px",
              textAlign: "center",
            }}>
              Select a case on the left, or move to Verification Desk once footage is logged.
            </div>
          )}

          {station === "verify" && <VerificationDesk caseId={selectedId} onResolved={bump} />}
          {station === "intake"  && <CourtIntake      caseId={selectedId} onResolved={bump} />}

          {/* Transaction history — shown on every station when a case is selected */}
          <TransactionHistory
            caseId={selectedId}
            station={station}
            refreshKey={refreshKey}
          />
        </div>
      </div>

      <footer className="footer-attribution">
        This is independent software, not affiliated with, sponsored, or endorsed by the Stellar Development Foundation.
      </footer>
    </div>
  );
}