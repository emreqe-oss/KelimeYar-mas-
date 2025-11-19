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
    clearStaticTiles, openKelimeligScreen 
} from './ui.js';

import { default as allWordList } from '../functions/kelimeler.json'; 

// ===================================================
// === BAŞLANGIÇ: "showScoreboard is not defined" HATASINI ÇÖZMEK İÇİN BAŞA TAŞINDI ===
// ===================================================
// public/js/game.js (TAM FONKSİYON GÜNCELLEMESİ)

// js/game.js içindeki showScoreboard fonksiyonunu bununla değiştir:

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
    const newWordRematchBtn = document.getElementById('new-word-rematch-btn');
    
    if (!roundWinnerDisplay || !correctWordDisplay || !finalScores || !matchWinnerDisplay || !meaningDisplay || !newRoundBtn) return;

    // Varsayılan gizlemeler
    newRoundBtn.classList.add('hidden');
    newWordRematchBtn.classList.add('hidden');
    if (newRoundBtn) newRoundBtn.disabled = false;

    // 1. BATTLE ROYALE KONTROLÜ
    if (isBattleRoyale(gameMode)) {
        // ... (Mevcut BR kodların burada kalacak) ...
        dailyStatsContainer.classList.remove('hidden');
        defaultWordDisplayContainer.style.display = 'none';
        const isMatchFinished = gameData.currentRound >= 10; 
        let winnerMessage;
        let matchWinnerName = "";
        if (isMatchFinished) {
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
        const sortedPlayers = Object.entries(gameData.players).map(([id, data]) => ({ ...data, id })).sort((a, b) => (b.score || 0) - (a.score || 0));
        finalScores.innerHTML = `<h3 class="text-xl font-bold mb-2 text-center">Puan Durumu (Tur ${gameData.currentRound}/10)</h3>`;
        finalScores.style.display = 'block';
        sortedPlayers.forEach(player => {
            const scoreEl = document.createElement('div');
            scoreEl.className = 'flex justify-between items-center bg-gray-700 p-2 rounded mb-1 ' + (player.id === currentUserId ? 'border border-yellow-400' : '');
            scoreEl.innerHTML = `<span class="font-bold text-white">${player.username}</span><span class="text-yellow-400 font-mono text-lg">${player.score || 0} Puan</span>`; 
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

    // 2. GÜNÜN KELİMESİ KONTROLÜ
    if (gameMode === 'daily') {
         // ... (Mevcut Daily kodların burada kalacak) ...
         // (Yukarıdaki BR bloğu gibi burası da aynen kalmalı, değiştirmene gerek yok)
         // Yer kazanmak için burayı özet geçiyorum, senin dosyadaki 'daily' bloğu aynen kalsın.
         roundWinnerDisplay.style.display = 'none';
         // ...
         // ...
         const dailyStats = await getDailyLeaderboardStats(currentUserId, gameData.secretWord);
         // ... (Senin kodundaki daily bloğu devam eder) ...
         if (dailyStats) {
             // ...
             dailyStatsContainer.innerHTML = `...HTML KODLARI...`; // Senin kodundaki hali
             // ...
         }
         // ...
         return; 
    }

    // === 3. YENİ EKLENEN KISIM: KELİMELİG (LEAGUE) MODU ===
    // Bu bloğu "Daily" bloğundan hemen sonra, "Diğer Modlar"dan hemen ÖNCE ekledik.
    // === 3. KELİMELİG (LEAGUE) MODU GÜNCELLEMESİ ===
    if (gameMode === 'league') {
        // Gereksiz alanları gizle
        dailyStatsContainer.classList.add('hidden');
        matchWinnerDisplay.style.display = 'none';
        finalScores.style.display = 'none';
        newRoundBtn.classList.add('hidden');
        newWordRematchBtn.classList.add('hidden');

        // Gerekli alanları göster
        defaultWordDisplayContainer.style.display = 'block';
        defaultRoundButtons.style.display = 'flex';

        // Mesajları Ayarla
        const didWin = gameData.roundWinner === currentUserId; // didWin = Kelimeyi doğru bildi mi?
        
        if (didWin) {
            // DOĞRU BİLDİ
            roundWinnerDisplay.innerHTML = `
                <span class="text-green-400 block text-3xl mb-2">TEBRİKLER! DOĞRU CEVAP 🎉</span>
                <span class="text-gray-400 text-sm font-normal block">Puan durumu rakip oynayınca belli olacak.</span>
            `;
            playSound('win');
        } else {
             // SÜRE BİTTİ VEYA BİLEMEDİ
             roundWinnerDisplay.innerHTML = `
                <span class="text-red-400 block text-3xl mb-2">ÜZGÜNÜZ, SÜRE BİTTİ 😔</span>
                <span class="text-gray-400 text-sm font-normal block">Rakibin sonucu bekleniyor. İkiniz de bilemezseniz 1 puan alacaksınız.</span>
             `;
             playSound('lose');
        }

        // Kelime ve Anlamı
        correctWordDisplay.textContent = gameData.secretWord;
        meaningDisplay.textContent = 'Anlam yükleniyor...';
        const meaning = await fetchWordMeaning(gameData.secretWord);
        meaningDisplay.textContent = meaning;

        // Buton Düzeni
        const mainMenuBtnEl = document.getElementById('main-menu-btn');
        mainMenuBtnEl.textContent = "Lige Dön";
        mainMenuBtnEl.className = "w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-lg text-lg"; // Rengi değiştirdik
        mainMenuBtnEl.onclick = () => openKelimeligScreen();
        
        // Diğer butonları gizle (Ligde paylaş veya yeni oyun olmaz)
        document.getElementById('share-results-btn').classList.add('hidden'); 
        
        return; 
    }
    // ======================================================

    // 4. DİĞER STANDART MODLAR (Gevşek / Seri / vsCPU)
    // Burası artık sadece yukarıdaki if'lere girmeyen modlar için çalışacak
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
        if (gameData.matchLength === 1 && gameMode === 'multiplayer') {
            if (gameData.roundWinner === null) roundWinnerDisplay.textContent = "BERABERE! Kimse bulamadı.";
            newWordRematchBtn.classList.remove('hidden'); 
            newRoundBtn.classList.add('hidden');
        } 
        else if (gameData.currentRound < gameData.matchLength) {
            newRoundBtn.textContent = 'Sonraki Kelime';
            newRoundBtn.onclick = startNewRound;
            newRoundBtn.classList.remove('hidden');
        } 
        else {
            newRoundBtn.textContent = 'Yeniden Oyna';
            if (gameMode === 'vsCPU') {
                newRoundBtn.onclick = () => startNewGame({ mode: gameMode });
            } else if (gameMode === 'multiplayer') {
                newRoundBtn.onclick = () => findOrCreateRandomGame({ 
                    timeLimit: gameData.timeLimit, 
                    matchLength: gameData.matchLength, 
                    gameType: gameData.gameType 
                });
            }
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

// js/game.js içindeki updateTurnDisplay fonksiyonunu bununla değiştir:

export function updateTurnDisplay(gameData) {
    // Butonlar yoksa işlem yapma
    if (!startGameBtn || !shareGameBtn) return;

    // --- YENİ EKLEME: Lig Modu Kontrolü ---
    const gameMode = state.getGameMode();
    
// --- DÜZELTME: Lig modunda bu fonksiyon HİÇBİR ŞEY yapmasın ---
    if (gameMode === 'league') {
        // UI elemanlarını burada gizlemek yerine renderGameState'de gizledik.
        // Burası sadece return edip çıkmalı ki sayacın üzerine yazı yazmasın.
        return;
    }
    // --------------------------------------------------------------
    
    // ... Kodun geri kalanı (Eski haliyle devam ediyor) ...
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
             if(gameData.matchWinnerId !== undefined) brTurnDisplay.textContent = "👑 MAÇ BİTTİ!";
             else brTurnDisplay.textContent = "TUR BİTTİ";
            startGameBtn.classList.add('hidden');
        }
        return;
    }
    
    if (!turnDisplay || !timerDisplay) return; 
    if (gameMode === 'daily') return;

    if (gameData.status === 'waiting') {
        turnDisplay.textContent = "Rakip bekleniyor...";
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.remove('hidden');
    } else if (gameData.status === 'invited') {
        turnDisplay.textContent = `Arkadaşın bekleniyor...`;
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.remove('hidden');
    } else if (gameData.status === 'playing') {
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
    } else if (gameData.status === 'finished') {
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

    // --- DÜZELTME: Lig Modunu da Günlük Mod gibi göster (Süre ve Bilgi Çubuğu için) ---
    // --- DÜZELTME: Lig Modu Görünümü (Büyük Sayaç, Temiz Ekran) ---
    if (gameMode === 'daily' || gameMode === 'league') {
        if (sequentialGameInfo) {
            sequentialGameInfo.classList.remove('hidden');
            
            // Lig Modu Özel Ayarları
            if (gameMode === 'league') {
                // 1. Gereksiz her şeyi gizle (Sıra Sende, Skorlar, Tur Sayısı)
                document.getElementById('player1-score').style.display = 'none';
                document.getElementById('player2-score').style.display = 'none';
                if (turnDisplay) turnDisplay.style.display = 'none'; // "Sıra Sende" GİZLE
                if (roundCounter) roundCounter.style.display = 'none'; // Küçük yazıları GİZLE

                // 2. Sayacı DEVASA yap
                if (timerDisplay) {
                    timerDisplay.style.display = 'block';
                    timerDisplay.className = 'font-mono font-black text-6xl text-yellow-400 w-full text-center drop-shadow-md';
                    // Sayacın hemen görünmesi için (Timer başlamadan önce boş kalmasın)
                    timerDisplay.textContent = timeLimit || 90; 
                }
            } else {
                // Daily Modu (Eski hali)
                document.getElementById('player1-score').innerHTML = '';
                document.getElementById('player2-score').innerHTML = '';
                if (turnDisplay) { turnDisplay.style.display = 'block'; turnDisplay.textContent = 'Günün Kelimesi'; }
                if (roundCounter) { roundCounter.style.display = 'block'; roundCounter.textContent = new Date().toLocaleDateString('tr-TR'); }
                if (timerDisplay) { timerDisplay.className = 'font-bold text-xl font-mono text-gray-300'; timerDisplay.textContent = ''; }
            }
        }

        if (gameInfoBar) {
            gameInfoBar.style.display = 'flex'; 
            if (gameIdDisplay) gameIdDisplay.textContent = ''; 
            if (copyBtn) copyBtn.style.display = 'none';
            if (shareBtn) shareBtn.style.display = 'none';
        }
        if (jokerContainer) jokerContainer.style.display = 'none'; 

    } else {
        // ... (Buradan sonrası aynı: Else bloğu - Diğer modlar) ...
        // Bu else bloğunun içini değiştirmene gerek yok, sadece üstteki if bloğunu değiştir.
        
        // Eski stilin bozulmaması için timerDisplay stilini resetle (Diğer modlar için)
        if (timerDisplay) timerDisplay.className = 'font-bold text-xl font-mono text-gray-300';
        if (turnDisplay) turnDisplay.style.display = 'block';
        if (roundCounter) roundCounter.style.display = 'block';
        document.getElementById('player1-score').style.display = 'block';
        document.getElementById('player2-score').style.display = 'block';

        if (jokerContainer) jokerContainer.style.display = 'flex'; 
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

// js/game.js dosyasında listenToGameUpdates fonksiyonunu bul ve bununla değiştir:

export function listenToGameUpdates(gameId) {
    const gameUnsubscribe = state.getGameUnsubscribe();
    if (gameUnsubscribe) gameUnsubscribe();
    const gameRef = doc(db, "games", gameId);

    const unsubscribe = onSnapshot(gameRef, (docSnapshot) => { 
        const gameData = docSnapshot.data();
        if (!gameData) {
            showToast("Oyun sonlandırıldı.");
            leaveGame();
            return;
        }
        
        // Glitch önleyici
        const localCurrentRound = state.getLocalGameData()?.currentRound;
        if (localCurrentRound && gameData.currentRound < localCurrentRound) {
             return;
        }

        const currentUserId = state.getUserId();
        const oldGameData = state.getLocalGameData(); // Eski veriyi kaydet
        const oldStatus = oldGameData?.status;
        
        // === YENİ: SIRA BANA GELDİ Mİ KONTROLÜ ===
        // Bu kontrolü setLocalGameData'dan ÖNCE yapmalıyız ki eski ve yeni veriyi kıyaslayabilelim.
        if (oldGameData && gameData.status === 'playing') {
            const oldPlayerId = oldGameData.currentPlayerId;
            const newPlayerId = gameData.currentPlayerId;
            
            // Eğer eskiden sıra bende DEĞİLSE ve şimdi sıra BANA geldiyse:
            if (oldPlayerId !== currentUserId && newPlayerId === currentUserId) {
                // Sadece Battle Royale değilse (Sıralı moddaysa) çal
                if (!isBattleRoyale(gameData.gameType)) {
                    playSound('turn'); // "Sıra Sende" sesi
                    showToast("🔔 Sıra Sende!", false); // Ufak bir görsel uyarı da ekleyelim
                }
            }
        }
        // === KONTROL BİTİŞİ ===

        state.setLocalGameData(gameData); // Şimdi yeniyi kaydedebiliriz
        
        if (gameData.players && gameData.players[currentUserId]) {
            updateKnownPositions(gameData.players[currentUserId].guesses);
        }

        // --- WATCHDOG (Herkes Bitti mi Kontrolü) ---
        if (gameData.status === 'playing') {
            const allPlayerIds = Object.keys(gameData.players);
            const isEveryoneDone = allPlayerIds.every(pid => {
                const p = gameData.players[pid];
                if (!p) return false;
                if (p.isEliminated) return true;
                const lastGuess = p.guesses[p.guesses.length - 1];
                const hasWon = lastGuess && lastGuess.word === gameData.secretWord;
                if (hasWon) return true;
                if (p.guesses.length >= GUESS_COUNT) return true;
                if (p.hasFailed) return true;
                return false; 
            });

            if (isEveryoneDone) {
                console.log("LOG: Herkesin turu bitti. Oyun sonlandırılıyor...");
                updateDoc(gameRef, { status: 'finished' }).catch(err => console.error("Oyun bitirme hatası:", err));
            }
        }

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

        // --- BEKLEME MANTIĞI ---
        if (gameData.status === 'playing') {
            const myGuesses = gameData.players[currentUserId]?.guesses || [];
            if (myGuesses.length >= GUESS_COUNT) {
                stopTurnTimer();
                if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
                if (turnDisplay) {
                    turnDisplay.textContent = "Rakip Bekleniyor... ⏳";
                    turnDisplay.classList.remove('pulsate');
                }
            }
        }
        
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
            // === BURAYI EKLE BAŞLANGIÇ ===
        case 'league':
            secretWord = config.secretWord;
            if (!secretWord) { showToast("Lig kelimesi yüklenemedi.", true); return; }
            gameSettings.wordLength = secretWord.length;
            gameSettings.timeLimit = 90; // Lig kuralı: 90 saniye
            gameSettings.matchLength = 1;
            break;
        // === BURAYI EKLE BİTİŞ ===
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


// js/game.js -> submitGuess fonksiyonunu bul ve bununla değiştir:

async function submitGuess() {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;

    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const playerState = localGameData.players[currentUserId];

    // Kontroller
    if (!playerState || playerState.isEliminated || playerState.hasSolved || playerState.hasFailed || (playerState.guesses && playerState.guesses.length >= GUESS_COUNT)) return;
    
    if (!isBattleRoyale(gameMode) && localGameData.currentPlayerId !== currentUserId) {
        showToast("Sıra sende değil!", true);
        return;
    }

    // Tahmin kelimesini oluştur
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

    // Zor mod kontrolü
    if (localGameData.isHardMode && playerState.guesses.length > 0) {
        if (!checkHardMode(guessWord, playerState.guesses)) {
            shakeCurrentRow(wordLength, currentRow);
            return;
        }
    }

    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';

    // Kelime geçerlilik kontrolü
    const isValidWord = await checkWordValidity(guessWord);
    if (!isValidWord) {
        showToast("Kelime sözlükte bulunamadı!", true);
        shakeCurrentRow(wordLength, currentRow);
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }

    stopTurnTimer();

    // --- BR MODU ÖZEL PUANLAMA MANTIĞI ---
    if (isBattleRoyale(gameMode)) {
        const secretWord = localGameData.secretWord;
        const colors = calculateColors(guessWord, secretWord);
        const newGuess = { word: guessWord, colors: colors };
        const updatedGuesses = [...(playerState.guesses || []), newGuess];
        
        const isWinner = (guessWord === secretWord);
        const guessCount = updatedGuesses.length;
        
        // Puan Hesapla (1. tahmin 1000, 2. tahmin 800...)
        let addedScore = 0;
        if (isWinner) {
            addedScore = calculateRoundScore(guessCount, true);
        }

        const updates = {
            [`players.${currentUserId}.guesses`]: updatedGuesses,
        };

        if (isWinner) {
            updates[`players.${currentUserId}.hasSolved`] = true;
            // Mevcut puana yeni tur puanını ekle
            const currentScore = playerState.score || 0;
            updates[`players.${currentUserId}.score`] = currentScore + addedScore;
        } else if (guessCount >= GUESS_COUNT) {
            updates[`players.${currentUserId}.hasFailed`] = true; // Elenme yok, sadece başarısız
        }

        try {
            await updateDoc(doc(db, "games", state.getCurrentGameId()), updates);
        } catch (error) {
            console.error("BR tahmini gönderilemedi:", error);
            showToast("Bağlantı hatası!", true);
        }
        
        // Yerel güncellemeyi render beklemeden yap (akıcılık için)
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }
    // --- BR MODU BİTİŞ ---

    // Diğer Modlar (Eski kodun devamı)
    const isOnlineMode = gameMode === 'multiplayer';
    if (isOnlineMode) {
        try {
            const result = await submitMultiplayerGuess(state.getCurrentGameId(), guessWord, currentUserId, false);
            if (!result.success) throw new Error(result.error);
        } catch (error) {
            console.error("Online tahmin hatası:", error);
            showToast("Hata: " + error.message, true);
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        }
        return;
    }

    // Yerel Oyun Mantığı (vsCPU, Daily)
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
            if (gameMode === 'vsCPU') localGameData.roundWinner = 'cpu';
            else localGameData.roundWinner = null;
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
        // --- KELİMELİG KAYIT MANTIĞI (submitGuess içine eklenecek) ---
    if (gameMode === 'league' && localGameData.status === 'finished') {
        const matchId = localGameData.leagueMatchId;
        const weekID = localGameData.leagueWeekID;
        const matchRef = doc(db, "leagues", weekID, "matches", matchId);
        
        // Veriyi okuyup hangi oyuncu (p1 mi p2 mi) olduğumuzu bulalım
        const snap = await getDoc(matchRef);
        const data = snap.data();
        const playerKey = data.p1 === currentUserId ? 'p1_data' : 'p2_data';

        const resultData = {
            guesses: localGameData.players[currentUserId].guesses,
            failed: !didWin, // Eğer kazanamadıysa failed: true
            completedAt: new Date()
        };

        // Lig tablosuna sonucu yaz
        await updateDoc(matchRef, {
            [playerKey]: resultData
        });

        showToast("Maç sonucu kaydedildi!", false);
        
        // 3 saniye sonra lig ekranına dön
        setTimeout(() => {
             openKelimeligScreen(); 
        }, 3000);
    }
    // -----------------------------------------------------------
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

// js/game.js -> failTurn fonksiyonunu bul ve bununla değiştir:

// js/game.js -> failTurn fonksiyonunu bul ve bununla değiştir:

export async function failTurn(guessWord = '') {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;
    const currentUserId = state.getUserId();
    const gameMode = state.getGameMode();
    const playerState = localGameData.players[currentUserId];

    // BR Modu (Değişiklik yok)
    if (isBattleRoyale(gameMode)) {
        if (playerState.hasSolved || playerState.hasFailed) return;
        stopTurnTimer();
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
        const updates = { [`players.${currentUserId}.hasFailed`]: true };
        try {
             await updateDoc(doc(db, "games", state.getCurrentGameId()), updates);
             showToast("Süre doldu! Bu turdan puan alamadın.", true);
        } catch (error) { console.error("Fail turn update error:", error); }
        return;
    }
    
    // --- KELİMELİG DÜZELTMESİ ---
    if (gameMode === 'league' && localGameData.status !== 'finished') {
         localGameData.status = 'finished';
         localGameData.roundWinner = null; // Kazanan yok, çünkü başarısız oldu
         
         stopTurnTimer(); // Süreyi durdur
         
         // Veritabanına kaydet
         const matchId = localGameData.leagueMatchId;
         const weekID = localGameData.leagueWeekID;
         const matchRef = doc(db, "leagues", weekID, "matches", matchId);
         
         try {
             const snap = await getDoc(matchRef);
             const data = snap.data();
             const playerKey = data.p1 === currentUserId ? 'p1_data' : 'p2_data';
             
             const resultData = { 
                 guesses: localGameData.players[currentUserId].guesses, 
                 failed: true, // Başarısız olarak işaretle
                 completedAt: new Date() 
             };
             
             await updateDoc(matchRef, { [playerKey]: resultData });
             
             // YENİ MESAJ:
             showToast("Süreniz bitti! Rakibin sonucu bekleniyor...", true);
             
             // Son ekrana yönlendir (renderGameState üzerinden showScoreboard çağrılacak)
             renderGameState(localGameData, true).then(() => {
                setTimeout(() => showScoreboard(localGameData), 1500);
             });
             
         } catch (error) {
             console.error("Lig sonucu kaydedilemedi:", error);
         }
         return;
    }
    // ----------------------------

    if (localGameData.currentPlayerId !== currentUserId) return;
    if (playerState.isEliminated || (playerState.guesses && playerState.guesses.length >= GUESS_COUNT)) return;
    
    stopTurnTimer();
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';

    // Diğer Modlar (vsCPU, Daily)
    if (gameMode === 'vsCPU' || gameMode === 'daily') {
        const newGuess = { word: guessWord.padEnd(wordLength, ' '), colors: Array(wordLength).fill('failed') };
        localGameData.players[currentUserId].guesses.push(newGuess);
        localGameData.status = 'finished';
        localGameData.roundWinner = null;
        await updateStats(false, 0);
        if (gameMode === 'daily') {
             saveDailyGameState(localGameData); 
             await saveDailyResultToDatabase(currentUserId, getUsername(), localGameData.secretWord, false, GUESS_COUNT, 0);
             localGameData.players[currentUserId].dailyScore = 0;
        } else if (gameMode === 'vsCPU') {
            localGameData.roundWinner = 'cpu';
            if (localGameData.players['cpu']) localGameData.players['cpu'].score += 100; 
        }
        renderGameState(localGameData, true).then(() => { setTimeout(() => showScoreboard(localGameData), wordLength * 300); });
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }

    // Multiplayer Standard
    const gameId = state.getCurrentGameId();
    if (gameId) {
        try {
            const result = await failMultiplayerTurn(gameId, currentUserId);
            if (!result.success) showToast(result.error || "Tur sonlandırma hatası.", true);
        } catch (error) { console.error("Fail turn hatası:", error); } 
        finally { if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto'; }
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
    const isLocalMode = ['daily', 'vsCPU', 'series', 'league', 'single'].includes(gameMode);
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

// js/game.js -> startNewRound fonksiyonunu bul ve bununla değiştir:

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

    // --- BR MODU: YENİ TURA GEÇİŞ ---
    if (isBattleRoyale(gameMode) && localGameData.status === 'finished') {
        // Maç bitmişse ana menüye dön
        if (localGameData.matchWinnerId !== undefined || localGameData.currentRound >= 10) { 
            leaveGame();
            return;
        }

        // Sadece oyunu kuran kişi (Host) yeni turu başlatır
        if (localGameData.creatorId === state.getUserId()) {
            const newWordLength = getRandomWordLength();
            const newSecretWord = await getNewSecretWord(newWordLength);
            
            const updates = {
                currentRound: (localGameData.currentRound || 1) + 1,
                secretWord: newSecretWord,
                wordLength: newWordLength,
                status: 'playing',
                roundWinner: null,
                matchWinnerId: deleteField(), // Önceki maç kazananını temizle
                turnStartTime: serverTimestamp(),
            };

            // Oyuncuları resetle ama PUANLARINI (score) KORU
            Object.keys(localGameData.players).forEach(pid => {
                updates[`players.${pid}.guesses`] = [];
                updates[`players.${pid}.hasSolved`] = false;
                updates[`players.${pid}.hasFailed`] = false;
                updates[`players.${pid}.isEliminated`] = false; // Her ihtimale karşı
                updates[`players.${pid}.jokersUsed`] = { present: false, correct: false, remove: false };
            });

            try {
                await updateDoc(doc(db, "games", state.getCurrentGameId()), updates);
            } catch (error) {
                console.error("Yeni tur başlatılamadı:", error);
                showToast("Yeni tur başlatılırken hata oluştu.", true);
            }
        } else {
            // Diğer oyuncular sadece bekler (Host başlatınca listenToGameUpdates ekranı açar)
            showToast("Oyun kurucunun turu başlatması bekleniyor...", false);
        }
        return; 
    }
    // --- BR MODU BİTİŞ ---

    // Diğer Modlar (Standard vsCPU / Multiplayer)
    if (localGameData.currentRound >= localGameData.matchLength) {
        if (gameMode === 'multiplayer') leaveGame();
        else startNewGame({ mode: gameMode });
        return;
    }

    const newWordLength = getRandomWordLength();
    const newSecretWord = await getNewSecretWord(newWordLength);
    if (!newSecretWord) return showToast("Yeni kelime alınamadı.", true);

    const newRoundNumber = (localGameData.currentRound || 0) + 1;

    if (gameMode === 'vsCPU') {
        const humanPlayerId = state.getUserId();
        const cpuPlayerId = 'cpu';
        const nextPlayerId = (newRoundNumber % 2 === 1) ? humanPlayerId : cpuPlayerId;

        const updates = {
            wordLength: newWordLength, secretWord: newSecretWord, status: 'playing',
            currentRound: newRoundNumber, 
            currentPlayerId: nextPlayerId,
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
        const creatorId = localGameData.creatorId;
        const opponentId = localGameData.playerIds.find(id => id !== creatorId);
        const nextPlayerId = (newRoundNumber % 2 === 1) ? creatorId : (opponentId || creatorId);
        
        const updates = {
            wordLength: newWordLength, secretWord: newSecretWord, status: 'playing',
            currentRound: newRoundNumber, 
            currentPlayerId: nextPlayerId, 
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
}

// ===================================================
// 1. BU FONKSİYONU DEĞİŞTİRİN
// ===================================================
// js/game.js -> startTurnTimer fonksiyonunu bul ve değiştir:

// js/game.js -> startTurnTimer fonksiyonu (DÜZELTİLMİŞ HALİ)

export function startTurnTimer() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    const currentUserId = state.getUserId(); 

    // BR ve Daily modları bu sayacı kullanmaz
    if (isBattleRoyale(gameMode) || gameMode === 'daily') return;
    
    stopTurnTimer(); 

    if (localGameData.status !== 'playing') return;
    
    const isMyTurn = (gameMode === 'league') || (localGameData.currentPlayerId === currentUserId); 

    // Sunucu zamanını al, yoksa yerel zamanı kullan
    let turnStartTime = (localGameData.turnStartTime?.toDate) ? localGameData.turnStartTime.toDate() : new Date();
    
    // Süre sınırını belirle (Lig ise 90, değilse gameData'dan, o da yoksa 45)
    const limit = (gameMode === 'league') ? 90 : (localGameData.timeLimit || 45);

    const interval = setInterval(async () => {
        let now = new Date();
        let elapsed = Math.floor((now - turnStartTime) / 1000);
        let timeLeft = limit - elapsed; 
        
        if (timerDisplay) { 
            timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
            
            // Son 10 saniye kırmızı ve titrek olsun
            if (timeLeft <= 10 && isMyTurn) {
                timerDisplay.classList.add('text-red-500', 'pulsate');
            } else {
                // Lig modunda ana rengimiz sarı (text-yellow-400), diğerlerinde gri
                if (gameMode !== 'league') timerDisplay.classList.remove('text-red-500', 'pulsate');
                else timerDisplay.classList.remove('text-red-500'); 
            }
        }
        
        if (timeLeft <= 0) {
            stopTurnTimer();
            if (isMyTurn) {
                await failTurn(''); 
            }
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

// ==========================================
// === KELİMELİG (WORD LEAGUE) FONKSİYONLARI ===
// ==========================================

// Hangi haftadayız? (Örn: "2025-W47")
function getCurrentWeekID() {
    const date = new Date();
    const year = date.getFullYear();
    const firstJan = new Date(year, 0, 1);
    const numberOfDays = Math.floor((date - firstJan) / (24 * 60 * 60 * 1000));
    const week = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
    return `${year}-W${week}`;
}

// Lig Ekranını Açma ve Durum Kontrolü
export async function checkLeagueStatus() {
    const userId = state.getUserId();
    if (!userId) return;

    const weekID = getCurrentWeekID();
    const participantRef = doc(db, "leagues", weekID, "participants", userId);

    try {
        const participantDoc = await getDoc(participantRef);
        
        if (participantDoc.exists()) {
            // Kullanıcı lige kayıtlı
            const now = new Date();
            const day = now.getDay(); // 0: Pazar, 1: Pazartesi
            
            // Test için day >= 0 yapabilirsin, normalde day >= 1 (Pazartesi) olmalı
            // const isLeagueStarted = day >= 1;  orjinal hali
            const isLeagueStarted = true; // TEST MODU: Her zaman açık 

            document.getElementById('league-intro-section').classList.add('hidden');
            document.getElementById('league-dashboard-section').classList.remove('hidden');

            if (isLeagueStarted) {
                await fetchAndDisplayLeagueMatches(weekID, userId);
            } else {
                document.getElementById('league-matches-list').innerHTML = `
                    <div class="text-center p-6">
                        <p class="text-xl text-yellow-400 font-bold">⏳ Lig Başlamadı</p>
                        <p class="text-gray-400 mt-2">Pazartesi 00:00'da maçlar açılacak.</p>
                    </div>
                `;
            }
        } else {
            // Kayıtlı değil, tanıtım ekranını göster
            const joinBtn = document.getElementById('join-league-btn');
            if(joinBtn) joinBtn.onclick = () => joinCurrentLeague(weekID);
        }
    } catch (error) {
        console.error("Lig durumu kontrol hatası:", error);
    }
}

// Lige Katıl (Kayıt Ol)
export async function joinCurrentLeague(weekID) {
    const userId = state.getUserId();
    const username = getUsername();
    
    try {
        const joinBtn = document.getElementById('join-league-btn');
        joinBtn.disabled = true;
        joinBtn.textContent = "Kaydediliyor...";

        // Katılımcılar listesine ekle
        await setDoc(doc(db, "leagues", weekID, "participants", userId), {
            username: username,
            joinedAt: serverTimestamp(),
            score: 0
        });

        // Lig dökümanını oluştur (yoksa)
        await setDoc(doc(db, "leagues", weekID), { isActive: true }, { merge: true });

        joinBtn.classList.add('hidden');
        document.getElementById('league-join-status').classList.remove('hidden');
        
        showToast("Lige başarıyla katıldın!");

    } catch (error) {
        console.error("Lige katılma hatası:", error);
        showToast("Hata oluştu.", true);
        document.getElementById('join-league-btn').disabled = false;
    }
}

// Maçları ve Rakipleri Getir
// js/game.js -> fetchAndDisplayLeagueMatches fonksiyonunu bul ve bununla değiştir:

async function fetchAndDisplayLeagueMatches(weekID, userId) {
    // 1. Katılımcıları çek
    const participantsRef = collection(db, "leagues", weekID, "participants");
    const pSnapshot = await getDocs(participantsRef);
    const participants = {}; // ID -> { username, stats... }
    
    pSnapshot.forEach(doc => {
        participants[doc.id] = { 
            id: doc.id, 
            username: doc.data().username,
            stats: { O: 0, G: 0, B: 0, M: 0, P: 0 } // Başlangıç istatistikleri
        };
    });

    // 2. Ligdeki TÜM maçları çek (Hem benimkileri hem diğerlerini)
    const matchesRef = collection(db, "leagues", weekID, "matches");
    const mSnapshot = await getDocs(matchesRef);
    
    const myMatchesList = [];
    let myTotalScore = 0;

    mSnapshot.forEach(doc => {
        const data = doc.data();
        const p1 = data.p1;
        const p2 = data.p2;
        
        // A) İstatistik Hesaplama (Sadece bitmiş maçlar için)
        const p1Data = data.p1_data;
        const p2Data = data.p2_data;

        if (p1Data && p1Data.guesses && p2Data && p2Data.guesses) {
            // İki taraf da oynamış, maç sonuçlanmış
            if (participants[p1]) participants[p1].stats.O++;
            if (participants[p2]) participants[p2].stats.O++;

            let p1Points = 0, p2Points = 0;

            // Puan Mantığı
            if (p1Data.failed && p2Data.failed) { 
                // İkisi de yandı -> Berabere (1-1)
                p1Points = 1; p2Points = 1;
                if(participants[p1]) participants[p1].stats.B++;
                if(participants[p2]) participants[p2].stats.B++;
            }
            else if (p1Data.failed) { 
                // p1 yandı -> p2 kazandı (0-3)
                p1Points = 0; p2Points = 3;
                if(participants[p1]) participants[p1].stats.M++;
                if(participants[p2]) participants[p2].stats.G++;
            }
            else if (p2Data.failed) { 
                // p2 yandı -> p1 kazandı (3-0)
                p1Points = 3; p2Points = 0;
                if(participants[p1]) participants[p1].stats.G++;
                if(participants[p2]) participants[p2].stats.M++;
            }
            else if (p1Data.guesses.length < p2Data.guesses.length) { 
                // p1 daha az tahmin -> p1 kazandı (3-0)
                p1Points = 3; p2Points = 0;
                if(participants[p1]) participants[p1].stats.G++;
                if(participants[p2]) participants[p2].stats.M++;
            }
            else if (p1Data.guesses.length > p2Data.guesses.length) { 
                // p2 daha az tahmin -> p2 kazandı (0-3)
                p1Points = 0; p2Points = 3;
                if(participants[p1]) participants[p1].stats.M++;
                if(participants[p2]) participants[p2].stats.G++;
            }
            else { 
                // Eşit tahmin -> Berabere (1-1)
                p1Points = 1; p2Points = 1;
                if(participants[p1]) participants[p1].stats.B++;
                if(participants[p2]) participants[p2].stats.B++;
            }

            if (participants[p1]) participants[p1].stats.P += p1Points;
            if (participants[p2]) participants[p2].stats.P += p2Points;
            
            // Benim puanımı güncelle
            if (p1 === userId) myTotalScore += p1Points;
            if (p2 === userId) myTotalScore += p2Points;
        }

        // B) Fikstür Listesi Oluşturma (Sadece BENİM olduğum maçlar)
        if (p1 === userId || p2 === userId) {
            const opponentId = p1 === userId ? p2 : p1;
            const opponentData = participants[opponentId];
            
            let matchObj = { 
                id: doc.id, 
                p1: p1, 
                p2: p2, 
                opponentName: opponentData ? opponentData.username : 'Bilinmiyor',
                ...data 
            };
            myMatchesList.push(matchObj);
        }
    });

    // --- FİKSTÜR GÜNCELLEME ---
    // Eğer maç listesi boşsa ve katılımcı varsa, henüz veritabanında maçlar oluşmamış olabilir.
    // Bu durumda "on-the-fly" (anlık) liste oluşturma mantığı eklenebilir, 
    // ama şimdilik sadece var olanları gösterelim. (startLeagueMatch zaten oluşturuyor)
    // Eksik maçları client tarafında sanal olarak göstermek için:
    
    Object.values(participants).forEach(opp => {
        if (opp.id === userId) return;
        // Bu rakiple bir maç kaydı var mı kontrol et
        const exists = myMatchesList.find(m => m.p1 === opp.id || m.p2 === opp.id);
        if (!exists) {
            // Henüz oynanmamış, veritabanında da yoksa sanal ekle
            // (Aslında startLeagueMatch tıklandığında oluşturulacak)
            const matchId = [userId, opp.id].sort().join('_');
            myMatchesList.push({
                id: matchId,
                p1: userId < opp.id ? userId : opp.id,
                p2: userId < opp.id ? opp.id : userId,
                opponentName: opp.username,
                // Veri yok (henüz oynanmadı)
            });
        }
    });

    // --- SIRALAMA LİSTESİ OLUŞTURMA ---
    const standingsList = Object.values(participants).map(p => ({
        id: p.id,
        username: p.username,
        ...p.stats
    }));

    // Puan (P) sonra Averaj/Galibiyet (G) sıralaması
    standingsList.sort((a, b) => {
        if (b.P !== a.P) return b.P - a.P; // Puana göre
        if (b.G !== a.G) return b.G - a.G; // Galibiyete göre
        return (a.username || '').localeCompare(b.username || ''); // İsme göre
    });

    // UI Import
    const { renderLeagueMatches, renderLeagueStandings } = await import('./ui.js');
    
    // Ekranı Güncelle
    const leagueScoreEl = document.getElementById('league-total-score');
    if(leagueScoreEl) leagueScoreEl.textContent = myTotalScore;

    renderLeagueMatches(myMatchesList, userId); // Fikstür sekmesi
    renderLeagueStandings(standingsList, userId); // Sıralama sekmesi
}

// Maçı Başlat (90 Saniye)
export async function startLeagueMatch(matchId, opponentId, opponentName) {
    const weekID = getCurrentWeekID();
    const userId = state.getUserId();
    
    const matchRef = doc(db, "leagues", weekID, "matches", matchId);
    const matchSnap = await getDoc(matchRef);
    
    let secretWord;
    let isNewMatch = false;

    if (matchSnap.exists() && matchSnap.data().secretWord) {
        secretWord = matchSnap.data().secretWord;
    } else {
        const len = getRandomWordLength();
        secretWord = await getNewSecretWord(len);
        isNewMatch = true;
    }

    if (isNewMatch) {
        await setDoc(matchRef, {
            matchId: matchId,
            weekID: weekID,
            p1: userId < opponentId ? userId : opponentId,
            p2: userId < opponentId ? opponentId : userId,
            secretWord: secretWord,
            createdAt: serverTimestamp()
        }, { merge: true });
    }

    // Oyunu Başlat
    startNewGame({
        mode: 'league',
        secretWord: secretWord
    });

    // Local veriye lig bilgilerini ekle (submitGuess için lazım)
    const localData = state.getLocalGameData();
    localData.leagueMatchId = matchId;
    localData.leagueWeekID = weekID;
    state.setLocalGameData(localData);

    showToast(`${opponentName} ile maç başladı! 90 Saniye!`, false);
}