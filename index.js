#!/usr/bin/env node

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, transfer } from '@solana/spl-token';
import fs from 'fs';
import path from 'path';
import bs58 from 'bs58';
import { program } from 'commander';
import dotenv from 'dotenv';

dotenv.config();

// Initialize connection
const connection = new Connection(
  process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com',
  'confirmed'
);

// Wallets directory
const WALLETS_DIR = './wallets';
const WALLETS_FILE = path.join(WALLETS_DIR, 'wallets.json');

// Ensure wallets directory exists
if (!fs.existsSync(WALLETS_DIR)) {
  fs.mkdirSync(WALLETS_DIR, { recursive: true });
}

// Initialize wallets file if it doesn't exist
if (!fs.existsSync(WALLETS_FILE)) {
  fs.writeFileSync(WALLETS_FILE, JSON.stringify([], null, 2));
}

// Load main wallet from environment variable
function getMainWallet() {
  const privateKeyString = process.env.MAIN_WALLET_PRIVATE_KEY;
  
  if (!privateKeyString) {
    console.error('Main wallet private key not found in environment variables.');
    console.error('Please set MAIN_WALLET_PRIVATE_KEY in .env file');
    process.exit(1);
  }
  
  try {
    const privateKey = bs58.decode(privateKeyString);
    return Keypair.fromSecretKey(privateKey);
  } catch (error) {
    console.error('Error loading main wallet:', error.message);
    process.exit(1);
  }
}

// Load all wallets from file
function loadWallets() {
  try {
    const data = fs.readFileSync(WALLETS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading wallets:', error.message);
    return [];
  }
}

// Save wallets to file
function saveWallets(wallets) {
  try {
    fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2));
  } catch (error) {
    console.error('Error saving wallets:', error.message);
  }
}

// Create a new wallet
function createWallet(name) {
  const wallets = loadWallets();
  
  // Check if wallet with same name already exists
  if (wallets.some(w => w.name === name)) {
    console.error(`Wallet with name "${name}" already exists.`);
    return null;
  }
  
  const keypair = Keypair.generate();
  const wallet = {
    name,
    publicKey: keypair.publicKey.toString(),
    privateKey: bs58.encode(keypair.secretKey),
  };
  
  wallets.push(wallet);
  saveWallets(wallets);
  
  return wallet;
}

// Create multiple wallets
async function createWallets(count, prefix = 'wallet') {
  const createdWallets = [];
  const wallets = loadWallets();
  const existingCount = wallets.length;
  
  console.log(`Creating ${count} wallets...`);
  
  for (let i = 0; i < count; i++) {
    const walletNumber = existingCount + i + 1;
    const name = `${prefix}${walletNumber}`;
    const wallet = createWallet(name);
    if (wallet) {
      createdWallets.push(wallet);
      console.log(`Created wallet: ${name} (${wallet.publicKey})`);
    }
  }
  
  console.log(`Created ${createdWallets.length} wallets.`);
  return createdWallets;
}

// List all wallets
function listWallets() {
  const wallets = loadWallets();
  
  if (wallets.length === 0) {
    console.log('No wallets found. Create some wallets first.');
    return;
  }
  
  console.log('All wallets:');
  wallets.forEach((wallet, index) => {
    console.log(`${index + 1}. ${wallet.name}: ${wallet.publicKey}`);
  });
}

// Get wallet balances (SOL and SPL token)
async function getWalletBalances(walletIndices = [], tokenAddress = null) {
  const wallets = loadWallets();
  
  if (wallets.length === 0) {
    console.log('No wallets found. Create some wallets first.');
    return;
  }
  
  const walletsToCheck = walletIndices.length > 0
    ? walletIndices.map(i => wallets[i - 1]).filter(Boolean)
    : wallets;
  
  console.log('Wallet balances:');
  
  for (const wallet of walletsToCheck) {
    try {
      const publicKey = new PublicKey(wallet.publicKey);
      const solBalance = await connection.getBalance(publicKey);
      
      let tokenBalanceInfo = '';
      if (tokenAddress) {
        try {
          const tokenPublicKey = new PublicKey(tokenAddress);
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { mint: tokenPublicKey }
          );
          
          if (tokenAccounts.value.length > 0) {
            const tokenBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            tokenBalanceInfo = `, Token: ${tokenBalance}`;
          } else {
            tokenBalanceInfo = ', Token: No account';
          }
        } catch (error) {
          tokenBalanceInfo = `, Token: Error - ${error.message}`;
        }
      }
      
      console.log(`${wallet.name}: ${solBalance / LAMPORTS_PER_SOL} SOL${tokenBalanceInfo}`);
    } catch (error) {
      console.error(`Error checking balance for ${wallet.name}: ${error.message}`);
    }
  }
}

// Send SOL to wallets
async function sendSol(amount, walletIndices = []) {
  const mainWallet = getMainWallet();
  const wallets = loadWallets();
  
  if (wallets.length === 0) {
    console.log('No wallets found. Create some wallets first.');
    return;
  }
  
  const targetWallets = walletIndices.length > 0
    ? walletIndices.map(i => wallets[i - 1]).filter(Boolean)
    : wallets;
  
  if (targetWallets.length === 0) {
    console.log('No valid target wallets found.');
    return;
  }
  
  const amountLamports = amount * LAMPORTS_PER_SOL;
  
  console.log(`Sending ${amount} SOL to ${targetWallets.length} wallets...`);
  
  for (const wallet of targetWallets) {
    try {
      const receiverPublicKey = new PublicKey(wallet.publicKey);
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: mainWallet.publicKey,
          toPubkey: receiverPublicKey,
          lamports: amountLamports,
        })
      );
      
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [mainWallet]
      );
      
      console.log(`Sent ${amount} SOL to ${wallet.name} (${wallet.publicKey})`);
      console.log(`Transaction signature: ${signature}`);
    } catch (error) {
      console.error(`Error sending SOL to ${wallet.name}: ${error.message}`);
    }
  }
}

// Send SPL token to wallets
async function sendToken(tokenAddress, amount, walletIndices = []) {
  const mainWallet = getMainWallet();
  const wallets = loadWallets();
  
  if (wallets.length === 0) {
    console.log('No wallets found. Create some wallets first.');
    return;
  }
  
  const targetWallets = walletIndices.length > 0
    ? walletIndices.map(i => wallets[i - 1]).filter(Boolean)
    : wallets;
  
  if (targetWallets.length === 0) {
    console.log('No valid target wallets found.');
    return;
  }
  
  const tokenPublicKey = new PublicKey(tokenAddress);
  
  // Get the source token account
  const sourceTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    mainWallet,
    tokenPublicKey,
    mainWallet.publicKey
  );
  
  console.log(`Sending ${amount} tokens to ${targetWallets.length} wallets...`);
  
  for (const wallet of targetWallets) {
    try {
      const receiverPublicKey = new PublicKey(wallet.publicKey);
      
      // Get or create the destination token account
      const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        mainWallet,
        tokenPublicKey,
        receiverPublicKey
      );
      
      // Send tokens
      const signature = await transfer(
        connection,
        mainWallet,
        sourceTokenAccount.address,
        destinationTokenAccount.address,
        mainWallet,
        amount * (10 ** 9) // Assuming 9 decimals, adjust as needed
      );
      
      console.log(`Sent ${amount} tokens to ${wallet.name} (${wallet.publicKey})`);
      console.log(`Transaction signature: ${signature}`);
    } catch (error) {
      console.error(`Error sending tokens to ${wallet.name}: ${error.message}`);
    }
  }
}

// Collect SOL from wallets back to main wallet
async function collectSol(walletIndices = [], leaveAmount = 0) {
  const mainWallet = getMainWallet();
  const wallets = loadWallets();
  
  if (wallets.length === 0) {
    console.log('No wallets found. Create some wallets first.');
    return;
  }
  
  const sourceWallets = walletIndices.length > 0
    ? walletIndices.map(i => wallets[i - 1]).filter(Boolean)
    : wallets;
  
  if (sourceWallets.length === 0) {
    console.log('No valid source wallets found.');
    return;
  }
  
  const leaveAmountLamports = leaveAmount * LAMPORTS_PER_SOL;
  
  console.log(`Collecting SOL from ${sourceWallets.length} wallets back to main wallet...`);
  
  for (const wallet of sourceWallets) {
    try {
      // Load wallet keypair
      const privateKey = bs58.decode(wallet.privateKey);
      const sourceKeypair = Keypair.fromSecretKey(privateKey);
      
      // Get wallet balance
      const balance = await connection.getBalance(sourceKeypair.publicKey);
      
      // Check if there's enough balance to transfer
      const rentExemptBalance = await connection.getMinimumBalanceForRentExemption(0);
      const transferFee = 5000; // Approximate fee for a simple transfer
      const totalMinimumRequired = rentExemptBalance + transferFee + leaveAmountLamports;
      
      if (balance <= totalMinimumRequired) {
        console.log(`Skipping ${wallet.name}: Insufficient balance (${balance / LAMPORTS_PER_SOL} SOL)`);
        continue;
      }
      
      const transferAmount = balance - leaveAmountLamports - transferFee;
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: sourceKeypair.publicKey,
          toPubkey: mainWallet.publicKey,
          lamports: transferAmount,
        })
      );
      
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [sourceKeypair]
      );
      
      console.log(`Collected ${transferAmount / LAMPORTS_PER_SOL} SOL from ${wallet.name}`);
      console.log(`Transaction signature: ${signature}`);
    } catch (error) {
      console.error(`Error collecting SOL from ${wallet.name}: ${error.message}`);
    }
  }
}

// Collect SPL tokens from wallets back to main wallet
async function collectTokens(tokenAddress, walletIndices = []) {
  const mainWallet = getMainWallet();
  const wallets = loadWallets();
  
  if (wallets.length === 0) {
    console.log('No wallets found. Create some wallets first.');
    return;
  }
  
  const sourceWallets = walletIndices.length > 0
    ? walletIndices.map(i => wallets[i - 1]).filter(Boolean)
    : wallets;
  
  if (sourceWallets.length === 0) {
    console.log('No valid source wallets found.');
    return;
  }
  
  const tokenPublicKey = new PublicKey(tokenAddress);
  
  // Get or create the destination token account (main wallet)
  const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    mainWallet,
    tokenPublicKey,
    mainWallet.publicKey
  );
  
  console.log(`Collecting tokens from ${sourceWallets.length} wallets back to main wallet...`);
  
  for (const wallet of sourceWallets) {
    try {
      // Load wallet keypair
      const privateKey = bs58.decode(wallet.privateKey);
      const sourceKeypair = Keypair.fromSecretKey(privateKey);
      
      // Find the token account
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        sourceKeypair.publicKey,
        { mint: tokenPublicKey }
      );
      
      if (tokenAccounts.value.length === 0) {
        console.log(`Skipping ${wallet.name}: No token account found`);
        continue;
      }
      
      const sourceTokenAccount = tokenAccounts.value[0].pubkey;
      const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount;
      
      if (parseInt(balance) === 0) {
        console.log(`Skipping ${wallet.name}: Token balance is zero`);
        continue;
      }
      
      // Transfer all tokens
      const signature = await transfer(
        connection,
        sourceKeypair,
        sourceTokenAccount,
        destinationTokenAccount.address,
        sourceKeypair,
        balance
      );
      
      console.log(`Collected ${balance / (10 ** 9)} tokens from ${wallet.name}`);
      console.log(`Transaction signature: ${signature}`);
    } catch (error) {
      console.error(`Error collecting tokens from ${wallet.name}: ${error.message}`);
    }
  }
}

// Send SOL to multiple wallets in a single transaction
async function sendSolToAll(amount, walletIndices = []) {
  const mainWallet = getMainWallet();
  const wallets = loadWallets();
  
  if (wallets.length === 0) {
    console.log('No wallets found. Create some wallets first.');
    return;
  }
  
  const targetWallets = walletIndices.length > 0
    ? walletIndices.map(i => wallets[i - 1]).filter(Boolean)
    : wallets;
  
  if (targetWallets.length === 0) {
    console.log('No valid target wallets found.');
    return;
  }
  
  const amountLamports = amount * LAMPORTS_PER_SOL;
  
  console.log(`Sending ${amount} SOL to ${targetWallets.length} wallets in a single transaction...`);
  
  try {
    const transaction = new Transaction();
    
    for (const wallet of targetWallets) {
      const receiverPublicKey = new PublicKey(wallet.publicKey);
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: mainWallet.publicKey,
          toPubkey: receiverPublicKey,
          lamports: amountLamports,
        })
      );
    }
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [mainWallet]
    );
    
    console.log(`Sent ${amount} SOL to ${targetWallets.length} wallets in a single transaction`);
    console.log(`Transaction signature: ${signature}`);
    
    // Log each recipient
    targetWallets.forEach(wallet => {
      console.log(`  - ${wallet.name} (${wallet.publicKey})`);
    });
  } catch (error) {
    console.error(`Error sending SOL to multiple wallets: ${error.message}`);
  }
}

// Send SPL token to multiple wallets in a single transaction
async function sendTokenToAll(tokenAddress, amount, walletIndices = []) {
  const mainWallet = getMainWallet();
  const wallets = loadWallets();
  
  if (wallets.length === 0) {
    console.log('No wallets found. Create some wallets first.');
    return;
  }
  
  const targetWallets = walletIndices.length > 0
    ? walletIndices.map(i => wallets[i - 1]).filter(Boolean)
    : wallets;
  
  if (targetWallets.length === 0) {
    console.log('No valid target wallets found.');
    return;
  }
  
  const tokenPublicKey = new PublicKey(tokenAddress);
  
  // Get the source token account
  const sourceTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    mainWallet,
    tokenPublicKey,
    mainWallet.publicKey
  );
  
  console.log(`Sending ${amount} tokens to ${targetWallets.length} wallets in a single transaction...`);
  
  try {
    const transaction = new Transaction();
    const destinationAccounts = [];
    
    // First, ensure all destination accounts exist
    for (const wallet of targetWallets) {
      const receiverPublicKey = new PublicKey(wallet.publicKey);
      
      // Get or create the destination token account
      const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        mainWallet,
        tokenPublicKey,
        receiverPublicKey
      );
      
      destinationAccounts.push({
        wallet,
        tokenAccount: destinationTokenAccount.address
      });
    }
    
    // Then add all transfers to the transaction
    for (const { wallet, tokenAccount } of destinationAccounts) {
      transaction.add(
        transfer(
          connection,
          mainWallet,
          sourceTokenAccount.address,
          tokenAccount,
          mainWallet,
          amount * (10 ** 9) // Assuming 9 decimals, adjust as needed
        )
      );
    }
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [mainWallet]
    );
    
    console.log(`Sent ${amount} tokens to ${targetWallets.length} wallets in a single transaction`);
    console.log(`Transaction signature: ${signature}`);
    
    // Log each recipient
    targetWallets.forEach(wallet => {
      console.log(`  - ${wallet.name} (${wallet.publicKey})`);
    });
  } catch (error) {
    console.error(`Error sending tokens to multiple wallets: ${error.message}`);
    console.error('Note: If transaction is too large, try sending to fewer wallets at once');
  }
}

// Command line interface
program
  .name('solana-wallet-manager')
  .description('Manage multiple Solana wallets, send SOL and SPL tokens, and collect funds')
  .version('1.0.0');

program
  .command('create')
  .description('Create new wallets')
  .argument('<count>', 'Number of wallets to create', parseInt)
  .option('-p, --prefix <prefix>', 'Name prefix for wallets', 'wallet')
  .action(createWallets);

program
  .command('list')
  .description('List all wallets')
  .action(listWallets);

program
  .command('balance')
  .description('Show wallet balances')
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices', val => val.split(',').map(Number))
  .option('-t, --token <address>', 'SPL token address to check balance for')
  .action((options) => {
    getWalletBalances(options.wallets, options.token);
  });

program
  .command('send-sol')
  .description('Send SOL to wallets')
  .argument('<amount>', 'Amount of SOL to send to each wallet', parseFloat)
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices', val => val.split(',').map(Number))
  .action((amount, options) => {
    sendSol(amount, options.wallets);
  });

program
  .command('send-token')
  .description('Send SPL tokens to wallets')
  .argument('<token>', 'SPL token address')
  .argument('<amount>', 'Amount of tokens to send to each wallet', parseFloat)
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices', val => val.split(',').map(Number))
  .action((token, amount, options) => {
    sendToken(token, amount, options.wallets);
  });

program
  .command('collect-sol')
  .description('Collect SOL from wallets back to main wallet')
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices', val => val.split(',').map(Number))
  .option('-l, --leave <amount>', 'Amount of SOL to leave in each wallet', parseFloat, 0)
  .action((options) => {
    collectSol(options.wallets, options.leave);
  });

program
  .command('collect-token')
  .description('Collect SPL tokens from wallets back to main wallet')
  .argument('<token>', 'SPL token address')
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices', val => val.split(',').map(Number))
  .action((token, options) => {
    collectTokens(token, options.wallets);
  });

program
  .command('send-to-all-sol')
  .description('Send SOL to multiple wallets in a single transaction')
  .argument('<amount>', 'Amount of SOL to send to each wallet', parseFloat)
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices', val => val.split(',').map(Number))
  .action((amount, options) => {
    sendSolToAll(amount, options.wallets);
  });

program
  .command('send-to-all-token')
  .description('Send SPL tokens to multiple wallets in a single transaction')
  .argument('<token>', 'SPL token address')
  .argument('<amount>', 'Amount of tokens to send to each wallet', parseFloat)
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices', val => val.split(',').map(Number))
  .action((token, amount, options) => {
    sendTokenToAll(token, amount, options.wallets);
  });

program.parse(process.argv); 