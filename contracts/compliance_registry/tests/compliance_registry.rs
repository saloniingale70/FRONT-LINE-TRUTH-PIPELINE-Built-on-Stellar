use soroban_sdk::{Env, Symbol};
use compliance_registry::ComplianceRegistry;

#[test]
fn test_register_and_check() {
    let env = Env::default();
    let shipment_id = Symbol::new(&env, "SHIP123");

    // Register shipment
    ComplianceRegistry::register(env.clone(), shipment_id.clone());

    // Verify compliance
    let compliant = ComplianceRegistry::is_compliant(env.clone(), shipment_id.clone());
    assert!(compliant);
}
