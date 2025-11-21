// js/game.js - TAM DOSYA (Sözlük Özelliği Eklendi)

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

// Firestore modüllerini içe aktar (arrayRemove EKLENDİ)
import {
    collection, query, where, limit, getDocs, getDoc, doc, setDoc, updateDoc,
    runTransaction, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, // <-- arrayRemove eklendi
    orderBy, 
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
    resetHasUserStartedTyping,
    addPresentJokerLetter
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
// === SKOR TABLOSU VE OYUN SONU ===
// ===================================================

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
        
        // SÖZLÜK BUTONU ENTEGRASYONU (BR İÇİN)
        setupDictionaryButton(gameData.secretWord);
        return;
    }

    // 2. GÜNÜN KELİMESİ (DAILY)
    if (gameMode === 'daily') {
        roundWinnerDisplay.style.display = 'none';
        correctWordDisplay.style.display = 'none';
        matchWinnerDisplay.style.display = 'none';
        finalScores.style.display = 'none';
        newRoundBtn.classList.add('hidden'); 
        newWordRematchBtn.classList.add('hidden');
        
        defaultWordDisplayContainer.style.display = 'none'; 

        const dailyStats = await getDailyLeaderboardStats(currentUserId, gameData.secretWord);
        dailyStatsContainer.classList.remove('hidden');

        const didWin = gameData.roundWinner === currentUserId;
        const resultTitle = didWin ? "🎉 TEBRİKLER!" : "😔 MAALESEF";
        const resultColor = didWin ? "text-green-400" : "text-red-400";

        if (dailyStats) {
            dailyStatsContainer.innerHTML = `
                <div class="w-full max-w-md mx-auto bg-gray-800/95 p-6 rounded-xl shadow-2xl border border-gray-600 flex flex-col items-center">
                    <h2 class="text-3xl font-extrabold ${resultColor} mb-2 tracking-wide">${resultTitle}</h2>
                    <div class="text-center mb-6">
                        <span class="text-gray-400 text-sm uppercase tracking-wider">Doğru Kelime</span>
                        <div class="text-4xl font-black text-white mt-1 bg-gray-700 px-6 py-2 rounded-lg tracking-widest shadow-inner">
                            ${gameData.secretWord}
                        </div>
                    </div>
                    <div class="w-full border-t border-gray-600 pt-4 mt-2 text-center">
                        <p id="word-meaning-display-daily" class="text-sm text-gray-300 italic leading-relaxed">
                            Anlam yükleniyor...
                        </p>
                        <div id="daily-dict-btn-container" class="mt-2"></div>
                    </div>
                </div>
            `;
            
            const meaningDisplayEl = document.getElementById('word-meaning-display-daily'); 
            const meaning = await fetchWordMeaning(gameData.secretWord);
            if(meaningDisplayEl) meaningDisplayEl.textContent = meaning;

            // Günlük modda butonun yerini özel ayarlayalım (veya global butonu kullanalım)
            // Basitlik adına global butonu aktifleştiriyoruz, daily container içinde görünmeyebilir ama 
            // yapıyı bozmamak için setupDictionaryButton çağırıyoruz.
            setupDictionaryButton(gameData.secretWord);

        } else {
            dailyStatsContainer.innerHTML = `<p class="text-gray-400 text-center">Günlük sıralama bilgileri yüklenemedi.</p>`;
        }

        playSound(didWin ? 'win' : 'lose');
        
        const mainMenuBtn = document.getElementById('main-menu-btn');
        mainMenuBtn.textContent = "Ana Menüye Dön";
        mainMenuBtn.className = "w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg text-lg";
        mainMenuBtn.onclick = leaveGame;
        
        document.getElementById('share-results-btn').classList.remove('hidden');
        defaultRoundButtons.style.display = 'flex';
        
        return; 
    }

    // 3. KELİMELİG (LEAGUE)
    if (gameMode === 'league') {
        dailyStatsContainer.classList.add('hidden');
        matchWinnerDisplay.style.display = 'none';
        finalScores.style.display = 'none';
        newRoundBtn.classList.add('hidden');
        newWordRematchBtn.classList.add('hidden');

        defaultWordDisplayContainer.style.display = 'block';
        defaultRoundButtons.style.display = 'flex';

        const didWin = gameData.roundWinner === currentUserId;
        
        if (didWin) {
            roundWinnerDisplay.innerHTML = `
                <span class="text-green-400 block text-3xl mb-2">TEBRİKLER! DOĞRU CEVAP 🎉</span>
                <span class="text-gray-400 text-sm font-normal block">Puan durumu rakip oynayınca belli olacak.</span>
            `;
            playSound('win');
        } else {
             roundWinnerDisplay.innerHTML = `
                <span class="text-red-400 block text-3xl mb-2">ÜZGÜNÜZ, SÜRE BİTTİ 😔</span>
                <span class="text-gray-400 text-sm font-normal block">Rakibin sonucu bekleniyor. İkiniz de bilemezseniz 1 puan alacaksınız.</span>
             `;
             playSound('lose');
        }

        correctWordDisplay.textContent = gameData.secretWord;
        meaningDisplay.textContent = 'Anlam yükleniyor...';
        const meaning = await fetchWordMeaning(gameData.secretWord);
        meaningDisplay.textContent = meaning;

        const mainMenuBtnEl = document.getElementById('main-menu-btn');
        mainMenuBtnEl.textContent = "Lige Dön";
        mainMenuBtnEl.className = "w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-lg text-lg"; 
        mainMenuBtnEl.onclick = () => openKelimeligScreen();
        
        document.getElementById('share-results-btn').classList.add('hidden'); 
        
        // SÖZLÜK BUTONU ENTEGRASYONU
        setupDictionaryButton(gameData.secretWord);
        return; 
    }

// 4. DİĞER STANDART MODLAR (Gevşek / Seri / vsCPU)
    
    const mainMenuBtnReset = document.getElementById('main-menu-btn');
    if (mainMenuBtnReset) {
        mainMenuBtnReset.textContent = "Ana Menü";
        mainMenuBtnReset.className = "w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg text-lg";
        mainMenuBtnReset.onclick = leaveGame;
    }
    document.getElementById('share-results-btn').classList.remove('hidden'); // Paylaş butonunu geri getir
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
    
    // SÖZLÜK BUTONU ENTEGRASYONU (Standart Modlar)
    setupDictionaryButton(gameData.secretWord);

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
            // --- MAÇ BİTİŞİ (SERİ TAMAMLANDI) ---
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

            // GALİBİYET HESAPLAMA VE GÖSTERİMİ
            if (showScores && gameData.matchLength > 1) {
                const sortedPlayers = Object.entries(gameData.players)
                    .map(([id, data]) => ({ ...data, id }))
                    .sort((a, b) => (b.score || 0) - (a.score || 0));
                
                // En üstteki başlığı değiştir
                roundWinnerDisplay.innerHTML = '<span class="text-yellow-400">🏆 SERİ TAMAMLANDI!</span>';
                
                // Alt başlığa kazananı yaz
                if (sortedPlayers.length > 1) {
                    if (sortedPlayers[0].score > sortedPlayers[1].score) {
                        matchWinnerDisplay.innerHTML = `KAZANAN: <span class="text-green-400 text-4xl block mt-2">${sortedPlayers[0].username.toUpperCase()}</span>`;
                        playSound('win'); // Maç sonu zafer sesi
                    } else if (sortedPlayers[0].score < sortedPlayers[1].score) {
                        matchWinnerDisplay.innerHTML = `KAZANAN: <span class="text-green-400 text-4xl block mt-2">${sortedPlayers[1].username.toUpperCase()}</span>`;
                    } else {
                        matchWinnerDisplay.innerHTML = `<span class="text-blue-400 text-4xl block mt-2">DOSTLUK KAZANDI!<br>(BERABERE)</span>`;
                    }
                    matchWinnerDisplay.style.display = 'block';
                }
            }
        }
    }
}

// ===================================================
// === ANLAM GETİRME FONKSİYONLARI ===
// ===================================================

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

// ===================================================
// === OYUN İÇİ DEĞİŞKENLER VE YARDIMCILAR ===
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

export function initializeGameUI(gameData) {
    wordLength = gameData.wordLength;
    timeLimit = gameData.timeLimit;
    
    if (guessGrid) {
        guessGrid.innerHTML = ''; 

        if (wordLength === 4) {
            guessGrid.style.maxWidth = '220px';
        } else if (wordLength === 5) {
            guessGrid.style.maxWidth = '260px'; 
        } else { 
            guessGrid.style.maxWidth = '300px'; 
        }
    }
    createGrid(wordLength, GUESS_COUNT);
    createKeyboard(handleKeyPress);
}

export function updateTurnDisplay(gameData) {
    if (!startGameBtn || !shareGameBtn) return;

    const gameMode = state.getGameMode();
    
    if (gameMode === 'league') {
        return;
    }
    
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

// ===================================================
// === OYUN DURUMUNU ÇİZME (RENDER) ===
// ===================================================

export async function renderGameState(gameData, didMyGuessChange = false) { 
    const currentUserId = state.getUserId();
    
    // --- DÜZELTME: Bilinen harfleri her çizimde güncelle (Online mod için kritik) ---
    if (gameData && gameData.players && gameData.players[currentUserId]) {
        updateKnownPositions(gameData.players[currentUserId].guesses);
    }
    // -----------------------------------------------------------------------------

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

    // === GÖRÜNÜM AYARLARI (LİG VE GÜNLÜK) ===
    if (gameMode === 'daily' || gameMode === 'league') {
        if (sequentialGameInfo) {
            sequentialGameInfo.classList.remove('hidden');
            
            if (gameMode === 'league') {
                document.getElementById('player1-score').style.display = 'none';
                document.getElementById('player2-score').style.display = 'none';
                if (turnDisplay) turnDisplay.style.display = 'none';
                if (roundCounter) roundCounter.style.display = 'none';

                if (timerDisplay) {
                    timerDisplay.style.display = 'block';
                    if(timerDisplay.parentElement) {
                        timerDisplay.parentElement.className = "w-full flex justify-center items-center";
                    }
                    timerDisplay.className = 'font-mono font-black text-6xl text-yellow-400 tracking-widest drop-shadow-lg';
                    timerDisplay.textContent = timeLimit || 120; 
                }
            } else {
                if(timerDisplay && timerDisplay.parentElement) {
                    timerDisplay.parentElement.className = "text-center w-1/5";
                }

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
        if (timerDisplay && timerDisplay.parentElement) {
            timerDisplay.parentElement.className = "text-center w-1/5";
        }
        
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

    // === HAYALET HARFLER VE IZGARA ===
    const firstTile = document.getElementById(`tile-0-0`);
    const firstTileFront = firstTile ? firstTile.querySelector('.front') : null;
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
                if (oldIcon) oldIcon.remove(); 
                
                tile.classList.remove('flip', 'correct', 'present', 'absent', 'failed', 'shake', 'static');
                if (i !== currentRow) {
                    front.textContent = '';
                    back.textContent = '';
                }

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
                // --- DÜZELTME: Yeşil harfleri (Hayaletleri) yerleştir ---
                else if (i === currentRow && gameData.status === 'playing') {
                    const isMyTurn = (gameData.currentPlayerId === currentUserId) || isBR || (gameMode === 'league');
                    
                    // DÜZELTME: Sadece 'isMyTurn' yeterli.
                    // '!state.getHasUserStartedTyping()' şartını SİLDİK.
                    // Böylece yazarken de, beklerken de yeşil harfler hep orada kalacak.
                    if (isMyTurn) { 
                        const knownPositions = getKnownCorrectPositions();
                        if (knownPositions[j]) {
                            updateStaticTile(i, j, knownPositions[j], 'correct');
                        }
                    }
                }
                // -------------------------------------------------------
            } 
            
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
                        position: 'absolute', right: '2px', top: '2px', width: '22px', height: '22px', 
                        backgroundColor: '#ef4444', color: 'white', borderRadius: '50%', border: '1px solid white',
                        fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', zIndex: '10', padding: '0', lineHeight: '21px'
                    });
                    if(backFace) backFace.appendChild(meaningIcon); 
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
        } else if (gameMode === 'league') {
            startTurnTimer();
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

function updateKnownPositions(playerGuesses) {
    // DÜZELTME: Sadece tahminlerden gelenleri değil,
    // daha önce Joker ile açılmış (state'te duran) harfleri de baz al.
    
    // 1. Mevcut hafızayı kopyala (Jokerleri korumak için)
    const currentKnown = state.getKnownCorrectPositions() || {};
    const newPositions = { ...currentKnown }; 

    // 2. Tahminlerden gelen "Yeşil" harfleri üzerine ekle
    if (playerGuesses) {
        playerGuesses.forEach(guess => {
            guess.colors.forEach((color, index) => {
                if (color === 'correct') {
                    newPositions[index] = guess.word[index];
                }
            });
        });
    }
    
    // 3. Güncellenmiş hafızayı kaydet
    state.setKnownCorrectPositions(newPositions);
    return newPositions;
}

// ===================================================
// === OYUN AKIŞI (LISTENERS) ===
// ===================================================

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
        
        const localCurrentRound = state.getLocalGameData()?.currentRound;
        if (localCurrentRound && gameData.currentRound < localCurrentRound) {
             return;
        }

        const currentUserId = state.getUserId();
        const oldGameData = state.getLocalGameData(); 
        const oldStatus = oldGameData?.status;
        
        if (oldGameData && gameData.status === 'playing') {
            const oldPlayerId = oldGameData.currentPlayerId;
            const newPlayerId = gameData.currentPlayerId;
            
            if (oldPlayerId !== currentUserId && newPlayerId === currentUserId) {
                if (!isBattleRoyale(gameData.gameType)) {
                    playSound('turn'); 
                    showToast("🔔 Sıra Sende!", false); 
                }
            }
        }

        state.setLocalGameData(gameData); 
        
        if (gameData.players && gameData.players[currentUserId]) {
            updateKnownPositions(gameData.players[currentUserId].guesses);
        }

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

// ===================================================
// === OYUN KURMA VE KATILMA ===
// ===================================================

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
        case 'league':
            secretWord = config.secretWord;
            if (!secretWord) { showToast("Lig kelimesi yüklenemedi.", true); return; }
            gameSettings.wordLength = secretWord.length;
            gameSettings.timeLimit = 120; 
            gameSettings.matchLength = 1;
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

    if (secretWord.length !== gameSettings.wordLength) {
        console.error(`Senkronizasyon Hatası: ${gameSettings.wordLength} harfli istendi, ${secretWord.length} harfli alındı.`);
        showToast("Sunucu hatası. Oyun yeniden başlatılıyor...", true);
        setTimeout(() => startNewGame(config), 1000); 
        return; 
    }

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

    if (isBattleRoyale(gameMode)) {
        const secretWord = localGameData.secretWord;
        const colors = calculateColors(guessWord, secretWord);
        const newGuess = { word: guessWord, colors: colors };
        const updatedGuesses = [...(playerState.guesses || []), newGuess];
        
        const isWinner = (guessWord === secretWord);
        const guessCount = updatedGuesses.length;
        
        let addedScore = 0;
        if (isWinner) {
            addedScore = calculateRoundScore(guessCount, true);
        }

        const updates = {
            [`players.${currentUserId}.guesses`]: updatedGuesses,
        };

        if (isWinner) {
            updates[`players.${currentUserId}.hasSolved`] = true;
            const currentScore = playerState.score || 0;
            updates[`players.${currentUserId}.score`] = currentScore + addedScore;
        } else if (guessCount >= GUESS_COUNT) {
            updates[`players.${currentUserId}.hasFailed`] = true; 
        }

        try {
            await updateDoc(doc(db, "games", state.getCurrentGameId()), updates);
        } catch (error) {
            console.error("BR tahmini gönderilemedi:", error);
            showToast("Bağlantı hatası!", true);
        }
        
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }

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
        
        if (gameMode === 'league' && localGameData.status === 'finished') {
            const matchId = localGameData.leagueMatchId;
            const weekID = localGameData.leagueWeekID;
            const matchRef = doc(db, "leagues", weekID, "matches", matchId);
            
            const snap = await getDoc(matchRef);
            const data = snap.data();
            const playerKey = data.p1 === currentUserId ? 'p1_data' : 'p2_data';

            const resultData = {
                guesses: localGameData.players[currentUserId].guesses,
                failed: !didWin, 
                completedAt: new Date()
            };

            await updateDoc(matchRef, {
                [playerKey]: resultData
            });

            showToast("Maç sonucu kaydedildi!", false);
            
            setTimeout(() => {
                 openKelimeligScreen(); 
            }, 3000);
        }

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
    
    if (gameMode === 'league' && localGameData.status !== 'finished') {
         localGameData.status = 'finished';
         localGameData.roundWinner = null; 
         
         stopTurnTimer(); 
         
         const matchId = localGameData.leagueMatchId;
         const weekID = localGameData.leagueWeekID;
         const matchRef = doc(db, "leagues", weekID, "matches", matchId);
         
         try {
             const snap = await getDoc(matchRef);
             const data = snap.data();
             const playerKey = data.p1 === currentUserId ? 'p1_data' : 'p2_data';
             
             const resultData = { 
                 guesses: localGameData.players[currentUserId].guesses, 
                 failed: true, 
                 completedAt: new Date() 
             };
             
             await updateDoc(matchRef, { [playerKey]: resultData });
             
             showToast("Süreniz bitti! Rakibin sonucu bekleniyor...", true);
             
             renderGameState(localGameData, true).then(() => {
                setTimeout(() => showScoreboard(localGameData), 1500);
             });
             
         } catch (error) {
             console.error("Lig sonucu kaydedilemedi:", error);
         }
         return;
    }

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

function addLetter(letter) {
    const localGameData = state.getLocalGameData();
    if (!localGameData) return;
    const currentRow = (localGameData.players[state.getUserId()]?.guesses || []).length;
    if (currentRow >= GUESS_COUNT) return;

    // Kullanıcı yazmaya başladığında flag'i set et
    if (!state.getHasUserStartedTyping()) {
        state.setHasUserStartedTyping(true);
    }

    for (let i = 0; i < wordLength; i++) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        
        if (tile) {
            const front = tile.querySelector('.front');
            const back = tile.querySelector('.back');
            const isStatic = tile.classList.contains('static');
            const isEmpty = front.textContent === '';

            // Eğer kutu boşsa VEYA Statikse (Jokerse) -> Oraya yaz!
            // (Önceki kodda '&& !isStatic' diyerek engelliyorduk, şimdi kaldırdık)
            if (isEmpty || isStatic) {
                
                // Eğer statik bir kutunun üzerine yazıyorsak, statik özelliğini kaldır
                if (isStatic) {
                    tile.classList.remove('static', 'correct'); // Yeşil rengi ve statikliği sil
                    back.className = 'tile-inner back'; // Arka yüzü temizle
                    back.textContent = ''; 
                }

                front.textContent = letter;
                playSound('click');
                break; // Harfi yazdık, döngüden çık
            }
        }
    }
}

function deleteLetter() {
    const localGameData = state.getLocalGameData();
    if (!localGameData) return;
    const currentRow = (localGameData.players[state.getUserId()]?.guesses || []).length;
    if (currentRow >= GUESS_COUNT) return;

    if (!state.getHasUserStartedTyping()) return; 

    // Sondan başa doğru tarayıp, STATİK OLMAYAN ilk dolu kutuyu bulup silelim
    for (let i = wordLength - 1; i >= 0; i--) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        
        // Eğer kutu doluysa VE statik (joker) DEĞİLSE sil
        if (tile && tile.querySelector('.front').textContent !== '' && !tile.classList.contains('static')) {
            tile.querySelector('.front').textContent = '';
            
            // Eğer sildiğimiz harften sonra hiç "kullanıcı harfi" kalmadıysa typing modunu kapatabiliriz
            // (Bu opsiyonel ama temizlik için iyi)
            return; // Sildik ve çıktık
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
        if (localGameData.matchWinnerId !== undefined || localGameData.currentRound >= 10) { 
            leaveGame();
            return;
        }

        if (localGameData.creatorId === state.getUserId()) {
            const newWordLength = getRandomWordLength();
            const newSecretWord = await getNewSecretWord(newWordLength);
            
            const updates = {
                currentRound: (localGameData.currentRound || 1) + 1,
                secretWord: newSecretWord,
                wordLength: newWordLength,
                status: 'playing',
                roundWinner: null,
                matchWinnerId: deleteField(), 
                turnStartTime: serverTimestamp(),
            };

            Object.keys(localGameData.players).forEach(pid => {
                updates[`players.${pid}.guesses`] = [];
                updates[`players.${pid}.hasSolved`] = false;
                updates[`players.${pid}.hasFailed`] = false;
                updates[`players.${pid}.isEliminated`] = false; 
                updates[`players.${pid}.jokersUsed`] = { present: false, correct: false, remove: false };
            });

            try {
                await updateDoc(doc(db, "games", state.getCurrentGameId()), updates);
            } catch (error) {
                console.error("Yeni tur başlatılamadı:", error);
                showToast("Yeni tur başlatılırken hata oluştu.", true);
            }
        } else {
            showToast("Oyun kurucunun turu başlatması bekleniyor...", false);
        }
        return; 
    }

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

export function startTurnTimer() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    const currentUserId = state.getUserId(); 

    if (isBattleRoyale(gameMode) || gameMode === 'daily') return;
    
    stopTurnTimer(); 

    if (localGameData.status !== 'playing') return;
    
    const isMyTurn = (gameMode === 'league') || (localGameData.currentPlayerId === currentUserId); 

    let startTimeObj = localGameData.turnStartTime;
    let turnStartTime;

    if (startTimeObj && startTimeObj.toDate) {
        turnStartTime = startTimeObj.toDate(); 
    } else if (startTimeObj && startTimeObj instanceof Date) {
        turnStartTime = startTimeObj; 
    } else {
        turnStartTime = new Date(); 
    }
    
    const limit = (gameMode === 'league') ? 120 : (localGameData.timeLimit || 45);

    const interval = setInterval(async () => {
        let now = new Date();
        let elapsed = Math.floor((now - turnStartTime) / 1000);
        let timeLeft = limit - elapsed; 
        
        if (timeLeft > limit) timeLeft = limit; 

        if (timerDisplay) { 
            timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
            
            if (timeLeft <= 10 && isMyTurn) {
                timerDisplay.classList.add('text-red-500', 'pulsate');
            } else {
                if (gameMode === 'league') {
                     timerDisplay.classList.remove('text-red-500', 'pulsate');
                } else {
                     timerDisplay.classList.remove('text-red-500', 'pulsate');
                }
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

export function stopTurnTimer() {
    clearInterval(state.getTurnTimerInterval());
    state.setTurnTimerInterval(null);
    
    if (timerDisplay) {
        timerDisplay.textContent = '';
        timerDisplay.classList.remove('text-red-500');
    }
    
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
    
    // Joker kullanımını işaretle
    if (!playerState.jokersUsed) playerState.jokersUsed = { present: false, correct: false, remove: false };
    playerState.jokersUsed[jokerKey] = true;

    // Online ise sunucuya bildir
    if (gameMode === 'multiplayer' || gameMode === 'multiplayer-br') {
        if (gameId) {
            try {
                await updateDoc(doc(db, "games", gameId), { [jokerUpdatePath]: true });
            } catch (error) {
                console.error("Joker sunucu hatası:", error);
            }
        }
    }
    
    // UI güncelle
    const isBR = isBattleRoyale(gameMode);
    const isMyTurn = isBR ? 
        (!playerState.isEliminated && !playerState.hasSolved && !playerState.hasFailed) : 
        (gameData.currentPlayerId === currentUserId);

    updateJokerUI(playerState.jokersUsed, isMyTurn, gameData.status);
}

// 1. TURUNCU KALEM (Harf İpucu)
export async function usePresentJoker() {
    const gameData = state.getLocalGameData();
    const currentUserId = state.getUserId();
    const playerState = gameData.players[currentUserId];
    
    if (!gameData || !playerState || (playerState.jokersUsed && playerState.jokersUsed.present)) return;

    const secretWord = gameData.secretWord;
    const knownLetters = new Set();
    
    document.querySelectorAll('.keyboard-key').forEach(btn => {
        if (btn.classList.contains('correct') || btn.classList.contains('present')) {
            knownLetters.add(btn.dataset.key);
        }
    });

    const hintCandidates = [];
    for (const letter of secretWord) {
        if (!knownLetters.has(letter)) {
            hintCandidates.push(letter);
        }
    }

    if (hintCandidates.length === 0) {
        showToast("Tüm harfler zaten ipucu olarak açık!", true);
        return;
    }

    const hintLetter = hintCandidates[Math.floor(Math.random() * hintCandidates.length)];
    
    const keyButton = document.querySelector(`.keyboard-key[data-key="${hintLetter}"]`);
    if (keyButton) {
        keyButton.classList.remove('absent'); 
        keyButton.classList.add('present');
        
        keyButton.style.transform = "scale(1.2)";
        keyButton.style.borderColor = "#f59e0b";
        setTimeout(() => { keyButton.style.transform = "scale(1)"; }, 300);
        state.addPresentJokerLetter(hintLetter);

        showToast(`İpucu: "${hintLetter}" harfi kelimede var!`, false);
        await updateJokerState('present');
    }
}

// 2. YEŞİL KALEM (Kesin Harf)
export async function useCorrectJoker() {
    const gameData = state.getLocalGameData();
    const currentUserId = state.getUserId();
    const playerState = gameData.players[currentUserId];
    
    if (!gameData || !playerState || (playerState.jokersUsed && playerState.jokersUsed.correct)) return;

    const secretWord = gameData.secretWord;
    const currentRow = playerState.guesses ? playerState.guesses.length : 0;
    
    const knownPositions = getKnownCorrectPositions(); 
    const availableIndices = [];

    for (let i = 0; i < secretWord.length; i++) {
        if (!knownPositions[i]) {
            availableIndices.push(i);
        }
    }

    if (availableIndices.length === 0) {
        showToast("Tüm harflerin yerini zaten biliyorsun!", true);
        return;
    }

    const hintIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    const hintLetter = secretWord[hintIndex];

    // HAFIZAYA AL
    knownPositions[hintIndex] = hintLetter;
    setKnownCorrectPositions(knownPositions);

    // KUTUYU GÜNCELLE
    updateStaticTile(currentRow, hintIndex, hintLetter, 'correct');

    // KLAVYEYİ GÜNCELLE
    const keyButton = document.querySelector(`.keyboard-key[data-key="${hintLetter}"]`);
    if (keyButton) {
        keyButton.classList.remove('present', 'absent');
        keyButton.classList.add('correct');
        keyButton.style.transform = "scale(1.2)";
        setTimeout(() => { keyButton.style.transform = "scale(1)"; }, 300);
    }

    showToast(`İpucu: ${hintIndex + 1}. harf "${hintLetter}"!`, false);
    await updateJokerState('correct');
}

// 3. SİLGİ (Harf Elet)
export async function useRemoveJoker() {
    const gameData = state.getLocalGameData();
    const currentUserId = state.getUserId();
    const playerState = gameData.players[currentUserId];
    
    if (!gameData || !playerState || (playerState.jokersUsed && playerState.jokersUsed.remove)) return;

    const secretWord = gameData.secretWord;
    
    const candidates = [];
    document.querySelectorAll('.keyboard-key').forEach(btn => {
        const key = btn.dataset.key;
        if (key && key.length === 1 && 
            !btn.classList.contains('correct') && 
            !btn.classList.contains('present') && 
            !btn.classList.contains('absent')) 
        {
            if (!secretWord.includes(key)) {
                candidates.push(btn);
            }
        }
    });

    if (candidates.length === 0) {
        showToast("Elenecek harf kalmadı!", true);
        return;
    }

    const countToRemove = Math.min(candidates.length, 4);
    const toRemove = candidates.sort(() => 0.5 - Math.random()).slice(0, countToRemove);

    toRemove.forEach(btn => {
        btn.classList.add('absent');
        btn.style.opacity = "0.3"; 
        btn.style.pointerEvents = "none"; 
    });

    showToast(`${countToRemove} adet yanlış harf elendi!`, false);
    await updateJokerState('remove');
}

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

export async function startRematch() {
    const gameData = state.getLocalGameData();
    const currentUserId = state.getUserId();
    
    if (!gameData) {
         showToast("Oyun verisi bulunamadı.", true);
         return;
    }

    if (gameData.matchLength !== 1) {
        showToast("Rövanş sadece 1 turluk oyunlarda geçerlidir.", true);
        return;
    }

    if (gameData.gameType !== 'friend' && gameData.gameType !== 'random_loose') {
         showToast("Bu oyun modu için rövanş geçerli değildir.", true);
         return;
    }

    const opponentId = gameData.playerIds.find(id => id !== currentUserId);
    if (!opponentId) {
        showToast("Rövanş için rakip bulunamadı.", true);
        return;
    }

    const rematchButton = document.getElementById('new-word-rematch-btn');
    if (rematchButton) {
        rematchButton.disabled = true;
        rematchButton.textContent = "Davet gönderiliyor...";
    }

    try {
        const gameId = state.getCurrentGameId();
        if (gameId) {
            await deleteDoc(doc(db, "games", gameId));
        }
    } catch (e) {
        console.error("Eski oyun silinirken hata:", e);
    }
    
    try {
        await createGame({ 
            invitedFriendId: opponentId, 
            timeLimit: 43200, 
            matchLength: 1,   
            gameType: 'friend' 
        });
        
    } catch (error) {
        console.error("Rövanş daveti oluşturulamadı:", error);
        showToast("Hata: " + error.message, true);
        if (rematchButton) {
            rematchButton.disabled = false;
            rematchButton.textContent = 'Yeni Kelime (Rövanş)';
        }
        leaveGame(); 
    }
}

// ==========================================
// === KELİMELİG (WORD LEAGUE) FONKSİYONLARI ===
// ==========================================

function getCurrentWeekID() {
    const date = new Date();
    const year = date.getFullYear();
    const firstJan = new Date(year, 0, 1);
    const numberOfDays = Math.floor((date - firstJan) / (24 * 60 * 60 * 1000));
    const week = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
    return `${year}-W${week}`;
}

export async function checkLeagueStatus() {
    const userId = state.getUserId();
    if (!userId) return;

    const weekID = getCurrentWeekID();
    const participantRef = doc(db, "leagues", weekID, "participants", userId);

    try {
        const participantDoc = await getDoc(participantRef);
        
        if (participantDoc.exists()) {
            const now = new Date();
            const day = now.getDay(); 
            
            const isLeagueStarted = true; 

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
            const joinBtn = document.getElementById('join-league-btn');
            if(joinBtn) joinBtn.onclick = () => joinCurrentLeague(weekID);
        }
    } catch (error) {
        console.error("Lig durumu kontrol hatası:", error);
    }
}

export async function joinCurrentLeague(weekID) {
    const userId = state.getUserId();
    const username = getUsername();
    
    try {
        const joinBtn = document.getElementById('join-league-btn');
        joinBtn.disabled = true;
        joinBtn.textContent = "Kaydediliyor...";

        await setDoc(doc(db, "leagues", weekID, "participants", userId), {
            username: username,
            joinedAt: serverTimestamp(),
            score: 0
        });

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

async function fetchAndDisplayLeagueMatches(weekID, userId) {
    const participantsRef = collection(db, "leagues", weekID, "participants");
    const pSnapshot = await getDocs(participantsRef);
    const participants = {}; 
    
    pSnapshot.forEach(doc => {
        participants[doc.id] = { 
            id: doc.id, 
            username: doc.data().username,
            stats: { O: 0, G: 0, B: 0, M: 0, P: 0 } 
        };
    });

    const matchesRef = collection(db, "leagues", weekID, "matches");
    const mSnapshot = await getDocs(matchesRef);
    
    const myMatchesList = [];
    let myTotalScore = 0;

    mSnapshot.forEach(doc => {
        const data = doc.data();
        const p1 = data.p1;
        const p2 = data.p2;
        
        const p1Data = data.p1_data;
        const p2Data = data.p2_data;
        
        if (p1Data && p1Data.guesses && p2Data && p2Data.guesses) {
            if (participants[p1]) participants[p1].stats.O++;
            if (participants[p2]) participants[p2].stats.O++;

            let p1Points = 0, p2Points = 0;

            if (p1Data.failed && p2Data.failed) { 
                p1Points = 1; p2Points = 1;
                if(participants[p1]) participants[p1].stats.B++;
                if(participants[p2]) participants[p2].stats.B++;
            }
            else if (p1Data.failed) { 
                p1Points = 0; p2Points = 3;
                if(participants[p1]) participants[p1].stats.M++;
                if(participants[p2]) participants[p2].stats.G++;
            }
            else if (p2Data.failed) { 
                p1Points = 3; p2Points = 0;
                if(participants[p1]) participants[p1].stats.G++;
                if(participants[p2]) participants[p2].stats.M++;
            }
            else if (p1Data.guesses.length < p2Data.guesses.length) { 
                p1Points = 3; p2Points = 0;
                if(participants[p1]) participants[p1].stats.G++;
                if(participants[p2]) participants[p2].stats.M++;
            }
            else if (p1Data.guesses.length > p2Data.guesses.length) { 
                p1Points = 0; p2Points = 3;
                if(participants[p1]) participants[p1].stats.M++;
                if(participants[p2]) participants[p2].stats.G++;
            }
            else { 
                p1Points = 1; p2Points = 1;
                if(participants[p1]) participants[p1].stats.B++;
                if(participants[p2]) participants[p2].stats.B++;
            }

            if (participants[p1]) participants[p1].stats.P += p1Points;
            if (participants[p2]) participants[p2].stats.P += p2Points;
            
            if (p1 === userId) myTotalScore += p1Points;
            if (p2 === userId) myTotalScore += p2Points;
        }

        if (p1 === userId || p2 === userId) {
            const opponentId = p1 === userId ? p2 : p1;
            const opponentData = participants[opponentId];
            
            const myData = p1 === userId ? p1Data : p2Data;
            const oppData = p1 === userId ? p2Data : p1Data;
            
            let sortCategory = 5; 

            if (!myData || !myData.guesses) {
                sortCategory = 0;
            } else if (!oppData || !oppData.guesses) {
                sortCategory = 1;
            } else {
                let myMatchPoints = 0;
                if (myData.failed && oppData.failed) myMatchPoints = 1;
                else if (myData.failed) myMatchPoints = 0;
                else if (oppData.failed) myMatchPoints = 3;
                else if (myData.guesses.length < oppData.guesses.length) myMatchPoints = 3;
                else if (myData.guesses.length === oppData.guesses.length) myMatchPoints = 1;
                else myMatchPoints = 0;

                if (myMatchPoints === 3) sortCategory = 2; 
                else if (myMatchPoints === 1) sortCategory = 3; 
                else sortCategory = 4; 
            }

            let matchObj = { 
                id: doc.id, 
                p1: p1, 
                p2: p2, 
                opponentName: opponentData ? opponentData.username : 'Bilinmiyor',
                sortCategory: sortCategory, 
                ...data 
            };
            myMatchesList.push(matchObj);
        }
    });

    Object.values(participants).forEach(opp => {
        if (opp.id === userId) return;
        const exists = myMatchesList.find(m => m.p1 === opp.id || m.p2 === opp.id);
        if (!exists) {
            const matchId = [userId, opp.id].sort().join('_');
            myMatchesList.push({
                id: matchId,
                p1: userId < opp.id ? userId : opp.id,
                p2: userId < opp.id ? opp.id : userId,
                opponentName: opp.username,
                sortCategory: 0 
            });
        }
    });

    myMatchesList.sort((a, b) => a.sortCategory - b.sortCategory);

    const standingsList = Object.values(participants).map(p => ({
        id: p.id,
        username: p.username,
        ...p.stats
    }));

    standingsList.sort((a, b) => {
        if (b.P !== a.P) return b.P - a.P;
        if (b.G !== a.G) return b.G - a.G; 
        return (a.username || '').localeCompare(b.username || '');
    });

    const { renderLeagueMatches, renderLeagueStandings } = await import('./ui.js');
    
    const leagueScoreEl = document.getElementById('league-total-score');
    if(leagueScoreEl) leagueScoreEl.textContent = myTotalScore;

    renderLeagueMatches(myMatchesList, userId); 
    renderLeagueStandings(standingsList, userId); 
}

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

    startNewGame({
        mode: 'league',
        secretWord: secretWord
    });

    const localData = state.getLocalGameData();
    localData.leagueMatchId = matchId;
    localData.leagueWeekID = weekID;
    state.setLocalGameData(localData);

    showToast(`${opponentName} ile maç başladı! 120 Saniye!`, false); 
}

export async function buyItem(type, itemKey, price) {
    const userId = state.getUserId();
    const profile = state.getCurrentUserProfile();
    
    if (!profile) return;

    const currentGold = profile.gold || 0;

    if (currentGold < price) {
        showToast("Yetersiz bakiye! Altın kazanmalısın.", true);
        playSound('lose'); 
        return;
    }

    const newGold = currentGold - price;
    
    const inventory = profile.inventory || { present: 0, correct: 0, remove: 0 };
    inventory[itemKey] = (inventory[itemKey] || 0) + 1;

    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            gold: newGold,
            inventory: inventory
        });

        const newProfile = { ...profile, gold: newGold, inventory: inventory };
        state.setCurrentUserProfile(newProfile);
        
        const { updateMarketUI } = await import('./ui.js');
        updateMarketUI();

        showToast("Satın alma başarılı!", false);
        playSound('win'); 

    } catch (error) {
        console.error("Satın alma hatası:", error);
        showToast("İşlem sırasında hata oluştu.", true);
    }
}

export async function addGold(amount) {
    const userId = state.getUserId();
    const profile = state.getCurrentUserProfile();
    if (!profile) return;

    const newGold = (profile.gold || 0) + amount;

    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, { gold: newGold });

        const newProfile = { ...profile, gold: newGold };
        state.setCurrentUserProfile(newProfile);
        
        const { updateMarketUI } = await import('./ui.js');
        updateMarketUI();

        showToast(`${amount} Altın hesabına eklendi!`, false);
        playSound('win');

    } catch (error) {
        console.error("Altın ekleme hatası:", error);
    }
}

// ==============================================
// === SÖZLÜK VERİTABANI İŞLEMLERİ ===
// ==============================================

export async function loadDictionary() {
    const userId = state.getUserId();
    if (!userId) return;
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const data = userSnap.data();
            const dict = data.dictionary || [];
            dict.reverse(); // En yeniler üstte
            import('./ui.js').then(ui => ui.renderDictionaryList(dict));
        }
    } catch (error) { 
        console.error("Sözlük yükleme hatası:", error);
        showToast("Sözlük yüklenemedi.", true);
    }
}

export async function addWordToDictionary(word) {
    const userId = state.getUserId();
    if (!userId || !word) return;
    const upperWord = word.toLocaleUpperCase('tr-TR');
    const meaning = await fetchWordMeaning(upperWord);
    
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            dictionary: arrayUnion({ word: upperWord, meaning: meaning, addedAt: new Date().toISOString() })
        });
        
        const btn = document.getElementById('btn-add-word-to-dict');
        if (btn) {
            btn.innerHTML = '<span>✅</span> Eklendi';
            btn.classList.replace('bg-amber-600', 'bg-green-600');
            btn.disabled = true;
        }
        showToast("Sözlüğe eklendi!", false);
    } catch (error) { 
        console.error("Kelime ekleme hatası:", error);
        showToast("Hata oluştu.", true); 
    }
}

export async function removeWordFromDictionary(wordToRemove, cardEl) {
    const userId = state.getUserId();
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if(userSnap.exists()) {
            const list = userSnap.data().dictionary || [];
            const item = list.find(i => i.word === wordToRemove);
            if(item) {
                await updateDoc(userRef, { dictionary: arrayRemove(item) });
                if(cardEl) {
                    cardEl.style.transform = 'translateX(100%)';
                    cardElement.style.opacity = '0';
                    setTimeout(() => cardEl.remove(), 300);
                }
                showToast("Silindi.", false);
            }
        }
    } catch(e) { console.error(e); }
}

export function setupDictionaryButton(word) {
    const btn = document.getElementById('btn-add-word-to-dict');
    if (!btn) return;
    
    // Butonu sıfırla ve göster
    btn.classList.remove('hidden', 'bg-green-600');
    btn.classList.add('bg-amber-600');
    btn.innerHTML = '<span>📖</span> Sözlüğe Ekle';
    btn.disabled = false;
    
    // Event listener'ı temizlemek için klonla
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.onclick = () => addWordToDictionary(word);
}