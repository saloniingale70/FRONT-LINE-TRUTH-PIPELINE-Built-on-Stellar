/**
 * Frontline Truth Pipeline — Frontend Tests
 *
 * Stack: Jest + React Testing Library
 *
 * Run:
 *   npm install --save-dev jest @types/jest ts-jest \
 *     @testing-library/react @testing-library/jest-dom @testing-library/user-event \
 *     jest-environment-jsdom
 *
 *   npx jest frontline-pipeline.test.tsx
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ─── Shared mocks ─────────────────────────────────────────────────────────────

jest.mock("@stellar/stellar-sdk", () => {
  const scvSymbol = (s: string) => ({ type: "symbol", value: s });
  const scvBytes  = (b: Buffer) => ({ type: "bytes",  value: b });
  const scvBool   = (b: boolean) => ({
    type: "bool",
    b: () => b,
    switch: () => ({ name: "scvBool" }),
  });

  return {
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout:   jest.fn().mockReturnThis(),
      build:        jest.fn().mockReturnValue({ toXDR: () => "mock-xdr" }),
    })),
    Operation: {
      invokeContractFunction: jest.fn().mockReturnValue({}),
    },
    BASE_FEE: "100",
    xdr: {
      ScVal: { scvSymbol, scvBytes, scvBool },
    },
    scValToNative: jest.fn((val: any) => {
      if (val?.type === "symbol") return val.value;
      if (val?.type === "bool")   return val.b();
      return null;
    }),
    Keypair: { random: () => ({ publicKey: () => "GFAKEKEY", secretKey: () => "SFAKEKEY" }) },
    Account:  jest.fn().mockImplementation(() => ({})),
    Address:  jest.fn().mockImplementation((addr: string) => ({
      toScVal: () => ({ type: "address", value: addr }),
    })),
    rpc: {
      Server: jest.fn(),
      Api: {
        isSimulationError:   jest.fn(() => false),
        isSimulationSuccess: jest.fn(() => true),
      },
      assembleTransaction: jest.fn().mockReturnValue({
        build: jest.fn().mockReturnValue({ toXDR: () => "prepared-xdr" }),
      }),
    },
    Networks: { TESTNET: "Test SDF Network ; September 2015" },
  };
});

jest.mock("@stellar/freighter-api", () => ({
  isConnected:     jest.fn(),
  isAllowed:       jest.fn(),
  setAllowed:      jest.fn(),
  getAddress:      jest.fn(),
  signTransaction: jest.fn(),
}));

jest.mock("./stellar", () => ({
  server: {
    simulateTransaction: jest.fn(),
    getAccount:          jest.fn(),
    sendTransaction:     jest.fn(),
    getTransaction:      jest.fn(),
    getLatestLedger:     jest.fn(),
    getEvents:           jest.fn(),
  },
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  textToBytes32: jest.fn((_s: string) => new Uint8Array(32)),
}));

jest.mock("./config", () => ({
  CONTRACTS: {
    complianceRegistry: "CCFAKE1",
    shipmentApproval:   "CBFAKE2",
  },
  EXPORTER_ADDRESS: "GDFAKEEXPORTER",
  PIPELINE: { name: "Frontline Truth Pipeline", network: "BUILT ON STELLAR" },
}));

import { server } from "./stellar";
import * as FreighterAPI from "@stellar/freighter-api";

// ─── Minimal FreighterContext for tests ───────────────────────────────────────

const FreighterContext = React.createContext<{
  publicKey: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
} | undefined>(undefined);

function MockFreighterProvider({
  children,
  publicKey = null,
}: {
  children: React.ReactNode;
  publicKey?: string | null;
}) {
  return (
    <FreighterContext.Provider
      value={{ publicKey, connecting: false, error: null, connect: jest.fn() }}
    >
      {children}
    </FreighterContext.Provider>
  );
}

jest.mock("./freighter-context", () => ({
  ...jest.requireActual("./freighter-context"),
  useFreighter: () => {
    const ctx = React.useContext(FreighterContext);
    if (!ctx) throw new Error("No mock FreighterContext provided");
    return ctx;
  },
  FreighterProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Component imports (must come after all jest.mock calls) ──────────────────

import CaseRegistry     from "./CaseRegistry";
import FieldCaptureForm from "./FieldCaptureForm";
import VerificationDesk from "./VerificationDesk";
import CourtIntake      from "./CourtIntake";

// ─── Shared constants ─────────────────────────────────────────────────────────

const WALLET = "GDMLTCWQDICO6VG6CRC7TFM5WKMHH57HCBTZSVIDHA4CXNNVWUKTX2OJ";

// ─── Shared transaction helpers ───────────────────────────────────────────────

function setupTxSuccess() {
  const { rpc, TransactionBuilder } = require("@stellar/stellar-sdk");
  (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);
  (rpc.assembleTransaction as jest.Mock).mockReturnValue({
    build: jest.fn().mockReturnValue({ toXDR: () => "prepared-xdr" }),
  });
  (TransactionBuilder.fromXDR as jest.Mock) = jest.fn().mockReturnValue({});

  (server.getAccount as jest.Mock).mockResolvedValue({});
  (server.sendTransaction as jest.Mock).mockResolvedValue({
    status: "PENDING",
    hash: "txhash123",
  });
  (server.getTransaction as jest.Mock).mockResolvedValue({ status: "SUCCESS" });
  (FreighterAPI.signTransaction as jest.Mock).mockResolvedValue({
    signedTxXdr: "signed-xdr",
    error: null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 1 — CaseRegistry
// ─────────────────────────────────────────────────────────────────────────────

describe("CaseRegistry", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // scValToNative: call 1 → list of IDs, subsequent calls → shipment with status
    const { scValToNative } = require("@stellar/stellar-sdk");
    let callCount = 0;
    (scValToNative as jest.Mock).mockImplementation((_val: any) => {
      callCount++;
      if (callCount === 1) return ["CASE-001", "CASE-002"];
      return { status: ["Compliant"] };
    });

    (server.simulateTransaction as jest.Mock).mockResolvedValue({
      result: { retval: {} },
    });
  });

  test("renders case rows returned by the contract", async () => {
    render(
      <MockFreighterProvider>
        <CaseRegistry onSelect={jest.fn()} selectedId={null} />
      </MockFreighterProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("CASE-001")).toBeInTheDocument();
      expect(screen.getByText("CASE-002")).toBeInTheDocument();
    });
  });

  test("calls onSelect with the correct case ID when a row is clicked", async () => {
    const onSelect = jest.fn();

    render(
      <MockFreighterProvider>
        <CaseRegistry onSelect={onSelect} selectedId={null} />
      </MockFreighterProvider>
    );

    await waitFor(() => screen.getByText("CASE-001"));
    fireEvent.click(screen.getByText("CASE-001"));

    expect(onSelect).toHaveBeenCalledWith("CASE-001");
  });

  test("shows error banner when simulateTransaction rejects", async () => {
    (server.simulateTransaction as jest.Mock).mockRejectedValue(
      new Error("Network timeout")
    );

    render(
      <MockFreighterProvider>
        <CaseRegistry onSelect={jest.fn()} selectedId={null} />
      </MockFreighterProvider>
    );

    await waitFor(() =>
      expect(screen.getByText(/Network timeout/i)).toBeInTheDocument()
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 2 — FieldCaptureForm
// ─────────────────────────────────────────────────────────────────────────────

describe("FieldCaptureForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupTxSuccess();
    (server.simulateTransaction as jest.Mock).mockResolvedValue({ result: {} });
  });

  test("submit button is disabled when wallet is not connected", () => {
    render(
      <MockFreighterProvider publicKey={null}>
        <FieldCaptureForm />
      </MockFreighterProvider>
    );

    expect(
      screen.getByRole("button", { name: /log to pipeline/i })
    ).toBeDisabled();
  });

  test("submit button is disabled when Case ID is empty even with wallet connected", () => {
    render(
      <MockFreighterProvider publicKey={WALLET}>
        <FieldCaptureForm />
      </MockFreighterProvider>
    );

    expect(
      screen.getByRole("button", { name: /log to pipeline/i })
    ).toBeDisabled();
  });

  test("shows success message after a successful on-chain submission", async () => {
    const onSubmitted = jest.fn();

    render(
      <MockFreighterProvider publicKey={WALLET}>
        <FieldCaptureForm onSubmitted={onSubmitted} />
      </MockFreighterProvider>
    );

    await userEvent.type(
      screen.getByPlaceholderText(/Case ID/i),
      "CASE-2026-0417"
    );
    fireEvent.click(screen.getByRole("button", { name: /log to pipeline/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/CASE-2026-0417 logged to the pipeline/i)
      ).toBeInTheDocument()
    );

    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  test("shows a friendly error when signing is rejected by the wallet", async () => {
    (FreighterAPI.signTransaction as jest.Mock).mockResolvedValue({
      signedTxXdr: "",
      error: { message: "User declined" },
    });

    render(
      <MockFreighterProvider publicKey={WALLET}>
        <FieldCaptureForm />
      </MockFreighterProvider>
    );

    await userEvent.type(
      screen.getByPlaceholderText(/Case ID/i),
      "CASE-2026-0417"
    );
    fireEvent.click(screen.getByRole("button", { name: /log to pipeline/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Transaction was cancelled in your wallet/i)
      ).toBeInTheDocument()
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 3 — VerificationDesk
// ─────────────────────────────────────────────────────────────────────────────

describe("VerificationDesk", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupTxSuccess();
    (server.simulateTransaction as jest.Mock).mockResolvedValue({ result: {} });
  });

  test("shows empty state prompt when no case is selected", () => {
    render(
      <MockFreighterProvider publicKey={WALLET}>
        <VerificationDesk caseId={null} />
      </MockFreighterProvider>
    );

    expect(
      screen.getByText(/Select a case to run a custody check/i)
    ).toBeInTheDocument();
  });

  test("shows the selected case ID and both action buttons", () => {
    render(
      <MockFreighterProvider publicKey={WALLET}>
        <VerificationDesk caseId="CASE-001" />
      </MockFreighterProvider>
    );

    expect(screen.getByText("CASE-001")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Run custody check/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Manually flag as broken custody/i })
    ).toBeInTheDocument();
  });

  test("displays success message and fires onResolved after custody check", async () => {
    const onResolved = jest.fn();

    render(
      <MockFreighterProvider publicKey={WALLET}>
        <VerificationDesk caseId="CASE-001" onResolved={onResolved} />
      </MockFreighterProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /Run custody check/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Custody check complete — result recorded on-chain/i)
      ).toBeInTheDocument()
    );

    expect(onResolved).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 4 — CourtIntake
// ─────────────────────────────────────────────────────────────────────────────

describe("CourtIntake", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupTxSuccess();

    const { rpc, xdr } = require("@stellar/stellar-sdk");
    (rpc.Api.isSimulationSuccess as jest.Mock).mockReturnValue(true);

    // Default: approve_shipment sim succeeds, is_compliant returns true
    (server.simulateTransaction as jest.Mock)
      .mockResolvedValueOnce({ result: {} })
      .mockResolvedValueOnce({
        result: { retval: xdr.ScVal.scvBool(true) },
      });
  });

  test("shows empty prompt when no case is selected", () => {
    render(
      <MockFreighterProvider publicKey={WALLET}>
        <CourtIntake caseId={null} />
      </MockFreighterProvider>
    );

    expect(
      screen.getByText(/Select a verified case to submit it for court intake/i)
    ).toBeInTheDocument();
  });

  test("displays Admissible and fires onResolved after successful intake", async () => {
    const onResolved = jest.fn();

    render(
      <MockFreighterProvider publicKey={WALLET}>
        <CourtIntake caseId="CASE-001" onResolved={onResolved} />
      </MockFreighterProvider>
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Submit for court intake/i })
    );

    await waitFor(() => {
      expect(screen.getByText(/Admissible/i)).toBeInTheDocument();
      expect(
        screen.getByText(/accepted into the case record/i)
      ).toBeInTheDocument();
    });

    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  test("displays Not admissible when is_compliant returns false", async () => {
    const { xdr } = require("@stellar/stellar-sdk");

    // mockReset clears the beforeEach queue so our false value lands first
    (server.simulateTransaction as jest.Mock).mockReset();
    (server.simulateTransaction as jest.Mock)
      .mockResolvedValueOnce({ result: {} })
      .mockResolvedValueOnce({
        result: { retval: xdr.ScVal.scvBool(false) },
      });

    render(
      <MockFreighterProvider publicKey={WALLET}>
        <CourtIntake caseId="CASE-002" />
      </MockFreighterProvider>
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Submit for court intake/i })
    );

    await waitFor(() => {
      expect(screen.getByText(/Not admissible/i)).toBeInTheDocument();
      expect(
        screen.getByText(/custody chain incomplete/i)
      ).toBeInTheDocument();
    });
  });

  test("shows Retry submission button when transaction fails on-chain", async () => {
    (server.getTransaction as jest.Mock).mockResolvedValue({ status: "FAILED" });

    render(
      <MockFreighterProvider publicKey={WALLET}>
        <CourtIntake caseId="CASE-003" />
      </MockFreighterProvider>
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Submit for court intake/i })
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Retry submission/i })
      ).toBeInTheDocument()
    );
  });
});