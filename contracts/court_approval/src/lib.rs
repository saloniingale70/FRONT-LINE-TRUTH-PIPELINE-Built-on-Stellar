#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, Symbol,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ComplianceStatus {
    Pending,
    Compliant,
    Rejected,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ShipmentRecord {
    pub id: Symbol,
    pub gst_hash: soroban_sdk::Bytes,
    pub customs_hash: soroban_sdk::Bytes,
    pub sustainability_hash: soroban_sdk::Bytes,
    pub submitter: Address,
    pub status: ComplianceStatus,
}

#[contracttype]
pub enum DataKey {
    Approved(Symbol),
    Exporter,
}

#[contract]
pub struct ShipmentApproval;

#[contractimpl]
impl ShipmentApproval {
    pub fn approve_shipment(
        env: Env,
        registry: Address,
        case_id: Symbol,
        exporter: Address,
    ) {
        let record: Option<ShipmentRecord> = env.invoke_contract(
            &registry,
            &Symbol::new(&env, "get_shipment"),
            soroban_sdk::vec![&env, case_id.to_val()],
        );

        let record = match record {
            Some(r) => r,
            None => panic!("Case not found in registry"),
        };

        match record.status {
            ComplianceStatus::Compliant => {}
            ComplianceStatus::Pending => {
                panic!("Case is still PENDING — run custody check first");
            }
            ComplianceStatus::Rejected => {
                panic!("Case is REJECTED — custody chain is broken");
            }
        }

        env.storage()
            .persistent()
            .set(&DataKey::Approved(case_id.clone()), &true);

        env.storage()
            .persistent()
            .set(&DataKey::Exporter, &exporter);

        env.events().publish(
            (symbol_short!("approved"), case_id.clone()),
            exporter,
        );
    }

    pub fn is_approved(env: Env, case_id: Symbol) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Approved(case_id))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Bytes, Env, Symbol};
    use compliance_registry::{ComplianceRegistry, ComplianceRegistryClient};

    fn make_hash(env: &Env, s: &str) -> Bytes {
        let mut buf = [0u8; 32];
        let b = s.as_bytes();
        buf[..b.len().min(32)].copy_from_slice(&b[..b.len().min(32)]);
        Bytes::from_slice(env, &buf)
    }

    // Test 1 — default storage returns false, no panic
    #[test]
    fn test_is_approved_default_false() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ShipmentApproval);
        let client = ShipmentApprovalClient::new(&env, &contract_id);

        let id = Symbol::new(&env, "CASE001");
        assert!(!client.is_approved(&id));
    }

    // Test 2 — compliant shipment gets approved successfully
    #[test]
    fn test_approve_compliant_shipment() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract(None, ComplianceRegistry);
        let registry = ComplianceRegistryClient::new(&env, &registry_id);

        let id = Symbol::new(&env, "CASE002");
        let h = make_hash(&env, "valid_proof");

        registry.submit_shipment(&id, &h, &h, &h);
        registry.verify_compliance(&id);
        assert!(registry.is_compliant(&id));

        let approval_id = env.register_contract(None, ShipmentApproval);
        let approval = ShipmentApprovalClient::new(&env, &approval_id);

        let exporter = Address::generate(&env);
        approval.approve_shipment(&registry_id, &id, &exporter);
        assert!(approval.is_approved(&id));
    }

    // Test 3 — pending shipment (verify never called) must panic
    #[test]
    #[should_panic(expected = "Case is still PENDING")]
    fn test_pending_shipment_blocked() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract(None, ComplianceRegistry);
        let registry = ComplianceRegistryClient::new(&env, &registry_id);

        let id = Symbol::new(&env, "CASE003");
        let h = make_hash(&env, "proof");

        registry.submit_shipment(&id, &h, &h, &h); // no verify_compliance

        let approval_id = env.register_contract(None, ShipmentApproval);
        let approval = ShipmentApprovalClient::new(&env, &approval_id);

        approval.approve_shipment(&registry_id, &id, &Address::generate(&env));
    }

    // Test 4 — rejected shipment (missing hash) must panic
    #[test]
    #[should_panic(expected = "Case is REJECTED")]
    fn test_rejected_shipment_blocked() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract(None, ComplianceRegistry);
        let registry = ComplianceRegistryClient::new(&env, &registry_id);

        let id = Symbol::new(&env, "CASE004");
        let h = make_hash(&env, "proof");
        let z = Bytes::from_slice(&env, &[0u8; 32]);

        registry.submit_shipment(&id, &h, &z, &h); // customs_hash zero = missing
        registry.verify_compliance(&id);
        assert!(!registry.is_compliant(&id));

        let approval_id = env.register_contract(None, ShipmentApproval);
        let approval = ShipmentApprovalClient::new(&env, &approval_id);

        approval.approve_shipment(&registry_id, &id, &Address::generate(&env));
    }
}