// js/game.js - FİNAL SÜRÜM (Next Round Buton Fix)

// Firebase v9'dan gerekli modülleri içe aktar
import { 
    db, 
    getNewSecretWord, 
    checkWordValidity, 
    submitMultiplayerGuess, 
    failMultiplayerTurn, 
    getWordMeaning, 
    startNextBRRound,
    auth,                   // <--- BUNU EKLE (Eğer yoksa)
    sendPasswordResetEmail  // <--- BUNU EKLE (Şifre sıfırlama için şart)
} from './firebase.js';

// Firestore modüllerini içe aktar
import {
    collection, query, where, limit, getDocs, getDoc, doc, setDoc, updateDoc,
    runTransaction, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, 
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

let cpuLoopTimeout = null; 

import { showToast, playSound, shakeCurrentRow, getStatsFromProfile, createElement, triggerConfetti } from './utils.js';

// YENİ BR LOBİ ELEMENTLERİ (index.html'den manuel yakalananlar)
const brLobbyControls = document.getElementById('br-lobby-controls');
const brLobbyInviteBtn = document.getElementById('br-lobby-invite-btn');
const brLobbyStartBtn = document.getElementById('br-lobby-start-btn');
const brLobbyStatusText = document.getElementById('br-lobby-status-text');

import { 
    showScreen, createGrid, createKeyboard, updateKeyboard, getUsername, displayStats, guessGrid, 
    brTimerDisplay, brTurnDisplay, brRoundCounter,
    shareGameBtn, startGameBtn, keyboardContainer, updateMultiplayerScoreBoard,
    updateJokerUI,
    timerDisplay, gameIdDisplay, roundCounter,
    updateStaticTile, 
    clearStaticTiles, openKelimeligScreen, dailyGameTitle 
} from './ui.js';

import { default as allWordList } from '../functions/kelimeler.json'; 

// ===================================================
// === SKOR TABLOSU VE OYUN SONU ===
// ===================================================

export async function showScoreboard(gameData) {
    console.log("Skor tablosu açılıyor..."); 
    stopTurnTimer();
    
    // 1. Ekran Değişimi
    showScreen('scoreboard-screen');

    // 2. Elementleri Seç
    const roundWinnerDisplay = document.getElementById('round-winner-display');
    const matchWinnerDisplay = document.getElementById('match-winner-display');
    const correctWordDisplay = document.getElementById('correct-word-display');
    const meaningDisplay = document.getElementById('word-meaning-display');
    const finalScores = document.getElementById('final-scores');
    
    const newRoundBtn = document.getElementById('new-round-btn');
    const newWordRematchBtn = document.getElementById('new-word-rematch-btn');
    const mainMenuBtn = document.getElementById('main-menu-btn');

    const currentUserId = state.getUserId();
    
    // 3. Temizlik
    if (finalScores) finalScores.innerHTML = '';
    if (newRoundBtn) newRoundBtn.classList.add('hidden');
    if (newWordRematchBtn) newWordRematchBtn.classList.add('hidden');
    if (matchWinnerDisplay) matchWinnerDisplay.classList.add('hidden');

    // 4. Maç Bitti mi Kontrolü
    const currentRound = gameData.currentRound || 1;
    const totalRounds = gameData.matchLength || (gameData.gameType === 'multiplayer-br' ? 10 : 1);
    
    let isMatchFinished = false;
    if (gameData.gameType === 'multiplayer-br') {
        isMatchFinished = (currentRound >= totalRounds) || (gameData.matchWinnerId !== undefined);
    } else {
        isMatchFinished = (totalRounds > 1 && currentRound < totalRounds) ? false : true;
    }

    // 5. Başlık Mesajını Belirle
    let titleText = "";
    let titleColor = "";

    if (gameData.gameType === 'multiplayer-br') {
        if (isMatchFinished) {
            titleText = "OYUN TAMAMLANDI";
            titleColor = "text-yellow-400";
            playSound('win');
        } else {
            const myState = gameData.players[currentUserId];
            if (myState && myState.hasSolved) {
                titleText = "BİLDİNİZ! 👏";
                titleColor = "text-green-400";
                playSound('win');
            } else {
                titleText = "BİLEMEDİNİZ";
                titleColor = "text-red-400";
                playSound('lose');
            }
        }
    } else {
        const isMyTurnWinner = gameData.roundWinner === currentUserId;
        const winnerName = gameData.roundWinner ? (gameData.players[gameData.roundWinner]?.username || 'Rakip') : 'Kimse';

        if (isMyTurnWinner) {
            titleText = "TEBRİKLER! 🎉";
            titleColor = "text-green-400";
            playSound('win');
        } else if (gameData.roundWinner === null) {
            titleText = "SÜRE BİTTİ / BERABERE";
            titleColor = "text-gray-400";
            playSound('lose');
        } else {
            titleText = `${winnerName} KAZANDI`;
            titleColor = "text-red-400";
            playSound('lose');
        }
    }
    if (titleColor === "text-green-400" || titleColor === "text-yellow-400") {
        triggerConfetti();
    }
    if (roundWinnerDisplay) {
        roundWinnerDisplay.textContent = titleText;
        roundWinnerDisplay.className = `text-3xl font-black mb-2 tracking-wide uppercase drop-shadow-md ${titleColor}`;
    }

    // 6. Kelime ve Anlamı
    if (correctWordDisplay) correctWordDisplay.textContent = gameData.secretWord;
    if (meaningDisplay) {
        meaningDisplay.textContent = "Anlam yükleniyor...";
        fetchWordMeaning(gameData.secretWord).then(mean => {
            meaningDisplay.textContent = mean;
        });
    }
    setupDictionaryButton(gameData.secretWord);

    // 7. Puan Tablosu
    if (finalScores) {
        finalScores.innerHTML = ''; // Önce temizle

        // --- GÜNCELLEME: Hem 'daily' HEM DE 'league' modunda bu listeyi GİZLE ---
        // Sadece çoklu oyunculu veya arkadaş maçlarında gösterilir
        if (gameData.gameType !== 'daily' && gameData.gameType !== 'league') {
            
            const playersArr = Object.values(gameData.players).sort((a, b) => (b.score || 0) - (a.score || 0));
            playersArr.forEach((p, index) => {
                const isMe = p.username === getUsername();
                const row = document.createElement('div');
                row.className = `flex justify-between items-center p-2 rounded ${isMe ? 'bg-indigo-900/50 border border-indigo-500/50' : 'bg-gray-800 border-b border-gray-700'}`;
                row.innerHTML = `
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-gray-500 w-4">${index + 1}.</span>
                        <span class="font-bold ${isMe ? 'text-white' : 'text-gray-300'}">${p.username}</span>
                    </div>
                    <span class="font-mono font-bold text-yellow-400">${p.score || 0} P</span>
                `;
                finalScores.appendChild(row);
            });
        }
    }

    // 8. Buton Yönetimi
    if (isMatchFinished) {
        // --- MAÇ BİTTİ ---
        if (matchWinnerDisplay) {
            matchWinnerDisplay.classList.remove('hidden');
            matchWinnerDisplay.textContent = "MAÇ SONA ERDİ";
        }

        if (newRoundBtn) {
            newRoundBtn.classList.remove('hidden');
            newRoundBtn.disabled = false;

            // SENARYO 1: GÜNÜN KELİMESİ İSE -> İSTATİSTİK BUTONU
            if (gameData.gameType === 'daily') {
                newRoundBtn.textContent = "📊 İstatistikler";
                newRoundBtn.className = "w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-lg text-lg shadow-lg transition";
                
                newRoundBtn.onclick = async () => {
                    newRoundBtn.textContent = "Yükleniyor...";
                    newRoundBtn.disabled = true;

                    try {
                        const profile = state.getCurrentUserProfile();
                        const stats = getStatsFromProfile(profile);
                        
                        // Verileri taze taze çekelim
                        const rankData = await getDailyLeaderboardStats(state.getUserId(), gameData.secretWord);
                        const weeklyData = await getLast7DaysStats(state.getUserId());
                        
                        let globalWeeklyData = { avgScore: 0, avgGuesses: 0 };
                        try { globalWeeklyData = await getGlobalWeeklyStats(); } catch(e) {}

                        import('./ui.js').then(ui => {
                            ui.openDailyResultModal(stats, {
                                userScore: rankData?.userScore || 0,
                                userGuessCount: gameData.players[currentUserId]?.guesses.length || 0,
                                avgScore: rankData?.avgScore || '-',
                                avgGuesses: rankData?.avgGuesses || '-',
                                weeklyUserScore: weeklyData.avgScore,
                                weeklyUserGuesses: weeklyData.avgGuesses,
                                weeklyGlobalScore: globalWeeklyData.avgScore,
                                weeklyGlobalGuesses: globalWeeklyData.avgGuesses,
                                userPosition: rankData?.userPosition || 0,
                                totalPlayers: rankData?.totalPlayers || 0
                            });
                        });
                    } catch (e) {
                        console.error(e);
                    } finally {
                        newRoundBtn.textContent = "📊 İstatistikler";
                        newRoundBtn.disabled = false;
                    }
                };
            } 
            // SENARYO 2: LİG MAÇI İSE -> FİKSTÜR BUTONU (YENİ)
            else if (gameData.gameType === 'league') {
                newRoundBtn.textContent = "🏆 Lig Fikstürü";
                newRoundBtn.className = "w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 px-4 rounded-lg text-lg shadow-lg transition";
                
                newRoundBtn.onclick = () => {
                    // Lig ekranını aç ve verileri yenile
                    import('./ui.js').then(ui => ui.showScreen('kelimelig-screen'));
                    checkLeagueStatus(); // Fikstürü yeniden çeker
                };
            }
            // SENARYO 3: DİĞER MODLAR (vsCPU, Arkadaş vb.) -> ANA MENÜ BUTONU
            else {
                newRoundBtn.textContent = "Ana Menü";
                newRoundBtn.className = "w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-lg text-lg shadow-lg transition";
                newRoundBtn.onclick = leaveGame;
            }
        }
    } else {
        // --- SONRAKİ TUR (Oyun Devam Ediyor) ---
        if (newRoundBtn) {
            newRoundBtn.disabled = false;
            newRoundBtn.style.opacity = "1";
            newRoundBtn.style.cursor = "pointer";
            newRoundBtn.textContent = "Sonraki Tur";
            
            newRoundBtn.onclick = async () => {
                // BR modunda sadece kurucu başlatabilir
                if (gameData.gameType === 'multiplayer-br' && gameData.creatorId !== currentUserId) {
                    showToast("Oyun kurucunun turu başlatması bekleniyor...", false);
                    return;
                }
                newRoundBtn.disabled = true;
                newRoundBtn.textContent = "Hazırlanıyor...";
                try {
                    await startNewRound();
                } catch (error) {
                    console.error("Yeni tur hatası:", error);
                    showToast("Bir hata oluştu, tekrar dene.", true);
                    newRoundBtn.disabled = false;
                    newRoundBtn.textContent = "Tekrar Dene";
                }
            };
            newRoundBtn.classList.remove('hidden');
            newRoundBtn.className = "w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg text-lg shadow-lg transition";
        }
    }

    if (mainMenuBtn) {
        mainMenuBtn.onclick = leaveGame;
    }
    // Eğer oyunu ben kazandıysam veya "BİLDİNİZ" durumu varsa
    const myId = state.getUserId();
    const amIWinner = (gameData.roundWinner === myId) || (gameData.matchWinnerId === myId);
    
    // Battle Royale'de kazanan veya Teklide kazanan veya Günün Kelimesini bilen
    if (amIWinner || titleText === "BİLDİNİZ! 👏" || titleText === "TEBRİKLER! 🎉") {
        console.log("Konfeti tetikleniyor! 🎉"); // Konsoldan takip et
        triggerConfetti();
    }
}

// ===================================================
// === ANLAM GETİRME FONKSİYONLARI ===
// ===================================================

let localMeanings = null;

async function getLocalMeanings() {
    if (localMeanings) return localMeanings; 
    try {
        const response = await fetch('/kelime_anlamlari.json'); 
        if (!response.ok) throw new Error('Yerel anlam dosyası bulunamadı.');
        localMeanings = await response.json();
        return localMeanings;
    } catch (error) {
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
        return "Anlam yüklenirken bir sorun oluştu.";
    }
}

// ===================================================
// === OYUN İÇİ DEĞİŞKENLER VE YARDIMCILAR ===
// ===================================================
const GUESS_COUNT = 6;
const MAX_BR_PLAYERS = 8;
let wordLength = 5;

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
    if (gameData.secretWord && gameData.secretWord.length > 0) {
        if (gameData.wordLength !== gameData.secretWord.length) {
            gameData.wordLength = gameData.secretWord.length;
        }
    }
    wordLength = gameData.wordLength;
    
    if (guessGrid) {
        guessGrid.innerHTML = ''; 
        guessGrid.classList.remove('br-mode-grid');
        if (gameData.gameType === 'multiplayer-br') {
            guessGrid.classList.add('br-mode-grid');
        } else {
            
        }
        
        if (wordLength === 4) guessGrid.style.maxWidth = '220px';
        else if (wordLength === 5) guessGrid.style.maxWidth = '260px'; 
        else guessGrid.style.maxWidth = '300px'; 
    }
    
    createGrid(wordLength, GUESS_COUNT);
    createKeyboard(handleKeyPress);

    const gameMode = state.getGameMode();
    
    if (gameData.status === 'playing' && gameMode !== 'daily') {
        setTimeout(() => {
            startTurnTimer();
        }, 200);
    }

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
}

// js/game.js -> updateTurnDisplay (HATASIZ HALİ)

export function updateTurnDisplay(gameData) {
    if (!startGameBtn || !shareGameBtn) return;

    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const isCreator = gameData.creatorId === currentUserId; 
    
    // Lig modunda işlem yapma
    if (gameMode === 'league') return;
    
   // --- BATTLE ROYALE MODU ---
    if (gameMode === 'multiplayer-br') {
        // Standart butonları gizle
        if (startGameBtn) startGameBtn.classList.add('hidden');
        if (shareGameBtn) shareGameBtn.classList.add('hidden');
        // Genel davet butonunu da gizle
        const inviteToLobbyBtn = document.getElementById('invite-to-lobby-btn');
        if (inviteToLobbyBtn) inviteToLobbyBtn.classList.add('hidden');
        
        if (!brTimerDisplay || !brTurnDisplay || !brLobbyControls) return;
        
        brTimerDisplay.textContent = gameData.timeLimit || 60;
        const numPlayers = Object.keys(gameData.players).length;
        const isCreator = gameData.creatorId === currentUserId;
        const isPrivate = gameData.visibility === 'private';
        const playerState = gameData.players[currentUserId] || {};

        if (gameData.status === 'waiting') {
            // Lobi Arayüzünü göster
            brLobbyControls.classList.remove('hidden');
            
            if (brLobbyStatusText) brLobbyStatusText.textContent = `Oyuncular bekleniyor (${numPlayers}/${gameData.maxPlayers || 8})`;
            brTurnDisplay.textContent = `Lobi (${numPlayers}/${gameData.maxPlayers || 8})`; // Üstteki küçük skor alanı için

            if (isCreator) {
                // Kurucu ise: Davet butonu sadece özel odalarda görünür
                brLobbyInviteBtn.classList.toggle('hidden', !isPrivate);
                if (brLobbyInviteBtn) brLobbyInviteBtn.onclick = () => import('./ui.js').then(ui => ui.openLobbyInviteModal());
                
                // Kurucu ise: 2 veya daha fazla oyuncu varsa Başlat butonu görünür
                brLobbyStartBtn.classList.remove('hidden');
                
                if (numPlayers >= 2) {
                    brLobbyStartBtn.onclick = startGame; // startGame fonksiyonu zaten var
                    brLobbyStartBtn.textContent = `Oyunu Başlat (${numPlayers} Kişi)`;
                    brLobbyStartBtn.classList.remove('bg-gray-600', 'text-gray-400');
                    brLobbyStartBtn.classList.add('bg-green-600', 'hover:bg-green-500');
                    brLobbyStartBtn.disabled = false;
                } else {
                    brLobbyStartBtn.textContent = `Oyuncu Bekleniyor...`;
                    brLobbyStartBtn.classList.add('bg-gray-600', 'text-gray-400');
                    brLobbyStartBtn.classList.remove('bg-yellow-500', 'hover:bg-yellow-600', 'bg-green-600', 'hover:bg-green-500');
                    brLobbyStartBtn.disabled = true;
                }
            } else {
                // Kurucu değilse, sadece bekleme metni. Butonlar gizli.
                brLobbyInviteBtn.classList.add('hidden');
                brLobbyStartBtn.classList.add('hidden');
            }

        } else if (gameData.status === 'playing') {
            // Oyun başladığında lobi elementlerini gizle
            brLobbyControls.classList.add('hidden');
            
            // Oyuncu durumu
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
            
        } else if (gameData.status === 'finished') {
            brLobbyControls.classList.add('hidden');
            if(gameData.matchWinnerId !== undefined) brTurnDisplay.textContent = "👑 MAÇ BİTTİ!";
            else brTurnDisplay.textContent = "TUR BİTTİ";
        }
        return;
    }
    
    // --- STANDART VE SERİ OYUN MODLARI ---
// ... devam eden kod
    
    // --- STANDART VE SERİ OYUN MODLARI ---
    // Sadece butonları yönetiyoruz, yazı yazmıyoruz.

    if (gameMode === 'daily') return;

    if (gameData.status === 'waiting' || gameData.status === 'invited') {
        const numPlayers = Object.keys(gameData.players).length;
        if (isCreator) {
            startGameBtn.classList.remove('hidden');
            if (numPlayers < 2 && gameMode !== 'vsCPU') {
                startGameBtn.disabled = true; 
                startGameBtn.textContent = "Oyuncu Bekleniyor...";
                startGameBtn.className = "w-full bg-gray-600 text-gray-400 font-bold py-3 px-4 rounded-lg text-lg my-1 flex-shrink-0 cursor-not-allowed";
            } else {
                startGameBtn.disabled = false;
                startGameBtn.textContent = "Oyunu Başlat";
                startGameBtn.className = "w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg text-lg my-1 flex-shrink-0 cursor-pointer";
                startGameBtn.onclick = startGame; 
            }
        } else {
            startGameBtn.classList.add('hidden');
        }
        shareGameBtn.classList.remove('hidden');
    } 
    else if (gameData.status === 'playing' || gameData.status === 'finished') {
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.add('hidden');
    }
}

// js/game.js -> renderGameState (TUR SAYACI DÜZELTİLMİŞ HALİ)

// js/game.js -> renderGameState (KESİN ÇÖZÜM)

export async function renderGameState(gameData, didMyGuessChange = false) {
    if (!gameData) return;

    const currentUserId = state.getUserId();
    const gameMode = state.getGameMode();
    const isBR = (gameMode === 'multiplayer-br');

    const oldGameData = state.getLocalGameData();
    const oldPlayerId = oldGameData?.currentPlayerId;
    const isMyTurnNow = gameData.currentPlayerId === currentUserId;

    if (!isBR && gameMode !== 'vsCPU' && oldPlayerId && oldPlayerId !== currentUserId && isMyTurnNow) {
        import('./utils.js').then(u => u.playSound('turn'));
    }

    // --- BAŞLIK KONTROLÜ (GÜNÜN KELİMESİ) ---
    if (dailyGameTitle) {
        if (gameMode === 'daily') dailyGameTitle.classList.remove('hidden');
        else dailyGameTitle.classList.add('hidden');
    }

    // ELEMENTLERİ SEÇ
    const sequentialGameInfo = document.getElementById('sequential-game-info');
    const jokerContainer = document.getElementById('joker-container');
    const copyBtn = document.getElementById('copy-game-id-btn');
    const shareBtn = document.getElementById('share-game-btn');
    const gameIdDisplay = document.getElementById('game-id-display');
    const leaveBtn = document.getElementById('leave-game-button');
    const multiplayerScoreBoard = document.getElementById('multiplayer-score-board');
    const timerDisplay = document.getElementById('timer-display');
    const roundCounter = document.getElementById('round-counter');
    const keyboardContainer = document.getElementById('keyboard');
    
    // --- SKOR ELEMENTLERİ ---
    const p1Score = document.getElementById('player1-score');
    const p2Score = document.getElementById('player2-score');
    const gameInfoBar = document.getElementById('game-info-bar');

    // 1. OYUN TÜRÜNE GÖRE GÖRÜNÜM AYARLARI
    
    // A) BATTLE ROYALE MODU
    if (isBR) {
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.remove('hidden');
        if (sequentialGameInfo) sequentialGameInfo.classList.add('hidden');
        if (jokerContainer) jokerContainer.style.display = 'flex';
        import('./ui.js').then(ui => ui.updateMultiplayerScoreBoard(gameData));
    } 
    
    // B) LİG MODU (SADE VE TEMİZ)
    else if (gameMode === 'league') {
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.add('hidden');
        if (sequentialGameInfo) sequentialGameInfo.classList.remove('hidden');
        
        // Puanları ve Tur Sayacını GİZLE
        if (p1Score) p1Score.style.display = 'none';
        if (p2Score) p2Score.style.display = 'none';
        if (roundCounter) roundCounter.style.display = 'none';
        
        if (jokerContainer) jokerContainer.style.display = 'flex'; 

        // Timer'ı büyüt
        if (timerDisplay) {
            timerDisplay.style.display = 'block';
            if(timerDisplay.parentElement) timerDisplay.parentElement.className = "w-full flex justify-center items-center";
            timerDisplay.className = 'font-mono font-black text-6xl text-yellow-400 tracking-widest drop-shadow-lg';
        }
        
        if (gameInfoBar) gameInfoBar.style.display = 'none';
    }

    // C) GÜNÜN KELİMESİ
    else if (gameMode === 'daily') {
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.add('hidden');
        if (sequentialGameInfo) sequentialGameInfo.classList.remove('hidden');
        
        // İsimleri Gizle, Tarihi Göster
        if (p1Score) p1Score.style.display = 'none';
        if (p2Score) p2Score.style.display = 'none';

        if (roundCounter) { 
            roundCounter.style.display = 'block'; 
            roundCounter.textContent = new Date().toLocaleDateString('tr-TR'); 
        }
        if (timerDisplay && timerDisplay.parentElement) timerDisplay.parentElement.className = "text-center w-1/5";
        
        if (gameInfoBar) gameInfoBar.style.display = 'none';
        if (jokerContainer) jokerContainer.style.display = 'none'; 
    }

    // D) STANDART MODLAR (SERİ OYUN, ARKADAŞ, vsCPU)
    else {
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.add('hidden');
        if (sequentialGameInfo) sequentialGameInfo.classList.remove('hidden');

        // --- İŞTE BURASI: İSİM VE PUANLARI ZORLA AÇIYORUZ ---
        if (p1Score) p1Score.style.display = 'block';
        if (p2Score) p2Score.style.display = 'block';
        // ----------------------------------------------------
        
        // Puanları Güncelle (UI'dan çağırarak)
        import('./ui.js').then(ui => ui.updateMultiplayerScoreBoard(gameData));

        // Tur Sayacını Göster
        if (roundCounter) {
            roundCounter.style.display = 'block';
            if (gameData.gameType === 'random_loose') {
                roundCounter.textContent = "Gevşek Oyun";
            } else {
                const current = gameData.currentRound || 1;
                const total = gameData.matchLength || 1;
                roundCounter.textContent = `Tur ${current}/${total}`;
            }
        }

        if (jokerContainer) jokerContainer.style.display = 'flex';

        if (timerDisplay) {
            timerDisplay.style.display = 'block';
            timerDisplay.className = 'font-bold text-xl font-mono text-gray-300';
            if(timerDisplay.parentElement) timerDisplay.parentElement.className = "text-center w-1/5 flex flex-col items-center";
        }
        
        // vsCPU Çıkış butonu ayarı
        if (gameMode === 'vsCPU') {
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
        }
    }

    // MENÜ BUTONU (Genel)
    if (leaveBtn) {
        if (gameMode !== 'vsCPU') { 
            leaveBtn.classList.remove('hidden');
            leaveBtn.className = "bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded text-sm absolute top-3 right-3 z-50";
            leaveBtn.textContent = "Menü";
            leaveBtn.onclick = (e) => {
                e.stopPropagation();
                import('./game.js').then(m => m.leaveGame());
            };
        } else {
             leaveBtn.classList.remove('hidden'); 
        }
    }

    // KLAVYE KİLİDİ KONTROLÜ
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

    // BUTONLARI GÜNCELLE
    updateTurnDisplay(gameData); 
    
    // KLAVYEYİ GÜNCELLE
    import('./ui.js').then(ui => {
        if(ui.updateKeyboard) ui.updateKeyboard(gameData);
    });

    // TAHTAYI GÜNCELLE
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
                
                if (i !== currentRow) { 
                     tile.classList.remove('flip', 'correct', 'present', 'absent', 'failed', 'shake', 'static');
                     if(!playerGuesses[i]) {
                        front.textContent = '';
                        back.textContent = '';
                        back.className = 'tile-inner back';
                     }
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
    
    // RAKİP KÜÇÜK IZGARASI
    const isVersusMode = (gameMode === 'multiplayer' || gameMode === 'vsCPU' || gameMode === 'friend' || gameMode === 'random_series') && !isBR;
    
    if (isVersusMode && sequentialGameInfo && !sequentialGameInfo.classList.contains('hidden')) {
        let opponentId = Object.keys(gameData.players).find(id => id !== currentUserId);
        if (gameMode === 'vsCPU') opponentId = 'cpu';

        if (opponentId && gameData.players[opponentId]) {
            const oppGuesses = gameData.players[opponentId].guesses || [];
            import('./ui.js').then(ui => {
                if(ui.updateOpponentMiniGrid) ui.updateOpponentMiniGrid(oppGuesses, gameData.wordLength, 6);
            });
            const miniGrid = document.getElementById('opponent-mini-grid');
            if(miniGrid) miniGrid.classList.remove('hidden');
        }
    } else {
        const miniGrid = document.getElementById('opponent-mini-grid');
        if (miniGrid) miniGrid.classList.add('hidden');
    }
    
    // Joker UI Güncelle
    const playerJokers = gameData.players[currentUserId]?.jokersUsed || {};
    import('./ui.js').then(ui => {
        if (ui.updateJokerUI) ui.updateJokerUI(playerJokers, !shouldLockKeyboard, gameData.status);
    });
}

function updateKnownPositions(playerGuesses) {
    if (!playerGuesses || playerGuesses.length === 0) {
        return state.getKnownCorrectPositions() || {};
    }

    const currentKnown = state.getKnownCorrectPositions() || {};
    const newPositions = { ...currentKnown }; 

    playerGuesses.forEach(guess => {
        guess.colors.forEach((color, index) => {
            if (color === 'correct') {
                newPositions[index] = guess.word[index];
            }
        });
    });
    
    state.setKnownCorrectPositions(newPositions);
    return newPositions;
}

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

        const isGameJustStarted = (oldGameData?.status === 'waiting' || oldGameData?.status === 'invited') && gameData.status === 'playing';
        
        if (isGameJustStarted) {
            const matchmakingScreen = document.getElementById('matchmaking-screen');
            if (matchmakingScreen && !matchmakingScreen.classList.contains('hidden')) {
                showScreen('game-screen');
            }
            initializeGameUI(gameData);
            
            setTimeout(() => {
                if (gameData.gameType === 'multiplayer-br') {
                    console.log("BR Sayacı başlatılıyor...");
                    startBRTimer(); 
                } else {
                    console.log("Standart sayaç başlatılıyor...");
                    startTurnTimer(); 
                }
            }, 500);
        }

        if (gameData.status === 'playing') {
            const opponentId = Object.keys(gameData.players).find(id => id !== currentUserId);
            const opponentData = gameData.players[opponentId];
            
            if (opponentData && opponentData.isBot && gameData.creatorId === currentUserId) {
                startCpuLoop(opponentId); 
            }
        }

        state.setLocalGameData(gameData); 
        
        // Sadece oyun oynanıyorken kontrol et
        if (gameData.status === 'playing') {
            const timeLimit = (gameData.gameType === 'league' ? 120 : (gameData.timeLimit || 60));
            const now = new Date();
            
            // Başlangıç zamanını güvenli çevir
            let startTime = gameData.turnStartTime;
            if (startTime && startTime.toDate) startTime = startTime.toDate();
            else if (!(startTime instanceof Date)) startTime = new Date(); // Hatalıysa şu anı al

            // Geçen saniyeyi hesapla
            const elapsedSeconds = (now - startTime) / 1000;

            // Eğer süre sınırını 5 saniye geçtiyse ve oyun hala bitmediyse
            // (5 saniye tolerans payı bırakıyoruz ki internet yavaşlığı yüzünden çakışma olmasın)
            if (elapsedSeconds > (timeLimit + 5)) {
                console.warn("⚠️ ZAMAN AŞIMI ALGILANDI! Tur zorla bitiriliyor...");
                
                // Bunu sadece Creator veya alfabetik olarak ID'si önde olan yapsın (Çakışmayı önlemek için)
                // Ama basitlik adına: Herkes deneyebilir, Firestore transaction korur veya son yazan kazanır.
                // Biz sadece kendi client'ımızda tetikleyelim, zaten failTurn sunucuya yazar.
                
                const myPlayer = gameData.players[currentUserId];
                // Eğer ben hala çözmediysem ve hakkım bitmediyse -> failTurn çağır
                if (myPlayer && !myPlayer.hasSolved && !myPlayer.hasFailed) {
                    failTurn(); 
                } 
                
                // Eğer ben işimi bitirdiysem ama rakip yüzünden bekliyorsam
                // Rakibi 'failed' olarak işaretlemek için yetki kullan
                // NOT: Bu kısım güvenlik kurallarına takılabilir ama basit oyunlarda çalışır.
                else if (gameData.creatorId === currentUserId) {
                    // Kurucu yetkisiyle donmuş oyuncuları yak
                    Object.keys(gameData.players).forEach(pid => {
                        const p = gameData.players[pid];
                        if (!p.hasSolved && !p.hasFailed) {
                            // Bu oyuncu zaman aşımına uğramış, sunucuyu güncelle
                            updateDoc(gameRef, {
                                [`players.${pid}.hasFailed`]: true
                            }).catch(e => console.log("Zaman aşımı force update hatası", e));
                        }
                    });
                }
            }
        }
        // --- ZAMAN AŞIMI KONTROLÜ BİTİŞ ---

        if (gameData.players && gameData.players[currentUserId]) {
            updateKnownPositions(gameData.players[currentUserId].guesses);
        }

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
                    
                    let updates = {};
                    
                    if (gameData.gameType === 'multiplayer-br') {
                        if (gameData.currentRound >= (gameData.matchLength || 10)) {
                             const playersArr = Object.values(gameData.players);
                             playersArr.sort((a, b) => (b.score || 0) - (a.score || 0));
                             const winner = playersArr[0]; 
                             
                             updates = { 
                                 status: 'finished', 
                                 matchWinnerId: winner.userId || Object.keys(gameData.players).find(key => gameData.players[key] === winner)
                             };
                        } else {
                             updates = { status: 'finished' };
                        }
                    } 
                    else {
                        const playersArr = Object.entries(gameData.players).map(([key, val]) => ({ ...val, userId: key }));
                        const solvers = playersArr.filter(p => p.hasSolved);
                        let winnerId = null;
                        
                        if (solvers.length > 0) {
                            solvers.sort((a, b) => (a.guesses ? a.guesses.length : 99) - (b.guesses ? b.guesses.length : 99));
                            winnerId = solvers[0].userId;
                        } 
    
                        const currentRound = gameData.currentRound || 1;
                        const matchLength = gameData.matchLength || 1;
                        
                        if (currentRound < matchLength) {
                            updates = { roundWinner: winnerId, status: 'finished' };
                        } else {
                            updates = { status: 'finished', roundWinner: winnerId, matchWinnerId: winnerId };
                        }
                    }
                    
                    if (updates.roundWinner === undefined && gameData.gameType !== 'multiplayer-br') updates.roundWinner = null;
                    if (updates.matchWinnerId === undefined) delete updates.matchWinnerId;

                    updateDoc(gameRef, updates).catch(err => console.error("Tur bitirme hatası:", err));
                }
            }
        }

        const wasFinished = oldGameData?.status === 'finished';
        const isNowPlaying = gameData.status === 'playing';
        
        if (!oldGameData && isNowPlaying) {
             setTimeout(() => {
                if (gameData.gameType === 'multiplayer-br') startBRTimer();
                else startTurnTimer();
            }, 500);
        }
        
        if (wasFinished && isNowPlaying) {
            showScreen('game-screen');
            initializeGameUI(gameData);
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
                stopTurnTimer(); 
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

export async function findOrCreateRandomGame(config, attempt = 1) {
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();

    const { timeLimit, matchLength, gameType } = config;
    const currentUserId = state.getUserId();
    
    if (!currentUserId) return showToast("Lütfen önce giriş yapın.", true);

    if (attempt === 1) {
        import('./ui.js').then(ui => ui.openMatchmakingScreen());
    }

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
            
            await createGame({ 
                invitedFriendId: null, 
                timeLimit: timeLimit, 
                matchLength: matchLength, 
                gameType: gameType 
            });

            const createdGameId = state.getCurrentGameId();
            
            console.log("LOG: 45 Saniyelik Bot Sayacı Başlatıldı...");
            setTimeout(() => {
                const currentGameData = state.getLocalGameData();
                
                if (currentGameData && currentGameData.gameId === createdGameId && currentGameData.status === 'waiting') {
                    assignBotToGame(createdGameId);
                }
            }, 20000); 
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
        gameId, wordLength: secretWord.length, secretWord, timeLimit,
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
                state.setGameMode('multiplayer-br');
                localStorage.setItem('activeGameId', gameId);
                state.setCurrentGameId(gameId);
                state.setLocalGameData(gameData);
                
                import('./ui.js').then(ui => ui.showScreen('game-screen'));
                initializeGameUI(gameData); 
                listenToGameUpdates(gameId);
                import('./game.js').then(m => m.setupVisibilityHandler(gameId));
                
                // Hemen UI'ı güncelle ki lobi butonları görünür olsun
                import('./game.js').then(m => m.updateTurnDisplay(gameData));
                
                if (visibility === 'private') {
                    showToast("Gizli oda kuruldu. Arkadaşlarını davet et!", false);
                } else {
                    showToast("Oda kuruldu. Oyuncu bekleniyor...", false);
                }
                
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
        if (gameDataToJoin.gameType === 'league') {
            state.setGameMode('league');
        } else if (gameDataToJoin.gameType === 'multiplayer-br') {
            state.setGameMode('multiplayer-br');
        } else {
            state.setGameMode('multiplayer');
        }
        state.setGameMode('multiplayer');
        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        state.setLocalGameData(gameDataToJoin);
        
        const isRandomWaiting = gameDataToJoin.status === 'waiting' && 
                               (gameDataToJoin.gameType === 'random_loose' || gameDataToJoin.gameType === 'random_series');

        if (isRandomWaiting) {
            console.log("LOG: joinGame içinde 'waiting' durumu algılandı. Radar ekranı açılıyor.");
            import('./ui.js').then(ui => ui.openMatchmakingScreen());
        } else {
            showScreen('game-screen');
            initializeGameUI(gameDataToJoin);
        }

        listenToGameUpdates(gameId);
        import('./game.js').then(m => m.setupVisibilityHandler(gameId));
    } catch (error) {
        console.error("Error joining game:", error);
        showToast(error.message, true);
        localStorage.removeItem('activeGameId');
        leaveGame();
    }
}

// YENİ: Günün kelimesini Firestore'dan çeken fonksiyon
async function getDailySecretWord() {
    try {
        const docRef = doc(db, "system_data", "daily");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("Günün kelimesi sunucudan alındı.");
            return data.word.toLocaleUpperCase('tr-TR');
        } else {
            console.warn("Günün kelimesi veritabanında yok! Yerele dönülüyor.");
            // Acil durum yedeği (Veritabanı boşsa oyun çökmesin)
            return "KALEM"; 
        }
    } catch (error) {
        console.error("Günün kelimesi alınamadı:", error);
        return "KALEM"; // Hata olursa yedek kelime
    }
}

export async function startNewGame(config) {
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();

    state.setGameMode(config.mode);
    let secretWord;
    const initialGuesses = config.initialGuesses || []; 

    const gameSettings = { isHardMode: false };
    switch (config.mode) {
        case 'vsCPU':
            gameSettings.wordLength = getRandomWordLength();
            gameSettings.timeLimit = 120; 
            gameSettings.matchLength = 5;
            
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
            secretWord = await getDailySecretWord();
            
            if (!secretWord) {
                showToast("Günün kelimesi sunucudan alınamadı.", true);
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
                guesses: initialGuesses, 
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
    
    if (initialGuesses.length > 0) {
         const known = {};
         initialGuesses.forEach(g => {
             g.colors.forEach((c, i) => { if(c === 'correct') known[i] = g.word[i]; });
         });
         state.setKnownCorrectPositions(known);
    }

    showScreen('game-screen');
    initializeGameUI(gameData);
    await renderGameState(gameData);
    if (config.mode === 'vsCPU') {
        if (typeof cpuLoopTimeout !== 'undefined' && cpuLoopTimeout) clearTimeout(cpuLoopTimeout);
        console.log("vsCPU Başlatılıyor: Bot 1.5sn sonra devreye girecek.");
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

// js/game.js içindeki restoreDailyGame fonksiyonunu GÜNCELLE:

// js/game.js -> restoreDailyGame fonksiyonunu BU HALİYLE DEĞİŞTİR:

function restoreDailyGame(savedState) {
    console.log("Günün kelimesi durumu kontrol ediliyor...");
    
    // Eğer oyun zaten bitmişse, oyun ekranını HİÇ açma. Direkt modalı hazırla.
    if (savedState.status === 'finished') {
        // Arka planda state'i güncelle ama ekran değiştirme
        state.setGameMode('daily');
        state.setLocalGameData({
            ...savedState,
            gameType: 'daily',
            players: { [state.getUserId()]: { guesses: savedState.guesses } }
        });

        // Yükleniyor hissi için kısa bir bekleme (opsiyonel, kaldırılabilir)
        showToast("Sonuçlar yükleniyor...", false);

        // js/game.js -> restoreDailyGame içindeki setTimeout bloğu:

        // ... restoreDailyGame içindeki setTimeout bloğu ...
        // js/game.js -> restoreDailyGame içinde:

        setTimeout(async () => {
            const profile = state.getCurrentUserProfile();
            const stats = getStatsFromProfile(profile);
            
            // 1. BUGÜNÜN VERİLERİ (Sen, Sıralama, Genel Ort.)
            // Bu fonksiyon zaten hem senin puanını, hem sıranı, hem de genel ortalamayı döndürüyor.
            const rankData = await getDailyLeaderboardStats(state.getUserId(), savedState.secretWord);
            
            // 2. HAFTALIK SENİN ORTALAMAN
            const weeklyData = await getLast7DaysStats(state.getUserId());

            // 3. HAFTALIK GENEL ORTALAMA
            const globalWeeklyData = await getGlobalWeeklyStats();

            // 4. HAFTALIK SIRALAMA (YENİ EKLENEN)
            const weeklyRankData = await calculateWeeklyLeaderboard(state.getUserId());

            import('./ui.js').then(ui => {
                ui.openDailyResultModal(stats, {
                    // BUGÜN
                    userScore: rankData?.userScore || 0,
                    userGuessCount: savedState.guesses.length,
                    userDailyRank: rankData?.userPosition || '-',
                    totalDailyPlayers: rankData?.totalPlayers || '-',
                    dailyGlobalScore: rankData?.avgScore || '-',
                    dailyGlobalGuesses: rankData?.avgGuesses || '-',
                    
                    // HAFTALIK
                    weeklyUserScore: weeklyData.avgScore,
                    weeklyUserGuesses: weeklyData.avgGuesses,
                    weeklyGlobalScore: globalWeeklyData.avgScore,
                    weeklyGlobalGuesses: globalWeeklyData.avgGuesses,
                    weeklyRank: weeklyRankData.myRank,
                    weeklyTotalPlayers: weeklyRankData.totalPlayers
                });
            });
        }, 500);
        return;
    }

    // --- EĞER OYUN BİTMEMİŞSE BURADAN DEVAM EDER ---
    
    state.resetKnownCorrectPositions(); 
    state.resetHasUserStartedTyping();
    
    const known = {};
    if(savedState.guesses) {
        savedState.guesses.forEach(g => {
            g.colors.forEach((c, i) => { 
                if(c === 'correct') known[i] = g.word[i]; 
            });
        });
    }
    state.setKnownCorrectPositions(known);

    const gameData = {
        wordLength: savedState.secretWord.length, 
        secretWord: savedState.secretWord, 
        timeLimit: 60,
        isHardMode: false, 
        currentRound: 1, 
        matchLength: 1, 
        roundWinner: null,
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
        GUESS_COUNT: 6,
        gameType: 'daily',
    };

    state.setGameMode('daily');
    state.setLocalGameData(gameData);
    
    showScreen('game-screen'); // Oyun bitmemişse ekranı aç
    initializeGameUI(gameData);
    renderGameState(gameData, true);
}

// BU YENİ FONKSİYONU DA game.js'in EN ALTINA EKLE:
// js/game.js -> getLast7DaysStats (GÜVENLİ VERSİYON)

async function getLast7DaysStats(userId) {
    // Son 7 günün skorlarını çekip ortalamasını alır
    // Not: Index hatası almamak için sadece userId ile sorgulayıp JS'de filtreliyoruz.
    const todayIndex = getDaysSinceEpoch();
    const startDay = todayIndex - 7;
    
    try {
        const leaderboardRef = collection(db, 'daily_leaderboard');
        // Sadece kullanıcıya göre sorgula (Index gerektirmez)
        const q = query(leaderboardRef, where('userId', '==', userId));
        
        const snapshot = await getDocs(q);
        let totalScore = 0;
        let totalGuesses = 0;
        let count = 0;

        snapshot.forEach(doc => {
            const d = doc.data();
            // Son 7 güne ait mi kontrol et
            if (d.dayIndex > startDay && d.dayIndex <= todayIndex && d.didWin) {
                totalScore += d.score;
                totalGuesses += d.guessCount;
                count++;
            }
        });

        console.log(`Haftalık İstatistik: ${count} oyun bulundu.`);

        return {
            avgScore: count > 0 ? Math.round(totalScore / count) : 0,
            avgGuesses: count > 0 ? (totalGuesses / count).toFixed(1) : '-'
        };

    } catch (e) {
        console.error("Haftalık veri hatası:", e);
        return { avgScore: 0, avgGuesses: '-' };
    }
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

// js/game.js -> saveDailyResultToDatabase fonksiyonunu BUL ve GÜNCELLE:

export async function saveDailyResultToDatabase(userId, username, secretWord, didWin, guessCount, score) {
    const dayIndex = getDaysSinceEpoch();
    const wordLength = secretWord.length;
    const docId = `${dayIndex}_${wordLength}_${userId}`; 
    const resultRef = doc(db, 'daily_leaderboard', docId);
    
    // Önce kaydet (veya güncelle)
    try {
        await setDoc(resultRef, {
            dayIndex: dayIndex, wordLength: wordLength, userId: userId, username: username,
            secretWord: secretWord, didWin: didWin, guessCount: guessCount, score: score,
            completedAt: serverTimestamp()
        }, { merge: true });
        
        // --- YENİ: SIRALAMA BİLGİSİNİ HESAPLA ---
        // Basit bir "Senden daha iyi yapanlar" sorgusu
        const leaderboardRef = collection(db, 'daily_leaderboard');
        const q = query(leaderboardRef, 
            where('dayIndex', '==', dayIndex),
            where('wordLength', '==', wordLength)
        );
        
        const snapshot = await getDocs(q);
        const totalPlayers = snapshot.size; // Toplam oyuncu sayısı
        
        // Sıralamayı hesapla (Basit mantık: Puanı benden yüksek olanlar + 1)
        // Not: Gerçek hayatta backend function daha iyidir ama bu iş görür.
        let rank = 1;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.userId !== userId) {
                if (data.score > score) rank++;
                else if (data.score === score && data.guessCount < guessCount) rank++;
            }
        });

        console.log(`Günlük Sıralama: ${rank} / ${totalPlayers}`);
        return { success: true, userPosition: rank, totalPlayers: totalPlayers };

    } catch (error) {
        console.error("Günlük skor hatası:", error);
        return { success: false, message: error.message, userPosition: 0, totalPlayers: 0 };
    }
}

async function submitGuess() {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;

    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const playerState = localGameData.players[currentUserId];

    if (!playerState || playerState.isEliminated || playerState.hasSolved || playerState.hasFailed || (playerState.guesses && playerState.guesses.length >= GUESS_COUNT)) {
        return;
    }
    
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

    if (localGameData.isHardMode && playerState.guesses.length > 0) {
        if (!checkHardMode(guessWord, playerState.guesses)) {
            shakeCurrentRow(currentWordLength, currentRow);
            return;
        }
    }

    if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';

    const isValidWord = await checkWordValidity(guessWord);
    if (!isValidWord) {
        showToast("Kelime sözlükte bulunamadı!", true);
        shakeCurrentRow(currentWordLength, currentRow);
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }

    const secretWord = localGameData.secretWord;
    const colors = calculateColors(guessWord, secretWord);
    const newGuess = { word: guessWord, colors: colors };
    
    if (!localGameData.players[currentUserId].guesses) localGameData.players[currentUserId].guesses = [];
    localGameData.players[currentUserId].guesses.push(newGuess);
    
    updateKnownPositions(localGameData.players[currentUserId].guesses);
    state.resetHasUserStartedTyping();
    
    const isWinner = (guessWord === secretWord);
    const guessCount = localGameData.players[currentUserId].guesses.length;

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
    
    // js/game.js -> submitGuess içinde "else if (gameMode === 'league')" bloğu:

    else if (gameMode === 'league') {
        const weekID = localGameData.leagueWeekID;
        const matchId = localGameData.leagueMatchId;
        const tier = localGameData.leagueTier;       // <-- EKLENDİ
        const groupId = localGameData.leagueGroupId; // <-- EKLENDİ
        const userId = state.getUserId();
        
        if (weekID && matchId && tier && groupId) {
            // YENİ DOĞRU YOL: tiers -> groups -> matches
            const matchRef = doc(db, "leagues", weekID, "tiers", tier, "groups", groupId, "matches", matchId);
            
            try {
                await runTransaction(db, async (transaction) => {
                    const mDoc = await transaction.get(matchRef);
                    if (!mDoc.exists()) throw "Maç bulunamadı";
                    
                    const mData = mDoc.data();
                    const playerKey = (mData.p1 === userId) ? 'p1_data' : 'p2_data';
                    
                    const updates = {};
                    updates[`${playerKey}.guesses`] = localGameData.players[currentUserId].guesses;
                    
                    if (isWinner) {
                        updates[`${playerKey}.completed`] = true; 
                        updates[`${playerKey}.failed`] = false;
                    } else if (guessCount >= GUESS_COUNT) {
                        updates[`${playerKey}.completed`] = true;
                        updates[`${playerKey}.failed`] = true;
                    }
                    
                    transaction.update(matchRef, updates);
                });
                
                if (isWinner || guessCount >= GUESS_COUNT) {
                    localGameData.status = 'finished';
                    localGameData.roundWinner = isWinner ? currentUserId : null; 
                    state.setLocalGameData(localGameData);
                    stopTurnTimer();
                    
                    setTimeout(() => showScoreboard(localGameData), 1000);
                }
                
            } catch (e) {
                console.error("Lig güncelleme hatası:", e);
                showToast("Bağlantı hatası: Puan kaydedilemedi.", true);
            }
        } else {
            console.error("Eksik lig bilgisi:", { weekID, matchId, tier, groupId });
        }
    }
    
    else {
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
            
            state.setLocalGameData(localGameData);
            checkVsCpuGameEnd(); 
        }
        
        else if (gameMode === 'daily') {
            saveDailyGameState(localGameData);

            if (isWinner) {
                localGameData.status = 'finished';
                localGameData.roundWinner = currentUserId;
                await updateStats(true, guessCount);
                const dailyScore = calculateDailyScore(guessCount, true);
                
                // 1. Bugünü Kaydet ve Sıralamayı Al
                const rankData = await saveDailyResultToDatabase(currentUserId, getUsername(), secretWord, true, guessCount, dailyScore);
                saveDailyGameState(localGameData);
                
                // ... (rankData ve weeklyData alındıktan sonra) ...

                // Global Veriyi Çek (YENİ)
                const globalWeeklyData = await getGlobalWeeklyStats();

                // --- YENİ MODALI AÇ ---
                setTimeout(() => {
                    const profile = state.getCurrentUserProfile();
                    const stats = getStatsFromProfile(profile);
                    
                    import('./ui.js').then(ui => {
                        ui.openDailyResultModal(stats, {
                            userPosition: rankData.userPosition,
                            totalPlayers: rankData.totalPlayers,
                            userGuessCount: guessCount,
                            userScore: dailyScore,
                            avgScore: rankData.avgScore || '-',
                            avgGuesses: rankData.avgGuesses || '-',
                            
                            weeklyUserScore: weeklyData.avgScore,
                            weeklyUserGuesses: weeklyData.avgGuesses,
                            
                            // Genel (Herkes - ARTIK GERÇEK VERİ)
                            weeklyGlobalScore: globalWeeklyData.avgScore,
                            weeklyGlobalGuesses: globalWeeklyData.avgGuesses
                        });
                    });
                }, 1500);

            } else if (guessCount >= GUESS_COUNT) {
                localGameData.status = 'finished';
                localGameData.roundWinner = null;
                await updateStats(false, guessCount);
                
                // 1. Kaydet
                const rankData = await saveDailyResultToDatabase(currentUserId, getUsername(), secretWord, false, guessCount, 0);
                saveDailyGameState(localGameData);

                // 2. Haftalık Veri (Kaybettiği için yine çekilmeli)
                const weeklyData = await getLast7DaysStats(currentUserId);

                // --- YENİ MODALI AÇ (Kaybetti) ---
                setTimeout(() => {
                    const profile = state.getCurrentUserProfile();
                    const stats = getStatsFromProfile(profile);
                    
                    import('./ui.js').then(ui => {
                        ui.openDailyResultModal(stats, {
                            // Bugün
                            userPosition: rankData.userPosition, 
                            totalPlayers: rankData.totalPlayers,
                            userGuessCount: -1, // Başarısız
                            userScore: 0,
                            avgScore: rankData.avgScore || '-',
                            avgGuesses: rankData.avgGuesses || '-',
                            // Haftalık
                            weeklyUserScore: weeklyData.avgScore,
                            weeklyUserGuesses: weeklyData.avgGuesses,
                            weeklyGlobalScore: "436",
                            weeklyGlobalGuesses: "4.2"
                        });
                    });
                }, 1500);
            }
        }
    }

    if (isWinner || guessCount >= GUESS_COUNT) {
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
        
        if (gameMode === 'multiplayer' || gameMode === 'league' || isBattleRoyale(gameMode)) {
            const msg = isWinner ? "Tebrikler! Diğer oyuncular bekleniyor..." : "Hakkın bitti! Diğerleri bekleniyor...";
            const isSuccess = isWinner;
            showToast(msg, !isSuccess);
        }
    }

    renderGameState(localGameData, true).then(() => {
        if (gameMode === 'daily' && localGameData.status === 'finished') {
            setTimeout(() => showScoreboard(localGameData), 1500);
        }
    });
}

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

    if (gameMode === 'multiplayer' || isBattleRoyale(gameMode)) {
        const updates = { [`players.${currentUserId}.hasFailed`]: true };
        try {
            await updateDoc(doc(db, "games", state.getCurrentGameId()), updates);
            showToast("Süre doldu!", true);
        } catch (error) { console.error(error); }
    } 
    
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
                    
                    transaction.update(matchRef, {
                        [`${playerKey}.guesses`]: localGameData.players[currentUserId].guesses || [],
                        [`${playerKey}.completed`]: true,
                        [`${playerKey}.failed`]: true
                    });
                });
                
                localGameData.status = 'finished';
                localGameData.roundWinner = null; 
                state.setLocalGameData(localGameData);
                
                showToast("Süre doldu!", true);
                setTimeout(() => showScoreboard(localGameData), 1000);
                
            } catch (e) { console.error("Lig süre bitiş hatası:", e); }
        }
    }
    
    else {
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

            if (isEmpty || isStatic) {
                
                if (isStatic) {
                    tile.classList.remove('static', 'correct'); 
                    back.className = 'tile-inner back'; 
                    back.textContent = ''; 
                }

                front.textContent = letter;
                playSound('click');
                break; 
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

    for (let i = wordLength - 1; i >= 0; i--) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        
        if (tile && tile.querySelector('.front').textContent !== '' && !tile.classList.contains('static')) {
            tile.querySelector('.front').textContent = '';
            return; 
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

function findBestCpuGuess(botId = 'cpu') {
    const localGameData = state.getLocalGameData();
    const botGuesses = localGameData.players[botId]?.guesses || [];
    
    const wordLenStr = String(localGameData.wordLength);
    let possibleWords = [...(allWordList[wordLenStr] || allWordList["5"])]; 
    
    const correctLetters = {}; 
    const presentLetters = new Set(); 
    const absentLetters = new Set(); 
    const positionMisplaced = {}; 

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
    
    const guessedWords = new Set(botGuesses.map(g => g.word));
    let finalWords = possibleWords.filter(w => !guessedWords.has(w));
    
    const secretWord = localGameData.secretWord;
    
    if (finalWords.length === 0) {
        const emergencyList = (allWordList[wordLenStr] || []).filter(w => !guessedWords.has(w));
        return emergencyList.length > 0 ? emergencyList[Math.floor(Math.random() * emergencyList.length)] : "KALEM";
    }

    const winningWordIndex = finalWords.indexOf(secretWord);
    
    if (botGuesses.length < 2 && winningWordIndex !== -1 && finalWords.length > 1) {
        finalWords.splice(winningWordIndex, 1);
    }
    else if (botGuesses.length >= 3 && winningWordIndex !== -1) {
        if (Math.random() > 0.4) return secretWord; 
    }

    const randomIndex = Math.floor(Math.random() * finalWords.length);
    return finalWords[randomIndex]; 
}

async function cpuTurn(botId = 'cpu') {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status === 'finished') return;

    const botState = localGameData.players[botId];
    
    if (botState.hasSolved || botState.hasFailed) return;

    const finalGuess = findBestCpuGuess(botId);
    const secretWord = localGameData.secretWord;
    const colors = calculateColors(finalGuess, secretWord);
    const newGuess = { word: finalGuess, colors: colors };
    
    if (botId === 'cpu') {
        localGameData.players['cpu'].guesses.push(newGuess);
        
        if (finalGuess === secretWord) {
            console.log("BOT: Doğru bildi!");
            localGameData.players['cpu'].hasSolved = true; 
            localGameData.players['cpu'].score += calculateRoundScore(localGameData.players['cpu'].guesses.length, true);
        }
        else if (localGameData.players['cpu'].guesses.length >= GUESS_COUNT) {
            localGameData.players['cpu'].hasFailed = true; 
        }
        
        state.setLocalGameData(localGameData);
        await renderGameState(localGameData, false);
        checkVsCpuGameEnd();
    } 
    
    else {
        const currentGuesses = botState.guesses || [];
        const updatedGuesses = [...currentGuesses, newGuess];
        
        const updates = {
            [`players.${botId}.guesses`]: updatedGuesses
        };

        if (finalGuess === secretWord) {
            console.log(`BOT (${botState.username}): KAZANDI!`);
            updates[`players.${botId}.hasSolved`] = true; 
            const roundScore = calculateRoundScore(updatedGuesses.length, true);
            updates[`players.${botId}.score`] = (botState.score || 0) + roundScore;
        } else if (updatedGuesses.length >= GUESS_COUNT) {
            console.log(`BOT (${botState.username}): KAYBETTİ!`);
            updates[`players.${botId}.hasFailed`] = true; 
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

    // BATTLE ROYALE MANTIĞI
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

    Object.keys(localGameData.players).forEach(pid => {
        updates[`players.${pid}.guesses`] = [];
        updates[`players.${pid}.hasSolved`] = false;
        updates[`players.${pid}.hasFailed`] = false;
        updates[`players.${pid}.jokersUsed`] = { present: false, correct: false, remove: false };
    });

    if (gameMode === 'vsCPU') {
        updates.turnStartTime = new Date(); 
        
        const newLocalData = { ...localGameData, ...updates };
        
        Object.keys(newLocalData.players).forEach(pid => {
            newLocalData.players[pid].guesses = [];
            newLocalData.players[pid].hasSolved = false;
            newLocalData.players[pid].hasFailed = false;
        });
        
        state.setLocalGameData(newLocalData);
        showScreen('game-screen');
        initializeGameUI(newLocalData);
        
        startTurnTimer(); 
        setTimeout(startCpuLoop, 1000);

        await renderGameState(newLocalData);
    } 
    else if (gameMode === 'multiplayer' || gameMode === 'friend' || gameMode === 'random_series') {
         await updateDoc(doc(db, 'games', state.getCurrentGameId()), updates);
    } 
    else {
        startNewGame({ mode: gameMode });
    }
}

export function startTurnTimer() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    const currentUserId = state.getUserId(); 

    if (isBattleRoyale(gameMode) || gameMode === 'daily') return;
    
    stopTurnTimer(); 

    if (!localGameData || localGameData.status !== 'playing') return;
    
    const myState = localGameData.players[currentUserId];
    if (myState && (myState.hasSolved || myState.hasFailed || myState.isEliminated)) {
        if (timerDisplay) timerDisplay.textContent = "0";
        return;
    }

    let turnStartTime;
    const startTimeObj = localGameData.turnStartTime;

    if (!startTimeObj) {
        console.warn("Zaman verisi yok, sayaç manuel başlatılıyor.");
        turnStartTime = new Date();
    } else if (startTimeObj.toDate) {
        turnStartTime = startTimeObj.toDate(); 
    } else if (startTimeObj instanceof Date) {
        turnStartTime = startTimeObj; 
    } else {
        turnStartTime = new Date(startTimeObj); 
    }
    
    const limit = (gameMode === 'league') ? 120 : (localGameData.timeLimit || 45);

    if (timerDisplay) {
        timerDisplay.style.display = 'block';
        timerDisplay.textContent = limit; 
    }

    const updateTimer = async () => {
        let now = new Date();
        let elapsed = Math.floor((now - turnStartTime) / 1000);
        if (elapsed < 0) elapsed = 0;
        let timeLeft = limit - elapsed; 
        
        if (timeLeft < 0) timeLeft = 0; 

        if (timerDisplay) { 
            timerDisplay.textContent = timeLeft;
            
            if (timeLeft <= 10 && timeLeft > 0) {
                timerDisplay.classList.add('text-red-500', 'pulsate');
            } else {
                 timerDisplay.classList.remove('text-red-500', 'pulsate');
            }
        }
        
        if (timeLeft <= 0) {
            stopTurnTimer(); 
            if (myState && !myState.hasFailed && !myState.hasSolved) {
                console.log("Süre bitti, tur başarısız.");
                await failTurn(''); 
            }
        }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    state.setTurnTimerInterval(interval);
}

// game.js dosyasındaki startBRTimer fonksiyonunu bununla değiştir:

// js/game.js içinde startBRTimer fonksiyonunu BUL ve BUNUNLA DEĞİŞTİR:

function startBRTimer() {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;
    
    stopTurnTimer();
    
    // Server timestamp ile uyumlu süre hesaplama
    const turnStartTime = localGameData.turnStartTime?.toDate ? localGameData.turnStartTime.toDate() : new Date();
    const timeLimit = localGameData.timeLimit || 60;

    // 1000ms yerine 100ms (Saniyede 10 kontrol) yaparak hassasiyeti artırıyoruz
    const interval = setInterval(async () => {
        let now = new Date();
        // Saniye değil, milisaniye cinsinden hassas fark
        let elapsedSeconds = (now - turnStartTime) / 1000; 
        let timeLeft = timeLimit - elapsedSeconds;
        
        // EKRAN GÜNCELLEME (Görsel olarak tam sayı gösteriyoruz)
        if (brTimerDisplay) {
            // Math.ceil kullanarak 0.1 sn kalsa bile ekranda "1" görünmesini sağlıyoruz (daha doğal durur)
            let displayTime = Math.ceil(timeLeft);
            brTimerDisplay.textContent = displayTime > 0 ? displayTime : 0;
            
            if (displayTime <= 10) brTimerDisplay.classList.add('text-red-500', 'pulsate');
            else brTimerDisplay.classList.remove('text-red-500', 'pulsate');
        }

        // SÜRE BİTTİĞİNDE ÇALIŞACAK KISIM (Hassas Kontrol)
        if (timeLeft <= 0) {
            stopTurnTimer(); // Sayacı durdur

            // 1. ÖNCE ARAYÜZÜ KİLİTLE
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
            if (brTimerDisplay) brTimerDisplay.textContent = "0"; // Ekranda 0 olduğundan emin ol
            
            showToast("Süre doldu!", true);

            // 2. SONRA SUNUCUYA BİLDİR
            try {
                await failMultiplayerTurn(state.getCurrentGameId(), state.getUserId());
            } catch (error) {
                console.error("Süre bitimi sunucuya bildirilemedi:", error);
            }
        }
    }, 100); // <-- BURASI DEĞİŞTİ: 1000 yerine 100 yaptık.
    
    state.setTurnTimerInterval(interval);
}

export function stopTurnTimer() {
    clearInterval(state.getTurnTimerInterval());
    state.setTurnTimerInterval(null);
    
    if (cpuLoopTimeout) {
        clearTimeout(cpuLoopTimeout);
        cpuLoopTimeout = null;
    }

    if (timerDisplay) {
        timerDisplay.classList.remove('text-red-500');
    }
    
    if (brTimerDisplay) {
        brTimerDisplay.classList.remove('text-red-500');
    }
}

export function leaveGame() {
    console.log("LOG: leaveGame fonksiyonu çalıştı.");
    
    const gameUnsubscribe = state.getGameUnsubscribe();
    if (gameUnsubscribe) gameUnsubscribe();
    
    if (cpuLoopTimeout) {
        clearTimeout(cpuLoopTimeout);
        cpuLoopTimeout = null;
    }

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

// js/game.js -> createBRGame fonksiyonunu güncelle:

export async function createBRGame(visibility = 'public') { // Varsayılan public
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();
    
    const timeLimit = 120; 
    const wordLength = getRandomWordLength(); 
    // isHardMode BR'de şimdilik kapalı veya false
    
    if (!db || !state.getUserId()) {
         return showToast("Sunucuya bağlanılamıyor.", true);
    }
    const currentUserId = state.getUserId();
    const username = getUsername();
    const secretWord = await getNewSecretWord(wordLength);
    if (!secretWord) return;
    
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const gameData = {
        gameId, wordLength, secretWord, timeLimit,
        creatorId: currentUserId, 
        isHardMode: false, 
        matchLength: 10,
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
        GUESS_COUNT: 6, 
        gameType: 'multiplayer-br',
        maxPlayers: 8, // 8 Kişilik
        currentRound: 1,
        visibility: visibility // <-- YENİ: 'public' veya 'private'
    };

    try {
        await setDoc(doc(db, "games", gameId), gameData);
        state.setGameMode('multiplayer-br');
        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        state.setLocalGameData(gameData);
        
        import('./ui.js').then(ui => ui.showScreen('game-screen'));
        initializeGameUI(gameData); 
        listenToGameUpdates(gameId);
        import('./game.js').then(m => m.setupVisibilityHandler(gameId));
        
        if (visibility === 'private') {
            showToast("Gizli oda kuruldu. Arkadaşlarını davet et!", false);
        } else {
            showToast("Oda kuruldu. Oyuncu bekleniyor...", false);
        }
        
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
        import('./game.js').then(m => m.setupVisibilityHandler(gameId));
        showToast(`Oyuna katıldınız! Toplam ${Object.keys(gameDataToJoin.players).length} oyuncu.`, false);
    } catch (error) {
        console.error("Error joining BR game:", error);
        showToast(error.message, true);
        localStorage.removeItem('activeGameId');
        leaveGame();
    }
}

async function consumeJokerItem(itemKey) {
    const currentUserId = state.getUserId();
    const profile = state.getCurrentUserProfile();
    
    if (!profile || !profile.inventory) return false;

    const currentAmount = profile.inventory[itemKey] || 0;
    
    if (currentAmount <= 0) {
        return false; 
    }

    const newInventory = { ...profile.inventory };
    newInventory[itemKey] = currentAmount - 1;

    const newProfile = { ...profile, inventory: newInventory };
    state.setCurrentUserProfile(newProfile);

    import('./ui.js').then(ui => {
        ui.updateMarketUI(); 
        const gameData = state.getLocalGameData();
        const isMyTurn = (gameData.currentPlayerId === currentUserId);
        ui.updateJokerUI(null, isMyTurn, 'playing'); 
    });

    try {
        const userRef = doc(db, "users", currentUserId);
        await updateDoc(userRef, { inventory: newInventory });
    } catch (error) {
        console.error("Joker harcama hatası:", error);
    }
    
    return true;
}

export async function usePresentJoker() {
    const gameData = state.getLocalGameData();
    if (!gameData || gameData.status !== 'playing') return;

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
        
        import('./state.js').then(s => s.addPresentJokerLetter(hintLetter));
        
        showToast(`İpucu: "${hintLetter}" harfi kelimede var! (Kalan: ${stock-1})`, false);
    }
}

export async function useCorrectJoker() {
    const gameData = state.getLocalGameData();
    if (!gameData || gameData.status !== 'playing') return;

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

export async function useRemoveJoker() {
    const gameData = state.getLocalGameData();
    if (!gameData || gameData.status !== 'playing') return;

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
        
        if (key && key.length === 1 && 
            key !== '⌫' && key !== 'ENTER' && 
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

// js/game.js -> checkLeagueStatus (GÜNCELLENMİŞ)

export async function checkLeagueStatus() {
    const userId = state.getUserId();
    if (!userId) return;

    const weekID = getCurrentWeekID();
    
    // 1. Kullanıcının profilinden lig bilgisini kontrol et
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) return;
    const userData = userSnap.data();

    // Eğer bu haftanın ligine zaten kayıtlıysa ve bir grubu varsa
    if (userData.currentLeagueWeek === weekID && userData.currentTier && userData.currentGroupId) {
        
        // Intro'yu gizle, Dashboard'u aç
        const intro = document.getElementById('league-intro-section');
        const dashboard = document.getElementById('league-dashboard-section');
        
        if (intro) intro.classList.add('hidden');
        if (dashboard) dashboard.classList.remove('hidden');

        // Fikstürü o gruba göre yükle
        await fetchAndDisplayLeagueMatches(weekID, userId);
        
    } else {
        // Kayıtlı değilse, Intro ekranını (Katıl Butonunu) göster
        const intro = document.getElementById('league-intro-section');
        const dashboard = document.getElementById('league-dashboard-section');
        
        if (intro) intro.classList.remove('hidden');
        if (dashboard) dashboard.classList.add('hidden');

        const joinBtn = document.getElementById('join-league-btn');
        if(joinBtn) {
            joinBtn.disabled = false;
            joinBtn.textContent = "LİGE KATIL ✍️";
            joinBtn.onclick = () => import('./game.js').then(m => m.joinCurrentLeague(weekID));
        }
    }
}

// ================================================================
// === KELİMELİG 2.0: GRUP VE KÜME SİSTEMİ (game.js) ===
// ================================================================

// 1. Oyuncuyu Lige Kaydet (Akıllı Gruplama)
export async function joinCurrentLeague(weekID) {
    const userId = state.getUserId();
    const username = getUsername();
    
    try {
        const joinBtn = document.getElementById('join-league-btn');
        if(joinBtn) {
            joinBtn.disabled = true;
            joinBtn.textContent = "Uygun grup aranıyor...";
        }

        // --- ADIM 1: Uygun Grup Bul veya Yarat ---
        // Varsayılan olarak herkes 'rookie' (Çaylak) liginden başlar.
        // İleride burayı kullanıcının 'currentTier' verisine göre değiştireceğiz.
        const targetTier = 'rookie'; 
        
        const groupInfo = await findOrCreateAvailableGroup(weekID, targetTier);
        const groupId = groupInfo.id;

        // --- ADIM 2: Oyuncuyu Gruba Ekle ---
        const userLeagueRef = doc(db, "leagues", weekID, "tiers", targetTier, "groups", groupId, "participants", userId);
        
        await setDoc(userLeagueRef, {
            username: username,
            joinedAt: serverTimestamp(),
            score: 0,
            tier: targetTier,
            groupId: groupId,
            isBot: false,
            stats: { O: 0, G: 0, B: 0, M: 0, P: 0 }
        });

        // Grubun oyuncu sayısını 1 artır (Counter)
        const groupRef = doc(db, "leagues", weekID, "tiers", targetTier, "groups", groupId);
        await updateDoc(groupRef, {
            playerCount: (groupInfo.playerCount || 0) + 1
        });

        // --- ADIM 3: Kullanıcı Profiline Lig Bilgisini İşle ---
        // Böylece her girdiğinde hangi grupta olduğunu biliriz
        await updateDoc(doc(db, "users", userId), {
            currentLeagueWeek: weekID,
            currentTier: targetTier,
            currentGroupId: groupId
        });

        // --- ADIM 4: Eğer Grup Yeni ve Boşsa Botlarla Destekle ---
        // İlk giren oyuncu sıkılmasın diye yanına 5-6 tane "Hızlı Bot" atalım
        if ((groupInfo.playerCount || 0) === 0) {
            populateGroupWithStarterBots(weekID, targetTier, groupId, 5); 
        }

        // UI Güncelleme
        if(joinBtn) joinBtn.classList.add('hidden');
        const statusEl = document.getElementById('league-join-status');
        
        // Türkçe Lig İsimleri Sözlüğü
        const tierNames = {
            'rookie': 'ÇAYLAK',
            'bronze': 'BRONZ',
            'silver': 'GÜMÜŞ',
            'gold': 'ALTIN',
            'platinum': 'PLATİN',
            'diamond': 'ELMAS'
        };

        const tierNameTR = tierNames[targetTier] || targetTier.toUpperCase();
        // Grup ismini temizle (grup_1234 -> 1234)
        const groupNum = groupId.replace('grup_', '');
const displayGroupName = `${groupNum}. GRUP`; 

if(statusEl) {
    statusEl.classList.remove('hidden');
    // cleanGroupId yerine displayGroupName kullanıyoruz
    statusEl.innerHTML = `✅ <strong>${tierNameTR}</strong> liginde, <br><strong>${displayGroupName}</strong>'a yerleştin!`;
}
        
        showToast("Lige başarıyla katıldın!", false);
        
        // --- DÜZELTME: Ekrana Geçiş ---
        // 1.5 saniye sonra ekranı değiştiriyoruz
        setTimeout(() => {
            // Intro ekranını kapat, Dashboard'u aç
            const intro = document.getElementById('league-intro-section');
            const dashboard = document.getElementById('league-dashboard-section');
            
            if(intro) intro.classList.add('hidden');
            if(dashboard) dashboard.classList.remove('hidden');

            // DOĞRUSU: Fonksiyon zaten bu dosyada, direkt çağırıyoruz.
            fetchAndDisplayLeagueMatches(weekID, userId); 
        }, 1500);

    } catch (error) {
        console.error("Lige katılma hatası:", error);
        showToast("Hata oluştu: " + error.message, true);
        const joinBtn = document.getElementById('join-league-btn');
        if(joinBtn) {
            joinBtn.disabled = false;
            joinBtn.textContent = "LİGE KATIL ✍️";
        }
    }
}

// YARDIMCI: Boş Grup Bulma Mantığı
// js/game.js -> findOrCreateAvailableGroup (SIRALI GRUP SİSTEMİ)

async function findOrCreateAvailableGroup(weekID, tier) {
    const groupsRef = collection(db, "leagues", weekID, "tiers", tier, "groups");
    
    // 1. Önce 20 kişiden az olan (müsait) bir grup var mı bak
    // (Sıralamayı eskiden yeniye yapalım ki önce eski gruplar dolsun)
    const q = query(groupsRef, where("playerCount", "<", 20), orderBy("createdAt", "asc"), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        // Müsait grup bulundu
        const doc = snapshot.docs[0];
        console.log(`Mevcut gruba giriliyor: ${doc.id}`);
        return { id: doc.id, playerCount: doc.data().playerCount };
    } 
    else {
        // 2. Hiç müsait grup yok, YENİ GRUP OLUŞTUR (Sıralı İsimlendirme)
        
        const tierRef = doc(db, "leagues", weekID, "tiers", tier);
        let newGroupNumber = 1;

        try {
            // Transaction kullanarak güvenli bir şekilde sayacı artırıyoruz
            // Bu sayede iki kişi aynı anda grup kurmaya çalışırsa çakışma olmaz.
            await runTransaction(db, async (transaction) => {
                const tierDoc = await transaction.get(tierRef);
                
                if (!tierDoc.exists()) {
                    // Eğer bu ligde hiç grup yoksa, sayacı 1 olarak başlat
                    transaction.set(tierRef, { totalGroups: 1 });
                    newGroupNumber = 1;
                } else {
                    // Varsa, mevcut sayıyı al ve 1 artır
                    const currentCount = tierDoc.data().totalGroups || 0;
                    newGroupNumber = currentCount + 1;
                    transaction.update(tierRef, { totalGroups: newGroupNumber });
                }
            });
        } catch (e) {
            console.error("Grup sayacı hatası:", e);
            // Hata olursa yine de rastgele bir numara ile devam etsin, sistem durmasın
            newGroupNumber = Math.floor(1000 + Math.random() * 9000);
        }

        const newGroupId = `grup_${newGroupNumber}`;
        console.log(`Yeni grup oluşturuluyor: ${newGroupId}`);
        
        await setDoc(doc(groupsRef, newGroupId), {
            createdAt: serverTimestamp(),
            playerCount: 0,
            status: 'active',
            groupNumber: newGroupNumber // Sıra numarasını da kaydedelim
        });
        
        return { id: newGroupId, playerCount: 0 };
    }
}

// YARDIMCI: Başlangıç Botları (Sadece grubu hareketlendirmek için)
async function populateGroupWithStarterBots(weekID, tier, groupId, botCount) {
    const participantsRef = collection(db, "leagues", weekID, "tiers", tier, "groups", groupId, "participants");
    
    // Rastgele bot isimleri seç
    const shuffledNames = [...botNames].sort(() => 0.5 - Math.random()).slice(0, botCount);

    const promises = shuffledNames.map((name, index) => {
        const botId = `bot_${Date.now()}_${index}`;
        return setDoc(doc(participantsRef, botId), {
            username: name,
            joinedAt: serverTimestamp(),
            score: Math.floor(Math.random() * 20), // Ufak bir başlangıç puanı
            isBot: true,
            tier: tier,
            groupId: groupId,
            stats: { O: 0, G: 0, B: 0, M: 0, P: 0 }
        });
    });

    // Bot sayısını ana grupta da güncelle
    const groupRef = doc(db, "leagues", weekID, "tiers", tier, "groups", groupId);
    // Not: Burası kritik, Transaction kullanmadık ama +1 +5 sorun olmaz şimdilik.
    // Mevcut playerCount zaten 1 (biz girdik). Botları ekleyince güncellememiz lazım.
    // Ancak basitlik adına, botları "playerCount"a dahil ETMEYELİM şimdilik. 
    // Sadece gerçek oyuncular 20 limitini doldursun. Botlar "bonus" olsun.
    
    await Promise.all(promises);
    console.log(`${botCount} adet başlangıç botu eklendi.`);
}

// js/game.js -> fetchAndDisplayLeagueMatches (YENİ GRUP SİSTEMİNE UYUMLU)

async function fetchAndDisplayLeagueMatches(weekID, userId) {
    // 1. Önce Kullanıcının Hangi Grupta Olduğunu Öğrenelim
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) return;
    const userData = userSnap.data();
    
    // Kullanıcının grup bilgisi profilinde yazıyor olmalı
    const tier = userData.currentTier;
    const groupId = userData.currentGroupId;

    if (!tier || !groupId) {
        console.error("Kullanıcının lig grubu bulunamadı.");
        return; 
    }

    // 2. O Grubun Katılımcılarını Çek (Doğru Adresten)
    const groupPath = `leagues/${weekID}/tiers/${tier}/groups/${groupId}`;
    const participantsRef = collection(db, groupPath, "participants");
    const matchesRef = collection(db, groupPath, "matches");

    const pSnapshot = await getDocs(participantsRef);
    const participants = {}; 
    
    pSnapshot.forEach(doc => {
        participants[doc.id] = { 
            id: doc.id, 
            username: doc.data().username,
            stats: { O: 0, G: 0, B: 0, M: 0, P: 0 } 
        };
    });

    // 3. O Gruptaki Maçları Çek ve Puanları Hesapla
    const mSnapshot = await getDocs(matchesRef);
    
    const myMatchesList = [];
    let myTotalScore = 0;

    mSnapshot.forEach(doc => {
        const data = doc.data();
        const p1 = data.p1;
        const p2 = data.p2;
        
        const p1Data = data.p1_data;
        const p2Data = data.p2_data;
        
        // İstatistikleri Hesapla
        if (p1Data && p1Data.guesses && p2Data && p2Data.guesses) {
            if (participants[p1]) participants[p1].stats.O++;
            if (participants[p2]) participants[p2].stats.O++;

            let p1Points = 0, p2Points = 0;

            // Puanlama Mantığı (3 Puan Galibiyet, 1 Puan Beraberlik)
            if (p1Data.failed && p2Data.failed) { 
                p1Points = 1; p2Points = 1; // İkisi de bilemedi (Berabere)
                if(participants[p1]) participants[p1].stats.B++;
                if(participants[p2]) participants[p2].stats.B++;
            }
            else if (p1Data.failed) { 
                p1Points = 0; p2Points = 3; // p1 bilemedi, p2 kazandı
                if(participants[p1]) participants[p1].stats.M++;
                if(participants[p2]) participants[p2].stats.G++;
            }
            else if (p2Data.failed) { 
                p1Points = 3; p2Points = 0; // p2 bilemedi, p1 kazandı
                if(participants[p1]) participants[p1].stats.G++;
                if(participants[p2]) participants[p2].stats.M++;
            }
            else if (p1Data.guesses.length < p2Data.guesses.length) { 
                p1Points = 3; p2Points = 0; // p1 daha az tahminde bildi
                if(participants[p1]) participants[p1].stats.G++;
                if(participants[p2]) participants[p2].stats.M++;
            }
            else if (p1Data.guesses.length > p2Data.guesses.length) { 
                p1Points = 0; p2Points = 3; // p2 daha az tahminde bildi
                if(participants[p1]) participants[p1].stats.M++;
                if(participants[p2]) participants[p2].stats.G++;
            }
            else { 
                p1Points = 1; p2Points = 1; // Eşit tahmin (Berabere)
                if(participants[p1]) participants[p1].stats.B++;
                if(participants[p2]) participants[p2].stats.B++;
            }

            if (participants[p1]) participants[p1].stats.P += p1Points;
            if (participants[p2]) participants[p2].stats.P += p2Points;
            
            if (p1 === userId) myTotalScore += p1Points;
            if (p2 === userId) myTotalScore += p2Points;
        }

        // Fikstür Listesini Oluştur (Sadece benim maçlarım)
        if (p1 === userId || p2 === userId) {
            const opponentId = p1 === userId ? p2 : p1;
            const opponentData = participants[opponentId];
            
            const myData = p1 === userId ? p1Data : p2Data;
            const oppData = p1 === userId ? p2Data : p1Data;
            
            let sortCategory = 5; 

            if (!myData || !myData.guesses) {
                sortCategory = 0; // Oynamadım
            } else if (!oppData || !oppData.guesses) {
                sortCategory = 1; // Ben oynadım, rakip oynamadı
            } else {
                // Maç bitmiş, sonucu belirle (Renklendirme için)
                let myMatchPoints = 0;
                if (myData.failed && oppData.failed) myMatchPoints = 1;
                else if (myData.failed) myMatchPoints = 0;
                else if (oppData.failed) myMatchPoints = 3;
                else if (myData.guesses.length < oppData.guesses.length) myMatchPoints = 3;
                else if (myData.guesses.length === oppData.guesses.length) myMatchPoints = 1;
                else myMatchPoints = 0;

                if (myMatchPoints === 3) sortCategory = 2; // Kazandım
                else if (myMatchPoints === 1) sortCategory = 3; // Berabere
                else sortCategory = 4; // Kaybettim
            }

            let matchObj = { 
                id: doc.id, 
                p1: p1, 
                p2: p2, 
                opponentName: opponentData ? opponentData.username : 'Bilinmiyor',
                sortCategory: sortCategory, 
                tier: tier,     // <-- Yeni: Maç başlatırken lazım olacak
                groupId: groupId, // <-- Yeni: Maç başlatırken lazım olacak
                ...data 
            };
            myMatchesList.push(matchObj);
        }
    });

    // 4. Henüz Hiç Oynanmamış Maçları Ekle (Placeholder)
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
                sortCategory: 0,
                tier: tier,       // <-- Önemli: UI'da butona basınca lazım
                groupId: groupId  // <-- Önemli
            });
        }
    });

    // Sıralamalar (Önce oynanmamışlar, sonra bekleyenler, sonra bitenler)
    myMatchesList.sort((a, b) => a.sortCategory - b.sortCategory);

    // Puan Durumu Sıralaması (Puan > Averaj > İsim)
    const standingsList = Object.values(participants).map(p => ({
        id: p.id,
        username: p.username,
        ...p.stats
    }));

    standingsList.sort((a, b) => {
        if (b.P !== a.P) return b.P - a.P; // Puan
        if (b.G !== a.G) return b.G - a.G; // Galibiyet sayısı (Averaj niyetine)
        return (a.username || '').localeCompare(b.username || '');
    });

    // UI'a Gönder
    const { renderLeagueMatches, renderLeagueStandings } = await import('./ui.js');
    
    const leagueScoreEl = document.getElementById('league-total-score');
    if(leagueScoreEl) leagueScoreEl.textContent = myTotalScore;

    // Hafta bilgisini de güncelle
    const weekDisplay = document.getElementById('league-week-display');
    if(weekDisplay) {
        const weekNum = weekID.split('-W')[1];
        weekDisplay.textContent = weekNum || 1;
    }

    renderLeagueMatches(myMatchesList, userId); 
    renderLeagueStandings(standingsList, userId); 
}

// js/game.js -> startLeagueMatch (GÜNCELLENMİŞ)

// js/game.js -> startLeagueMatch (GÜNCELLENMİŞ)

export async function startLeagueMatch(matchId, opponentId, opponentName) {
    const weekID = getCurrentWeekID();
    const userId = state.getUserId();
    
    // Kullanıcının güncel grubunu bulmamız lazım
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    
    const tier = userSnap.data().currentTier;
    const groupId = userSnap.data().currentGroupId;
    
    if (!tier || !groupId) {
        showToast("Lig bilgisi alınamadı.", true);
        return;
    }

    // YENİ YOL: tier ve group içine bakıyoruz
    const matchRef = doc(db, "leagues", weekID, "tiers", tier, "groups", groupId, "matches", matchId);
    const matchSnap = await getDoc(matchRef);
    
    let matchData;
    let secretWord;

    if (!matchSnap.exists()) {
        console.log("LOG: Maç veritabanında yok, yeni oluşturuluyor...");
        const len = 5; 
        
        try {
            secretWord = await getNewSecretWord(len);
        } catch (error) {
            console.warn("Sunucu hatası, yerel kelime seçiliyor:", error);
            secretWord = getRandomLocalWord(len);
        }

        if (!secretWord) {
            secretWord = getRandomLocalWord(len);
        }

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

        await setDoc(matchRef, matchData);
    } 
    else {
        matchData = matchSnap.data();
        secretWord = matchData.secretWord;

        if (!secretWord) {
            const len = 5;
            try {
                secretWord = await getNewSecretWord(len);
            } catch (e) {
                secretWord = getRandomLocalWord(len);
            }
            if(!secretWord) secretWord = getRandomLocalWord(len);
            
            matchData.secretWord = secretWord;
            await setDoc(matchRef, { secretWord: secretWord }, { merge: true });
        }
    }

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

    const now = new Date();
    const elapsed = Math.floor((now - startTime) / 1000);
    const timeLimit = 120;

    if (elapsed >= timeLimit) {
        showToast("Bu maçın süresi dolmuş! Tekrar giremezsiniz.", true);
        return; 
    }

    // js/game.js -> startLeagueMatch içinde:

    await startNewGame({
        mode: 'league',
        secretWord: secretWord,
        initialGuesses: previousGuesses,
        gameType: 'league' // <-- BU SATIRI EKLE (Garanti olsun)
    });

    const localData = state.getLocalGameData();
    localData.leagueMatchId = matchId;
    localData.leagueWeekID = weekID;
    
    // --- ÖNEMLİ: Lig Verilerini Local'e Kaydet ---
    // submitGuess yaparken nereye yazacağını bilsin
    localData.leagueTier = tier;       
    localData.leagueGroupId = groupId;
    // ---------------------------------------------
    
    localData.turnStartTime = startTime; 
    localData.currentPlayerId = userId; 
    state.setLocalGameData(localData);

    showToast(`${opponentName} ile maç başladı!`, false);
    
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
            dict.reverse(); 
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
                    cardEl.style.opacity = '0';
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
    
    btn.classList.remove('hidden', 'bg-green-600');
    btn.classList.add('bg-amber-600');
    btn.innerHTML = '<span>📖</span> Sözlüğe Ekle';
    btn.disabled = false;
    
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.onclick = () => addWordToDictionary(word);
}

async function startCpuLoop(botId = 'cpu') {
    if (cpuLoopTimeout) clearTimeout(cpuLoopTimeout);

    const localGameData = state.getLocalGameData();
    
    if (!localGameData || localGameData.status !== 'playing') return;

    const botState = localGameData.players[botId];
    if (!botState || botState.hasSolved || botState.hasFailed) {
        console.log(`BOT (${botState?.username}): Zaten bitirdi, döngü durduruldu.`);
        return;
    }

    const randomDelay = Math.floor(Math.random() * 4000) + 8000;
    
    console.log(`BOT (${botState.username}): Bir sonraki tahmin ${randomDelay / 1000} sn sonra.`);

    cpuLoopTimeout = setTimeout(async () => {
        const currentData = state.getLocalGameData();
        const currentBotState = currentData?.players[botId];

        if (!currentData || currentData.status !== 'playing') return;
        
        if (currentBotState.hasSolved || currentBotState.hasFailed) return;

        await cpuTurn(botId);

        startCpuLoop(botId);
    }, randomDelay);
}

function checkVsCpuGameEnd() {
    const localGameData = state.getLocalGameData();
    const userId = state.getUserId();
    
    const p1 = localGameData.players[userId];
    const cpu = localGameData.players['cpu'];

    if (!p1 || !cpu) return;

    const p1Done = p1.hasSolved || p1.hasFailed;
    const cpuDone = cpu.hasSolved || cpu.hasFailed;

    if (p1Done && cpuDone) {
        console.log("vsCPU: İki taraf da bitirdi. Oyun sonlanıyor.");
        localGameData.status = 'finished';
        
        if (p1.hasSolved && cpu.hasSolved) {
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
            localGameData.roundWinner = null; 
        }

        state.setLocalGameData(localGameData);
        stopTurnTimer();
        
        renderGameState(localGameData, true).then(() => {
            setTimeout(() => showScoreboard(localGameData), 1500);
        });
    }
}

function getRandomLocalWord(length) {
    const lenStr = String(length);
    const list = allWordList[lenStr] || allWordList["5"]; 
    if (list && list.length > 0) {
        return list[Math.floor(Math.random() * list.length)];
    }
    return "KALEM"; 
}

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

async function assignBotToGame(gameId) {
    const botId = 'bot_' + Date.now(); 
    const botName = getRandomBotName();
    
    console.log(`LOG: 45sn doldu. Bot atanıyor: ${botName}`);

    const gameRef = doc(db, "games", gameId);
    
    const botPlayerState = { 
        username: botName, 
        guesses: [], 
        score: 0, 
        jokersUsed: { present: false, correct: false, remove: false },
        isBot: true 
    };

    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;
            
            const gameData = gameDoc.data();
            
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

export async function startQuickFriendGame(friendId) {
    if (!friendId) return;

    showToast("Oyun oluşturuluyor...", false);

    await createGame({
        invitedFriendId: friendId,
        timeLimit: 120, 
        matchLength: 5, 
        gameType: 'friend' 
    });
}

// js/game.js -> populateLeagueWithBots

export async function populateLeagueWithBots(weekID) {
    // Bot isimlerini karıştıralım ki hep aynı sıra olmasın
    const shuffledNames = [...botNames].sort(() => 0.5 - Math.random());
    const botsToAdd = shuffledNames.slice(0, 15); // İlk 15 ismi al

    const promises = botsToAdd.map((name, index) => {
        // Bot ID'si çakışmasın diye timestamp ekliyoruz
        const botId = `player_${Date.now()}_${index}`; 
        
        // ZAMAN HİLESİ: Bot sanki 2 saat ile 3 gün önce katılmış gibi yapalım
        const pastTime = new Date();
        const hoursBack = Math.floor(Math.random() * 72) + 2; // 2 ila 74 saat önce
        pastTime.setHours(pastTime.getHours() - hoursBack);

        const botData = {
            username: name,
            joinedAt: pastTime, // Firebase bunu tarih olarak kaydeder
            score: Math.floor(Math.random() * 60), // 0-60 arası rastgele puanla başlasınlar (daha gerçekçi)
            isBot: true, 
            stats: { O: 0, G: 0, B: 0, M: 0, P: 0 } 
        };
        
        return setDoc(doc(db, "leagues", weekID, "participants", botId), botData);
    });

    try {
        await Promise.all(promises);
        console.log("Lig ortamı hazırlandı: 15 sanal oyuncu yerleştirildi.");
    } catch (error) {
        console.error("Bot ekleme hatası:", error);
    }
}

export async function sendLobbyInvite(friendId) {
    const gameId = state.getCurrentGameId();
    if (!gameId || !friendId) return;

    try {
        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, {
            invitedPlayerIds: arrayUnion(friendId)
        });
        showToast("Davet gönderildi!", false);
    } catch (error) {
        console.error("Davet gönderme hatası:", error);
        showToast("Davet gönderilemedi.", true);
    }
}

// js/game.js içine yeni fonksiyon ekle:

export async function joinRandomBRGame() {
    const userId = state.getUserId();
    if (!userId) return showToast("Giriş yapmalısın.", true);

    showToast("Açık oyun aranıyor...", false);

    try {
        const gamesRef = collection(db, 'games');
        // Sorgu: BR oyunu + Bekliyor + Public (Herkese Açık)
        const q = query(
            gamesRef, 
            where('gameType', '==', 'multiplayer-br'),
            where('status', '==', 'waiting'),
            where('visibility', '==', 'public'), 
            limit(5)
        );

        const snapshot = await getDocs(q);
        let foundGameId = null;

        // Kendi kurmadığımız ve dolu olmayan ilk oyunu bul
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.creatorId !== userId && data.playerIds.length < (data.maxPlayers || 8)) {
                foundGameId = doc.id;
                break;
            }
        }

        if (foundGameId) {
            showToast("Oyun bulundu! Katılınıyor...");
            await joinBRGame(foundGameId);
        } else {
            showToast("Açık oyun bulunamadı. Yeni bir tane kurabilirsin.", true);
        }

    } catch (error) {
        console.error("Rastgele oyun arama hatası:", error);
        showToast("Hata oluştu.", true);
    }
}

// js/game.js EN ALTINA EKLE:

async function getGlobalWeeklyStats() {
    const todayIndex = getDaysSinceEpoch();
    const startDay = todayIndex - 7;
    
    try {
        const leaderboardRef = collection(db, 'daily_leaderboard');
        // Sadece tarih filtresi (Herkesin verisi)
        const q = query(leaderboardRef, where('dayIndex', '>', startDay));
        
        const snapshot = await getDocs(q);
        let totalScore = 0;
        let totalGuesses = 0;
        let count = 0;

        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.didWin) { // Sadece kazananları ortalamaya katıyoruz
                totalScore += d.score;
                totalGuesses += d.guessCount;
                count++;
            }
        });

        console.log(`Global İstatistik: ${count} oyun incelendi.`);

        if (count === 0) return { avgScore: 0, avgGuesses: 0 };

        return {
            avgScore: Math.round(totalScore / count),
            avgGuesses: (totalGuesses / count).toFixed(1)
        };

    } catch (e) {
        console.error("Global veri hatası:", e);
        return { avgScore: 0, avgGuesses: 0 };
    }
}

// ===================================================
// === BAĞLANTI VE DURUM YÖNETİMİ (YENİ EKLENECEK) ===
// ===================================================

export function setupVisibilityHandler(gameId) {
    // Tarayıcı sekmesi gizlendiğinde/açıldığında çalışır
    document.addEventListener("visibilitychange", () => {
        const userId = state.getUserId();
        if (!userId || !gameId) return;

        const status = document.hidden ? 'away' : 'online';
        const gameRef = doc(db, "games", gameId);

        // Durumu güncelle (Hata olsa bile devam et, kritik değil)
        updateDoc(gameRef, {
            [`players.${userId}.status`]: status,
            [`players.${userId}.lastActive`]: serverTimestamp()
        }).catch(err => console.log("Durum güncellenemedi:", err));
    });
}

// ==========================================
// === ŞİFRE SIFIRLAMA SİSTEMİ (YENİ) ===
// ==========================================

function setupForgotPasswordSystem() {
    // index.html'e eklediğimiz ID'leri kullanarak elementleri seçiyoruz
    const forgotLink = document.getElementById('forgot-password-link');
    const modal = document.getElementById('reset-password-modal');
    const closeBtn = document.getElementById('close-reset-modal');
    const sendBtn = document.getElementById('send-reset-btn');
    const emailInput = document.getElementById('reset-email-input');
    const statusMsg = document.getElementById('reset-status-msg');

    // Eğer bu elementler sayfada yoksa (örn: oyun ekranındaysak) hata vermesin diye durduruyoruz.
    if (!forgotLink || !modal) return;

    console.log("Şifre sıfırlama sistemi aktif.");

    // 1. "Şifremi Unuttum" linkine tıklayınca Modalı Aç
    forgotLink.onclick = (e) => {
        e.preventDefault(); // Sayfanın yukarı kaymasını engelle
        modal.classList.remove('hidden');
        if(emailInput) {
            emailInput.value = ''; // Eski yazılanı temizle
            emailInput.focus();
        }
        if(statusMsg) statusMsg.classList.add('hidden');
    };

    // 2. Modalı Kapatma Fonksiyonu
    const closeModal = () => modal.classList.add('hidden');
    
    if(closeBtn) closeBtn.onclick = closeModal;
    
    // Siyah boşluğa tıklayınca kapat
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    // 3. "Gönder" Butonuna Tıklanınca
    if(sendBtn) {
        sendBtn.onclick = async () => {
            const email = emailInput.value.trim();
            
            if (!email) {
                showResetStatus("Lütfen bir e-posta adresi gir.", "text-red-400");
                return;
            }

            // Butonu kilitle
            sendBtn.disabled = true;
            sendBtn.textContent = "Gönderiliyor...";

            try {
                // Firebase'e sinyal gönder
                await sendPasswordResetEmail(auth, email);
                
                showResetStatus("✅ Bağlantı gönderildi! E-postanı (Spam kutusu dahil) kontrol et.", "text-green-400");
                
                // 3 saniye sonra modalı kapat ve butonu düzelt
                setTimeout(() => {
                    closeModal();
                    sendBtn.disabled = false;
                    sendBtn.textContent = "Sıfırlama Linki Gönder";
                }, 3000);

            } catch (error) {
                console.error("Şifre sıfırlama hatası:", error);
                let msg = "Bir hata oluştu.";
                
                if (error.code === 'auth/user-not-found') msg = "Bu e-posta ile kayıtlı kullanıcı bulunamadı.";
                if (error.code === 'auth/invalid-email') msg = "Geçersiz e-posta formatı.";
                if (error.code === 'auth/too-many-requests') msg = "Çok fazla deneme yaptınız. Biraz bekleyin.";
                
                showResetStatus("❌ " + msg, "text-red-400");
                
                // Butonu tekrar aç
                sendBtn.disabled = false;
                sendBtn.textContent = "Sıfırlama Linki Gönder";
            }
        };
    }

    // Yardımcı: Mesaj Gösterme
    function showResetStatus(text, colorClass) {
        if(!statusMsg) return;
        statusMsg.textContent = text;
        statusMsg.className = `mt-3 text-center text-sm font-medium ${colorClass}`;
        statusMsg.classList.remove('hidden');
    }
}

// Sistemi sayfa yüklendiğinde otomatik başlat
// (DOM elementlerinin hazır olduğundan emin olmak için setTimeout kullanıyoruz)
setTimeout(setupForgotPasswordSystem, 500);


// js/game.js - EN ALTA EKLE

// HAFTALIK GENEL SIRALAMA VE TOPLAM OYUNCU SAYISI
async function calculateWeeklyLeaderboard(currentUserId) {
    const todayIndex = getDaysSinceEpoch();
    const startDay = todayIndex - 7;

    try {
        const leaderboardRef = collection(db, 'daily_leaderboard');
        // Son 7 günün tüm kayıtlarını çekiyoruz
        const q = query(leaderboardRef, where('dayIndex', '>', startDay));
        const snapshot = await getDocs(q);

        const playerStats = {};

        // Her oyuncunun toplam puanını ve maç sayısını topla
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!data.didWin) return; // Sadece kazanılanlar

            if (!playerStats[data.userId]) {
                playerStats[data.userId] = { totalScore: 0, games: 0, userId: data.userId };
            }
            playerStats[data.userId].totalScore += data.score;
            playerStats[data.userId].games += 1;
        });

        // Ortalamaları hesapla
        const leaderboard = Object.values(playerStats).map(p => ({
            userId: p.userId,
            avgScore: Math.round(p.totalScore / p.games)
        }));

        // Puana göre sırala (Yüksekten düşüğe)
        leaderboard.sort((a, b) => b.avgScore - a.avgScore);

        // Kullanıcının sırasını bul
        const myRankIndex = leaderboard.findIndex(p => p.userId === currentUserId);
        const myRank = myRankIndex !== -1 ? myRankIndex + 1 : '-';
        
        return {
            myRank: myRank,
            totalPlayers: leaderboard.length
        };

    } catch (error) {
        console.error("Haftalık sıralama hatası:", error);
        return { myRank: '-', totalPlayers: '-' };
    }
}