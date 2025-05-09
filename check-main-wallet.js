import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

async function checkMainWallet() {
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
    
    // Get wallet address
    const publicKey = keypair.publicKey;
    console.log('Ana Cüzdan Adresi:', publicKey.toString());
    
    // Get SOL balance
    const balance = await connection.getBalance(publicKey);
    console.log('Ana Cüzdan Bakiyesi:', balance / LAMPORTS_PER_SOL, 'SOL');
    
    if (balance === 0) {
      console.log('\n⚠️ DİKKAT: Ana cüzdanınızda hiç SOL yok!');
      console.log('Solana işlemleri yapabilmeniz için cüzdanınızda biraz SOL olması gerekiyor.');
      console.log('Eğer testnet/devnet kullanıyorsanız, faucet\'ten ücretsiz test SOL alabilirsiniz:');
      console.log('https://faucet.solana.com/');
    } else if (balance < 0.1 * LAMPORTS_PER_SOL) {
      console.log('\n⚠️ DİKKAT: Ana cüzdanınızda çok az SOL var!');
      console.log('Çoklu işlemler için yeterli olmayabilir.');
    }
  } catch (error) {
    console.error('Ana cüzdan kontrolü sırasında hata oluştu:', error.message);
    console.error('Lütfen .env dosyasındaki özel anahtarın doğru formatta olduğundan emin olun.');
  }
}

checkMainWallet(); 