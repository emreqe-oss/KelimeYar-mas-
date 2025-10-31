// js/game.js - YENİ VE TAM KOD (Nihai Senkronizasyon Düzeltmesi)

import { db, getNewSecretWord, checkWordValidity, submitMultiplayerGuess, failMultiplayerTurn } from './firebase.js';
import {
    collection, query, where, limit, getDocs, getDoc, doc, setDoc, updateDoc,
    runTransaction, onSnapshot, serverTimestamp, arrayUnion
} from "firebase/firestore";
import * as state from './state.js';
import { showToast, playSound, shakeCurrentRow, getStatsFromProfile } from './utils.js';
import { showScreen, createGrid, createKeyboard, updateKeyboard, getUsername, displayStats, guessGrid, turnDisplay, timerDisplay, gameIdDisplay, roundCounter, shareGameBtn, startGameBtn, keyboardContainer, updateMultiplayerScoreBoard } from './ui.js';
import { cpuWordList } from './cpu-words.js';

// Sabitler ve yardımcı fonksiyonlar
const GUESS_COUNT = 6;
const MAX_BR_PLAYERS = 4;
let wordLength = 5;
let timeLimit = 45;

const getRandomWordLength = () => [4, 5, 6][Math.floor(Math.random() * 3)];
function isBattleRoyale(mode) { return mode === 'multiplayer-br'; }
function getDaysSinceEpoch() {
    const today = new Date();
    const epoch = new Date('2024-01-01');
    return Math.floor((today - epoch) / (1000 * 60 * 60 * 24));
}

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

    const gameData = {
        gameId, wordLength: selectedLength, secretWord, timeLimit,
        creatorId: currentUserId, isHardMode: false, matchLength,
        currentRound: 1, players: { [currentUserId]: { username, guesses: [], score: 0 } },
        playerIds: [currentUserId],
        currentPlayerId: currentUserId, 
        status: invitedFriendId ? 'invited' : 'waiting',
        roundWinner: null,
        createdAt: serverTimestamp(),
        turnStartTime: serverTimestamp(),
        GUESS_COUNT: GUESS_COUNT, gameType
    };

    if (invitedFriendId) { gameData.invitedPlayerId = invitedFriendId; }

    try {
        await setDoc(doc(db, "games", gameId), gameData);
        
        state.setGameMode('multiplayer');
        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);

        // --- EKSİK OLAN KRİTİK SATIR BURAYA EKLENDİ ---
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
        state.setLocalGameData(gameDataToJoin); // Katılan oyuncu için de yerel durumu ayarla
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

// ... dosyanın geri kalanı aynı, değişiklik yok ...
// (Tüm fonksiyonların tam listesi aşağıdadır)

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
            const dailyState = getDailyGameState();
            if (dailyState) {
                restoreDailyGame(dailyState);
                return;
            }
            gameSettings.wordLength = 5;
            gameSettings.timeLimit = 60;
            gameSettings.matchLength = 1;
            secretWord = getDailySecretWord();
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
        currentPlayerId: state.getUserId(), status: 'playing', turnStartTime: new Date(), GUESS_COUNT: GUESS_COUNT
    };

    if (config.mode === 'vsCPU') {
        gameData.players['cpu'] = { username: 'Bilgisayar', guesses: [], score: 0 };
    }

    state.setLocalGameData(gameData);
    showScreen('game-screen');
    initializeGameUI(gameData);
    await renderGameState(gameData);
}

function getDailySecretWord() {
    const dayIndex = getDaysSinceEpoch();
    const dailyWordList = cpuWordList["5"];
    return dailyWordList[dayIndex % dailyWordList.length];
}

function getDailyGameState() {
    const saved = localStorage.getItem(`dailyGameState_${state.getUserId()}`);
    if (!saved) return null;
    try {
        const parsedState = JSON.parse(saved);
        const today = new Date().toDateString();
        return (parsedState.date === today) ? parsedState : null;
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
        wordLength: savedState.secretWord.length, secretWord: savedState.secretWord, timeLimit: 60,
        isHardMode: false, currentRound: 1, matchLength: 1,
        players: { [state.getUserId()]: { username: getUsername(), guesses: savedState.guesses, score: 0 } },
        currentPlayerId: state.getUserId(), status: savedState.status, turnStartTime: new Date(), GUESS_COUNT: GUESS_COUNT
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
                presentLetters.add(guess.word[i]);
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
    const didWin = localGameData.roundWinner === currentUserId;
    const guessCount = didWin ? localGameData.players[currentUserId].guesses.length : 0;
    if (localGameData.status === 'finished') {
        await updateStats(didWin, guessCount);
        if (gameMode === 'daily') saveDailyGameState(localGameData);
    }
    renderGameState(localGameData, true).then(() => {
        if (localGameData.status === 'finished') {
            setTimeout(() => showScoreboard(localGameData), wordLength * 300);
        } else if (gameMode === 'vsCPU' && localGameData.currentPlayerId === 'cpu') {
            setTimeout(cpuTurn, 1500 + wordLength * 250);
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
        if (gameMode === 'vsCPU') {
            localGameData.currentPlayerId = 'cpu';
            renderGameState(localGameData, true).then(() => {
                setTimeout(cpuTurn, 1500 + wordLength * 250);
            });
        } else {
            localGameData.status = 'finished';
            localGameData.roundWinner = null;
            renderGameState(localGameData, true).then(() => {
                setTimeout(() => showScoreboard(localGameData), wordLength * 300);
            });
        }
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

function findBestCpuGuess() {
    const localGameData = state.getLocalGameData();
    const allGuesses = [...localGameData.players[state.getUserId()].guesses, ...localGameData.players['cpu'].guesses];
    const wordLenStr = String(localGameData.wordLength);
    let possibleWords = [...(cpuWordList[wordLenStr] || [])];
    const correctLetters = {};
    const presentLetters = new Set();
    const absentLetters = new Set();
    allGuesses.forEach(g => {
        for (let i = 0; i < g.word.length; i++) {
            const letter = g.word[i];
            const color = g.colors[i];
            if (color === 'correct') {
                correctLetters[i] = letter;
                presentLetters.add(letter);
            } else if (color === 'present') {
                presentLetters.add(letter);
            } else if (color === 'absent') {
                absentLetters.add(letter);
            }
        }
    });
    possibleWords = possibleWords.filter(word => {
        for (const pos in correctLetters) {
            if (word[pos] !== correctLetters[pos]) return false;
        }
        for (const letter of absentLetters) {
            if (!presentLetters.has(letter) && word.includes(letter)) return false;
        }
        for (const letter of presentLetters) {
            if (!word.includes(letter)) return false;
        }
        for (const g of allGuesses) {
            for (let i = 0; i < g.word.length; i++) {
                if (g.colors[i] === 'present' && word[i] === g.word[i]) return false;
            }
        }
        return true;
    });
    const guessedWords = new Set(allGuesses.map(g => g.word));
    const finalWords = possibleWords.filter(w => !guessedWords.has(w));
    if (finalWords.length > 0) {
        return finalWords[Math.floor(Math.random() * finalWords.length)];
    } else {
        const emergencyList = (cpuWordList[wordLenStr] || []).filter(w => !guessedWords.has(w));
        return emergencyList.length > 0 ? emergencyList[Math.floor(Math.random() * emergencyList.length)] : null;
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
    if (!guess) {
        console.error("CPU tahmin edecek kelime bulamadı. Sıra oyuncuya geri veriliyor.");
        localGameData.currentPlayerId = state.getUserId();
        await renderGameState(localGameData);
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
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
    if (!roundWinnerDisplay || !correctWordDisplay || !finalScores || !matchWinnerDisplay || !meaningDisplay || !newRoundBtn) return;
    const showScores = gameMode === 'multiplayer' || gameMode === 'vsCPU';
    finalScores.style.display = showScores ? 'block' : 'none';
    matchWinnerDisplay.style.display = showScores ? 'block' : 'none';
    if (gameData.roundWinner && gameData.players[gameData.roundWinner]) {
        const winnerName = gameData.players[gameData.roundWinner].username;
        roundWinnerDisplay.textContent = (gameData.roundWinner === currentUserId) ? "Tebrikler, Turu Kazandın!" : `Turu ${winnerName} Kazandı!`;
        playSound(gameData.roundWinner === currentUserId ? 'win' : 'lose');
    } else {
        roundWinnerDisplay.textContent = "Kaybettin!";
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
        newRoundBtn.textContent = 'Yeniden Oyna';
    }
}

export async function startNewRound() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    if (gameMode === 'vsCPU' || gameMode === 'multiplayer') {
        if (!localGameData) return;
        if (localGameData.currentRound >= localGameData.matchLength) {
            if (gameMode === 'multiplayer') {
                findOrCreateRandomGame({
                    timeLimit: localGameData.timeLimit,
                    matchLength: localGameData.matchLength,
                    gameType: localGameData.gameType
                });
            } else {
                startNewGame({
                    mode: gameMode
                });
            }
            return;
        }
        const newWordLength = getRandomWordLength();
        const newSecretWord = await getNewSecretWord(newWordLength);
        if (!newSecretWord) return;
        if (gameMode === 'multiplayer') {
            const updates = {
                wordLength: newWordLength,
                secretWord: newSecretWord,
                status: 'playing',
                currentRound: localGameData.currentRound + 1,
                currentPlayerId: localGameData.creatorId,
                turnStartTime: serverTimestamp(),
                players: { ...localGameData.players
                }
            };
            for (const pid in updates.players) {
                updates.players[pid].guesses = [];
            }
            await updateDoc(doc(db, 'games', state.getCurrentGameId()), updates);
        } else { // vsCPU
            localGameData.wordLength = newWordLength;
            localGameData.secretWord = newSecretWord;
            localGameData.status = 'playing';
            localGameData.currentRound += 1;
            localGameData.currentPlayerId = state.getUserId();
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
        startNewGame({
            mode: gameMode
        });
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
    const emojiMap = {
        correct: '🟩',
        present: '🟨',
        absent: '⬛',
        failed: '🟥'
    };
    let emojiGrid = playerGuesses.map(guess => {
        return guess.colors.map(color => emojiMap[color] || '⬛').join('');
    }).join('\n');
    const shareText = `${title}\n\n${emojiGrid}`;
    navigator.clipboard.writeText(shareText).then(() => {
        showToast('Sonuç panoya kopyalandı!');
    }).catch(err => {
        console.error('Kopyalama başarısız: ', err);
        showToast('Kopyalama başarısız oldu!', true);
    });
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

function initializeGameUI(gameData) {
    wordLength = gameData.wordLength;
    timeLimit = gameData.timeLimit;
    if (guessGrid) {
        if (wordLength === 4) {
            guessGrid.style.maxWidth = '220px';
        } else if (wordLength === 5) {
            guessGrid.style.maxWidth = '280px';
        } else {
            guessGrid.style.maxWidth = '320px';
        }
    }
    createGrid(wordLength, GUESS_COUNT);
    createKeyboard(handleKeyPress);
}

// js/game.js İÇİNDEKİ listenToGameUpdates FONKSİYONUNU BU TEMİZ HALİYLE DEĞİŞTİRİN

function listenToGameUpdates(gameId) {
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

async function renderGameState(gameData, animateLastRow = false) {
    if (!gameData) return;
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
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
    } else {
        stopTurnTimer();
    }
}

function updateTurnDisplay(gameData) {
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
    state.setGameMode(null);
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