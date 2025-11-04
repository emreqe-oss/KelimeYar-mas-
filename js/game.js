// js/game.js - GÜNCEL VE TAM KOD (TÜM DÜZELTMELER DAHİL)

// Firebase v9'dan gerekli modülleri içe aktar
import { 
    db, 
    getNewSecretWord, 
    checkWordValidity, 
    submitMultiplayerGuess, 
    failMultiplayerTurn, 
    getWordMeaning, 
    startNextBRRound
} from './firebase.js';

// Firestore modüllerini içe aktar
import {
    collection, query, where, limit, getDocs, getDoc, doc, setDoc, updateDoc,
    runTransaction, onSnapshot, serverTimestamp, arrayUnion, orderBy, deleteField
} from "firebase/firestore"; // deleteField eklendi

// Diğer modülleri ve kelime listelerini içe aktar
import * as state from './state.js';
import { showToast, playSound, shakeCurrentRow, getStatsFromProfile } from './utils.js';
import { showScreen, createGrid, createKeyboard, updateKeyboard, getUsername, displayStats, guessGrid, turnDisplay, timerDisplay, gameIdDisplay, roundCounter, shareGameBtn, startGameBtn, keyboardContainer, updateMultiplayerScoreBoard } from './ui.js';
import { default as allWordList } from '../functions/kelimeler.json'; 


// Sabitler ve yardımcı fonksiyonlar
const GUESS_COUNT = 6;
const MAX_BR_PLAYERS = 4;
let wordLength = 5;
let timeLimit = 45; // Bu, sıralı oyunlar için varsayılandır, BR için sunucudan gelir

const DAILY_WORD_LENGTHS = [4, 5, 6]; 

const getRandomWordLength = () => DAILY_WORD_LENGTHS[Math.floor(Math.random() * DAILY_WORD_LENGTHS.length)];
function isBattleRoyale(mode) { return mode === 'multiplayer-br'; }

/**
 * Türkiye Saatini (TRT) baz alarak epoch'tan bu yana geçen gün sayısını hesaplar.
 */
function getDaysSinceEpoch() {
    const now = new Date();
    const trtOffset = 3 * 60 * 60 * 1000;
    const todayTRT = new Date(now.getTime() + trtOffset);
    
    const epoch = new Date('2024-01-01');
    
    const startOfTodayTRT = new Date(todayTRT.getFullYear(), todayTRT.getMonth(), todayTRT.getDate());
    
    return Math.floor((startOfTodayTRT - epoch) / (1000 * 60 * 60 * 24));
}

// *** Modül İçi Yardımcı Fonksiyonlar ***

export function initializeGameUI(gameData) {
    wordLength = gameData.wordLength;
    timeLimit = gameData.timeLimit;
    
    if (guessGrid) {
        guessGrid.innerHTML = ''; 

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

export function updateTurnDisplay(gameData) {
    if (!turnDisplay || !timerDisplay || !startGameBtn || !shareGameBtn) return;
    
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const numPlayers = Object.keys(gameData.players).length;
    
    const isBR = isBattleRoyale(gameMode);
    
    // BATTLE ROYALE MODU (GÜNCELLENDİ)
    if (isBR) {
        timerDisplay.textContent = gameData.timeLimit || 60; // BR 60 saniye
        const brWaitingForPlayers = document.getElementById('br-waiting-for-players');
        const playerState = gameData.players[currentUserId] || {};

        if (gameData.status === 'waiting') {
            turnDisplay.textContent = `Oyuncu bekleniyor (${numPlayers}/${MAX_BR_PLAYERS})...`;
            startGameBtn.classList.toggle('hidden', currentUserId !== gameData.creatorId || numPlayers < 2);
            shareGameBtn.classList.remove('hidden');
            if (brWaitingForPlayers) brWaitingForPlayers.classList.remove('hidden');

        } else if (gameData.status === 'playing') {
            startGameBtn.classList.add('hidden');
            if (playerState.isEliminated) {
                turnDisplay.textContent = "✖️ Elendin!";
                turnDisplay.classList.remove('pulsate');
            
            // --- GÜNCELLEME: hasSolved ve hasFailed eklendi ---
            } else if (playerState.hasSolved) {
                turnDisplay.textContent = "✅ Çözdün! Bekle..."; 
                turnDisplay.classList.add('pulsate', 'text-green-500');
            } else if (playerState.hasFailed) {
                turnDisplay.textContent = "❌ Hak Bitti! Bekle...";
                turnDisplay.classList.remove('pulsate');
            // --- GÜNCELLEME SONU ---

            } else {
                turnDisplay.textContent = "Tahmin Yap!";
                turnDisplay.classList.add('pulsate');
            }
            if (brWaitingForPlayers) brWaitingForPlayers.classList.add('hidden');
            
        } else if (gameData.status === 'finished') {
             // Maç bitiş durumunu kontrol et
             if(gameData.matchWinnerId !== undefined) { // null (berabere) veya ID (kazanan)
                turnDisplay.textContent = "👑 MAÇ BİTTİ!";
             } else {
                turnDisplay.textContent = "TUR BİTTİ";
             }
            startGameBtn.classList.add('hidden');
        }
        return;
    }
    
    // SIRALI VE DİĞER MODLAR
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


export async function renderGameState(gameData, animateLastRow = false) {
    const currentUserId = state.getUserId();
    
    const oldGameData = state.getLocalGameData();
    const oldPlayerId = oldGameData?.currentPlayerId;
    const isMyTurnNow = gameData.currentPlayerId === currentUserId;

    if (oldPlayerId && oldPlayerId !== currentUserId && isMyTurnNow) {
        playSound('turn');
    }
    
    if (!gameData) return;
    const gameMode = state.getGameMode();
    const isBR = isBattleRoyale(gameMode);
    const sequentialGameInfo = document.getElementById('sequential-game-info');
    
    if (sequentialGameInfo) {
        sequentialGameInfo.classList.toggle('hidden', gameMode !== 'multiplayer' && gameMode !== 'multiplayer-br');
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
        if (isBR && roundCounter) roundCounter.textContent = `Tur ${gameData.currentRound || 1}`;
    }
    
    timeLimit = gameData.timeLimit || 45;
    
    const playerState = gameData.players[currentUserId] || {};
    if (isBR && (playerState.isEliminated || playerState.hasSolved || playerState.hasFailed)) {
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
    } else {
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
    }

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
        if (isBR && !playerState.isEliminated && !playerState.hasSolved && !playerState.hasFailed) startBRTimer();
        else if (gameMode === 'multiplayer' && gameData.currentPlayerId === currentUserId) startTurnTimer();
        else if (gameMode === 'vsCPU' && gameData.currentPlayerId === 'cpu') {
            setTimeout(cpuTurn, 1500);
        }
    } else {
        stopTurnTimer();
    }
}

export async function fetchWordMeaning(word) {
    try {
        const result = await getWordMeaning(word); 
        return result.meaning || "Anlamı bulunamadı.";
    } catch (error) {
        console.error("Anlam alınırken Cloud Function hatası:", error);
        return "Anlam yüklenirken bir sorun oluştu. (Şu an bakımda)";
    }
}

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
        
        if (oldGameData && oldGameData.wordLength !== gameData.wordLength) {
            initializeGameUI(gameData);
        }

        const currentGuesses = gameData.players[state.getUserId()]?.guesses || [];
        const oldGuessesCount = oldGameData?.players[state.getUserId()]?.guesses.length || 0;
        const didMyGuessChange = currentGuesses.length > oldGuessesCount;

        if (gameData.status === 'finished') {
            renderGameState(gameData, didMyGuessChange).then(() => {
                const delay = isBattleRoyale(state.getGameMode()) ? wordLength * 300 + 1000 : wordLength * 300 + 500;
                setTimeout(() => showScoreboard(gameData), delay);
            });
        } else {
            renderGameState(gameData, didMyGuessChange);
        }
    }, (error) => { 
        console.error("Oyun dinlenirken bir hata oluştu:", error);
    });
    state.setGameUnsubscribe(unsubscribe);
}

// *** BAŞLATMA VE KATILMA FONKSİYONLARI ***

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
        playerIdsList.push(invitedFriendId);
    }

    const gameData = {
        gameId, wordLength: selectedLength, secretWord, timeLimit,
        creatorId: currentUserId, isHardMode: false, matchLength,
        players: { [currentUserId]: { username, guesses: [], score: 0 } },
        
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
        initializeGameUI(gameData);
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
                // Düzeltme: local veriyi doğru birleştir
                gameDataToJoin = { 
                    ...gameData, 
                    players: {
                        ...gameData.players,
                        [currentUserId]: { username, guesses: [], score: 0 }
                    },
                    playerIds: [...gameData.playerIds, currentUserId],
                    status: 'playing'
                }; 
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
        initializeGameUI(gameDataToJoin);
        listenToGameUpdates(gameId);

    } catch (error) {
        console.error("Error joining game:", error);
        showToast(error.message, true);
        localStorage.removeItem('activeGameId');
        leaveGame();
    }
}

function getDailySecretWord() {
    const dayIndex = getDaysSinceEpoch();
    
    const selectedLength = DAILY_WORD_LENGTHS[dayIndex % DAILY_WORD_LENGTHS.length];

    const dailyWordList = allWordList[String(selectedLength)];

    if (!dailyWordList || dailyWordList.length === 0) {
        console.error(`Kelimeler listesinde ${selectedLength} harfli kelime bulunamadı.`);
        return allWordList["5"][dayIndex % allWordList["5"].length]; 
    }
    
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
            secretWord = getDailySecretWord();
            
            if (!secretWord) {
                showToast("Günün kelimesi bulunamadı.", true);
                return;
            }

            const dailyState = getDailyGameState(); 
            
            if (dailyState && dailyState.secretWord === secretWord) {
                restoreDailyGame(dailyState);
                return; 
            }

            gameSettings.wordLength = secretWord.length;
            gameSettings.timeLimit = 60;
            gameSettings.matchLength = 1;
            break;

        default:
            showToast("Bilinmeyen oyun modu!", true);
            return;
    }

    if (!secretWord) {
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
        
        ...(config.mode === 'vsCPU' ? { players: { 
            [state.getUserId()]: { username: getUsername(), guesses: [], score: 0 },
            'cpu': { username: 'Bilgisayar', guesses: [], score: 0 } 
        } } : {}),
        currentPlayerId: state.getUserId(), status: 'playing', turnStartTime: new Date(), GUESS_COUNT: GUESS_COUNT,
        gameType: config.mode
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
        const savedWord = parsedState.secretWord;
        const currentDailyWord = getDailySecretWord();
        
        if (savedWord === currentDailyWord) {
             return parsedState;
        }
        
        return null;
    } catch (e) { return null; }
}

function saveDailyGameState(gameState) {
    const toSave = {
        date: new Date().toDateString(),
        guesses: gameState.players[state.getUserId()].guesses,
        status: gameState.status,
        secretWord: gameState.secretWord
    };
    localStorage.setItem(`dailyGameState_${state.getUserId()}`, JSON.stringify(toSave));
}

function restoreDailyGame(savedState) {
    const gameData = {
        wordLength: savedState.secretWord.length, 
        secretWord: savedState.secretWord, timeLimit: 60,
        isHardMode: false, currentRound: 1, matchLength: 1,
        roundWinner: savedState.status === 'finished' && savedState.guesses.length < GUESS_COUNT ? state.getUserId() : null,
        players: { [state.getUserId()]: { username: getUsername(), guesses: savedState.guesses, score: 0 } },
        currentPlayerId: state.getUserId(), status: savedState.status, turnStartTime: new Date(), GUESS_COUNT: GUESS_COUNT,
        gameType: 'daily'
    };
    state.setGameMode('daily');
    state.setLocalGameData(gameData);
    showScreen('game-screen');
    initializeGameUI(gameData);
    renderGameState(gameData).then(() => {
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
    for (const letter of presentLetters) {
        if (!guessWord.includes(letter)) {
            showToast(`Zor Mod: Kelime "${letter}" harfini içermeli!`, true);
            return false;
        }
    }
    return true;
}

function calculateRoundScore(guessesCount, didWin) {
    if (!didWin || guessesCount < 1 || guessesCount > GUESS_COUNT) return 0;
    
    const scoreMap = {
        1: 1000, 2: 800, 3: 600, 4: 400, 5: 200, 6: 100 
    };
    
    return scoreMap[guessesCount] || 0;
}

function calculateDailyScore(guessesCount, didWin) {
    if (!didWin) return 0;
    
    const scoreMap = {
        1: 100, 2: 80, 3: 60, 4: 40, 5: 20, 6: 10
    };
    
    return scoreMap[guessesCount] || 0;
}

export async function saveDailyResultToDatabase(userId, username, secretWord, didWin, guessCount, score) {
    const dayIndex = getDaysSinceEpoch();
    const wordLength = secretWord.length;
    const docId = `${dayIndex}_${wordLength}_${userId}`; 
    const resultRef = doc(db, 'daily_leaderboard', docId);

    const docSnap = await getDoc(resultRef);

    if (docSnap.exists()) {
        return { success: false, message: "Skor zaten kaydedilmiş." };
    }

    try {
        await setDoc(resultRef, {
            dayIndex: dayIndex, wordLength: wordLength, userId: userId, username: username,
            secretWord: secretWord, didWin: didWin, guessCount: guessCount, score: score,
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
    
    // --- DÜZELTME: playerState ve guesses kontrolü ---
    if (!playerState || playerState.isEliminated || playerState.hasSolved || playerState.hasFailed || (playerState.guesses && playerState.guesses.length >= GUESS_COUNT)) return;
    
    if (!isBattleRoyale(gameMode) && localGameData.currentPlayerId !== currentUserId) {
        showToast("Sıra sende değil!", true);
        return;
    }
    let guessWord = '';
    const currentRow = playerState.guesses ? playerState.guesses.length : 0;
    
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
                throw new Error(result.error || "Tahmin sunucuda işlenirken hata.");
            }
        } catch (error) {
            console.error("Online tahmin gönderimi hatası:", error);
            showToast(error.message || "Tahmin gönderilirken kritik bir hata oluştu.", true);
            // Hata durumunda klavyeyi tekrar aç ki oyuncu tekrar deneyebilsin (eğer hakları varsa)
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        }
        return;
    }
    
    // YEREL MOD (vsCPU, daily) MANTIĞI
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
            
            if (gameMode === 'vsCPU') { 
                localGameData.roundWinner = 'cpu'; 
            } else {
                localGameData.roundWinner = null;
            }
        } else if (gameMode === 'vsCPU') {
            localGameData.currentPlayerId = 'cpu';
        }
    }
    
    const didWin = localGameData.roundWinner === currentUserId;
    const guessCount = didWin ? localGameData.players[currentUserId].guesses.length : 0;
    
    if (localGameData.status === 'finished') { 
        await updateStats(didWin, guessCount);
        
        if (gameMode === 'daily') {
            if(didWin) localGameData.roundWinner = currentUserId; 
            
            saveDailyGameState(localGameData);
            
            const dailyScore = calculateDailyScore(guessCount, didWin);
            await saveDailyResultToDatabase(
                currentUserId, getUsername(), localGameData.secretWord, didWin, 
                localGameData.players[currentUserId].guesses.length, dailyScore
            );
            localGameData.players[currentUserId].dailyScore = dailyScore; 
        }
    }
    
    renderGameState(localGameData, true).then(() => {
        if (localGameData.status === 'finished') {
            setTimeout(() => showScoreboard(localGameData), wordLength * 300);
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
    
    // BR'de sürenin dolması, sunucu tarafından halledilir (failMultiplayerTurn)
    if (isBattleRoyale(gameMode)) return; 
    
    if (localGameData.currentPlayerId !== currentUserId) return;
    if (playerState.isEliminated || (playerState.guesses && playerState.guesses.length >= GUESS_COUNT)) return;
    
    stopTurnTimer();
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
    
    if (gameMode === 'vsCPU' || gameMode === 'daily') {
        const newGuess = { word: guessWord.padEnd(wordLength, ' '), colors: Array(wordLength).fill('failed') };
        localGameData.players[currentUserId].guesses.push(newGuess);
        localGameData.status = 'finished';
        localGameData.roundWinner = null;
        
        await updateStats(false, 0);
        
        if (gameMode === 'daily') {
             saveDailyGameState(localGameData); 
             await saveDailyResultToDatabase(
                 currentUserId, getUsername(), localGameData.secretWord, false, GUESS_COUNT, 0
             );
             localGameData.players[currentUserId].dailyScore = 0;
        } else if (gameMode === 'vsCPU') {
            localGameData.roundWinner = 'cpu';
        }
        
        renderGameState(localGameData, true).then(() => {
            setTimeout(() => showScoreboard(localGameData), wordLength * 300);
        });
        
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }
    
    // SIRALI MULTIPLAYER'DA TURU SONLANDIR
    const gameId = state.getCurrentGameId();
    if (gameId) {
        try {
            const result = await failMultiplayerTurn(gameId, currentUserId);
            if (!result.success) {
                showToast(result.error || "Tur sonlandırma hatası.", true);
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
    if (!playerState) {
        console.warn("handleKeyPress: Player state bulunamadı.");
        return;
    }
    
    // BR Kontrolü: Elenmiş veya çözmüşse oyuna devam edemez.
    if (playerState.isEliminated || playerState.hasSolved || playerState.hasFailed) { 
         showToast("Elenmiş/Çözmüş/Hakkı bitmiş oyuncu tahmin yapamaz.", true);
         return; 
    }
    
    const playerGuesses = playerState.guesses || [];
    const isPlayerActive = playerGuesses.length < GUESS_COUNT;
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
    const currentRow = (localGameData.players[state.getUserId()]?.guesses || []).length;
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
    const currentRow = (localGameData.players[state.getUserId()]?.guesses || []).length;
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

function findBestCpuGuess() {
    const localGameData = state.getLocalGameData();
    const playerGuesses = localGameData.players[state.getUserId()]?.guesses || []; 
    const cpuGuesses = localGameData.players['cpu']?.guesses || [];
    const allGuesses = [...playerGuesses, ...cpuGuesses];

    const wordLenStr = String(localGameData.wordLength);
    let possibleWords = [...(allWordList[wordLenStr] || [])]; 
    
    const correctLetters = {}; 
    const presentLetters = new Set(); 
    const absentLetters = new Set(); 
    const positionMisplaced = {}; 

    allGuesses.forEach(g => {
        for (let i = 0; i < g.word.length; i++) {
            const letter = g.word[i];
            const color = g.colors[i];

            if (color === 'correct') {
                correctLetters[i] = letter;
                presentLetters.add(letter);
            } else if (color === 'present') {
                presentLetters.add(letter);
                if (!positionMisplaced[letter]) positionMisplaced[letter] = new Set();
                positionMisplaced[letter].add(i);
            } else if (color === 'absent') {
                let isKnownPresent = false;
                for (let k = 0; k < g.word.length; k++) {
                    if ((g.colors[k] === 'correct' || g.colors[k] === 'present') && g.word[k] === letter) {
                        isKnownPresent = true;
                        break;
                    }
                }
                
                if (!isKnownPresent) {
                    absentLetters.add(letter);
                }
            }
        }
    });

    possibleWords = possibleWords.filter(word => {
        for (const pos in correctLetters) {
            if (word[pos] !== correctLetters[pos]) return false;
        }

        for (const letter of absentLetters) {
            if (word.includes(letter)) return false;
        }

        for (const letter of presentLetters) {
            if (!word.includes(letter)) return false;
        }

        for (const letter in positionMisplaced) {
             for (const pos of positionMisplaced[letter]) {
                 if (word[pos] === letter) return false;
             }
        }

        return true;
    });
    
    const guessedWords = new Set(allGuesses.map(g => g.word));
    let finalWords = possibleWords.filter(w => !guessedWords.has(w));
    
    const secretWord = localGameData.secretWord;
    const winningWordIndex = finalWords.indexOf(secretWord);
    
    let winningWord = null;
    let otherPossibleWords = [...finalWords];

    if (winningWordIndex !== -1) {
        winningWord = secretWord;
        otherPossibleWords.splice(winningWordIndex, 1);
    }
    
    const currentGuesses = localGameData.players['cpu']?.guesses.length || 0;
    
    if (winningWord && currentGuesses < 4 && Math.random() < 0.6) { 
        if (otherPossibleWords.length > 2) { 
            const randomIndex = Math.floor(Math.random() * otherPossibleWords.length);
            return otherPossibleWords[randomIndex];
        }
        
        const randomGuessList = (allWordList[wordLenStr] || []).filter(w => !guessedWords.has(w) && w !== secretWord);
        if (randomGuessList.length > 0) {
            return randomGuessList[Math.floor(Math.random() * randomGuessList.length)];
        }
    }

    if (finalWords.length > 0) {
        const randomIndex = Math.floor(Math.random() * finalWords.length);
        return finalWords[randomIndex];
    } else {
        const emergencyList = (allWordList[wordLenStr] || []).filter(w => !guessedWords.has(w));
        return emergencyList.length > 0 ? emergencyList[Math.floor(Math.random() * emergencyList.length)] : localGameData.secretWord;
    }
}


async function cpuTurn() {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status === 'finished' || localGameData.currentPlayerId !== 'cpu') {
        return;
    }
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    
    const guess = findBestCpuGuess();
    
    const finalGuess = guess || localGameData.secretWord;
    
    if(!finalGuess) {
        console.error("CPU tahmin edecek kelime bulamadı. Sıra oyuncuya geri veriliyor.");
        localGameData.currentPlayerId = state.getUserId();
        await renderGameState(localGameData);
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }

    const secretWord = localGameData.secretWord;
    const colors = calculateColors(finalGuess, secretWord);
    
    const newGuess = {
        word: finalGuess,
        colors: colors
    };
    localGameData.players['cpu'].guesses.push(newGuess);
    
    if (finalGuess === secretWord) {
        localGameData.status = 'finished';
        localGameData.roundWinner = 'cpu';
    } else if (localGameData.players[state.getUserId()].guesses.length >= GUESS_COUNT && localGameData.players['cpu'].guesses.length >= GUESS_COUNT) {
        localGameData.status = 'finished';
        localGameData.roundWinner = null;
    } else {
        localGameData.currentPlayerId = state.getUserId();
    }
    
    if (localGameData.status === 'finished' && localGameData.roundWinner === 'cpu') {
        const cpuGuessCount = localGameData.players['cpu'].guesses.length;
        const roundScore = calculateRoundScore(cpuGuessCount, true);
        localGameData.players['cpu'].score += roundScore;
    }
    
    await renderGameState(localGameData, true);
    
    if (localGameData.status === 'finished') {
        await updateStats(false, 0); 
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
        await setDoc(userRef, { stats: stats }, { merge: true });
        const updatedProfile = { ...currentUserProfile, stats: stats };
        state.setCurrentUserProfile(updatedProfile);
    } catch (error) {
        console.error("İstatistikler güncellenemedi:", error);
    }
}

export async function getDailyLeaderboardStats(currentUserId, secretWord) {
    const dayIndex = getDaysSinceEpoch();
    const wordLength = secretWord.length;
    
    try {
        const leaderboardRef = collection(db, 'daily_leaderboard');
        
        const q = query(leaderboardRef, 
            where('dayIndex', '==', dayIndex),
            where('wordLength', '==', wordLength),
            where('score', '>', 0), 
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

        const allPlayedQuery = query(leaderboardRef, 
            where('dayIndex', '==', dayIndex),
            where('wordLength', '==', wordLength)
        );
        const allPlayedSnapshot = await getDocs(allPlayedQuery);
        const allPlayedCount = allPlayedSnapshot.size;

        let totalGuesses = 0;
        let totalWins = 0;
        results.forEach(res => {
            totalGuesses += res.guessCount;
            totalWins++;
        });
        
        const avgGuesses = totalWins > 0 ? (totalGuesses / totalWins).toFixed(1) : 'N/A';
        const avgScore = allPlayedCount > 0 ? (totalScoreSum / allPlayedCount).toFixed(0) : 'N/A';

        const userResult = allPlayedSnapshot.docs.find(doc => doc.data().userId === currentUserId)?.data();
        const userGuessCount = userResult?.didWin ? userResult.guessCount : 'X';
        const userScore = userResult?.score || 0;

        return {
            userPosition, totalPlayers: allPlayedCount, userGuessCount, userScore,
            avgGuesses, avgScore, leaderboard: results.slice(0, 3) 
        };

    } catch (error) {
        console.error("Günlük sıralama verileri çekilirken hata:", error);
        return null;
    }
}


export async function startNewRound() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    
    if (gameMode === 'daily') {
        leaveGame();
        return;
    }
    
    if (!localGameData) return;
    
    if (isBattleRoyale(gameMode) && localGameData.status === 'finished') {
        
        if (localGameData.matchWinnerId !== undefined) { 
            leaveGame();
            return;
        }
        
        // Butonu devre dışı bırakma mantığı showScoreboard'a taşındı
        // showToast("Yeni tur başlatılıyor...", false); // Bu da showScoreboard'a taşındı
        
        try {
            const result = await startNextBRRound(state.getCurrentGameId(), state.getUserId());
            
            if (result.success) {
                showScreen('game-screen');
                return;
            } else {
                showToast(result.error || "Sonraki tur başlatılırken bilinmeyen bir hata oluştu.", true);
                leaveGame();
            }
        } catch (error) {
             showToast("Tur başlatılırken bir hata oluştu: " + error.message, true);
             leaveGame();
        }
        return; 
    }
    
    if (localGameData.currentRound >= localGameData.matchLength && !isBattleRoyale(gameMode)) {
        if (gameMode === 'multiplayer') {
            leaveGame();
        } else {
            startNewGame({ mode: gameMode });
        }
        return;
    }
    
    if (gameMode === 'vsCPU') {
        const newWordLength = getRandomWordLength();
        const newSecretWord = await getNewSecretWord(newWordLength);
        if (!newSecretWord) return showToast("Yeni kelime alınamadı.", true);
        
        const updates = {
            wordLength: newWordLength, secretWord: newSecretWord, status: 'playing',
            currentRound: (localGameData.currentRound || 0) + 1, 
            currentPlayerId: localGameData.creatorId, 
            roundWinner: null, turnStartTime: new Date(), 
            players: { ...localGameData.players }
        };
        for (const pid in updates.players) {
            updates.players[pid].guesses = [];
        }
        
        Object.assign(localGameData, updates);
        state.setLocalGameData(localGameData);
        showScreen('game-screen');
        initializeGameUI(localGameData);
        await renderGameState(localGameData);

    } else if (gameMode === 'multiplayer') {
        const newWordLength = getRandomWordLength();
        const newSecretWord = await getNewSecretWord(newWordLength);
        if (!newSecretWord) return showToast("Yeni kelime alınamadı.", true);
        
        const updates = {
            wordLength: newWordLength, secretWord: newSecretWord, status: 'playing',
            currentRound: (localGameData.currentRound || 0) + 1, 
            currentPlayerId: localGameData.creatorId, 
            roundWinner: null, turnStartTime: serverTimestamp(), 
            players: { ...localGameData.players }
        };
        for (const pid in updates.players) {
            updates.players[pid].guesses = [];
        }
         await updateDoc(doc(db, 'games', state.getCurrentGameId()), updates);
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
    
    // --- BAŞLANGIÇ: ÇİFT TIKLAMA DÜZELTMESİ ---
    // Butonu her skor tablosu gösterildiğinde tekrar aktif hale getir
    if (newRoundBtn) {
        newRoundBtn.disabled = false;
    }
    // --- BİTİŞ: ÇİFT TIKLAMA DÜZELTMESİ ---
    
    if (isBattleRoyale(gameMode)) {
        dailyStatsContainer.classList.remove('hidden');
        defaultWordDisplayContainer.style.display = 'none';
        
        const isMatchEndWithWinner = gameData.matchWinnerId && gameData.matchWinnerId !== null;
        const isMatchDraw = gameData.matchWinnerId === null;
        const isMatchFinished = gameData.matchWinnerId !== undefined; 

        let winnerMessage;
        let matchWinnerName = "";
        
        if (isMatchEndWithWinner) {
             matchWinnerName = gameData.players[gameData.matchWinnerId].username || "Sen";
        }
        
        if (isMatchEndWithWinner) {
            winnerMessage = gameData.matchWinnerId === currentUserId ? "👑 TEBRİKLER, MAÇI KAZANDIN!" : `👑 MAÇI ${matchWinnerName} KAZANDI!`;
        } else if (isMatchDraw) {
            winnerMessage = "Maç Berabere Bitti! 🤝";
        } else if (gameData.roundWinner) {
            const winnerName = gameData.players[gameData.roundWinner].username || "Sen";
            winnerMessage = gameData.roundWinner === currentUserId ? "✅ TURU KAZANDIN!" : `✅ TURU ${winnerName} KAZANDI!`;
        } else {
            winnerMessage = "❌ KİMSE ÇÖZEMEDİ! BERABERE.";
        }
        
        roundWinnerDisplay.textContent = winnerMessage;
        
        if (isMatchFinished) {
             matchWinnerDisplay.style.display = 'block';
             matchWinnerDisplay.textContent = isMatchEndWithWinner ? `OYUN SONU: ${matchWinnerName.toLocaleUpperCase('tr-TR')}` : 'OYUN SONU: BERABERE';
             newRoundBtn.textContent = 'Ana Menü';
             newRoundBtn.onclick = leaveGame;
        } else {
             matchWinnerDisplay.style.display = 'none';
             newRoundBtn.textContent = 'Sonraki Kelime'; 
             
             // --- BAŞLANGIÇ: ÇİFT TIKLAMA DÜZELTMESİ ---
             newRoundBtn.onclick = () => {
                // Tıkladıktan sonra butonu devre dışı bırak
                newRoundBtn.disabled = true;
                newRoundBtn.textContent = 'Yükleniyor...';
                showToast("Yeni tur başlatılıyor...", false); // Erken geri bildirim
                startNewRound();
             };
             // --- BİTİŞ: ÇİFT TIKLAMA DÜZELTMESİ ---
        }

        newRoundBtn.classList.remove('hidden'); 
        playSound(gameData.matchWinnerId === currentUserId ? 'win' : (gameData.roundWinner === currentUserId ? 'win' : 'lose')); 
        
        const sortedPlayers = Object.entries(gameData.players).map(([id, data]) => ({ ...data, id })).sort((a, b) => {
            if (a.id === gameData.matchWinnerId) return -1;
            if (b.id === gameData.matchWinnerId) return 1;
            if (a.isEliminated && !b.isEliminated) return 1;
            if (b.isEliminated && !a.isEliminated) return -1;
            if (a.hasSolved && !b.hasSolved) return -1;
            if (b.hasSolved && !a.hasSolved) return 1;
            if (a.hasFailed && !b.hasFailed) return 1;
            if (b.hasFailed && !a.hasFailed) return -1;
            return (a.username || '').localeCompare(b.username || '');
        });

        finalScores.innerHTML = `<h3 class="text-xl font-bold mb-2 text-center">Oyuncu Durumları (Tur ${gameData.currentRound})</h3>`;
        finalScores.style.display = 'block';

        sortedPlayers.forEach(player => {
            const statusIcon = player.id === gameData.matchWinnerId ? '👑' : (player.isEliminated ? '💀' : (player.hasSolved ? '✅' : (player.hasFailed ? '❌' : '⏳')));
            const scoreEl = document.createElement('p');
            scoreEl.className = 'text-lg ' + (player.id === currentUserId ? 'font-bold text-yellow-300' : '');
            scoreEl.textContent = `${statusIcon} ${player.username}`; 
            finalScores.appendChild(scoreEl);
        });
        
        const meaning = await fetchWordMeaning(gameData.secretWord);
        dailyStatsContainer.innerHTML = `
            <div class="mt-6 mb-4">
                <p>Doğru Kelime: <strong class="text-green-400 text-xl">${gameData.secretWord}</strong></p>
                <p id="word-meaning-display-br" class="text-sm text-gray-400 mt-2 italic">${meaning}</p>
            </div>
        `;
        
        return;
    }

    // Daily Modu
    if (gameMode === 'daily') {
        const dailyStats = await getDailyLeaderboardStats(currentUserId, gameData.secretWord);
        
        dailyStatsContainer.classList.remove('hidden');
        
        if (dailyStats) {
            dailyStatsContainer.innerHTML = `
                <div class="w-full max-w-sm mx-auto">
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
            const meaningDisplayEl = document.getElementById('word-meaning-display-daily'); 
            const meaning = await fetchWordMeaning(gameData.secretWord);
            if(meaningDisplayEl) meaningDisplayEl.textContent = meaning;

        } else {
            dailyStatsContainer.innerHTML = `<p class="text-gray-400">Günlük sıralama bilgileri yüklenemedi.</p>`;
        }
        
        finalScores.style.display = 'none';
        matchWinnerDisplay.style.display = 'none';
        newRoundBtn.classList.add('hidden'); 
        defaultWordDisplayContainer.style.display = 'none'; 
        
        roundWinnerDisplay.textContent = gameData.roundWinner === currentUserId ? "Tebrikler, Kazandın!" : `Kaybettin! Cevap: ${gameData.secretWord}`;
        playSound(gameData.roundWinner === currentUserId ? 'win' : 'lose');
        
        document.getElementById('main-menu-btn').textContent = "Ana Menüye Dön";
        defaultRoundButtons.style.display = 'flex';
        
        return; 
    }

    // vsCPU / SIRALI MULTIPLAYER
    dailyStatsContainer.classList.add('hidden');
    defaultWordDisplayContainer.style.display = 'block';
    defaultRoundButtons.style.display = 'flex';

    const showScores = gameMode === 'multiplayer' || gameMode === 'vsCPU';
    finalScores.style.display = showScores ? 'block' : 'none';
    matchWinnerDisplay.style.display = showScores ? 'block' : 'none';

    if (showScores) {
        finalScores.innerHTML = `<h3 class="text-xl font-bold mb-2 text-center">Toplam Puan</h3>`;
        const sortedPlayers = Object.entries(gameData.players).map(([id, data]) => ({ ...data, id })).sort((a, b) => (b.score || 0) - (a.score || 0));
        sortedPlayers.forEach(player => {
            const scoreEl = document.createElement('p');
            scoreEl.className = 'text-lg';
            scoreEl.textContent = `${player.username}: ${player.score || 0} Puan`,
            finalScores.appendChild(scoreEl);
        });
    }
    
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
    
    matchWinnerDisplay.textContent = '';
    newRoundBtn.classList.remove('hidden');
    
    if (gameMode === 'vsCPU' || gameMode === 'multiplayer') {
        if (gameData.currentRound < gameData.matchLength) {
            newRoundBtn.textContent = 'Sonraki Kelime';
            newRoundBtn.onclick = startNewRound; // Sıralı oyun için normal atama
        } else {
            newRoundBtn.textContent = 'Yeniden Oyna';
            newRoundBtn.onclick = () => startNewGame({ mode: gameMode }); // Yeniden oyna ataması
            if (showScores) {
                const sortedPlayers = Object.entries(gameData.players).map(([id, data]) => ({ ...data, id })).sort((a, b) => (b.score || 0) - (a.score || 0));
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
        newRoundBtn.onclick = () => startNewGame({ mode: gameMode });
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
    
    const turnStartTime = localGameData.turnStartTime?.toDate ? localGameData.turnStartTime.toDate() : new Date(); 
    
    const interval = setInterval(async () => {
        let now = new Date();
        let elapsed = Math.floor((now - turnStartTime) / 1000);
        let timeLeft = localGameData.timeLimit - elapsed; 
        
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
    console.log("LOG: leaveGame fonksiyonu çalıştı.");
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

// BR Oyun Kurma
export async function createBRGame(options = {}) {
    console.log("LOG: createBRGame fonksiyonu çalıştı. Parametreler:", options);
    const timeLimit = 60; 
    const wordLength = getRandomWordLength(); 
    const { isHardMode = false } = options;
    
    if (!db || !state.getUserId()) {
         console.error("HATA: Kullanıcı girişi yok veya DB bağlantısı yok.");
         return showToast("Sunucuya bağlanılamıyor.", true);
    }
    
    const currentUserId = state.getUserId();
    const username = getUsername();
    
    const secretWord = await getNewSecretWord(wordLength);
    if (!secretWord) return;

    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();

    const gameData = {
        gameId, wordLength: wordLength, secretWord: secretWord, timeLimit: timeLimit,
        creatorId: currentUserId, isHardMode, matchLength: 1,
        players: { [currentUserId]: { userId: currentUserId, username, guesses: [], isEliminated: false, hasSolved: false, isWinner: false, hasFailed: false } },
        playerIds: [currentUserId], 
        
        currentPlayerId: currentUserId, 
        status: 'waiting', 
        roundWinner: null,
        // matchWinnerId: başlangıçta 'undefined' olmalı
        createdAt: serverTimestamp(),
        turnStartTime: serverTimestamp(),
        GUESS_COUNT: GUESS_COUNT, 
        gameType: 'multiplayer-br',
        maxPlayers: 4,
        currentRound: 1
    };

    try {
        await setDoc(doc(db, "games", gameId), gameData);
        
        state.setGameMode('multiplayer-br');
        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        state.setLocalGameData(gameData);
        showScreen('game-screen');
        initializeGameUI(gameData); 
        listenToGameUpdates(gameId);
        showToast("Battle Royale oyunu kuruldu! Arkadaşlarını davet et.", false);

    } catch (error) {
        console.error("Error creating BR game:", error);
        showToast("BR Oyunu oluşturulamadı!", true);
    }
}


// js/game.js - joinBRGame (GÜNCELLENDİ)
export async function joinBRGame(gameId) {
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
            
            if (gameData.gameType !== 'multiplayer-br') throw new Error("Bu bir Battle Royale oyunu değil.");
            
            if (gameData.status !== 'waiting') throw new Error("Bu oyun çoktan başladı veya bitti.");
            
            if (Object.keys(gameData.players).length >= (gameData.maxPlayers || MAX_BR_PLAYERS)) throw new Error("Oyun dolu.");

            if (gameData.players[currentUserId]) {
                gameDataToJoin = gameData;
                return; 
            }

            const newPlayerObject = { 
                userId: currentUserId, 
                username, 
                guesses: [], 
                isEliminated: false, 
                hasSolved: false, 
                isWinner: false, 
                hasFailed: false 
            };

            const updates = {
                [`players.${currentUserId}`]: newPlayerObject,
                playerIds: arrayUnion(currentUserId),
            };
            
            transaction.update(gameRef, updates);
            
            gameDataToJoin = { 
                ...gameData, 
                players: {
                    ...gameData.players, 
                    [currentUserId]: newPlayerObject 
                },
                playerIds: [...gameData.playerIds, currentUserId] 
            };
        });
        
        if (!gameDataToJoin) {
            const finalDoc = await getDoc(gameRef);
            if(finalDoc.exists()) gameDataToJoin = finalDoc.data();
            else throw new Error("Oyun verisi bulunamadı.");
        }
        
        state.setGameMode('multiplayer-br');
        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        state.setLocalGameData(gameDataToJoin); 
        showScreen('game-screen');
        initializeGameUI(gameDataToJoin); 
        listenToGameUpdates(gameId);
        showToast(`Oyuna katıldınız! Toplam ${Object.keys(gameDataToJoin.players).length} oyuncu.`, false);

    } catch (error) {
        console.error("Error joining BR game:", error);
        showToast(error.message, true);
        localStorage.removeItem('activeGameId');
        leaveGame();
    }
}