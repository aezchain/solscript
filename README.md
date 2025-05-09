# Solana Wallet Manager

Bu script, Solana blokzincirinde çoklu cüzdan oluşturmanızı, bu cüzdanlara SOL ve SPL tokenları göndermenizi ve daha sonra bu cüzdanlardan paraları ana cüzdana toplamanızı sağlar.

## Kurulum

1. Node.js'in kurulu olduğundan emin olun (v14 veya üzeri önerilir)
2. Depoyu yerel makinenize klonlayın
3. Gerekli bağımlılıkları kurun:

```bash
npm install
```

4. `.env` dosyası oluşturun ve ana cüzdan özel anahtarınızı ekleyin:

```
MAIN_WALLET_PRIVATE_KEY=your_private_key_in_base58_format
RPC_ENDPOINT=https://api.mainnet-beta.solana.com
```

**Not:** Özel anahtarınızı Base58 formatında belirtmeniz gerekiyor. Phantom gibi bir cüzdan kullanıyorsanız, özel anahtarı dışa aktarabilir ve bu formatta kullanabilirsiniz.

## Solana Ağ Seçimi

Bu script varsayılan olarak Solana mainnet üzerinde çalışacak şekilde ayarlanmıştır. Eğer testnet veya devnet üzerinde test etmek isterseniz, `.env` dosyasında `RPC_ENDPOINT` değerini şu şekilde değiştirebilirsiniz:

- Mainnet: `RPC_ENDPOINT=https://api.mainnet-beta.solana.com`
- Devnet: `RPC_ENDPOINT=https://api.devnet.solana.com`
- Testnet: `RPC_ENDPOINT=https://api.testnet.solana.com`

**Önemli:** Devnet veya testnet üzerinde test ederken, ücretsiz test SOL almak için `get-devnet-sol.js` scriptini çalıştırabilirsiniz:

```bash
node get-devnet-sol.js
```

Mainnet üzerinde çalışmak için ana cüzdanınızda gerçek SOL olması gerektiğini unutmayın. Mainnet durumunu kontrol etmek için:

```bash
node mainnet-info.js
```

## Kullanım

Script aşağıdaki komutları destekler:

### Cüzdan Oluşturma

```bash
node index.js create <adet> [--prefix <ön_ek>]
```

Örnek:
```bash
# 5 cüzdan oluştur
node index.js create 5

# "test" ön ekiyle 3 cüzdan oluştur (test1, test2, test3)
node index.js create 3 --prefix test
```

**Yeni:** Artık cüzdan oluştururken mevcut cüzdanları silmek veya tutmak isteyip istemediğiniz sorulacaktır.

### Cüzdan İçe Aktarma (Import)

Harici bir JSON dosyasından cüzdanları içe aktarabilirsiniz. JSON dosyası aşağıdaki formatta bir dizi cüzdan içermelidir:

```json
[
  {
    "name": "wallet1",
    "publicKey": "cüzdan_public_key",
    "privateKey": "cüzdan_private_key_base58"
  },
  {
    "name": "wallet2",
    "publicKey": "cüzdan_public_key",
    "privateKey": "cüzdan_private_key_base58"
  }
]
```

İçe aktarma komutu:

```bash
# Cüzdanları içe aktar
node index.js import <dosya_yolu>

# Aynı isme veya public key'e sahip cüzdanları üzerine yazarak içe aktar
node index.js import <dosya_yolu> --overwrite
```

İçe aktarma sırasında da mevcut cüzdanları tutmak veya silmek isteyip istemediğiniz sorulacaktır.

### Cüzdanları Listeleme

```bash
node index.js list
```

### Cüzdan Bakiyelerini Görüntüleme

```bash
# Tüm cüzdanların SOL bakiyelerini göster
node index.js balance

# Belirli cüzdanların SOL bakiyelerini göster (1. ve 3. cüzdan)
node index.js balance --wallets 1,3

# Belirli bir aralıktaki cüzdanların bakiyelerini göster (1'den 10'a kadar)
node index.js balance --wallets 1-10

# Karma bir şekilde belirtilen cüzdanların bakiyelerini göster (1, 3 ve 5'ten 10'a kadar)
node index.js balance --wallets 1,3,5-10

# Tüm cüzdanların belirli bir SPL token bakiyesini göster
node index.js balance --token <token_adresi>
```

### SOL Gönderme

```bash
# Tüm cüzdanlara 0.1 SOL gönder
node index.js send-sol 0.1

# Sadece 2. ve 4. cüzdanlara 0.05 SOL gönder
node index.js send-sol 0.05 --wallets 2,4

# 1'den 10'a kadar olan cüzdanlara 0.01 SOL gönder
node index.js send-sol 0.01 --wallets 1-10

# Karma belirtilen cüzdanlara SOL gönder
node index.js send-sol 0.02 --wallets 1,3,5-10,15
```

### SPL Token Gönderme

```bash
# Tüm cüzdanlara 10 token gönder
node index.js send-token <token_adresi> 10

# Sadece 1., 3. ve 5. cüzdanlara 5 token gönder
node index.js send-token <token_adresi> 5 --wallets 1,3,5

# 1'den 5'e kadar olan cüzdanlara 10 token gönder
node index.js send-token <token_adresi> 10 --wallets 1-5
```

### Tek İşlemde Çoklu Gönderim (Send-to-All)

```bash
# Tüm cüzdanlara 0.1 SOL gönder
node index.js send-to-all-sol 0.1

# Sadece 2. ve 4. cüzdanlara 0.05 SOL gönder
node index.js send-to-all-sol 0.05 --wallets 2,4

# 1'den 20'ye kadar olan cüzdanlara 0.01 SOL gönder
node index.js send-to-all-sol 0.01 --wallets 1-20

# Tüm cüzdanlara 10 token gönder
node index.js send-to-all-token <token_adresi> 10

# Sadece 1., 3. ve 5. cüzdanlara 5 token gönder
node index.js send-to-all-token <token_adresi> 5 --wallets 1,3,5
```

**Not:** `send-to-all` komutları artık işlemleri otomatik olarak daha küçük gruplara (batch) bölerek gerçekleştirir. Bu, Solana'nın işlem boyutu sınırlamalarına uygun şekilde çalışır. SOL transferleri için her grupta maksimum 10 cüzdan, SPL token transferleri için her grupta maksimum 5 cüzdan kullanılır. Bu sayede "Transaction too large" hatası önlenir ve çok sayıda cüzdana sorunsuz şekilde gönderim yapılabilir.

### SOL Toplama

```bash
# Tüm cüzdanlardan SOL'leri ana cüzdana topla
node index.js collect-sol

# Sadece 2. ve 3. cüzdanlardan SOL'leri topla
node index.js collect-sol --wallets 2,3

# 5'ten 15'e kadar olan cüzdanlardan SOL'leri topla
node index.js collect-sol --wallets 5-15

# Tüm cüzdanlardan SOL'leri topla, her cüzdanda 0.01 SOL bırak
node index.js collect-sol --leave 0.01
```

### SPL Token Toplama

```bash
# Tüm cüzdanlardan belirli bir token'ı ana cüzdana topla
node index.js collect-token <token_adresi>

# Sadece 1. ve 4. cüzdanlardan token'ları topla
node index.js collect-token <token_adresi> --wallets 1,4

# 10'dan 30'a kadar olan cüzdanlardan token'ları topla
node index.js collect-token <token_adresi> --wallets 10-30
```

## Güvenlik Notları

- Bu script, cüzdan özel anahtarlarını yerel `wallets` klasöründeki `wallets.json` dosyasında saklar. Bu dosyayı güvende tutun ve erişim izinlerini sınırlayın.
- Özel anahtarlarınızı .env dosyasında saklamak güvenli değildir. Bu örnek script eğitim amaçlıdır ve büyük miktarlarda para için kullanılmamalıdır.
- Önemli işlemler için donanım cüzdanı kullanmayı düşünün.

## Özellikler

- ✅ İstediğiniz kadar yeni Solana cüzdanı oluşturma
- ✅ Mevcut cüzdanları silme veya üzerine ekleme seçeneği
- ✅ Harici bir dosyadan cüzdanları içe aktarma
- ✅ Tüm cüzdanları veya seçilen cüzdanları listeleme
- ✅ Cüzdan bakiyelerini kontrol etme (SOL ve SPL token)
- ✅ Ana cüzdandan seçilen cüzdanlara SOL transfer etme
- ✅ Ana cüzdandan seçilen cüzdanlara SPL token transfer etme
- ✅ Tek işlemde çoklu cüzdanlara SOL ve SPL token gönderme
- ✅ Tüm veya seçilen cüzdanlardan ana cüzdana SOL toplama
- ✅ Tüm veya seçilen cüzdanlardan ana cüzdana SPL token toplama 