// --- GEN 2 (YENİ NESİL) FORMATI ---
// Artık v2 kütüphanesini kullanıyoruz. Bu sürüm CPU hatası vermez.
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");

const admin = require("firebase-admin");
const cors = require("cors");
const corsHandler = cors({ origin: true });

// Gen 2 için global ayarlar (Gen 1 hatasını engeller)
setGlobalOptions({ maxInstances: 10 });

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const kelimeler = require("./kelimeler.json");
const cevaplar = require("./cevaplar.json");
const SCORE_POINTS = [1000, 800, 600, 400, 200, 100];
const GUESS_COUNT = 6;

// --- YARDIMCI FONKSİYONLAR ---
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
        if (!wordList || wordList.length === 0) throw new Error("Liste boş.");
        const randomIndex = Math.floor(Math.random() * wordList.length);
        return wordList[randomIndex];
    } catch (error) {
        console.error("Kelime hatası:", error);
        return null;
    }
}

// --- HTTP FONKSİYONLARI (GEN 2) ---
// Not: Gen 2'de cors özelliği yerleşiktir, { cors: true } parametresi işi çözer.

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
                if (isWinner) {
                    updates.status = 'finished';
                    updates.roundWinner = userId;
                    const roundScore = SCORE_POINTS[playerGuesses.length - 1] || 0;
                    updates[`players.${userId}.score`] = (playerState.score || 0) + roundScore;
                } else {
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
    response.status(200).send({ success: true });
});

exports.startNextBRRound = onRequest({ cors: true }, (request, response) => {
    response.status(200).send({ success: true });
});

// --- BİLDİRİM SİSTEMİ (GEN 2 TETİKLEYİCİSİ) ---
exports.sendGameNotification = onDocumentUpdated("games/{gameId}", async (event) => {
    const newData = event.data.after.data();
    const previousData = event.data.before.data();

    if (newData.status === 'playing' && newData.currentPlayerId && newData.currentPlayerId !== previousData.currentPlayerId) {
        const nextPlayerId = newData.currentPlayerId;
        try {
            const userDoc = await admin.firestore().collection('users').doc(nextPlayerId).get();
            if (!userDoc.exists) return null;
            
            const userData = userDoc.data();
            const tokens = userData.fcmTokens;
            if (!tokens || tokens.length === 0) return null;

            const message = {
                tokens: tokens,
                notification: {
                    title: 'Hamle Sırası Sende! 🎲',
                    body: 'Rakibin oynadı, sıra sende.',
                },
                webpush: {
                    fcm_options: { link: 'https://kelime-yar-mas.vercel.app' },
                    notification: { icon: '/icon-192x192.png' }
                }
            };
            
            const response = await admin.messaging().sendMulticast(message);
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
            console.error("Bildirim hatası:", error);
        }
    }
    return null;
});

// --- YENİ OYUN DAVETİ BİLDİRİMİ ---
// Oyun ilk oluşturulduğunda (onCreate) rakibe bildirim atar.

const { onDocumentCreated } = require("firebase-functions/v2/firestore");

exports.sendInviteNotification = onDocumentCreated("games/{gameId}", async (event) => {
    const gameData = event.data.data();

    // Eğer oyun multiplayer ise ve rakip belli ise
    if (gameData.gameType === 'multiplayer' || gameData.gameType === 'multiplayer-br') {
        // Genelde oyunu kuran player1'dir, davet edilen player2'dir.
        // players objesindeki ID'leri alalım.
        const playerIds = Object.keys(gameData.players);
        
        // Oyunu kuran kişinin ID'si (createdBy genelde veride tutulur, yoksa tahmin ederiz)
        // Basit mantık: Oyunu kuran kişi hamle yapmışsa veya sırasıysa, diğerine atalım.
        // Ancak en garantisi: Henüz hamle yapılmadıysa tüm oyunculara (kuran hariç) atılabilir.
        
        // Örnek: user1 oyunu kurdu, user2'yi bekliyor.
        // user2'nin ID'sini bulup ona bildirim atacağız.
        
        /* NOT: Senin oyun yapında 'waiting' durumunda rakip ID belli mi? 
           Eğer belli ise o ID'ye gönderiyoruz. */

        // Tüm oyuncuları dönelim
        for (const playerId of playerIds) {
            // Eğer bu oyuncu, oyunu başlatan kişi değilse (bunu anlamak için oyun verine createdBy eklemen iyi olur)
            // Şimdilik basitçe: Şu anki sıra kimde değilse ona atalım veya hepsine atalım.
            
            try {
                const userDoc = await admin.firestore().collection('users').doc(playerId).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const tokens = userData.fcmTokens;
                
                // Kendi kendine bildirim atma kontrolü (Opsiyonel: Client tarafında token kontrolü ile yapılır)
                if (!tokens || tokens.length === 0) continue;

                const message = {
                    tokens: tokens,
                    notification: {
                        title: 'Yeni Oyun İsteği! 🎮',
                        body: 'Bir arkadaşın seni kelime yarışına davet etti!',
                    },
                    webpush: {
                        fcm_options: { link: 'https://kelime-yar-mas.vercel.app' },
                        notification: { icon: '/icon-192x192.png' }
                    }
                };

                const response = await admin.messaging().sendMulticast(message);
                
                // Geçersiz token temizliği
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