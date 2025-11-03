// scrape_meanings.js - TDK ENGELLEMESİ GİDERİLMİŞ SON KOD

import fs from 'fs/promises'; 
import path from 'path';
import fetch from 'node-fetch'; 
import { fileURLToPath } from 'url';

// Node.js'in __dirname/require yapısını taklit eden yardımcı değişkenler
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// TDK'nın sorgu API'si
const TDK_API_URL = "https://sozluk.gov.tr/gts?ara=";

// API'yi yormamak için her istek arasında 1 saniye (1000 ms) bekliyoruz.
const delay = 1000; 
const outputPath = path.join(__dirname, 'functions', 'kelime_anlamlari.json');


// Kelime listelerini 'functions/kelimeler.json' dosyasından async olarak okur.
async function getWordsFromFile() {
    const kelimelerPath = path.join(__dirname, 'functions', 'kelimeler.json');
    try {
        const data = await fs.readFile(kelimelerPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("❌ HATA: 'kelimeler.json' dosyası yüklenemedi. Yol veya dosya içeriği doğru mu?");
        return {};
    }
}

// JSON yapısından tüm kelimeleri tek bir Set'e toplar.
function getAllWords(kelimelerListesi) {
    const allWords = new Set();
    for (const length in kelimelerListesi) {
        kelimelerListesi[length].forEach(word => {
            allWords.add(word.toUpperCase('tr-TR'));
        });
    }
    return Array.from(allWords);
}

// TDK API'sinden tek bir kelimenin anlamını çeker.
async function fetchMeaningFromTDK(word) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36'
        };

        const response = await fetch(`${TDK_API_URL}${word.toLocaleLowerCase("tr-TR")}`, { headers });
        
        if (!response.ok) {
            console.log(`   [HATA] TDK API ${word} için yanıt vermiyor: ${response.status}`);
            return null;
        }
        
        const data = await response.json();

        if (data.error) {
            console.log(`   [HATA] TDK, ${word} için anlam bulamadı.`);
            return null;
        }

        const meaning = data[0]?.anlamlarListe?.[0]?.anlam;

        if (meaning) {
            console.log(`   [BAŞARILI] Anlam: ${meaning.substring(0, 50)}...`);
            return meaning;
        }

        return null;

    } catch (error) {
        console.error(`[KRİTİK HATA] ${word} kelimesi çekilemedi:`, error.message);
        return null; 
    }
}

// Ana Çalıştırma Fonksiyonu
async function main() {
    const kelimeler = await getWordsFromFile();
    if (Object.keys(kelimeler).length === 0) {
        console.log("❌ İşlem iptal edildi: Kelime listesi boş veya yüklenemedi.");
        return;
    }
    
    const wordsToScrape = getAllWords(kelimeler);
    let wordMeanings = {};

    try {
        // Devam etme mantığı: Mevcut dosyayı okumaya çalış
        const existingData = await fs.readFile(outputPath, 'utf-8');
        wordMeanings = JSON.parse(existingData);
        console.log(`\n✅ Devam Ediliyor: Dosyadan ${Object.keys(wordMeanings).length} anlam yüklendi.`);
    } catch (e) {
        console.log("\n⚠️ Devam Etme Verisi Bulunamadı veya Bozuk. Sıfırdan Başlanıyor.");
    }

    console.log(`\n⏳ Başlıyor: Toplam ${wordsToScrape.length} benzersiz kelime var. (Tahmini Süre: ${Math.ceil(wordsToScrape.length * delay / 1000 / 60)} dakika)`);

    for (let i = 0; i < wordsToScrape.length; i++) {
        const word = wordsToScrape[i];
        
        // Zaten çekilmişse atla
        if (word in wordMeanings) {
            continue; 
        }

        const progress = ((i / wordsToScrape.length) * 100).toFixed(1);
        process.stdout.write(`\r[${progress}%] İşleniyor: ${word} (${i + 1}/${wordsToScrape.length})`);

        const meaning = await fetchMeaningFromTDK(word);
        
        if (meaning) {
            wordMeanings[word] = meaning;
            
            // Her 50 kelimede bir dosyaya yedek olarak kaydet (Güvenlik için)
            if (Object.keys(wordMeanings).length % 50 === 0) {
                 await fs.writeFile(outputPath, JSON.stringify(wordMeanings, null, 2), 'utf-8');
                 process.stdout.write(`\n--- 50 kelimede bir yedeklendi. Devam ediliyor. ---`);
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Sonucu functions/kelime_anlamlari.json'a kaydetme
    try {
        await fs.writeFile(outputPath, JSON.stringify(wordMeanings, null, 2), 'utf-8');
        console.log(`\n\n✅ Başarılı! Toplam ${Object.keys(wordMeanings).length} kelime anlamı:\n${outputPath} adresine kaydedildi.`);
    } catch (e) {
        console.error("\n❌ [KAYIT HATASI] JSON dosyası yazılamadı:", e);
    }
}

main();