// js/game.js

import { db, getNewSecretWord, checkWordValidity } from './firebase.js';
import * as state from './state.js';
import { showToast, playSound, shakeCurrentRow } from './utils.js';
import { showScreen, createGrid, createKeyboard, updateKeyboard, getUsername, displayStats, guessGrid, turnDisplay, timerDisplay, gameIdDisplay, roundCounter, shareGameBtn, startGameBtn, keyboardContainer } from './ui.js';

// --- SABİTLER ---
const scorePoints = [1000, 800, 600, 400, 200, 100];
const GUESS_COUNT = 6;
const DAILY_WORD_LENGTH = 5;

// --- STATE DEĞİŞKENLERİ ---
let isMyTurn = false;
let isGameOver = false;
let wordLength = 5;
let timeLimit = 45;

async function submitGuess() {
    // DÜZELTME: state.localGameData -> state.getLocalGameData()
    const localGameData = state.getLocalGameData();
    if(!localGameData) return;
    const currentRow = Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0);
    if (!isMyTurn || currentRow >= GUESS_COUNT) return;

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
    
    // Zor mod kontrolü
    // DÜZELTME: state.userId -> state.getUserId()
    if (localGameData.isHardMode && localGameData.players[state.getUserId()].guesses.length > 0) {
        const allPlayerGuesses = localGameData.players[state.getUserId()].guesses;
        const presentLetters = new Set();
        const correctLetters = {};
        allPlayerGuesses.forEach(g => {
            for (let i = 0; i < g.colors.length; i++) {
                if (g.colors[i] === 'correct') { correctLetters[i] = g.word[i]; } 
                else if (g.colors[i] === 'present') { presentLetters.add(g.word[i]); }
            }
        });
        for (const index in correctLetters) {
            if (guessWord[index] !== correctLetters[index]) {
                showToast(`'${correctLetters[index]}' harfi ${parseInt(index) + 1}. sırada olmalı!`, true);
                shakeCurrentRow(wordLength, currentRow);
                return;
            }
        }
        for (const letter of presentLetters) {
            if (!guessWord.includes(letter)) {
                showToast(`'${letter}' harfini kullanmalısın!`, true);
                shakeCurrentRow(wordLength, currentRow);
                return;
            }
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
    
    const secretWord = localGameData.secretWord;
    const colors = calculateColors(guessWord, secretWord);
    const newGuess = { word: guessWord, colors: colors };
    
    const totalGuessesMade = currentRow + 1;

    // DÜZELTME: state.gameMode -> state.getGameMode()
    if (state.getGameMode() === 'multiplayer') {
        const gameRef = db.collection("games").doc(state.getCurrentGameId());
        const playerGuesses = localGameData.players[state.getUserId()].guesses || [];
        playerGuesses.push(newGuess);
        const playerIds = Object.keys(localGameData.players);
        const myIndex = playerIds.indexOf(state.getUserId());
        const nextPlayerIndex = (myIndex + 1) % playerIds.length;
        const updates = {
            [`players.${state.getUserId()}.guesses`]: playerGuesses,
            currentPlayerId: playerIds[nextPlayerIndex],
            turnStartTime: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (guessWord === secretWord) {
            updates.status = 'finished';
            updates.roundWinner = state.getUserId();
            const scoreToAdd = scorePoints[playerGuesses.length - 1] || 0;
            updates[`players.${state.getUserId()}.score`] = (localGameData.players[state.getUserId()].score || 0) + scoreToAdd;
        // DÜZELTME: Beraberlik durumu artık oyuncu sayısına göre değil,
        // sabit tahmin hakkına (6) göre belirleniyor.
        } else if (totalGuessesMade >= GUESS_COUNT) { 
            updates.status = 'finished';
            updates.roundWinner = null;
        }
        await gameRef.update(updates).finally(() => { 
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto'; 
        });

    } else { // Single player, vsCPU, daily
        localGameData.players[state.getUserId()].guesses.push(newGuess);
        if (guessWord === secretWord) {
            localGameData.status = 'finished';
            localGameData.roundWinner = state.getUserId();
            if (state.getGameMode() !== 'daily') {
                const scoreToAdd = scorePoints[localGameData.players[state.getUserId()].guesses.length - 1] || 0;
                localGameData.players[state.getUserId()].score += scoreToAdd;
            }
        } else {
            if (totalGuessesMade >= GUESS_COUNT) {
                localGameData.status = 'finished';
                localGameData.roundWinner = null;
            } else {
                if (state.getGameMode() === 'vsCPU') {
                    localGameData.currentPlayerId = 'cpu';
                }
            }
        }

        const didWin = localGameData.roundWinner === state.getUserId();
        const guessCount = didWin ? localGameData.players[state.getUserId()].guesses.length : 0;
        if (localGameData.status === 'finished') {
            if (state.getGameMode() !== 'multiplayer') await updateStats(didWin, guessCount);
            if (state.getGameMode() === 'daily') saveDailyGameState(localGameData);
        }

        renderGameState(localGameData, true).then(() => {
            if (localGameData.status === 'finished') {
                setTimeout(() => showScoreboard(localGameData), wordLength * 300);
            } else if (state.getGameMode() === 'vsCPU') {
                setTimeout(cpuTurn, 1500 + wordLength * 250);
            }
        });
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
    }
}

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
        currentPlayerId: state.getUserId(), status: 'playing', turnStartTime: new Date()
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
        firstFailurePlayerId: null
    };

    if (invitedFriendId) gameData.invitedPlayerId = invitedFriendId;
    
    try {
        await db.collection("games").doc(gameId).set(gameData);
        await joinGame(gameId);
    } catch (error) {
        console.error("Error creating game:", error);
        showToast("Oyun oluşturulamadı!", true);
    }
}

export async function joinGame(gameId) {
    if (!db || !state.getUserId()) return showToast("Sunucuya bağlanılamıyor.", true);
    if (!gameId) return showToast("Lütfen bir Oyun ID'si girin.", true);

    state.setGameMode('multiplayer');
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
        if (Object.keys(gameData.players).length < 2 && !gameData.players[currentUserId]) {
            await gameRef.update({
                [`players.${currentUserId}`]: { username, guesses: [], score: 0 }
            });
        } else if (!gameData.players[currentUserId]) {
            return showToast("Bu oyun dolu veya başlamış.", true);
        }

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

        const oldGameData = state.getLocalGameData();
        state.setLocalGameData(gameData);

        const oldGuessesCount = oldGameData ? Object.values(oldGameData.players).reduce((acc, p) => acc + p.guesses.length, 0) : 0;
        const newGuessesCount = Object.values(gameData.players).reduce((acc, p) => acc + p.guesses.length, 0);

        if (gameData.status === 'finished') {
            renderGameState(gameData, oldGuessesCount < newGuessesCount).then(() => {
                setTimeout(() => showScoreboard(gameData), wordLength * 300 + 500);
            });
        } else {
            renderGameState(gameData, oldGuessesCount < newGuessesCount);
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
    const gameScreen = document.getElementById('game-screen');
    if (!gameScreen || gameScreen.classList.contains('hidden') || !gameData) return;

    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();

    if (gameMode === 'daily') {
        if(gameIdDisplay) gameIdDisplay.textContent = 'Günün Kelimesi';
        const gameInfoBar = document.getElementById('game-info-bar');
        if(gameInfoBar) gameInfoBar.style.display = 'none';
        if(roundCounter) roundCounter.textContent = new Date().toLocaleDateString('tr-TR');
    } else {
        if(gameIdDisplay) gameIdDisplay.textContent = gameMode === 'multiplayer' ? gameData.gameId : 'Tek Kişilik';
        const gameInfoBar = document.getElementById('game-info-bar');
        if(gameInfoBar) gameInfoBar.style.display = gameMode === 'multiplayer' ? 'flex' : 'none';
        if(roundCounter) roundCounter.textContent = (gameMode === 'multiplayer') ? `Tur ${gameData.currentRound}/${gameData.matchLength}` : '';
    }

    timeLimit = gameData.timeLimit || 45;
    isMyTurn = gameData.currentPlayerId === currentUserId && gameData.status === 'playing';
    isGameOver = gameData.status === 'finished';

    updateTurnDisplay(gameData);
    updateScores(gameData);

    const orderedGuesses = [];
    const playerIds = Object.keys(gameData.players);
    let turnOrder = [];

    if (gameMode === 'vsCPU') {
        turnOrder = [currentUserId, 'cpu'].filter(id => playerIds.includes(id));
    } else if (gameMode === 'multiplayer' && gameData.creatorId) {
        turnOrder = [gameData.creatorId, ...playerIds.filter(id => id !== gameData.creatorId && playerIds.includes(id))];
    } else {
        turnOrder = playerIds;
    }

    let guessIndex = 0;
    for (let i = 0; i < GUESS_COUNT; i++) {
        for (const pid of turnOrder) {
            if (gameData.players[pid] && gameData.players[pid].guesses[i]) {
                orderedGuesses[guessIndex++] = gameData.players[pid].guesses[i];
            }
        }
    }
    
    for (let i = 0; i < GUESS_COUNT; i++) {
        for (let j = 0; j < wordLength; j++) {
            const tile = document.getElementById(`tile-${i}-${j}`);
            if (tile) {
                const front = tile.querySelector('.front');
                const back = tile.querySelector('.back');
                
                tile.classList.remove('flip', 'correct', 'present', 'absent', 'failed', 'shake');
                front.textContent = '';
                back.textContent = '';

                if (orderedGuesses[i]) {
                    const guess = orderedGuesses[i];
                    front.textContent = guess.word[j];
                    back.textContent = guess.word[j];
                    
                    const isLastRow = i === orderedGuesses.length - 1;
                    
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
    }
    
    updateKeyboard(gameData);
    
    if (gameData.status === 'playing' && gameMode !== 'daily') {
        startTurnTimer();
    } else {
        stopTurnTimer();
    }
}

function updateScores(gameData) {
    const p1ScoreEl = document.getElementById('player1-score');
    const p2ScoreEl = document.getElementById('player2-score');
    if (!p1ScoreEl || !p2ScoreEl) return;
    
    const gameMode = state.getGameMode();
    if (gameMode === 'daily') {
        p1ScoreEl.innerHTML = '';
        p2ScoreEl.innerHTML = '';
        return;
    }

    const playerIds = Object.keys(gameData.players);
    let p1Id = (gameMode !== 'multiplayer') ? state.getUserId() : (gameData.creatorId || playerIds[0]);
    if (playerIds.length > 0) {
        const p1 = gameData.players[p1Id];
        if (p1) p1ScoreEl.innerHTML = `<span class="font-bold">${p1.username}</span><br>${p1.score} Puan`;
    }
    if (playerIds.length > 1) {
        const p2Id = playerIds.find(id => id !== p1Id);
        const p2 = gameData.players[p2Id];
        if (p2) p2ScoreEl.innerHTML = `<span class="font-bold">${p2.username}</span><br>${p2.score} Puan`;
    } else {
        p2ScoreEl.innerHTML = '';
    }
}

function updateTurnDisplay(gameData) {
    if (!turnDisplay || !timerDisplay || !startGameBtn || !shareGameBtn) return;
    
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();

    if (gameMode === 'daily') {
        timerDisplay.textContent = '';
        turnDisplay.textContent = 'Günün Kelimesi';
        return;
    }

    const numPlayers = Object.keys(gameData.players).length;
    shareGameBtn.classList.add('hidden');

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
        if (isMyTurn) {
            turnDisplay.textContent = "Sıra Sende!";
            turnDisplay.classList.add('pulsate');
        } else {
            turnDisplay.textContent = `Sıra: ${currentPlayerUsername || '...'}`;
            turnDisplay.classList.remove('pulsate');
        }
    }
}

function startTurnTimer() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    if (gameMode === 'daily') return;
    stopTurnTimer();
    if (isGameOver) return;

    let turnStartTime = (gameMode === 'multiplayer' && localGameData.turnStartTime?.toDate) 
        ? localGameData.turnStartTime.toDate() 
        : new Date();

    const interval = setInterval(async () => {
        let now = new Date();
        let elapsed = Math.floor((now - turnStartTime) / 1000);
        let timeLeft = timeLimit - elapsed;

        if (timerDisplay) {
            if (isMyTurn) {
                timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
                if (timeLeft <= 5) timerDisplay.classList.add('text-red-500');
                else timerDisplay.classList.remove('text-red-500');
            } else {
                timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
                timerDisplay.classList.remove('text-red-500');
            }
        }

        if (timeLeft <= 0 && isMyTurn) {
            stopTurnTimer();
            await failTurn('');
        }
    }, 1000);
    state.setTurnTimerInterval(interval);
}

function stopTurnTimer() {
    clearInterval(state.getTurnTimerInterval());
    state.setTurnTimerInterval(null);
    if (timerDisplay) timerDisplay.textContent = '';
}

async function failTurn(guessWord = '') {
    if (!isMyTurn) return;
    stopTurnTimer();

    const localGameData = state.getLocalGameData();
    const currentUserId = state.getUserId();
    const gameMode = state.getGameMode();

    const currentRow = Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0);
    shakeCurrentRow(wordLength, currentRow);

    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
    const newGuess = { word: guessWord.padEnd(wordLength, ' '), colors: Array(wordLength).fill('failed') };
    const totalGuessesMade = currentRow + 1;
    
    if (gameMode === 'multiplayer') {
        const gameRef = db.collection("games").doc(state.getCurrentGameId());
        const playerGuesses = localGameData.players[currentUserId].guesses || [];
        playerGuesses.push(newGuess);
        
        const playerIds = Object.keys(localGameData.players);
        const myIndex = playerIds.indexOf(currentUserId);
        const nextPlayerIndex = (myIndex + 1) % playerIds.length;
        
        const updates = {
            [`players.${currentUserId}.guesses`]: playerGuesses,
            currentPlayerId: playerIds[nextPlayerIndex],
            turnStartTime: firebase.firestore.FieldValue.serverTimestamp(),
        };

        if (totalGuessesMade >= GUESS_COUNT * playerIds.length) {
            updates.status = 'finished';
            updates.roundWinner = null;
        }
        await gameRef.update(updates).finally(() => { 
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto'; 
        });
    } else { 
        localGameData.players[currentUserId].guesses.push(newGuess);
        if (totalGuessesMade >= GUESS_COUNT) {
            localGameData.status = 'finished';
            localGameData.roundWinner = null;
        } else if (gameMode === 'vsCPU') {
            localGameData.currentPlayerId = 'cpu';
        }
        
        if (localGameData.status === 'finished') {
            await updateStats(false, 0);
        }

        renderGameState(localGameData, true).then(() => {
            if (localGameData.status === 'finished') {
                setTimeout(() => showScoreboard(localGameData), wordLength * 300);
            } else if (gameMode === 'vsCPU') {
                setTimeout(cpuTurn, 1500 + wordLength * 250);
            }
        });
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
    }
}

export function handleKeyPress(key) {
    if (isGameOver || !isMyTurn) return;
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
    if(!localGameData) return;
    const currentRow = Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0);
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
    if(!localGameData) return;
    const currentRow = Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0);
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

function cpuTurn() {
    const localGameData = state.getLocalGameData();
    if (isGameOver || !localGameData || localGameData.currentPlayerId !== 'cpu') return;

    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
    
    setTimeout(async () => {
        console.warn("CPU sırası atlandı (henüz yapay zeka entegre edilmedi).");
        localGameData.currentPlayerId = state.getUserId();
        await renderGameState(localGameData);
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';

    }, 1000);
}

async function updateStats(didWin, guessCount) {
    const currentUserId = state.getUserId();
    const gameMode = state.getGameMode();
    const currentUserProfile = state.getCurrentUserProfile();
    if (gameMode === 'multiplayer' || !currentUserId) return;
    const userRef = db.collection('users').doc(currentUserId);
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
        await userRef.set({ stats: stats }, { merge: true });
        // DÜZELTME: Doğrudan state'i değiştirmek yerine, yeni profili set edelim.
        const updatedProfile = { ...currentUserProfile, stats: stats };
        state.setCurrentUserProfile(updatedProfile);
    } catch (error) {
        console.error("İstatistikler güncellenemedi:", error);
    }
}

function getStatsFromProfile(profileData) {
    const defaultStats = { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, guessDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 } };
    const userStats = profileData?.stats || {};
    if (!userStats.guessDistribution || typeof userStats.guessDistribution !== 'object') {
        userStats.guessDistribution = {};
    }
    for (let i = 1; i <= 6; i++) {
        const key = String(i);
        if (userStats.guessDistribution[key] === undefined || typeof userStats.guessDistribution[key] !== 'number') {
            userStats.guessDistribution[key] = 0;
        }
    }
    return { ...defaultStats, ...userStats };
}

async function showScoreboard(gameData) {
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

    if (!roundWinnerDisplay || !correctWordDisplay || !finalScores || !matchWinnerDisplay || !meaningDisplay || !newRoundBtn) return;

    finalScores.style.display = (gameMode === 'daily' || gameMode === 'single' || gameMode === 'vsCPU') ? 'none' : 'block';
    matchWinnerDisplay.style.display = gameMode === 'daily' ? 'none' : 'block';

    if (gameMode === 'single' || gameMode === 'vsCPU' || gameMode === 'daily') {
        if (gameData.roundWinner === currentUserId) {
            roundWinnerDisplay.textContent = "Tebrikler, Kazandın!";
            playSound('win');
        } else {
            roundWinnerDisplay.textContent = "Kaybettin!";
            playSound('lose');
        }
    } else {
        if (gameData.roundWinner && gameData.players[gameData.roundWinner]) {
            const winnerName = gameData.players[gameData.roundWinner].username;
            roundWinnerDisplay.textContent = `${winnerName} Turu Kazandı!`;
            if (gameData.roundWinner === currentUserId) playSound('win'); else playSound('lose');
        } else {
            roundWinnerDisplay.textContent = "Berabere!";
            playSound('draw');
        }
    }

    correctWordDisplay.textContent = gameData.secretWord;
    meaningDisplay.textContent = 'Anlam yükleniyor...';
    const meaning = await fetchWordMeaning(gameData.secretWord);
    meaningDisplay.textContent = meaning;
    
    finalScores.innerHTML = `<h3 class="text-xl font-bold mb-2 text-center">Toplam Puan</h3>`;
    const sortedPlayers = Object.entries(gameData.players).map(([id, data]) => ({ ...data, id })).sort((a, b) => b.score - a.score);
    sortedPlayers.forEach(player => {
        const scoreEl = document.createElement('p');
        scoreEl.className = 'text-lg';
        scoreEl.textContent = `${player.username}: ${player.score} Puan`,
        finalScores.appendChild(scoreEl);
    });

    matchWinnerDisplay.textContent = '';
    newRoundBtn.textContent = 'Yeni Oyun';

    if (gameMode === 'daily') {
        newRoundBtn.classList.add('hidden');
    } else if (gameMode === 'multiplayer') {
        newRoundBtn.textContent = 'Yeni Tur';
        if (gameData.currentRound >= gameData.matchLength) {
            localStorage.removeItem('activeGameId');
            const p1 = sortedPlayers[0];
            const p2 = sortedPlayers.length > 1 ? sortedPlayers[1] : { score: -1 };
            if (p1.score > p2.score) {
                matchWinnerDisplay.textContent = `MAÇI ${p1.username} KAZANDI!`;
            } else if (p2.score > p1.score) {
                matchWinnerDisplay.textContent = `MAÇI ${p2.username} KAZANDI!`;
            } else {
                matchWinnerDisplay.textContent = 'MAÇ BERABERE!';
            }
            newRoundBtn.classList.add('hidden');
        } else if (currentUserId === gameData.creatorId) {
            newRoundBtn.classList.remove('hidden');
        } else {
            newRoundBtn.classList.add('hidden');
        }
    } else {
        newRoundBtn.classList.remove('hidden');
    }
}

export async function startNewRound() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    if (gameMode === 'multiplayer') {
        if (!localGameData) return;
        const newSecretWord = await getNewSecretWord(localGameData.wordLength);
        if (!newSecretWord) return;
        
        const playerIds = Object.keys(localGameData.players);
        const newPlayersState = {};
        playerIds.forEach(pid => {
            newPlayersState[pid] = { ...localGameData.players[pid], guesses: [] };
        });
        const updates = {
            secretWord: newSecretWord,
            players: newPlayersState,
            currentPlayerId: localGameData.creatorId,
            status: 'playing',
            roundWinner: null,
            currentRound: localGameData.currentRound + 1,
            turnStartTime: firebase.firestore.FieldValue.serverTimestamp(),
            firstFailurePlayerId: null
        };
        const gameRef = db.collection("games").doc(state.getCurrentGameId());
        await gameRef.update(updates);
        showScreen('game-screen');
    } else {
        setupAndStartGame(gameMode);
    }
}

async function fetchWordMeaning(word) {
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

export function shareResultsAsEmoji() {
    const localGameData = state.getLocalGameData();
    const gameMode = state.getGameMode();
    if (!localGameData) return;
    
    const playerGuesses = localGameData.players[state.getUserId()]?.guesses || [];
    const guessCount = localGameData.roundWinner === state.getUserId() ? playerGuesses.length : 'X';
    const title = (gameMode === 'daily') ? `Günün Kelimesi #${getDaysSinceEpoch()} ${guessCount}/${GUESS_COUNT}` : `Kelime Yarışması ${guessCount}/${GUESS_COUNT}`;
    const emojiMap = { correct: '🟩', present: '🟨', absent: '⬛', failed: '🟥' };
    
    let emojiGrid = playerGuesses.map(guess => {
        return guess.colors.map(color => emojiMap[color] || '⬛').join('');
    }).join('\n');
    
    const shareText = `${title}\n\n${emojiGrid}`;
    navigator.clipboard.writeText(shareText).then(() => { showToast('Sonuç panoya kopyalandı!'); }).catch(err => { console.error('Kopyalama başarısız: ', err); showToast('Kopyalama başarısız oldu!', true); });
}

export async function shareGame() {
    const gameId = state.getCurrentGameId();
    if (!gameId) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?gameId=${gameId}`;
    const shareData = {
        title: 'Kelime Yarışması',
        text: 'Kelime Yarışması oyunuma katıl!',
        url: shareUrl,
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (error) {
            console.error('Paylaşım hatası:', error);
            if (error.name !== 'AbortError') {
                showToast('Paylaşım desteklenmiyor. ID\'yi kopyalayın.', true);
            }
        }
    } else {
        showToast('Paylaşım desteklenmiyor. ID\'yi kopyalayın.', true);
    }
}