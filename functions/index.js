// functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});

admin.initializeApp();

const kelimeler = require("./kelimeler.json");
const cevaplar = require("./cevaplar.json");

// DÜZELTME: Bu fonksiyon hala onCall olarak kalabilir, çünkü çalışıyor.
exports.getNewSecretWord = functions.https.onCall((data, context) => {
  const wordLength = data.wordLength || 5;
  if (!cevaplar[wordLength]) {
    throw new functions.https.HttpsError("not-found",
        `Belirtilen uzunlukta (${wordLength}) kelime listesi bulunamadı.`);
  }
  const wordList = cevaplar[wordLength];
  const randomIndex = Math.floor(Math.random() * wordList.length);
  const secretWord = wordList[randomIndex];
  console.log(`Yeni oyun için ${wordLength} harfli kelime seçildi: ${secretWord}`);
  return {secretWord: secretWord};
});


// ========================================================================
// NİHAİ DÜZELTME: Fonksiyonu 'onCall' yerine 'onRequest' olarak değiştiriyoruz.
// Bu, Firebase'in tüm sihirli katmanlarını atlayıp doğrudan bir HTTP
// isteği almamızı sağlar. Bu en temel ve en güvenilir yöntemdir.
// ========================================================================
exports.checkWordValidity = functions.https.onRequest((request, response) => {
  // CORS (Cross-Origin Resource Sharing) hatası almamak için bu gereklidir.
  cors(request, response, async () => {
    try {
      // Gelen isteğin içindeki 'body' kısmından 'word'ü alıyoruz.
      const word = request.body.word;
      console.log(`HTTP isteği ile kelime kontrol ediliyor: "${word}"`);

      if (!word || typeof word !== "string") {
        console.error("Geçersiz istek: 'word' parametresi bulunamadı veya string değil.");
        response.status(400).send({ error: "Fonksiyona 'word' parametresi gönderilmelidir." });
        return;
      }
      
      const wordLength = String(word.length);
      const isValid = kelimeler[wordLength] && kelimeler[wordLength].includes(word);
      
      console.log(`Kontrol sonucu: ${isValid}`);
      // İsteği gönderen istemciye sonucu JSON formatında geri gönderiyoruz.
      response.status(200).send({ isValid: isValid });

    } catch (error) {
      console.error("checkWordValidity içinde beklenmedik hata:", error);
      response.status(500).send({ error: "Sunucuda beklenmedik bir hata oluştu." });
    }
  });
});