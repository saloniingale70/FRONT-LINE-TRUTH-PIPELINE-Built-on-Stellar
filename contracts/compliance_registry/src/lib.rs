

#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, log, symbol_short,
    Address, Bytes, Env, Symbol, Vec,
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
    
    pub gst_hash: Bytes,
   
    pub customs_hash: Bytes,
   
    pub sustainability_hash: Bytes,
    
    pub submitter: Address,
    
    pub status: ComplianceStatus,
}
#[contracttype]
pub enum DataKey {
    Shipment(Symbol),
    ShipmentList,
}

#[contract]
pub struct ComplianceRegistry;

#[contractimpl]
impl ComplianceRegistry {

    pub fn submit_shipment(
        env: Env,
        id: Symbol,
        gst_hash: Bytes,          
        customs_hash: Bytes,      
        sustainability_hash: Bytes, 
    ) {
        
        let submitter = env.current_contract_address();
      

        let record = ShipmentRecord {
            id: id.clone(),
            gst_hash,
            customs_hash,
            sustainability_hash,
            submitter,
            status: ComplianceStatus::Pending,
        };

        
        env.storage()
            .persistent()
            .set(&DataKey::Shipment(id.clone()), &record);

        
        let mut list: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&DataKey::ShipmentList)
            .unwrap_or(Vec::new(&env));

        
        let already_exists = list.iter().any(|s| s == id);
        if !already_exists {
            list.push_back(id.clone());
            env.storage()
                .persistent()
                .set(&DataKey::ShipmentList, &list);
        }

        
        env.events().publish(
            (symbol_short!("submit"), id),
            record.status,
        );
    }

   
    pub fn list_shipments(env: Env) -> Vec<Symbol> {
        env.storage()
            .persistent()
            .get(&DataKey::ShipmentList)
            .unwrap_or(Vec::new(&env))
    }

    
    pub fn get_shipment(env: Env, id: Symbol) -> Option<ShipmentRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Shipment(id))
    }

   
    pub fn verify_compliance(env: Env, id: Symbol) {
        let mut record: ShipmentRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Shipment(id.clone()))
            .unwrap_or_else(|| panic!("Case not found: {:?}", id));

        
        let source_ok = !Self::is_zero_bytes(&record.gst_hash);
        let custody_ok = !Self::is_zero_bytes(&record.customs_hash);
        let witness_ok = !Self::is_zero_bytes(&record.sustainability_hash);

        if source_ok && custody_ok && witness_ok {
            record.status = ComplianceStatus::Compliant;
        } else {
            record.status = ComplianceStatus::Rejected;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Shipment(id.clone()), &record);

        env.events().publish(
            (symbol_short!("verify"), id),
            record.status,
        );
    }

   
    pub fn reject_shipment(env: Env, id: Symbol) {
        let mut record: ShipmentRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Shipment(id.clone()))
            .unwrap_or_else(|| panic!("Case not found: {:?}", id));

        record.status = ComplianceStatus::Rejected;

        env.storage()
            .persistent()
            .set(&DataKey::Shipment(id.clone()), &record);

        env.events().publish(
            (symbol_short!("reject"), id),
            record.status,
        );
    }

 
    pub fn is_compliant(env: Env, id: Symbol) -> bool {
        let record: Option<ShipmentRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::Shipment(id));

        matches!(
            record.map(|r| r.status),
            Some(ComplianceStatus::Compliant)
        )
    }

    fn is_zero_bytes(b: &Bytes) -> bool {
        if b.len() == 0 {
            return true;
        }
        
        for i in 0..b.len() {
            if b.get(i).unwrap_or(0) != 0 {
                return false;
            }
        }
        true
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn make_hash(env: &Env, s: &str) -> Bytes {
        let mut buf = [0u8; 32];
        let b = s.as_bytes();
        let len = b.len().min(32);
        buf[..len].copy_from_slice(&b[..len]);
        Bytes::from_slice(env, &buf)
    }

    fn zero_hash(env: &Env) -> Bytes {
        Bytes::from_slice(env, &[0u8; 32])
    }

    #[test]
    fn test_submit_and_list() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ComplianceRegistry);
        let client = ComplianceRegistryClient::new(&env, &contract_id);

        let id = Symbol::new(&env, "CASE001");
        let h = make_hash(&env, "abc");

        client.submit_shipment(&id, &h, &h, &h);

        let list = client.list_shipments();
        assert_eq!(list.len(), 1);
        assert_eq!(list.get(0).unwrap(), id);
    }

    #[test]
    fn test_verify_all_present() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ComplianceRegistry);
        let client = ComplianceRegistryClient::new(&env, &contract_id);

        let id = Symbol::new(&env, "CASE002");
        let h = make_hash(&env, "proof");

        client.submit_shipment(&id, &h, &h, &h);
        client.verify_compliance(&id);

        assert!(client.is_compliant(&id));
        let record = client.get_shipment(&id).unwrap();
        assert_eq!(record.status, ComplianceStatus::Compliant);
    }

    #[test]
    fn test_verify_missing_field_rejects() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ComplianceRegistry);
        let client = ComplianceRegistryClient::new(&env, &contract_id);

        let id = Symbol::new(&env, "CASE003");
        let h = make_hash(&env, "proof");
        let z = zero_hash(&env);

        
        client.submit_shipment(&id, &h, &z, &h);
        client.verify_compliance(&id);

        assert!(!client.is_compliant(&id));
        let record = client.get_shipment(&id).unwrap();
        assert_eq!(record.status, ComplianceStatus::Rejected);
    }

    #[test]
    fn test_reject_shipment() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ComplianceRegistry);
        let client = ComplianceRegistryClient::new(&env, &contract_id);

        let id = Symbol::new(&env, "CASE004");
        let h = make_hash(&env, "proof");

        client.submit_shipment(&id, &h, &h, &h);
        client.reject_shipment(&id);

        assert!(!client.is_compliant(&id));
        let record = client.get_shipment(&id).unwrap();
        assert_eq!(record.status, ComplianceStatus::Rejected);
    }

    #[test]
    fn test_deduplicated_list() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ComplianceRegistry);
        let client = ComplianceRegistryClient::new(&env, &contract_id);

        let id = Symbol::new(&env, "CASE005");
        let h = make_hash(&env, "x");

        client.submit_shipment(&id, &h, &h, &h);
        client.submit_shipment(&id, &h, &h, &h); 

        assert_eq!(client.list_shipments().len(), 1);
    }
}