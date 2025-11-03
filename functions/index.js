// functions/index.js - BR MANTIK KONTROLLERİ YAPILMIŞ SON KOD

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors");

// CORS Yapılandırması: İzin verilen adresler
const corsHandler = cors({
    origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://kelime-yar-mas.vercel.app" 
    ],
    methods: ["GET", "POST", "OPTIONS"], 
});

admin.initializeApp();

// Kelime listelerini yerel olarak içeri aktarıyoruz.
const kelimeler = require("./kelimeler.json");
const cevaplar = require("./cevaplar.json");
// const kelimeAnlamlari = require("./kelime_anlamlari.json"); 

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

// 1. Yeni Gizli Kelime Çekme
exports.getNewSecretWord = functions.https.onRequest((request, response) => {
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

// 2. Kelime Geçerliliğini Kontrol Etme
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

// 3. Kelime Anlamı Çekme (Şimdilik Kapalı/Bakımda)
exports.getWordMeaning = functions.https.onRequest((request, response) => {
    corsHandler(request, response, () => {
        return response.status(200).send({ success: false, meaning: "Anlam çekme özelliği şu an bakımda." });
    });
});

// 4. Çoklu Oyuncu Tahmini Gönderme
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

                const playerState = gameData.players[userId];
                const currentRow = playerState.guesses ? playerState.guesses.length : 0;
                
                if (playerState.isWinner || playerState.isEliminated || currentRow >= GUESS_COUNT) {
                    throw new Error("Tahmin hakkınız kalmamış.");
                }

                if (!isBR && gameData.currentPlayerId !== userId) {
                    throw new Error("Sıra sizde değil!");
                }
                
                if (word.length !== wordLength) throw new Error(`Kelime uzunluğu ${wordLength} olmalıdır.`);
                
                const colors = calculateColors(word, secretWord, wordLength);
                const newGuess = { word: word, colors: colors };
                const isWinner = (word === secretWord);
                const playerGuesses = [...(playerState.guesses || []), newGuess];
                
                const updates = { [`players.${userId}.guesses`]: playerGuesses };

                // =======================================================
                // --- BATTLE ROYALE (BR) MANTIĞI ---
                // =======================================================
                if (isBR) {
                    
                    if (isWinner) {
                        updates.status = 'finished'; // Kazanma durumunda tur hemen biter
                        updates.roundWinner = userId;
                        updates[`players.${userId}.isWinner`] = true;

                        const scoreToAdd = SCORE_POINTS[playerGuesses.length - 1] || 0;
                        updates[`players.${userId}.score`] = (playerState.score || 0) + scoreToAdd + 500; 
                        
                    } else if (playerGuesses.length >= GUESS_COUNT) {
                        updates[`players.${userId}.isEliminated`] = true; // 6 hak bitti, elendi
                    }
                    
                    const allPlayers = Object.values(gameData.players);
                    
                    // Geçici olarak güncel durumu al
                    const currentStatusPlayers = allPlayers.map(p => {
                        return (p.userId === userId) ? {...p, guesses: playerGuesses, isEliminated: updates[`players.${userId}.isEliminated`], isWinner: updates[`players.${userId}.isWinner`]} : p;
                    });

                    const winners = currentStatusPlayers.filter(p => p.isWinner);
                    const activePlayers = currentStatusPlayers.filter(p => !p.isWinner && !p.isEliminated);
                    const allFinished = currentStatusPlayers.every(p => p.isWinner || p.isEliminated);

                    // Tur Bitiş Koşulları:
                    // Kural 1: Biri kazandıysa tur hemen biter.
                    // Kural 2: Kalan aktif kişi 1 veya 0 ise tur biter.
                    if (winners.length >= 1 || activePlayers.length <= 1) { 
                        updates.status = 'finished';
                        
                        // KAZANANI BELİRLEME MANTIĞI:
                        if (winners.length >= 1) {
                            updates.roundWinner = winners[0].userId; // İlk kazananı al
                        } else if (activePlayers.length === 1) {
                            const lastPlayer = activePlayers[0];
                            // Kalan son kişi EN AZ 1 TAHMİN yapmışsa kazansın
                            if ((lastPlayer.guesses || []).length > 0) { 
                                updates.roundWinner = lastPlayer.userId;
                                updates[`players.${lastPlayer.userId}.isWinner`] = true;
                                updates[`players.${lastPlayer.userId}.score`] = (lastPlayer.score || 0) + 1000;
                            } else {
                                updates.roundWinner = null; // Tahmin yapmadı, berabere.
                            }
                        } else {
                            updates.roundWinner = null; // Kimse kazanamadı (Berabere)
                        }
                    } else {
                        // KURAL: 6 hakkını dolduran elenir, diğerleri SÜRE dolana kadar devam eder.
                    }

                } 
                // =======================================================
                // --- SIRALI MULTIPLAYER MANTIĞI ---
                // =======================================================
                else { 
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

// 5. Çoklu Oyuncu Turunu/Süresini Sonlandırma
exports.failMultiplayerTurn = functions.https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
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
                
                // =======================================================
                // --- BATTLE ROYALE (BR) TUR BİTİRME MANTIĞI (SÜRE BİTİMİ) ---
                // =======================================================
                if (isBR) {
                    const playerState = gameData.players[userId];
                    
                    if (playerState.isEliminated || playerState.isWinner) {
                        return;
                    }
                    
                    // Süre dolduğunda tur bitmeli ve berabere sayılmalı
                    updates.status = 'finished';
                    updates.roundWinner = null; // Süre doldu, kimse kazanamadı.
                } 
                // =======================================================
                // --- SIRALI MULTIPLAYER TUR BİTİRME MANTIĞI ---
                // =======================================================
                else if (gameData.currentPlayerId === userId) {
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