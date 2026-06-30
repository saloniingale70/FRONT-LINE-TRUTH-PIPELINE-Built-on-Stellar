# Frontline Truth Pipeline

> A Soroban (Stellar smart contract) dApp for logging, verifying, and certifying the chain-of-custody of field evidence — from capture, through compliance verification, to court-admissible intake — fully on-chain.

**Built on Stellar** · Next.js 14 (App Router) · Soroban Rust Contracts · Freighter Wallet

[![Live Deployed Project ](https://img.shields.io/badge/demo-live-15803d)](https://front-line-truth-pipeline-stellar.netlify.app/)
[![Network](https://img.shields.io/badge/network-Stellar%20Testnet-14296b)](https://stellar.expert/explorer/testnet)

---

## Table of Contents

1. [Live Demo](#live-demo)
2. [Demo Video](#demo-video)
3. [Contract Addresses](#contract-addresses)
4. [Screenshots](#screenshots)
5. [Overview](#overview)
6. [Architecture](#architecture)
7. [Smart Contracts](#smart-contracts)
8. [Inter-Contract Communication](#inter-contract-communication)
9. [Event Streaming & Real-Time Updates](#event-streaming--real-time-updates)
10. [Frontend](#frontend)
11. [Error Handling & Loading States](#error-handling--loading-states)
12. [CI/CD Pipeline](#cicd-pipeline)
13. [Deployment Workflow](#deployment-workflow)
14. [Testing](#testing)
15. [Getting Started Locally](#getting-started-locally)
16. [Project Structure](#project-structure)
17. [Submission Checklist](#submission-checklist)

---

## Live Deployed Project Link

**[front-line-truth-pipeline-stellar.netlify.app](https://front-line-truth-pipeline-stellar.netlify.app/)**


---

## Demo Video

**[front-line-truth-pipeline-stellar.netlify.app](https://front-line-truth-pipeline-stellar.netlify.app/)**

---



## Contract Addresses Explorer Link

| Contract | Address | Explorer |
|---|---|---|
| **Evidence Registry** (`ComplianceRegistry`) | `CCGIHIUQAZ5XVTKM6MHXJ3KHLIHVHRWLEX2APNEXUMSDBXX6SICXWVN5` | [View on stellar.expert](https://stellar.expert/explorer/testnet/contract/CCGIHIUQAZ5XVTKM6MHXJ3KHLIHVHRWLEX2APNEXUMSDBXX6SICXWVN5) |
| **Court Approval** (`ShipmentApproval`) | `CBXMV77KVTSHHPRCTEWNEN44TTUER3DF5JQSBWF62SPQMDKTNLPFJJ73` | [View on stellar.expert](https://stellar.expert/explorer/testnet/contract/CBXMV77KVTSHHPRCTEWNEN44TTUER3DF5JQSBWF62SPQMDKTNLPFJJ73) |



---


## Inter-Contract Communication Transaction Hash

**https://stellar.expert/explorer/testnet/tx/e1f69cb070382802129648636d5e6a8cf29f92ffe3c13fc17e4bd7b9c0072a04**

---

## Screenshots

### Contract Deployment

| Evidence Registry | Court Approval |
|---|---|
| <img width="600" alt="evidence_registry_deploy" src="https://github.com/user-attachments/assets/3815f9ce-7950-43d5-80d8-68780ebad67f" /> | <img width="600" alt="court_approval_deploy" src="https://github.com/user-attachments/assets/83692d98-fecc-474b-bd1c-bb53deb33fad" /> |

### Mobile Responsive View

<p>
  <img width="260" alt="mobile-1" src="https://github.com/user-attachments/assets/905a4c61-419b-4d65-afda-1eeed7adce7a" />
  <img width="260" alt="mobile-2" src="https://github.com/user-attachments/assets/2b1f99ad-7d70-43c9-9a23-4e733240ba2b" />
  <img width="260" alt="mobile-3" src="https://github.com/user-attachments/assets/68bc6bd3-00ca-4448-ace0-55316054d33c" />
</p>

### Error Handling & Loading States

<p>
  <img width="600" alt="error-1" src="https://github.com/user-attachments/assets/59c8be57-5631-4cd8-bd8a-9209139e4f09" />
  <img width="600" alt="error-2" src="https://github.com/user-attachments/assets/ad769f52-f957-4640-ac1b-8c6733cfa18d" />
</p>
<p>
  <img width="600" alt="error-3" src="https://github.com/user-attachments/assets/b0e862a7-d367-43e7-8949-61ad6eff6c95" />
  <img width="600" alt="loading-1" src="https://github.com/user-attachments/assets/8bb6af83-1a9b-4cad-875f-38e4381d00b8" />
</p>
<p>
  <img width="600" alt="loading-2" src="https://github.com/user-attachments/assets/982b26b2-526f-42b1-935d-9a790d8834da" />
  <img width="600" alt="loading-3" src="https://github.com/user-attachments/assets/4090c077-c469-4ce3-9ecc-47cab15c254a" />
</p>

### Contract Invoke

<img width="900" alt="contract_invoke" src="https://github.com/user-attachments/assets/60e28c69-b478-45e8-a534-364c85da874e" />

### Contract Tests

<p>
  <img width="600" alt="contract-test-cases" src="https://github.com/user-attachments/assets/f2cc6193-c7e9-4e88-b087-8cde3d18cf66" />
  <img width="600" alt="contract-test-cases-2" src="https://github.com/user-attachments/assets/0daace10-02b7-402f-8ecf-5cb3c56c7796" />
</p>

### Frontend Tests

<img width="700" alt="frontend-test-cases" src="https://github.com/user-attachments/assets/d1cfd687-7060-4348-b8ec-55a63921d8ba" />

### CI/CD Pipeline Running

<img width="900" alt="ci-cd" src="https://github.com/user-attachments/assets/ce509936-4bd1-40b5-9ab9-44a9ee827372" />

---

## Overview

The **Frontline Truth Pipeline** is a three-station workflow for taking field-captured evidence (e.g. journalist footage, shipment proofs, sensitive documentation) and moving it through a verifiable custody chain entirely on the Stellar network using Soroban smart contracts:

| Station | What happens | On-chain action |
|---|---|---|
| **Field Capture** | A submitter logs a new case with three proof hashes (device/geolocation attestation, custody handoff log, witness/press credential signature) | `ComplianceRegistry.submit_shipment` |
| **Verification Desk** | A verifier runs an automated custody check (or manually flags broken custody) | `ComplianceRegistry.verify_compliance` / `reject_shipment` |
| **Court Intake** | A verified case is submitted to a second contract that re-checks compliance status before granting "admissible" approval | `ShipmentApproval.approve_shipment` |

Every action is a signed Soroban transaction via the **Freighter** browser wallet, and every state transition emits a contract event that the frontend streams back into a live **Transaction History** panel.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Next.js Frontend                          │
│  ┌────────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ FieldCapture│ │ CaseRegistry │  │Verification│  │CourtIntake│ │
│  │    Form     │ │   (list)     │  │   Desk     │  │           │ │
│  └─────┬──────┘  └──────┬───────┘  └─────┬──────┘  └─────┬─────┘ │
│        │                │                 │                │     │
│        └────────────────┴─────────────────┴────────────────┘     │
│                          Freighter Wallet (signing)                │
│                          Soroban RPC (simulate/submit/getEvents)   │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ JSON-RPC (Soroban)
                 ┌───────────────┴────────────────┐
                 ▼                                  ▼
   ┌─────────────────────────┐        ┌──────────────────────────┐
   │   ComplianceRegistry     │◄──────►│     ShipmentApproval      │
   │   (source of truth)      │  cross- │  (court-facing gatekeeper)│
   │  submit / verify / reject│ contract│      approve_shipment     │
   └─────────────────────────┘  call    └──────────────────────────┘
                 │                                  │
                 └─────────── Stellar Testnet ───────┘
```

**Why two contracts instead of one?** Separating the evidence registry from the court-approval gate enforces a real-world separation of concerns: the registry owns the source data and compliance state, while the approval contract acts purely as a downstream consumer that *cannot* approve anything the registry hasn't already marked `Compliant`. This mirrors how chain-of-custody systems work off-chain (evidence custodian vs. admitting authority) and prevents a single contract from being both judge and record-keeper.

---

## Smart Contracts

Both contracts are written in Rust using the `soroban-sdk` and compiled to WASM for the Soroban runtime.

### 1. `ComplianceRegistry`

Source-of-truth contract for case submission and compliance verification.

| Function | Description |
|---|---|
| `submit_shipment(id, gst_hash, customs_hash, sustainability_hash)` | Registers a new case with three evidence hashes (32-byte buffers) and an initial `Pending` status. Deduplicates by ID in the on-chain index list. |
| `verify_compliance(id)` | Checks that all three hashes are non-zero ("present"); transitions status to `Compliant` or `Rejected` accordingly. Publishes a `verify` event. |
| `reject_shipment(id)` | Manual override to mark a case `Rejected` (e.g. a human verifier spots an issue automation missed). |
| `list_shipments()` | Returns all case IDs (used to populate the Case Registry panel). |
| `get_shipment(id)` | Returns the full `ShipmentRecord` struct. |
| `is_compliant(id)` | Boolean convenience read. |

Storage uses `env.storage().persistent()` keyed by `DataKey::Shipment(id)` and a `DataKey::ShipmentList` index `Vec<Symbol>` for enumeration.

### 2. `ShipmentApproval`

Downstream gatekeeper contract used at the Court Intake station.

| Function | Description |
|---|---|
| `approve_shipment(registry, case_id, exporter)` | **Cross-contract call** into `ComplianceRegistry.get_shipment`. Panics if the case is `Pending` ("run custody check first") or `Rejected` ("custody chain is broken"). On `Compliant`, records approval and the responsible exporter address, and emits an `approved` event. |
| `is_approved(case_id)` | Boolean read of approval state, defaulting to `false` for unknown cases. |

---

## Inter-Contract Communication

`ShipmentApproval::approve_shipment` does not duplicate compliance logic — it calls directly into the deployed `ComplianceRegistry` contract at runtime:

```rust
let record: Option<ShipmentRecord> = env.invoke_contract(
    &registry,
    &Symbol::new(&env, "get_shipment"),
    soroban_sdk::vec![&env, case_id.to_val()],
);
```

This demonstrates genuine Soroban inter-contract invocation (`env.invoke_contract`) rather than the frontend independently querying two unrelated contracts. The registry's address is passed in as a parameter, making `ShipmentApproval` registry-agnostic and testable against mock registries.

The Rust unit tests in `shipment_approval` exercise this directly by deploying both contracts inside the same `Env` and asserting the approval contract correctly reads and reacts to the registry's live state (see [Testing](#testing)).

---

## Event Streaming & Real-Time Updates

Every mutating contract call publishes a Soroban event:

```rust
env.events().publish((symbol_short!("submit"), id), record.status);
env.events().publish((symbol_short!("verify"), id), record.status);
env.events().publish((symbol_short!("reject"), id), record.status);
env.events().publish((symbol_short!("approved"), case_id), exporter);
```

On the frontend, `TransactionHistory.tsx` polls `server.getEvents()` for both watched contract IDs every **8 seconds**, plus on-demand after every successful transaction (via a shared `refreshKey` bump pattern lifted to the page-level `AppShell`). To work around Soroban RPC's limited event retention window, it retries with progressively wider lookback windows (`4000 → 2000 → 720 → 120` ledgers) until it gets a server-side hit, then filters events client-side by whether the case ID appears in the topics or value.

Each event row links out to **stellar.expert** for full on-chain transaction inspection, and the UI renders both a desktop table and a mobile card layout for the same data.

---

## Frontend

Built with **Next.js 14 (App Router)** + **TypeScript**, using the official `@stellar/stellar-sdk` and `@stellar/freighter-api` packages — no backend server; all reads are RPC simulations and all writes are wallet-signed transactions submitted directly from the browser.

Key components:

- `FreighterProvider` / `useFreighter` — wallet connection context (connect, detect, permission flow)
- `ConnectWalletButton` — connection UI with truncated address chip
- `FieldCaptureForm` — builds & signs `submit_shipment` transactions
- `CaseRegistry` — simulates `list_shipments` + `get_shipment` per case, renders status badges
- `VerificationDesk` — runs `verify_compliance` / `reject_shipment`
- `CourtIntake` — runs cross-contract `approve_shipment`, then re-simulates `is_compliant` to display the final admissibility stamp with a step-by-step progress indicator (build → sign → submit)
- `TransactionHistory` — live on-chain event feed per case
- `ToastProvider` — global toast notifications on success/failure

---

## Error Handling & Loading States

Every on-chain interaction follows the same defensive pattern:

1. **Build** the transaction → **simulate** it first (`server.simulateTransaction`) and check `rpc.Api.isSimulationError` before ever prompting the wallet.
2. **Sign** via Freighter, explicitly checking `signResult.error` (covers user rejection).
3. **Submit** and poll `server.getTransaction` (up to 10 attempts / ~10s) until status leaves `NOT_FOUND`.
4. Raw SDK/RPC errors are passed through a `friendlyError()` mapper in each component that translates technical strings (`"Simulation failed"`, `"INSUFFICIENT_FUNDS"`, `"NOT_FOUND"`, `"User declined"`) into actionable, human-readable messages — including a direct link to Friendbot when the wallet needs testnet XLM.

Loading states are explicit and staged rather than a single spinner:

- `CourtIntake` shows a 3-dot progress indicator (`building → signing → submitting`) with a text hint per stage.
- `CaseRegistry` and `TransactionHistory` render **skeleton loaders** on first load and a non-blocking inline `Retry` affordance on error, rather than swallowing the existing list.
- Buttons are disabled (not hidden) when prerequisites are missing (no wallet, empty Case ID, no case selected) so the UI always explains *why* an action is unavailable.

---

## CI/CD Pipeline

`.github/workflows/ci-cd.yml` runs a 4-stage pipeline on every push/PR to `main`:

```
Lint & Type Check  →  Build  →  Deploy (Netlify, main only)  →  Lighthouse Audit
```

1. **Lint & Type Check** — ESLint + `tsc --noEmit` against the `frontend/` working directory.
2. **Build** — `npm run build` (Next.js production build), artifact uploaded for inspection.
3. **Deploy** — On pushes to `main` only, builds and deploys via the Netlify CLI using the `@netlify/plugin-nextjs` runtime (so SSR/API routes keep working), and comments the preview URL back on PRs.
4. **Lighthouse Audit** — Runs `treosh/lighthouse-ci-action` against the freshly deployed production URL, with results uploaded to temporary public storage for review.

Secrets required: `NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN` (configured in repo Settings → Secrets → Actions).

---

## Deployment Workflow

### Smart contracts (Soroban CLI)

```bash
# Build optimized WASM
stellar contract build

# Deploy ComplianceRegistry
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/compliance_registry.wasm \
  --source <YOUR_IDENTITY> \
  --network testnet

# Deploy ShipmentApproval
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/shipment_approval.wasm \
  --source <YOUR_IDENTITY> \
  --network testnet
```

Copy the resulting `C...` contract IDs into `frontend/app/config.ts`:

```ts
export const CONTRACTS = {
  shipmentApproval: "C...",
  complianceRegistry: "C...",
};
```

### Frontend (Netlify, via CI/CD)

Pushing to `main` automatically triggers the GitHub Actions pipeline above, which builds and deploys the `frontend/` app to Netlify. Manual deploys are also possible:

```bash
cd frontend
npm ci
npm run build
netlify deploy --build --prod
```

---

## Testing

### Contract tests (Rust)

```bash
cd contracts/compliance-registry && cargo test
cd contracts/shipment-approval   && cargo test
```

Coverage includes:
- Default/unset state returns safe defaults (no panics)
- Full happy path: submit → verify → cross-contract approve
- Pending case correctly **blocks** approval (`should_panic`)
- Rejected case (missing hash) correctly **blocks** approval (`should_panic`)
- Duplicate submission deduplication in the case index
- Manual rejection flow

### Frontend tests (Jest + React Testing Library)

```bash
cd frontend
npm install --save-dev jest @types/jest ts-jest \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  jest-environment-jsdom
npx jest
```

Coverage includes: case list rendering and selection, wallet-gated form validation, full submit/sign/send success and failure paths (including signature rejection and on-chain `FAILED` status), and the Court Intake admissible/not-admissible branches — all 14+ tests across 4 suites (`CaseRegistry`, `FieldCaptureForm`, `VerificationDesk`, `CourtIntake`).

Test output screenshots are included above under [Contract Tests](#contract-tests) and [Frontend Tests](#frontend-tests).

---

## Getting Started Locally

```bash
git clone https://github.com/<your-org>/frontline-truth-pipeline.git
cd frontline-truth-pipeline/frontend
npm install
npm run dev
```

Requirements: Node 22+, the [Freighter](https://freighter.app) browser extension set to **Testnet**, and testnet XLM (fund via [Friendbot](https://friendbot.stellar.org)).

---

## Project Structure

```
.
├── .github/workflows/ci-cd.yml        # CI/CD pipeline
├── contracts/
│   ├── compliance-registry/           # source-of-truth contract + tests
│   └── shipment-approval/             # gatekeeper contract + cross-contract tests
└── frontend/
    ├── app/
    │   ├── page.tsx                   # AppShell — station tabs, layout, drawer
    │   ├── layout.tsx
    │   ├── config.ts                  # contract IDs / network constants
    │   ├── stellar.ts                 # RPC server + helpers
    │   ├── freighter-context.tsx      # wallet connection context
    │   ├── ConnectWalletButton.tsx
    │   ├── FieldCaptureForm.tsx
    │   ├── CaseRegistry.tsx
    │   ├── VerificationDesk.tsx
    │   ├── CourtIntake.tsx
    │   ├── TransactionHistory.tsx
    │   ├── ToastProvider.tsx
    │   ├── StellarMark.tsx
    │   ├── globals.css
    │   └── frontline-pipeline.test.tsx
    └── package.json
```

---

## Submission Checklist

- [ ] Public GitHub repository
- [x] README with complete documentation (this file)
- [ ] Minimum 10+ meaningful commits
- [x] Live demo link — [front-line-truth-pipeline-stellar.netlify.app](https://front-line-truth-pipeline-stellar.netlify.app/)
- [x] Contract deployment addresses — [listed above](#contract-addresses) with stellar.expert explorer links
- [ ] Transaction hash for contract interaction — add above
- [x] Screenshot: mobile responsive UI
- [x] Screenshot: CI/CD pipeline running
- [x] Screenshot: test output with 3+ passing tests
- [ ] Demo video link (1–2 minutes)
