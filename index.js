#!/usr/bin/env node

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, transfer } from '@solana/spl-token';
import fs from 'fs';
import path from 'path';
import bs58 from 'bs58';
import { program } from 'commander';
import dotenv from 'dotenv';
import readline from 'readline';
import { decode as base64Decode } from 'base64-arraybuffer';

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

// Create readline interface for user input
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Ask a yes/no question and return a promise with the answer
function askYesNoQuestion(question) {
  const rl = createReadlineInterface();
  
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Create multiple wallets
async function createWallets(count, options) {
  const prefix = options.prefix || 'wallet';
  const wallets = loadWallets();
  
  // If there are existing wallets, ask whether to keep them
  if (wallets.length > 0) {
    console.log(`Found ${wallets.length} existing wallets.`);
    const keepExisting = await askYesNoQuestion('Do you want to keep existing wallets?');
    
    if (!keepExisting) {
      console.log('Deleting existing wallets...');
      fs.writeFileSync(WALLETS_FILE, JSON.stringify([], null, 2));
      return createWallets(count, options); // Restart with empty wallet list
    }
  }
  
  const createdWallets = [];
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

// Import wallets from a JSON file
async function importWallets(filePath, options) {
  try {
    // Read the file
    const fileData = fs.readFileSync(filePath, 'utf8');
    let importedWallets = JSON.parse(fileData);
    
    if (!Array.isArray(importedWallets)) {
      console.error('Invalid wallet file format. Expected an array of wallet objects.');
      return;
    }
    
    // Detect format and process wallets accordingly
    const processedWallets = [];
    let format = "unknown";
    
    // Try to detect format from first wallet
    const sampleWallet = importedWallets[0] || {};
    
    if (sampleWallet.name && sampleWallet.publicKey && sampleWallet.privateKey) {
      format = "standard"; // Our standard format with name, publicKey and privateKey (base58)
    } else if (sampleWallet.publicKey && sampleWallet.privateKey) {
      format = "keyonly"; // Format with just publicKey and privateKey (often base64) and possibly mnemonic
    }
    
    console.log(`Detected wallet format: ${format}`);
    
    // Process wallets based on format
    for (let i = 0; i < importedWallets.length; i++) {
      const wallet = importedWallets[i];
      let processedWallet = null;
      
      if (format === "standard") {
        // Standard format (already has name, publicKey, privateKey in base58)
        if (!wallet.name || !wallet.publicKey || !wallet.privateKey) {
          console.error(`Skipping invalid wallet at index ${i}: missing required fields`);
          continue;
        }
        
        processedWallet = {
          name: wallet.name,
          publicKey: wallet.publicKey,
          privateKey: wallet.privateKey // Already in base58
        };
      } else if (format === "keyonly") {
        // Format with just keys, may have base64 privateKey
        if (!wallet.publicKey || !wallet.privateKey) {
          console.error(`Skipping invalid wallet at index ${i}: missing required fields`);
          continue;
        }
        
        // Generate name if not provided
        const name = wallet.name || `imported_wallet${i + 1}`;
        
        // Convert privateKey from base64 to base58 if needed
        let privateKeyBase58 = wallet.privateKey;
        
        // Check if the privateKey is in base64 format
        if (wallet.privateKey.includes('+') || wallet.privateKey.includes('/') || wallet.privateKey.includes('=')) {
          try {
            // Convert from base64 to Uint8Array
            const privateKeyArrayBuffer = base64Decode(wallet.privateKey);
            const privateKeyUint8Array = new Uint8Array(privateKeyArrayBuffer);
            
            // Convert to base58
            privateKeyBase58 = bs58.encode(privateKeyUint8Array);
          } catch (error) {
            console.error(`Error converting privateKey for wallet ${i + 1}: ${error.message}`);
            console.error('Trying to use the privateKey as is...');
          }
        }
        
        processedWallet = {
          name,
          publicKey: wallet.publicKey,
          privateKey: privateKeyBase58
        };
      } else {
        console.error(`Unknown wallet format for wallet at index ${i}`);
        continue;
      }
      
      // Verify the keypair is valid
      try {
        const privateKeyBuffer = bs58.decode(processedWallet.privateKey);
        const keypair = Keypair.fromSecretKey(privateKeyBuffer);
        
        // Check if the public key matches
        if (keypair.publicKey.toString() !== processedWallet.publicKey) {
          console.warn(`Warning: Public key mismatch for wallet ${processedWallet.name}.`);
          console.warn(`  File shows: ${processedWallet.publicKey}`);
          console.warn(`  Derived: ${keypair.publicKey.toString()}`);
          
          // Use the derived public key if specified in options
          if (options.fixPublicKeys) {
            console.log(`  Fixing: Using derived public key for ${processedWallet.name}`);
            processedWallet.publicKey = keypair.publicKey.toString();
          } else {
            console.warn(`  Skipping wallet. Use --fix-public-keys option to fix this.`);
            continue;
          }
        }
        
        processedWallets.push(processedWallet);
      } catch (error) {
        console.error(`Invalid private key for wallet ${processedWallet.name}: ${error.message}`);
      }
    }
    
    if (processedWallets.length === 0) {
      console.error('No valid wallets found or processed from the import file.');
      return;
    }
    
    // Load existing wallets
    const existingWallets = loadWallets();
    
    // If there are existing wallets, ask whether to keep them
    if (existingWallets.length > 0) {
      console.log(`Found ${existingWallets.length} existing wallets.`);
      const keepExisting = await askYesNoQuestion('Do you want to keep existing wallets?');
      
      if (!keepExisting) {
        console.log('Replacing existing wallets with imported wallets...');
        saveWallets(processedWallets);
        console.log(`Imported ${processedWallets.length} wallets.`);
        return;
      }
    }
    
    // Merge wallets, checking for duplicates
    const mergedWallets = [...existingWallets];
    let importCount = 0;
    
    for (const wallet of processedWallets) {
      // Check if wallet with same name or public key already exists
      const duplicateNameIndex = mergedWallets.findIndex(w => w.name === wallet.name);
      const duplicateKeyIndex = mergedWallets.findIndex(w => w.publicKey === wallet.publicKey);
      
      if (duplicateNameIndex !== -1) {
        if (options.overwrite) {
          console.log(`Overwriting wallet with name: ${wallet.name}`);
          mergedWallets[duplicateNameIndex] = wallet;
          importCount++;
        } else {
          console.error(`Skipping wallet with duplicate name: ${wallet.name}`);
        }
      } else if (duplicateKeyIndex !== -1) {
        if (options.overwrite) {
          console.log(`Overwriting wallet with public key: ${wallet.publicKey}`);
          mergedWallets[duplicateKeyIndex] = wallet;
          importCount++;
        } else {
          console.error(`Skipping wallet with duplicate public key: ${wallet.publicKey}`);
        }
      } else {
        mergedWallets.push(wallet);
        importCount++;
      }
    }
    
    saveWallets(mergedWallets);
    console.log(`Imported ${importCount} wallets. Total wallets: ${mergedWallets.length}`);
  } catch (error) {
    console.error(`Error importing wallets: ${error.message}`);
  }
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
  
  // Solana transaction size limits require we split into batches
  // Each transfer instruction is roughly 96 bytes, and max transaction size is ~1232 bytes
  // Conservative batch size to avoid transaction too large errors
  const MAX_WALLETS_PER_TX = 10;
  const walletBatches = [];
  
  for (let i = 0; i < targetWallets.length; i += MAX_WALLETS_PER_TX) {
    walletBatches.push(targetWallets.slice(i, i + MAX_WALLETS_PER_TX));
  }
  
  console.log(`Sending ${amount} SOL to ${targetWallets.length} wallets in ${walletBatches.length} transactions...`);
  
  for (let batchIndex = 0; batchIndex < walletBatches.length; batchIndex++) {
    const walletBatch = walletBatches[batchIndex];
    
    try {
      const transaction = new Transaction();
      
      for (const wallet of walletBatch) {
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
      
      console.log(`Batch ${batchIndex + 1}/${walletBatches.length}: Sent ${amount} SOL to ${walletBatch.length} wallets`);
      console.log(`Transaction signature: ${signature}`);
      
      // Log each recipient in this batch
      walletBatch.forEach(wallet => {
        console.log(`  - ${wallet.name} (${wallet.publicKey})`);
      });
    } catch (error) {
      console.error(`Error sending SOL to batch ${batchIndex + 1}: ${error.message}`);
    }
  }
  
  console.log(`Completed sending ${amount} SOL to wallets.`);
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
  
  // Solana transaction size limits require we split into batches
  // SPL token transfers are larger than SOL transfers, so use a smaller batch size
  const MAX_WALLETS_PER_TX = 5;
  const walletBatches = [];
  
  for (let i = 0; i < targetWallets.length; i += MAX_WALLETS_PER_TX) {
    walletBatches.push(targetWallets.slice(i, i + MAX_WALLETS_PER_TX));
  }
  
  console.log(`Sending ${amount} tokens to ${targetWallets.length} wallets in ${walletBatches.length} transactions...`);
  
  for (let batchIndex = 0; batchIndex < walletBatches.length; batchIndex++) {
    const walletBatch = walletBatches[batchIndex];
    
    try {
      const transaction = new Transaction();
      const destinationAccounts = [];
      
      // First, ensure all destination accounts exist
      for (const wallet of walletBatch) {
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
      
      console.log(`Batch ${batchIndex + 1}/${walletBatches.length}: Sent ${amount} tokens to ${walletBatch.length} wallets`);
      console.log(`Transaction signature: ${signature}`);
      
      // Log each recipient in this batch
      walletBatch.forEach(wallet => {
        console.log(`  - ${wallet.name} (${wallet.publicKey})`);
      });
    } catch (error) {
      console.error(`Error sending tokens to batch ${batchIndex + 1}: ${error.message}`);
    }
  }
  
  console.log(`Completed sending ${amount} tokens to wallets.`);
}

// Utility function to parse wallet range or list
function parseWalletIndices(walletRangeStr) {
  if (!walletRangeStr) return [];
  
  const indices = [];
  const parts = walletRangeStr.split(',');
  
  for (const part of parts) {
    if (part.includes('-')) {
      // Handle range like "1-5"
      const [start, end] = part.split('-').map(num => parseInt(num.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          indices.push(i);
        }
      }
    } else {
      // Handle single index
      const index = parseInt(part.trim());
      if (!isNaN(index)) {
        indices.push(index);
      }
    }
  }
  
  // Remove duplicates and sort
  return [...new Set(indices)].sort((a, b) => a - b);
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
  .action((count, options) => {
    createWallets(count, options);
  });

program
  .command('list')
  .description('List all wallets')
  .action(listWallets);

program
  .command('balance')
  .description('Show wallet balances')
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices or ranges (e.g., "1,3,5-10")')
  .option('-t, --token <address>', 'SPL token address to check balance for')
  .action((options) => {
    const walletIndices = parseWalletIndices(options.wallets);
    getWalletBalances(walletIndices, options.token);
  });

program
  .command('send-sol')
  .description('Send SOL to wallets')
  .argument('<amount>', 'Amount of SOL to send to each wallet', parseFloat)
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices or ranges (e.g., "1,3,5-10")')
  .action((amount, options) => {
    const walletIndices = parseWalletIndices(options.wallets);
    sendSol(amount, walletIndices);
  });

program
  .command('send-token')
  .description('Send SPL tokens to wallets')
  .argument('<token>', 'SPL token address')
  .argument('<amount>', 'Amount of tokens to send to each wallet', parseFloat)
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices or ranges (e.g., "1,3,5-10")')
  .action((token, amount, options) => {
    const walletIndices = parseWalletIndices(options.wallets);
    sendToken(token, amount, walletIndices);
  });

program
  .command('collect-sol')
  .description('Collect SOL from wallets back to main wallet')
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices or ranges (e.g., "1,3,5-10")')
  .option('-l, --leave <amount>', 'Amount of SOL to leave in each wallet', parseFloat, 0)
  .action((options) => {
    const walletIndices = parseWalletIndices(options.wallets);
    collectSol(walletIndices, options.leave);
  });

program
  .command('collect-token')
  .description('Collect SPL tokens from wallets back to main wallet')
  .argument('<token>', 'SPL token address')
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices or ranges (e.g., "1,3,5-10")')
  .action((token, options) => {
    const walletIndices = parseWalletIndices(options.wallets);
    collectTokens(token, walletIndices);
  });

program
  .command('send-to-all-sol')
  .description('Send SOL to multiple wallets in a single transaction')
  .argument('<amount>', 'Amount of SOL to send to each wallet', parseFloat)
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices or ranges (e.g., "1,3,5-10")')
  .action((amount, options) => {
    const walletIndices = parseWalletIndices(options.wallets);
    sendSolToAll(amount, walletIndices);
  });

program
  .command('send-to-all-token')
  .description('Send SPL tokens to multiple wallets in a single transaction')
  .argument('<token>', 'SPL token address')
  .argument('<amount>', 'Amount of tokens to send to each wallet', parseFloat)
  .option('-w, --wallets <indices>', 'Comma-separated list of wallet indices or ranges (e.g., "1,3,5-10")')
  .action((token, amount, options) => {
    const walletIndices = parseWalletIndices(options.wallets);
    sendTokenToAll(token, amount, walletIndices);
  });

program
  .command('import')
  .description('Import wallets from a JSON file')
  .argument('<file>', 'Path to JSON file containing wallet data')
  .option('-o, --overwrite', 'Overwrite wallets with duplicate names or public keys', false)
  .option('-f, --fix-public-keys', 'Fix public keys if they don\'t match the derived ones from the private key', false)
  .action((file, options) => {
    importWallets(file, options);
  });

program.parse(process.argv); 