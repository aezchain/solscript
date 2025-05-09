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
RPC_ENDPOINT=https://api.devnet.solana.com
```

**Not:** Özel anahtarınızı Base58 formatında belirtmeniz gerekiyor. Phantom gibi bir cüzdan kullanıyorsanız, özel anahtarı dışa aktarabilir ve bu formatta kullanabilirsiniz.

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

# Tüm cüzdanların belirli bir SPL token bakiyesini göster
node index.js balance --token <token_adresi>
```

### SOL Gönderme

```bash
# Tüm cüzdanlara 0.1 SOL gönder
node index.js send-sol 0.1

# Sadece 2. ve 4. cüzdanlara 0.05 SOL gönder
node index.js send-sol 0.05 --wallets 2,4
```

### SPL Token Gönderme

```bash
# Tüm cüzdanlara 10 token gönder
node index.js send-token <token_adresi> 10

# Sadece 1., 3. ve 5. cüzdanlara 5 token gönder
node index.js send-token <token_adresi> 5 --wallets 1,3,5
```

### Tek İşlemde Çoklu Gönderim (Send-to-All)

```bash
# Tüm cüzdanlara tek işlemde 0.1 SOL gönder
node index.js send-to-all-sol 0.1

# Sadece 2. ve 4. cüzdanlara tek işlemde 0.05 SOL gönder
node index.js send-to-all-sol 0.05 --wallets 2,4

# Tüm cüzdanlara tek işlemde 10 token gönder
node index.js send-to-all-token <token_adresi> 10

# Sadece 1., 3. ve 5. cüzdanlara tek işlemde 5 token gönder
node index.js send-to-all-token <token_adresi> 5 --wallets 1,3,5
```

**Not:** Send-to-all komutları tüm transferleri tek bir işlemde gerçekleştirir, bu da gas ücretlerinden tasarruf sağlar. Ancak, çok sayıda cüzdan için işlem boyutu sınırlamaları nedeniyle hata alabilirsiniz. Bu durumda daha az cüzdana gönderim yapmayı deneyin veya normal send komutlarını kullanın.

### SOL Toplama

```bash
# Tüm cüzdanlardan SOL'leri ana cüzdana topla
node index.js collect-sol

# Sadece 2. ve 3. cüzdanlardan SOL'leri topla
node index.js collect-sol --wallets 2,3

# Tüm cüzdanlardan SOL'leri topla, her cüzdanda 0.01 SOL bırak
node index.js collect-sol --leave 0.01
```

### SPL Token Toplama

```bash
# Tüm cüzdanlardan belirli bir token'ı ana cüzdana topla
node index.js collect-token <token_adresi>

# Sadece 1. ve 4. cüzdanlardan token'ları topla
node index.js collect-token <token_adresi> --wallets 1,4
```

## Güvenlik Notları

- Bu script, cüzdan özel anahtarlarını yerel `wallets` klasöründeki `wallets.json` dosyasında saklar. Bu dosyayı güvende tutun ve erişim izinlerini sınırlayın.
- Özel anahtarlarınızı .env dosyasında saklamak güvenli değildir. Bu örnek script eğitim amaçlıdır ve büyük miktarlarda para için kullanılmamalıdır.
- Önemli işlemler için donanım cüzdanı kullanmayı düşünün.

## Özellikler

- ✅ İstediğiniz kadar yeni Solana cüzdanı oluşturma
- ✅ Tüm cüzdanları veya seçilen cüzdanları listeleme
- ✅ Cüzdan bakiyelerini kontrol etme (SOL ve SPL token)
- ✅ Ana cüzdandan seçilen cüzdanlara SOL transfer etme
- ✅ Ana cüzdandan seçilen cüzdanlara SPL token transfer etme
- ✅ Tek işlemde çoklu cüzdanlara SOL ve SPL token gönderme
- ✅ Tüm veya seçilen cüzdanlardan ana cüzdana SOL toplama
- ✅ Tüm veya seçilen cüzdanlardan ana cüzdana SPL token toplama 