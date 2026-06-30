# Frontline Truth Pipeline

> A Soroban (Stellar smart contract) dApp for logging, verifying, and certifying the chain-of-custody of field evidence — from capture, through compliance verification, to court-admissible intake — fully on-chain.

**Built on Stellar** · Next.js 14 (App Router) · Soroban Rust Contracts · Freighter Wallet

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Smart Contracts](#smart-contracts)
4. [Inter-Contract Communication](#inter-contract-communication)
5. [Event Streaming & Real-Time Updates](#event-streaming--real-time-updates)
6. [Frontend](#frontend)
7. [Error Handling & Loading States](#error-handling--loading-states)
8. [CI/CD Pipeline](#cicd-pipeline)
9. [Deployment Workflow](#deployment-workflow)
10. [Testing](#testing)
11. [Getting Started Locally](#getting-started-locally)
12. [Deployed Addresses & Demo](#deployed-addresses--demo)
13. [Project Structure](#project-structure)
14. [Submission Checklist](#submission-checklist)

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

> See [Submission Checklist](#submission-checklist) for where to attach your test-output screenshot.

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

## Deployed Addresses & Demo

| Item | Value |
|---|---|
| Network | Stellar Testnet |
| `ComplianceRegistry` contract | `CCGIHIUQAZ5XVTKM6MHXJ3KHLIHVHRWLEX2APNEXUMSDBXX6SICXWVN5` |
| `ShipmentApproval` contract | `CBXMV77KVTSHHPRCTEWNEN44TTUER3DF5JQSBWF62SPQMDKTNLPFJJ73` |
| Live demo | `<add your Netlify/Vercel URL>` |
| Sample transaction hash | `<add a real on-chain tx hash from a contract interaction>` |
| Demo video (1–2 min) | `<add link>` |

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
- [ ] Live demo link (Vercel/Netlify) — add above
- [x] Contract deployment addresses — listed above
- [ ] Transaction hash for a real contract interaction — add above
- [ ] Screenshot: mobile responsive UI
- [ ] Screenshot: CI/CD pipeline running (GitHub Actions tab)
- [ ] Screenshot: test output with 3+ passing tests (`cargo test` and/or `npx jest`)
- [ ] Demo video link (1–2 minutes)
