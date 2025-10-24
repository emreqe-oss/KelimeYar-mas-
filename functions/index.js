// functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});

admin.initializeApp();

const kelimeler = require("./kelimeler.json");
const cevaplar = require("./cevaplar.json");

// ========================================================================
// SON DÜZELTME: Bu fonksiyonu da 'onRequest' olarak değiştiriyoruz.
// Böylece istemci ile sunucu arasındaki tüm 'callable' uyumsuzluk sorunları
// tamamen ortadan kalkacak.
// ========================================================================
exports.getNewSecretWord = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    try {
      const wordLength = request.body.wordLength || 5;
      console.log(`HTTP isteği ile kelime isteniyor. Uzunluk: ${wordLength}`);

      if (!cevaplar[String(wordLength)]) {
        console.error(`İstenen uzunlukta (${wordLength}) kelime listesi yok.`);
        response.status(404).send({ error: "Belirtilen uzunlukta kelime listesi bulunamadı." });
        return;
      }

      const wordList = cevaplar[String(wordLength)];
      const randomIndex = Math.floor(Math.random() * wordList.length);
      const secretWord = wordList[randomIndex];

      console.log(`Yeni oyun için ${wordLength} harfli kelime seçildi: ${secretWord}`);
      response.status(200).send({ secretWord: secretWord });

    } catch (error) {
      console.error("getNewSecretWord içinde beklenmedik hata:", error);
      response.status(500).send({ error: "Sunucuda beklenmedik bir hata oluştu." });
    }
  });
});

exports.checkWordValidity = functions.https.onRequest((request, response) => {
  cors(request, response, async () => {
    try {
      const word = request.body.word;
      console.log(`HTTP isteği ile kelime kontrol ediliyor: "${word}"`);

      if (!word || typeof word !== "string") {
        response.status(400).send({ error: "Fonksiyona 'word' parametresi gönderilmelidir." });
        return;
      }
      
      const wordLength = String(word.length);
      const isValid = kelimeler[wordLength] && kelimeler[wordLength].includes(word);
      
      console.log(`Kontrol sonucu: ${isValid}`);
      response.status(200).send({ isValid: isValid });

    } catch (error) {
      console.error("checkWordValidity içinde beklenmedik hata:", error);
      response.status(500).send({ error: "Sunucuda beklenmedik bir hata oluştu." });
    }
  });
});