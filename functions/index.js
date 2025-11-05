// functions/index.js - GÜNCEL VE TAM KOD (TÜM DÜZELTMELER DAHİL)

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors");

// CORS Yapılandırması
const corsHandler = cors({
    origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://kelime-yar-mas.vercel.app"
    ],
    methods: ["GET", "POST", "OPTIONS"],
});

admin.initializeApp();

const kelimeler = require("./kelimeler.json");
const cevaplar = require("./cevaplar.json");
const SCORE_POINTS = [1000, 800, 600, 400, 200, 100]; // 1. tahminde 1000, 6. tahminde 100
// const kelimeAnlamlari = require("./kelime_anlamlari.json"); 

// const SCORE_POINTS = [1000, 800, 600, 400, 200, 100]; // BR için kaldırıldı
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

async function getNewSecretWordFromLocal(wordLength) {
    try {
        const wordList = cevaplar[String(wordLength)];
        if (!wordList || wordList.length === 0) throw new Error("Belirtilen uzunlukta kelime listesi boş.");
        const randomIndex = Math.floor(Math.random() * wordList.length);
        return wordList[randomIndex];
    } catch (error) {
        console.error("Kelime çekme hatası:", error);
        return null;
    }
}


// 1. Yeni Gizli Kelime Çekme
exports.getNewSecretWord = functions.https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
        try {
            const wordLength = request.body.wordLength || 5;
            const secretWord = await getNewSecretWordFromLocal(wordLength);
            
            if (!secretWord) {
                return response.status(404).send({ error: "Belirtilen uzunlukta kelime listesi bulunamadı veya boş." });
            }
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

// 3. Kelime Anlamı Çekme
exports.getWordMeaning = functions.https.onRequest((request, response) => {
    corsHandler(request, response, () => {
        return response.status(200).send({ success: false, meaning: "Anlam çekme özelliği şu an bakımda." });
    });
});

// 4. Çoklu Oyuncu Tahmini Gönderme
// functions/index.js içindeki fonksiyonun tamamını bununla değiştirin

// 4. Çoklu Oyuncu Tahmini Gönderme (PUANLAMA EKLENDİ)
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
                
                if (playerState.isEliminated || playerState.hasSolved || playerState.hasFailed || currentRow >= GUESS_COUNT) {
                    throw new Error("Tahmin hakkınız kalmamış veya elenmiş/çözmüşsünüz.");
                }

                if (!isBR && gameData.currentPlayerId !== userId) {
                    throw new Error("Sıra sizde değil!");
                }
                
                if (word.length !== wordLength) throw new Error(`Kelime uzunluğu ${wordLength} olmalıdır.`);
                
                const colors = calculateColors(word, secretWord, wordLength);
                const newGuess = { word: word, colors: colors };
                const playerGuesses = [...(playerState.guesses || []), newGuess];
                
                const updates = { [`players.${userId}.guesses`]: playerGuesses };
                let isWinner = (word === secretWord);
                
                if (isBR) {
                    // ... (Mevcut BR Puanlama/Durum Mantığı - Değişiklik Yok)
                    if (isWinner) {
                        updates[`players.${userId}.hasSolved`] = true;
                        updates[`players.${userId}.isWinner`] = true;
                    } else if (playerGuesses.length >= GUESS_COUNT) {
                        updates[`players.${userId}.hasFailed`] = true; 
                    }
                    
                    // ... (Mevcut BR Kalan Oyuncu Kontrolü - Değişiklik Yok)
                    const currentPlayers = Object.entries(gameData.players).map(([id, p]) => {
                        let tempP = {...p, id};
                        if (id === userId) {
                            tempP.guesses = playerGuesses;
                            tempP.isEliminated = p.isEliminated; 
                            tempP.hasSolved = updates[`players.${userId}.hasSolved`] || p.hasSolved;
                            tempP.isWinner = updates[`players.${userId}.isWinner`] || p.isWinner;
                            tempP.hasFailed = updates[`players.${userId}.hasFailed`] || p.hasFailed; 
                        }
                        return tempP;
                    });
        
                    const activePlayers = currentPlayers.filter(p => !p.isEliminated && !p.hasSolved && !p.hasFailed);
                    
                    if (activePlayers.length === 0) { 
                        updates.status = 'finished';
                        const solvedPlayers = currentPlayers.filter(p => p.hasSolved);
                        
                        if (solvedPlayers.length > 0) {
                            updates.roundWinner = solvedPlayers[0].id; 
                        } else {
                            updates.roundWinner = null; 
                        }
                    } 
                } 
                else { 
                    // === BAŞLANGIÇ: SERİ OYUN (SEQUENTIAL) MANTIĞI ===
                    const playerIds = Object.keys(gameData.players);
                    const myIndex = playerIds.indexOf(userId);
                    const nextPlayerIndex = (myIndex + 1) % playerIds.length;
                    updates.currentPlayerId = playerIds[nextPlayerIndex];
                    updates.turnStartTime = admin.firestore.FieldValue.serverTimestamp(); 

                    if (isWinner) {
                        updates.status = 'finished';
                        updates.roundWinner = userId;
                        
                        // --- YENİ EKLENEN PUANLAMA MANTIĞI ---
                        const guessesCount = playerGuesses.length; // (Örn: 1. tahminde 1)
                        // 'SCORE_POINTS' dizisinden puanı al (diziler 0'dan başlar)
                        const roundScore = SCORE_POINTS[guessesCount - 1] || 0; 
                        const currentScore = playerState.score || 0; // Mevcut puanı al
                        updates[`players.${userId}.score`] = currentScore + roundScore; // Yeni puanı güncelle
                        // --- PUANLAMA MANTIĞI SONU ---

                    } else {
                        const allPlayers = Object.values(gameData.players);
                        allPlayers[myIndex].guesses = playerGuesses; 
                        const allGuessed = allPlayers.every(p => (p.guesses || []).length >= GUESS_COUNT || p.isWinner);
                        if(allGuessed) {
                            updates.status = 'finished';
                            updates.roundWinner = null;
                        }
                    }
                    // === BİTİŞ: SERİ OYUN (SEQUENTIAL) MANTIĞI ===
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
                
                if (gameData.status === 'finished') return; 
                if (gameData.status !== 'playing') throw new Error("Oyun şu anda oynanabilir durumda değil.");
                if (!(userId in gameData.players)) throw new Error("Kullanıcı oyunda değil.");
                
                const isBR = gameData.gameType.includes('br');
                const updates = {};
                
                if (isBR) {
                    
                    updates.status = 'finished';
                    updates.roundWinner = null; 
                    
                    const solvedPlayers = Object.entries(gameData.players).filter(([id, p]) => p.hasSolved);
                    
                    if (solvedPlayers.length > 0) {
                        updates.roundWinner = solvedPlayers[0][0];
                    } 
                    
                } 
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

// 6. Battle Royale Sonraki Turu Başlatma/Maçı Bitirme
exports.startNextBRRound = functions.https.onRequest((request, response) => {
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
                if (gameData.gameType !== 'multiplayer-br') throw new Error("Bu bir Battle Royale oyunu değil.");
                
                // Yarış durumu düzeltmesi
                if (gameData.status !== 'finished') {
                    console.log(`Race condition on ${gameId}. Status is ${gameData.status}. Aborting.`);
                    return; 
                }

                const allPlayers = Object.entries(gameData.players).map(([id, data]) => ({ id, ...data }));
                
                // 1. Kalan oyuncuları bul
                const remainingPlayers = allPlayers.filter(p => !p.isEliminated);
                const remainingPlayerCount = remainingPlayers.length;
                
                // 2. Elenecek oyuncuları bul (çözemeyenler)
                let playersToEliminate = [];
                remainingPlayers.forEach(p => {
                    if (!p.hasSolved) {
                        playersToEliminate.push(p.id);
                    }
                });

                // 3. Beraberlik kontrolü
                const isRoundDraw = (remainingPlayerCount > 1 && playersToEliminate.length === remainingPlayerCount);

                if (!isRoundDraw) {
                    // Normal eleme
                    playersToEliminate.forEach(pid => {
                        if (gameData.players[pid]) {
                            gameData.players[pid].isEliminated = true;
                        }
                    });
                }
                
                // 4. Son durumu hesapla
                const finalActivePlayers = allPlayers.filter(p => !gameData.players[p.id].isEliminated);
                
                const updates = {};
                updates.players = gameData.players; 
                
                // 5. Maç Bitişi Kontrolü
                if (finalActivePlayers.length === 1) {
                    updates.status = 'finished'; 
                    updates.matchWinnerId = finalActivePlayers[0].id;
                    updates.roundWinner = updates.matchWinnerId; 
                    
                    transaction.update(gameRef, updates);
                    return; 
                } 
                
                if (finalActivePlayers.length === 0) { 
                    updates.status = 'finished'; 
                    updates.matchWinnerId = null; // Berabere
                    updates.roundWinner = null; 
                    
                    transaction.update(gameRef, updates);
                    return; 
                }
                
                // 6. Yeni Tur Başlatma (Oyun devam ediyor)
                const newWordLength = gameData.wordLength; 
                const newSecretWord = await getNewSecretWordFromLocal(newWordLength); 
                
                if (!newSecretWord) throw new Error("Yeni kelime alınamadı.");
                
                updates.status = 'playing';
                updates.wordLength = newWordLength;
                updates.secretWord = newSecretWord;
                updates.currentRound = (gameData.currentRound || 0) + 1;
                updates.turnStartTime = admin.firestore.FieldValue.serverTimestamp();
                updates.roundWinner = null;
                updates.matchWinnerId = admin.firestore.FieldValue.delete(); 

                // 7. Bayrakları Sıfırla
                Object.keys(updates.players).forEach(pid => {
                    if (!updates.players[pid].isEliminated) {
                        updates.players[pid].guesses = [];
                    }
                    updates.players[pid].hasSolved = false;
                    updates.players[pid].isWinner = false; 
                    updates.players[pid].hasFailed = false;
                });
                
                transaction.update(gameRef, updates);
            });
            
            return response.status(200).send({ success: true, message: "Tur isteği işlendi." });
            
        } catch (error) {
            console.error(`Oyun ${gameId} için tur geçişi/bitişi işlenirken hata:`, error);
            return response.status(500).send({ error: error.message || "Tur geçişi sırasında bir hata oluştu." });
        }
    });
});