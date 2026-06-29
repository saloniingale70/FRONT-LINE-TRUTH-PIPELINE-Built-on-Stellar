"use client";

import { useState, useCallback } from "react";
import ConnectWalletButton from "./ConnectWalletButton";
import FieldCaptureForm from "./FieldCaptureForm";
import CaseRegistry from "./CaseRegistry";
import VerificationDesk from "./VerificationDesk";
import CourtIntake from "./CourtIntake";
import TransactionHistory from "./TransactionHistory";
import StellarMark from "./StellarMark";
import ToastProvider, { useToast } from "./ToastProvider";
import { PIPELINE } from "./config";

type Station = "capture" | "verify" | "intake";

function AppShell() {
  const [station, setStation] = useState<Station>("capture");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();

  const bump = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(false); // close drawer on case select (mobile)
  };

  const handleSubmitted = () => {
    bump();
    toast("Case logged to the pipeline.", "ok");
  };

  const stationLabels: Record<Station, [string, string]> = {
    capture: ["Field capture", "Pipeline overview"],
    verify:  ["Verification desk", "Custody check"],
    intake:  ["Court intake", "Submit for admissibility"],
  };

  const [eyebrow, title] = stationLabels[station];

  return (
    <div className="root">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-name">{PIPELINE.name}</span>
          <span className="topbar-divider" />
          <span className="powered-by">
            <StellarMark size={17} />
            <span className="label">{PIPELINE.network}</span>
          </span>
        </div>
        <ConnectWalletButton />
      </header>

      {/* Station tabs */}
      <nav className="station-tabs">
        {(["capture", "verify", "intake"] as Station[]).map(s => (
          <button
            key={s}
            className={`station-tab${station === s ? " active" : ""}`}
            onClick={() => setStation(s)}
          >
            {s === "capture" ? "Field Capture" : s === "verify" ? "Verification Desk" : "Court Intake"}
          </button>
        ))}
      </nav>

      <div className="layout">
        {/* Mobile overlay */}
        <div
          className={`mobile-overlay${drawerOpen ? "" : " hidden"}`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />

        {/* Left panel / mobile drawer */}
        <div className={`left-panel${drawerOpen ? " open" : ""}`}>
          {station === "capture" && (
            <FieldCaptureForm onSubmitted={handleSubmitted} />
          )}
          <CaseRegistry
            onSelect={handleSelect}
            selectedId={selectedId}
            refreshKey={refreshKey}
          />
        </div>

        {/* Right panel */}
        <div className="right-panel">
          <div className="panel-header">
            <p className="panel-eyebrow">{eyebrow}</p>
            <h1 className="panel-title">{title}</h1>
          </div>

          {station === "capture" && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--muted)", fontSize: 13, padding: "32px 24px",
              textAlign: "center",
            }}>
              {selectedId
                ? `Viewing case: ${selectedId}`
                : "Select a case on the left, or move to Verification Desk once footage is logged."}
            </div>
          )}

          {station === "verify" && (
            <VerificationDesk caseId={selectedId} onResolved={bump} />
          )}
          {station === "intake" && (
            <CourtIntake caseId={selectedId} onResolved={bump} />
          )}

          <TransactionHistory
            caseId={selectedId}
            station={station}
            refreshKey={refreshKey}
          />
        </div>
      </div>

      {/* Mobile FAB to open left panel */}
      <button
        className="mobile-panel-toggle"
        onClick={() => setDrawerOpen(v => !v)}
        aria-label={drawerOpen ? "Close cases panel" : "Open cases panel"}
      >
        {drawerOpen ? "✕" : "☰"}
      </button>
    </div>
  );
}

export default function Page() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}