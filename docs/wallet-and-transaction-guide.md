# Wallet and Transaction Guide

A non-technical guide for new StellarWork users. It explains how to connect a wallet, choose
the right network, and sign the transactions behind each job action.

**Who this is for:** first-time users with no blockchain background.

**Related documents:**

- [ACCOUNT_MANAGEMENT.md](./ACCOUNT_MANAGEMENT.md) — wallet installation, key backup, and account recovery
- [stellar-network-comparison.md](./stellar-network-comparison.md) — Testnet vs Mainnet in detail
- [glossary.md](./glossary.md) — plain-language definitions of contract and wallet terms
- [troubleshooting.md](./troubleshooting.md) — errors that appear while running the project locally

> **Note for translators:** this guide uses short, self-contained sentences so each section can
> be translated on its own. See [TRANSLATING.md](./TRANSLATING.md). Do not translate brand names
> (`StellarWork`, `Freighter`, `Stellar`) or `{placeholders}`.

## Table of Contents

1. [What a transaction is](#1-what-a-transaction-is)
2. [Before you start](#2-before-you-start)
3. [Connect your wallet](#3-connect-your-wallet)
4. [Choose the right network](#4-choose-the-right-network)
5. [Sign and confirm a transaction](#5-sign-and-confirm-a-transaction)
6. [Troubleshooting table](#6-troubleshooting-table)
7. [Safety tips](#7-safety-tips)
8. [Where to go next](#8-where-to-go-next)

---

## 1. What a transaction is

StellarWork stores job and payment state on the Stellar network. The network only changes when
you sign a **transaction**.

A transaction is a signed instruction. It says what you want to do and which account is doing it.

You do not type a password on the website. Instead:

1. StellarWork prepares the instruction.
2. Your wallet shows the instruction.
3. You approve it with your wallet password.

The wallet signs the instruction locally in your browser. Your secret key never reaches the
StellarWork server. See [ACCOUNT_MANAGEMENT.md](./ACCOUNT_MANAGEMENT.md) for how keys are stored.

> [!IMPORTANT]
> A signed transaction cannot be undone. Read the wallet popup before you approve it.

---

## 2. Before you start

You need three things:

| Requirement | Why it is needed |
|-------------|------------------|
| The Freighter browser extension | Stores your keys and signs transactions |
| A funded account | Pays the job amount, the network fee, and the platform fee |
| The correct network selected | The contract must exist on the network you use |

### 2.1 Install Freighter

Freighter is the recommended wallet for StellarWork. Full installation steps, including password
setup and recovery-phrase backup, are in
[ACCOUNT_MANAGEMENT.md](./ACCOUNT_MANAGEMENT.md#2-installing-and-setting-up-freighter).

After installation, pin the Freighter icon to your browser toolbar. You will need it for every
action that changes data.

### 2.2 Fund your account

The funding method depends on the network.

**On Testnet**

Testnet uses test lumens. Test lumens have no value and cost nothing.

1. Open the [Stellar Laboratory account creator](https://laboratory.stellar.org/#account-creator?network=testnet).
2. Paste your public key. It starts with `G`.
3. Confirm. The account receives test lumens within a few seconds.

You can also ask the site to fund the account from the StellarWork wallet menu when the balance
is too low.

**On Mainnet**

Mainnet uses real lumens (XLM). Real lumens have value.

1. Buy XLM on an exchange.
2. Withdraw XLM to your public key. It starts with `G`.
3. Keep a small extra amount. Every transaction costs a network fee.

> [!IMPORTANT]
> Always send a small test amount first. A wrong address cannot be reversed.

### 2.3 Check your balance

Open Freighter and confirm the balance is higher than the amount you plan to spend.

Budget for three costs:

- the job amount held in escrow,
- the network fee for each transaction,
- the platform fee, charged when work is approved.

The platform fee defaults to **2.5% (250 basis points)** and is deducted from the payout.
See [TOKENOMICS.md](./TOKENOMICS.md) for the full fee model.

---

## 3. Connect your wallet

Connecting only shares your public key. It does not move funds and it does not grant spending
rights.

1. Open StellarWork in your browser.
2. Select `Connect Wallet` in the site header.
3. Freighter opens and asks for permission.
4. Approve the connection.
5. The header now shows a shortened version of your address, such as `GABC...WXYZ`.

To stop using the site, select `Disconnect`. The site forgets your address until you connect again.

If the button shows `Install Freighter` or the page reports `Freighter wallet not detected`,
the extension is missing or disabled. Install it, then reload the page.

> [!TIP]
> Use `Copy Address` in the wallet menu when you need your full public key, for example to
> receive a payment.

---

## 4. Choose the right network

Stellar has more than one network. They are completely separate.

| Network | Purpose | Money at risk |
|---------|---------|---------------|
| Testnet | Practice and development. This is the default. | None. Test lumens have no value. |
| Mainnet | Real jobs and real payments. | Real lumens. |

### 4.1 Select the network

1. Open the Freighter extension.
2. Switch the network selector to the network you want.
3. Reload the StellarWork page.
4. Confirm the network shown by the site matches the network in Freighter.

The site and the wallet must agree. If they disagree, the wallet will show a network warning
before signing.

### 4.2 Common network failures

| What you see | What it means | What to do |
|--------------|---------------|------------|
| `Job not found` right after posting | The site is reading a different network than the wallet used | Switch both to the same network and reload |
| The wallet warns about an unknown network | The transaction targets a network the wallet does not recognise | Cancel, switch networks in Freighter, then retry |
| The contract address looks wrong | The site points to a contract that is not deployed on this network | Check `NEXT_PUBLIC_CONTRACT_ID` in the site environment |
| The balance shows zero on Testnet | Testnet funds are separate from Mainnet funds | Fund the account again on Testnet |

For a detailed comparison, see [stellar-network-comparison.md](./stellar-network-comparison.md).

---

## 5. Sign and confirm a transaction

Every job action follows the same four steps:

1. Select the action in the site.
2. Review the wallet popup.
3. Approve or reject the popup.
4. Wait for confirmation.

The wallet popup is the last checkpoint. Check four fields before approving:

| Field | What to confirm |
|-------|-----------------|
| Network | The network you intended to use |
| Contract or destination | The StellarWork contract address |
| Amount | The exact amount you expect to spend or receive |
| Fee | A small network fee, not a large unexpected charge |

### 5.1 Post Job (client)

Posting creates the job and moves the payment into escrow.

1. Connect the wallet that will act as the client.
2. Open the post-job page and fill in the title, description, amount, token, and deadline.
3. Select `Post Job`.
4. Freighter opens. Confirm the network, the contract, and the amount.
5. Approve. The popup closes and the site reports `Job posted successfully`.

The job now has the status `Open`. The amount is held by the contract, not by the site.

If the popup is rejected, nothing is charged and no job is created. You can submit again.

### 5.2 Accept Job (freelancer)

1. Connect the wallet that will act as the freelancer.
2. Open the job details page.
3. Select `Accept Job`.
4. Confirm the popup. This transaction does not move funds.
5. The status changes to `In Progress`.

### 5.3 Submit Work (freelancer)

1. Open the job you are working on.
2. Select `Submit Work`.
3. Confirm the popup.
4. The status changes to `Submitted for Review`.

### 5.4 Approve Work (client)

Approving releases the escrow to the freelancer.

1. Connect the client wallet.
2. Open the job that is `Submitted for Review`.
3. Select `Approve Work`.
4. Confirm the popup. Check the contract address and the amount carefully.
5. The status changes to `Completed` and the payment is released.

The freelancer receives the job amount minus the platform fee. See
[TOKENOMICS.md](./TOKENOMICS.md) for the exact split.

If the work is not acceptable, the client selects `Reject Work` instead. The job returns to
`In Progress`. Each rejection counts as one revision. The revision limit is 3.

### 5.5 Other actions

| Action | Who signs | Effect |
|--------|-----------|--------|
| `Cancel Job` | Client | Returns the escrow when the job has not been accepted |
| `Raise Dispute` | Client or freelancer | Escalates the job for admin review |
| `Disconnect` | Nobody | Stops sharing your address with the site |

### 5.6 After you approve

A transaction is usually confirmed within a few seconds. The site updates on its own.

If the page still shows the old state after a minute:

1. Wait a little longer. Network load can slow confirmation.
2. Reload the page.
3. Open the transaction in a Stellar explorer and check its status.

Do not submit the same action again while the first one is pending. Sending it twice can fail
with a duplicate-transaction error.

---

## 6. Troubleshooting table

This table covers wallet, network, and signing problems. For local development errors, see
[troubleshooting.md](./troubleshooting.md).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Freighter wallet not detected` | The extension is missing, disabled, or blocked | Install or enable Freighter, then reload the page |
| The wallet popup never appears | The popup was closed, or the browser blocked it | Allow popups for the site and select the action again |
| `Unauthorized` | The connected account is not the account the action expects | Connect the correct account. Only the client can approve work |
| `Insufficient Balance` | Not enough lumens for the amount plus fees | Fund the account, then retry |
| The transaction fails with a duplicate error | The same action was submitted twice | Wait for the first transaction to finish, then reload |
| The job is `Completed` but the balance did not change | The wallet is on a different network than the site | Switch both to the same network and reload |
| The job is `Disputed` and no action works | A dispute is waiting for admin review | Wait for the admin resolution |
| `Job not found` | The job ID does not exist on the selected network | Confirm the network and the job link |
| The wallet asks for a password you do not have | The Freighter session expired | Unlock Freighter, or restore the wallet from your recovery phrase |

> [!WARNING]
> No StellarWork support person will ever ask for your recovery phrase or secret key.
> Anyone who does is attempting a theft.

---

## 7. Safety tips

### 7.1 Protect your keys

- Never type your recovery phrase or secret key into a website, chat, or form.
- Store the recovery phrase offline, on paper, in a safe place.
- Do not photograph the recovery phrase and do not store it in cloud notes.
- Full guidance is in [ACCOUNT_MANAGEMENT.md](./ACCOUNT_MANAGEMENT.md).

### 7.2 Check before you sign

- Read the wallet popup every time. Do not approve on autopilot.
- Confirm the network, the contract address, and the amount.
- If the amount is larger than expected, reject the popup.
- A rejected popup costs nothing.

### 7.3 Recognise phishing

- Type the StellarWork address yourself, or use a saved bookmark.
- Treat links from direct messages as unsafe, even from people you know.
- Check the domain carefully. Attackers copy familiar names with small changes.
- Install browser extensions only from the official extension store.

### 7.4 Limit permissions

- Connect your wallet only to sites you intend to use.
- Use `Disconnect` when you finish.
- Keep one wallet for testing and a separate wallet for real funds.
- Never reuse a recovery phrase from another wallet.

---

## 8. Where to go next

| I want to... | Read this |
|--------------|-----------|
| Install a wallet and back up my keys | [ACCOUNT_MANAGEMENT.md](./ACCOUNT_MANAGEMENT.md) |
| Understand Testnet vs Mainnet | [stellar-network-comparison.md](./stellar-network-comparison.md) |
| Look up a term | [glossary.md](./glossary.md) |
| Understand fees | [TOKENOMICS.md](./TOKENOMICS.md) |
| See the contract methods behind each action | [contract-reference.md](./contract-reference.md) |
| Fix a local development error | [troubleshooting.md](./troubleshooting.md) |
| Contribute a translation of this guide | [TRANSLATING.md](./TRANSLATING.md) |
