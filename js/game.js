// js/game.js - TAM DOSYA (Tüm düzeltmeler ve "Rövanş" özelliği dahil)

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
    runTransaction, onSnapshot, serverTimestamp, arrayUnion, orderBy, 
    deleteField, 
    deleteDoc 
} from "firebase/firestore";

import * as state from './state.js';
import { 
    getKnownCorrectPositions, 
    setKnownCorrectPositions, 
    resetKnownCorrectPositions,
    getHasUserStartedTyping, 
    setHasUserStartedTyping, 
    resetHasUserStartedTyping
} from './state.js';

import { showToast, playSound, shakeCurrentRow, getStatsFromProfile, createElement } from './utils.js';

import { 
    showScreen, createGrid, createKeyboard, updateKeyboard, getUsername, displayStats, guessGrid, 
    brTimerDisplay, brTurnDisplay, brRoundCounter,
    shareGameBtn, startGameBtn, keyboardContainer, updateMultiplayerScoreBoard,
    updateJokerUI,
    turnDisplay, timerDisplay, gameIdDisplay, roundCounter,
    updateStaticTile, 
    clearStaticTiles 
} from './ui.js';

import { default as allWordList } from '../functions/kelimeler.json'; 

// ===================================================
// === BAŞLANGIÇ: "showScoreboard is not defined" HATASINI ÇÖZMEK İÇİN BAŞA TAŞINDI ===
// ===================================================
// public/js/game.js (TAM FONKSİYON GÜNCELLEMESİ)

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
    
    // Rövanş butonunu seç
    const newWordRematchBtn = document.getElementById('new-word-rematch-btn');
    if (!roundWinnerDisplay || !correctWordDisplay || !finalScores || !matchWinnerDisplay || !meaningDisplay || !newRoundBtn || !dailyStatsContainer || !defaultWordDisplayContainer || !defaultRoundButtons || !newWordRematchBtn) return;

    // Tüm butonları varsayılan olarak gizle
    newRoundBtn.classList.add('hidden');
    newWordRematchBtn.classList.add('hidden');
    
    if (newRoundBtn) {
        newRoundBtn.disabled = false;
    }
    // js/game.js -> showScoreboard fonksiyonunun içindeki BR bloğunu değiştir:

    if (isBattleRoyale(gameMode)) {
        dailyStatsContainer.classList.remove('hidden');
        defaultWordDisplayContainer.style.display = 'none';
        
        // === YENİ MANTIK: 10 TUR KONTROLÜ ===
        const isMatchFinished = gameData.currentRound >= 10; // 10. Tur bitti mi?
        
        // Kazananı Puanına Göre Belirle (Eğer maç bittiyse)
        let winnerMessage;
        let matchWinnerName = "";
        
        if (isMatchFinished) {
            // En yüksek puanlıyı bul
            const playersArr = Object.values(gameData.players);
            playersArr.sort((a, b) => (b.score || 0) - (a.score || 0));
            const winner = playersArr[0];
            
            if (winner.score > 0) {
                matchWinnerName = winner.username;
                winnerMessage = winner.userId === currentUserId ? "👑 TEBRİKLER, ŞAMPİYONSUN!" : `👑 ŞAMPİYON: ${matchWinnerName}`;
            } else {
                winnerMessage = "MAÇ BERABERE BİTTİ!";
            }
            
            matchWinnerDisplay.style.display = 'block';
            matchWinnerDisplay.textContent = `MAÇ SONUCU: ${matchWinnerName} (${winner.score} Puan)`;
            
            newRoundBtn.textContent = 'Ana Menü';
            newRoundBtn.onclick = leaveGame;
            newRoundBtn.classList.remove('hidden');
        } else {
            // Maç devam ediyorsa
            matchWinnerDisplay.style.display = 'none';
            winnerMessage = gameData.roundWinner === currentUserId ? "✅ TURU KAZANDIN!" : "TUR TAMAMLANDI";
            
            newRoundBtn.textContent = `Sonraki Tur (${gameData.currentRound}/10)`; 
            newRoundBtn.onclick = () => {
                newRoundBtn.disabled = true;
                newRoundBtn.textContent = 'Yükleniyor...';
                showToast("Yeni tur başlatılıyor...", false); 
                startNewRound();
            };
            newRoundBtn.classList.remove('hidden');
        }

        roundWinnerDisplay.textContent = winnerMessage;
        playSound(isMatchFinished ? 'win' : 'turn'); 

        // Skor Tablosu Sıralaması (Puana Göre)
        const sortedPlayers = Object.entries(gameData.players).map(([id, data]) => ({ ...data, id })).sort((a, b) => {
            return (b.score || 0) - (a.score || 0); // Puana göre azalan sıralama
        });

        finalScores.innerHTML = `<h3 class="text-xl font-bold mb-2 text-center">Puan Durumu (Tur ${gameData.currentRound}/10)</h3>`;
        finalScores.style.display = 'block';
        
        sortedPlayers.forEach(player => {
            const statusIcon = player.hasSolved ? '✅' : (player.hasFailed ? '❌' : '⏳');
            const scoreEl = document.createElement('div'); // div yaparak daha düzenli gösterelim
            scoreEl.className = 'flex justify-between items-center bg-gray-700 p-2 rounded mb-1 ' + (player.id === currentUserId ? 'border border-yellow-400' : '');
            scoreEl.innerHTML = `
                <span class="font-bold text-white">${player.username}</span>
                <span class="text-yellow-400 font-mono text-lg">${player.score || 0} Puan</span>
            `; 
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
    // js/game.js içinde showScoreboard fonksiyonunu bul
// ve if (gameMode === 'daily') bloğunu tamamen bununla değiştir:

    if (gameMode === 'daily') {
        // 1. Varsayılan dış başlıkları gizle (Kendi kartımızın içinde göstereceğiz)
        roundWinnerDisplay.style.display = 'none';
        correctWordDisplay.style.display = 'none';
        matchWinnerDisplay.style.display = 'none';
        finalScores.style.display = 'none';
        newRoundBtn.classList.add('hidden'); 

        // 2. İstatistikleri al
        const dailyStats = await getDailyLeaderboardStats(currentUserId, gameData.secretWord);
        dailyStatsContainer.classList.remove('hidden');

        // 3. Kazanma/Kaybetme Durumunu Belirle
        const didWin = gameData.roundWinner === currentUserId;
        const resultTitle = didWin ? "🎉 TEBRİKLER!" : "😔 MAALESEF";
        const resultColor = didWin ? "text-green-400" : "text-red-400";

        if (dailyStats) {
            // 4. Yeni Düzenli HTML Yapısı
            dailyStatsContainer.innerHTML = `
                <div class="w-full max-w-md mx-auto bg-gray-800/95 p-6 rounded-xl shadow-2xl border border-gray-600 flex flex-col items-center">
                    
                    <h2 class="text-3xl font-extrabold ${resultColor} mb-2 tracking-wide">${resultTitle}</h2>
                    
                    <div class="text-center mb-6">
                        <span class="text-gray-400 text-sm uppercase tracking-wider">Doğru Kelime</span>
                        <div class="text-4xl font-black text-white mt-1 bg-gray-700 px-6 py-2 rounded-lg tracking-widest shadow-inner">
                            ${gameData.secretWord}
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3 w-full mb-6">
                        <div class="bg-gray-700 p-3 rounded-lg text-center shadow border border-gray-600">
                            <p class="text-2xl font-bold text-yellow-400">${dailyStats.userScore}</p>
                            <p class="text-xs text-gray-400 uppercase font-semibold">Puanın</p>
                        </div>
                        <div class="bg-gray-700 p-3 rounded-lg text-center shadow border border-gray-600">
                            <p class="text-2xl font-bold text-indigo-300">${dailyStats.userPosition > 0 ? '#' + dailyStats.userPosition : '-'}</p>
                            <p class="text-xs text-gray-400 uppercase font-semibold">Sıralama</p>
                        </div>
                        <div class="bg-gray-700 p-3 rounded-lg text-center shadow border border-gray-600">
                            <p class="text-xl font-bold text-white">${dailyStats.userGuessCount}</p>
                            <p class="text-xs text-gray-400 uppercase font-semibold">Deneme</p>
                        </div>
                        <div class="bg-gray-700 p-3 rounded-lg text-center shadow border border-gray-600">
                            <p class="text-xl font-bold text-white">${dailyStats.avgScore}</p>
                            <p class="text-xs text-gray-400 uppercase font-semibold">Ort. Puan</p>
                        </div>
                    </div>

                    <p class="text-xs text-gray-500 mb-4">Toplam ${dailyStats.totalPlayers} oyuncu bugün oynadı.</p>

                    <div class="w-full border-t border-gray-600 pt-4 mt-2 text-center">
                        <p id="word-meaning-display-daily" class="text-sm text-gray-300 italic leading-relaxed">
                            Anlam yükleniyor...
                        </p>
                    </div>
                </div>
            `;
            
            // Anlamı yükle ve yerleştir
            const meaningDisplayEl = document.getElementById('word-meaning-display-daily'); 
            const meaning = await fetchWordMeaning(gameData.secretWord);
            if(meaningDisplayEl) meaningDisplayEl.textContent = meaning;

        } else {
            dailyStatsContainer.innerHTML = `<p class="text-gray-400 text-center">Günlük sıralama bilgileri yüklenemedi.</p>`;
        }

        // Butonları düzenle
        playSound(didWin ? 'win' : 'lose');
        document.getElementById('main-menu-btn').textContent = "Ana Menüye Dön";
        defaultWordDisplayContainer.style.display = 'none'; 
        defaultRoundButtons.style.display = 'flex';
        
        return; 
    }

    // --- GEVŞEK / MEYDAN OKUMA / VS CPU MANTIĞI ---

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
        roundWinnerDisplay.textContent = `Kimse Bulamadı! Cevap: ${gameData.secretWord}`;
        playSound('lose');
    }
    
    correctWordDisplay.textContent = gameData.secretWord;
    meaningDisplay.textContent = 'Anlam yükleniyor...';
    const meaning = await fetchWordMeaning(gameData.secretWord);
    meaningDisplay.textContent = meaning;
    matchWinnerDisplay.textContent = '';
    
    if (gameMode === 'vsCPU' || gameMode === 'multiplayer') {
        
        // 1 Turluk Gevşek Oyun (Meydan Oku veya Rastgele)
        if (gameData.matchLength === 1 && gameMode === 'multiplayer') {
            // Beraberlik mesajı
            if (gameData.roundWinner === null) {
                roundWinnerDisplay.textContent = "BERABERE! Kimse bulamadı.";
            }
            // Kazanan veya kaybeden fark etmez, rövanş butonu
            newWordRematchBtn.classList.remove('hidden'); 
            newRoundBtn.classList.add('hidden');
        } 
        // Çok turlu oyun (Seri Oyun / vsCPU) ve tur bitmedi
        else if (gameData.currentRound < gameData.matchLength) {
            newRoundBtn.textContent = 'Sonraki Kelime';
            newRoundBtn.onclick = startNewRound;
            newRoundBtn.classList.remove('hidden');
        } 
        // Çok turlu oyun bitti
        else {
            newRoundBtn.textContent = 'Yeniden Oyna';
            
            // ===================================================================
            // === BAŞLANGIÇ: "Bilinmeyen oyun modu!" HATASI DÜZELTMESİ ===
            // ===================================================================
            if (gameMode === 'vsCPU') {
                // vsCPU modu 'startNewGame' kullanır (Bu doğru)
                newRoundBtn.onclick = () => startNewGame({ mode: gameMode });
            } 
            else if (gameMode === 'multiplayer') {
                // 'multiplayer' (Seri Oyun) bittiğinde, yeni bir seri oyun aramalı.
                // 'gameType' (örn: 'random_series') gameData'dan alınmalı.
                newRoundBtn.onclick = () => findOrCreateRandomGame({ 
                    timeLimit: gameData.timeLimit, 
                    matchLength: gameData.matchLength, 
                    gameType: gameData.gameType // örn: 'random_series'
                });
            } else {
                // Diğer her şey (daily vb.) 'startNewGame' kullanabilir
                newRoundBtn.onclick = () => startNewGame({ mode: gameMode });
            }
            // ===================================================================
            // === BİTİŞ: DÜZELTME ===
            // ===================================================================

            newRoundBtn.classList.remove('hidden');

            if (showScores && gameData.matchLength > 1) {
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
        newRoundBtn.classList.remove('hidden');
    }
}

// Anlamları bir kez yükleyip hafızada tutmak için:
let localMeanings = null;

async function getLocalMeanings() {
    if (localMeanings) {
        return localMeanings; 
    }
    try {
        const response = await fetch('/kelime_anlamlari.json'); 
        if (!response.ok) {
            throw new Error('Yerel anlam dosyası (kelime_anlamlari.json) bulunamadı.');
        }
        localMeanings = await response.json();
        console.log("Kelime anlamları başarıyla yerel dosyadan yüklendi.");
        return localMeanings;
    } catch (error) {
        console.error("Yerel anlamlar yüklenemedi:", error);
        return null; 
    }
}

// ===================================================
// === EKSİK OLAN KOD BLOĞU ===
// ===================================================
const GUESS_COUNT = 6;
const MAX_BR_PLAYERS = 4;
let wordLength = 5;
let timeLimit = 45; 

const DAILY_WORD_LENGTHS = [4, 5, 6]; 

const getRandomWordLength = () => DAILY_WORD_LENGTHS[Math.floor(Math.random() * DAILY_WORD_LENGTHS.length)];
function isBattleRoyale(mode) { return mode === 'multiplayer-br'; }

function getDaysSinceEpoch() {
    const now = new Date();
    const trtOffset = 3 * 60 * 60 * 1000;
    const todayTRT = new Date(now.getTime() + trtOffset);
    
    const epoch = new Date('2024-01-01');
    
    const startOfTodayTRT = new Date(todayTRT.getFullYear(), todayTRT.getMonth(), todayTRT.getDate());
    
    return Math.floor((startOfTodayTRT - epoch) / (1000 * 60 * 60 * 24));
}
// ===================================================
// === EKSİK KODUN SONU ===
// ===================================================


// *** Modül İçi Yardımcı Fonksiyonlar ***

export function initializeGameUI(gameData) {
    wordLength = gameData.wordLength;
    timeLimit = gameData.timeLimit;
    
    if (guessGrid) {
        guessGrid.innerHTML = ''; 

        if (wordLength === 4) {
            guessGrid.style.maxWidth = '220px';
        } else if (wordLength === 5) {
            guessGrid.style.maxWidth = '260px'; 
        } else { // 6 harfli
            guessGrid.style.maxWidth = '300px'; 
        }
    }
    createGrid(wordLength, GUESS_COUNT);
    createKeyboard(handleKeyPress);
}

export function updateTurnDisplay(gameData) {
    if (!startGameBtn || !shareGameBtn) return;
    
    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const numPlayers = Object.keys(gameData.players).length;
    
    const isBR = isBattleRoyale(gameMode);
    
    if (isBR) {
        if (!brTimerDisplay || !brTurnDisplay) return;

        brTimerDisplay.textContent = gameData.timeLimit || 60; 
        const brWaitingForPlayers = document.getElementById('br-waiting-for-players');
        const playerState = gameData.players[currentUserId] || {};

        if (gameData.status === 'waiting') {
            brTurnDisplay.textContent = `Oyuncu bekleniyor (${numPlayers}/${MAX_BR_PLAYERS})...`;
            startGameBtn.classList.toggle('hidden', currentUserId !== gameData.creatorId || numPlayers < 2);
            shareGameBtn.classList.remove('hidden');
            if (brWaitingForPlayers) brWaitingForPlayers.classList.remove('hidden');

        } else if (gameData.status === 'playing') {
            startGameBtn.classList.add('hidden');
            if (playerState.isEliminated) {
                brTurnDisplay.textContent = "✖️ Elendin!";
                brTurnDisplay.classList.remove('pulsate');
            } else if (playerState.hasSolved) {
                brTurnDisplay.textContent = "✅ Çözdün! Bekle..."; 
                brTurnDisplay.classList.add('pulsate', 'text-green-500');
            } else if (playerState.hasFailed) {
                brTurnDisplay.textContent = "❌ Hak Bitti! Bekle...";
                brTurnDisplay.classList.remove('pulsate');
            } else {
                brTurnDisplay.textContent = "Tahmin Yap!";
                brTurnDisplay.classList.add('pulsate');
            }
            if (brWaitingForPlayers) brWaitingForPlayers.classList.add('hidden');
            
        } else if (gameData.status === 'finished') {
             if(gameData.matchWinnerId !== undefined) { 
                 brTurnDisplay.textContent = "👑 MAÇ BİTTİ!";
             } else {
                 brTurnDisplay.textContent = "TUR BİTTİ";
             }
            startGameBtn.classList.add('hidden');
        }
        return;
    }
    
    // SIRALI VE DİĞER MODLAR
    if (!turnDisplay || !timerDisplay) return; 

    if (gameMode === 'daily') return;

    if (gameData.status === 'waiting') {
        //stopTurnTimer();//
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

async function handleMeaningIconClick(word) {
    if (!word || word.trim() === '') return;
    const meaning = await fetchWordMeaning(word);
    alert(`${word.toLocaleUpperCase('tr-TR')}:\n\n${meaning}`);
}

// public/js/game.js (TAM FONKSİYON GÜNCELLEMESİ)

// js/game.js içindeki renderGameState fonksiyonunu bul ve bununla değiştir:

export async function renderGameState(gameData, didMyGuessChange = false) { 
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
    const gameInfoBar = document.getElementById('game-info-bar');
    const jokerContainer = document.getElementById('joker-container');
    const copyBtn = document.getElementById('copy-game-id-btn');
    const shareBtn = document.getElementById('share-game-btn');
    
    updateMultiplayerScoreBoard(gameData); 

    if (gameMode === 'daily') {
        if (sequentialGameInfo) {
            sequentialGameInfo.classList.remove('hidden');
            document.getElementById('player1-score').innerHTML = '';
            document.getElementById('player2-score').innerHTML = '';
            if (turnDisplay) turnDisplay.textContent = 'Günün Kelimesi'; 
            if (roundCounter) roundCounter.textContent = new Date().toLocaleDateString('tr-TR'); 
            if (timerDisplay) timerDisplay.textContent = ''; 
        }
        if (gameInfoBar) {
            gameInfoBar.style.display = 'flex'; 
            if (gameIdDisplay) gameIdDisplay.textContent = ''; 
            if (copyBtn) copyBtn.style.display = 'none';
            if (shareBtn) shareBtn.style.display = 'none';
        }
        if (jokerContainer) {
            jokerContainer.style.display = 'none'; 
        }
    } else {
        if (jokerContainer) {
            jokerContainer.style.display = 'flex'; 
        }
        if (gameInfoBar) {
            gameInfoBar.style.display = 'flex';
            if (gameIdDisplay) gameIdDisplay.textContent = gameData.gameId || '';
            if (copyBtn) copyBtn.style.display = 'block'; 
        }
        if (isBR) {
            if (brRoundCounter) brRoundCounter.textContent = `Tur ${gameData.currentRound || 1}`;
        } else {
            if (roundCounter) roundCounter.textContent = (gameMode === 'multiplayer' || gameMode === 'vsCPU') ? `Tur ${gameData.currentRound}/${gameData.matchLength}` : '';
        }
    }
    
    timeLimit = gameData.timeLimit || 45;
    
    const playerState = gameData.players[currentUserId] || {};
    if (isBR && (playerState.isEliminated || playerState.hasSolved || playerState.hasFailed)) {
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
    } else {
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
    }

    updateTurnDisplay(gameData);

    // === IZGARA VE İPUCU MANTIĞI ===
    const firstTile = document.getElementById(`tile-0-0`);
    const firstTileFront = firstTile ? firstTile.querySelector('.front') : null;
    
    // Eğer ızgara boşsa veya tahmin değiştiyse yeniden çiz
    const isGridPristine = !firstTileFront || (firstTileFront.textContent === '' && !firstTile.classList.contains('flip'));
    
    if (didMyGuessChange || isGridPristine) {
        const playerGuesses = gameData.players[currentUserId]?.guesses || [];
        const currentRow = playerGuesses.length;
        
        for (let i = 0; i < GUESS_COUNT; i++) {
            for (let j = 0; j < wordLength; j++) {
                const tile = document.getElementById(`tile-${i}-${j}`);
                if (!tile) continue;
                
                const front = tile.querySelector('.front');
                const back = tile.querySelector('.back');
                const oldIcon = back.querySelector('.meaning-icon');
                if (oldIcon) { oldIcon.remove(); }
                
                // Temizlik
                tile.classList.remove('flip', 'correct', 'present', 'absent', 'failed', 'shake', 'static');
                if (i !== currentRow) {
                    front.textContent = '';
                    back.textContent = '';
                }

                // Eski tahminleri çiz
                if (playerGuesses[i]) {
                    const guess = playerGuesses[i];
                    front.textContent = guess.word[j];
                    back.textContent = guess.word[j];
                    
                    const isLastRow = i === playerGuesses.length - 1;
                    if (didMyGuessChange && isLastRow) { 
                        setTimeout(() => {
                            tile.classList.add(guess.colors[j]);
                            tile.classList.add('flip');
                        }, j * 250);
                    } else {
                        tile.classList.add(guess.colors[j]);
                        tile.classList.add('flip');
                    }
                } 
                // === YENİ: ŞİMDİKİ SATIRA YEŞİL İPUÇLARINI KOY ===
                else if (i === currentRow && gameData.status === 'playing') {
                    const isMyTurn = (gameData.currentPlayerId === currentUserId) || isBR;
                    
                    // Eğer sıra bendeyse VE henüz yazmaya başlamadıysam
                    if (isMyTurn && !state.getHasUserStartedTyping()) {
                        const knownPositions = getKnownCorrectPositions();
                        if (knownPositions[j]) {
                            // ui.js'deki fonksiyonu kullanarak statik harfi koy
                            updateStaticTile(i, j, knownPositions[j], 'correct');
                        }
                    }
                }
            } 
            
            // Anlam İkonu Ekleme
            if (playerGuesses[i] && playerGuesses[i].colors.indexOf('failed') === -1) {
                const guessWord = playerGuesses[i].word;
                const lastTileInRow = document.getElementById(`tile-${i}-${wordLength - 1}`);
                if (lastTileInRow) {
                    const backFace = lastTileInRow.querySelector('.back');
                    const meaningIcon = createElement('button', {
                        className: 'meaning-icon', 
                        innerHTML: '?',
                        onclick: (e) => { e.stopPropagation(); handleMeaningIconClick(guessWord); }
                    });
                    Object.assign(meaningIcon.style, {
                        position: 'absolute', right: '2px', top: '2px',
                        width: '22px', height: '22px', backgroundColor: '#ef4444',
                        color: 'white', borderRadius: '50%', border: '1px solid white',
                        fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
                        zIndex: '10', padding: '0', lineHeight: '21px'
                    });
                    if(backFace) { backFace.appendChild(meaningIcon); }
                }
            }
        } 
    }
    
    updateKeyboard(gameData);
    
    if (gameData.status === 'playing') {
        const playerState = gameData.players[currentUserId] || {};
        if (isBR && (!playerState.isEliminated && !playerState.hasSolved && !playerState.hasFailed)) {
            startBRTimer(); 
        } else if (gameMode === 'multiplayer') {
            startTurnTimer(); 
        } else if (gameMode === 'vsCPU') {
            if (gameData.currentPlayerId === currentUserId) {
                startTurnTimer();
            } else {
                stopTurnTimer();
                setTimeout(cpuTurn, 1500);
            }
        }
    } else {
        stopTurnTimer(); 
    }

    const isMyTurn = isBR ? 
        (!playerState.isEliminated && !playerState.hasSolved && !playerState.hasFailed) : 
        (gameData.currentPlayerId === currentUserId);
    
    const playerJokers = gameData.players[currentUserId]?.jokersUsed || {};
    
    if (gameMode === 'daily') {
        updateJokerUI({}, false, 'finished'); 
    } else {
        updateJokerUI(playerJokers, isMyTurn, gameData.status);
    }
}

export async function fetchWordMeaning(word) {
    try {
        const meanings = await getLocalMeanings();
        const upperCaseWord = word.toLocaleUpperCase('tr-TR');
        if (meanings && meanings[upperCaseWord]) {
            return meanings[upperCaseWord];
        }
        return "Anlamı bulunamadı.";
    } catch (error) {
        console.error("Anlam alınırken bir hata oluştu:", error);
        return "Anlam yüklenirken bir sorun oluştu. (Yerel dosya okunamadı)";
    }
}

function updateKnownPositions(playerGuesses) {
    const newPositions = {};
    if (playerGuesses) {
        playerGuesses.forEach(guess => {
            guess.colors.forEach((color, index) => {
                if (color === 'correct') {
                    newPositions[index] = guess.word[index];
                }
            });
        });
    }
    state.setKnownCorrectPositions(newPositions);
    return newPositions;
}

// js/game.js dosyasında listenToGameUpdates fonksiyonunu bul ve tamamını bununla değiştir:

// js/game.js dosyasında listenToGameUpdates fonksiyonunu bul ve tamamını bununla değiştir:

// js/game.js dosyasında listenToGameUpdates fonksiyonunu bul ve bununla değiştir:

export function listenToGameUpdates(gameId) {
    const gameUnsubscribe = state.getGameUnsubscribe();
    if (gameUnsubscribe) gameUnsubscribe();
    const gameRef = doc(db, "games", gameId);

    const unsubscribe = onSnapshot(gameRef, (docSnapshot) => { // doc ismini docSnapshot yaptım karışıklık olmasın diye
        const gameData = docSnapshot.data();
        if (!gameData) {
            showToast("Oyun sonlandırıldı.");
            leaveGame();
            return;
        }
        
        // Glitch önleyici: Eski tur verisi gelirse yoksay
        const localCurrentRound = state.getLocalGameData()?.currentRound;
        if (localCurrentRound && gameData.currentRound < localCurrentRound) {
             return;
        }

        const currentUserId = state.getUserId();
        const oldGameData = state.getLocalGameData();
        const oldStatus = oldGameData?.status;
        
        state.setLocalGameData(gameData);
        
        if (gameData.players && gameData.players[currentUserId]) {
            updateKnownPositions(gameData.players[currentUserId].guesses);
        }

        // --- YENİ DÜZELTME: HERKES BİTTİ Mİ KONTROLÜ (WATCHDOG) ---
        // Eğer oyun hala 'playing' modundaysa ama herkesin işi bittiyse, durumu 'finished' yap.
        if (gameData.status === 'playing') {
            const allPlayerIds = Object.keys(gameData.players);
            const isEveryoneDone = allPlayerIds.every(pid => {
                const p = gameData.players[pid];
                if (!p) return false;
                
                // 1. Elendi mi? (BR modu)
                if (p.isEliminated) return true;
                
                // 2. Çözdü mü?
                const lastGuess = p.guesses[p.guesses.length - 1];
                const hasWon = lastGuess && lastGuess.word === gameData.secretWord;
                if (hasWon) return true;

                // 3. Hakları bitti mi? (6 hak)
                if (p.guesses.length >= GUESS_COUNT) return true;

                // 4. Süresi bitti mi? (hasFailed flag'i varsa)
                if (p.hasFailed) return true;

                return false; // Hala oynuyor
            });

            // Eğer herkesin işi bittiyse veritabanını güncelle
            if (isEveryoneDone) {
                console.log("LOG: Herkesin turu bitti. Oyun sonlandırılıyor...");
                // Veritabanına status: finished gönder
                updateDoc(gameRef, { status: 'finished' }).catch(err => console.error("Oyun bitirme hatası:", err));
            }
        }
        // --- WATCHDOG BİTİŞİ ---

        const wasFinished = oldStatus === 'finished';
        const isNowPlaying = gameData.status === 'playing';
        
        if (wasFinished && isNowPlaying) {
            showScreen('game-screen');
            initializeGameUI(gameData);
        }
        if (oldGameData && oldGameData.wordLength !== gameData.wordLength) {
            initializeGameUI(gameData);
        }
        
        const currentGuesses = gameData.players[currentUserId]?.guesses || [];
        const oldGuessesCount = oldGameData?.players[currentUserId]?.guesses.length || 0;
        const didMyGuessChange = currentGuesses.length > oldGuessesCount;

        const oldPlayerId = oldGameData?.currentPlayerId;
        const isMyTurnNow = gameData.currentPlayerId === currentUserId;
        const isTurnComingToMe = (oldPlayerId !== currentUserId && isMyTurnNow);

        if (didMyGuessChange || isTurnComingToMe) {
            state.resetHasUserStartedTyping();
        }

        // --- BEKLEME MANTIĞI (Sadece kendi ekranımız için) ---
        if (gameData.status === 'playing') {
            const myGuesses = gameData.players[currentUserId]?.guesses || [];
            
            // Eğer benim haklarım bittiyse ama oyun henüz (yukarıdaki Watchdog sayesinde) bitmediyse:
            if (myGuesses.length >= GUESS_COUNT) {
                stopTurnTimer();
                if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
                if (turnDisplay) {
                    turnDisplay.textContent = "Rakip Bekleniyor... ⏳";
                    turnDisplay.classList.remove('pulsate');
                }
            }
        }
        
        // Oyun sunucuda resmen bittiyse skor tablosunu aç
        if (gameData.status === 'finished') {
            stopTurnTimer();
            renderGameState(gameData, didMyGuessChange).then(() => {
                const delay = isBattleRoyale(state.getGameMode()) ? wordLength * 300 + 1000 : 1500;
                setTimeout(() => showScoreboard(gameData), delay);
            });
        } else {
            renderGameState(gameData, didMyGuessChange);
        }
    }, (error) => { 
        console.error("Oyun dinlenirken bir hata oluştu:", error);
        if(error.code === 'permission-denied') {
             showToast("Bağlantı hatası veya oyun sonlandı.");
             leaveGame();
        }
    });
    
    state.setGameUnsubscribe(unsubscribe);
}

export async function findOrCreateRandomGame(config) {
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();

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
            await joinGame(foundGame.id);
        } else {
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
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();

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
        currentRound: 1, 
        players: { 
            [currentUserId]: { 
                username, 
                guesses: [], 
                score: 0, 
                jokersUsed: { present: false, correct: false, remove: false } 
            } 
        },
        playerIds: playerIdsList, 
        currentPlayerId: currentUserId, 
        status: invitedFriendId ? 'invited' : 'waiting',
        roundWinner: null,
        createdAt: serverTimestamp(),
        turnStartTime: serverTimestamp(),
        GUESS_COUNT: GUESS_COUNT, gameType,
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
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();
    
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
            if (gameData.gameType === 'multiplayer-br') {
                if (gameData.players[currentUserId]) {
                    gameDataToJoin = gameData;
                    return;
                }
                throw new Error("Bu bir Battle Royale oyunu. Lütfen lobiden katılın.");
            }
            if (gameData.players[currentUserId]) {
                gameDataToJoin = gameData;
                return; 
            }
            if (Object.keys(gameData.players).length < 2) {
                const newPlayerState = { 
                    username, 
                    guesses: [], 
                    score: 0, 
                    jokersUsed: { present: false, correct: false, remove: false } 
                };
                const updates = {
                    [`players.${currentUserId}`]: newPlayerState,
                    playerIds: arrayUnion(currentUserId),
                    status: 'playing',
                    turnStartTime: serverTimestamp(),
                    invitedPlayerId: deleteField()
                };
                transaction.update(gameRef, updates);
                gameDataToJoin = { 
                    ...gameData, 
                    players: {
                        ...gameData.players,
                        [currentUserId]: newPlayerState
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
        return allWordList["5"][dayIndex % allWordList["5"].length]; 
    }
    return dailyWordList[dayIndex % dailyWordList.length];
}

export async function startNewGame(config) {
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();

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

    // ================================================
    // === YENİ GÜVENLİK KONTROLÜ (SENKRONİZASYON) ===
    // ================================================
    // Sunucudan dönen kelimenin uzunluğu, bizim istediğimiz uzunlukla eşleşiyor mu?
    // Bu, "fidan" hatası gibi nadir sunucu hatalarını yakalar.
    if (secretWord.length !== gameSettings.wordLength) {
        
        // Hatanın nedenini kullanıcıya bildir (opsiyonel)
        console.error(`Senkronizasyon Hatası: ${gameSettings.wordLength} harfli istendi, ${secretWord.length} harfli alındı.`);
        showToast("Sunucu hatası. Oyun yeniden başlatılıyor...", true);
        
        // Hatalı oyunu başlatmak yerine, 1 saniye sonra oyunu tekrar başlatmayı dene
        setTimeout(() => startNewGame(config), 1000); 
        
        // Bu hatalı oyunu burada durdur
        return; 
    }
    // ================================================
    // === KONTROL SONU ===
    // ================================================

    const gameData = {
        wordLength: gameSettings.wordLength, secretWord: secretWord, timeLimit: gameSettings.timeLimit,
        isHardMode: gameSettings.isHardMode, currentRound: 1, matchLength: gameSettings.matchLength,
        players: { 
            [state.getUserId()]: { 
                username: getUsername(), 
                guesses: [], 
                score: 0,
                jokersUsed: { present: false, correct: false, remove: false } 
            } 
        },
        ...(config.mode === 'vsCPU' ? { players: { 
            [state.getUserId()]: { 
                username: getUsername(), 
                guesses: [], 
                score: 0,
                jokersUsed: { present: false, correct: false, remove: false } 
            },
            'cpu': { 
                username: 'Bilgisayar', 
                guesses: [], 
                score: 0,
                jokersUsed: { present: false, correct: false, remove: false } 
            } 
        } } : {}),
        currentPlayerId: state.getUserId(), status: 'playing', turnStartTime: new Date(), GUESS_COUNT: GUESS_COUNT,
        gameType: config.mode,
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
        secretWord: gameState.secretWord,
        jokersUsed: gameState.players[state.getUserId()].jokersUsed 
    };
    localStorage.setItem(`dailyGameState_${state.getUserId()}`, JSON.stringify(toSave));
}

function restoreDailyGame(savedState) {
    resetKnownCorrectPositions(); 
    updateKnownPositions(savedState.guesses); 
    resetHasUserStartedTyping();
    
    const gameData = {
        wordLength: savedState.secretWord.length, 
        secretWord: savedState.secretWord, timeLimit: 60,
        isHardMode: false, currentRound: 1, matchLength: 10,
        roundWinner: savedState.status === 'finished' && savedState.guesses.length < GUESS_COUNT ? state.getUserId() : null,
        players: { 
            [state.getUserId()]: { 
                username: getUsername(), 
                guesses: savedState.guesses, 
                score: 0,
                jokersUsed: savedState.jokersUsed || { present: false, correct: false, remove: false } 
            } 
        },
        currentPlayerId: state.getUserId(), status: savedState.status, turnStartTime: new Date(), GUESS_COUNT: GUESS_COUNT,
        gameType: 'daily',
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
    const scoreMap = { 1: 1000, 2: 800, 3: 600, 4: 400, 5: 200, 6: 100 };
    return scoreMap[guessesCount] || 0;
}

function calculateDailyScore(guessesCount, didWin) {
    if (!didWin) return 0;
    const scoreMap = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20, 6: 10 };
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
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        }
        return;
    }
    const secretWord = localGameData.secretWord;
    const colors = calculateColors(guessWord, secretWord);
    const newGuess = { word: guessWord, colors: colors };
    localGameData.players[currentUserId].guesses.push(newGuess);
    
    updateKnownPositions(localGameData.players[currentUserId].guesses);
    state.resetHasUserStartedTyping();
    
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
    
    if (localGameData.status === 'finished' && didWin) {
        const roundScore = calculateRoundScore(guessCount, true);
        if (localGameData.players[currentUserId]) {
             localGameData.players[currentUserId].score += roundScore;
        }
    }

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
            if (localGameData.players['cpu']) {
                localGameData.players['cpu'].score += 100; 
            }
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
    if (!playerState) { return; }
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

// js/game.js içindeki addLetter fonksiyonunu bul ve bununla değiştir:

function addLetter(letter) {
    const localGameData = state.getLocalGameData();
    if (!localGameData) return;
    const currentRow = (localGameData.players[state.getUserId()]?.guesses || []).length;
    if (currentRow >= GUESS_COUNT) return;

    // === YENİ: YAZMAYA BAŞLAMA KONTROLÜ ===
    if (!state.getHasUserStartedTyping()) {
        // İlk harf yazıldığında, referans (statik) kutuları temizle
        clearStaticTiles(currentRow, wordLength);
        state.setHasUserStartedTyping(true);
    }

    for (let i = 0; i < wordLength; i++) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        // Sadece boş olan kutuya yaz
        if (tile && tile.querySelector('.front').textContent === '') {
            tile.querySelector('.front').textContent = letter;
            playSound('click');
            break;
        }
    }
}

// js/game.js içindeki deleteLetter fonksiyonunu bul ve bununla değiştir:

function deleteLetter() {
    const localGameData = state.getLocalGameData();
    if (!localGameData) return;
    const currentRow = (localGameData.players[state.getUserId()]?.guesses || []).length;
    if (currentRow >= GUESS_COUNT) return;

    // Eğer kullanıcı henüz yazmaya başlamadıysa silecek bir şey yok
    if (!state.getHasUserStartedTyping()) {
        return; 
    }

    // Sondan başa doğru dolu olan ilk kutuyu bul ve sil
    let deletedIndex = -1;
    for (let i = wordLength - 1; i >= 0; i--) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        if (tile && tile.querySelector('.front').textContent !== '') {
            tile.querySelector('.front').textContent = '';
            deletedIndex = i;
            break;
        }
    }
    
    // === YENİ: SATIR TAMAMEN BOŞALDIYSA İPUÇLARINI GERİ GETİR ===
    // Eğer ilk kutu (index 0) boşaldıysa veya hiç harf kalmadıysa:
    const firstTile = document.getElementById(`tile-${currentRow}-0`);
    if (firstTile && firstTile.querySelector('.front').textContent === '') {
        // Durumu resetle
        state.setHasUserStartedTyping(false);
        
        // Bilinen pozisyonları al ve tekrar çiz
        const knownPositions = getKnownCorrectPositions();
        for (let j = 0; j < wordLength; j++) {
            if (knownPositions[j]) {
                updateStaticTile(currentRow, j, knownPositions[j], 'correct');
            }
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

    if (currentGuesses < 3) { 
        if (otherPossibleWords.length > 0) {
            const randomIndex = Math.floor(Math.random() * otherPossibleWords.length);
            return otherPossibleWords[randomIndex];
        } else {
            const emergencyList = (allWordList[wordLenStr] || []).filter(w => !guessedWords.has(w));
            if (emergencyList.length > 0) {
                 return emergencyList[Math.floor(Math.random() * emergencyList.length)];
            }
        }
    }

    if (winningWord && otherPossibleWords.length > 0) {
        
        if (Math.random() < 0.5) { 
             const randomIndex = Math.floor(Math.random() * otherPossibleWords.length);
             return otherPossibleWords[randomIndex]; 
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
        localGameData.currentPlayerId = state.getUserId();
        await renderGameState(localGameData);
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }
    const secretWord = localGameData.secretWord;
    const colors = calculateColors(finalGuess, secretWord);
    const newGuess = { word: finalGuess, colors: colors };
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

// public/js/game.js (TAM FONKSİYON GÜNCELLEMESİ)

export async function startNewRound() {
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();

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

    // Maç bitiş kontrolü (Yeniden Oyna butonu)
    if (localGameData.currentRound >= localGameData.matchLength && !isBattleRoyale(gameMode)) {
        if (gameMode === 'multiplayer') {
            // Bu kısım showScoreboard'da hallediliyor, ama yedek olarak bırakıldı
            leaveGame();
        } else {
            startNewGame({ mode: gameMode });
        }
        return;
    }

    // === BAŞLANGIÇ: DÖNÜŞÜMLÜ OYUNCU MANTIĞI ===

    const newWordLength = getRandomWordLength();
    const newSecretWord = await getNewSecretWord(newWordLength);
    if (!newSecretWord) return showToast("Yeni kelime alınamadı.", true);

    // 1. Yeni tur numarasını hesapla
    const newRoundNumber = (localGameData.currentRound || 0) + 1;

    if (gameMode === 'vsCPU') {
        // 2. vsCPU için sıradaki oyuncuyu belirle
        const humanPlayerId = state.getUserId();
        const cpuPlayerId = 'cpu';
        // Tek turlar (1, 3, 5...) İnsan, Çift turlar (2, 4, 6...) CPU başlar
        const nextPlayerId = (newRoundNumber % 2 === 1) ? humanPlayerId : cpuPlayerId;

        const updates = {
            wordLength: newWordLength, secretWord: newSecretWord, status: 'playing',
            currentRound: newRoundNumber, 
            currentPlayerId: nextPlayerId, // <-- GÜNCELLENDİ
            roundWinner: null, turnStartTime: new Date(), 
            players: { ...localGameData.players },
        };
        for (const pid in updates.players) {
            updates.players[pid].guesses = [];
            updates.players[pid].jokersUsed = { present: false, correct: false, remove: false };
        }
        Object.assign(localGameData, updates);
        state.setLocalGameData(localGameData);
        showScreen('game-screen');
        initializeGameUI(localGameData);
        await renderGameState(localGameData);

    } else if (gameMode === 'multiplayer') {
        // 2. Multiplayer için sıradaki oyuncuyu belirle
        const creatorId = localGameData.creatorId;
        const opponentId = localGameData.playerIds.find(id => id !== creatorId);

        // Tek turlar (1, 3, 5...) Oyunu Kuran, Çift turlar (2, 4, 6...) Rakip başlar
        // (Eğer rakip yoksa, her zaman kuran başlar)
        const nextPlayerId = (newRoundNumber % 2 === 1) ? creatorId : (opponentId || creatorId);
        
        const updates = {
            wordLength: newWordLength, secretWord: newSecretWord, status: 'playing',
            currentRound: newRoundNumber, 
            currentPlayerId: nextPlayerId, // <-- GÜNCELLENDİ
            roundWinner: null, turnStartTime: serverTimestamp(), 
            players: { ...localGameData.players },
        };
        for (const pid in updates.players) {
            updates.players[pid].guesses = [];
            updates.players[pid].jokersUsed = { present: false, correct: false, remove: false };
        }
         await updateDoc(doc(db, 'games', state.getCurrentGameId()), updates);
    } else {
        startNewGame({ mode: gameMode });
    }
    // === BİTİŞ: DÖNÜŞÜMLÜ OYUNCU MANTIĞI ===
}

// ===================================================
// 1. BU FONKSİYONU DEĞİŞTİRİN
// ===================================================
export function startTurnTimer() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    const currentUserId = state.getUserId(); // Kendi ID'mizi al

    // Bu modlar bu zamanlayıcıyı kullanmaz
    if (isBattleRoyale(gameMode) || gameMode === 'daily') return;
    
    stopTurnTimer(); // Önceki zamanlayıcıyı daima temizle

    // Zamanlayıcıyı sadece oyun 'oynanıyor' durumundaysa başlat
    if (localGameData.status !== 'playing') return;
    
    // === KONTROL ===
    // Zamanlayıcının otomatik tur bitirmesi gereken kişi biz miyiz?
    const isMyTurn = localGameData.currentPlayerId === currentUserId; 
    
    // Sunucudan gelen başlangıç zamanını al
    let turnStartTime = (localGameData.turnStartTime?.toDate) ? localGameData.turnStartTime.toDate() : new Date();
    
    const interval = setInterval(async () => {
        let now = new Date();
        let elapsed = Math.floor((now - turnStartTime) / 1000);
        let timeLeft = timeLimit - elapsed; // timeLimit, renderGameState içinde ayarlanır
    
        // Zamanlayıcıyı her zaman göster (rakibin zamanı olsa bile)
        if (timerDisplay) { 
            timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
            
            // === KONTROL ===
            // Yazıyı SADECE sıra bizdeyse ve süre azsa kırmızı yap
            if (timeLeft <= 5 && isMyTurn) {
                timerDisplay.classList.add('text-red-500');
            } else {
                timerDisplay.classList.remove('text-red-500');
            }
        }
        
        // === KONTROL ===
        // Turu SADECE sıra bizdeyse ve süre bittiyse bitir
        if (timeLeft <= 0) {
            stopTurnTimer();
            if (isMyTurn) {
                // Süremiz doldu, turu bitir
                await failTurn(''); 
            }
            // (Eğer sıra rakipteyse, hiçbir şey yapma.)
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
        let timeLeft = (localGameData.timeLimit || 60) - elapsed; 
        if (brTimerDisplay) {
            brTimerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
            if (timeLeft <= 5) brTimerDisplay.classList.add('text-red-500');
            else brTimerDisplay.classList.remove('text-red-500');
        }
        if (timeLeft <= 0) {
            stopTurnTimer();
            await failMultiplayerTurn(state.getCurrentGameId(), state.getUserId()); 
        }
    }, 1000);
    state.setTurnTimerInterval(interval);
}

// ===================================================
// 3. BU FONKSİYONU DEĞİŞTİRİN
// ===================================================
export function stopTurnTimer() {
    clearInterval(state.getTurnTimerInterval());
    state.setTurnTimerInterval(null);
    
    // Yazıyı temizle VE kırmızı rengi kaldır
    if (timerDisplay) {
        timerDisplay.textContent = '';
        timerDisplay.classList.remove('text-red-500');
    }
    
    // BR zamanlayıcısı için de aynısını yap
    if (brTimerDisplay) {
        brTimerDisplay.textContent = '';
        brTimerDisplay.classList.remove('text-red-500');
    }
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

export async function createBRGame(options = {}) {
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();
    
    const timeLimit = 120; 
    const wordLength = getRandomWordLength(); 
    const { isHardMode = false } = options;
    if (!db || !state.getUserId()) {
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
        players: { 
            [currentUserId]: { 
                userId: currentUserId, 
                username, 
                guesses: [], 
                isEliminated: false, 
                hasSolved: false, 
                isWinner: false, 
                hasFailed: false,
                jokersUsed: { present: false, correct: false, remove: false } 
            } 
        },
        playerIds: [currentUserId], 
        currentPlayerId: currentUserId, 
        status: 'waiting', 
        roundWinner: null,
        createdAt: serverTimestamp(),
        turnStartTime: serverTimestamp(),
        GUESS_COUNT: GUESS_COUNT, 
        gameType: 'multiplayer-br',
        maxPlayers: 4,
        currentRound: 1,
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

export async function joinBRGame(gameId) {
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();
    
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
            if (gameData.gameType !== 'multiplayer-br') {
                 throw new Error("Bu bir Battle Royale oyunu değil.");
            }
            if (gameData.players[currentUserId]) {
                gameDataToJoin = gameData;
                return; 
            }
            if (gameData.status !== 'waiting') {
                if (gameData.status === 'playing' && gameData.players[currentUserId] && !gameData.players[currentUserId].isEliminated) {
                     gameDataToJoin = gameData;
                     return;
                }
                throw new Error("Bu oyun çoktan başladı veya bitti.");
            }
            if (Object.keys(gameData.players).length >= (gameData.maxPlayers || MAX_BR_PLAYERS)) throw new Error("Oyun dolu.");
            const newPlayerObject = { 
                userId: currentUserId, 
                username, 
                guesses: [], 
                isEliminated: false, 
                hasSolved: false, 
                isWinner: false, 
                hasFailed: false,
                jokersUsed: { present: false, correct: false, remove: false } 
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


// ===================================
// === JOKER MANTIK FONKSİYONLARI ===
// ===================================

async function updateJokerState(jokerKey) {
    const gameMode = state.getGameMode(); 
    const gameData = state.getLocalGameData(); 
    const gameId = state.getCurrentGameId();
    
    const currentUserId = state.getUserId();
    const jokerUpdatePath = `players.${currentUserId}.jokersUsed.${jokerKey}`;

    if (!gameData) return;
    
    const playerState = gameData.players[currentUserId]; 
    if (!playerState) return;
    
    if (!playerState.jokersUsed) {
        playerState.jokersUsed = { present: false, correct: false, remove: false };
    }
    playerState.jokersUsed[jokerKey] = true;

    if (gameMode === 'multiplayer' || gameMode === 'multiplayer-br') {
        if (!gameId) return;
        try {
            await updateDoc(doc(db, "games", gameId), {
                [jokerUpdatePath]: true 
            });
        } catch (error) {
            console.error("Joker durumu güncellenirken hata:", error);
            showToast("Joker kullanılırken bir hata oluştu.", true);
            playerState.jokersUsed[jokerKey] = false; 
        }
    }
    
    const isBR = isBattleRoyale(gameMode);
    const isMyTurn = isBR ? 
        (!playerState.isEliminated && !playerState.hasSolved && !playerState.hasFailed) : 
        (gameData.currentPlayerId === currentUserId);

    updateJokerUI(playerState.jokersUsed, isMyTurn, gameData.status);
}

export async function usePresentJoker() {
    const gameData = state.getLocalGameData();
    const playerState = gameData.players[state.getUserId()];
    const gameMode = state.getGameMode(); 

    if (!gameData || !playerState || (playerState.jokersUsed && playerState.jokersUsed.present) || gameData.status !== 'playing') {
        return; 
    }

    if (!isBattleRoyale(gameMode) && gameData.currentPlayerId !== state.getUserId()) {
        showToast("Sıra sende olmadığında joker kullanamazsın!", true);
        return;
    }
    
    const secretWord = gameData.secretWord;
    const knownLetters = new Set();
    document.querySelectorAll('.keyboard-key').forEach(btn => {
        if (btn.classList.contains('correct') || btn.classList.contains('present')) {
            knownLetters.add(btn.dataset.key);
        }
    });
    const secretLetters = new Set(secretWord.split(''));
    const hintCandidates = [];
    secretLetters.forEach(letter => {
        if (!knownLetters.has(letter)) {
            hintCandidates.push(letter);
        }
    });
    if (hintCandidates.length === 0) {
        showToast("İpucu verecek yeni bir harf bulunamadı! (Tüm harfler zaten klavyede)", true);
        return;
    }
    const hintLetter = hintCandidates[Math.floor(Math.random() * hintCandidates.length)];
    const keyButton = document.querySelector(`.keyboard-key[data-key="${hintLetter}"]`);
    if (keyButton && !keyButton.classList.contains('correct')) {
        keyButton.classList.add('present');
        await updateJokerState('present');
    } else {
        console.error(`Joker hatası: ${hintLetter} harfi klavyede bulunamadı.`);
    }
}

export async function useCorrectJoker() {
    const gameData = state.getLocalGameData();
    const playerState = gameData.players[state.getUserId()];
    const gameMode = state.getGameMode(); 

    if (!gameData || !playerState || (playerState.jokersUsed && playerState.jokersUsed.correct) || gameData.status !== 'playing') {
        return;
    }

    if (!isBattleRoyale(gameMode) && gameData.currentPlayerId !== state.getUserId()) {
        showToast("Sıra sende olmadığında joker kullanamazsın!", true);
        return;
    }

    const secretWord = gameData.secretWord;
    const knownCorrectIndices = new Set();
    playerState.guesses.forEach(guess => {
        guess.colors.forEach((color, i) => {
            if (color === 'correct') {
                knownCorrectIndices.add(i);
            }
        });
    });
    const availableHintIndices = [];
    for (let i = 0; i < secretWord.length; i++) {
        if (!knownCorrectIndices.has(i)) {
            availableHintIndices.push(i);
        }
    }
    if (availableHintIndices.length === 0) {
        showToast("Tüm doğru harfleri zaten buldunuz!", true);
        return;
    }
    const hintIndex = availableHintIndices[Math.floor(Math.random() * availableHintIndices.length)];
    const hintLetter = secretWord[hintIndex]; 
    const currentRow = playerState.guesses ? playerState.guesses.length : 0;
    if (currentRow >= GUESS_COUNT) {
        showToast("Tahmin hakkınız doldu!", true);
        return; 
    }

    const currentPositions = state.getKnownCorrectPositions();
    currentPositions[hintIndex] = hintLetter;
    state.setKnownCorrectPositions(currentPositions);

    updateStaticTile(currentRow, hintIndex, hintLetter, 'correct');
    
    const keyButton = document.querySelector(`.keyboard-key[data-key="${hintLetter}"]`);
    if (keyButton) {
        keyButton.classList.remove('present');
        keyButton.classList.add('correct');
    }
    await updateJokerState('correct');
}

export async function useRemoveJoker() {
    const gameData = state.getLocalGameData();
    const playerState = gameData.players[state.getUserId()];
    const gameMode = state.getGameMode(); 

    if (!gameData || !playerState || (playerState.jokersUsed && playerState.jokersUsed.remove) || gameData.status !== 'playing') {
        return;
    }

    if (!isBattleRoyale(gameMode) && gameData.currentPlayerId !== state.getUserId()) {
        showToast("Sıra sende olmadığında joker kullanamazsın!", true);
        return;
    }

    const secretWord = gameData.secretWord;
    const cleanKeys = [];
    document.querySelectorAll('.keyboard-key').forEach(btn => {
        const key = btn.dataset.key;
        if (key && key.length === 1 && 
            !btn.classList.contains('correct') &&
            !btn.classList.contains('present') &&
            !btn.classList.contains('absent')) 
        {
            cleanKeys.push(btn);
        }
    });
    const absentKeys = cleanKeys.filter(btn => {
        const key = btn.dataset.key;
        return !secretWord.includes(key);
    });
    if (absentKeys.length === 0) {
        showToast("Kelimede olmayan harflerin tümü zaten klavyede işaretli!", true);
        return;
    }
    const keysToDisable = absentKeys.sort(() => 0.5 - Math.random()).slice(0, 4);
    keysToDisable.forEach(btn => {
        btn.classList.add('absent');
    });
    await updateJokerState('remove');
}

// === Davet Fonksiyonları (DÜZELTİLDİ) ===

export async function acceptInvite(gameId) {
    try {
        await joinGame(gameId); 
    } catch (error) { 
        console.error('Davet kabul edilemedi:', error);
        showToast(error.message || 'Oyuna katılırken bir hata oluştu.', true);
    }
}

export async function rejectInvite(gameId) {
    try {
        await deleteDoc(doc(db, 'games', gameId));
        showToast('Davet reddedildi.');
    } catch (error) {
        console.error('Davet reddedilemedi:', error);
    }
}

export async function abandonGame(gameId, gameDivElement) { 
    if (!gameId) return;

    if (state.getCurrentGameId() === gameId) {
        leaveGame();
    }

    const currentUserId = state.getUserId();
    const gameRef = doc(db, "games", gameId);

    if (gameDivElement) {
        gameDivElement.style.opacity = '0.5'; 
        const leaveBtn = gameDivElement.querySelector('button');
        if (leaveBtn) leaveBtn.disabled = true;
    }

    try {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) {
            if (gameDivElement) gameDivElement.remove(); 
            return;
        }

        const gameData = gameDoc.data();
        let updateData = {
            hiddenFrom: arrayUnion(currentUserId)
        };
        
        if (gameData.status === 'waiting' && gameData.creatorId === currentUserId) {
            await deleteDoc(gameRef);
            showToast("Oyun lobisi kapatıldı.");
        }
        else if (!isBattleRoyale(gameData.gameType) && gameData.playerIds.length > 1 && gameData.status !== 'finished') {
            const opponentId = gameData.playerIds.find(id => id !== currentUserId);
            updateData.status = 'finished';
            updateData.roundWinner = opponentId;
            updateData.matchWinnerId = opponentId;
            await updateDoc(gameRef, updateData);
            showToast("Oyundan çekildiniz. Rakibiniz kazandı.");
        }
        else {
            updateData.status = 'finished'; 

            if (isBattleRoyale(gameData.gameType)) {
                 updateData[`players.${currentUserId}.isEliminated`] = true;
            }

            await updateDoc(gameRef, updateData);
            showToast("Oyun bitenlere taşındı.");
        }
        
        if (gameDivElement) {
            gameDivElement.remove();
        }

    } catch (error) {
        console.error("Oyundan ayrılırken hata:", error);
        showToast("Oyundan ayrılırken bir hata oluştu.", true);
        
        if (gameDivElement) {
            gameDivElement.style.opacity = '1';
            const leaveBtn = gameDivElement.querySelector('button');
            if (leaveBtn) leaveBtn.disabled = false;
        }
    }
}

// public/js/game.js (TAMAMINI DEĞİŞTİRİN)

export async function startRematch() {
    const gameData = state.getLocalGameData();
    const currentUserId = state.getUserId();
    
    if (!gameData) {
         showToast("Oyun verisi bulunamadı.", true);
         return;
    }

    // 1. Sadece 1 turluk oyunlar rövanş yapabilir
    if (gameData.matchLength !== 1) {
        showToast("Rövanş sadece 1 turluk oyunlarda geçerlidir.", true);
        return;
    }

    // 2. Sadece 2 kişilik 'multiplayer' oyunlar (friend veya random_loose) rövanş yapabilir
    // (vsCPU veya BR buraya girmemeli)
    if (gameData.gameType !== 'friend' && gameData.gameType !== 'random_loose') {
         showToast("Bu oyun modu için rövanş geçerli değildir.", true);
         return;
    }

    // 3. Rakibin ID'sini bul (hem 'friend' hem 'random_loose' için çalışır)
    const opponentId = gameData.playerIds.find(id => id !== currentUserId);
    if (!opponentId) {
        showToast("Rövanş için rakip bulunamadı.", true);
        return;
    }

    // 4. Butonu devre dışı bırak
    const rematchButton = document.getElementById('new-word-rematch-btn');
    if (rematchButton) {
        rematchButton.disabled = true;
        rematchButton.textContent = "Davet gönderiliyor...";
    }

    // 5. Eski oyunu sil (artık bitti)
    try {
        const gameId = state.getCurrentGameId();
        if (gameId) {
            await deleteDoc(doc(db, "games", gameId));
        }
    } catch (e) {
        console.error("Eski oyun silinirken hata:", e);
    }
    
    // 6. YENİ BİRLEŞTİRİLMİŞ MANTIK:
    // İster 'friend' ister 'random_loose' olsun,
    // rakibe 12 saatlik (gevşek) 1 turluk yeni bir davet gönder.
    try {
        await createGame({ 
            invitedFriendId: opponentId, // Kilit nokta: Rakibe davet gönder
            timeLimit: 43200, // 12 Saat (Gevşek oyun ayarı)
            matchLength: 1,   // 1 Tur
            gameType: 'friend' // Yeni oyunun tipi her zaman 'friend' (davet) olmalı
        });
        
        // createGame fonksiyonu zaten state'i güncelleyip
        // 'game-screen'e yönlendiriyor ve mevcut oyuncu için beklemeyi başlatıyor.
        
    } catch (error) {
        // Hata durumunda butonu geri aç ve kullanıcıyı bilgilendir
        console.error("Rövanş daveti oluşturulamadı:", error);
        showToast("Hata: " + error.message, true);
        if (rematchButton) {
            rematchButton.disabled = false;
            rematchButton.textContent = 'Yeni Kelime (Rövanş)';
        }
        leaveGame(); // Hata olursa ana menüye dön
    }
}