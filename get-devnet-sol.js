import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

async function requestAirdrop() {
  // Load main wallet from environment variable
  const privateKeyString = process.env.MAIN_WALLET_PRIVATE_KEY;
  
  if (!privateKeyString || privateKeyString === 'your_private_key_in_base58_format') {
    console.error('⚠️ HATA: Ana cüzdanınızın özel anahtarı .env dosyasında tanımlanmamış.');
    console.error('Lütfen .env dosyasını açıp MAIN_WALLET_PRIVATE_KEY değerini gerçek bir özel anahtarla değiştirin.');
    return;
  }
  
  try {
    // Initialize connection
    const connection = new Connection(
      process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    // Decode private key
    const privateKey = bs58.decode(privateKeyString);
    const keypair = Keypair.fromSecretKey(privateKey);
    const publicKey = keypair.publicKey;
    
    console.log('Ana Cüzdan Adresi:', publicKey.toString());
    
    // Get initial balance
    const initialBalance = await connection.getBalance(publicKey);
    console.log('İşlem Öncesi Bakiye:', initialBalance / LAMPORTS_PER_SOL, 'SOL');
    
    console.log('\nDevnet SOL talep ediliyor...');
    
    // Request airdrop of 2 SOL (adjust amount as needed)
    const signature = await connection.requestAirdrop(
      publicKey,
      2 * LAMPORTS_PER_SOL
    );
    
    // Wait for confirmation
    await connection.confirmTransaction(signature);
    
    // Get new balance
    const newBalance = await connection.getBalance(publicKey);
    console.log('İşlem Sonrası Bakiye:', newBalance / LAMPORTS_PER_SOL, 'SOL');
    console.log(`Başarıyla ${(newBalance - initialBalance) / LAMPORTS_PER_SOL} SOL alındı!`);
    
  } catch (error) {
    console.error('Devnet SOL alma işlemi sırasında hata oluştu:', error.message);
    console.error('Not: Eğer devnet meşgulse, birkaç dakika sonra tekrar deneyin.');
    console.error('Eğer hata devam ederse, Solana devnet explorer\'dan manuel olarak SOL alabilirsiniz:');
    console.error('https://faucet.solana.com/');
  }
}

requestAirdrop(); 