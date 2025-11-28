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

let cpuLoopTimeout = null; // Bot döngüsünü kontrol etmek için global değişken

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
        // Gereksiz elementleri gizle
        roundWinnerDisplay.style.display = 'none';
        correctWordDisplay.style.display = 'none';
        matchWinnerDisplay.style.display = 'none';
        finalScores.style.display = 'none';
        newRoundBtn.classList.add('hidden'); 
        newWordRematchBtn.classList.add('hidden');
        defaultWordDisplayContainer.style.display = 'none'; 

        // İstatistikleri getir
        const dailyStats = await getDailyLeaderboardStats(currentUserId, gameData.secretWord);
        dailyStatsContainer.classList.remove('hidden');

        const didWin = gameData.roundWinner === currentUserId;
        const resultTitle = didWin ? "🎉 TEBRİKLER!" : "😔 MAALESEF";
        const resultColor = didWin ? "text-green-400" : "text-red-400";

        // İstatistik Kartını Oluştur
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
                        <p id="word-meaning-display-daily" class="text-sm text-gray-300 italic leading-relaxed mb-3">
                            Anlam yükleniyor...
                        </p>
                        
                        <div id="daily-dict-btn-container" class="flex justify-center"></div>
                    </div>
                </div>
            `;
            
            // Anlamı yükle
            const meaningDisplayEl = document.getElementById('word-meaning-display-daily'); 
            const meaning = await fetchWordMeaning(gameData.secretWord);
            if(meaningDisplayEl) meaningDisplayEl.textContent = meaning;

            // --- DÜZELTME: Sözlük Butonunu Özel Konteynera Taşı ---
            // Normal butonu alıyoruz
            const originalBtn = document.getElementById('btn-add-word-to-dict');
            if (originalBtn) {
                // Butonu görünür yap ve özelliklerini ayarla
                originalBtn.classList.remove('hidden');
                originalBtn.classList.add('bg-amber-600');
                originalBtn.disabled = false;
                originalBtn.innerHTML = '<span>📖</span> Sözlüğe Ekle';
                
                // Event listener'ı temizle ve yenisini ekle
                const newBtn = originalBtn.cloneNode(true);
                newBtn.onclick = () => import('./game.js').then(m => m.addWordToDictionary(gameData.secretWord));
                
                // Butonu oluşturduğumuz özel konteynera taşı
                const container = document.getElementById('daily-dict-btn-container');
                if (container) {
                    container.appendChild(newBtn);
                }
            }
            // -----------------------------------------------------

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

// js/game.js -> initializeGameUI (GÜNCELLENMİŞ HALİ)

// js/game.js -> initializeGameUI (TAM VE DÜZELTİLMİŞ HALİ)

export function initializeGameUI(gameData) {
    // --- KESİN ÇÖZÜM: SİGORTA KODU ---
    // Eğer gizli kelime varsa, oyunun belirlediği uzunluğa bakma,
    // doğrudan kelimenin kendi uzunluğunu baz al!
    if (gameData.secretWord && gameData.secretWord.length > 0) {
        if (gameData.wordLength !== gameData.secretWord.length) {
            console.warn(`DÜZELTME: Izgara ${gameData.wordLength} yerine kelimeye uygun olarak ${gameData.secretWord.length} yapıldı.`);
            // Veriyi anlık olarak düzeltiyoruz
            gameData.wordLength = gameData.secretWord.length;
        }
    }
    wordLength = gameData.wordLength;
    
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

    // --- DÜZELTME BURADA ---
    // Sadece vsCPU değil, "Lig" ve "Günlük" hariç TÜM OYUNLARDA (Seri, Gevşek, Arkadaş) sayaç çalışsın.
    const gameMode = state.getGameMode();
    
    // Sayacı Başlat (Eğer oyun oynanıyorsa)
    if (gameData.status === 'playing' && gameMode !== 'daily') {
        setTimeout(() => {
            // game.js içindeki startTurnTimer fonksiyonunu çağır
            startTurnTimer();
        }, 200);
    }

    // vsCPU Özel Buton Ayarları
    if (gameMode === 'vsCPU') {
        const leaveBtn = document.getElementById('leave-game-button');
        const p2ScoreBox = document.getElementById('player2-score');
        
        if (leaveBtn) {
            leaveBtn.classList.remove('hidden'); 
            leaveBtn.className = "bg-red-600/80 hover:bg-red-600 text-white text-[10px] font-bold py-0.5 px-2 rounded shadow-sm";
            leaveBtn.textContent = "Çıkış";
            
            if (p2ScoreBox && !p2ScoreBox.contains(leaveBtn)) {
                p2ScoreBox.appendChild(leaveBtn);
            }
        }
    }
    // -------------------------------------------------
}

// js/game.js -> updateTurnDisplay (DÜZELTİLMİŞ FİNAL VERSİYON)

export function updateTurnDisplay(gameData) {
    // Gerekli UI elementleri yoksa işlem yapma
    if (!startGameBtn || !shareGameBtn) return;

    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const isCreator = gameData.creatorId === currentUserId; // Oyunu kuran kişi biz miyiz?
    
    // 1. LİG MODU (Kendi özel arayüzü var, burayı pas geçiyoruz)
    if (gameMode === 'league') {
        return;
    }
    
    // 2. BATTLE ROYALE MODU
    if (isBattleRoyale(gameMode)) {
        if (!brTimerDisplay || !brTurnDisplay) return;
        brTimerDisplay.textContent = gameData.timeLimit || 60;
        const brWaitingForPlayers = document.getElementById('br-waiting-for-players');
        const playerState = gameData.players[currentUserId] || {};
        const numPlayers = Object.keys(gameData.players).length;

        if (gameData.status === 'waiting') {
            brTurnDisplay.textContent = `Oyuncu bekleniyor (${numPlayers}/${MAX_BR_PLAYERS || 4})...`;
            
            // --- DÜZELTME: Host ise ve en az 2 kişi varsa Başlat butonu görünsün ---
            if (isCreator && numPlayers >= 1) { // Test kolaylığı için 1, canlıda 2 yapabilirsin
                startGameBtn.classList.remove('hidden');
                startGameBtn.textContent = "Oyunu Başlat (BR)";
                startGameBtn.className = "w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg text-lg my-1 flex-shrink-0 cursor-pointer";
                startGameBtn.onclick = startGame; 
            } else {
                startGameBtn.classList.add('hidden');
            }
            // ----------------------------------------------------------------------

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
    
    // 3. STANDART MODLAR (Multiplayer, vsCPU, Gevşek, Seri)
    if (!turnDisplay || !timerDisplay) return; 
    if (gameMode === 'daily') return;

    // --- KRİTİK DÜZELTME BURADA ---
    if (gameData.status === 'waiting' || gameData.status === 'invited') {
        const numPlayers = Object.keys(gameData.players).length;
        
        if (gameData.status === 'invited') {
             turnDisplay.textContent = `Arkadaşın bekleniyor...`;
        } else {
             turnDisplay.textContent = numPlayers > 1 ? "Başlatmak için bekleniyor..." : "Rakip bekleniyor...";
        }

        // Eğer HOST ise butonu göster
        if (isCreator) {
            startGameBtn.classList.remove('hidden');
            
            // Oyuncu sayısına göre buton metnini güncellemek iyi bir UX olur
            // vsCPU modunda tek başına başlatılabilir, diğerlerinde en az 2 kişi lazım
            if (numPlayers < 2 && gameMode !== 'vsCPU') {
                startGameBtn.disabled = true; 
                startGameBtn.textContent = "Oyuncu Bekleniyor...";
                startGameBtn.className = "w-full bg-gray-600 text-gray-400 font-bold py-3 px-4 rounded-lg text-lg my-1 flex-shrink-0 cursor-not-allowed";
            } else {
                startGameBtn.disabled = false;
                startGameBtn.textContent = "Oyunu Başlat";
                startGameBtn.className = "w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg text-lg my-1 flex-shrink-0 cursor-pointer";
                startGameBtn.onclick = startGame; // Fonksiyonu bağla
            }
        } else {
            // Host değilse butonu gizle
            startGameBtn.classList.add('hidden');
        }
        
        shareGameBtn.classList.remove('hidden');
        
    } 
    // -------------------------------
    
    // --- OYUN OYNANIYORSA ---
    else if (gameData.status === 'playing') {
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.add('hidden');
        
        // vsCPU dışındaki tüm online modlar
        if (gameMode === 'multiplayer' || gameMode === 'friend' || gameMode === 'random_series' || gameMode === 'random_loose') {
            const myState = gameData.players[currentUserId];
            
            if (myState && myState.hasSolved) {
                turnDisplay.textContent = "✅ Buldun! Bekleniyor...";
                turnDisplay.className = "font-bold text-green-400 animate-pulse text-sm";
            } else if (myState && myState.hasFailed) {
                turnDisplay.textContent = "❌ Hakkın Bitti";
                turnDisplay.className = "font-bold text-red-400 text-sm";
            } else {
                turnDisplay.textContent = "Tahmin Yap!";
                turnDisplay.className = "font-bold text-white pulsate text-md";
            }
        } 
        // vsCPU Modu
        else if (gameMode === 'vsCPU') {
            const myState = gameData.players[currentUserId];
            
            // DÜZELTME: Eğer ben bitirdiysem (Bildi veya Yandı), Bilgisayarı bekle
            if (myState && (myState.hasSolved || myState.hasFailed)) {
                turnDisplay.textContent = "Bilgisayar Bekleniyor...";
                turnDisplay.className = "font-bold text-yellow-400 animate-pulse text-sm";
            } 
            // Ben bitirmedim, sıra bende
            else {
                turnDisplay.textContent = "Sıra Sende!";
                turnDisplay.className = "font-bold text-white pulsate text-md";
            }
        }
    } 
    
    else if (gameData.status === 'finished') {
        turnDisplay.textContent = "Oyun Bitti";
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.add('hidden');
    }
}

// ===================================================
// === OYUN DURUMUNU ÇİZME (RENDER) ===
// ===================================================

// js/game.js -> renderGameState (DÜZELTİLMİŞ VERSİYON)

export async function renderGameState(gameData, didMyGuessChange = false) {
    if (!gameData) return;

    const currentUserId = state.getUserId();
    const gameMode = state.getGameMode();
    const isBR = (gameMode === 'multiplayer-br');

    // Ses Efekti
    const oldGameData = state.getLocalGameData();
    const oldPlayerId = oldGameData?.currentPlayerId;
    const isMyTurnNow = gameData.currentPlayerId === currentUserId;

    if (!isBR && gameMode !== 'vsCPU' && oldPlayerId && oldPlayerId !== currentUserId && isMyTurnNow) {
        import('./utils.js').then(u => u.playSound('turn'));
    }

    // --- UI ELEMENTLERİNİ SEÇ ---
    const sequentialGameInfo = document.getElementById('sequential-game-info');
    const jokerContainer = document.getElementById('joker-container');
    const copyBtn = document.getElementById('copy-game-id-btn');
    const shareBtn = document.getElementById('share-game-btn');
    const gameIdDisplay = document.getElementById('game-id-display');
    const leaveBtn = document.getElementById('leave-game-button');
    const multiplayerScoreBoard = document.getElementById('multiplayer-score-board');
    const timerDisplay = document.getElementById('timer-display');
    const turnDisplay = document.getElementById('turn-display');
    const roundCounter = document.getElementById('round-counter');
    const keyboardContainer = document.getElementById('keyboard');
    
    // ============================================================
    // === 1. GENEL GÖRÜNÜRLÜK AYARLARI ===
    // ============================================================
    
    if (isBR) {
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.remove('hidden');
        if (sequentialGameInfo) sequentialGameInfo.classList.add('hidden');
        import('./ui.js').then(ui => ui.updateMultiplayerScoreBoard(gameData));
    } 
    else {
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.add('hidden');
        if (sequentialGameInfo) sequentialGameInfo.classList.remove('hidden');
        import('./ui.js').then(ui => ui.updateMultiplayerScoreBoard(gameData));
    }

    // ============================================================
    // === 2. BUTON SIFIRLAMA VE GÜVENLİ ÇIKIŞ AYARI ===
    // ============================================================
    if (leaveBtn) {
        leaveBtn.classList.remove('hidden');
        // Rengi Gri yapıyoruz (Güvenli çıkış hissi için)
        leaveBtn.className = "bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded text-sm";
        // İsmini "Menü" yapıyoruz
        leaveBtn.textContent = "Menü";
        
        // --- KRİTİK DÜZELTME ---
        // Tıklanınca oyunu SONLANDIRMA (abandon), sadece EKRANDAN ÇIK (leave)
        // Bu sayede 'Oyunlarım' menüsünden geri dönebilirsin.
        leaveBtn.onclick = (e) => {
            e.stopPropagation(); // Olası diğer tıklamaları engelle
            import('./game.js').then(m => m.leaveGame());
        };

        // === 2. BUTON SIFIRLAMA ===
    // ============================================================
        if (leaveBtn) {
        leaveBtn.classList.remove('hidden');
        // İstersek metni burada değiştirebiliriz ama HTML'de "Menü" yazması yeterli.
        
        leaveBtn.onclick = (e) => {
            e.stopPropagation(); 
            import('./game.js').then(m => m.leaveGame());
        };
    }
        
    }

    // ============================================================
    // === 3. MODA ÖZEL ARAYÜZ AYARLARI ===
    // ============================================================

    // A) LİG VE GÜNLÜK
    if (gameMode === 'daily' || gameMode === 'league') {
        if (sequentialGameInfo) sequentialGameInfo.classList.remove('hidden');
        
        if (gameMode === 'league') {
            if (timerDisplay) {
                timerDisplay.style.display = 'block';
                if(timerDisplay.parentElement) timerDisplay.parentElement.className = "w-full flex justify-center items-center";
                timerDisplay.className = 'font-mono font-black text-6xl text-yellow-400 tracking-widest drop-shadow-lg';
            }
            document.getElementById('player1-score').style.display = 'none';
            document.getElementById('player2-score').style.display = 'none';
            if (turnDisplay) turnDisplay.style.display = 'none';
            if (roundCounter) roundCounter.style.display = 'none';
        } else {
            if (timerDisplay && timerDisplay.parentElement) timerDisplay.parentElement.className = "text-center w-1/5";
            if (turnDisplay) { turnDisplay.style.display = 'block'; turnDisplay.textContent = 'Günün Kelimesi'; }
            if (roundCounter) { roundCounter.style.display = 'block'; roundCounter.textContent = new Date().toLocaleDateString('tr-TR'); }
        }

        if (gameInfoBar) {
            gameInfoBar.style.display = 'flex'; 
            if (gameIdDisplay) gameIdDisplay.textContent = ''; 
            if (copyBtn) copyBtn.style.display = 'none';
            if (shareBtn) shareBtn.style.display = 'none';
        }
        if (jokerContainer) jokerContainer.style.display = (gameMode === 'league') ? 'flex' : 'none';
    } 
    
    // B) vsCPU
    else if (gameMode === 'vsCPU') {
        if (timerDisplay) {
            timerDisplay.style.display = 'block';
            timerDisplay.className = 'font-bold text-xl font-mono text-gray-300';
            if(timerDisplay.parentElement) timerDisplay.parentElement.className = "text-center w-1/5 flex flex-col items-center";
        }
        if (turnDisplay) turnDisplay.style.display = 'block';
        if (roundCounter) roundCounter.style.display = 'block';
        
        document.getElementById('player1-score').style.display = 'block';
        
        const p2ScoreBox = document.getElementById('player2-score');
        if (p2ScoreBox) {
            p2ScoreBox.style.display = 'flex';
            p2ScoreBox.style.flexDirection = 'column'; 
            p2ScoreBox.style.alignItems = 'flex-end'; 
            p2ScoreBox.style.gap = '4px';
            if (leaveBtn && !p2ScoreBox.contains(leaveBtn)) {
                p2ScoreBox.appendChild(leaveBtn);
                leaveBtn.className = "bg-red-600/80 hover:bg-red-600 text-white text-[10px] font-bold py-0.5 px-2 rounded shadow-sm";
                leaveBtn.textContent = "Çıkış";
            }
        }
        if (jokerContainer) jokerContainer.style.display = 'flex'; 
        if (roundCounter) roundCounter.textContent = `Tur ${gameData.currentRound}/${gameData.matchLength}`;
    }
    
    // C) SERİ OYUN, GEVŞEK, ARKADAŞ, BR (STANDART MODLAR)
    else {
        if (timerDisplay) {
            timerDisplay.style.display = 'block'; 
            timerDisplay.className = 'font-bold text-xl font-mono text-gray-300';
            if(timerDisplay.parentElement) timerDisplay.parentElement.className = "text-center w-1/5 flex flex-col items-center";
        }
        
        if (turnDisplay) turnDisplay.style.display = 'block';
        if (roundCounter) roundCounter.style.display = 'block';
        
        document.getElementById('player1-score').style.display = 'block';
        document.getElementById('player2-score').style.display = 'block';

        if (jokerContainer) jokerContainer.style.display = 'flex'; 
        
               
        if (roundCounter) {
            if (gameData.gameType === 'random_loose') roundCounter.textContent = "Gevşek Oyun";
            else roundCounter.textContent = `Tur ${gameData.currentRound}/${gameData.matchLength}`;
        }
    }
    
    // Klavye Kilidi
    const playerState = gameData.players[currentUserId] || {};
    let shouldLockKeyboard = false;

    if (gameMode === 'vsCPU') {
        const myCpuState = gameData.players[currentUserId];
        if (myCpuState && (myCpuState.hasSolved || myCpuState.hasFailed)) shouldLockKeyboard = true;
    } 
    else if (isBR) {
        if (playerState.isEliminated || playerState.hasSolved || playerState.hasFailed) shouldLockKeyboard = true;
    } else {
        if (gameData.status === 'finished') shouldLockKeyboard = true;
    }

    if (keyboardContainer) {
        keyboardContainer.style.pointerEvents = shouldLockKeyboard ? 'none' : 'auto';
    }

    // --- KRİTİK DÜZELTME: FONKSİYONU BURADAN (GAME.JS) ÇAĞIRIYORUZ ---
    // updateTurnDisplay bu dosyanın içinde tanımlı olduğu için import etmeye gerek yok.
    updateTurnDisplay(gameData); 
    // ----------------------------------------------------------------

    import('./ui.js').then(ui => {
        if(ui.updateKeyboard) ui.updateKeyboard(gameData);
    });

    // --- IZGARA ÇİZİMİ ---
    const firstTile = document.getElementById(`tile-0-0`);
    const firstTileFront = firstTile ? firstTile.querySelector('.front') : null;
    const isGridPristine = !firstTileFront || (firstTileFront.textContent === '' && !firstTile.classList.contains('flip'));
    
    if (didMyGuessChange || isGridPristine) {
        const playerGuesses = gameData.players[currentUserId]?.guesses || [];
        const currentRow = playerGuesses.length;
        const wordLength = gameData.wordLength || 5;
        const GUESS_COUNT = gameData.GUESS_COUNT || 6;
        
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
                    back.className = 'tile-inner back'; 
                }

                if (playerGuesses[i]) {
                    const guess = playerGuesses[i];
                    front.textContent = guess.word[j];
                    back.textContent = guess.word[j];
                    back.className = 'tile-inner back ' + guess.colors[j];
                    
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
                else if (i === currentRow && gameData.status === 'playing') {
                    import('./state.js').then(stateMod => {
                        const knownPositions = stateMod.getKnownCorrectPositions();
                        if (knownPositions && knownPositions[j]) {
                            front.textContent = knownPositions[j];
                            back.textContent = knownPositions[j];
                            back.className = 'tile-inner back correct';
                            tile.className = 'tile static correct';
                        }
                    });
                }
            } 
            
            if (playerGuesses[i] && playerGuesses[i].colors.indexOf('failed') === -1) {
                const guessWord = playerGuesses[i].word;
                const lastTileInRow = document.getElementById(`tile-${i}-${wordLength - 1}`);
                if (lastTileInRow) {
                    const backFace = lastTileInRow.querySelector('.back');
                    const meaningIcon = createElement('button', {
                        className: 'meaning-icon', 
                        innerHTML: '?',
                        onclick: (e) => { 
                            e.stopPropagation(); 
                            import('./game.js').then(g => g.fetchWordMeaning(guessWord).then(m => alert(`${guessWord}:\n\n${m}`)));
                        }
                    });
                    Object.assign(meaningIcon.style, {
                        position: 'absolute', right: '2px', top: '2px', width: '18px', height: '18px', 
                        backgroundColor: '#ef4444', color: 'white', borderRadius: '50%', border: '1px solid white',
                        fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', zIndex: '10', padding: '0', lineHeight: '16px'
                    });
                    if(backFace) backFace.appendChild(meaningIcon); 
                }
            }
        } 
    }
    
    // --- MİNİ RAKİP IZGARASI ---
    const isVersusMode = (gameMode === 'multiplayer' || gameMode === 'vsCPU' || gameMode === 'friend' || gameMode === 'random_series') && !isBR;
    
    if (isVersusMode && sequentialGameInfo && !sequentialGameInfo.classList.contains('hidden')) {
        let opponentId = Object.keys(gameData.players).find(id => id !== currentUserId);
        if (gameMode === 'vsCPU') opponentId = 'cpu';

        if (opponentId && gameData.players[opponentId]) {
            const oppGuesses = gameData.players[opponentId].guesses || [];
            import('./ui.js').then(ui => {
                if(ui.updateOpponentMiniGrid) ui.updateOpponentMiniGrid(oppGuesses, gameData.wordLength, 6);
            });
        }
    } else {
        const miniGrid = document.getElementById('opponent-mini-grid');
        if (miniGrid) miniGrid.classList.add('hidden');
    }
    
    const isMyTurn = isBR ? 
        (!playerState.isEliminated && !playerState.hasSolved && !playerState.hasFailed) : 
        (gameMode === 'vsCPU' ? (!playerState.hasSolved && !playerState.hasFailed) : true);
    
    const playerJokers = gameData.players[currentUserId]?.jokersUsed || {};
    import('./ui.js').then(ui => {
        if (ui.updateJokerUI) ui.updateJokerUI(playerJokers, isMyTurn, gameData.status);
    });
}

function updateKnownPositions(playerGuesses) {
    // DÜZELTME: Eğer oyuncunun hiç tahmini yoksa (Yeni Tur), hafızayı eski tahminlerle kirletme!
    if (!playerGuesses || playerGuesses.length === 0) {
        // Ancak Joker kullanmış olabilir mi? 
        // Eğer oyun başıysa ve tahmin yoksa, state'teki 'knownCorrectPositions' 
        // zaten resetlenmiş olmalıydı (listenToGameUpdates içinde).
        // O yüzden buraya dokunmuyoruz veya sadece mevcut state'i döndürüyoruz.
        return state.getKnownCorrectPositions() || {};
    }

    // 1. Mevcut hafızayı kopyala
    const currentKnown = state.getKnownCorrectPositions() || {};
    const newPositions = { ...currentKnown }; 

    // 2. SADECE Bu turda yapılan tahminlerden gelen yeşilleri ekle
    playerGuesses.forEach(guess => {
        guess.colors.forEach((color, index) => {
            if (color === 'correct') {
                newPositions[index] = guess.word[index];
            }
        });
    });
    
    // 3. Güncellenmiş hafızayı kaydet
    state.setKnownCorrectPositions(newPositions);
    return newPositions;
}

// ===================================================
// === OYUN AKIŞI (LISTENERS) ===
// ===================================================

// js/game.js -> listenToGameUpdates Fonksiyonunun TAMAMI

// js/game.js -> listenToGameUpdates (TAM VE DÜZELTİLMİŞ HALİ)

// js/game.js -> listenToGameUpdates (TAM VE DÜZELTİLMİŞ HALİ)

// js/game.js -> listenToGameUpdates (GÜNCELLENMİŞ)

// js/game.js -> listenToGameUpdates (FİNAL DÜZELTME - BR SAYAÇ AKTİF)

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
        
        const currentUserId = state.getUserId();
        const oldGameData = state.getLocalGameData(); 

        // 1. YENİ TUR ALGILAMA (HARD RESET)
        if (oldGameData && gameData.currentRound > oldGameData.currentRound) {
            console.log(`LOG: Yeni tur (${gameData.currentRound}) algılandı.`);
            state.resetKnownCorrectPositions(); 
            state.resetHasUserStartedTyping();
            
            import('./ui.js').then(ui => {
                if (ui.resetUIForNewRound) ui.resetUIForNewRound();
                ui.createGrid(gameData.wordLength, gameData.GUESS_COUNT); 
            });

            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        }

        // 2. OYUN BAŞLAMA ALGILAMA (WAITING -> PLAYING)
        const isGameJustStarted = (oldGameData?.status === 'waiting' || oldGameData?.status === 'invited') && gameData.status === 'playing';
        
        if (isGameJustStarted) {
            const matchmakingScreen = document.getElementById('matchmaking-screen');
            if (matchmakingScreen && !matchmakingScreen.classList.contains('hidden')) {
                showScreen('game-screen');
            }
            initializeGameUI(gameData);
            
            // --- KRİTİK DÜZELTME: SAYAÇ SEÇİMİ ---
            setTimeout(() => {
                if (gameData.gameType === 'multiplayer-br') {
                    console.log("BR Sayacı başlatılıyor...");
                    startBRTimer(); // Battle Royale için özel sayaç
                } else {
                    console.log("Standart sayaç başlatılıyor...");
                    startTurnTimer(); // Diğer modlar için standart sayaç
                }
            }, 500);
            // -------------------------------------
        }

        // --- BOT KONTROLÜ (GİZLİ OYUNCU) ---
        // Eğer oyun başladıysa ve rakip 'isBot' ise, yapay zeka döngüsünü başlat.
        if (gameData.status === 'playing') {
            const opponentId = Object.keys(gameData.players).find(id => id !== currentUserId);
            const opponentData = gameData.players[opponentId];
            
            // Eğer rakip bir BOT ise ve henüz döngü başlamadıysa
            // Ve biz "Host" (Creator) isek botu biz yönetelim (Çakışmayı önlemek için)
            if (opponentData && opponentData.isBot && gameData.creatorId === currentUserId) {
                // Bot hamle yapmamışsa veya sırasıysa döngüyü tetikle
                // startCpuLoop fonksiyonunu biraz modifiye etmemiz gerekecek veya 
                // mevcut cpuTurn fonksiyonunu 'opponentId' alacak şekilde güncelleyeceğiz.
                
                // Basit çözüm: startCpuLoop zaten var, ama 'cpu' stringine bakıyor.
                // Onu birazdan güncelleyeceğiz. Şimdilik sadece çağıralım.
                // Botun ID'sini state'e geçici olarak kaydedebiliriz veya fonksiyona parametre geçebiliriz.
                
                // startCpuLoop fonksiyonunu aşağıda güncelleyeceğiz, burada sadece çağırıyoruz.
                startCpuLoop(opponentId); 
            }
        }
        // -----------------------------------

        state.setLocalGameData(gameData); 
        
        if (gameData.players && gameData.players[currentUserId]) {
            updateKnownPositions(gameData.players[currentUserId].guesses);
        }

        // 3. OYUN/TUR BİTİŞ KONTROLÜ (HERKES İÇİN)
        if (gameData.status === 'playing') {
            const allPlayerIds = Object.keys(gameData.players);
            const isEveryoneDone = allPlayerIds.every(pid => {
                const p = gameData.players[pid];
                if (!p) return false;
                if (pid === 'cpu') return true; 
                return p.isEliminated || p.hasSolved || p.hasFailed; 
            });

            if (isEveryoneDone) {
                if (gameData.creatorId === currentUserId) {
                    console.log("Herkes tamamladı. Tur bitiriliyor...");
                    
                    const playersArr = Object.entries(gameData.players).map(([key, val]) => ({ ...val, userId: key }));
                    const solvers = playersArr.filter(p => p.hasSolved);
                    let winnerId = null;
                    
                    if (solvers.length > 0) {
                        solvers.sort((a, b) => (a.guesses ? a.guesses.length : 99) - (b.guesses ? b.guesses.length : 99));
                        winnerId = solvers[0].userId;
                    } 

                    const currentRound = gameData.currentRound || 1;
                    const matchLength = gameData.matchLength || 1;
                    
                    let updates = {};
                    if (currentRound < matchLength) {
                        updates = { roundWinner: winnerId, status: 'finished' };
                    } else {
                        updates = { status: 'finished', roundWinner: winnerId, matchWinnerId: winnerId };
                    }
                    
                    if (updates.roundWinner === undefined) updates.roundWinner = null;
                    if (updates.matchWinnerId === undefined) delete updates.matchWinnerId;

                    updateDoc(gameRef, updates).catch(err => console.error("Tur bitirme hatası:", err));
                }
            }
        }

        // 4. RENDER VE SAYFA YENİLEME DURUMU
        const wasFinished = oldGameData?.status === 'finished';
        const isNowPlaying = gameData.status === 'playing';
        
        // Eğer sayfa yenilendiyse ve oyun oynanıyorsa sayacı tekrar tetikle
        if (!oldGameData && isNowPlaying) {
             setTimeout(() => {
                if (gameData.gameType === 'multiplayer-br') startBRTimer();
                else startTurnTimer();
            }, 500);
        }
        
        if (wasFinished && isNowPlaying) {
            showScreen('game-screen');
            initializeGameUI(gameData);
            // Yeni tur başlangıcında da sayaç başlat
            setTimeout(() => {
                if (gameData.gameType === 'multiplayer-br') startBRTimer();
                else startTurnTimer();
            }, 500);
        }
        
        const currentGuesses = gameData.players[currentUserId]?.guesses || [];
        const oldGuessesCount = oldGameData?.players[currentUserId]?.guesses.length || 0;
        const didMyGuessChange = currentGuesses.length > oldGuessesCount;

        if (didMyGuessChange) {
            state.resetHasUserStartedTyping();
        }

        if (gameData.status === 'playing') {
            const myGuesses = gameData.players[currentUserId]?.guesses || [];
            if (myGuesses.length >= gameData.GUESS_COUNT) {
                stopTurnTimer(); // Sadece kendi yerel sayacını durdur (BR sayacı ayrı çalışır)
                if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
            }
        }
        
        if (gameData.status === 'finished') {
            stopTurnTimer();
            renderGameState(gameData, didMyGuessChange).then(() => {
                const delay = isBattleRoyale(state.getGameMode()) ? 2500 : 1500;
                setTimeout(() => showScoreboard(gameData), delay);
            });
        } else {
            renderGameState(gameData, didMyGuessChange);
        }

    }, (error) => { 
        console.error("Oyun dinlenirken hata:", error);
    });
    
    state.setGameUnsubscribe(unsubscribe);
}

// ===================================================
// === OYUN KURMA VE KATILMA ===
// ===================================================

// js/game.js

// js/game.js -> findOrCreateRandomGame (BOT DESTEKLİ)

export async function findOrCreateRandomGame(config, attempt = 1) {
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();

    const { timeLimit, matchLength, gameType } = config;
    const currentUserId = state.getUserId();
    
    if (!currentUserId) return showToast("Lütfen önce giriş yapın.", true);

    // 1. UI'ı aç
    if (attempt === 1) {
        import('./ui.js').then(ui => ui.openMatchmakingScreen());
    }

    // İptal butonu için flag
    let isCancelled = false;
    const cancelBtn = document.getElementById('cancel-matchmaking-btn');
    
    const handleCancel = () => {
        isCancelled = true;
        const activeId = state.getCurrentGameId();
        if (activeId) {
            import('./game.js').then(m => m.abandonGame(activeId));
        }
        import('./ui.js').then(ui => ui.showScreen('new-game-screen', true));
    };
    
    if(cancelBtn) cancelBtn.onclick = handleCancel;

    try {
        // Veritabanı sorgusu (Aynı kalıyor)
        const gamesRef = collection(db, 'games');
        const waitingGamesQuery = query(gamesRef, 
            where('status', '==', 'waiting'),
            where('gameType', '==', gameType),
            where('timeLimit', '==', timeLimit),
            limit(5)
        );

        const querySnapshot = await getDocs(waitingGamesQuery);

        if (isCancelled) return;

        let foundGame = null;
        querySnapshot.forEach(doc => {
            if (doc.data().creatorId !== currentUserId) {
                foundGame = doc;
            }
        });

        if (foundGame) {
            await joinGame(foundGame.id);
        } 
        else {
            if (attempt === 1) {
                const randomDelay = Math.floor(Math.random() * 1500) + 500;
                console.log(`LOG: Oyun bulunamadı. ${randomDelay}ms bekleniyor...`);
                await new Promise(resolve => setTimeout(resolve, randomDelay));
                if (isCancelled) return;
                return findOrCreateRandomGame(config, 2);
            }
            
            // OYUN KURUYORUZ
            await createGame({ 
                invitedFriendId: null, 
                timeLimit: timeLimit, 
                matchLength: matchLength, 
                gameType: gameType 
            });

            // --- YENİ: BOT ZAMANLAYICISI ---
            // Oyun kuruldu, ID state'e kaydedildi. Şimdi 45sn sayacı başlatıyoruz.
            const createdGameId = state.getCurrentGameId();
            
            console.log("LOG: 45 Saniyelik Bot Sayacı Başlatıldı...");
            setTimeout(() => {
                // 45 saniye sonra oyun hala 'waiting' ise bot ata
                const currentGameData = state.getLocalGameData();
                
                // Kullanıcı hala o ekrandaysa ve oyun başlamamışsa
                if (currentGameData && currentGameData.gameId === createdGameId && currentGameData.status === 'waiting') {
                    assignBotToGame(createdGameId);
                }
            }, 45000); // 45000 ms = 45 saniye
            // -------------------------------
        }
    } catch (error) {
        if (isCancelled) return;
        console.error("Rastgele oyun aranırken hata:", error);
        showToast("Oyun aranırken bir hata oluştu.", true);
        import('./ui.js').then(ui => ui.showScreen('new-game-screen'));
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
        if (gameData.status === 'playing') {
            showScreen('game-screen');
            initializeGameUI(gameData);
        } else {
            // Burada sadece arka planda dinlemeyi başlatıyoruz.
            // Ekranı değiştirmiyoruz, kullanıcı "Rakip Aranıyor" ekranında kalıyor.
            console.log("LOG: Oyun kuruldu, rakip bekleniyor. Radar ekranında kalınıyor.");
        }
        listenToGameUpdates(gameId);
    } catch (error) {
        console.error("Error creating game:", error);
        showToast("Oyun oluşturulamadı!", true);
    }
}

// js/game.js içindeki joinGame fonksiyonunu bununla değiştir:

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
        
        // --- DÜZELTME BAŞLANGIÇ ---
        // Eğer oyun hala "bekliyor" durumundaysa (yani biz kurucuyuz ve kimse gelmemişse)
        // VE bu bir rastgele eşleşme oyunuysa (Seri/Gevşek), RADAR EKRANINI AÇ.
        // (Arkadaş davetlerinde oyun ekranı açılabilir, çünkü kod paylaşmak gerekir)
        const isRandomWaiting = gameDataToJoin.status === 'waiting' && 
                               (gameDataToJoin.gameType === 'random_loose' || gameDataToJoin.gameType === 'random_series');

        if (isRandomWaiting) {
            console.log("LOG: joinGame içinde 'waiting' durumu algılandı. Radar ekranı açılıyor.");
            // ui.js'den fonksiyonu çağır
            import('./ui.js').then(ui => ui.openMatchmakingScreen());
        } else {
            // Normal durum: Oyun oynanıyorsa veya arkadaş davetiyse oyun ekranını aç
            showScreen('game-screen');
            initializeGameUI(gameDataToJoin);
        }
        // --- DÜZELTME BİTİŞ ---

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
    // --- YENİ: Başlangıç tahminlerini al (Yoksa boş dizi) ---
    const initialGuesses = config.initialGuesses || []; 
    // --------------------------------------------------------

    const gameSettings = { isHardMode: false };
    switch (config.mode) {
        case 'vsCPU':
            gameSettings.wordLength = getRandomWordLength();
            gameSettings.timeLimit = 120; 
            gameSettings.matchLength = 5;
            
            // Sadece CPU'yu başlat (Sayaç initializeGameUI içinde başlıyor)
            setTimeout(startCpuLoop, 1000); 
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
            gameSettings.timeLimit = 120;
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
                // --- YENİ: Tahminleri buraya yükle ---
                guesses: initialGuesses, 
                // -------------------------------------
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
    
    // --- YENİ: Eğer eski tahmin varsa hafızayı (yeşil harfleri) geri yükle ---
    if (initialGuesses.length > 0) {
        // Bu fonksiyonu game.js içinde en alta tanımlamıştık (önceki adımlarda)
        // Buradan çağırmak için import etmemize gerek yok, aynı dosyadayız.
        // Ancak fonksiyonun 'export' olup olmaması önemli değil, dosya içi erişilebilir.
        // Eğer updateKnownPositions fonksiyonu game.js içindeyse:
         const known = {};
         initialGuesses.forEach(g => {
             g.colors.forEach((c, i) => { if(c === 'correct') known[i] = g.word[i]; });
         });
         state.setKnownCorrectPositions(known);
    }
    // -----------------------------------------------------------------------

    showScreen('game-screen');
    initializeGameUI(gameData);
    await renderGameState(gameData);
    if (config.mode === 'vsCPU') {
        // Önceki zamanlayıcı varsa temizle (Çakışmayı önle)
        if (typeof cpuLoopTimeout !== 'undefined' && cpuLoopTimeout) clearTimeout(cpuLoopTimeout);
        
        console.log("vsCPU Başlatılıyor: Bot 1.5sn sonra devreye girecek.");
        // Yeni döngüyü başlat
        setTimeout(() => startCpuLoop('cpu'), 1500); 
    }
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

// js/game.js -> restoreDailyGame (GÜNCELLENMİŞ)

function restoreDailyGame(savedState) {
    console.log("Günün kelimesi hafızadan yükleniyor...");
    
    state.resetKnownCorrectPositions(); 
    state.resetHasUserStartedTyping();
    
    // --- KRİTİK DÜZELTME: Yeşil harfleri hafızaya geri yükle ---
    const known = {};
    if(savedState.guesses) {
        savedState.guesses.forEach(g => {
            g.colors.forEach((c, i) => { 
                if(c === 'correct') known[i] = g.word[i]; 
            });
        });
    }
    state.setKnownCorrectPositions(known);
    // -----------------------------------------------------------

    const gameData = {
        wordLength: savedState.secretWord.length, 
        secretWord: savedState.secretWord, 
        timeLimit: 60,
        isHardMode: false, 
        currentRound: 1, 
        matchLength: 1, // Günlük oyun tek maçtır
        roundWinner: savedState.status === 'finished' && savedState.guesses.length < GUESS_COUNT ? state.getUserId() : null,
        players: { 
            [state.getUserId()]: { 
                username: getUsername(), 
                guesses: savedState.guesses, 
                score: 0,
                jokersUsed: savedState.jokersUsed || { present: false, correct: false, remove: false } 
            } 
        },
        currentPlayerId: state.getUserId(), 
        status: savedState.status, 
        turnStartTime: new Date(), 
        GUESS_COUNT: GUESS_COUNT,
        gameType: 'daily',
    };

    state.setGameMode('daily');
    state.setLocalGameData(gameData);
    
    // Ekranı aç ve UI'ı hazırla
    showScreen('game-screen');
    initializeGameUI(gameData);
    
    // Durumu çiz (Render)
    // true parametresi animasyonsuz hızlı çizim sağlar
    renderGameState(gameData, true).then(() => {
        // Eğer oyun bitmiş olarak yüklendiyse, hemen skor tablosunu aç
        if (gameData.status === 'finished') {
            setTimeout(() => showScoreboard(gameData), 500);
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

// js/game.js -> submitGuess fonksiyonunun TAMAMI (Eş Zamanlı Mod Uyumlu)

// js/game.js -> submitGuess Fonksiyonunun TAMAMI

async function submitGuess() {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;

    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const playerState = localGameData.players[currentUserId];

    // 1. KONTROLLER: Elenmişse, çözmüşse veya hakkı bitmişse işlem yapma
    if (!playerState || playerState.isEliminated || playerState.hasSolved || playerState.hasFailed || (playerState.guesses && playerState.guesses.length >= GUESS_COUNT)) {
        return;
    }
    
    // 2. KELİMEYİ OLUŞTUR (UI'dan oku)
    let guessWord = '';
    const currentRow = playerState.guesses ? playerState.guesses.length : 0;
    const currentWordLength = localGameData.wordLength || 5;

    for (let i = 0; i < currentWordLength; i++) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        if (!tile) break;
        const tileInner = tile.querySelector('.front');
        if (!tileInner || tileInner.textContent === '') {
            showToast("Kelime yeterince uzun değil!", true);
            shakeCurrentRow(currentWordLength, currentRow);
            return;
        }
        guessWord += tileInner.textContent;
    }

    // 3. ZOR MOD KONTROLÜ
    if (localGameData.isHardMode && playerState.guesses.length > 0) {
        if (!checkHardMode(guessWord, playerState.guesses)) {
            shakeCurrentRow(currentWordLength, currentRow);
            return;
        }
    }

    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';

    // 4. SÖZLÜK KONTROLÜ
    const isValidWord = await checkWordValidity(guessWord);
    if (!isValidWord) {
        showToast("Kelime sözlükte bulunamadı!", true);
        shakeCurrentRow(currentWordLength, currentRow);
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }

    // Süreyi sadece BR değilse durdurabiliriz ama vsCPU'da yarış olduğu için durdurmuyoruz
    // Sadece kullanıcı bitirince duracak.

    // 5. RENKLERİ HESAPLA VE LOCAL STATE GÜNCELLE
    const secretWord = localGameData.secretWord;
    const colors = calculateColors(guessWord, secretWord);
    const newGuess = { word: guessWord, colors: colors };
    
    if (!localGameData.players[currentUserId].guesses) localGameData.players[currentUserId].guesses = [];
    localGameData.players[currentUserId].guesses.push(newGuess);
    
    updateKnownPositions(localGameData.players[currentUserId].guesses);
    state.resetHasUserStartedTyping();
    
    const isWinner = (guessWord === secretWord);
    const guessCount = localGameData.players[currentUserId].guesses.length;

    // 6. VERİTABANI / DURUM GÜNCELLEMESİ
    
    // A) ONLINE ÇOK OYUNCULU (Multiplayer, BR, Friend, Random) - LEAGUE HARİÇ
    if (gameMode === 'multiplayer' || isBattleRoyale(gameMode) || gameMode === 'friend' || gameMode === 'random_series' || gameMode === 'random_loose') {
        const updates = {
            [`players.${currentUserId}.guesses`]: localGameData.players[currentUserId].guesses
        };

        if (isWinner) {
            updates[`players.${currentUserId}.hasSolved`] = true;
            const roundScore = calculateRoundScore(guessCount, true);
            const currentScore = localGameData.players[currentUserId].score || 0;
            updates[`players.${currentUserId}.score`] = currentScore + roundScore;
        } 
        else if (guessCount >= GUESS_COUNT) {
            updates[`players.${currentUserId}.hasFailed`] = true;
        }

        try {
            await updateDoc(doc(db, "games", state.getCurrentGameId()), updates);
        } catch (error) {
            console.error("Tahmin gönderilemedi:", error);
            showToast("Bağlantı hatası.", true);
        }
    } 
    
    // --- YENİ: LİG MODU ÖZEL GÜNCELLEMESİ ---
    else if (gameMode === 'league') {
        const weekID = localGameData.leagueWeekID;
        const matchId = localGameData.leagueMatchId;
        const userId = state.getUserId();
        
        // Veritabanında hangi oyuncu olduğunu bul (p1 veya p2)
        // localGameData.leagueMatchId bilgisini startLeagueMatch'de kaydetmiştik
        if (weekID && matchId) {
            const matchRef = doc(db, "leagues", weekID, "matches", matchId);
            
            // Önce hangi tarafız onu belirleyelim (p1 mi p2 mi?)
            // Bunu yapmak için sunucudan veriyi çekmemiz gerekebilir ama
            // pratik olarak matchId içinde userId kontrolü veya startLeagueMatch'de kaydettiğimiz bilgiye güvenebiliriz.
            // Ancak en garantisi veritabanına bir "merge" işlemi atmaktır.
            
            // Basit bir trick: Match objesi elimizde yoksa transaction veya getDoc gerekir.
            // Ama biz UI tarafında zaten P1 mi P2 mi biliyorduk.
            // En güvenli yol: Veritabanını oku ve güncelle.
            
            try {
                await runTransaction(db, async (transaction) => {
                    const mDoc = await transaction.get(matchRef);
                    if (!mDoc.exists()) throw "Maç bulunamadı";
                    
                    const mData = mDoc.data();
                    const playerKey = (mData.p1 === userId) ? 'p1_data' : 'p2_data';
                    
                    const updates = {};
                    updates[`${playerKey}.guesses`] = localGameData.players[currentUserId].guesses;
                    
                    if (isWinner) {
                        updates[`${playerKey}.completed`] = true; // Oyunu bitirdi
                        updates[`${playerKey}.failed`] = false;
                    } else if (guessCount >= GUESS_COUNT) {
                        updates[`${playerKey}.completed`] = true;
                        updates[`${playerKey}.failed`] = true;
                    }
                    
                    transaction.update(matchRef, updates);
                });
                
                // Eğer oyun bittiyse yerel durumu da güncelle
                if (isWinner || guessCount >= GUESS_COUNT) {
                    localGameData.status = 'finished';
                    localGameData.roundWinner = isWinner ? currentUserId : null; // null = bilemedi
                    state.setLocalGameData(localGameData);
                    stopTurnTimer();
                    
                    // Sonuç ekranını göster
                    setTimeout(() => showScoreboard(localGameData), 1000);
                }
                
            } catch (e) {
                console.error("Lig güncelleme hatası:", e);
            }
        }
    } 
    
    // B) YEREL / CPU / GÜNLÜK MODLAR
    else {
        
        // --- vsCPU GÜNCELLEMESİ (BURASI DEĞİŞTİ) ---
        if (gameMode === 'vsCPU') {
            if (isWinner) {
                localGameData.players[currentUserId].hasSolved = true;
                const roundScore = calculateRoundScore(guessCount, true);
                localGameData.players[currentUserId].score += roundScore;
                
                await updateStats(true, guessCount);
                showToast("Tebrikler! Bilgisayar bekleniyor...", false);

            } else if (guessCount >= GUESS_COUNT) {
                localGameData.players[currentUserId].hasFailed = true;
                await updateStats(false, guessCount);
                showToast("Hakkın bitti! Bilgisayar bekleniyor...", true);
            }
            
            // State'i güncelle ve Oyun Sonunu Kontrol Et
            state.setLocalGameData(localGameData);
            checkVsCpuGameEnd(); // <-- E Maddesi burası
        }
        
        // DAILY MODE
        else if (gameMode === 'daily') {
            // 1. ÖNCE HER TAHMİNDE DURUMU KAYDET (Kritik Ekleme)
            // Oyun bitmese bile o anki tahminleri tarayıcıya yazıyoruz.
            saveDailyGameState(localGameData);

            if (isWinner) {
                localGameData.status = 'finished';
                localGameData.roundWinner = currentUserId;
                await updateStats(true, guessCount);
                const dailyScore = calculateDailyScore(guessCount, true);
                await saveDailyResultToDatabase(currentUserId, getUsername(), secretWord, true, guessCount, dailyScore);
                // Kazanınca da son halini kaydet
                saveDailyGameState(localGameData);
            } else if (guessCount >= GUESS_COUNT) {
                localGameData.status = 'finished';
                localGameData.roundWinner = null;
                await updateStats(false, guessCount);
                await saveDailyResultToDatabase(currentUserId, getUsername(), secretWord, false, guessCount, 0);
                // Kaybedince de son halini kaydet
                saveDailyGameState(localGameData);
            }
        }
    }

    // 7. KLAVYE KİLİDİ VE RENDER
    if (isWinner || guessCount >= GUESS_COUNT) {
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
        
        if (gameMode === 'multiplayer' || gameMode === 'league' || isBattleRoyale(gameMode)) {
            const msg = isWinner ? "Tebrikler! Diğer oyuncular bekleniyor..." : "Hakkın bitti! Diğerleri bekleniyor...";
            const isSuccess = isWinner;
            showToast(msg, !isSuccess);
        }
    }

    // Render
    renderGameState(localGameData, true).then(() => {
        // Sadece Daily modunda hemen bitir (vsCPU yukarıda handled, Online listenToUpdates ile handled)
        if (gameMode === 'daily' && localGameData.status === 'finished') {
            setTimeout(() => showScoreboard(localGameData), 1500);
        }
    });
}

// js/game.js -> failTurn Fonksiyonunun TAMAMI

// js/game.js -> failTurn (GÜNCELLENMİŞ)

export async function failTurn(guessWord = '') {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;
    
    const currentUserId = state.getUserId();
    const gameMode = state.getGameMode();
    const playerState = localGameData.players[currentUserId];

    if (playerState.hasSolved || playerState.hasFailed || playerState.isEliminated) return;

    stopTurnTimer();
    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';

    console.log("LOG: failTurn çalıştı. Süre bitti.");

    // 1. ONLINE MODLAR (Multiplayer, BR) - LEAGUE HARİÇ
    if (gameMode === 'multiplayer' || isBattleRoyale(gameMode)) {
        const updates = { [`players.${currentUserId}.hasFailed`]: true };
        try {
            await updateDoc(doc(db, "games", state.getCurrentGameId()), updates);
            showToast("Süre doldu!", true);
        } catch (error) { console.error(error); }
    } 
    
    // 2. LİG MODU (LEAGUE) - ÖZEL İŞLEM
    else if (gameMode === 'league') {
        const weekID = localGameData.leagueWeekID;
        const matchId = localGameData.leagueMatchId;
        
        if (weekID && matchId) {
            const matchRef = doc(db, "leagues", weekID, "matches", matchId);
            try {
                await runTransaction(db, async (transaction) => {
                    const mDoc = await transaction.get(matchRef);
                    if (!mDoc.exists()) return;
                    const mData = mDoc.data();
                    const playerKey = (mData.p1 === currentUserId) ? 'p1_data' : 'p2_data';
                    
                    // Tahminleri kaydet (varsa) ve başarısız olarak işaretle
                    transaction.update(matchRef, {
                        [`${playerKey}.guesses`]: localGameData.players[currentUserId].guesses || [],
                        [`${playerKey}.completed`]: true,
                        [`${playerKey}.failed`]: true
                    });
                });
                
                localGameData.status = 'finished';
                localGameData.roundWinner = null; // Kaybetti
                state.setLocalGameData(localGameData);
                
                showToast("Süre doldu!", true);
                setTimeout(() => showScoreboard(localGameData), 1000);
                
            } catch (e) { console.error("Lig süre bitiş hatası:", e); }
        }
    }
    
    // 3. OFFLINE / BOT MODLARI (vsCPU, Daily)
    else {
        // ... (Eski kodun aynısı buraya gelecek) ...
        // Eski else bloğunun içindekileri buraya taşı:
        localGameData.status = 'finished';
        localGameData.roundWinner = (gameMode === 'vsCPU') ? 'cpu' : null;
        await updateStats(false, 0);
        
        if (gameMode === 'daily') {
             saveDailyGameState(localGameData); 
             await saveDailyResultToDatabase(currentUserId, getUsername(), localGameData.secretWord, false, GUESS_COUNT, 0);
        } else if (gameMode === 'vsCPU') {
             if (localGameData.players['cpu']) localGameData.players['cpu'].score += 100;
        }

        renderGameState(localGameData, true).then(() => { 
            setTimeout(() => showScoreboard(localGameData), 1500); 
        });
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
    // --- DEĞİŞİKLİK: isMyTurnOnline KONTROLÜNÜ KALDIR ---
    // const isMyTurnOnline = isOnlineMode && localGameData.currentPlayerId === currentUserId; 
    // const canPlay = isPlayerActive && (isLocalMode || isMyTurnOnline || isBattleRoyale(gameMode));
    
    // YENİ KONTROL: Sadece aktifsen yazabilirsin
    if (isPlayerActive) {
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

// js/game.js -> findBestCpuGuess (GÜNCELLENMİŞ - GENEL KULLANIM)

function findBestCpuGuess(botId = 'cpu') {
    const localGameData = state.getLocalGameData();
    // Sadece o anki botun tahminlerini al
    const botGuesses = localGameData.players[botId]?.guesses || [];
    
    const wordLenStr = String(localGameData.wordLength);
    let possibleWords = [...(allWordList[wordLenStr] || allWordList["5"])]; 
    
    const correctLetters = {}; 
    const presentLetters = new Set(); 
    const absentLetters = new Set(); 
    const positionMisplaced = {}; 

    // Botun önceki tahminlerini analiz et
    botGuesses.forEach(g => {
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
                // Eğer harf başka bir yerde yeşil/sarı ise 'absent' listesine ekleme
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

    // Olası kelimeleri filtrele (Yapay Zeka Mantığı)
    possibleWords = possibleWords.filter(word => {
        // 1. Yeşil harfler kesinlikle doğru yerde olmalı
        for (const pos in correctLetters) {
            if (word[pos] !== correctLetters[pos]) return false;
        }
        // 2. Gri harfler kelimede OLMAMALI
        for (const letter of absentLetters) {
            if (word.includes(letter)) return false;
        }
        // 3. Sarı harfler kelimede OLMALI
        for (const letter of presentLetters) {
            if (!word.includes(letter)) return false;
        }
        // 4. Sarı harfler YANLIŞ YERDE olmamalı (Yani eski yerine tekrar gelmemeli)
        for (const letter in positionMisplaced) {
             for (const pos of positionMisplaced[letter]) {
                 if (word[pos] === letter) return false;
             }
        }
        return true;
    });
    
    // Botun daha önce denediği kelimeleri çıkar
    const guessedWords = new Set(botGuesses.map(g => g.word));
    let finalWords = possibleWords.filter(w => !guessedWords.has(w));
    
    const secretWord = localGameData.secretWord;
    
    // --- ZORLUK AYARI VE "İNSAN" DAVRANIŞI ---
    // Botun hemen bulmasını engellemek için bazen "hata" payı bırakabiliriz 
    // veya sadece final listesinden rastgele seçeriz.
    
    // Eğer hiç kelime kalmadıysa (çok nadir), rastgele salla
    if (finalWords.length === 0) {
        const emergencyList = (allWordList[wordLenStr] || []).filter(w => !guessedWords.has(w));
        return emergencyList.length > 0 ? emergencyList[Math.floor(Math.random() * emergencyList.length)] : "KALEM";
    }

    // Kazanma şansı varsa (Secret word listedeyse)
    const winningWordIndex = finalWords.indexOf(secretWord);
    
    // İlk 2 tahminde hemen bilmesin (Biraz gerçekçi olsun)
    if (botGuesses.length < 2 && winningWordIndex !== -1 && finalWords.length > 1) {
        // Doğru cevabı listeden geçici olarak çıkar, heyecan olsun
        finalWords.splice(winningWordIndex, 1);
    }
    // 4. tahminden sonra kazanma şansı %50 artsın
    else if (botGuesses.length >= 3 && winningWordIndex !== -1) {
        if (Math.random() > 0.4) return secretWord; // %60 ihtimalle doğruyu seçer
    }

    // Kalan olası kelimelerden rastgele birini seç
    const randomIndex = Math.floor(Math.random() * finalWords.length);
    return finalWords[randomIndex]; 
}

// js/game.js -> cpuTurn (GÜNCELLENMİŞ - GENEL BOT DESTEĞİ)

// js/game.js -> cpuTurn (GÜNCELLENMİŞ - AKILLI BOT DESTEĞİ)

// js/game.js -> cpuTurn (DÜZELTİLMİŞ - KAZANMA KONTROLÜ)

async function cpuTurn(botId = 'cpu') {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status === 'finished') return;

    const botState = localGameData.players[botId];
    
    // Güvenlik kontrolü: Zaten bitirmişse işlem yapma
    if (botState.hasSolved || botState.hasFailed) return;

    const finalGuess = findBestCpuGuess(botId);
    const secretWord = localGameData.secretWord;
    const colors = calculateColors(finalGuess, secretWord);
    const newGuess = { word: finalGuess, colors: colors };
    
    // A) vsCPU Modu (Yerel İşlem)
    if (botId === 'cpu') {
        localGameData.players['cpu'].guesses.push(newGuess);
        
        if (finalGuess === secretWord) {
            console.log("BOT: Doğru bildi!");
            localGameData.players['cpu'].hasSolved = true; // <-- Kritik
            localGameData.players['cpu'].score += calculateRoundScore(localGameData.players['cpu'].guesses.length, true);
        }
        else if (localGameData.players['cpu'].guesses.length >= GUESS_COUNT) {
            localGameData.players['cpu'].hasFailed = true; // <-- Kritik
        }
        
        state.setLocalGameData(localGameData);
        await renderGameState(localGameData, false);
        checkVsCpuGameEnd();
    } 
    
    // B) Online Bot Modu (Firebase İşlemi)
    else {
        const currentGuesses = botState.guesses || [];
        const updatedGuesses = [...currentGuesses, newGuess];
        
        const updates = {
            [`players.${botId}.guesses`]: updatedGuesses
        };

        if (finalGuess === secretWord) {
            console.log(`BOT (${botState.username}): KAZANDI!`);
            updates[`players.${botId}.hasSolved`] = true; // <-- Kritik: Veritabanına işlenmeli
            const roundScore = calculateRoundScore(updatedGuesses.length, true);
            updates[`players.${botId}.score`] = (botState.score || 0) + roundScore;
        } else if (updatedGuesses.length >= GUESS_COUNT) {
            console.log(`BOT (${botState.username}): KAYBETTİ!`);
            updates[`players.${botId}.hasFailed`] = true; // <-- Kritik
        }

        try {
            await updateDoc(doc(db, "games", state.getCurrentGameId()), updates);
        } catch (e) {
            console.error("Bot hamlesi yazılamadı:", e);
        }
    }
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

// js/game.js -> startNewRound (DÜZELTİLMİŞ HALİ)

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

    // BATTLE ROYALE MANTIĞI (Aynı kalıyor)
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
            } catch (error) { console.error(error); }
        } else {
            showToast("Oyun kurucunun turu başlatması bekleniyor...", false);
        }
        return; 
    }

    // STANDART MODLAR (Seri / Multi / vsCPU)
    if (localGameData.currentRound >= localGameData.matchLength) {
        if (gameMode === 'multiplayer') leaveGame();
        else startNewGame({ mode: gameMode });
        return;
    }

    const newWordLength = getRandomWordLength();
    const newSecretWord = await getNewSecretWord(newWordLength);
    if (!newSecretWord) return showToast("Yeni kelime alınamadı.", true);

    const newRoundNumber = (localGameData.currentRound || 0) + 1;

    const updates = {
        wordLength: newWordLength, 
        secretWord: newSecretWord, 
        status: 'playing',
        currentRound: newRoundNumber, 
        roundWinner: null, 
        turnStartTime: serverTimestamp(), 
    };

    // Oyuncu durumlarını sıfırla
    Object.keys(localGameData.players).forEach(pid => {
        updates[`players.${pid}.guesses`] = [];
        updates[`players.${pid}.hasSolved`] = false;
        updates[`players.${pid}.hasFailed`] = false;
        updates[`players.${pid}.jokersUsed`] = { present: false, correct: false, remove: false };
    });

    // --- vsCPU GÜNCELLEMESİ BURADA ---
    if (gameMode === 'vsCPU') {
        // Yerel objeyi güncelle
        // vsCPU için turnStartTime'ı Date objesi yapıyoruz (serverTimestamp yerelde çalışmaz)
        updates.turnStartTime = new Date(); 
        
        const newLocalData = { ...localGameData, ...updates };
        
        // Nested player objelerini manuel sıfırla
        Object.keys(newLocalData.players).forEach(pid => {
            newLocalData.players[pid].guesses = [];
            newLocalData.players[pid].hasSolved = false;
            newLocalData.players[pid].hasFailed = false;
        });
        
        state.setLocalGameData(newLocalData);
        showScreen('game-screen');
        initializeGameUI(newLocalData);
        
        // 1. Sayacı Yeniden Başlat (Eksikti)
        startTurnTimer(); 
        
        // 2. CPU Döngüsünü Yeniden Başlat (Eksikti)
        setTimeout(startCpuLoop, 1000);

        await renderGameState(newLocalData);
    } 
    // Multiplayer Modu
    else if (gameMode === 'multiplayer' || gameMode === 'friend' || gameMode === 'random_series') {
         await updateDoc(doc(db, 'games', state.getCurrentGameId()), updates);
    } 
    else {
        startNewGame({ mode: gameMode });
    }
}

// js/game.js -> startTurnTimer GÜNCELLENMİŞ HALİ

// js/game.js -> startTurnTimer (DÜZELTİLMİŞ FİNAL HALİ)

// js/game.js -> startTurnTimer (GÜNCELLENMİŞ)

export function startTurnTimer() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    const currentUserId = state.getUserId(); 

    // Günlük modda veya BR modunda bu sayaç kullanılmaz (BR'nin kendi sayacı var)
    if (isBattleRoyale(gameMode) || gameMode === 'daily') return;
    
    stopTurnTimer(); // Önceki sayacı temizle

    // Eğer oyun 'playing' değilse sayacı çalıştırma
    if (!localGameData || localGameData.status !== 'playing') return;
    
    // Eğer ben oyunu zaten bitirdiysem (Bildim, Elendim veya Hakkım Bitti), sayaç çalışmasın.
    const myState = localGameData.players[currentUserId];
    if (myState && (myState.hasSolved || myState.hasFailed || myState.isEliminated)) {
        if (timerDisplay) timerDisplay.textContent = "0";
        return;
    }

    // --- TARİH DÜZELTMESİ VE GÜVENLİK KONTROLÜ ---
    let turnStartTime;
    const startTimeObj = localGameData.turnStartTime;

    // Eğer veri yoksa veya hatalıysa şu anı baz al (Hata alıp durmasını engeller)
    if (!startTimeObj) {
        console.warn("Zaman verisi yok, sayaç manuel başlatılıyor.");
        turnStartTime = new Date();
    } else if (startTimeObj.toDate) {
        turnStartTime = startTimeObj.toDate(); // Firebase Timestamp
    } else if (startTimeObj instanceof Date) {
        turnStartTime = startTimeObj; // JS Date
    } else {
        turnStartTime = new Date(startTimeObj); // String/Number
    }
    // ----------------------------------------------
    
    const limit = (gameMode === 'league') ? 120 : (localGameData.timeLimit || 45);

    // Sayaç Elementini Görünür Yap (Garanti Olsun)
    if (timerDisplay) {
        timerDisplay.style.display = 'block';
        timerDisplay.textContent = limit; // İlk değer
    }

    // Sayaç Döngüsü
    const updateTimer = async () => {
        let now = new Date();
        let elapsed = Math.floor((now - turnStartTime) / 1000);
        if (elapsed < 0) elapsed = 0;
        let timeLeft = limit - elapsed; 
        
        // Negatif süreleri engelle
        if (timeLeft < 0) timeLeft = 0; 

        if (timerDisplay) { 
            timerDisplay.textContent = timeLeft;
            
            // Son 10 saniye uyarısı
            if (timeLeft <= 10 && timeLeft > 0) {
                timerDisplay.classList.add('text-red-500', 'pulsate');
            } else {
                 timerDisplay.classList.remove('text-red-500', 'pulsate');
            }
        }
        
        // SÜRE BİTTİĞİNDE
        if (timeLeft <= 0) {
            stopTurnTimer(); // Sayacı durdur
            // Sadece ben henüz kaybetmediysem failTurn çağır
            if (myState && !myState.hasFailed && !myState.hasSolved) {
                console.log("Süre bitti, tur başarısız.");
                await failTurn(''); 
            }
        }
    };

    // İlk hesaplama ve başlatma
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
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

// js/game.js -> stopTurnTimer (GÜNCELLENMİŞ HALİ)

export function stopTurnTimer() {
    clearInterval(state.getTurnTimerInterval());
    state.setTurnTimerInterval(null);
    
    // --- EKLEME: Bot Döngüsünü Durdur ---
    if (cpuLoopTimeout) {
        clearTimeout(cpuLoopTimeout);
        cpuLoopTimeout = null;
    }
    // ------------------------------------

    if (timerDisplay) {
        timerDisplay.textContent = '';
        timerDisplay.classList.remove('text-red-500');
    }
    
    if (brTimerDisplay) {
        brTimerDisplay.textContent = '';
        brTimerDisplay.classList.remove('text-red-500');
    }
}

// js/game.js -> leaveGame (GÜNCELLENMİŞ HALİ)

export function leaveGame() {
    console.log("LOG: leaveGame fonksiyonu çalıştı.");
    
    const gameUnsubscribe = state.getGameUnsubscribe();
    if (gameUnsubscribe) gameUnsubscribe();
    
    // --- EKLEME: Bot Döngüsünü Kesin Olarak Durdur ---
    if (cpuLoopTimeout) {
        clearTimeout(cpuLoopTimeout);
        cpuLoopTimeout = null;
    }
    // -------------------------------------------------

    stopTurnTimer(); // Bu fonksiyon zaten yukarıda güncellediğimiz için oradaki temizliği de yapar.
    
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
// === JOKER MANTIK FONKSİYONLARI (ENVANTER SİSTEMİ) ===
// ===================================

// Joker kullanıldığında envanterden düşen fonksiyon
async function consumeJokerItem(itemKey) {
    const currentUserId = state.getUserId();
    const profile = state.getCurrentUserProfile();
    
    if (!profile || !profile.inventory) return false;

    const currentAmount = profile.inventory[itemKey] || 0;
    
    if (currentAmount <= 0) {
        return false; // Yetersiz bakiye
    }

    const newInventory = { ...profile.inventory };
    newInventory[itemKey] = currentAmount - 1;

    // 1. Önce yerel state'i güncelle (Hızlı tepki için)
    const newProfile = { ...profile, inventory: newInventory };
    state.setCurrentUserProfile(newProfile);

    // 2. UI'ı güncelle
    import('./ui.js').then(ui => {
        ui.updateMarketUI(); // Market stok yazısını güncelle
        // Oyun içi buton durumlarını güncelle
        const gameData = state.getLocalGameData();
        const isMyTurn = (gameData.currentPlayerId === currentUserId);
        ui.updateJokerUI(null, isMyTurn, 'playing'); 
    });

    // 3. Veritabanını güncelle (Arka planda)
    try {
        const userRef = doc(db, "users", currentUserId);
        await updateDoc(userRef, { inventory: newInventory });
    } catch (error) {
        console.error("Joker harcama hatası:", error);
        // Hata olursa geri al (opsiyonel, şimdilik basit tutalım)
    }
    
    return true;
}

// 1. TURUNCU KALEM (Harf İpucu)
export async function usePresentJoker() {
    const gameData = state.getLocalGameData();
    if (!gameData || gameData.status !== 'playing') return;

    // Stok Kontrolü
    const profile = state.getCurrentUserProfile();
    const stock = profile?.inventory?.present || 0;
    
    if (stock <= 0) {
        showToast("Turuncu Kalem stokta yok! Kırtasiyeden alabilirsin.", true);
        return;
    }

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

    // Stoktan düş
    const consumed = await consumeJokerItem('present');
    if (!consumed) return;

    const hintLetter = hintCandidates[Math.floor(Math.random() * hintCandidates.length)];
    
    const keyButton = document.querySelector(`.keyboard-key[data-key="${hintLetter}"]`);
    if (keyButton) {
        keyButton.classList.remove('absent'); 
        keyButton.classList.add('present');
        
        keyButton.style.transform = "scale(1.2)";
        keyButton.style.borderColor = "#f59e0b";
        setTimeout(() => { keyButton.style.transform = "scale(1)"; }, 300);
        
        // Hafızaya al (Sarı yanmaya devam etsin)
        import('./state.js').then(s => s.addPresentJokerLetter(hintLetter));
        
        showToast(`İpucu: "${hintLetter}" harfi kelimede var! (Kalan: ${stock-1})`, false);
    }
}

// 2. YEŞİL KALEM (Kesin Harf)
export async function useCorrectJoker() {
    const gameData = state.getLocalGameData();
    if (!gameData || gameData.status !== 'playing') return;

    // Stok Kontrolü
    const profile = state.getCurrentUserProfile();
    const stock = profile?.inventory?.correct || 0;
    
    if (stock <= 0) {
        showToast("Yeşil Kalem stokta yok! Kırtasiyeden alabilirsin.", true);
        return;
    }

    const secretWord = gameData.secretWord;
    const playerState = gameData.players[state.getUserId()];
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

    // Stoktan düş
    const consumed = await consumeJokerItem('correct');
    if (!consumed) return;

    const hintIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    const hintLetter = secretWord[hintIndex];

    knownPositions[hintIndex] = hintLetter;
    setKnownCorrectPositions(knownPositions);

    updateStaticTile(currentRow, hintIndex, hintLetter, 'correct');

    const keyButton = document.querySelector(`.keyboard-key[data-key="${hintLetter}"]`);
    if (keyButton) {
        keyButton.classList.remove('present', 'absent');
        keyButton.classList.add('correct');
        keyButton.style.transform = "scale(1.2)";
        setTimeout(() => { keyButton.style.transform = "scale(1)"; }, 300);
    }

    showToast(`İpucu: ${hintIndex + 1}. harf "${hintLetter}"! (Kalan: ${stock-1})`, false);
}

// js/game.js -> useRemoveJoker (DÜZELTİLMİŞ)

export async function useRemoveJoker() {
    const gameData = state.getLocalGameData();
    if (!gameData || gameData.status !== 'playing') return;

    // Stok Kontrolü
    const profile = state.getCurrentUserProfile();
    const stock = profile?.inventory?.remove || 0;
    
    if (stock <= 0) {
        showToast("Silgi stokta yok! Kırtasiyeden alabilirsin.", true);
        return;
    }

    const secretWord = gameData.secretWord;
    
    const candidates = [];
    document.querySelectorAll('.keyboard-key').forEach(btn => {
        const key = btn.dataset.key;
        
        // --- DÜZELTME BURADA ---
        // Silme (⌫) ve Enter tuşlarını HEDEF ALMA!
        // Sadece harfleri hedef al.
        if (key && key.length === 1 && 
            key !== '⌫' && key !== 'ENTER' && // <-- Bu satır eklendi
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

    // Stoktan düş
    const consumed = await consumeJokerItem('remove');
    if (!consumed) return;

    const countToRemove = Math.min(candidates.length, 4);
    const toRemove = candidates.sort(() => 0.5 - Math.random()).slice(0, countToRemove);

    toRemove.forEach(btn => {
        btn.classList.add('absent');
        btn.style.opacity = "0.3"; 
        btn.style.pointerEvents = "none"; 
    });

    showToast(`${countToRemove} adet yanlış harf elendi! (Kalan: ${stock-1})`, false);
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

        setTimeout(() => {
            // checkLeagueStatus fonksiyonu, kullanıcının kayıtlı olduğunu görüp
            // otomatik olarak Intro'yu gizleyip Dashboard'u (Fikstürü) açacaktır.
            checkLeagueStatus(); 
        }, 2000);

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

// js/game.js -> startLeagueMatch (HATA KORUMALI VERSİYON)

export async function startLeagueMatch(matchId, opponentId, opponentName) {
    const weekID = getCurrentWeekID();
    const userId = state.getUserId();
    
    const matchRef = doc(db, "leagues", weekID, "matches", matchId);
    const matchSnap = await getDoc(matchRef);
    
    let matchData;
    let secretWord;

    // DURUM 1: Maç veritabanında YOKSA -> Oluştur
    if (!matchSnap.exists()) {
        console.log("LOG: Maç veritabanında yok, yeni oluşturuluyor...");
        const len = 5; 
        
        // --- DÜZELTME BURADA: Sunucu Hatasına Karşı Koruma ---
        try {
            // Önce sunucudan istemeyi dene
            secretWord = await getNewSecretWord(len);
        } catch (error) {
            console.warn("Sunucu hatası, yerel kelime seçiliyor:", error);
            // Hata alırsan yerel listeden seç
            secretWord = getRandomLocalWord(len);
        }

        // Eğer sunucu null dönerse yine yerel seç
        if (!secretWord) {
            secretWord = getRandomLocalWord(len);
        }
        // -----------------------------------------------------

        // ID sıralamasına göre P1 ve P2'yi belirle
        const p1 = userId < opponentId ? userId : opponentId;
        const p2 = userId < opponentId ? opponentId : userId;

        matchData = {
            matchId: matchId,
            weekID: weekID,
            p1: p1,
            p2: p2,
            secretWord: secretWord,
            createdAt: serverTimestamp(),
            p1_data: {}, 
            p2_data: {}
        };

        // Veritabanına kaydet
        await setDoc(matchRef, matchData);
    } 
    // DURUM 2: Maç VARSA -> Veriyi çek
    else {
        matchData = matchSnap.data();
        secretWord = matchData.secretWord;

        if (!secretWord) {
            const len = 5;
            // --- BURAYA DA KORUMA EKLEDİK ---
            try {
                secretWord = await getNewSecretWord(len);
            } catch (e) {
                secretWord = getRandomLocalWord(len);
            }
            if(!secretWord) secretWord = getRandomLocalWord(len);
            // -------------------------------
            
            matchData.secretWord = secretWord;
            await setDoc(matchRef, { secretWord: secretWord }, { merge: true });
        }
    }

    // --- OYUNCU VE SÜRE KONTROLÜ ---
    const playerKey = (matchData.p1 === userId) ? 'p1' : 'p2';
    const dataKey = (matchData.p1 === userId) ? 'p1_data' : 'p2_data';
    const startTimeField = `${playerKey}_startedAt`;
    
    let startTime = matchData[startTimeField];
    
    let previousGuesses = [];
    if (matchData[dataKey] && matchData[dataKey].guesses) {
        previousGuesses = matchData[dataKey].guesses;
    }

    if (!startTime) {
        startTime = new Date(); 
        await updateDoc(matchRef, {
            [startTimeField]: serverTimestamp() 
        });
    } else {
        startTime = startTime.toDate ? startTime.toDate() : new Date(startTime);
    }

    // Süre Kontrolü (120 Saniye)
    const now = new Date();
    const elapsed = Math.floor((now - startTime) / 1000);
    const timeLimit = 120;

    if (elapsed >= timeLimit) {
        showToast("Bu maçın süresi dolmuş! Tekrar giremezsiniz.", true);
        return; 
    }

    // Oyunu Başlat
    await startNewGame({
        mode: 'league',
        secretWord: secretWord,
        initialGuesses: previousGuesses
    });

    const localData = state.getLocalGameData();
    localData.leagueMatchId = matchId;
    localData.leagueWeekID = weekID;
    localData.turnStartTime = startTime; 
    localData.currentPlayerId = userId; 
    state.setLocalGameData(localData);

    showToast(`${opponentName} ile maç başladı!`, false);
    
    // Sayaç başlat
    import('./game.js').then(mod => mod.startTurnTimer());
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
        const mainMenuGoldEl = document.getElementById('main-menu-gold-display');
        if (mainMenuGoldEl) mainMenuGoldEl.textContent = newGold;

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
        const mainMenuGoldEl = document.getElementById('main-menu-gold-display');
        if (mainMenuGoldEl) mainMenuGoldEl.textContent = newGold;

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

// js/game.js -> cpuLoop (Yeni Fonksiyon)

// js/game.js -> startCpuLoop (GÜNCELLENMİŞ - GENEL BOT DESTEĞİ)

// js/game.js -> startCpuLoop (DÜZELTİLMİŞ - TEK DÖNGÜ GARANTİSİ)

async function startCpuLoop(botId = 'cpu') {
    // Önceki bekleyen döngüyü iptal et (Üst üste binmeyi önler)
    if (cpuLoopTimeout) clearTimeout(cpuLoopTimeout);

    const localGameData = state.getLocalGameData();
    
    // Oyun bitmişse veya oynanmıyorsa dur
    if (!localGameData || localGameData.status !== 'playing') return;

    // Botun durumunu kontrol et
    const botState = localGameData.players[botId];
    // Bot zaten çözmüşse veya hakkı bitmişse DUR
    if (!botState || botState.hasSolved || botState.hasFailed) {
        console.log(`BOT (${botState?.username}): Zaten bitirdi, döngü durduruldu.`);
        return;
    }

    // Rastgele bekleme süresi: 8 - 12 saniye arası
    const randomDelay = Math.floor(Math.random() * 4000) + 8000;
    
    console.log(`BOT (${botState.username}): Bir sonraki tahmin ${randomDelay / 1000} sn sonra.`);

    // Zamanlayıcıyı değişkene ata ki iptal edebilelim
    cpuLoopTimeout = setTimeout(async () => {
        // Bekleme bittikten sonra tekrar durumu kontrol et
        const currentData = state.getLocalGameData();
        const currentBotState = currentData?.players[botId];

        if (!currentData || currentData.status !== 'playing') return;
        
        // Beklerken bot kazanmışsa veya elenmişse işlem yapma
        if (currentBotState.hasSolved || currentBotState.hasFailed) return;

        await cpuTurn(botId);

        // Döngüyü devam ettir (Recursive)
        startCpuLoop(botId);
    }, randomDelay);
}

// js/game.js -> checkVsCpuGameEnd (BERABERLİK DÜZELTMESİ)

function checkVsCpuGameEnd() {
    const localGameData = state.getLocalGameData();
    const userId = state.getUserId();
    
    const p1 = localGameData.players[userId];
    const cpu = localGameData.players['cpu'];

    if (!p1 || !cpu) return;

    const p1Done = p1.hasSolved || p1.hasFailed;
    const cpuDone = cpu.hasSolved || cpu.hasFailed;

    // İki taraf da bitirdiyse
    if (p1Done && cpuDone) {
        console.log("vsCPU: İki taraf da bitirdi. Oyun sonlanıyor.");
        localGameData.status = 'finished';
        
        // Tur Kazananını Belirle
        if (p1.hasSolved && cpu.hasSolved) {
             // DÜZELTME: Eşitlik durumunda (<=) oyuncuyu kazanan yap. 
             // Böylece "Kimse Bulamadı" hatası çıkmaz.
             if (p1.guesses.length <= cpu.guesses.length) localGameData.roundWinner = userId;
             else localGameData.roundWinner = 'cpu';
        } 
        else if (p1.hasSolved) {
            localGameData.roundWinner = userId;
        } 
        else if (cpu.hasSolved) {
            localGameData.roundWinner = 'cpu';
        } 
        else {
            localGameData.roundWinner = null; // İkisi de bilemedi (Kimse Bulamadı)
        }

        state.setLocalGameData(localGameData);
        stopTurnTimer();
        
        renderGameState(localGameData, true).then(() => {
            setTimeout(() => showScoreboard(localGameData), 1500);
        });
    }
}

// js/game.js dosyasının içine, en alta ekle:

function getRandomLocalWord(length) {
    const lenStr = String(length);
    // allWordList dosyanın en başında import edilmiş olmalı
    const list = allWordList[lenStr] || allWordList["5"]; 
    if (list && list.length > 0) {
        return list[Math.floor(Math.random() * list.length)];
    }
    return "KALEM"; // Hiçbir şey bulunamazsa acil durum kelimesi
}

// js/game.js (EN ALTA EKLE)

// --- BOT İSİM HAVUZU ---
const botNames = [
  "KelimeBaz", "LügatEfendisi", "HarfAvcısı", "BilginBaykuş", "KitapKurdu",
  "GeceMavisi", "RüzgarınOğlu", "SessizFırtına", "Ahmet_1905", "AyşeGül_Tr",
  "MehmetCan", "Zeynep_K", "Mustafa34", "ElifSu", "Burak_Ylmz",
  "DenizMavi", "Cem_Baba", "Sözlükçü", "AkılKüpü", "BulmacaKralı",
  "ŞanslıKedi", "YalnızKurt", "ŞirinPanda", "HızlıLeopar", "DağKeçisi",
  "Gamer_Tr", "ProOyuncu", "Winner_01", "Efsane", "KralTac",
  "Joker", "Neo", "Matrix", "KaptanPilot", "MaviBere",
  "SonSavaşçı", "GölgeHaramisi", "YıldızTozu", "Çaylak", "Uykusuz",
  "Profesör", "Editör", "YazarÇizer", "OkurYazar", "Heceleme",
  "Alfabe", "KlavyeDelisi", "EkranKoruyucu", "SanalZeka", "Piksel"
];

function getRandomBotName() {
    const randomIndex = Math.floor(Math.random() * botNames.length);
    return botNames[randomIndex];
}

// --- BOT OYUNCUYU OYUNA DAHİL ETME ---
async function assignBotToGame(gameId) {
    const botId = 'bot_' + Date.now(); // Benzersiz bir ID oluştur
    const botName = getRandomBotName();
    
    console.log(`LOG: 45sn doldu. Bot atanıyor: ${botName}`);

    const gameRef = doc(db, "games", gameId);
    
    // Bot için oyuncu verisi
    const botPlayerState = { 
        username: botName, 
        guesses: [], 
        score: 0, 
        jokersUsed: { present: false, correct: false, remove: false },
        isBot: true // <-- KRİTİK: Bu bayrak sayesinde yapay zeka devreye girecek
    };

    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;
            
            const gameData = gameDoc.data();
            
            // Eğer son anda gerçek biri girdiyse iptal et
            if (Object.keys(gameData.players).length >= 2) {
                console.log("LOG: Gerçek oyuncu girdiği için bot iptal edildi.");
                return;
            }

            const updates = {
                [`players.${botId}`]: botPlayerState,
                playerIds: arrayUnion(botId),
                status: 'playing',
                turnStartTime: serverTimestamp(),
                invitedPlayerId: deleteField()
            };
            
            transaction.update(gameRef, updates);
        });
    } catch (error) {
        console.error("Bot atama hatası:", error);
    }
}

// js/game.js (EN ALTA EKLE)

// --- HIZLI ARKADAŞ OYUNU BAŞLATMA ---
export async function startQuickFriendGame(friendId) {
    if (!friendId) return;

    showToast("Oyun oluşturuluyor...", false);

    // Ayar ekranını atla, direkt standart ayarlarla kur
    await createGame({
        invitedFriendId: friendId,
        timeLimit: 120, // İsteğin üzerine 120 saniye
        matchLength: 5, // İsteğin üzerine 5 Tur
        gameType: 'friend' // Arkadaş modu
    });
    
    // createGame fonksiyonu zaten otomatik olarak oyun ekranını açıyor 
    // ve updateTurnDisplay fonksiyonu "Arkadaşın bekleniyor" yazısını gösteriyor.
}

// js/game.js (EN ALTA EKLE)

// --- LİGE BOT EKLEME (DEV TOOLS) ---
export async function populateLeagueWithBots() {
    const weekID = getCurrentWeekID();
    const botsToAdd = [];
    const usedIndices = new Set();

    // 15 adet benzersiz bot ismi seç
    // (botNames dizisi js/game.js içinde tanımlı olmalı)
    while (botsToAdd.length < 15) {
        const randomIndex = Math.floor(Math.random() * botNames.length);
        if (!usedIndices.has(randomIndex)) {
            usedIndices.add(randomIndex);
            botsToAdd.push(botNames[randomIndex]);
        }
        // Eğer 50 isimden az kaldıysa döngü sonsuza girmesin
        if (usedIndices.size >= botNames.length) break;
    }

    console.log("Lige eklenecek botlar:", botsToAdd);
    showToast("Botlar lige ekleniyor...", false);

    // Hepsini veritabanına kaydet
    const promises = botsToAdd.map((name, index) => {
        // Bot için benzersiz ID (bot_league_zaman_sıra)
        const botId = `bot_league_${Date.now()}_${index}`;
        
        const botData = {
            username: name,
            joinedAt: serverTimestamp(),
            score: 0,
            isBot: true, // Bot olduğunu işaretle
            stats: { O: 0, G: 0, B: 0, M: 0, P: 0 } // Başlangıç istatistikleri
        };
        
        // Katılımcılar koleksiyonuna ekle
        return setDoc(doc(db, "leagues", weekID, "participants", botId), botData);
    });

    try {
        await Promise.all(promises);
        showToast("✅ 15 Bot başarıyla lige eklendi!");
        
        // Ekranı yenilemek için lig durumunu tekrar kontrol et
        checkLeagueStatus();
        
    } catch (error) {
        console.error("Bot ekleme hatası:", error);
        showToast("Bot eklenirken hata oluştu.", true);
    }
}