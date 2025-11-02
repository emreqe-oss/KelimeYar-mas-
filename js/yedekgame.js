// js/game.js - YENİ VE TAM KOD (CPU ZEKASI ve UI TUTARLILIĞI DÜZELTİLMİŞTİR)

// Firebase v9'dan gerekli modülleri içe aktar
import { db, getNewSecretWord, checkWordValidity, submitMultiplayerGuess, failMultiplayerTurn } from './firebase.js';
import {
    collection, query, where, limit, getDocs, getDoc, doc, setDoc, updateDoc,
    runTransaction, onSnapshot, serverTimestamp, arrayUnion, orderBy
} from "firebase/firestore";

// Diğer modülleri ve kelime listelerini içe aktar
import * as state from './state.js';
import { showToast, playSound, shakeCurrentRow, getStatsFromProfile } from './utils.js';
import { showScreen, createGrid, createKeyboard, updateKeyboard, getUsername, displayStats, guessGrid, turnDisplay, timerDisplay, gameIdDisplay, roundCounter, shareGameBtn, startGameBtn, keyboardContainer, updateMultiplayerScoreBoard } from './ui.js';
// Düzeltilmiş Yol: Kelimeler.json, js klasörünün bir üstündeki functions klasöründe bulunuyor.
import { default as allWordList } from '../functions/kelimeler.json'; 


// Sabitler ve yardımcı fonksiyonlar
const GUESS_COUNT = 6;
const MAX_BR_PLAYERS = 4;
let wordLength = 5;
let timeLimit = 45;

// Günlük kelime için geçerli harf uzunlukları
const DAILY_WORD_LENGTHS = [4, 5, 6]; 

const getRandomWordLength = () => DAILY_WORD_LENGTHS[Math.floor(Math.random() * DAILY_WORD_LENGTHS.length)];
function isBattleRoyale(mode) { return mode === 'multiplayer-br'; }

/**
 * Türkiye Saatini (TRT) baz alarak epoch'tan bu yana geçen gün sayısını hesaplar.
 * Gece 00:00'da günün kelimesinin değişmesini sağlar.
 */
function getDaysSinceEpoch() {
    const now = new Date();
    // TRT (UTC+3) baz alınarak gece 00:00'da gün değişimi için zaman ayarı
    const trtOffset = 3 * 60 * 60 * 1000;
    const todayTRT = new Date(now.getTime() + trtOffset);
    
    const epoch = new Date('2024-01-01'); // Proje başlangıç tarihi
    
    // Günün TRT'ye göre başlangıcını al
    const startOfTodayTRT = new Date(todayTRT.getFullYear(), todayTRT.getMonth(), todayTRT.getDate());
    
    return Math.floor((startOfTodayTRT - epoch) / (1000 * 60 * 60 * 24));
}

// *** Modül İçi Yardımcı Fonksiyonlar, Dışarıdan Erişim İçin EXPORT Edildi ***

// 1. initializeGameUI 
export function initializeGameUI(gameData) {
    wordLength = gameData.wordLength;
    timeLimit = gameData.timeLimit;
    
    if (guessGrid) {
        // *** DÜZELTME 1: UI Tutarsızlığı için ızgaranın TAMAMEN temizlenmesini sağla ***
        guessGrid.innerHTML = ''; 

        // Izgara genişliğini kelime uzunluğuna göre dinamik olarak ayarla
        if (wordLength === 4) {
            guessGrid.style.maxWidth = '220px';
        } else if (wordLength === 5) {
            guessGrid.style.maxWidth = '280px';
        } else { // 6 harfli
            guessGrid.style.maxWidth = '320px';
        }
    }
    createGrid(wordLength, GUESS_COUNT);
    createKeyboard(handleKeyPress);
}

// 2. updateTurnDisplay
export function updateTurnDisplay(gameData) {
    if (!turnDisplay || !timerDisplay || !startGameBtn || !shareGameBtn) return;
    
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const numPlayers = Object.keys(gameData.players).length;
    
    const isBR = isBattleRoyale(gameMode);
    if (isBR) {
        timerDisplay.textContent = gameData.timeLimit || 45;
        const brWaitingForPlayers = document.getElementById('br-waiting-for-players');
        if (gameData.status === 'waiting') {
            turnDisplay.textContent = `Oyuncu bekleniyor (${numPlayers}/${MAX_BR_PLAYERS})...`;
            startGameBtn.classList.toggle('hidden', currentUserId !== gameData.creatorId || numPlayers < 2);
            shareGameBtn.classList.remove('hidden');
            if (brWaitingForPlayers) brWaitingForPlayers.classList.remove('hidden');
        } else if (gameData.status === 'playing') {
            turnDisplay.textContent = "Tahmin Yap!";
            startGameBtn.classList.add('hidden');
            turnDisplay.classList.remove('pulsate');
            if (brWaitingForPlayers) brWaitingForPlayers.classList.add('hidden');
        } else if (gameData.status === 'finished') {
            turnDisplay.textContent = "Oyun Bitti";
            startGameBtn.classList.add('hidden');
        }
        return;
    }
    
    if (gameData.status === 'waiting') {
        stopTurnTimer();
        turnDisplay.textContent = "Rakip bekleniyor...";
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.remove('hidden');
    } 
    else if (gameData.status === 'invited') {
        turnDisplay.textContent = `Arkadaşın bekleniyor...`;
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.remove('hidden');
    }
    else if (gameData.status === 'playing') {
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.add('hidden');
        const currentPlayerUsername = gameData.players[gameData.currentPlayerId]?.username;
        if (gameData.currentPlayerId === currentUserId) {
            turnDisplay.textContent = "Sıra Sende!";
            turnDisplay.classList.add('pulsate');
        } else {
            turnDisplay.textContent = `Sıra: ${currentPlayerUsername || '...'}`;
            turnDisplay.classList.remove('pulsate');
        }
    }
    else if (gameData.status === 'finished') {
        turnDisplay.textContent = "Oyun Bitti";
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.add('hidden');
    }
}


// 3. renderGameState
export async function renderGameState(gameData, animateLastRow = false) {
    const currentUserId = state.getUserId();
    
    // YENİ KOD: Sıra Kontrolü ve Sesli Bildirim
    const oldGameData = state.getLocalGameData(); // Eski veriyi state'ten al
    const oldPlayerId = oldGameData?.currentPlayerId;
    const isMyTurnNow = gameData.currentPlayerId === currentUserId;

    if (oldPlayerId && oldPlayerId !== currentUserId && isMyTurnNow) {
        // Sıra daha önce başkasındaydı ve şimdi bize geçtiyse SES ÇAL
        playSound('turn');
    }
    // KOD EKLENTİSİ BİTTİ
    
    if (!gameData) return;
    const gameMode = state.getGameMode();
    const isBR = isBattleRoyale(gameMode);
    const sequentialGameInfo = document.getElementById('sequential-game-info');
    if (sequentialGameInfo) {
        sequentialGameInfo.classList.toggle('hidden', isBR || gameMode === 'vsCPU' || gameMode === 'daily');
    }
    updateMultiplayerScoreBoard(gameData);
    if (gameMode === 'daily') {
        if (gameIdDisplay) gameIdDisplay.textContent = 'Günün Kelimesi';
        const gameInfoBar = document.getElementById('game-info-bar');
        if (gameInfoBar) gameInfoBar.style.display = 'none';
        if (roundCounter) roundCounter.textContent = new Date().toLocaleDateString('tr-TR');
    } else {
        if (gameIdDisplay) gameIdDisplay.textContent = gameData.gameId || '';
        const gameInfoBar = document.getElementById('game-info-bar');
        if (gameInfoBar) gameInfoBar.style.display = 'flex';
        if (roundCounter) roundCounter.textContent = (gameMode === 'multiplayer' || gameMode === 'vsCPU') ? `Tur ${gameData.currentRound}/${gameData.matchLength}` : '';
    }
    timeLimit = gameData.timeLimit || 45;
    const isMyTurn = !isBattleRoyale(gameMode) && gameData.currentPlayerId === currentUserId && gameData.status === 'playing';
    
    updateTurnDisplay(gameData);

    const playerGuesses = gameData.players[currentUserId]?.guesses || [];
    for (let i = 0; i < GUESS_COUNT; i++) {
        for (let j = 0; j < wordLength; j++) {
            const tile = document.getElementById(`tile-${i}-${j}`);
            if (!tile) continue;
            const front = tile.querySelector('.front');
            const back = tile.querySelector('.back');
            tile.classList.remove('flip', 'correct', 'present', 'absent', 'failed', 'shake');
            front.textContent = '';
            back.textContent = '';
            if (playerGuesses[i]) {
                const guess = playerGuesses[i];
                front.textContent = guess.word[j];
                back.textContent = guess.word[j];
                const isLastRow = i === playerGuesses.length - 1;
                if (animateLastRow && isLastRow) {
                    setTimeout(() => {
                        tile.classList.add(guess.colors[j]);
                        tile.classList.add('flip');
                    }, j * 250);
                } else {
                    tile.classList.add(guess.colors[j]);
                    tile.classList.add('flip');
                }
            }
        }
    }
    updateKeyboard(gameData);
    if (gameData.status === 'playing') {
        if (isBR) startBRTimer();
        else if (gameMode === 'multiplayer' && isMyTurn) startTurnTimer();
        // vsCPU modunda, sıra CPU'daysa (Bizim tahminimizden sonra) onu oynat
        else if (gameMode === 'vsCPU' && gameData.currentPlayerId === 'cpu') {
            setTimeout(cpuTurn, 1500); // UI render edildikten sonra CPU'yu oynat
        }
    } else {
        stopTurnTimer();
    }
}

// 4. fetchWordMeaning
export async function fetchWordMeaning(word) {
    try {
        const response = await fetch(`https://sozluk.gov.tr/gts?ara=${word.toLocaleLowerCase("tr-TR")}`);
        if (!response.ok) return "Anlam bulunamadı.";
        const data = await response.json();
        if (data.error) {
            return "Anlam bulunamadı.";
        }
        return data[0]?.anlamlarListe?.[0]?.anlam || "Anlam bulunamadı.";
    } catch (error) {
        console.error("Anlam alınırken hata:", error);
        return "Anlam alınırken bir hata oluştu.";
    }
}

// 5. listenToGameUpdates (Export eklendi ve dosyanın başında import edildiği için referans çözülmeli)
export function listenToGameUpdates(gameId) {
    const gameUnsubscribe = state.getGameUnsubscribe();
    if (gameUnsubscribe) gameUnsubscribe();

    const gameRef = doc(db, "games", gameId);
    
    const unsubscribe = onSnapshot(gameRef, (doc) => {
        const gameData = doc.data();
        if (!gameData) {
            showToast("Oyun sonlandırıldı.");
            leaveGame();
            return;
        }

        const oldGameData = state.getLocalGameData();
        const oldStatus = oldGameData?.status;
        state.setLocalGameData(gameData);

        const wasFinished = oldStatus === 'finished';
        const isNowPlaying = gameData.status === 'playing';

        if (wasFinished && isNowPlaying) {
            showScreen('game-screen');
            initializeGameUI(gameData);
        }
        
        // *** DÜZELTME 2: wordLength değiştiyse UI'yı yeniden başlat (Multiplayer tutarlılığı için) ***
        if (oldGameData && oldGameData.wordLength !== gameData.wordLength) {
            initializeGameUI(gameData);
        }
        // *** DÜZELTME BİTTİ ***

        const currentGuesses = gameData.players[state.getUserId()]?.guesses || [];
        const oldGuessesCount = oldGameData?.players[state.getUserId()]?.guesses.length || 0;
        const didMyGuessChange = currentGuesses.length > oldGuessesCount;

        if (gameData.status === 'finished') {
            renderGameState(gameData, didMyGuessChange).then(() => {
                setTimeout(() => showScoreboard(gameData), wordLength * 300 + 500);
            });
        } else {
            renderGameState(gameData, didMyGuessChange);
        }
    }, (error) => { 
        console.error("Oyun dinlenirken bir hata oluştu:", error);
    });
    state.setGameUnsubscribe(unsubscribe);
}

// *** Modül İçi Yardımcı Fonksiyonlar EXPORT EDİLDİ ***


export async function findOrCreateRandomGame(config) {
    const { timeLimit, matchLength, gameType } = config;
    const currentUserId = state.getUserId();
    if (!currentUserId) return showToast("Lütfen önce giriş yapın.", true);

    showToast("Rakip aranıyor...", false);

    try {
        const gamesRef = collection(db, 'games');
        const waitingGamesQuery = query(gamesRef,
            where('status', '==', 'waiting'),
            where('gameType', '==', gameType),
            where('timeLimit', '==', timeLimit),
            limit(1)
        );

        const querySnapshot = await getDocs(waitingGamesQuery);

        let foundGame = null;
        querySnapshot.forEach(doc => {
            if (doc.data().creatorId !== currentUserId) {
                foundGame = doc;
            }
        });

        if (foundGame) {
            console.log(`Bekleyen oyun bulundu: ${foundGame.id}, katılınyor...`);
            await joinGame(foundGame.id);
        } else {
            console.log("Bekleyen oyun bulunamadı, yenisi oluşturuluyor...");
            await createGame({
                invitedFriendId: null,
                timeLimit: timeLimit,
                matchLength: matchLength,
                gameType: gameType
            });
        }
    } catch (error) {
        console.error("Rastgele oyun aranırken hata:", error);
        showToast("Oyun aranırken bir hata oluştu.", true);
    }
}

export async function createGame(options = {}) {
    const { invitedFriendId = null, timeLimit = 45, matchLength = 5, gameType = 'friend' } = options;
    if (!db || !state.getUserId()) return showToast("Sunucuya bağlanılamıyor.", true);
    
    const currentUserId = state.getUserId();
    const username = getUsername();
    const selectedLength = getRandomWordLength();
    const secretWord = await getNewSecretWord(selectedLength);
    if (!secretWord) return;

    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();

    const playerIdsList = [currentUserId];
    if (invitedFriendId) {
        playerIdsList.push(invitedFriendId); // Arkadaşın ID'sini de listeye ekliyoruz
    }

    const gameData = {
        gameId, wordLength: selectedLength, secretWord, timeLimit,
        creatorId: currentUserId, isHardMode: false, matchLength,
        currentRound: 1, players: { [currentUserId]: { username, guesses: [], score: 0 } },
        
        playerIds: playerIdsList, 
        
        currentPlayerId: currentUserId, 
        status: invitedFriendId ? 'invited' : 'waiting',
        roundWinner: null,
        createdAt: serverTimestamp(),
        turnStartTime: serverTimestamp(),
        GUESS_COUNT: GUESS_COUNT, gameType
    };

    if (invitedFriendId) { 
        gameData.invitedPlayerId = invitedFriendId; 
    }

    try {
        await setDoc(doc(db, "games", gameId), gameData);
        
        state.setGameMode('multiplayer');
        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        state.setLocalGameData(gameData);
        showScreen('game-screen');
        initializeGameUI(gameData); // Oyunu kuran oyuncu için UI'yı başlat
        listenToGameUpdates(gameId);

    } catch (error) {
        console.error("Error creating game:", error);
        showToast("Oyun oluşturulamadı!", true);
    }
}

export async function joinGame(gameId) {
    if (!db || !state.getUserId()) return showToast("Sunucuya bağlanılamıyor.", true);
    const username = getUsername();
    const gameRef = doc(db, "games", gameId);
    const currentUserId = state.getUserId();

    try {
        let gameDataToJoin;
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Oyun bulunamadı!");
            
            const gameData = gameDoc.data();
            
            if (gameData.players[currentUserId]) {
                gameDataToJoin = gameData;
                return; 
            }

            if (Object.keys(gameData.players).length < 2) {
                const updates = {
                    [`players.${currentUserId}`]: { username, guesses: [], score: 0 },
                    playerIds: arrayUnion(currentUserId),
                    status: 'playing',
                    turnStartTime: serverTimestamp() 
                };
                transaction.update(gameRef, updates);
                gameDataToJoin = { ...gameData, ...updates }; 
            } else {
                throw new Error("Bu oyun dolu veya başlamış.");
            }
        });
        
        if (!gameDataToJoin) {
            const finalDoc = await getDoc(gameRef);
            if(finalDoc.exists()) gameDataToJoin = finalDoc.data();
            else throw new Error("Oyun verisi bulunamadı.");
        }
        
        state.setGameMode('multiplayer');
        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        state.setLocalGameData(gameDataToJoin);
        showScreen('game-screen');
        initializeGameUI(gameDataToJoin); // Oyuna katılan oyuncu için UI'yı başlat
        listenToGameUpdates(gameId);

    } catch (error) {
        console.error("Error joining game:", error);
        showToast(error.message, true);
        localStorage.removeItem('activeGameId');
        leaveGame();
    }
}

/**
 * Günün kelimesini (4, 5, 6 harften rastgele) seçer ve gün boyunca aynı kalmasını sağlar.
 */
function getDailySecretWord() {
    const dayIndex = getDaysSinceEpoch();
    
    // Kelime uzunluğunu, gün index'ine göre döngüsel olarak rastgele seçiyoruz
    const selectedLength = DAILY_WORD_LENGTHS[dayIndex % DAILY_WORD_LENGTHS.length];

    // Seçilen uzunluğa ait kelime listesini kelimeler.json'dan al
    const dailyWordList = allWordList[String(selectedLength)];

    if (!dailyWordList || dailyWordList.length === 0) {
        console.error(`Kelimeler listesinde ${selectedLength} harfli kelime bulunamadı.`);
        // Güvenlik için 5 harfli kelime listesine geri dön
        return allWordList["5"][dayIndex % allWordList["5"].length]; 
    }
    
    // Seçilen kelime listesinden, gün index'ine göre kelimeyi belirle
    return dailyWordList[dayIndex % dailyWordList.length];
}


export async function startNewGame(config) {
    state.setGameMode(config.mode);
    let secretWord;
    const gameSettings = { isHardMode: false };

    switch (config.mode) {
        case 'vsCPU':
            gameSettings.wordLength = getRandomWordLength();
            gameSettings.timeLimit = 45;
            gameSettings.matchLength = 5;
            break;
        case 'daily':
            // 1. Günün kelimesini (TRT'ye göre) belirle
            secretWord = getDailySecretWord();
            
            if (!secretWord) {
                showToast("Günün kelimesi bulunamadı.", true);
                return;
            }

            // 2. Kaydedilmiş günlük oyun durumunu al
            const dailyState = getDailyGameState(); 
            
            // 3. Kaydedilmiş durum varsa ve güncel kelimeyle eşleşiyorsa, oyunu geri yükle
            if (dailyState && dailyState.secretWord === secretWord) {
                restoreDailyGame(dailyState);
                return; 
            }

            // Yeni oyun ayarları
            gameSettings.wordLength = secretWord.length; // Kelime uzunluğunu seçilen kelimeye göre ayarla
            gameSettings.timeLimit = 60;
            gameSettings.matchLength = 1;
            break;

        default:
            showToast("Bilinmeyen oyun modu!", true);
            return;
    }

    // vsCPU veya yeni daily oyununda kelimeyi al
    if (!secretWord) {
        // Bu kısım sadece vsCPU için çalışır, daily için yukarıda ayarlandı
        secretWord = await getNewSecretWord(gameSettings.wordLength);
    }

    if (!secretWord) {
        showToast("Oyun için kelime alınamadı.", true);
        return;
    }

    const gameData = {
        wordLength: gameSettings.wordLength, secretWord: secretWord, timeLimit: gameSettings.timeLimit,
        isHardMode: gameSettings.isHardMode, currentRound: 1, matchLength: gameSettings.matchLength,
        players: { [state.getUserId()]: { username: getUsername(), guesses: [], score: 0 } },
        // vsCPU için CPU oyuncusunu ekle
        ...(config.mode === 'vsCPU' ? { players: { 
            [state.getUserId()]: { username: getUsername(), guesses: [], score: 0 },
            'cpu': { username: 'Bilgisayar', guesses: [], score: 0 } 
        } } : {}),
        currentPlayerId: state.getUserId(), status: 'playing', turnStartTime: new Date(), GUESS_COUNT: GUESS_COUNT
    };

    state.setLocalGameData(gameData);
    showScreen('game-screen');
    initializeGameUI(gameData);
    await renderGameState(gameData);
}

function getDailyGameState() {
    const saved = localStorage.getItem(`dailyGameState_${state.getUserId()}`);
    if (!saved) return null;
    try {
        const parsedState = JSON.parse(saved);
        
        // Geri yükleme yapmadan önce, kaydedilen günün kelimesini kontrol et
        const savedWord = parsedState.secretWord;
        const currentDailyWord = getDailySecretWord();
        
        // Eğer kaydedilen kelime ile şimdiki kelime aynı ise, aynı gün içindeyiz demektir.
        if (savedWord === currentDailyWord) {
             return parsedState;
        }
        
        return null; // Kelime farklıysa, gün dönmüştür ve kayıt geçersizdir.
    } catch (e) { return null; }
}

function saveDailyGameState(gameState) {
    const toSave = {
        // Artık sadece kelimeyi kontrol ettiğimiz için date'e ihtiyacımız yok, ancak tutmak zarar vermez.
        date: new Date().toDateString(),
        guesses: gameState.players[state.getUserId()].guesses,
        status: gameState.status,
        secretWord: gameState.secretWord // Hangi kelimeyi oynadığımızı kaydediyoruz
    };
    localStorage.setItem(`dailyGameState_${state.getUserId()}`, JSON.stringify(toSave));
}

function restoreDailyGame(savedState) {
    const gameData = {
        // Düzeltme: Kelime uzunluğunu kaydedilen kelimenin uzunluğuna göre ayarla
        wordLength: savedState.secretWord.length, 
        secretWord: savedState.secretWord, timeLimit: 60,
        isHardMode: false, currentRound: 1, matchLength: 1,
        // ÖNEMLİ DÜZELTME: Eğer oyuncu kazanmışsa, roundWinner'ı da kayıttan almalıyız ki skor tablosu doğru başlasın
        roundWinner: savedState.status === 'finished' && savedState.guesses.length < GUESS_COUNT ? state.getUserId() : null,
        players: { [state.getUserId()]: { username: getUsername(), guesses: savedState.guesses, score: 0 } },
        currentPlayerId: state.getUserId(), status: savedState.status, turnStartTime: new Date(), GUESS_COUNT: GUESS_COUNT
    };
    state.setGameMode('daily');
    state.setLocalGameData(gameData);
    showScreen('game-screen');
    initializeGameUI(gameData);
    renderGameState(gameData).then(() => {
        // Oyun bittiyse (kazanıldı/kaybedildi), skor tablosunu göster
        if (gameData.status === 'finished') {
            setTimeout(() => showScoreboard(gameData), 100);
        }
    });
}

function checkHardMode(guessWord, playerGuesses) {
    const correctLetters = {};
    const presentLetters = new Set();
    playerGuesses.forEach(guess => {
        for (let i = 0; i < guess.word.length; i++) {
            if (guess.colors[i] === 'correct') {
                correctLetters[i] = guess.word[i];
                presentLetters.add(guess.word[i]); // Yeşil harf aynı zamanda mevcut (sarı) harftir
            } else if (guess.colors[i] === 'present') {
                presentLetters.add(guess.word[i]);
            }
        }
    });
    for (const pos in correctLetters) {
        if (guessWord[pos] !== correctLetters[pos]) {
            showToast(`Zor Mod: ${parseInt(pos) + 1}. harf "${correctLetters[pos]}" olmalı!`, true);
            return false;
        }
    }
    // Doğru konumda olmayan mevcut harfleri kontrol et
    for (const letter of presentLetters) {
        // Eğer harf kelimede yoksa ve bu harf yeşil/sarı olarak bulunduysa (bu zaten yukarıda kontrol edilmiş olmalı)
        // Burada sadece, bulunan harfin yeni tahminde de var olup olmadığını kontrol ediyoruz.
        if (!guessWord.includes(letter)) {
            showToast(`Zor Mod: Kelime "${letter}" harfini içermeli!`, true);
            return false;
        }
    }
    return true;
}

// YENİ FONKSİYON: Tur Skorunu Hesaplama (vsCPU/Multiplayer için)
function calculateRoundScore(guessesCount, didWin) {
    if (!didWin || guessesCount < 1 || guessesCount > GUESS_COUNT) return 0;
    
    // 1. Tahmin: 1000, 2. Tahmin: 800, ..., 6. Tahmin: 100
    const scoreMap = {
        1: 1000,
        2: 800,
        3: 600,
        4: 400,
        5: 200,
        6: 100 
    };
    
    return scoreMap[guessesCount] || 0;
}


// YENİ FONKSİYON: Günlük Skor Hesaplama
function calculateDailyScore(guessesCount, didWin) {
    if (!didWin) return 0;
    
    const scoreMap = {
        1: 100,
        2: 80,
        3: 60,
        4: 40,
        5: 20,
        6: 10
    };
    
    return scoreMap[guessesCount] || 0;
}

// YENİ FONKSİYON: Günlük Sonucu Veritabanına Kaydetme
export async function saveDailyResultToDatabase(userId, username, secretWord, didWin, guessCount, score) {
    const dayIndex = getDaysSinceEpoch();
    const wordLength = secretWord.length;
    // Benzersiz ID: Gün_HarfUzunluğu_KullanıcıID
    const docId = `${dayIndex}_${wordLength}_${userId}`; 
    const resultRef = doc(db, 'daily_leaderboard', docId);

    // Günlük skorun daha önce kaydedilip kaydedilmediğini kontrol et
    const docSnap = await getDoc(resultRef);

    if (docSnap.exists()) {
        return { success: false, message: "Skor zaten kaydedilmiş." };
    }

    try {
        await setDoc(resultRef, {
            dayIndex: dayIndex,
            wordLength: wordLength,
            userId: userId,
            username: username,
            secretWord: secretWord,
            didWin: didWin,
            guessCount: guessCount, 
            score: score,
            completedAt: serverTimestamp()
        }, { merge: true });

        showToast("Günlük skorunuz kaydedildi!");
        return { success: true };

    } catch (error) {
        console.error("Günlük skor kaydı başarısız:", error);
        showToast("Günlük skorunuz kaydedilemedi.", true);
        return { success: false, message: error.message };
    }
}


async function submitGuess() {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const playerState = localGameData.players[currentUserId];
    const currentRow = playerState.guesses.length;
    if (currentRow >= GUESS_COUNT || playerState.isWinner || playerState.isEliminated) return;
    if (!isBattleRoyale(gameMode) && localGameData.currentPlayerId !== currentUserId) {
        showToast("Sıra sende değil!", true);
        return;
    }
    let guessWord = '';
    for (let i = 0; i < wordLength; i++) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        const tileInner = tile.querySelector('.front');
        if (!tileInner || tileInner.textContent === '') {
            showToast("Kelime yeterince uzun değil!", true);
            shakeCurrentRow(wordLength, currentRow);
            return;
        }
        guessWord += tileInner.textContent;
    }
    if (localGameData.isHardMode && playerState.guesses.length > 0) {
        if (!checkHardMode(guessWord, playerState.guesses)) {
            shakeCurrentRow(wordLength, currentRow);
            return;
        }
    }
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
    const isValidWord = await checkWordValidity(guessWord);
    if (!isValidWord) {
        showToast("Kelime sözlükte bulunamadı!", true);
        shakeCurrentRow(wordLength, currentRow);
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }
    stopTurnTimer();
    const isOnlineMode = gameMode === 'multiplayer' || isBattleRoyale(gameMode);
    if (isOnlineMode) {
        try {
            const result = await submitMultiplayerGuess(state.getCurrentGameId(), guessWord, currentUserId, isBattleRoyale(gameMode));
            if (!result.success) {
                throw new Error(result.message || "Tahmin sunucuda işlenirken hata.");
            }
        } catch (error) {
            console.error("Online tahmin gönderimi hatası:", error);
            showToast(error.message || "Tahmin gönderilirken kritik bir hata oluştu.", true);
        } finally {
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        }
        return;
    }
    const secretWord = localGameData.secretWord;
    const colors = calculateColors(guessWord, secretWord);
    const newGuess = { word: guessWord, colors: colors };
    localGameData.players[currentUserId].guesses.push(newGuess);
    let isWinner = (guessWord === secretWord);
    if (isWinner) {
        localGameData.status = 'finished';
        localGameData.roundWinner = currentUserId;
    } else {
        if (localGameData.players[currentUserId].guesses.length >= GUESS_COUNT) {
            localGameData.status = 'finished';
            localGameData.roundWinner = null;
        } else if (gameMode === 'vsCPU') {
            localGameData.currentPlayerId = 'cpu';
        }
    }
    
    // SKORLAMA DÜZELTMESİ (vsCPU için puan toplama)
    const didWin = localGameData.roundWinner === currentUserId;
    const guessCount = didWin ? localGameData.players[currentUserId].guesses.length : 0;
    
    if (gameMode === 'vsCPU' && localGameData.status === 'finished' && didWin) {
        // vsCPU modunda ve kazandıysa tur skorunu hesapla ve topla
        const roundScore = calculateRoundScore(guessCount, true);
        // ÖNEMLİ: Oyuncunun toplam skorunu güncelle
        localGameData.players[currentUserId].score += roundScore; 
    }
    
    if (localGameData.status === 'finished') {
        await updateStats(didWin, guessCount);
        
        if (gameMode === 'daily') {
            // ÖNEMLİ DÜZELTME: Kazananı da kaydedelim ki, restoreDailyGame doğru çalışsın.
            if(didWin) localGameData.roundWinner = currentUserId; 
            
            saveDailyGameState(localGameData);
            
            // YENİ GÜNLÜK SIRALAMA KAYIT İŞLEMİ
            const dailyScore = calculateDailyScore(guessCount, didWin);
            await saveDailyResultToDatabase(
                currentUserId, 
                getUsername(), 
                localGameData.secretWord, 
                didWin, 
                localGameData.players[currentUserId].guesses.length, 
                dailyScore
            );
            // KONTROL İÇİN: localGameData'ya puanı ekle
            localGameData.players[currentUserId].dailyScore = dailyScore; 
        }
    }
    
    renderGameState(localGameData, true).then(() => {
        if (localGameData.status === 'finished') {
            setTimeout(() => showScoreboard(localGameData), wordLength * 300);
        } else if (gameMode === 'vsCPU' && localGameData.currentPlayerId === 'cpu') {
            // CPU'nun oynaması için renderGameState'in içinde gerekli tetikleme zaten var.
            // Burada tekrar çağırırsak çift oynar. renderGameState'in CPU'yu tetiklemesi yeterlidir.
        }
    });
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
}

export async function failTurn(guessWord = '') {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;
    const currentUserId = state.getUserId();
    const gameMode = state.getGameMode();
    const playerState = localGameData.players[currentUserId];
    const currentRow = playerState.guesses.length;
    if (!isBattleRoyale(gameMode) && localGameData.currentPlayerId !== currentUserId) return;
    if (playerState.isEliminated || playerState.isWinner || currentRow >= GUESS_COUNT) return;
    stopTurnTimer();
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
    
    if (gameMode === 'vsCPU' || gameMode === 'daily') {
        const newGuess = { word: guessWord.padEnd(wordLength, ' '), colors: Array(wordLength).fill('failed') };
        localGameData.players[currentUserId].guesses.push(newGuess);
        localGameData.status = 'finished'; // Zaman bittiği için oyun biter
        localGameData.roundWinner = null;
        
        await updateStats(false, 0); // İstatistikleri güncelle (kayıp)
        
        if (gameMode === 'daily') {
             // Günlük oyunu kaydet (durum 'finished' olarak kaydedilecek)
             saveDailyGameState(localGameData); 
             
             // Kaybetme durumunda 0 puanı veritabanına kaydet
             await saveDailyResultToDatabase(
                currentUserId, 
                getUsername(), 
                localGameData.secretWord, 
                false, 
                GUESS_COUNT, 
                0
            );
            localGameData.players[currentUserId].dailyScore = 0;
            
        } else if (gameMode === 'vsCPU') {
            // vsCPU'da tur bittiğinde CPU'nun oynamasına gerek yok, maç bitti.
            localGameData.roundWinner = 'cpu'; // CPU kazanmış sayılabilir.
        }
        
        renderGameState(localGameData, true).then(() => {
            setTimeout(() => showScoreboard(localGameData), wordLength * 300);
        });
        
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }
    
    const gameId = state.getCurrentGameId();
    if (gameId) {
        try {
            const result = await failMultiplayerTurn(gameId, currentUserId);
            if (!result.success) {
                showToast(result.message || "Tur sonlandırma hatası.", true);
            }
        } catch (error) {
            console.error("Fail turn hatası:", error);
            showToast("Tur sonlandırılırken sunucu hatası.", true);
        } finally {
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        }
    } else {
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
    }
}

export function handleKeyPress(key) {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const playerState = localGameData.players[currentUserId];
    if (!playerState) return;
    const isPlayerActive = playerState.guesses.length < GUESS_COUNT && !playerState.isWinner;
    const isOnlineMode = gameMode === 'multiplayer';
    const isMyTurnOnline = isOnlineMode && localGameData.currentPlayerId === currentUserId;
    const isLocalMode = ['daily', 'vsCPU', 'series', 'single'].includes(gameMode);
    const canPlay = isPlayerActive && (isLocalMode || isMyTurnOnline || isBattleRoyale(gameMode));
    if (!canPlay) return;
    const processedKey = key.toLocaleUpperCase('tr-TR');
    if (processedKey === 'ENTER') {
        playSound('click');
        submitGuess();
    } else if (processedKey === '⌫' || processedKey === 'BACKSPACE') {
        playSound('click');
        deleteLetter();
    } else if ("ERTYUIOPĞÜASDFGHJKLŞİZC VBNMÖÇ".includes(processedKey)) {
        addLetter(processedKey);
    }
}

function addLetter(letter) {
    const localGameData = state.getLocalGameData();
    if (!localGameData) return;
    const currentRow = localGameData.players[state.getUserId()]?.guesses.length || 0;
    if (currentRow >= GUESS_COUNT) return;
    for (let i = 0; i < wordLength; i++) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        if (tile && tile.querySelector('.front').textContent === '') {
            tile.querySelector('.front').textContent = letter;
            playSound('click');
            break;
        }
    }
}

function deleteLetter() {
    const localGameData = state.getLocalGameData();
    if (!localGameData) return;
    const currentRow = localGameData.players[state.getUserId()]?.guesses.length || 0;
    if (currentRow >= GUESS_COUNT) return;
    for (let i = wordLength - 1; i >= 0; i--) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        if (tile && tile.querySelector('.front').textContent !== '') {
            tile.querySelector('.front').textContent = '';
            break;
        }
    }
}

function calculateColors(guess, secret) {
    const secretLetters = secret.split('');
    const guessLetters = guess.split('');
    const colors = Array(guess.length).fill('absent');
    const letterCounts = {};
    for (const letter of secretLetters) {
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
    }
    for (let i = 0; i < guess.length; i++) {
        if (guessLetters[i] === secretLetters[i]) {
            colors[i] = 'correct';
            letterCounts[guessLetters[i]]--;
        }
    }
    for (let i = 0; i < guess.length; i++) {
        if (colors[i] !== 'correct' && secret.includes(guessLetters[i]) && letterCounts[guessLetters[i]] > 0) {
            colors[i] = 'present';
            letterCounts[guessLetters[i]]--;
        }
    }
    return colors;
}

// *** DÜZELTME 3: Daha zeki CPU mantığı için findBestCpuGuess yeniden yazıldı ***
function findBestCpuGuess() {
    const localGameData = state.getLocalGameData();
    // Oyuncunun ve CPU'nun yaptığı tüm tahminleri tek bir listede topluyoruz.
    const playerGuesses = localGameData.players[state.getUserId()]?.guesses || []; 
    const cpuGuesses = localGameData.players['cpu']?.guesses || [];
    const allGuesses = [...playerGuesses, ...cpuGuesses];

    const wordLenStr = String(localGameData.wordLength);
    // Tüm kelime listesi artık kelimeler.json'dan geliyor.
    let possibleWords = [...(allWordList[wordLenStr] || [])]; 
    
    // Filtreleme Kriterleri
    const correctLetters = {}; // Yeşil (Pozisyon ve harf doğru)
    const presentLetters = new Set(); // Sarı (Harf var, pozisyon yanlış)
    const absentLetters = new Set(); // Gri (Harf yok)
    const positionMisplaced = {}; // Sarı harflerin olmaması gereken pozisyonlar

    // Önceki tahminleri analiz et
    allGuesses.forEach(g => {
        for (let i = 0; i < g.word.length; i++) {
            const letter = g.word[i];
            const color = g.colors[i];

            if (color === 'correct') {
                correctLetters[i] = letter;
                presentLetters.add(letter); // Yeşil harf aynı zamanda mevcut (sarı) harftir
            } else if (color === 'present') {
                presentLetters.add(letter);
                // Harf kelimede var ama bu pozisyonda değil
                if (!positionMisplaced[letter]) positionMisplaced[letter] = new Set();
                positionMisplaced[letter].add(i);
            } else if (color === 'absent') {
                // Eğer harf daha önce sarı veya yeşil bulunmadıysa, tamamen yok say.
                // Eğer gri işaretlendiği halde aynı harf başka bir pozisyonda sarı/yeşil ise, 
                // bu griyi yoksaymamız gerekir.
                let isKnownPresent = false;
                for (let k = 0; k < g.word.length; k++) {
                    if ((g.colors[k] === 'correct' || g.colors[k] === 'present') && g.word[k] === letter) {
                        isKnownPresent = true;
                        break;
                    }
                }
                
                // Eğer bu harfin yeşil/sarı olduğu başka bir ipucu yoksa, bu harf kesinlikle kelimede YOKTUR.
                if (!isKnownPresent) {
                    absentLetters.add(letter);
                }
            }
        }
    });

    // Filtreleme Mantığı
    possibleWords = possibleWords.filter(word => {
        // 1. Yeşil (Doğru Pozisyon) Kontrolü
        for (const pos in correctLetters) {
            if (word[pos] !== correctLetters[pos]) return false;
        }

        // 2. Gri (Yok) Kontrolü
        for (const letter of absentLetters) {
            if (word.includes(letter)) return false;
        }

        // 3. Sarı (Mevcut) Kontrolü
        for (const letter of presentLetters) {
            if (!word.includes(letter)) return false; // Sarı/Yeşil harflerin kelimede olması ZORUNLU
        }

        // 4. Sarı (Yanlış Pozisyon) Kontrolü
        for (const letter in positionMisplaced) {
             for (const pos of positionMisplaced[letter]) {
                if (word[pos] === letter) return false; // Sarı harf, daha önce sarı olduğu pozisyonda olmamalı
             }
        }

        return true;
    });
    
    // Daha önce tahmin edilen kelimeleri ele
    const guessedWords = new Set(allGuesses.map(g => g.word));
    const finalWords = possibleWords.filter(w => !guessedWords.has(w));
    
    // Mümkün olan kelimeler arasından rastgele birini seç
    if (finalWords.length > 0) {
        // CPU'yu biraz daha akıllı göstermek için, kalan kelime sayısı az ise 
        // ilk bulunanı seçmek yerine, rastgele birini seçeriz.
        return finalWords[Math.floor(Math.random() * finalWords.length)];
    } else {
        // Acil durum: Filtreleme çok katı olduysa, sadece tahmin edilmeyen rastgele bir kelime seç
        const emergencyList = (allWordList[wordLenStr] || []).filter(w => !guessedWords.has(w));
        // CPU'nun asla kelime bulamama durumunu önler
        return emergencyList.length > 0 ? emergencyList[Math.floor(Math.random() * emergencyList.length)] : localGameData.secretWord;
    }
}
// *** DÜZELTME 3 BİTTİ ***


async function cpuTurn() {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status === 'finished' || localGameData.currentPlayerId !== 'cpu') {
        return;
    }
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
    // DÜZELTME 4: CPU'nun bekleme süresi, oyuncunun görsel işlemesini bitirmesi için yeterli olmalı.
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    
    const guess = findBestCpuGuess();
    
    if (!guess || guess === localGameData.secretWord) { // Not: Eğer tahmini, gizli kelime ise, son tahmin olarak kullan.
        // Filtreleme çok katıysa veya kelimeyi bulduysa
        const finalGuess = guess || localGameData.secretWord;
        
        // Eğer finalGuess hâlâ boşsa, bu çok nadir bir durumdur, oyuncuya geri ver.
        if(!finalGuess) {
            console.error("CPU tahmin edecek kelime bulamadı. Sıra oyuncuya geri veriliyor.");
            localGameData.currentPlayerId = state.getUserId();
            await renderGameState(localGameData);
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
            return;
        }
    }
    
    const secretWord = localGameData.secretWord;
    const colors = calculateColors(guess, secretWord);
    
    const newGuess = {
        word: guess,
        colors: colors
    };
    localGameData.players['cpu'].guesses.push(newGuess);
    
    if (guess === secretWord) {
        localGameData.status = 'finished';
        localGameData.roundWinner = 'cpu';
    } else if (localGameData.players[state.getUserId()].guesses.length >= GUESS_COUNT && localGameData.players['cpu'].guesses.length >= GUESS_COUNT) {
        localGameData.status = 'finished';
        localGameData.roundWinner = null;
    } else {
        localGameData.currentPlayerId = state.getUserId();
    }
    
    const cpuGuessCount = localGameData.players['cpu'].guesses.length;
    
    if (localGameData.status === 'finished' && localGameData.roundWinner === 'cpu') {
        // CPU kazandıysa, CPU'nun skorunu hesapla ve topla
        const roundScore = calculateRoundScore(cpuGuessCount, true);
        // ÖNEMLİ: CPU'nun toplam skorunu güncelle
        localGameData.players['cpu'].score += roundScore;
    }
    
    await renderGameState(localGameData, true);
    
    if (localGameData.status === 'finished') {
        await updateStats(localGameData.roundWinner === state.getUserId(), localGameData.roundWinner === state.getUserId() ? localGameData.players[state.getUserId()].guesses.length : 0);
        setTimeout(() => showScoreboard(localGameData), wordLength * 300);
    }
    
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
}

async function updateStats(didWin, guessCount) {
    const currentUserId = state.getUserId();
    const gameMode = state.getGameMode();
    const currentUserProfile = state.getCurrentUserProfile();
    if (gameMode === 'multiplayer' || isBattleRoyale(gameMode) || !currentUserId) return;
    const userRef = doc(db, 'users', currentUserId);
    const stats = getStatsFromProfile(currentUserProfile);
    stats.played += 1;
    if (didWin) {
        stats.wins += 1;
        stats.currentStreak += 1;
        if (stats.currentStreak > stats.maxStreak) {
            stats.maxStreak = stats.currentStreak;
        }
        if (guessCount >= 1 && guessCount <= 6) {
            stats.guessDistribution[String(guessCount)] += 1;
        }
    } else {
        stats.currentStreak = 0;
    }
    try {
        await setDoc(userRef, {
            stats: stats
        }, {
            merge: true
        });
        const updatedProfile = { ...currentUserProfile,
            stats: stats
        };
        state.setCurrentUserProfile(updatedProfile);
    } catch (error) {
        console.error("İstatistikler güncellenemedi:", error);
    }
}

// YENİ FONKSİYON: Günlük Sıralamayı Çekme ve Hesaplama
export async function getDailyLeaderboardStats(currentUserId, secretWord) {
    const dayIndex = getDaysSinceEpoch();
    const wordLength = secretWord.length;
    
    try {
        const leaderboardRef = collection(db, 'daily_leaderboard');
        
        // O gün ve o kelime uzunluğunda oynayan tüm oyuncuları çek (Sadece kazananlar)
        const q = query(leaderboardRef, 
            where('dayIndex', '==', dayIndex),
            where('wordLength', '==', wordLength),
            where('score', '>', 0), // Sadece puanı olanları sıralamaya dahil et
            orderBy('score', 'desc'), 
            orderBy('guessCount', 'asc'), 
            orderBy('completedAt', 'asc')
        );
        
        const querySnapshot = await getDocs(q);
        const results = [];
        
        let userPosition = 0;
        let totalScoreSum = 0;

        querySnapshot.forEach((doc, index) => {
            const data = doc.data();
            
            if (data.userId === currentUserId) {
                userPosition = index + 1; 
            }
            results.push(data);
            totalScoreSum += data.score;
        });

        // Tüm oynayanları sayma (Skor 0 olanlar dahil, ortalama hesaplaması için)
        const allPlayedQuery = query(leaderboardRef, 
            where('dayIndex', '==', dayIndex),
            where('wordLength', '==', wordLength)
        );
        const allPlayedSnapshot = await getDocs(allPlayedQuery);
        const allPlayedCount = allPlayedSnapshot.size;

        // Ortalama istatistikleri hesaplama
        let totalGuesses = 0;
        let totalWins = 0;
        results.forEach(res => {
            totalGuesses += res.guessCount;
            totalWins++;
        });
        
        // Ortalama hesaplamaları
        const avgGuesses = totalWins > 0 ? (totalGuesses / totalWins).toFixed(1) : 'N/A';
        const avgScore = allPlayedCount > 0 ? (totalScoreSum / allPlayedCount).toFixed(0) : 'N/A';

        // Kullanıcının sonucunu tüm listesinden al
        const userResult = allPlayedSnapshot.docs.find(doc => doc.data().userId === currentUserId)?.data();
        const userGuessCount = userResult?.didWin ? userResult.guessCount : 'X';
        const userScore = userResult?.score || 0;

        return {
            userPosition,
            totalPlayers: allPlayedCount, // Toplam oynayan sayısı
            userGuessCount,
            userScore,
            avgGuesses,
            avgScore,
            leaderboard: results.slice(0, 3) 
        };

    } catch (error) {
        console.error("Günlük sıralama verileri çekilirken hata:", error);
        return null;
    }
}

// EXPORT ANAHTAR KELİMESİ EKLENDİ
export async function startNewRound() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    
    // Daily modunda Ana Menüye dönülür
    if (gameMode === 'daily') {
        leaveGame();
        return;
    }
    
    if (gameMode === 'vsCPU' || gameMode === 'multiplayer') {
        if (!localGameData) return;
        
        // 1. Maç Bitti mi? (currentRound >= matchLength)
        if (localGameData.currentRound >= localGameData.matchLength) {
            // Maç bittiyse, yeni bir maç başlatmak için ana menüye döneriz.
            if (gameMode === 'multiplayer') {
                leaveGame(); // Ana Menüye dön
            } else {
                // vsCPU modunda yeni bir maç başlat
                startNewGame({ mode: gameMode });
            }
            return;
        }
        
        // 2. Yeni Tur Başlatma
        const newWordLength = getRandomWordLength();
        const newSecretWord = await getNewSecretWord(newWordLength);
        if (!newSecretWord) return showToast("Yeni kelime alınamadı.", true);
        
        if (gameMode === 'multiplayer') {
            // MULTIPLAYER: Firebase'i Güncelle
            const updates = {
                wordLength: newWordLength,
                secretWord: newSecretWord,
                status: 'playing',
                currentRound: localGameData.currentRound + 1,
                // Turu, bir önceki turu kim kazandıysa ona veririz (Veya sırayla)
                currentPlayerId: localGameData.creatorId, 
                roundWinner: null, // Yeni turda kazanan sıfırlanır
                turnStartTime: serverTimestamp(),
                players: { ...localGameData.players }
            };
            for (const pid in updates.players) {
                updates.players[pid].guesses = []; // Tahminler sıfırlanır
            }
            
            // Firebase güncellemesini yap
            await updateDoc(doc(db, 'games', state.getCurrentGameId()), updates);
            
        } else { // vsCPU
            // vsCPU: Yerel Durumu Güncelle
            localGameData.wordLength = newWordLength;
            localGameData.secretWord = newSecretWord;
            localGameData.status = 'playing';
            localGameData.currentRound += 1;
            localGameData.roundWinner = null;
            localGameData.currentPlayerId = state.getUserId(); // Oyuncuya geri ver
            localGameData.turnStartTime = new Date();
            for (const playerId in localGameData.players) {
                localGameData.players[playerId].guesses = [];
            }
            state.setLocalGameData(localGameData);
            showScreen('game-screen');
            initializeGameUI(localGameData);
            await renderGameState(localGameData);
        }
    } else {
        startNewGame({ mode: gameMode });
    }
}


export async function showScoreboard(gameData) {
    stopTurnTimer();
    showScreen('scoreboard-screen');
    const roundWinnerDisplay = document.getElementById('round-winner-display');
    const correctWordDisplay = document.getElementById('correct-word-display');
    const finalScores = document.getElementById('final-scores');
    const matchWinnerDisplay = document.getElementById('match-winner-display');
    const meaningDisplay = document.getElementById('word-meaning-display');
    const newRoundBtn = document.getElementById('new-round-btn');
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const dailyStatsContainer = document.getElementById('daily-stats-container');
    const defaultWordDisplayContainer = document.getElementById('default-word-display-container');
    const defaultRoundButtons = document.getElementById('default-round-buttons');


    if (!roundWinnerDisplay || !correctWordDisplay || !finalScores || !matchWinnerDisplay || !meaningDisplay || !newRoundBtn || !dailyStatsContainer || !defaultWordDisplayContainer || !defaultRoundButtons) return;
    
    // *** YENİ GÜNLÜK İSTATİSTİK BÖLÜMÜ ***
    if (gameMode === 'daily') {
        const dailyStats = await getDailyLeaderboardStats(currentUserId, gameData.secretWord);
        
        dailyStatsContainer.classList.remove('hidden');
        
        if (dailyStats) {
            dailyStatsContainer.innerHTML = `
                <div class="w-full mx-auto"> 
                    <div class="grid grid-cols-2 gap-4 text-center mb-6 mt-4">
                        <div class="bg-gray-700 p-4 rounded-lg">
                            <p class="text-4xl font-extrabold text-white">${dailyStats.userScore}</p>
                            <p class="text-sm text-gray-400">Kazandığın Puan</p>
                        </div>
                        <div class="bg-gray-700 p-4 rounded-lg">
                            <p class="text-4xl font-extrabold text-white">${dailyStats.avgScore}</p>
                            <p class="text-sm text-gray-400">Ortalama Puan</p>
                        </div>
                        <div class="bg-gray-700 p-4 rounded-lg">
                            <p class="text-4xl font-extrabold text-white">${dailyStats.userGuessCount}</p>
                            <p class="text-sm text-gray-400">Deneme Sayın</p>
                        </div>
                        <div class="bg-gray-700 p-4 rounded-lg">
                            <p class="text-4xl font-extrabold text-white">${dailyStats.avgGuesses}</p>
                            <p class="text-sm text-gray-400">Ort. Deneme Sayısı</p>
                        </div>
                    </div>
                    
                    <h4 class="text-xl font-bold mb-2">Günlük Pozisyonun</h4>
                    <p class="text-3xl font-extrabold text-yellow-500 mb-2">
                        ${dailyStats.userPosition > 0 
                            ? dailyStats.userPosition + '. sıradayız!' 
                            : dailyStats.userScore > 0 
                                ? 'Sıralama Hesaplanıyor...' 
                                : 'Sıralamaya girmek için kazanmalısın.'
                        }
                    </p>
                    <p class="text-sm text-gray-400">Toplam ${dailyStats.totalPlayers} kişi arasında.</p>
                    
                    <div class="mt-6 mb-4">
                        <p>Doğru Kelime: <strong class="text-green-400 text-xl">${gameData.secretWord}</strong></p>
                        <p id="word-meaning-display-daily" class="text-sm text-gray-400 mt-2 italic">Anlam yükleniyor...</p>
                    </div>
                </div>
            `;
            
            // KELİME ANLAMINI YÜKLE
            const meaningDisplayEl = document.getElementById('word-meaning-display-daily'); // ID'si daily-stats-container içindeki p etiketi
            const meaning = await fetchWordMeaning(gameData.secretWord);
            if(meaningDisplayEl) meaningDisplayEl.textContent = meaning;

        } else {
             dailyStatsContainer.innerHTML = `<p class="text-gray-400">Günlük sıralama bilgileri yüklenemedi.</p>`;
        }
        
        // ORİJİNAL SKOR TABLOSU ELEMENTLERİNİ GİZLE
        finalScores.style.display = 'none';
        matchWinnerDisplay.style.display = 'none';
        newRoundBtn.classList.add('hidden'); 
        defaultWordDisplayContainer.style.display = 'none'; // Kelime/anlam kapsayıcısını gizle
        
        // roundWinnerDisplay'i SADECE BAŞLIK İÇİN KULLAN
        roundWinnerDisplay.textContent = gameData.roundWinner === currentUserId ? "Tebrikler, Kazandın!" : `Kaybettin! Cevap: ${gameData.secretWord}`;
        playSound(gameData.roundWinner === currentUserId ? 'win' : 'lose');
        
        // Ana Buton Grubunun Görünürlüğünü Ayarla
        defaultRoundButtons.style.display = 'flex';
        // Ana Menü butonunun metnini ayarla
        document.getElementById('main-menu-btn').textContent = "Ana Menüye Dön";
        
        return; 
    }
    // *** GÜNLÜK İSTATİSTİK BÖLÜMÜ SONU ***
    
    // Daily modu değilse, orijinal elementleri göster
    dailyStatsContainer.classList.add('hidden');
    defaultWordDisplayContainer.style.display = 'block';
    defaultRoundButtons.style.display = 'flex'; // Çoklu oyuncu/CPU için görünür yap

    const showScores = gameMode === 'multiplayer' || gameMode === 'vsCPU';
    finalScores.style.display = showScores ? 'block' : 'none';
    matchWinnerDisplay.style.display = showScores ? 'block' : 'none';

    if (gameData.roundWinner && gameData.players[gameData.roundWinner]) {
        const winnerName = gameData.players[gameData.roundWinner].username || 'Bilgisayar';
        roundWinnerDisplay.textContent = (gameData.roundWinner === currentUserId) ? "Tebrikler, Turu Kazandın!" : `Turu ${winnerName} Kazandı!`;
        playSound(gameData.roundWinner === currentUserId ? 'win' : 'lose');
    } else {
        roundWinnerDisplay.textContent = `Kaybettin! Doğru kelime: ${gameData.secretWord}`;
        playSound('lose');
    }
    correctWordDisplay.textContent = gameData.secretWord;
    meaningDisplay.textContent = 'Anlam yükleniyor...';
    const meaning = await fetchWordMeaning(gameData.secretWord);
    meaningDisplay.textContent = meaning;
    if (showScores) {
        finalScores.innerHTML = `<h3 class="text-xl font-bold mb-2 text-center">Toplam Puan</h3>`;
        const sortedPlayers = Object.entries(gameData.players).map(([id, data]) => ({ ...data,
            id
        })).sort((a, b) => (b.score || 0) - (a.score || 0));
        sortedPlayers.forEach(player => {
            const scoreEl = document.createElement('p');
            scoreEl.className = 'text-lg';
            scoreEl.textContent = `${player.username}: ${player.score || 0} Puan`,
                finalScores.appendChild(scoreEl);
        });
    }
    matchWinnerDisplay.textContent = '';
    newRoundBtn.classList.remove('hidden');
    if (gameMode === 'vsCPU' || gameMode === 'multiplayer') {
        if (gameData.currentRound < gameData.matchLength) {
            newRoundBtn.textContent = 'Sonraki Kelime';
        } else {
            newRoundBtn.textContent = 'Yeniden Oyna';
            if (showScores) {
                const sortedPlayers = Object.entries(gameData.players).map(([id, data]) => ({ ...data,
                    id
                })).sort((a, b) => (b.score || 0) - (a.score || 0));
                if (sortedPlayers.length > 1 && sortedPlayers[0].score > sortedPlayers[1].score) {
                    matchWinnerDisplay.textContent = `MAÇI ${sortedPlayers[0].username} KAZANDI!`;
                } else if (sortedPlayers.length > 1 && sortedPlayers[0].score < sortedPlayers[1].score) {
                    matchWinnerDisplay.textContent = `MAÇI ${sortedPlayers[1].username} KAZANDI!`;
                } else if (sortedPlayers.length > 1) {
                    matchWinnerDisplay.textContent = 'MAÇ BERABERE!';
                }
            }
        }
    } else {
        newRoundBtn.textContent = 'Yeni Günün Kelimesi'; 
    }
}

function startTurnTimer() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    if (isBattleRoyale(gameMode) || gameMode === 'daily') return;
    stopTurnTimer();
    if (localGameData.status !== 'playing' || localGameData.currentPlayerId !== state.getUserId()) return;
    let turnStartTime = (localGameData.turnStartTime?.toDate) ?
        localGameData.turnStartTime.toDate() :
        new Date();
    const interval = setInterval(async () => {
        let now = new Date();
        let elapsed = Math.floor((now - turnStartTime) / 1000);
        let timeLeft = timeLimit - elapsed;
        if (timerDisplay) {
            timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
            if (timeLeft <= 5) timerDisplay.classList.add('text-red-500');
            else timerDisplay.classList.remove('text-red-500');
        }
        if (timeLeft <= 0) {
            stopTurnTimer();
            await failTurn('');
        }
    }, 1000);
    state.setTurnTimerInterval(interval);
}

function startBRTimer() {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;
    stopTurnTimer();
    const turnStartTime = localGameData.turnStartTime.toDate();
    const interval = setInterval(async () => {
        let now = new Date();
        let elapsed = Math.floor((now - turnStartTime) / 1000);
        let timeLeft = timeLimit - elapsed;
        if (timerDisplay) {
            timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
            if (timeLeft <= 5) timerDisplay.classList.add('text-red-500');
            else timerDisplay.classList.remove('text-red-500');
        }
        if (timeLeft <= 0) {
            stopTurnTimer();
            await failMultiplayerTurn(state.getCurrentGameId(), state.getUserId());
        }
    }, 1000);
    state.setTurnTimerInterval(interval);
}

export function stopTurnTimer() {
    clearInterval(state.getTurnTimerInterval());
    state.setTurnTimerInterval(null);
    if (timerDisplay) timerDisplay.textContent = '';
}

export function leaveGame() {
    const gameUnsubscribe = state.getGameUnsubscribe();
    if (gameUnsubscribe) gameUnsubscribe();
    stopTurnTimer();
    localStorage.removeItem('activeGameId');
    state.setGameUnsubscribe(null);
    state.setCurrentGameId(null);
    state.setLocalGameData(null);
    showScreen('main-menu-screen');
    const rejoinBtn = document.getElementById('rejoin-game-btn');
    if (rejoinBtn) rejoinBtn.classList.add('hidden');
}

export function startGame() {
    const gameId = state.getCurrentGameId();
    if (!gameId) return;
    const gameRef = doc(db, "games", gameId);
    updateDoc(gameRef, {
        status: 'playing',
        turnStartTime: serverTimestamp()
    });
}

export async function joinBRGame(gameId) { /* Bu fonksiyon değişmedi */ }
export async function createBRGame() { /* Bu fonksiyon değişmedi */ }