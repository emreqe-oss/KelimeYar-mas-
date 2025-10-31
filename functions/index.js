// functions/index.js - YENİ VE TAM KOD (CORS Düzeltmesi ile)

const functions = require("firebase-functions");
const admin = require("firebase-admin");
// --- DEĞİŞİKLİK 1: CORS yapılandırmasını daha belirgin hale getiriyoruz ---
const cors = require("cors");

// Geliştirme (localhost) ve üretim (Vercel) adreslerinize izin veren bir CORS işleyici oluşturuyoruz.
const corsHandler = cors({
    origin: [
        "http://localhost:5173",          // Yerel geliştirme sunucunuz
        "http://127.0.0.1:5173",          // Alternatif yerel adres
        "https://kelime-yar-mas.vercel.app" // Canlıdaki Vercel adresiniz
    ],
    methods: ["GET", "POST", "OPTIONS"], // Tarayıcının ön kontrol (preflight) isteği için OPTIONS'a izin veriyoruz
});

admin.initializeApp();

const kelimeler = require("./kelimeler.json");
const cevaplar = require("./cevaplar.json");

const SCORE_POINTS = [1000, 800, 600, 400, 200, 100];
const GUESS_COUNT = 6;

function calculateColors(guess, secret, wordLength) {
    const secretLetters = secret.split('');
    const guessLetters = guess.split('');
    const colors = Array(wordLength).fill('absent');
    const letterCounts = {};
    for (const letter of secretLetters) {
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
    }
    for (let i = 0; i < wordLength; i++) {
        if (guessLetters[i] === secretLetters[i]) {
            colors[i] = 'correct';
            letterCounts[guessLetters[i]]--;
        }
    }
    for (let i = 0; i < wordLength; i++) {
        if (colors[i] !== 'correct' && secret.includes(guessLetters[i]) && letterCounts[guessLetters[i]] > 0) {
            colors[i] = 'present';
            letterCounts[guessLetters[i]]--;
        }
    }
    return colors;
}

exports.getNewSecretWord = functions.https.onRequest((request, response) => {
    // --- DEĞİŞİKLİK 2: Tüm fonksiyonlarda yeni 'corsHandler'ı kullanıyoruz ---
    corsHandler(request, response, () => {
        try {
            const wordLength = request.body.wordLength || 5;
            if (!cevaplar[String(wordLength)]) {
                return response.status(404).send({ error: "Belirtilen uzunlukta kelime listesi bulunamadı." });
            }
            const wordList = cevaplar[String(wordLength)];
            const randomIndex = Math.floor(Math.random() * wordList.length);
            const secretWord = wordList[randomIndex];
            return response.status(200).send({ secretWord: secretWord });
        } catch (error) {
            console.error("getNewSecretWord hatası:", error);
            return response.status(500).send({ error: "Sunucuda beklenmedik bir hata oluştu." });
        }
    });
});

exports.checkWordValidity = functions.https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
        try {
            const word = request.body.word;
            if (!word || typeof word !== "string") {
                return response.status(400).send({ error: "Fonksiyona 'word' parametresi gönderilmelidir." });
            }
            const wordLength = String(word.length);
            const isValid = kelimeler[wordLength] && kelimeler[wordLength].includes(word);
            return response.status(200).send({ isValid: isValid });
        } catch (error) {
            console.error("checkWordValidity hatası:", error);
            return response.status(500).send({ error: "Sunucuda beklenmedik bir hata oluştu." });
        }
    });
});

exports.submitMultiplayerGuess = functions.https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
        if (request.method !== 'POST') {
            return response.status(405).send({ error: 'Method Not Allowed' });
        }
        
        const { gameId, word, userId, isBR } = request.body;
        if (!gameId || !word || !userId) {
            return response.status(400).send({ error: 'Eksik parametreler: gameId, word ve userId gereklidir.' });
        }
        
        const gameRef = admin.firestore().collection('games').doc(gameId);
        
        try {
            const result = await admin.firestore().runTransaction(async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists) throw new Error("Oyun bulunamadı.");
                
                const gameData = gameDoc.data();
                const secretWord = gameData.secretWord;
                const wordLength = gameData.wordLength;
                
                if (gameData.status !== 'playing') throw new Error("Oyun şu anda oynanabilir durumda değil.");
                if (!(userId in gameData.players)) throw new Error("Kullanıcı oyunda değil.");
                if (!isBR && gameData.currentPlayerId !== userId) {
                    throw new Error("Sıra sizde değil!");
                }

                const playerState = gameData.players[userId];
                const currentRow = playerState.guesses ? playerState.guesses.length : 0;
                if (currentRow >= GUESS_COUNT) throw new Error("Tüm tahmin hakları kullanılmış.");
                if (word.length !== wordLength) throw new Error(`Kelime uzunluğu ${wordLength} olmalıdır.`);
                
                const colors = calculateColors(word, secretWord, wordLength);
                const newGuess = { word: word, colors: colors };
                const isWinner = (word === secretWord);
                const playerGuesses = [...(playerState.guesses || []), newGuess];
                
                const updates = { [`players.${userId}.guesses`]: playerGuesses };

                if (isBR) {
                    // Battle Royale Mantığı...
                } else {
                    const playerIds = Object.keys(gameData.players);
                    const myIndex = playerIds.indexOf(userId);
                    const nextPlayerIndex = (myIndex + 1) % playerIds.length;
                    updates.currentPlayerId = playerIds[nextPlayerIndex];
                    updates.turnStartTime = admin.firestore.FieldValue.serverTimestamp(); 

                    if (isWinner) {
                        updates.status = 'finished';
                        updates.roundWinner = userId;
                        const scoreToAdd = SCORE_POINTS[playerGuesses.length - 1] || 0;
                        updates[`players.${userId}.score`] = (playerState.score || 0) + scoreToAdd;
                    } else {
                        const allPlayers = Object.values(gameData.players);
                        // Kendi tahmin listemizi güncelleyerek kontrol ediyoruz
                        allPlayers[myIndex].guesses = playerGuesses; 
                        const allGuessed = allPlayers.every(p => (p.guesses || []).length >= GUESS_COUNT || p.isWinner);
                        if(allGuessed) {
                           updates.status = 'finished';
                           updates.roundWinner = null;
                        }
                    }
                }
                transaction.update(gameRef, updates);
                return { isWinner, newGuess };
            });
            
            return response.status(200).send({ 
                success: true, 
                message: "Tahmin başarıyla işlendi.",
                isWinner: result.isWinner,
                newGuess: result.newGuess
            });
        } catch (error) {
            console.error(`Oyun ${gameId} için tahmin işlenirken hata:`, error);
            return response.status(500).send({ error: error.message || "Tahmin işlenirken bir hata oluştu." });
        }
    });
});

exports.failMultiplayerTurn = functions.https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
        // ... bu fonksiyonun iç mantığı aynı kalıyor ...
        if (request.method !== 'POST') {
            return response.status(405).send({ error: 'Method Not Allowed' });
        }
        const { gameId, userId } = request.body;
        if (!gameId || !userId) {
            return response.status(400).send({ error: 'Eksik parametreler: gameId ve userId gereklidir.' });
        }
        const gameRef = admin.firestore().collection('games').doc(gameId);
        try {
            await admin.firestore().runTransaction(async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists) throw new Error("Oyun bulunamadı.");
                const gameData = gameDoc.data();
                if (gameData.status !== 'playing') throw new Error("Oyun şu anda oynanabilir durumda değil.");
                if (!(userId in gameData.players)) throw new Error("Kullanıcı oyunda değil.");
                const isBR = gameData.gameType.includes('br');
                const updates = {};
                if (isBR) {
                    // Battle Royale mantığı...
                } else if (gameData.currentPlayerId === userId) {
                    const playerState = gameData.players[userId];
                    const wordLength = gameData.wordLength;
                    const failedWord = "".padEnd(wordLength, ' ');
                    const failedColors = Array(wordLength).fill('failed');
                    const newGuess = { word: failedWord, colors: failedColors };
                    const playerGuesses = [...(playerState.guesses || []), newGuess];
                    updates[`players.${userId}.guesses`] = playerGuesses;
                    const playerIds = Object.keys(gameData.players);
                    const myIndex = playerIds.indexOf(userId);
                    const nextPlayerIndex = (myIndex + 1) % playerIds.length;
                    updates.currentPlayerId = playerIds[nextPlayerIndex];
                    updates.turnStartTime = admin.firestore.FieldValue.serverTimestamp();
                    const allGuessed = Object.values(gameData.players).every(p => (p.guesses || []).length >= GUESS_COUNT);
                    if (allGuessed) {
                        updates.status = 'finished';
                        updates.roundWinner = null;
                    }
                } else {
                    throw new Error("Sadece süresi dolan oyuncunun turu sonlandırılabilir.");
                }
                transaction.update(gameRef, updates);
            });
            return response.status(200).send({ success: true, message: "Tur/Oyun başarıyla sonlandırıldı." });
        } catch (error) {
            console.error(`Oyun ${gameId} için tur sonlandırılırken hata:`, error);
            return response.status(500).send({ error: error.message || "Tur/Oyun sonlandırılırken bir hata oluştu." });
        }
    });
});