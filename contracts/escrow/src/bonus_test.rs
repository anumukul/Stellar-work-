#[test]
fn test_early_completion_bonus() {
    let env = Env::default();
    let (_admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[1u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;
    let bonus: i128 = 50_0000000;

    // Post job with bonus
    let job_id = escrow.post_job_with_categories(&client, &amount, &bonus, &desc_hash, &100u32, &deadline, &token, &vec![&env]);
    
    // Check escrow balance
    let token_client = soroban_sdk::token::Client::new(&env, &token);
    assert_eq!(token_client.balance(&contract_id), amount + bonus);
    
    // Accept and submit
    escrow.accept_job(&freelancer, &job_id);
    escrow.submit_work(&freelancer, &job_id);
    
    // Fast forward to early completion
    env.ledger().with_mut(|l| l.timestamp = 500); // 500/1000 time used
    
    // Approve
    escrow.approve_work(&client, &job_id);
    
    // Verify
    let job = escrow.get_job(&job_id);
    assert!(job.bonus_paid);
    // Freelancer should receive: base amount + ~50% bonus
    // 50% of 50_0000000 = 25_0000000
    // Total = 125_0000000
    let freelancer_balance = token_client.balance(&freelancer);
    assert!(freelancer_balance >= amount + bonus / 2);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::Completed);
}

#[test]
fn test_cancel_with_bonus_refund() {
    let env = Env::default();
    let (_admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[1u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;
    let bonus: i128 = 50_0000000;

    // Post job with bonus
    let job_id = escrow.post_job_with_categories(&client, &amount, &bonus, &desc_hash, &100u32, &deadline, &token, &vec![&env]);
    
    let token_client = soroban_sdk::token::Client::new(&env, &token);
    let client_balance_before = token_client.balance(&client);
    
    // Cancel
    escrow.cancel_job(&client, &job_id);
    
    // Verify refund
    let client_balance_after = token_client.balance(&client);
    assert_eq!(client_balance_after, client_balance_before + amount + bonus);
}
