/**
 * functions/index.js - FINAL SÜRÜM
 * * İçerik:
 * 1. Oyun Mantığı (HTTP)
 * 2. Bildirimler (Triggers)
 * 3. Günün Kelimesi Otomasyonu (Scheduler) - YENİ EKLENDİ
 */

const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler"); // Scheduler eklendi
const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest, onCall } = require("firebase-functions/v2/https"); // onCall EKLENDİ
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
// functions/index.js - finishWeeklyLeague (GÜNCELLENMİŞ)

// Lig Sıralaması
const TIER_ORDER = ['rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];

// Yardımcı: Bir üst ligi getir
function getNextTier(currentTier) {
    const idx = TIER_ORDER.indexOf(currentTier);
    if (idx === -1 || idx === TIER_ORDER.length - 1) return currentTier;
    return TIER_ORDER[idx + 1];
}

// Yardımcı: Bir alt ligi getir
function getPrevTier(currentTier) {
    const idx = TIER_ORDER.indexOf(currentTier);
    if (idx <= 0) return 'rookie';
    return TIER_ORDER[idx - 1];
}

/**
 * HAFTALIK LİG SIFIRLAMA ve TERFİ SİSTEMİ
 * Her Pazartesi 00:00'da çalışır.
 */
exports.finishWeeklyLeague = onSchedule({
    schedule: "0 0 * * 1", // Her Pazartesi 00:00
    timeZone: "Europe/Istanbul",
    timeoutSeconds: 540,
    memory: "512MiB",
}, async (event) => {
    
    // 1. Biten Haftayı Bul
    const date = new Date();
    date.setDate(date.getDate() - 7); 
    const year = date.getFullYear();
    const firstJan = new Date(year, 0, 1);
    const numberOfDays = Math.floor((date - firstJan) / (24 * 60 * 60 * 1000));
    const week = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
    const previousWeekID = `${year}-W${week}`;
    
    // Yeni Haftayı Hesapla (Kullanıcıları buraya taşıyacağız)
    const nextDate = new Date();
    const nextWeekNum = Math.ceil((nextDate.getDay() + 1 + Math.floor((nextDate - firstJan) / (24 * 60 * 60 * 1000))) / 7);
    const nextWeekID = `${year}-W${nextWeekNum}`;

    console.log(`LİG KAPANIŞI: ${previousWeekID} -> YENİ HAFTA: ${nextWeekID}`);

    const db = admin.firestore();
    const batch = db.batch();
    let opCount = 0; // Batch limit kontrolü (500)

    for (const tier of TIER_ORDER) {
        const groupsRef = db.collection(`leagues/${previousWeekID}/tiers/${tier}/groups`);
        const groupsSnapshot = await groupsRef.get();

        if (groupsSnapshot.empty) continue;

        for (const groupDoc of groupsSnapshot.docs) {
            const participantsRef = groupDoc.ref.collection('participants');
            // Puan sıralaması
            const playersSnap = await participantsRef.orderBy('stats.P', 'desc').orderBy('stats.G', 'desc').get();
            
            const players = playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const totalPlayers = players.length;

            for (let i = 0; i < totalPlayers; i++) {
                const player = players[i];
                const rank = i + 1;
                
                // Botları atla, sadece GERÇEK oyuncuları işle
                if (player.isBot) continue;

                let newTier = tier;
                let reward = 0;
                let message = "";
                let title = "";

                // --- TERFİ VE DÜŞME KURALLARI ---

                // 🥇 İLK 3: YÜKSELİR
                if (rank <= 3) {
                    newTier = getNextTier(tier);
                    if (newTier !== tier) {
                        reward = (rank === 1) ? 3000 : ((rank === 2) ? 1500 : 750);
                        title = "TEBRİKLER! 🏆";
                        message = `Geçen haftayı ${rank}. sırada tamamladın.\n${newTier.toUpperCase()} ligine yükseldin!`;
                    } else {
                        // Zaten Elmas ligindeyse
                        reward = 5000;
                        title = "ZİRVEDESİN! 👑";
                        message = `Geçen haftayı ${rank}. sırada tamamlayarak Elmas Ligi'ni domine ettin!`;
                    }
                }
                // 🔻 SON 3: DÜŞER (Eğer grupta en az 10 kişi varsa ve Çaylak değilse)
                else if (rank > (totalPlayers - 3) && totalPlayers >= 10 && tier !== 'rookie') {
                    newTier = getPrevTier(tier);
                    reward = 50; // Teselli
                    title = "LİG DÜŞTÜN 📉";
                    message = `Geçen haftayı ${rank}. sırada tamamladın.\n${newTier.toUpperCase()} ligine düştün.`;
                }
                // 😐 ORTA SIRA: KALIR
                else {
                    reward = 100; // Katılım ödülü
                    title = "LİGDE KALDIN";
                    message = `Geçen haftayı ${rank}. sırada tamamladın. Mücadeleye devam!`;
                }

                // --- GÜNCELLEME İŞLEMİ ---
                const userRef = db.collection('users').doc(player.id);

                batch.update(userRef, {
                    gold: admin.firestore.FieldValue.increment(reward),
                    currentTier: newTier,          // Yeni Lig Seviyesi
                    currentLeagueWeek: nextWeekID, // Yeni Hafta Kodu
                    currentGroupId: admin.firestore.FieldValue.delete(), // Grubu sil (Yeni haftada "Katıl" diyerek yeni grup bulsun)
                    
                    // Bildirim Mesajı (Main.js bunu okuyup ekrana basacak)
                    lastLeagueMessage: { 
                        title: title,
                        body: message,
                        reward: reward,
                        week: previousWeekID
                    }
                });

                opCount++;
                if (opCount >= 450) { // Batch limiti dolmadan commit et
                    await batch.commit();
                    opCount = 0;
                }
            }
            
            // Grubu kapalı işaretle
            batch.update(groupDoc.ref, { status: 'closed' });
            opCount++;
        }
    }

    if (opCount > 0) {
        await batch.commit();
    }

    console.log("Haftalık lig kapanışı tamamlandı.");
});

// ==================================================================
// 5. GÜVENLİ GÜNLÜK GÖREV SİSTEMİ (OnCall) - YENİ
// ==================================================================

const QUEST_DEFINITIONS = [
    { id: 'play_3', type: 'play', target: 3, reward: 150, title: "Isınma Turu", desc: "3 farklı maç tamamla." },
    { id: 'win_1', type: 'win', target: 1, reward: 200, title: "Zafer Tadı", desc: "1 oyun kazan." },
    { id: 'win_3', type: 'win', target: 3, reward: 500, title: "Seri Galibiyet", desc: "3 oyun kazan." },
    { id: 'find_green_10', type: 'green_tile', target: 10, reward: 100, title: "Yeşil Işık", desc: "Toplam 10 harfi doğru yerinde bil." },
    { id: 'use_joker_1', type: 'use_joker', target: 1, reward: 50, title: "Joker Hakkı", desc: "1 kez joker kullan." },
    { id: 'play_br_1', type: 'play_br', target: 1, reward: 300, title: "Battle Royale", desc: "Bir Battle Royale oyununa katıl." }
];

/**
 * İstemci (Client) bu fonksiyonu çağırır.
 * Sunucu saatine bakar, gün değişmişse yeni görevleri yazar.
 * Asla kullanıcının saatine güvenmez.
 */
exports.checkAndGenerateDailyQuests = onCall(async (request) => {
    // 1. Kullanıcı Giriş Yapmış mı?
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Giriş yapmalısınız.');
    }

    const userId = request.auth.uid;
    const db = admin.firestore();
    const userRef = db.collection("users").doc(userId);

    // 2. Bugünün Tarihini Al (SUNUCU SAATİ - GÜVENLİ)
    // Türkiye saatiyle hesaplayalım
    const now = new Date();
    const trTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const todayStr = trTime.toISOString().split('T')[0]; // "2024-12-16" formatında

    const userSnap = await userRef.get();
    if (!userSnap.exists) return { success: false };

    const userData = userSnap.data();
    const currentQuests = userData.dailyQuests;

    // 3. Kontrol: Görevler zaten bugünün tarihine mi ait?
    if (currentQuests && currentQuests.date === todayStr) {
        return { success: true, message: "Görevler güncel." };
    }

    // 4. Yeni Görev Oluştur (Tarih eski veya hiç yok)
    const shuffled = [...QUEST_DEFINITIONS].sort(() => 0.5 - Math.random());
    const selectedQuests = shuffled.slice(0, 3).map(q => ({
        ...q,
        progress: 0,
        completed: false,
        claimed: false
    }));

    const newQuestData = {
        date: todayStr, // Sunucudan gelen güvenli tarih
        list: selectedQuests
    };

    await userRef.update({ dailyQuests: newQuestData });

    return { success: true, message: "Yeni görevler oluşturuldu." };
});