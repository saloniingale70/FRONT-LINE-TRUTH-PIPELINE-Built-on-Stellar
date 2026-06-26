#![no_std]

use soroban_sdk::{contract, contractimpl, contractclient, Env, Address, Symbol};

#[contractclient(name = "ComplianceRegistryClient")]
pub trait ComplianceRegistryInterface {
    fn is_compliant(env: Env, shipment_id: Symbol) -> bool;
}

#[contract]
pub struct ShipmentApproval;

#[contractimpl]
impl ShipmentApproval {
    pub fn approve_shipment(
        env: Env,
        registry: Address,
        shipment_id: Symbol,
        exporter: Address,
    ) -> bool {
        let registry_client = ComplianceRegistryClient::new(&env, &registry);
        let all_verified = registry_client.is_compliant(&shipment_id);

        if all_verified {
            env.events().publish(
                (Symbol::new(&env, "shipment_approved"), exporter.clone()),
                shipment_id.clone(),
            );
            true
        } else {
            env.events().publish(
                (Symbol::new(&env, "shipment_rejected"), exporter.clone()),
                shipment_id.clone(),
            );
            false
        }
    }
}