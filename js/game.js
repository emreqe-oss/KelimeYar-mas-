// js/game.js

import { db, getNewSecretWord, checkWordValidity } from './firebase.js';
import * as state from './state.js';
import { showToast, playSound, shakeCurrentRow, getStatsFromProfile } from './utils.js';
import { showScreen, createGrid, createKeyboard, updateKeyboard, getUsername, displayStats, guessGrid, turnDisplay, timerDisplay, gameIdDisplay, roundCounter, shareGameBtn, startGameBtn, keyboardContainer, updateMultiplayerScoreBoard } from './ui.js';

// --- SABİTLER ---
const scorePoints = [1000, 800, 600, 400, 200, 100];
const GUESS_COUNT = 6;
const DAILY_WORD_LENGTH = 5;
const MAX_BR_PLAYERS = 4;

// --- STATE DEĞİŞKENLERİ ---
let isGameOver = false;
let wordLength = 5;
let timeLimit = 45;

function isBattleRoyale(mode) {
    return mode === 'multiplayer-br';
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


async function submitGuess() {
    const localGameData = state.getLocalGameData();
    if(!localGameData || localGameData.status !== 'playing') return;
    
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
    
    if (gameMode !== 'daily' && gameMode !== 'single' && gameMode !== 'vsCPU' && localGameData.isHardMode) {
        // Hard Mode mantığı buraya gelir
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
    
    // --- DÜZELTME: Oyun moduna göre ayrım yap ---
    if (gameMode === 'multiplayer' || isBattleRoyale(gameMode)) {
        // --- ONLINE MODLAR İÇİN FIRESTORE GÜNCELLEMESİ ---
        const gameRef = db.collection("games").doc(state.getCurrentGameId());
        const playerGuesses = playerState.guesses || [];
        playerGuesses.push(newGuess);

        const updates = {
            [`players.${currentUserId}.guesses`]: playerGuesses,
        };
        
        let isWinner = (guessWord === secretWord);

        if (isBattleRoyale(gameMode)) {
            if (isWinner) {
                updates.status = 'finished';
                updates.roundWinner = currentUserId; 
                updates[`players.${currentUserId}.isWinner`] = true;
            } else if (playerGuesses.length >= GUESS_COUNT) {
                updates[`players.${currentUserId}.isEliminated`] = true;
            }
        } else { // Sıralı multiplayer
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
            } else if ((Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0) + 1) >= GUESS_COUNT * playerIds.length) {
                updates.status = 'finished';
                updates.roundWinner = null;
            }
        }

        await gameRef.update(updates).finally(() => { 
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto'; 
            if (isBattleRoyale(gameMode) && localGameData.status === 'playing') startBRTimer();
        });

    } else { 
        // --- YEREL MODLAR İÇİN GÜNCELLEME ---
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
        
        const didWin = localGameData.roundWinner === currentUserId;
        const guessCount = didWin ? localGameData.players[currentUserId].guesses.length : 0;
        
        if (localGameData.status === 'finished') {
            await updateStats(didWin, guessCount);
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
    }
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
    const newGuess = { word: guessWord.padEnd(wordLength, ' '), colors: Array(wordLength).fill('failed') };
    
    const playerGuesses = playerState.guesses || [];
    playerGuesses.push(newGuess);

    if (gameMode === 'multiplayer') {
        const gameRef = db.collection("games").doc(state.getCurrentGameId());
        const playerIds = Object.keys(localGameData.players);
        const myIndex = playerIds.indexOf(currentUserId);
        const nextPlayerIndex = (myIndex + 1) % playerIds.length;
        
        const updates = {
            [`players.${currentUserId}.guesses`]: playerGuesses,
            currentPlayerId: playerIds[nextPlayerIndex],
            turnStartTime: firebase.firestore.FieldValue.serverTimestamp(),
        };

        if ((Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0) + 1) >= GUESS_COUNT * playerIds.length) {
            updates.status = 'finished';
            updates.roundWinner = null;
        }
        await gameRef.update(updates);

    } else if (isBattleRoyale(gameMode)) {
        const gameRef = db.collection("games").doc(state.getCurrentGameId());
        const updates = {
            [`players.${currentUserId}.guesses`]: playerGuesses,
            [`players.${currentUserId}.isEliminated`] : true
        };
        await gameRef.update(updates);
    }
    
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
}

export function handleKeyPress(key) {
    const localGameData = state.getLocalGameData();
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();

    if (!localGameData || localGameData.status !== 'playing') return;
    
    const isPlayerActive = localGameData.players[currentUserId]?.guesses.length < GUESS_COUNT && !localGameData.players[currentUserId]?.isWinner;
    const canPlay = isBattleRoyale(gameMode) || gameMode === 'daily' || gameMode === 'single' || gameMode === 'vsCPU' || localGameData.currentPlayerId === currentUserId;

    if (!canPlay || !isPlayerActive) return;

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
    if(!localGameData) return;
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
    if (gameMode === 'multiplayer' || isBattleRoyale(gameMode) || !currentUserId) return;
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
        const updatedProfile = { ...currentUserProfile, stats: stats };
        state.setCurrentUserProfile(updatedProfile);
    } catch (error) {
        console.error("İstatistikler güncellenemedi:", error);
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
    const isBR = isBattleRoyale(gameMode);

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
            roundWinnerDisplay.textContent = `${winnerName} Kazandı!`;
            if (gameData.roundWinner === currentUserId) playSound('win'); else playSound('lose');
        } else {
            roundWinnerDisplay.textContent = isBR ? "Kimse bulamadı, Berabere!" : "Tur Berabere!";
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
    newRoundBtn.textContent = isBR ? 'Yeni BR Oyun' : 'Yeni Tur';

    if (gameMode === 'daily' || isBR) {
        newRoundBtn.classList.add('hidden');
    } else if (gameMode === 'multiplayer') {
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
        };
        const gameRef = db.collection("games").doc(state.getCurrentGameId());
        await gameRef.update(updates);
    } else if (isBattleRoyale(gameMode)) {
        createBRGame();
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
             return showToast("Bu bir BR oyunudur, lütfen ilgili BR katılma butonunu kullanın.", true);
        }

        if (Object.keys(gameData.players).length < 2 && !gameData.players[currentUserId]) {
            await gameRef.update({
                [`players.${currentUserId}`]: { username, guesses: [], score: 0 }
            });
        } else if (!gameData.players[currentUserId] && Object.keys(gameData.players).length >= 2) {
            return showToast("Bu oyun dolu veya başlamış.", true);
        }
        
        state.setGameMode('multiplayer');
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
        turnStartTime: firebase.firestore.FieldValue.serverTimestamp(), 
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

async function renderGameState(gameData, animateLastRow = false) {
    if (!gameData) return;

    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const isBR = isBattleRoyale(gameMode);
    
    const sequentialGameInfo = document.getElementById('sequential-game-info');
    if (sequentialGameInfo) {
        sequentialGameInfo.classList.toggle('hidden', isBR);
    }
    updateMultiplayerScoreBoard(gameData);

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
        else if (gameMode === 'multiplayer' && isMyTurn) startTurnTimer();
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
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    if (isBattleRoyale(gameMode) || gameMode === 'daily') return;
    stopTurnTimer();
    if (localGameData.status !== 'playing' || localGameData.currentPlayerId !== state.getUserId()) return;

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
            const gameRef = db.collection("games").doc(state.getCurrentGameId());
            await gameRef.update({ status: 'finished', roundWinner: null });
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
    state.setGameMode(null);
    showScreen('mode-selection-screen');
    const rejoinBtn = document.getElementById('rejoin-game-btn');
    if (rejoinBtn) rejoinBtn.classList.add('hidden');
}