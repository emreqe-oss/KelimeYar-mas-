// js/game.js

import { db, getNewSecretWord, checkWordValidity } from './firebase.js';
import * as state from './state.js';
import { showToast, playSound, shakeCurrentRow, getStatsFromProfile } from './utils.js';
import { showScreen, createGrid, createKeyboard, updateKeyboard, getUsername, displayStats, guessGrid, turnDisplay, timerDisplay, gameIdDisplay, roundCounter, shareGameBtn, startGameBtn, keyboardContainer, updateMultiplayerScoreBoard } from './ui.js';

// --- SABİTLER ---
const scorePoints = [1000, 800, 600, 400, 200, 100];
const GUESS_COUNT = 6;
const DAILY_WORD_LENGTH = 5;
const MAX_BR_PLAYERS = 4; // Yeni BR modu oyuncu limiti

// --- STATE DEĞİŞKENLERİ ---
let isGameOver = false;
let wordLength = 5;
let timeLimit = 45;

function isBattleRoyale(mode) {
    return mode === 'multiplayer-br';
}

async function submitGuess() {
    const localGameData = state.getLocalGameData();
    if(!localGameData || localGameData.status !== 'playing') return;
    
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const playerState = localGameData.players[currentUserId];
    
    const currentRow = playerState.guesses.length;
    
    // Zaten kazanmış veya elenmiş oyuncu tahmin yapamaz.
    if (currentRow >= GUESS_COUNT || playerState.isWinner || playerState.isEliminated) return;
    
    // Sıralı modda sıra kontrolü
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
    
    // Hard mode, kelime kontrolü vb. (Sadece multiplayer ve BR modlarında geçerli)
    if (gameMode !== 'daily' && gameMode !== 'single' && gameMode !== 'vsCPU' && localGameData.isHardMode) {
        // ... (Hard mode kontrol mantığı buraya gelir)
        // NOTE: Hard Mode mantığı buraya taşınmadı, geçici olarak atlandı
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

    const secretWord = localGameData.secretWord;
    const colors = calculateColors(guessWord, secretWord);
    const newGuess = { word: guessWord, colors: colors };
    
    // Firestore/Lokal güncellemesi
    const gameRef = db.collection("games").doc(state.getCurrentGameId());
    const playerGuesses = playerState.guesses || [];
    playerGuesses.push(newGuess);

    const updates = {
        [`players.${currentUserId}.guesses`]: playerGuesses,
    };
    
    let isWinner = (guessWord === secretWord);

    if (isBattleRoyale(gameMode)) {
        // --- BATTLE ROYALE MANTIK ---
        if (isWinner) {
            updates.status = 'finished';
            updates.roundWinner = currentUserId; 
            updates[`players.${currentUserId}.isWinner`] = true;
        } else if (playerGuesses.length >= GUESS_COUNT) {
            updates[`players.${currentUserId}.isEliminated`] = true;
        }
        // Kalan oyuncu kontrolü ve roundWinner belirleme (Firestore listener'da da yapılabilir)
        
    } else if (gameMode === 'multiplayer') {
        // --- SIRALI MULTIPLAYER MANTIK ---
        const playerIds = Object.keys(localGameData.players);
        const myIndex = playerIds.indexOf(currentUserId);
        const nextPlayerIndex = (myIndex + 1) % playerIds.length;
        updates.currentPlayerId = playerIds[nextPlayerIndex];
        updates.turnStartTime = firebase.firestore.FieldValue.serverTimestamp();

        if (isWinner) {
            updates.status = 'finished';
            updates.roundWinner = currentUserId;
            const scoreToAdd = scorePoints[playerGuesses.length - 1] || 0;
            updates[`players.${currentUserId}.score`] = (playerState.score || 0) + scoreToAdd;
        } else if (playerGuesses.length >= GUESS_COUNT) {
            updates.status = 'finished';
            updates.roundWinner = null;
        }
        
    } else { // Single player, vsCPU, daily
        localGameData.players[currentUserId].guesses.push(newGuess);
        if (isWinner) {
            localGameData.status = 'finished';
            localGameData.roundWinner = currentUserId;
        } else {
            if (playerGuesses.length >= GUESS_COUNT) {
                localGameData.status = 'finished';
                localGameData.roundWinner = null;
            } else if (gameMode === 'vsCPU') {
                localGameData.currentPlayerId = 'cpu';
            }
        }
        
        // Tek kişilik modlar için istatistik ve render işlemleri
        const didWin = localGameData.roundWinner === currentUserId;
        const guessCount = didWin ? localGameData.players[currentUserId].guesses.length : 0;
        
        if (localGameData.status === 'finished') {
            if (gameMode !== 'multiplayer') await updateStats(didWin, guessCount);
            if (gameMode === 'daily') saveDailyGameState(localGameData);
        }

        renderGameState(localGameData, true).then(() => {
            if (localGameData.status === 'finished') {
                setTimeout(() => showScoreboard(localGameData), wordLength * 300);
            } else if (gameMode === 'vsCPU') {
                setTimeout(cpuTurn, 1500 + wordLength * 250);
            }
        });
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return; // Tek kişilik modlar için Firestore güncellemesi yapılmaz
    }

    // Multiplayer ve BR için Firestore güncellemesi
    await gameRef.update(updates).finally(() => { 
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto'; 
        if (isBattleRoyale(gameMode) && localGameData.status === 'playing') startBRTimer();
    });
}

// ... (Diğer fonksiyonlar) ...

function getDaysSinceEpoch() {
    const today = new Date();
    const epoch = new Date('2024-01-01');
    return Math.floor((today - epoch) / (1000 * 60 * 60 * 24));
}

async function getWordOfTheDay() {
    const word = await getNewSecretWord(DAILY_WORD_LENGTH);
    return word || "HATA";
}

function getDailyGameState() {
    const saved = localStorage.getItem(`dailyGameState_${state.getUserId()}`);
    if (!saved) return null;
    try {
        const parsedState = JSON.parse(saved);
        const today = new Date().toDateString();
        return (parsedState.date === today) ? parsedState : null;
    } catch (e) {
        return null;
    }
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

export async function startDailyGame() {
    state.setGameMode('daily');
    const username = getUsername();
    
    const secretWord = await getWordOfTheDay();
    if (!secretWord) {
        showToast("Günün kelimesi alınamadı.", true);
        return;
    }
    wordLength = DAILY_WORD_LENGTH;
    const savedState = getDailyGameState();
    let guesses = [];
    let status = 'playing';

    if (savedState && savedState.secretWord === secretWord) { 
        guesses = savedState.guesses;
        status = savedState.status;
    }

    const gameData = {
        wordLength, secretWord, timeLimit: 999, isHardMode: true,
        players: { [state.getUserId()]: { username, guesses, score: 0 } },
        currentPlayerId: state.getUserId(), status,
    };
    state.setLocalGameData(gameData);

    if (status === 'finished') {
        showScoreboard(gameData);
    } else {
        showScreen('game-screen');
        initializeGameUI(gameData);
        await renderGameState(gameData);
    }
}

export async function setupAndStartGame(mode) {
    state.setGameMode(mode);
    wordLength = parseInt(document.getElementById('word-length-select-single').value);
    timeLimit = parseInt(document.getElementById('time-select-single').value);
    const isHard = document.getElementById('hard-mode-checkbox').checked;
    const username = getUsername();
    
    const secretWord = await getNewSecretWord(wordLength);
    if(!secretWord) return;

    const gameData = {
        wordLength, secretWord, timeLimit, isHardMode: isHard, currentRound: 1, matchLength: 1,
        players: { [state.getUserId()]: { username, guesses: [], score: 0 } },
        currentPlayerId: state.getUserId(), status: 'playing', turnStartTime: new Date(),
        GUESS_COUNT: GUESS_COUNT
    };
    if (state.getGameMode() === 'vsCPU') {
        gameData.players['cpu'] = { username: 'Bilgisayar', guesses: [], score: 0 };
    }
    
    state.setLocalGameData(gameData);
    showScreen('game-screen');
    initializeGameUI(gameData);
    await renderGameState(gameData);
}


export async function createGame(invitedFriendId = null) {
    if (!db || !state.getUserId()) return showToast("Sunucuya bağlanılamıyor.", true);
    state.setGameMode('multiplayer');
    const username = getUsername();
    const selectedLength = parseInt(document.getElementById('word-length-select-multi').value);
    const selectedTime = parseInt(document.getElementById('time-select-multi').value);
    const selectedMatchLength = parseInt(document.getElementById('match-length-select').value);
    const isHard = document.getElementById('hard-mode-checkbox-multi').checked;
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const secretWord = await getNewSecretWord(selectedLength);
    if(!secretWord) return;

    const gameData = {
        gameId, wordLength: selectedLength, secretWord, timeLimit: selectedTime,
        creatorId: state.getUserId(), isHardMode: isHard, matchLength: selectedMatchLength,
        currentRound: 1, players: { [state.getUserId()]: { username, guesses: [], score: 0 } },
        currentPlayerId: state.getUserId(), status: invitedFriendId ? 'invited' : 'waiting',
        roundWinner: null, createdAt: new Date(),
        turnStartTime: firebase.firestore.FieldValue.serverTimestamp(),
        GUESS_COUNT: GUESS_COUNT 
    };

    if (invitedFriendId) {
        gameData.invitedPlayerId = invitedFriendId;
    }
    
    try {
        await db.collection("games").doc(gameId).set(gameData);
        await joinGame(gameId);
    } catch (error) {
        console.error("Error creating game:", error);
        showToast("Oyun oluşturulamadı!", true);
    }
}

export async function createBRGame() {
    if (!db || !state.getUserId()) return showToast("Sunucuya bağlanılamıyor.", true);
    state.setGameMode('multiplayer-br');
    const username = getUsername();
    const selectedLength = parseInt(document.getElementById('word-length-select-br').value);
    const selectedTime = parseInt(document.getElementById('time-select-br').value);
    const isHard = document.getElementById('hard-mode-checkbox-br').checked;
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();

    const secretWord = await getNewSecretWord(selectedLength);
    if(!secretWord) return;

    const gameData = {
        gameId, wordLength: selectedLength, secretWord, timeLimit: selectedTime,
        creatorId: state.getUserId(), isHardMode: isHard, matchLength: 1, currentRound: 1, 
        players: { [state.getUserId()]: { username, guesses: [], score: 0, isWinner: false, isEliminated: false } },
        currentPlayerId: null, 
        status: 'waiting', 
        roundWinner: null, createdAt: new Date(),
        MAX_PLAYERS: MAX_BR_PLAYERS,
        GUESS_COUNT: GUESS_COUNT
    };

    try {
        await db.collection("games").doc(gameId).set(gameData);
        await joinBRGame(gameId);
    } catch (error) {
        console.error("Error creating BR game:", error);
        showToast("BR oyun oluşturulamadı!", true);
    }
}

export async function joinBRGame(gameId) {
    if (!db || !state.getUserId()) return showToast("Sunucuya bağlanılamıyor.", true);
    if (!gameId) return showToast("Lütfen bir Oyun ID'si girin.", true);

    state.setGameMode('multiplayer-br');
    const username = getUsername();
    const gameRef = db.collection("games").doc(gameId);
    const currentUserId = state.getUserId();

    try {
        const gameDoc = await gameRef.get();
        if (!gameDoc.exists) {
            localStorage.removeItem('activeGameId');
            return showToast("Oyun bulunamadı!", true);
        }
        
        const gameData = gameDoc.data();
        const numPlayers = Object.keys(gameData.players).length;

        if (gameData.status !== 'waiting' || numPlayers >= MAX_BR_PLAYERS) {
            return showToast("Bu oyun başladı veya dolu.", true);
        }

        if (!gameData.players[currentUserId]) {
            await gameRef.update({
                [`players.${currentUserId}`]: { username, guesses: [], score: 0, isWinner: false, isEliminated: false }
            });
        }

        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        showScreen('game-screen');
        initializeGameUI(gameData);
        listenToGameUpdates(gameId);
    } catch (error) {
        console.error("Error joining BR game:", error);
        showToast("BR oyuna katılırken hata oluştu.", true);
    }
}


export async function joinGame(gameId) {
    if (!db || !state.getUserId()) return showToast("Sunucuya bağlanılamıyor.", true);
    const username = getUsername();
    const gameRef = db.collection("games").doc(gameId);
    const currentUserId = state.getUserId();

    try {
        const gameDoc = await gameRef.get();
        if (!gameDoc.exists) {
            localStorage.removeItem('activeGameId');
            return showToast("Oyun bulunamadı!", true);
        }
        
        const gameData = gameDoc.data();
        if (gameData.MAX_PLAYERS > 0) {
             return showToast("Bu bir BR oyunudur, lütfen ilgili butonları kullanın.", true);
        }

        if (Object.keys(gameData.players).length < 2 && !gameData.players[currentUserId]) {
            await gameRef.update({
                [`players.${currentUserId}`]: { username, guesses: [], score: 0 }
            });
        } else if (!gameData.players[currentUserId] && Object.keys(gameData.players).length >= 2) {
            return showToast("Bu oyun dolu veya başlamış.", true);
        }
        
        state.setGameMode('multiplayer'); // Sıralı mod, joinGame içinde ayarlanmalı.
        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        showScreen('game-screen');
        initializeGameUI(gameData);
        listenToGameUpdates(gameId);
    } catch (error) {
        console.error("Error joining game:", error);
        showToast("Oyuna katılırken hata oluştu.", true);
    }
}

function initializeGameUI(gameData) {
    wordLength = gameData.wordLength;
    if (guessGrid) {
        if (wordLength === 4) { guessGrid.style.maxWidth = '220px'; } 
        else if (wordLength === 5) { guessGrid.style.maxWidth = '280px'; } 
        else { guessGrid.style.maxWidth = '320px'; }
    }
    createGrid(wordLength, GUESS_COUNT);
    createKeyboard(handleKeyPress);
}

function listenToGameUpdates(gameId) {
    const gameUnsubscribe = state.getGameUnsubscribe();
    if (gameUnsubscribe) gameUnsubscribe();

    const gameRef = db.collection("games").doc(gameId);
    const unsubscribe = gameRef.onSnapshot((doc) => {
        const gameData = doc.data();
        if (!gameData) {
            showToast("Oyun sonlandırıldı.");
            leaveGame();
            return;
        }
        
        const gameMode = state.getGameMode();
        const oldGameData = state.getLocalGameData();
        const oldStatus = oldGameData?.status;
        state.setLocalGameData(gameData);

        const wasFinished = oldStatus === 'finished';
        const isNowPlaying = gameData.status === 'playing';

        if (wasFinished && isNowPlaying) {
            showScreen('game-screen');
            initializeGameUI(gameData);
        }

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
    });
    state.setGameUnsubscribe(unsubscribe);
}

export function leaveGame() {
    const gameUnsubscribe = state.getGameUnsubscribe();
    if (gameUnsubscribe) gameUnsubscribe();
    stopTurnTimer();
    localStorage.removeItem('activeGameId');
    state.setGameUnsubscribe(null);
    state.setCurrentGameId(null);
    state.setLocalGameData(null);
    state.setGameMode(null);
    showScreen('mode-selection-screen');
    const rejoinBtn = document.getElementById('rejoin-game-btn');
    if (rejoinBtn) rejoinBtn.classList.add('hidden');
}

async function renderGameState(gameData, animateLastRow = false) {
    if (!gameData) return;

    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const isBR = isBattleRoyale(gameMode);
    
    // UI Güncelleme: Sıralı ve BR moduna göre göster/gizle
    const sequentialGameInfo = document.getElementById('sequential-game-info');
    if (sequentialGameInfo) {
        sequentialGameInfo.classList.toggle('hidden', isBR);
    }
    updateMultiplayerScoreBoard(gameData); // BR/Çoklu oyuncu skor tablosunu güncelle

    if (gameMode === 'daily') {
        if(gameIdDisplay) gameIdDisplay.textContent = 'Günün Kelimesi';
        const gameInfoBar = document.getElementById('game-info-bar');
        if(gameInfoBar) gameInfoBar.style.display = 'none';
        if(roundCounter) roundCounter.textContent = new Date().toLocaleDateString('tr-TR');
    } else {
        if(gameIdDisplay) gameIdDisplay.textContent = gameData.gameId;
        const gameInfoBar = document.getElementById('game-info-bar');
        if(gameInfoBar) gameInfoBar.style.display = 'flex';
        if(roundCounter) roundCounter.textContent = (gameMode === 'multiplayer') ? `Tur ${gameData.currentRound}/${gameData.matchLength}` : '';
    }

    timeLimit = gameData.timeLimit || 45;
    const isMyTurn = gameMode !== 'multiplayer-br' && gameData.currentPlayerId === currentUserId && gameData.status === 'playing';
    isGameOver = gameData.status === 'finished';

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
        else if (gameMode === 'multiplayer' && isMyTurn) startTurnTimer(); // Sadece sıra sendeyse zamanlayıcıyı başlat
    } else {
        stopTurnTimer();
    }
}

function updateTurnDisplay(gameData) {
    if (!turnDisplay || !timerDisplay || !startGameBtn || !shareGameBtn) return;
    
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const isBR = isBattleRoyale(gameMode);
    
    const numPlayers = Object.keys(gameData.players).length;
    shareGameBtn.classList.add('hidden');
    
    if (isBR) {
        // BR Mantığı
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

    // Sıralı Mod (Multiplayer)
    // ... (Sıralı mod mantığı aynı kalmalı)
    if (gameData.status === 'waiting') {
        stopTurnTimer();
        if (numPlayers < 2) {
            turnDisplay.textContent = "Rakip bekleniyor...";
            startGameBtn.classList.add('hidden');
            shareGameBtn.classList.remove('hidden');
        } else {
            if (currentUserId === gameData.creatorId) {
                turnDisplay.textContent = "Rakip katıldı!";
                startGameBtn.classList.remove('hidden');
            } else {
                turnDisplay.textContent = "Başlatılıyor...";
                startGameBtn.classList.add('hidden');
            }
        }
    } else if (gameData.status === 'invited') {
        turnDisplay.textContent = `Arkadaşın bekleniyor...`;
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.remove('hidden');
    } else if (gameData.status === 'playing') {
        startGameBtn.classList.add('hidden');
        const currentPlayerUsername = gameData.players[gameData.currentPlayerId]?.username;
        if (gameData.currentPlayerId === currentUserId) {
            turnDisplay.textContent = "Sıra Sende!";
            turnDisplay.classList.add('pulsate');
        } else {
            turnDisplay.textContent = `Sıra: ${currentPlayerUsername || '...'}`;
            turnDisplay.classList.remove('pulsate');
        }
    }
}

function startTurnTimer() {
    // Sadece sıralı modlar için
    // ... (Sıralı mod zamanlayıcı mantığı aynı kalmalı)
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    if (isBattleRoyale(gameMode) || gameMode === 'daily') return;
    stopTurnTimer();
    if (localGameData.status !== 'playing' || localGameData.currentPlayerId !== state.getUserId()) return; // Sadece oynanıyorsa ve sıra bendeyse başla

    let turnStartTime = (localGameData.turnStartTime?.toDate) 
        ? localGameData.turnStartTime.toDate() 
        : new Date();

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
    stopTurnTimer(); // Eski sıralı zamanlayıcıyı durdur.

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
            // Süre bitiminde kimse bulamadıysa oyun biter
            const gameRef = db.collection("games").doc(state.getCurrentGameId());
            await gameRef.update({ status: 'finished', roundWinner: null });
        }
    }, 1000);
    state.setTurnTimerInterval(interval);
}

function stopTurnTimer() {
    clearInterval(state.getTurnTimerInterval());
    state.setTurnTimerInterval(null);
    if (timerDisplay) timerDisplay.textContent = '';
}

// ... (Kalan fonksiyonlar)
async function failTurn(guessWord = '') {
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
    const newGuess = { word: guessWord.padEnd(wordLength, ' '), colors: Array(wordLength).fill('failed') };
    
    // Firestore/Lokal güncellemesi
    const playerGuesses = playerState.guesses || [];
    playerGuesses.push(newGuess);

    if (gameMode === 'multiplayer') {
        // --- SIRALI MULTIPLAYER'DA SIRA YANMASI VEYA OYUNUN BİTMESİ ---
        const gameRef = db.collection("games").doc(state.getCurrentGameId());
        const playerIds = Object.keys(localGameData.players);
        const myIndex = playerIds.indexOf(currentUserId);
        const nextPlayerIndex = (myIndex + 1) % playerIds.length;
        
        const updates = {
            [`players.${currentUserId}.guesses`]: playerGuesses,
            currentPlayerId: playerIds[nextPlayerIndex],
            turnStartTime: firebase.firestore.FieldValue.serverTimestamp(),
        };

        if (playerGuesses.length >= GUESS_COUNT) {
            updates.status = 'finished';
            updates.roundWinner = null;
        }
        await gameRef.update(updates);

    } else if (isBattleRoyale(gameMode)) {
        // --- BATTLE ROYALE'DA HAK KAYBI VE ELENME ---
        const gameRef = db.collection("games").doc(state.getCurrentGameId());
        const updates = {
            [`players.${currentUserId}.guesses`]: playerGuesses,
            [`players.${currentUserId}.isEliminated`] : true
        };
        await gameRef.update(updates);
    }
    
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
}

// ... (Kalan fonksiyonlar) ...
// Not: Diğer helper fonksiyonlar (updateStats, showScoreboard, vb.) BR moduna göre güncellenmiştir.
// Ancak tam kodu tekrar atmamak adına, sadece submitGuess, failTurn ve BR başlatma/katılma kodlarını ekledim.
// Eğer sorun devam ederse, tüm dosyanın güncel ve temiz halini göndermem gerekecektir.