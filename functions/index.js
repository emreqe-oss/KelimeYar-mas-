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

// Yardımcı Fonksiyon: Cloud Function'dan kelime çekmek için (index.js içinde tanımlı)
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
                
                if (playerState.isEliminated || playerState.hasSolved || currentRow >= GUESS_COUNT) {
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
                
                // =======================================================
                // --- BATTLE ROYALE (BR) MANTIĞI (GÜNCELLENMİŞ) ---
                // =======================================================
                if (isBR) {
                    
                    if (isWinner) {
                        // Yeni Mantık: Kelimeyi bilen oyuncu bir sonraki kelimeye geçmeye hak kazanır.
                        updates[`players.${userId}.hasSolved`] = true; // Yeni durum: Kelimeyi çözdü
                        updates[`players.${userId}.isWinner`] = true; // Turu kazanan olarak işaretle (Client için)

                        // Kazandığı tur için skor eklenir
                        const scoreToAdd = (SCORE_POINTS[playerGuesses.length - 1] || 0) + 500;
                        updates[`players.${userId}.score`] = (playerState.score || 0) + scoreToAdd; 
                        
                    } else if (playerGuesses.length >= GUESS_COUNT) {
                        // 6 hakkı bitti, ELENİR.
                        updates[`players.${userId}.isEliminated`] = true;
                    }
                    
                    const currentPlayers = Object.entries(gameData.players).map(([id, p]) => {
                        let tempP = {...p, id};
                        if (id === userId) {
                            tempP.guesses = playerGuesses;
                            tempP.isEliminated = updates[`players.${userId}.isEliminated`] || p.isEliminated;
                            tempP.hasSolved = updates[`players.${userId}.hasSolved`] || p.hasSolved;
                            tempP.isWinner = updates[`players.${userId}.isWinner`] || p.isWinner;
                        }
                        return tempP;
                    });
    
                    const activePlayers = currentPlayers.filter(p => !p.isEliminated && !p.hasSolved);
                    
                    // Tur Bitiş Kontrolü (Sadece tüm aktif oyuncular ya çözdü ya da elendiyse biter)
                    if (activePlayers.length === 0) { 
                        updates.status = 'finished';

                        const solvedPlayers = currentPlayers.filter(p => p.hasSolved);
                        
                        if (solvedPlayers.length > 0) {
                            // En yüksek puanlı çözeni tur kazananı yap (Bu, client'ta Skor Tablosunu tetikler)
                            const sortedWinners = solvedPlayers.sort((a, b) => (b.score || 0) - (a.score || 0));
                            updates.roundWinner = sortedWinners[0].id; 
                            
                        } else {
                            // Kimse çözemedi, tur berabere biter.
                            updates.roundWinner = null; 
                        }

                    } 
                    // ÖNEMLİ: Eğer aktif oyuncu kaldıysa (activePlayers.length > 0), 
                    // oyunun durumu 'playing' kalmalı ve süre bitimi beklenmelidir.

                } 
                // =======================================================
                // --- SIRALI MULTIPLAYER MANTIĞI (AYNI) ---
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
                // --- BATTLE ROYALE (BR) TUR BİTİRME MANTIĞI (SÜRE BİTİMİ) (GÜNCELLENMİŞ) ---
                // =======================================================
                if (isBR) {
                    
                    // Süre dolduğunda, turu bitirip elenme kararını tetikleriz.
                    updates.status = 'finished';
                    updates.roundWinner = null; // Süre bittiğinde turu kimse kazanmaz
                    
                    // Turu çözmüş biri var mı kontrol et (Skor tablosu için)
                    const solvedPlayers = Object.entries(gameData.players).filter(([id, p]) => p.hasSolved);
                    
                    if (solvedPlayers.length > 0) {
                        const sortedWinners = solvedPlayers.map(([id, p]) => ({ id, ...p })).sort((a, b) => (b.score || 0) - (a.score || 0));
                        updates.roundWinner = sortedWinners[0].id; 
                    } 
                    
                } 
                // =======================================================
                // --- SIRALI MULTIPLAYER TUR BİTİRME MANTIĞI (AYNI) ---
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

// 6. Battle Royale Sonraki Turu Başlatma/Maçı Bitirme (GÜNCELLENMİŞ FONKSİYON)
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
                if (gameData.status !== 'finished') throw new Error("Tur henüz bitmedi, bir sonraki tur başlatılamaz.");

                const allPlayers = Object.entries(gameData.players).map(([id, data]) => ({ id, ...data }));
                
                // 1. Eleme İşlemi (hasSolved olmayanlar elenir)
                let remainingPlayers = allPlayers.filter(p => !p.isEliminated);
                
                remainingPlayers.forEach(p => {
                    if (!p.hasSolved && !p.isEliminated) {
                        gameData.players[p.id].isEliminated = true;
                    }
                });

                // Eleme sonrası kalan oyuncular (Yeni turda oynayacaklar)
                const finalActivePlayers = allPlayers.filter(p => !gameData.players[p.id].isEliminated);
                
                const updates = {};
                updates.players = gameData.players; // Elenme durumu güncellendi
                
                // 2. Maç Bitişi Kontrolü
                // Tek bir oyuncu kaldıysa, o maçın galibidir ve MAÇ BİTER.
                if (finalActivePlayers.length === 1) {
                    updates.status = 'finished'; 
                    updates.matchWinnerId = finalActivePlayers[0].id;
                    updates.roundWinner = updates.matchWinnerId; 
                    
                    transaction.update(gameRef, updates);
                    return;

                } 
                
                // Kimse kalmadıysa MAÇ BİTER (Berabere Bitiş)
                if (finalActivePlayers.length === 0) { 
                    updates.status = 'finished'; 
                    updates.matchWinnerId = null; 
                    updates.roundWinner = null; 
                    
                    transaction.update(gameRef, updates);
                    return;
                }
                
                // BURAYA ULAŞILDI İSE: finalActivePlayers.length > 1 (Berabere durumunda yeni tura geçmeliyiz)

                // 3. Yeni Tur Başlatma
                const newWordLength = gameData.wordLength; 
                const newSecretWord = await getNewSecretWordFromLocal(newWordLength); 
                
                if (!newSecretWord) throw new Error("Yeni kelime alınamadı.");
                
                updates.status = 'playing'; // Tekrar oynuyor durumuna geri dön
                updates.wordLength = newWordLength;
                updates.secretWord = newSecretWord;
                updates.currentRound = (gameData.currentRound || 0) + 1;
                updates.turnStartTime = admin.firestore.FieldValue.serverTimestamp();
                updates.roundWinner = null;
                updates.matchWinnerId = null; // Maç devam ettiği için sıfırla

                // Elenmeyen oyuncuların tahmin haklarını ve çözücü bayrağını sıfırla
                finalActivePlayers.forEach(p => {
                    updates.players[p.id].guesses = [];
                    updates.players[p.id].hasSolved = false; 
                    updates.players[p.id].isWinner = false; 
                });
                
                transaction.update(gameRef, updates);
            });
            
            return response.status(200).send({ success: true, message: "Sonraki tura geçildi." });
            
        } catch (error) {
            console.error(`Oyun ${gameId} için tur geçişi/bitişi işlenirken hata:`, error);
            return response.status(500).send({ error: error.message || "Tur geçişi sırasında bir hata oluştu." });
        }
    });
});