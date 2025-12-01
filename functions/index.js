/**
 * functions/index.js - TAM DOSYA
 *
 * Bu dosya:
 * 1. Oyun mantığını (kelime kontrolü, sıra değişimi) yönetir.
 * 2. Bildirimleri (Sıra sende, Yeni davet) yönetir.
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");

const admin = require("firebase-admin");
const cors = require("cors");

// Gen 2 Global Ayarlar
setGlobalOptions({ maxInstances: 10 });

// Admin SDK Başlatma
if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Gerekli JSON Dosyaları
const kelimeler = require("./kelimeler.json");
const cevaplar = require("./cevaplar.json");

// Oyun Sabitleri
const SCORE_POINTS = [1000, 800, 600, 400, 200, 100];
const GUESS_COUNT = 6;

// ==================================================================
// YARDIMCI FONKSİYONLAR
// ==================================================================

function calculateColors(guess, secret, wordLength) {
    const secretLetters = secret.split('');
    const guessLetters = guess.split('');
    const colors = Array(wordLength).fill('absent');
    const letterCounts = {};

    for (const letter of secretLetters) {
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
    }

    // Önce yeşilleri (correct) bul
    for (let i = 0; i < wordLength; i++) {
        if (guessLetters[i] === secretLetters[i]) {
            colors[i] = 'correct';
            letterCounts[guessLetters[i]]--;
        }
    }

    // Sonra sarıları (present) bul
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
        if (!wordList || wordList.length === 0) throw new Error("Liste boş.");
        const randomIndex = Math.floor(Math.random() * wordList.length);
        return wordList[randomIndex];
    } catch (error) {
        console.error("Kelime hatası:", error);
        return null;
    }
}

// ==================================================================
// HTTP FONKSİYONLARI (OYUN MANTIĞI)
// ==================================================================

exports.getNewSecretWord = onRequest({ cors: true }, async (request, response) => {
    try {
        const wordLength = request.body.wordLength || 5;
        const secretWord = await getNewSecretWordFromLocal(wordLength);
        if (!secretWord) return response.status(404).send({ error: "Yok" });
        return response.status(200).send({ secretWord });
    } catch (error) {
        return response.status(500).send({ error: "Hata" });
    }
});

exports.checkWordValidity = onRequest({ cors: true }, async (request, response) => {
    try {
        const word = request.body.word;
        if (!word) return response.status(400).send({ error: "Eksik" });
        const wordLength = String(word.length);
        const isValid = kelimeler[wordLength] && kelimeler[wordLength].includes(word);
        return response.status(200).send({ isValid });
    } catch (error) {
        return response.status(500).send({ error: "Hata" });
    }
});

exports.getWordMeaning = onRequest({ cors: true }, (request, response) => {
    // Şimdilik pasif, ileride TDK API eklenebilir.
    return response.status(200).send({ success: false, meaning: "Bakımda." });
});

exports.submitMultiplayerGuess = onRequest({ cors: true }, async (request, response) => {
    if (request.method !== 'POST') return response.status(405).send({ error: 'Method Not Allowed' });
    
    const { gameId, word, userId, isBR } = request.body;
    if (!gameId || !word || !userId) return response.status(400).send({ error: 'Eksik parametreler.' });

    const gameRef = admin.firestore().collection('games').doc(gameId);

    try {
        const result = await admin.firestore().runTransaction(async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists) throw new Error("Oyun yok.");
            
            const gameData = gameDoc.data();
            if (gameData.status !== 'playing') throw new Error("Oyun aktif değil.");
            
            const secretWord = gameData.secretWord;
            const wordLength = gameData.wordLength;
            
            // BR modunda herkes aynı anda oynar, normal modda sıra beklenir
            if (!isBR && gameData.currentPlayerId !== userId) throw new Error("Sıra sizde değil!");
            
            const colors = calculateColors(word, secretWord, wordLength);
            const newGuess = { word, colors };
            const playerState = gameData.players[userId];
            const playerGuesses = [...(playerState.guesses || []), newGuess];
            
            const updates = { [`players.${userId}.guesses`]: playerGuesses };
            let isWinner = (word === secretWord);

            if (isBR) {
                if (isWinner) {
                    updates[`players.${userId}.hasSolved`] = true;
                    updates[`players.${userId}.isWinner`] = true;
                } else if (playerGuesses.length >= GUESS_COUNT) {
                    updates[`players.${userId}.hasFailed`] = true;
                }
            } else {
                // Normal Multiplayer (Sıralı)
                if (isWinner) {
                    updates.status = 'finished';
                    updates.roundWinner = userId;
                    const roundScore = SCORE_POINTS[playerGuesses.length - 1] || 0;
                    updates[`players.${userId}.score`] = (playerState.score || 0) + roundScore;
                } else {
                    // Sırayı diğer oyuncuya geçir
                    const playerIds = Object.keys(gameData.players);
                    const nextIndex = (playerIds.indexOf(userId) + 1) % playerIds.length;
                    updates.currentPlayerId = playerIds[nextIndex];
                    updates.turnStartTime = admin.firestore.FieldValue.serverTimestamp();
                }
            }
            
            transaction.update(gameRef, updates);
            return { isWinner, newGuess };
        });
        return response.status(200).send({ success: true, ...result });
    } catch (error) {
        console.error(error);
        return response.status(500).send({ error: error.message });
    }
});

exports.failMultiplayerTurn = onRequest({ cors: true }, (request, response) => {
    // Gerekirse buraya mantık eklenebilir, şu an client yönetiyor.
    response.status(200).send({ success: true });
});

exports.startNextBRRound = onRequest({ cors: true }, (request, response) => {
    response.status(200).send({ success: true });
});

// ==================================================================
// BİLDİRİM TETİKLEYİCİLERİ (TRIGGERS)
// ==================================================================

/**
 * 1. OYUN SIRASI DEĞİŞTİĞİNDE (Hamle Yapıldı)
 * - Rakibe "Sıra Sende" bildirimi gönderir.
 * - Tıklayınca ilgili oyuna yönlendirir.
 */
exports.sendGameNotification = onDocumentUpdated("games/{gameId}", async (event) => {
    const newData = event.data.after.data();
    const previousData = event.data.before.data();
    const gameId = event.params.gameId;

    // Sadece 'playing' durumunda ve sıra değiştiyse çalış
    if (newData.status === 'playing' && newData.currentPlayerId && newData.currentPlayerId !== previousData.currentPlayerId) {
        const nextPlayerId = newData.currentPlayerId;
        
        try {
            const userDoc = await admin.firestore().collection('users').doc(nextPlayerId).get();
            if (!userDoc.exists) return null;
            
            const userData = userDoc.data();
            const tokens = userData.fcmTokens;
            
            if (!tokens || tokens.length === 0) return null;

            // Bildirim Payload'ı
            const message = {
                tokens: tokens,
                notification: {
                    title: 'Sıra Sende! 🎲',
                    body: 'Rakibin hamlesini yaptı, cevap verme sırası sende.',
                },
                data: {
                    // Service Worker bu URL'i kullanacak
                    url: `https://kelime-yar-mas.vercel.app/?gameId=${gameId}` 
                },
                webpush: {
                    fcm_options: { link: `https://kelime-yar-mas.vercel.app/?gameId=${gameId}` },
                    notification: { icon: '/icon-192x192.png' }
                }
            };
            
            const response = await admin.messaging().sendMulticast(message);
            
            // Geçersiz Token Temizliği
            if (response.failureCount > 0) {
                const failedTokens = [];
                response.responses.forEach((r, i) => { if (!r.success) failedTokens.push(tokens[i]); });
                if (failedTokens.length > 0) {
                    await admin.firestore().collection('users').doc(nextPlayerId).update({
                        fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens)
                    });
                }
            }
        } catch (error) {
            console.error("Sıra bildirimi hatası:", error);
        }
    }
    return null;
});

/**
 * 2. YENİ OYUN OLUŞTURULDUĞUNDA (Davet)
 * - Oyunu kuran HARİÇ diğer oyunculara bildirim gönderir.
 * - Tıklayınca davet edilen oyuna yönlendirir.
 */
exports.sendInviteNotification = onDocumentCreated("games/{gameId}", async (event) => {
    const gameData = event.data.data();
    const gameId = event.params.gameId;

    // Sadece Multiplayer oyunlar için
    if (gameData.gameType === 'multiplayer' || gameData.gameType === 'multiplayer-br') {
        
        // Oyunu kuranı bul (Eğer createdBy yoksa currentPlayerId varsayılır)
        const creatorId = gameData.createdBy || gameData.currentPlayerId;
        const playerIds = Object.keys(gameData.players);

        for (const playerId of playerIds) {
            // Kendine bildirim atma
            if (playerId === creatorId) continue;

            try {
                const userDoc = await admin.firestore().collection('users').doc(playerId).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const tokens = userData.fcmTokens;
                
                if (!tokens || tokens.length === 0) continue;

                const message = {
                    tokens: tokens,
                    notification: {
                        title: 'Yeni Oyun İsteği! ⚔️',
                        body: 'Bir arkadaşın seni kelime düellosuna davet etti!',
                    },
                    data: {
                        url: `https://kelime-yar-mas.vercel.app/?gameId=${gameId}`
                    },
                    webpush: {
                        fcm_options: { link: `https://kelime-yar-mas.vercel.app/?gameId=${gameId}` },
                        notification: { icon: '/icon-192x192.png' }
                    }
                };

                const response = await admin.messaging().sendMulticast(message);

                // Geçersiz Token Temizliği
                if (response.failureCount > 0) {
                    const failedTokens = [];
                    response.responses.forEach((r, i) => { if (!r.success) failedTokens.push(tokens[i]); });
                    if (failedTokens.length > 0) {
                        await admin.firestore().collection('users').doc(playerId).update({
                            fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens)
                        });
                    }
                }

            } catch (error) {
                console.error("Davet bildirim hatası:", error);
            }
        }
    }
    return null;
});