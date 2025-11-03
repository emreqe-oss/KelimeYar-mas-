// clean_words.js - Kelimeler.json ve Cevaplar.json dosyalarından anlamı olmayanları silen betik

import fs from 'fs/promises';
import path from 'path';

// Dosya yolları
const KELIMELER_YOLU = path.join(process.cwd(), 'functions', 'kelimeler.json');
const CEVAPLAR_YOLU = path.join(process.cwd(), 'functions', 'cevaplar.json');
const ANLAMLAR_YOLU = path.join(process.cwd(), 'functions', 'kelime_anlamlari.json');

/**
 * Belirtilen dosyadan veriyi okur ve JSON olarak döner.
 */
async function loadJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // Hata durumunda boş obje döndür (özellikle anlam dosyası için)
        return {}; 
    }
}

/**
 * Belirtilen dosyayı temizler ve güncellenmiş listeyi kaydeder.
 */
async function processAndSaveFile(filePath, dosyaAdi, anlamliKelimelerSet) {
    const tumKelimelerObj = await loadJsonFile(filePath);

    if (Object.keys(tumKelimelerObj).length === 0) {
        console.log(`⚠️ ${dosyaAdi} boş veya yüklenemedi. Atlanıyor.`);
        return { total: 0, removed: 0 };
    }

    const yeniKelimelerObj = {};
    let silinenKelimeSayisi = 0;
    let toplamKelimeSayisi = 0;

    // Uzunluk gruplarını döngüye al
    for (const uzunluk in tumKelimelerObj) {
        const eskiListe = tumKelimelerObj[uzunluk];
        const yeniListe = [];

        eskiListe.forEach(kelime => {
            toplamKelimeSayisi++;
            const buyukKelime = kelime.toUpperCase('tr-TR');
            
            // Eğer kelime, anlamı olan kelimeler setinde VAR ise, listeye ekle.
            if (anlamliKelimelerSet.has(buyukKelime)) {
                yeniListe.push(kelime); // Orijinal kelimeyi listeye ekle
            } else {
                silinenKelimeSayisi++;
            }
        });

        if (yeniListe.length > 0) {
            yeniKelimelerObj[uzunluk] = yeniListe;
        }
    }

    // Yeni listeyi dosyaya yaz
    try {
        await fs.writeFile(filePath, JSON.stringify(yeniKelimelerObj, null, 2), 'utf-8');
        
        console.log(`✅ ${dosyaAdi} Temizleme Başarılı!`);
        console.log(`   - Silinen kelime sayısı: ${silinenKelimeSayisi}`);
        console.log(`   - Güncel geçerli kelime sayısı: ${toplamKelimeSayisi - silinenKelimeSayisi}`);
        
        return { total: toplamKelimeSayisi, removed: silinenKelimeSayisi };

    } catch (e) {
        console.error(`\n❌ KRİTİK HATA: ${dosyaAdi} kaydedilemedi.`, e);
        return { total: 0, removed: 0 };
    }
}


async function main() {
    console.log("-----------------------------------------");
    console.log("🧹 Kelime Listeleri (Kelimeler & Cevaplar) Temizleme Başlatılıyor...");
    console.log("-----------------------------------------");

    const anlamlarObj = await loadJsonFile(ANLAMLAR_YOLU);
    if (Object.keys(anlamlarObj).length === 0) {
        console.error("❌ KRİTİK HATA: 'kelime_anlamlari.json' dosyası boş veya yüklenemedi. Temizleme iptal edildi.");
        console.log("   Lütfen önce TDK çekiminin başarıyla tamamlandığından emin olun.");
        return;
    }

    const anlamliKelimelerSet = new Set(Object.keys(anlamlarObj));

    // 1. kelimeler.json dosyasını temizle
    await processAndSaveFile(KELIMELER_YOLU, 'kelimeler.json', anlamliKelimelerSet);
    
    // 2. cevaplar.json dosyasını temizle
    await processAndSaveFile(CEVAPLAR_YOLU, 'cevaplar.json', anlamliKelimelerSet);

    console.log("\n✅ Tüm kelime dosyaları anlamı olan kelimelerle senkronize edildi.");
}

main();