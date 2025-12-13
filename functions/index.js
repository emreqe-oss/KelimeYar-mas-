/**
 * functions/index.js - FINAL SÜRÜM
 * * İçerik:
 * 1. Oyun Mantığı (HTTP)
 * 2. Bildirimler (Triggers)
 * 3. Günün Kelimesi Otomasyonu (Scheduler) - YENİ EKLENDİ
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler"); // Scheduler eklendi
const { setGlobalOptions } = require("firebase-functions/v2");

const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

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
// 1. HTTP FONKSİYONLARI (OYUN MANTIĞI)
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
    // Şimdilik pasif
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
                // Normal Multiplayer
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

exports.failMultiplayerTurn = onRequest({ cors: true }, async (request, response) => {
    if (request.method !== 'POST') return response.status(405).send({ error: 'Method Not Allowed' });

    const { gameId, userId } = request.body;
    if (!gameId || !userId) return response.status(400).send({ error: 'Eksik parametreler.' });

    const gameRef = admin.firestore().collection('games').doc(gameId);

    try {
        await admin.firestore().runTransaction(async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists) throw new Error("Oyun bulunamadı.");

            transaction.update(gameRef, {
                [`players.${userId}.hasFailed`]: true,
                [`players.${userId}.lastActionTime`]: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return response.status(200).send({ success: true });
    } catch (error) {
        console.error("Tur başarısızlık hatası:", error);
        return response.status(500).send({ error: error.message });
    }
});

exports.startNextBRRound = onRequest({ cors: true }, (request, response) => {
    response.status(200).send({ success: true });
});

// ==================================================================
// 2. BİLDİRİM TETİKLEYİCİLERİ (TRIGGERS)
// ==================================================================

exports.sendGameNotification = onDocumentUpdated("games/{gameId}", async (event) => {
    const newData = event.data.after.data();
    const previousData = event.data.before.data();
    const gameId = event.params.gameId;

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
                    title: 'Sıra Sende! 🎲',
                    body: 'Rakibin hamlesini yaptı, cevap verme sırası sende.',
                },
                data: { url: `https://kelime-yar-mas.vercel.app/?gameId=${gameId}` },
                webpush: {
                    fcm_options: { link: `https://kelime-yar-mas.vercel.app/?gameId=${gameId}` },
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
            console.error("Sıra bildirimi hatası:", error);
        }
    }
    return null;
});

exports.sendInviteNotification = onDocumentCreated("games/{gameId}", async (event) => {
    const gameData = event.data.data();
    const gameId = event.params.gameId;

    if (gameData.gameType === 'multiplayer' || gameData.gameType === 'multiplayer-br') {
        const creatorId = gameData.createdBy || gameData.currentPlayerId;
        const playerIds = Object.keys(gameData.players);

        for (const playerId of playerIds) {
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
                    data: { url: `https://kelime-yar-mas.vercel.app/?gameId=${gameId}` },
                    webpush: {
                        fcm_options: { link: `https://kelime-yar-mas.vercel.app/?gameId=${gameId}` },
                        notification: { icon: '/icon-192x192.png' }
                    }
                };

                const response = await admin.messaging().sendMulticast(message);

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

// ==================================================================
// 3. GÜNÜN KELİMESİ OTOMASYONU (SCHEDULER) - YENİ
// ==================================================================

/**
 * Her gece 00:00'da (İstanbul Saati) çalışır.
 * cevaplar.json dosyasından rastgele bir kelime seçer ve
 * Firestore'da 'system_data/daily' dokümanına yazar.
 */
exports.updateDailyWord = onSchedule({
    schedule: "0 0 * * *", // Her gece 00:00
    timeZone: "Europe/Istanbul",
    retryCount: 3,
}, async (event) => {
    
    // 1. Rastgele uzunluk seç (4, 5 veya 6)
    const lengths = ["4", "5", "6"];
    const randomLength = lengths[Math.floor(Math.random() * lengths.length)];
    
    // 2. O uzunluktaki kelime listesini al
    const wordList = cevaplar[randomLength];
    
    if (!wordList || wordList.length === 0) {
        console.error("Kelime listesi boş veya okunamadı!");
        return;
    }

    // 3. Listeden rastgele bir kelime seç
    const selectedWord = wordList[Math.floor(Math.random() * wordList.length)];
    
    console.log(`Yeni Günün Kelimesi Seçildi: ${selectedWord} (${randomLength} harf)`);

    // 4. Veritabanına Yaz
    try {
        await admin.firestore().collection("system_data").doc("daily").set({
            word: selectedWord,
            length: selectedWord.length,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            dateStr: new Date().toLocaleDateString("tr-TR") // Kontrol amaçlı
        });
        console.log("Veritabanı güncellendi.");
    } catch (error) {
        console.error("Günün kelimesi yazılırken hata oluştu:", error);
    }
});

// ==================================================================
// 4. KELİMELİG OTOMASYONU (HAFTALIK SIFIRLAMA & ÖDÜL) - YENİ
// ==================================================================

/**
 * Bu fonksiyon her Pazartesi sabahı 00:00'da çalışır.
 * Bir önceki haftanın ligini kapatır ve kazananlara ödül dağıtır.
 */
exports.finishWeeklyLeague = onSchedule({
    schedule: "0 0 * * 1", // Her Pazartesi 00:00
    timeZone: "Europe/Istanbul",
    timeoutSeconds: 540, // 9 Dakika (Uzun işlem izni)
    memory: "512MiB",    // Biraz daha güçlü işlemci
}, async (event) => {
    
    // 1. Biten Haftanın ID'sini Bul
    // (Bugün Pazartesi ise, biten hafta geçen haftadır)
    const date = new Date();
    date.setDate(date.getDate() - 7); // 7 gün geri git
    const year = date.getFullYear();
    const firstJan = new Date(year, 0, 1);
    const numberOfDays = Math.floor((date - firstJan) / (24 * 60 * 60 * 1000));
    const week = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
    const previousWeekID = `${year}-W${week}`;

    console.log(`Lig Kapanışı Başlatılıyor: ${previousWeekID}`);

    const db = admin.firestore();
    const tiers = ['rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
    
    let totalDistributedGold = 0;
    let totalWinners = 0;

    // Tüm Kümeleri (Tier) Gez
    for (const tier of tiers) {
        const groupsRef = db.collection(`leagues/${previousWeekID}/tiers/${tier}/groups`);
        const groupsSnapshot = await groupsRef.get();

        if (groupsSnapshot.empty) continue;

        // O kümedeki tüm grupları gez
        for (const groupDoc of groupsSnapshot.docs) {
            const groupId = groupDoc.id;
            const participantsRef = groupDoc.ref.collection('participants');
            
            // Puan durumuna göre sırala (Puan > Galibiyet > Alfabetik)
            const leaderboardQuery = participantsRef
                .orderBy('stats.P', 'desc')
                .orderBy('stats.G', 'desc')
                .limit(3); // Sadece ilk 3'ü çek (Ödül alacaklar)

            const leaderboardSnap = await leaderboardQuery.get();

            if (leaderboardSnap.empty) continue;

            const winners = leaderboardSnap.docs;
            const batch = db.batch(); // Toplu işlem başlat

            // 🥇 1. Olan Oyuncu
            if (winners[0]) {
                const p1 = winners[0].data();
                if (!p1.isBot) { // Botlara ödül verme :)
                    const userRef = db.collection('users').doc(winners[0].id);
                    batch.update(userRef, { 
                        gold: admin.firestore.FieldValue.increment(3000),
                        // Bildirim için bir alan ekleyebilirsin (Opsiyonel)
                        lastLeagueReward: { week: previousWeekID, rank: 1, gold: 3000, seen: false }
                    });
                    totalDistributedGold += 3000;
                    totalWinners++;
                }
            }

            // 🥈 2. Olan Oyuncu
            if (winners[1]) {
                const p2 = winners[1].data();
                if (!p2.isBot) {
                    const userRef = db.collection('users').doc(winners[1].id);
                    batch.update(userRef, { 
                        gold: admin.firestore.FieldValue.increment(1500),
                        lastLeagueReward: { week: previousWeekID, rank: 2, gold: 1500, seen: false }
                    });
                    totalDistributedGold += 1500;
                    totalWinners++;
                }
            }

            // 🥉 3. Olan Oyuncu
            if (winners[2]) {
                const p3 = winners[2].data();
                if (!p3.isBot) {
                    const userRef = db.collection('users').doc(winners[2].id);
                    batch.update(userRef, { 
                        gold: admin.firestore.FieldValue.increment(750),
                        lastLeagueReward: { week: previousWeekID, rank: 3, gold: 750, seen: false }
                    });
                    totalDistributedGold += 750;
                    totalWinners++;
                }
            }

            // Grubu "Tamamlandı" olarak işaretle
            batch.update(groupDoc.ref, { status: 'closed' });

            // İşlemi kaydet
            await batch.commit();
        }
    }

    console.log(`Lig tamamlandı. ${totalWinners} oyuncuya toplam ${totalDistributedGold} altın dağıtıldı.`);
});