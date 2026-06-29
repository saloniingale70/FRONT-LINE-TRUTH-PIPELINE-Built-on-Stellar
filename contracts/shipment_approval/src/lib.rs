
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
        
        let record: Option<ShipmentRecord> = env
            .invoke_contract(
                &registry,
                &Symbol::new(&env, "get_shipment"),
                soroban_sdk::vec![&env, case_id.to_val()],
            );

        let record = match record {
            Some(r) => r,
            None => panic!("Case not found in registry"),
        };

       
        match record.status {
            ComplianceStatus::Compliant => {
                
            }
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
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_is_approved_default_false() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ShipmentApproval);
        let client = ShipmentApprovalClient::new(&env, &contract_id);

        let id = Symbol::new(&env, "CASE001");
        assert!(!client.is_approved(&id));
    }
}