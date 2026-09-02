/**
 * load-tests/concurrent-contract.js
 * 
 * Simulates concurrent user load against the Soroban contract.
 * Focuses on two scenarios:
 * 1. Concurrent job postings (100+ simulated users posting jobs simultaneously).
 * 2. Concurrent accept_job for the same job (multiple freelancers attempting to accept at the exact same ledger).
 * 
 * Usage:
 *   node load-tests/concurrent-contract.js
 */

const { Keypair, TransactionBuilder, Networks, Contract, xdr, rpc, Asset } = require("@stellar/stellar-sdk");

// Configuration
const RPC_URL = process.env.RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
const CONTRACT_ID = process.env.CONTRACT_ID;
const NUM_POSTINGS = 100;
const NUM_FREELANCERS = 10; // For concurrent accept test

async function fundAccount(publicKey) {
  try {
    await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  } catch (e) {
    console.error(`Failed to fund ${publicKey}:`, e);
  }
}

async function simulateConcurrentPostings(server, contract, clients) {
  console.log(`Simulating ${NUM_POSTINGS} concurrent job postings...`);
  
  const promises = clients.map(async (client, i) => {
    try {
      const sourceAccount = await server.getAccount(client.publicKey());
      const tx = new TransactionBuilder(sourceAccount, {
        fee: "10000",
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          contract.call(
            "post_job",
            xdr.ScVal.scvString(`Concurrent Job ${i}`),
            xdr.ScVal.scvString("Description hash"),
            xdr.ScVal.scvString("0") // No deadline
          )
        )
        .setTimeout(30)
        .build();
        
      tx.sign(client);
      
      const preparedTx = await server.prepareTransaction(tx);
      const response = await server.sendTransaction(preparedTx);
      return { client: i, status: "success", hash: response.hash };
    } catch (err) {
      return { client: i, status: "error", error: err.message };
    }
  });

  const results = await Promise.allSettled(promises);
  
  let successes = 0;
  let failures = 0;
  results.forEach(res => {
    if (res.status === 'fulfilled' && res.value.status === 'success') {
      successes++;
    } else {
      failures++;
    }
  });
  
  console.log(`Results for ${NUM_POSTINGS} concurrent postings:`);
  console.log(`Successes: ${successes}`);
  console.log(`Failures: ${failures}`);
}

async function simulateConcurrentAccepts(server, contract, client, freelancers) {
  console.log(`\nSimulating ${NUM_FREELANCERS} concurrent job accepts for the same job...`);
  
  // 1. Post a single job
  const sourceAccount = await server.getAccount(client.publicKey());
  const postTx = new TransactionBuilder(sourceAccount, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call("post_job", xdr.ScVal.scvString("Contested Job"), xdr.ScVal.scvString("Hash"), xdr.ScVal.scvString("0")))
    .setTimeout(30)
    .build();
  postTx.sign(client);
  const prepPostTx = await server.prepareTransaction(postTx);
  const postRes = await server.sendTransaction(prepPostTx);
  
  // Await job posting to finalize and get jobId (simplification for load script)
  console.log(`Posted contested job, waiting for confirmation... (Tx: ${postRes.hash})`);
  await new Promise(resolve => setTimeout(resolve, 5000));
  const jobId = 1; // Assuming we fetch the ID from events or state
  
  // 2. All freelancers try to accept it at the same time
  const promises = freelancers.map(async (freelancer, i) => {
    try {
      const acct = await server.getAccount(freelancer.publicKey());
      const tx = new TransactionBuilder(acct, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(contract.call("accept_job", xdr.ScVal.scvU64(new xdr.Uint64(jobId))))
        .setTimeout(30)
        .build();
      tx.sign(freelancer);
      const preparedTx = await server.prepareTransaction(tx);
      const response = await server.sendTransaction(preparedTx);
      return { freelancer: i, status: "success", hash: response.hash };
    } catch (err) {
      return { freelancer: i, status: "error", error: err.message };
    }
  });

  const results = await Promise.allSettled(promises);
  
  let successes = 0;
  let failures = 0;
  let conflicts = 0;
  
  results.forEach(res => {
    if (res.status === 'fulfilled' && res.value.status === 'success') {
      successes++;
    } else {
      failures++;
      // Check if error is due to concurrent invocation or data conflict
      if (res.value && res.value.error && res.value.error.includes("conflict")) {
        conflicts++;
      }
    }
  });
  
  console.log(`Results for ${NUM_FREELANCERS} concurrent accepts:`);
  console.log(`Successes: ${successes} (Expected: 1)`);
  console.log(`Failures: ${failures} (Expected: ${NUM_FREELANCERS - 1})`);
  console.log(`Identified Data Conflicts: ${conflicts}`);
}

async function run() {
  if (!CONTRACT_ID) {
    console.error("Please set CONTRACT_ID environment variable.");
    process.exit(1);
  }

  const server = new rpc.Server(RPC_URL);
  const contract = new Contract(CONTRACT_ID);

  console.log("Setting up accounts (this may take a while)...");
  
  // Generate clients for postings
  const clients = Array.from({ length: NUM_POSTINGS }).map(() => Keypair.random());
  
  // Generate freelancers for accepts
  const freelancers = Array.from({ length: NUM_FREELANCERS }).map(() => Keypair.random());

  // Funding accounts (in a real test you'd fund them in batches or via a root account)
  // For this script, we assume they are funded or we fund sequentially (slow).
  // ...

  console.log("Accounts ready. Starting load test.");
  
  // Scenario 1
  await simulateConcurrentPostings(server, contract, clients);
  
  // Scenario 2
  await simulateConcurrentAccepts(server, contract, clients[0], freelancers);
  
  console.log("Load tests completed.");
}

run().catch(err => {
  console.error("Load test failed:", err);
});
