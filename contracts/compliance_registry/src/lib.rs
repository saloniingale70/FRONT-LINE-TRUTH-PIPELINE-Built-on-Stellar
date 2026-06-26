#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, vec, BytesN, Env, Symbol, Vec};

#[derive(Clone)]
#[contracttype]
pub enum Status {
    Pending,
    Compliant,
    Rejected,
}

#[derive(Clone)]
#[contracttype]
pub struct Shipment {
    pub status: Status,
    pub gst_hash: BytesN<32>,
    pub customs_hash: BytesN<32>,
    pub sustainability_hash: BytesN<32>,
}

const SHIPMENT_IDS: Symbol = Symbol::short("ship_ids");
const ZERO_HASH: [u8; 32] = [0u8; 32];

#[contract]
pub struct ComplianceRegistry;

#[contractimpl]
impl ComplianceRegistry {
    /// Exporter submits a new shipment with its document hashes. Starts Pending.
    pub fn submit_shipment(
        env: Env,
        shipment_id: Symbol,
        gst_hash: BytesN<32>,
        customs_hash: BytesN<32>,
        sustainability_hash: BytesN<32>,
    ) {
        let shipment = Shipment {
            status: Status::Pending,
            gst_hash,
            customs_hash,
            sustainability_hash,
        };
        env.storage().persistent().set(&shipment_id, &shipment);

        Self::add_to_index(&env, &shipment_id);

        env.events()
            .publish((Symbol::new(&env, "shipment_submitted"),), shipment_id);
    }

    /// Verifies the stored document hashes are all present (non-zero) and
    /// marks the shipment Compliant if so, Rejected otherwise.
    pub fn verify_compliance(env: Env, shipment_id: Symbol) -> bool {
        let mut shipment: Shipment = match env.storage().persistent().get(&shipment_id) {
            Some(s) => s,
            None => return false,
        };

        let zero = BytesN::from_array(&env, &ZERO_HASH);
        let all_present = shipment.gst_hash != zero
            && shipment.customs_hash != zero
            && shipment.sustainability_hash != zero;

        shipment.status = if all_present {
            Status::Compliant
        } else {
            Status::Rejected
        };

        env.storage().persistent().set(&shipment_id, &shipment);

        let event_name = if all_present { "verified_compliant" } else { "verified_rejected" };
        env.events().publish(
            (Symbol::new(&env, event_name),),
            shipment_id,
        );

        all_present
    }

    /// Explicit manual rejection (e.g. buyer or verifier rejects regardless of hashes).
    pub fn reject_shipment(env: Env, shipment_id: Symbol) {
        if let Some(mut shipment) = env.storage().persistent().get::<Symbol, Shipment>(&shipment_id) {
            shipment.status = Status::Rejected;
            env.storage().persistent().set(&shipment_id, &shipment);
        }

        env.events()
            .publish((Symbol::new(&env, "shipment_rejected"),), shipment_id);
    }

    /// Legacy helper: force-mark compliant without hash checks (kept for compatibility).
    pub fn register(env: Env, shipment_id: Symbol) {
        let zero = BytesN::from_array(&env, &ZERO_HASH);
        let shipment = Shipment {
            status: Status::Compliant,
            gst_hash: zero.clone(),
            customs_hash: zero.clone(),
            sustainability_hash: zero,
        };
        env.storage().persistent().set(&shipment_id, &shipment);
        Self::add_to_index(&env, &shipment_id);

        env.events().publish(
            (Symbol::new(&env, "compliance_registry"), shipment_id.clone()),
            Symbol::new(&env, "registered"),
        );
    }

    /// Used by shipment_approval's cross-contract call. True only if Compliant.
    pub fn is_compliant(env: Env, shipment_id: Symbol) -> bool {
        match env.storage().persistent().get::<Symbol, Shipment>(&shipment_id) {
            Some(s) => matches!(s.status, Status::Compliant),
            None => false,
        }
    }

    /// Returns the full shipment record for display purposes.
    pub fn get_shipment(env: Env, shipment_id: Symbol) -> Option<Shipment> {
        env.storage().persistent().get(&shipment_id)
    }

    /// Returns every shipment ID ever submitted or registered.
    pub fn list_shipments(env: Env) -> Vec<Symbol> {
        env.storage()
            .persistent()
            .get(&SHIPMENT_IDS)
            .unwrap_or(vec![&env])
    }

    fn add_to_index(env: &Env, shipment_id: &Symbol) {
        let mut ids: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&SHIPMENT_IDS)
            .unwrap_or(vec![env]);

        if !ids.contains(shipment_id) {
            ids.push_back(shipment_id.clone());
            env.storage().persistent().set(&SHIPMENT_IDS, &ids);
        }
    }
}