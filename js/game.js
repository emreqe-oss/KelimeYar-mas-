// js/game.js
import { db } from './firebase.js';
import * as state from './state.js';
import { showToast, playSound, shakeCurrentRow } from './utils.js';
import { showScreen, createGrid, createKeyboard, updateKeyboard, getUsername, displayStats, guessGrid, turnDisplay, timerDisplay, roundCounter, shareGameBtn, startGameBtn } from './ui.js';

// --- SABİTLER ---
const scorePoints = [1000, 800, 600, 400, 200, 100];
const GUESS_COUNT = 6;
const DAILY_WORD_LENGTH = 5;

let currentRow = 0;
let isMyTurn = false;
let isGameOver = false;
let wordLength = 5;
let timeLimit = 45;

// --- KELİME YÜKLEME ---
export async function loadWords() {
    const loadingText = document.getElementById('loading-words');
    if (loadingText) loadingText.classList.remove('hidden');
    try {
        const [kelimelerResponse, cevaplarResponse] = await Promise.all([
            fetch('kelimeler.json'),
            fetch('cevaplar.json')
        ]);

        if (!kelimelerResponse.ok || !cevaplarResponse.ok) {
            throw new Error('Sözlük dosyaları sunucudan yüklenemedi.');
        }

        state.setKelimeSozlugu(await kelimelerResponse.json());
        state.setCevapSozlugu(await cevaplarResponse.json());

        console.log("Kelimeler ve Cevaplar başarıyla yüklendi.");
        if (loadingText) loadingText.classList.add('hidden');

    } catch (error) {
        console.error("Kelime yükleme hatası:", error);
        if (loadingText) loadingText.textContent = 'Kelimeler yüklenemedi, lütfen sayfayı yenileyin.';
        showToast("Kelimeler yüklenemedi! Sayfayı yenileyin.", true);
    }
}

// --- GÜNLÜK KELİME FONKSİYONLARI ---
function getDaysSinceEpoch() {
    const today = new Date();
    const epoch = new Date('2024-01-01');
    return Math.floor((today - epoch) / (1000 * 60 * 60 * 24));
}

function getWordOfTheDay() {
    const dayIndex = getDaysSinceEpoch();
    const wordList = state.cevapSozlugu[DAILY_WORD_LENGTH];
    if (!wordList || wordList.length === 0) {
        console.error("Günün kelimesi için cevap listesi bulunamadı!");
        return state.kelimeSozlugu[DAILY_WORD_LENGTH][0];
    }
    return wordList[dayIndex % wordList.length];
}

function getDailyGameState() {
    const saved = localStorage.getItem(`dailyGameState_${state.userId}`);
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
        guesses: gameState.players[state.userId].guesses,
        status: gameState.status,
        secretWord: gameState.secretWord
    };
    localStorage.setItem(`dailyGameState_${state.userId}`, JSON.stringify(toSave));
}

export function startDailyGame() {
    state.setGameMode('daily');
    const username = getUsername();
    const secretWord = getWordOfTheDay();
    wordLength = DAILY_WORD_LENGTH;
    const savedState = getDailyGameState();
    let guesses = [];
    let status = 'playing';

    if (savedState) {
        guesses = savedState.guesses;
        status = savedState.status;
    }

    const gameData = {
        wordLength,
        secretWord,
        timeLimit: 999,
        isHardMode: true,
        players: {
            [state.userId]: { username, guesses, score: 0 }
        },
        currentPlayerId: state.userId,
        status,
    };
    state.setLocalGameData(gameData);

    if (status === 'finished') {
        showScoreboard(gameData);
    } else {
        showScreen('game-screen');
        initializeGameUI(gameData);
        renderGameState(gameData);
    }
}


// --- OYUN KURMA VE KATILMA ---

export function setupAndStartGame(mode) {
    state.setGameMode(mode);
    wordLength = parseInt(document.getElementById('word-length-select-single').value);
    timeLimit = parseInt(document.getElementById('time-select-single').value);
    const isHard = document.getElementById('hard-mode-checkbox').checked;
    const username = getUsername();
    const secretWord = state.cevapSozlugu[wordLength][Math.floor(Math.random() * state.cevapSozlugu[wordLength].length)];
    
    const gameData = {
        wordLength,
        secretWord,
        timeLimit,
        isHardMode: isHard,
        currentRound: 1,
        matchLength: 1,
        players: {
            [state.userId]: { username, guesses: [], score: 0 }
        },
        currentPlayerId: state.userId,
        status: 'playing',
        turnStartTime: new Date()
    };
    
    if (state.gameMode === 'vsCPU') {
        gameData.players['cpu'] = { username: 'Bilgisayar', guesses: [], score: 0 };
    }
    
    state.setLocalGameData(gameData);
    showScreen('game-screen');
    initializeGameUI(gameData);
    renderGameState(gameData);
}

export async function createGame(invitedFriendId = null) {
    if (!db || !state.userId) return showToast("Sunucuya bağlanılamıyor.", true);
    state.setGameMode('multiplayer');
    const username = getUsername();
    const selectedLength = parseInt(document.getElementById('word-length-select-multi').value);
    const selectedTime = parseInt(document.getElementById('time-select-multi').value);
    const selectedMatchLength = parseInt(document.getElementById('match-length-select').value);
    const isHard = document.getElementById('hard-mode-checkbox-multi').checked;
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const secretWord = state.cevapSozlugu[selectedLength][Math.floor(Math.random() * state.cevapSozlugu[selectedLength].length)];
    
    const gameData = {
        gameId,
        wordLength: selectedLength,
        secretWord,
        timeLimit: selectedTime,
        creatorId: state.userId,
        isHardMode: isHard,
        matchLength: selectedMatchLength,
        currentRound: 1,
        players: {
            [state.userId]: { username, guesses: [], score: 0 }
        },
        currentPlayerId: state.userId,
        status: invitedFriendId ? 'invited' : 'waiting',
        roundWinner: null,
        createdAt: new Date(),
        turnStartTime: firebase.firestore.FieldValue.serverTimestamp(),
        firstFailurePlayerId: null
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

export async function joinGame(gameId) {
    if (!db || !state.userId) return showToast("Sunucuya bağlanılamıyor.", true);
    if (!gameId) return showToast("Lütfen bir Oyun ID'si girin.", true);

    state.setGameMode('multiplayer');
    const username = getUsername();
    const gameRef = db.collection("games").doc(gameId);

    try {
        const gameDoc = await gameRef.get();
        if (!gameDoc.exists) {
            localStorage.removeItem('activeGameId');
            return showToast("Oyun bulunamadı!", true);
        }
        
        const gameData = gameDoc.data();
        if (Object.keys(gameData.players).length === 1 && !gameData.players[state.userId]) {
            await gameRef.update({
                [`players.${state.userId}`]: { username, guesses: [], score: 0 }
            });
        } else if (!gameData.players[state.userId]) {
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


// --- OYUN AKIŞI ---

function initializeGameUI(gameData) {
    wordLength = gameData.wordLength;
    if (wordLength === 4) { guessGrid.style.maxWidth = '220px'; } 
    else if (wordLength === 5) { guessGrid.style.maxWidth = '280px'; } 
    else { guessGrid.style.maxWidth = '320px'; }
    createGrid(wordLength, GUESS_COUNT);
    createKeyboard(handleKeyPress);
}


function listenToGameUpdates(gameId) {
    if (state.gameUnsubscribe) state.gameUnsubscribe();

    const gameRef = db.collection("games").doc(gameId);
    const unsubscribe = gameRef.onSnapshot((doc) => {
        const gameData = doc.data();
        if (!gameData) {
            showToast("Oyun sonlandırıldı.");
            leaveGame();
            return;
        }

        const oldGameData = state.localGameData;
        state.setLocalGameData(gameData);

        const oldGuessesCount = oldGameData ? Object.values(oldGameData.players).flatMap(p => p.guesses).length : 0;
        const newGuessesCount = Object.values(gameData.players).flatMap(p => p.guesses).length;

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
    if (state.gameUnsubscribe) state.gameUnsubscribe();
    stopTurnTimer();
    localStorage.removeItem('activeGameId');
    state.setGameUnsubscribe(null);
    state.setCurrentGameId(null);
    state.setLocalGameData(null);
    state.setGameMode(null);
    showScreen('mode-selection-screen');
    document.getElementById('rejoin-game-btn').classList.add('hidden');
}


async function renderGameState(gameData, animateLastRow = false) {
    // UI güncellemeleri
    if (state.gameMode === 'daily') {
        gameIdDisplay.textContent = 'Günün Kelimesi';
        document.getElementById('game-info-bar').style.display = 'none';
        roundCounter.textContent = new Date().toLocaleDateString('tr-TR');
    } else {
        gameIdDisplay.textContent = state.gameMode === 'multiplayer' ? gameData.gameId : 'Tek Kişilik';
        document.getElementById('game-info-bar').style.display = state.gameMode === 'multiplayer' ? 'flex' : 'none';
        roundCounter.textContent = (state.gameMode === 'multiplayer') ? `Tur ${gameData.currentRound}/${gameData.matchLength}` : '';
    }

    timeLimit = gameData.timeLimit || 45;
    isMyTurn = gameData.currentPlayerId === state.userId && gameData.status === 'playing';
    isGameOver = gameData.status === 'finished';

    updateTurnDisplay(gameData);
    updateScores(gameData);

    // Grid'i render et
    const orderedGuesses = [];
    const playerIds = Object.keys(gameData.players);
    let turnOrder = [];

    if (state.gameMode === 'vsCPU') {
        turnOrder = [state.userId, 'cpu'].filter(id => playerIds.includes(id));
    } else if (state.gameMode === 'multiplayer' && gameData.creatorId) {
        turnOrder = [gameData.creatorId, ...playerIds.filter(id => id !== gameData.creatorId)];
    } else {
        turnOrder = playerIds;
    }

    const maxGuessesPerPlayer = Math.max(0, ...Object.values(gameData.players).map(p => p.guesses.length));
    for (let i = 0; i < maxGuessesPerPlayer; i++) {
        for (const pid of turnOrder) {
            if (gameData.players[pid] && gameData.players[pid].guesses[i]) {
                orderedGuesses.push(gameData.players[pid].guesses[i]);
            }
        }
    }

    // Önceki tahminleri render et
    for (let i = 0; i < orderedGuesses.length; i++) {
        const isLastRow = i === orderedGuesses.length - 1;
        await renderGuess(i, orderedGuesses[i].word, orderedGuesses[i].colors, animateLastRow && isLastRow);
    }

    // Kalan satırları temizle
    for (let i = orderedGuesses.length; i < GUESS_COUNT; i++) {
        for (let j = 0; j < wordLength; j++) {
            const tile = document.getElementById(`tile-${i}-${j}`);
            if (tile) {
                tile.querySelector('.front').textContent = '';
                tile.querySelector('.back').textContent = '';
                tile.classList.remove('flip', 'correct', 'present', 'absent', 'failed', 'shake');
            }
        }
    }
    
    currentRow = orderedGuesses.length;
    updateKeyboard(gameData);
    
    if (gameData.status === 'playing' && state.gameMode !== 'daily') {
        startTurnTimer();
    } else {
        stopTurnTimer();
    }
}

function updateScores(gameData) {
    if (state.gameMode === 'daily') {
        document.getElementById('player1-score').innerHTML = '';
        document.getElementById('player2-score').innerHTML = '';
        return;
    }
    const playerIds = Object.keys(gameData.players);
    const p1ScoreEl = document.getElementById('player1-score');
    const p2ScoreEl = document.getElementById('player2-score');
    let p1Id = (state.gameMode !== 'multiplayer') ? state.userId : (gameData.creatorId || playerIds[0]);
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
    if (state.gameMode === 'daily') {
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
            if (state.userId === gameData.creatorId) {
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
            turnDisplay.textContent = `Sıra: ${currentPlayerUsername}`;
            turnDisplay.classList.remove('pulsate');
        }
    }
}

async function renderGuess(rowIndex, word, colors, animate = false) {
    return new Promise(async (resolve) => {
        for (let i = 0; i < wordLength; i++) {
            const tile = document.getElementById(`tile-${rowIndex}-${i}`);
            if (tile) {
                const front = tile.querySelector('.front');
                const back = tile.querySelector('.back');
                front.textContent = word[i];
                back.textContent = word[i];
                tile.classList.remove('correct', 'present', 'absent', 'failed');
                if (animate) {
                    await new Promise(res => setTimeout(res, i * 250));
                    tile.classList.add(colors[i]);
                    tile.classList.add('flip');
                } else {
                    tile.classList.add(colors[i]);
                    tile.classList.add('flip');
                }
            }
        }
        resolve();
    });
}


// --- ZAMANLAYICI VE TUR YÖNETİMİ ---

function startTurnTimer() {
    if (state.gameMode === 'daily') return;
    stopTurnTimer();
    if (isGameOver) return;

    let turnStartTime = (state.gameMode === 'multiplayer' && state.localGameData.turnStartTime?.toDate) 
        ? state.localGameData.turnStartTime.toDate() 
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
    clearInterval(state.turnTimerInterval);
    state.setTurnTimerInterval(null);
    if (timerDisplay) timerDisplay.textContent = '';
}

async function failTurn(guessWord = '') {
    // Implementasyon submitGuess ile benzer olacağı için şimdilik boş bırakılabilir
    // veya basit bir versiyonu yazılabilir. Bu fonksiyonlar game.js içinde kalacak.
}

// --- KLAVYE VE TAHMİN İŞLEMLERİ ---

export function handleKeyPress(key) {
    if (isGameOver || !isMyTurn) return;
    const processedKey = key.toLocaleUpperCase('tr-TR');
    if (processedKey === 'ENTER') {
        playSound('click');
        submitGuess();
    } else if (processedKey === '⌫' || processedKey === 'BACKSPACE') {
        playSound('click');
        deleteLetter();
    } else if (processedKey.length === 1 && "ERTYUIOPĞÜASDFGHJKLŞİZC VBNMÖÇ".includes(processedKey)) {
        addLetter(processedKey);
    }
}

function addLetter(letter) {
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
    if (currentRow >= GUESS_COUNT) return;
    for (let i = wordLength - 1; i >= 0; i--) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        if (tile && tile.querySelector('.front').textContent !== '') {
            tile.querySelector('.front').textContent = '';
            break;
        }
    }
}

async function submitGuess() {
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
    if (state.localGameData.isHardMode && state.localGameData.players[state.userId].guesses.length > 0) {
        const allPlayerGuesses = state.localGameData.players[state.userId].guesses;
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
    
    // Sözlük kontrolü
    if (!state.kelimeSozlugu[wordLength] || !state.kelimeSozlugu[wordLength].includes(guessWord)) {
        showToast("Kelime sözlükte bulunamadı!", true);
        shakeCurrentRow(wordLength, currentRow);
        return;
    }
    
    document.getElementById('keyboard').style.pointerEvents = 'none';
    stopTurnTimer();
    
    const secretWord = state.localGameData.secretWord;
    const colors = calculateColors(guessWord, secretWord);
    const newGuess = { word: guessWord, colors: colors };
    const totalGuessesMade = Object.values(state.localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0) + 1;

    if (state.gameMode === 'multiplayer') {
        const gameRef = db.collection("games").doc(state.currentGameId);
        const playerGuesses = state.localGameData.players[state.userId].guesses || [];
        playerGuesses.push(newGuess);
        const playerIds = Object.keys(state.localGameData.players);
        const myIndex = playerIds.indexOf(state.userId);
        const nextPlayerIndex = (myIndex + 1) % playerIds.length;
        const updates = {
            [`players.${state.userId}.guesses`]: playerGuesses,
            currentPlayerId: playerIds[nextPlayerIndex],
            turnStartTime: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (guessWord === secretWord) {
            updates.status = 'finished';
            updates.roundWinner = state.userId;
            const scoreToAdd = scorePoints[playerGuesses.length - 1] || 0;
            updates[`players.${state.userId}.score`] = (state.localGameData.players[state.userId].score || 0) + scoreToAdd;
        } else if (totalGuessesMade >= GUESS_COUNT) {
            updates.status = 'finished';
            updates.roundWinner = null;
        }
        await gameRef.update(updates).finally(() => { document.getElementById('keyboard').style.pointerEvents = 'auto'; });

    } else { // Single player, vsCPU, daily
        state.localGameData.players[state.userId].guesses.push(newGuess);
        if (guessWord === secretWord) {
            state.localGameData.status = 'finished';
            state.localGameData.roundWinner = state.userId;
            if (state.gameMode !== 'daily') {
                const scoreToAdd = scorePoints[state.localGameData.players[state.userId].guesses.length - 1] || 0;
                state.localGameData.players[state.userId].score += scoreToAdd;
            }
        } else {
            if (totalGuessesMade >= GUESS_COUNT) {
                state.localGameData.status = 'finished';
                state.localGameData.roundWinner = null;
            } else {
                if (state.gameMode === 'vsCPU') {
                    state.localGameData.currentPlayerId = 'cpu';
                }
            }
        }

        const didWin = state.localGameData.roundWinner === state.userId;
        const guessCount = didWin ? state.localGameData.players[state.userId].guesses.length : 0;
        if (state.localGameData.status === 'finished') {
            if (state.gameMode !== 'multiplayer') await updateStats(didWin, guessCount);
            if (state.gameMode === 'daily') saveDailyGameState(state.localGameData);
        }

        renderGameState(state.localGameData, true).then(() => {
            if (state.localGameData.status === 'finished') {
                setTimeout(() => showScoreboard(state.localGameData), wordLength * 300);
            } else if (state.gameMode === 'vsCPU') {
                setTimeout(cpuTurn, 1500 + wordLength * 250);
            }
        });
        document.getElementById('keyboard').style.pointerEvents = 'auto';
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

// --- İSTATİSTİK VE SKOR ---
async function updateStats(didWin, guessCount) {
    if (state.gameMode === 'multiplayer') return;
    const userRef = db.collection('users').doc(state.userId);
    const stats = getStatsFromProfile(state.currentUserProfile);
    
    stats.played += 1;
    if (didWin) {
        stats.wins += 1;
        stats.currentStreak += 1;
        if (stats.currentStreak > stats.maxStreak) {
            stats.maxStreak = stats.currentStreak;
        }
        if (guessCount >= 1 && guessCount <= 6) {
            stats.guessDistribution[guessCount] += 1;
        }
    } else {
        stats.currentStreak = 0;
    }
    
    try {
        await userRef.set({ stats: stats }, { merge: true });
        state.currentUserProfile.stats = stats;
    } catch (error) {
        console.error("İstatistikler güncellenemedi:", error);
    }
}
function getStatsFromProfile(profileData) {
    const defaultStats = { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, guessDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 } };
    return profileData?.stats ? { ...defaultStats, ...profileData.stats } : defaultStats;
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

    finalScores.style.display = (state.gameMode === 'daily' || state.gameMode === 'single') ? 'none' : 'block';
    matchWinnerDisplay.style.display = state.gameMode === 'daily' ? 'none' : 'block';

    if (state.gameMode === 'single' || state.gameMode === 'vsCPU' || state.gameMode === 'daily') {
        if (gameData.roundWinner === state.userId) {
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
            if (gameData.roundWinner === state.userId) playSound('win'); else playSound('lose');
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
        scoreEl.textContent = `${player.username}: ${player.score} Puan`;
        finalScores.appendChild(scoreEl);
    });

    matchWinnerDisplay.textContent = '';
    newRoundBtn.textContent = 'Yeni Oyun';

    if (state.gameMode === 'daily') {
        newRoundBtn.classList.add('hidden');
    } else if (state.gameMode === 'multiplayer') {
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
        } else if (state.userId === gameData.creatorId) {
            newRoundBtn.classList.remove('hidden');
        } else {
            newRoundBtn.classList.add('hidden');
        }
    } else {
        newRoundBtn.classList.remove('hidden');
    }
}

export async function startNewRound() {
    if (state.gameMode === 'multiplayer') {
        if (!state.localGameData) return;
        const newWordList = state.cevapSozlugu[state.localGameData.wordLength];
        const newSecretWord = newWordList[Math.floor(Math.random() * newWordList.length)];
        const playerIds = Object.keys(state.localGameData.players);
        const newPlayersState = {};
        playerIds.forEach(pid => {
            newPlayersState[pid] = { ...state.localGameData.players[pid], guesses: [] };
        });
        const updates = {
            secretWord: newSecretWord,
            players: newPlayersState,
            currentPlayerId: state.localGameData.creatorId,
            status: 'playing',
            roundWinner: null,
            currentRound: state.localGameData.currentRound + 1,
            turnStartTime: firebase.firestore.FieldValue.serverTimestamp(),
            firstFailurePlayerId: null
        };
        const gameRef = db.collection("games").doc(state.currentGameId);
        await gameRef.update(updates);
        showScreen('game-screen');
    } else {
        setupAndStartGame(state.gameMode);
    }
}

async function fetchWordMeaning(word) {
    try {
        const response = await fetch(`https://sozluk.gov.tr/gts?ara=${word.toLocaleLowerCase('tr-TR')}`);
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

// ... CPU Turn, Share results etc.
function cpuTurn() {
    // Bu fonksiyon şimdilik aynı kalabilir, sadece state importlarını kullanacak.
}

export function shareResultsAsEmoji() {
    // Bu fonksiyon şimdilik aynı kalabilir, sadece state importlarını kullanacak.
}

export async function shareGame() {
    if (navigator.share) {
        try {
            const shareUrl = `${window.location.origin}${window.location.pathname}?gameId=${state.currentGameId}`;
            await navigator.share({
                title: 'Kelime Yarışması',
                text: `Kelime Yarışması oyunuma katıl!`,
                url: shareUrl,
            });
        } catch (error) {
            console.error('Paylaşım hatası:', error);
        }
    } else {
        showToast('Paylaşım desteklenmiyor. ID\'yi kopyalayın.', true);
    }
}