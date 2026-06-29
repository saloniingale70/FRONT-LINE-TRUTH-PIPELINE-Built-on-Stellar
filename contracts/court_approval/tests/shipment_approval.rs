use soroban_sdk::{Env, Symbol, Address};
use soroban_sdk::testutils::Address as _;

use shipment_approval::{ShipmentApproval, ShipmentApprovalClient};
use compliance_registry::{ComplianceRegistry, ComplianceRegistryClient};

#[test]
fn test_shipment_approval_compliant() {
    let env = Env::default();

    let exporter = Address::generate(&env);
    let shipment_id = Symbol::new(&env, "SHIP123");

    // Deploy ComplianceRegistry and register the shipment as compliant
    let registry_id = env.register(ComplianceRegistry {}, ());
    let registry_client = ComplianceRegistryClient::new(&env, &registry_id);
    registry_client.register(&shipment_id);

    // Deploy ShipmentApproval
    let approval_id = env.register(ShipmentApproval {}, ());
    let approval_client = ShipmentApprovalClient::new(&env, &approval_id);

    let result = approval_client.approve_shipment(&registry_id, &shipment_id, &exporter);
    assert!(result);
}

#[test]
fn test_shipment_approval_not_compliant() {
    let env = Env::default();

    let exporter = Address::generate(&env);
    let shipment_id = Symbol::new(&env, "SHIP999"); // never registered

    let registry_id = env.register(ComplianceRegistry {}, ());

    let approval_id = env.register(ShipmentApproval {}, ());
    let approval_client = ShipmentApprovalClient::new(&env, &approval_id);

    let result = approval_client.approve_shipment(&registry_id, &shipment_id, &exporter);
    assert!(!result);
}