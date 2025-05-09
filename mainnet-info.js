import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

async function checkMainnetInfo() {
  // Load main wallet from environment variable
  const privateKeyString = process.env.MAIN_WALLET_PRIVATE_KEY;
  
  if (!privateKeyString || privateKeyString === 'your_private_key_in_base58_format') {
    console.error('⚠️ HATA: Ana cüzdanınızın özel anahtarı .env dosyasında tanımlanmamış.');
    console.error('Lütfen .env dosyasını açıp MAIN_WALLET_PRIVATE_KEY değerini gerçek bir özel anahtarla değiştirin.');
    return;
  }
  
  const endpoint = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  
  try {
    // Initialize connection
    const connection = new Connection(endpoint, 'confirmed');
    
    // Decode private key
    const privateKey = bs58.decode(privateKeyString);
    const keypair = Keypair.fromSecretKey(privateKey);
    const publicKey = keypair.publicKey;
    
    console.log('🔌 Bağlantı: Solana Mainnet');
    console.log('📡 RPC Endpoint:', endpoint);
    console.log('👛 Ana Cüzdan Adresi:', publicKey.toString());
    
    // Get SOL balance
    const balance = await connection.getBalance(publicKey);
    console.log('💰 Ana Cüzdan Bakiyesi:', balance / LAMPORTS_PER_SOL, 'SOL');
    
    const recentBlockhash = await connection.getLatestBlockhash();
    console.log('🔄 Son Blok:', recentBlockhash.blockhash);
    
    if (balance === 0) {
      console.log('\n⚠️ DİKKAT: Ana cüzdanınızda hiç SOL yok!');
      console.log('Solana mainnet\'te işlem yapabilmek için cüzdanınızda SOL olması gerekiyor.');
      console.log('Bir borsadan veya başka bir cüzdandan SOL transfer edebilirsiniz.');
    } else if (balance < 0.1 * LAMPORTS_PER_SOL) {
      console.log('\n⚠️ DİKKAT: Ana cüzdanınızda çok az SOL var!');
      console.log('Çoklu işlemler için yeterli olmayabilir.');
    }
    
    console.log('\n✅ Mainnet Hazır!');
    console.log('Aşağıdaki komutlarla cüzdanları yönetebilirsiniz:');
    console.log('- Cüzdan oluşturmak için: node index.js create <adet>');
    console.log('- Cüzdanlara SOL göndermek için: node index.js send-to-all-sol <miktar>');
    console.log('- Cüzdanlara token göndermek için: node index.js send-to-all-token <token_adresi> <miktar>');
    console.log('- SOL toplamak için: node index.js collect-sol');
    
  } catch (error) {
    console.error('Mainnet bağlantı hatası:', error.message);
    console.error('Lütfen internet bağlantınızı ve RPC endpoint\'i kontrol edin.');
  }
}

checkMainnetInfo(); 