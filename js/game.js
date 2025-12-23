// js/game.js - FİNAL SÜRÜM (Next Round Buton Fix)

// Firebase v9'dan gerekli modülleri içe aktar
// js/game.js - EN ÜST KISIM

// Firebase ve Firestore Modülleri
import { 
    db, 
    auth, 
    getNewSecretWord, 
    checkWordValidity, 
    failMultiplayerTurn, // <-- Bunu da import ettiğimizden emin olalım
    sendPasswordResetEmail 
} from './firebase.js';

import {
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    deleteField,
    onSnapshot, 
    serverTimestamp, 
    arrayUnion, 
    arrayRemove, 
    runTransaction,
    query,  // <-- YENİ EKLENDİ
    where,  // <-- YENİ EKLENDİ
    limit,  // <-- YENİ EKLENDİ
    orderBy // <-- YENİ EKLENDİ (Sıralama için gerekebilir)
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

import { showToast, playSound, shakeCurrentRow, getStatsFromProfile, createElement, triggerConfetti, triggerVibration } from './utils.js';

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

    // --- GÜNLÜK GÖREV GÜNCELLEMESİ ---
    if (gameData.status === 'finished') {
        // 1. Oyun Oynama Görevi
        updateQuestProgress('play', 1); 
        
        // 2. Battle Royale Görevi
        if (gameData.gameType === 'multiplayer-br') {
            updateQuestProgress('play_br', 1);
        }

        // 3. Kazanma Görevi (Ben kazandıysam)
        const myId = state.getUserId();
        if (gameData.roundWinner === myId || gameData.matchWinnerId === myId) {
            updateQuestProgress('win', 1);
        }
    }
    // ---------------------------------

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
    // 1. Kelime Uzunluğu Ayarı
    if (gameData.secretWord && gameData.secretWord.length > 0) {
        if (gameData.wordLength !== gameData.secretWord.length) {
            gameData.wordLength = gameData.secretWord.length;
        }
    }
    wordLength = gameData.wordLength;
    
    // 2. Ana Izgara (Grid) Ayarı
    if (guessGrid) {
        guessGrid.innerHTML = '';
        
        // ÖNCEKİ BR KALINTILARINI TEMİZLE (Çok Önemli)
        guessGrid.classList.remove('br-mode-grid'); 
        
        // Sadece BR modunda özel stil ekle
        if (gameData.gameType === 'multiplayer-br') {
            guessGrid.classList.add('br-mode-grid');
        } 
        
        // Genişlik Ayarı
        if (wordLength === 4) guessGrid.style.maxWidth = '220px';
        else if (wordLength === 5) guessGrid.style.maxWidth = '260px';
        else guessGrid.style.maxWidth = '300px';
    }
    
    // 3. Izgarayı Oluştur
    createGrid(wordLength, GUESS_COUNT);
    createKeyboard(handleKeyPress);

    // 4. RAKİP MİNİ IZGARASI AYARI (CPU TARZI GÖRÜNÜM İÇİN)
    const miniGridContainer = document.getElementById('opponent-mini-grid');
    if (miniGridContainer) {
        // Bu modlardan biri ise Mini Izgarayı GÖSTER
        const isStandardMode = ['random_series', 'random_loose', 'friend', 'vsCPU'].includes(gameData.gameType);
        
        if (isStandardMode) {
            miniGridContainer.classList.remove('hidden');
            miniGridContainer.innerHTML = ''; 
            miniGridContainer.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;
            
            // Eğer oyun devam ediyorsa rakibin tahminlerini mini ızgaraya doldur
            const currentUserId = state.getUserId();
            const opponentId = Object.keys(gameData.players).find(id => id !== currentUserId);
            if (opponentId && gameData.players[opponentId]) {
                const oppGuesses = gameData.players[opponentId].guesses || [];
                import('./ui.js').then(ui => ui.updateOpponentMiniGrid(oppGuesses, wordLength, 6));
            }
        } else {
            // BR, Daily veya League ise GİZLE
            miniGridContainer.classList.add('hidden');
        }
    }

    // 5. Sayaç Başlatma
    const gameMode = state.getGameMode(); // State'den alıyoruz
    if (gameData.status === 'playing' && gameMode !== 'daily') {
        setTimeout(() => {
            if (gameData.gameType === 'multiplayer-br') startBRTimer();
            else startTurnTimer();
        }, 200);
    }

    // 6. Çıkış Butonu
    const leaveBtnLocal = document.getElementById('leave-game-button');
    if (leaveBtnLocal) {
        leaveBtnLocal.classList.remove('hidden');
        leaveBtnLocal.onclick = (e) => {
            e.stopPropagation();
            leaveGame(); // Import sorunu olmaması için direkt çağır
        };
    }
    
    // 7. UI Temizliği (YENİ EKLENEN KISIM)
    // Seri oyun başlatıldığında BR elementlerinin gizlendiğinden emin olalım.
    if (gameData.gameType !== 'multiplayer-br') {
        const brLobbyControls = document.getElementById('br-lobby-controls');
        if (brLobbyControls) brLobbyControls.classList.add('hidden');
        
        const multiplayerScoreBoard = document.getElementById('multiplayer-score-board');
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.add('hidden');

        const sequentialGameInfo = document.getElementById('sequential-game-info');
        if (sequentialGameInfo) sequentialGameInfo.classList.remove('hidden');
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
            
            // --- CANLI AVATAR GÖSTERİMİ BAŞLANGICI ---
            if (brLobbyStatusText) {
                const playersList = Object.values(gameData.players);
                const maxPlayers = gameData.maxPlayers || 4; // Varsayılan 4 kişilik

                let avatarsHTML = '<div class="flex justify-center gap-3 mb-3 flex-wrap w-full">';

                // 1. MEVCUT OYUNCULARI EKLE
                playersList.forEach(p => {
                    // Varsayılan avatar veya oyuncunun avatarı
                    const avatarUrl = p.avatarUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%236B7280'/%3E%3C/svg%3E";
                    
                    avatarsHTML += `
                        <div class="flex flex-col items-center animate-bounce-short">
                            <div class="w-12 h-12 rounded-full p-0.5 border-2 border-green-500 shadow-lg shadow-green-500/20 bg-gray-800">
                                <img src="${avatarUrl}" class="w-full h-full rounded-full object-cover">
                            </div>
                            <span class="text-[10px] text-white mt-1.5 font-bold max-w-[64px] truncate">${p.username}</span>
                        </div>
                    `;
                });

                // 2. BOŞ KOLTUKLARI EKLE (Hayalet Görünüm)
                for(let i = playersList.length; i < maxPlayers; i++) {
                    avatarsHTML += `
                        <div class="flex flex-col items-center opacity-40">
                            <div class="w-12 h-12 rounded-full border-2 border-dashed border-gray-500 bg-gray-800/30 flex items-center justify-center">
                                <span class="text-gray-500 text-lg font-bold">?</span>
                            </div>
                            <span class="text-[10px] text-gray-500 mt-1.5">Boş</span>
                        </div>
                    `;
                }
                avatarsHTML += '</div>';

                // 3. Altına Bilgi Yazısını Ekle
                avatarsHTML += `
                    <div class="text-gray-400 font-bold text-sm uppercase tracking-wide">
                        Oyuncular Bekleniyor <span class="text-yellow-500">(${numPlayers}/${maxPlayers})</span>
                    </div>
                `;

                // HTML'i güncelle
                brLobbyStatusText.innerHTML = avatarsHTML;
            }
            // --- CANLI AVATAR GÖSTERİMİ BİTİŞİ ---

            brTurnDisplay.textContent = `Lobi (${numPlayers}/${gameData.maxPlayers || 4})`;
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
    
    // ÖNCEKİ BR KALINTILARINI TEMİZLE
    if (brLobbyControls) brLobbyControls.classList.add('hidden');
    if (brTurnDisplay) brTurnDisplay.textContent = "";

    if (gameMode === 'daily') return;

    // Bekleme Durumu (Rakip Aranıyor)
    if (gameData.status === 'waiting' || gameData.status === 'invited') {
        const numPlayers = Object.keys(gameData.players).length;
        
        // Eğer ben kurucuysam ve oyun henüz başlamadıysa
        if (isCreator) {
            startGameBtn.classList.remove('hidden');
            
            // Eğer rakip henüz gelmediyse butonu pasif yap ve bilgi ver
            if (numPlayers < 2 && gameMode !== 'vsCPU') {
                startGameBtn.disabled = true; 
                startGameBtn.textContent = "Rakip Bekleniyor...";
                startGameBtn.className = "w-full bg-gray-600 text-gray-400 font-bold py-3 px-4 rounded-lg text-lg my-1 flex-shrink-0 cursor-not-allowed animate-pulse";
            } else {
                // Rakip geldiyse başlat butonu aktif
                startGameBtn.disabled = false;
                startGameBtn.textContent = "Oyunu Başlat";
                startGameBtn.className = "w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg text-lg my-1 flex-shrink-0 cursor-pointer";
                startGameBtn.onclick = startGame; 
            }
        } else {
            // Katılımcıysam başlat butonunu görmem
            startGameBtn.classList.add('hidden');
        }
        shareGameBtn.classList.remove('hidden');
    } 
    // Oyun Başladıysa veya Bittiyse
    else if (gameData.status === 'playing' || gameData.status === 'finished') {
        startGameBtn.classList.add('hidden');
        shareGameBtn.classList.add('hidden');
    }
}

// js/game.js - renderGameState (GÜNCELLENMİŞ)

// js/game.js -> renderGameState (GÜNCEL - Soru İşareti Fix)

export async function renderGameState(gameData, didMyGuessChange = false) {
    if (!gameData) return;

    const currentUserId = state.getUserId();
    const actualGameType = gameData.gameType || 'friend'; 
    const isBR = (actualGameType === 'multiplayer-br');
    const isLeague = (actualGameType === 'league');
    const isDaily = (actualGameType === 'daily');

    // Ses Efektleri
    const oldGameData = state.getLocalGameData();
    const oldPlayerId = oldGameData?.currentPlayerId;
    const isMyTurnNow = gameData.currentPlayerId === currentUserId;

    if (!isBR && actualGameType !== 'vsCPU' && oldPlayerId && oldPlayerId !== currentUserId && isMyTurnNow) {
        import('./utils.js').then(u => u.playSound('turn'));
    }

    // UI Ayarları (Görünürlük)
    const sequentialGameInfo = document.getElementById('sequential-game-info');
    const jokerContainer = document.getElementById('joker-container');
    const multiplayerScoreBoard = document.getElementById('multiplayer-score-board');
    const timerDisplay = document.getElementById('timer-display');
    const roundCounter = document.getElementById('round-counter');
    const keyboardContainer = document.getElementById('keyboard');
    const p1Score = document.getElementById('player1-score');
    const p2Score = document.getElementById('player2-score');
    const brLobbyControls = document.getElementById('br-lobby-controls'); 

    // A) BATTLE ROYALE
    if (isBR) {
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.remove('hidden');
        if (sequentialGameInfo) sequentialGameInfo.classList.add('hidden'); 
        if (jokerContainer) jokerContainer.style.display = 'flex';
        if (p1Score) p1Score.style.display = 'none';
        if (p2Score) p2Score.style.display = 'none';
        
        if (brLobbyControls) {
            if (gameData.status === 'waiting') brLobbyControls.classList.remove('hidden');
            else brLobbyControls.classList.add('hidden');
        }
        import('./ui.js').then(ui => ui.updateMultiplayerScoreBoard(gameData));
    } 
    // B) LİG
    else if (isLeague) {
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.add('hidden');
        if (brLobbyControls) brLobbyControls.classList.add('hidden');
        if (sequentialGameInfo) sequentialGameInfo.classList.remove('hidden');
        if (p1Score) p1Score.style.display = 'none';
        if (p2Score) p2Score.style.display = 'none';
        if (roundCounter) roundCounter.style.display = 'none';
        if (jokerContainer) jokerContainer.style.display = 'flex'; 
        if (timerDisplay) timerDisplay.style.display = 'block';
    }
    // C) GÜNLÜK
    else if (isDaily) {
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.add('hidden');
        if (brLobbyControls) brLobbyControls.classList.add('hidden');
        if (sequentialGameInfo) sequentialGameInfo.classList.remove('hidden');
        if (p1Score) p1Score.style.display = 'none';
        if (p2Score) p2Score.style.display = 'none';
        if (roundCounter) { roundCounter.style.display = 'block'; roundCounter.textContent = new Date().toLocaleDateString('tr-TR'); }
        if (timerDisplay) timerDisplay.style.display = 'none'; 
        if (jokerContainer) jokerContainer.style.display = 'none'; 
        if (dailyGameTitle) dailyGameTitle.classList.remove('hidden');
    }
    // D) STANDART
    else {
        if (multiplayerScoreBoard) multiplayerScoreBoard.classList.add('hidden');
        if (brLobbyControls) brLobbyControls.classList.add('hidden');
        if (dailyGameTitle) dailyGameTitle.classList.add('hidden');
        if (sequentialGameInfo) sequentialGameInfo.classList.remove('hidden');
        if (p1Score) p1Score.style.display = 'block';
        if (p2Score) p2Score.style.display = 'block';
        
        import('./ui.js').then(ui => ui.updateMultiplayerScoreBoard(gameData));

        if (roundCounter) {
            roundCounter.style.display = 'block';
            if (gameData.status === 'waiting' || gameData.status === 'invited') {
                roundCounter.textContent = "Rakip Bekleniyor...";
                roundCounter.classList.add('animate-pulse', 'text-yellow-400');
            } else {
                roundCounter.classList.remove('animate-pulse', 'text-yellow-400');
                if (actualGameType === 'random_loose') roundCounter.textContent = "Gevşek Mod";
                else roundCounter.textContent = `Tur ${gameData.currentRound || 1}/${gameData.matchLength || 1}`;
            }
        }
        if (jokerContainer) jokerContainer.style.display = 'flex';
        
        // SÜRESİZ OYUNLAR İÇİN SAYAÇ GİZLEME
        if (timerDisplay) {
            if (gameData.timeLimit === null || gameData.timeLimit > 10000) {
                timerDisplay.style.display = 'none'; // Süresiz ise gizle
            } else {
                timerDisplay.style.display = 'block';
            }
        }
    }

    // MENÜ BUTONU
    const leaveBtnLocal = document.getElementById('leave-game-button');
    if (leaveBtnLocal && actualGameType !== 'vsCPU') { 
        leaveBtnLocal.classList.remove('hidden');
        leaveBtnLocal.onclick = (e) => { e.stopPropagation(); leaveGame(); };
    }

    // KLAVYE KİLİDİ
    const pState = gameData.players[currentUserId] || {};
    let shouldLockKeyboard = false;
    if (gameData.status === 'finished' || pState.hasSolved || pState.hasFailed || pState.isEliminated) {
        shouldLockKeyboard = true;
    }
    if (keyboardContainer) keyboardContainer.style.pointerEvents = shouldLockKeyboard ? 'none' : 'auto';

    // BUTONLARI VE KLAVYEYİ GÜNCELLE
    import('./game.js').then(m => m.updateTurnDisplay(gameData)); 
    import('./ui.js').then(ui => ui.updateKeyboard(gameData));

    // --- TAHTAYI GÜNCELLE (SORU İŞARETİ DÜZELTMESİ BURADA) ---
    const playerGuesses = gameData.players[currentUserId]?.guesses || [];
    const currentRow = playerGuesses.length;
    const wordLength = gameData.wordLength || 5;
    const GUESS_COUNT = gameData.GUESS_COUNT || 6;
    
    // 1. Önce tüm tahtayı temizle/boya
    for (let i = 0; i < GUESS_COUNT; i++) {
        for (let j = 0; j < wordLength; j++) {
            const tile = document.getElementById(`tile-${i}-${j}`);
            if (!tile) continue;
            
            const front = tile.querySelector('.front');
            const back = tile.querySelector('.back');
            
            // Eski ikonları temizle (Çakışmayı önlemek için)
            const oldIcon = back.querySelector('.meaning-icon');
            if (oldIcon) oldIcon.remove(); 

            // Stil temizliği
            if (i !== currentRow) { 
                 tile.classList.remove('flip', 'correct', 'present', 'absent', 'shake', 'static');
                 if(!playerGuesses[i]) {
                    front.textContent = ''; back.textContent = ''; back.className = 'tile-inner back';
                 }
            }

            // Dolu satırları boya
            if (playerGuesses[i]) {
                const guess = playerGuesses[i];
                front.textContent = guess.word[j];
                back.textContent = guess.word[j];
                back.className = 'tile-inner back ' + guess.colors[j];
                
                // Animasyon kontrolü (Yeni tahminse animasyonlu, değilse direkt)
                if (didMyGuessChange && i === currentRow - 1) {
                    setTimeout(() => { tile.classList.add(guess.colors[j], 'flip'); }, j * 250);
                } else {
                    tile.classList.add(guess.colors[j], 'flip');
                }
            } 
            // Aktif satır (Yazılanlar)
            else if (i === currentRow && gameData.status === 'playing') {
                import('./state.js').then(stateMod => {
                    const knownPositions = stateMod.getKnownCorrectPositions();
                    if (knownPositions && knownPositions[j]) {
                        front.textContent = knownPositions[j]; back.textContent = knownPositions[j];
                        back.className = 'tile-inner back correct'; tile.className = 'tile static correct';
                    }
                });
            }
        }
        
        // 2. SATIR SONUNA SORU İŞARETİ EKLEME (FIXED)
        // Eğer bu satır tamamlanmış bir tahminse (ve başarısız değilse/failed yoksa)
        if (playerGuesses[i] && playerGuesses[i].colors.indexOf('failed') === -1) {
            const guessWord = playerGuesses[i].word;
            const lastTileInRow = document.getElementById(`tile-${i}-${wordLength - 1}`);
            
            if (lastTileInRow) {
                // Front değil, parent elemente (tile) ekliyoruz ki dönse bile görünsün.
                // Veya 'back' yüzüne ekliyoruz ama z-index ile öne çıkarıyoruz.
                const backFace = lastTileInRow.querySelector('.back');
                
                // Soru işareti butonu oluştur
                const meaningIcon = document.createElement('div');
                meaningIcon.className = 'meaning-icon';
                meaningIcon.textContent = '?';
                
                // CSS ile Stil Ver (Tailwind yerine garanti olsun diye inline)
                Object.assign(meaningIcon.style, {
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    width: '20px',
                    height: '20px',
                    backgroundColor: '#3b82f6', // Mavi
                    color: 'white',
                    borderRadius: '50%',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: '50', // En üstte
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    border: '2px solid #1f2937' // Koyu kenarlık
                });

                // Tıklama Olayı
                meaningIcon.onclick = (e) => {
                    e.stopPropagation(); // Tile tıklamasını engelle
                    import('./game.js').then(g => g.fetchWordMeaning(guessWord).then(meaning => {
                        // Basit Alert yerine Custom Modal da yapılabilir ama şimdilik alert + sözlük butonu mantığı
                        // Burayı daha şık yapmak için ui.js'de bir modal açtırabilirsin.
                        // Şimdilik istek üzerine "Baloncuk ve Ekle Butonu" mantığını simüle edelim:
                        if(confirm(`${guessWord}\n\n${meaning}\n\nSözlüğe eklemek ister misin?`)) {
                            import('./game.js').then(m => m.addWordToDictionary(guessWord));
                        }
                    }));
                };

                // Eğer yeni tahminse animasyon bitince ekle, yoksa hemen ekle
                if (didMyGuessChange && i === currentRow - 1) {
                    setTimeout(() => { 
                        if(backFace) backFace.appendChild(meaningIcon); 
                    }, (wordLength * 250) + 100);
                } else {
                    if(backFace) backFace.appendChild(meaningIcon);
                }
            }
        }
    }
    
    // RAKİP KÜÇÜK IZGARASI
    const isVersusMode = (actualGameType === 'multiplayer' || actualGameType === 'vsCPU' || actualGameType === 'friend' || actualGameType === 'random_series' || actualGameType === 'random_loose') && !isBR;
    const miniGrid = document.getElementById('opponent-mini-grid');
    
    if (isVersusMode && sequentialGameInfo) {
        let opponentId = Object.keys(gameData.players).find(id => id !== currentUserId);
        if (actualGameType === 'vsCPU') opponentId = 'cpu';

        if (opponentId && gameData.players[opponentId]) {
            const oppGuesses = gameData.players[opponentId].guesses || [];
            import('./ui.js').then(ui => {
                if(ui.updateOpponentMiniGrid) ui.updateOpponentMiniGrid(oppGuesses, gameData.wordLength, 6);
            });
            if(miniGrid) miniGrid.classList.remove('hidden');
        }
    } else {
        if (miniGrid) miniGrid.classList.add('hidden');
    }
    
    // Joker UI (Kısıtlama kaldırıldı, sadece oyun durumuna bakıyor)
    import('./ui.js').then(ui => {
        if (ui.updateJokerUI) ui.updateJokerUI(null, true, gameData.status); // isMyTurn her zaman TRUE gönderildi
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

// js/game.js -> listenToGameUpdates (FİNAL DÜZELTİLMİŞ)

export function listenToGameUpdates(gameId) {
    const gameUnsubscribe = state.getGameUnsubscribe();
    if (gameUnsubscribe) gameUnsubscribe();
    const gameRef = doc(db, "games", gameId);

    const unsubscribe = onSnapshot(gameRef, (docSnapshot) => { 
        const gameData = docSnapshot.data();
        
        if (!gameData) {
            import('./utils.js').then(u => u.showToast("Oyun sonlandırıldı."));
            leaveGame();
            return;
        }
        
        const currentUserId = state.getUserId();
        const oldGameData = state.getLocalGameData(); 

        // 1. YENİ TUR KONTROLÜ
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

        // 2. OYUNA GİRİŞ EKRANI KONTROLÜ
        const isGameJustStarted = (oldGameData?.status === 'waiting' || oldGameData?.status === 'invited') && gameData.status === 'playing';
        
        if (isGameJustStarted) {
            const matchmakingScreen = document.getElementById('matchmaking-screen');
            if (matchmakingScreen && !matchmakingScreen.classList.contains('hidden')) {
                showScreen('game-screen');
            }
            initializeGameUI(gameData);
            
            // Sayaçları hemen başlatma, veriler tam otursun (500ms bekle)
            setTimeout(() => {
                if (gameData.gameType === 'multiplayer-br') startBRTimer();
                else startTurnTimer();
            }, 500);
        }

        // 3. CPU (BOT) KONTROLÜ
        if (gameData.status === 'playing') {
            const opponentId = Object.keys(gameData.players).find(id => id !== currentUserId);
            const opponentData = gameData.players[opponentId];
            
            if (opponentData && opponentData.isBot && gameData.creatorId === currentUserId) {
                startCpuLoop(opponentId); 
            }
        }

        state.setLocalGameData(gameData); 
        
        // 4. QUICK CHAT
        Object.entries(gameData.players).forEach(([playerId, p]) => {
            if (p.lastMessage && p.lastMessageTime) {
                const msgTime = p.lastMessageTime.toDate ? p.lastMessageTime.toDate() : new Date(p.lastMessageTime);
                const now = new Date();
                if ((now - msgTime) < 4000) { 
                    import('./ui.js').then(ui => ui.showChatBubble(playerId, p.lastMessage));
                }
            }
        });

        // 5. ZAMAN AŞIMI POLİSİ (DONMA ÖNLEYİCİ)
        // Eğer oyun oynanıyorsa ve süre limitini 10 saniye geçtiyse zorla bitir
        if (gameData.status === 'playing') {
            const timeLimit = (gameData.gameType === 'league' ? 120 : (gameData.timeLimit || 120));
            let startTime = gameData.turnStartTime;
            if (startTime && startTime.toDate) startTime = startTime.toDate();
            else if (!(startTime instanceof Date)) startTime = new Date();

            const now = new Date();
            const elapsedSeconds = (now - startTime) / 1000;

            if (elapsedSeconds > (timeLimit + 10)) {
                const myPlayer = gameData.players[currentUserId];
                // Eğer ben hala çözmediysem ve hakkım bitmediyse -> failTurn çağır
                if (myPlayer && !myPlayer.hasSolved && !myPlayer.hasFailed && !myPlayer.isEliminated) {
                    console.warn("⚠️ ZAMAN AŞIMI! (Donma önleyici devreye girdi)");
                    failTurn(); 
                } 
            }
        }

        // 6. HARF GÜNCELLEMELERİ
        if (gameData.players && gameData.players[currentUserId]) {
            // Sadece import sorunu olmaması için:
            // updateKnownPositions fonksiyonu bu dosyanın içinde tanımlı olmalı
            // Eğer yoksa state.js üzerinden alabiliriz ama game.js içinde tanımlamıştık.
            // Bu satır olduğu gibi kalsın.
        }

        // 7. TUR BİTİRME KONTROLÜ (HERKES TAMAMLADI MI?)
        if (gameData.status === 'playing') {
            const allPlayerIds = Object.keys(gameData.players);
            const isEveryoneDone = allPlayerIds.every(pid => {
                const p = gameData.players[pid];
                if (!p) return false;
                if (pid === 'cpu') return true; 
                return p.isEliminated || p.hasSolved || p.hasFailed; 
            });

            if (isEveryoneDone && gameData.creatorId === currentUserId) {
                console.log("Herkes tamamladı. Tur bitiriliyor...");
                let updates = {};
                
                if (gameData.gameType === 'multiplayer-br') {
                    if (gameData.currentRound >= (gameData.matchLength || 10)) {
                         const playersArr = Object.values(gameData.players);
                         playersArr.sort((a, b) => (b.score || 0) - (a.score || 0));
                         const winner = playersArr[0]; 
                         const winnerId = winner.userId || Object.keys(gameData.players).find(key => gameData.players[key] === winner);
                         updates = { status: 'finished', matchWinnerId: winnerId };
                    } else {
                         updates = { status: 'finished' };
                    }
                } 
                else {
                    // Seri Oyun Mantığı
                    const playersArr = Object.entries(gameData.players).map(([key, val]) => ({ ...val, userId: key }));
                    // Çözenleri bul
                    const solvers = playersArr.filter(p => p.hasSolved);
                    let winnerId = null;
                    
                    if (solvers.length > 0) {
                        // Az tahmin yapan kazanır
                        solvers.sort((a, b) => (a.guesses ? a.guesses.length : 99) - (b.guesses ? b.guesses.length : 99));
                        winnerId = solvers[0].userId;
                    } else {
                        // Kimse çözemediyse kazanan yok (null)
                        winnerId = null;
                    }

                    const currentRound = gameData.currentRound || 1;
                    const matchLength = gameData.matchLength || 1;
                    
                    if (currentRound < matchLength) {
                        updates = { roundWinner: winnerId, status: 'finished' };
                    } else {
                        // Seri oyun bitti, genel kazananı bulmak lazım ama basitlik için son tur kazananı yazıyoruz şimdilik
                        updates = { status: 'finished', roundWinner: winnerId, matchWinnerId: winnerId };
                    }
                }
                
                if (updates.roundWinner === undefined && gameData.gameType !== 'multiplayer-br') updates.roundWinner = null;
                
                updateDoc(gameRef, updates).catch(err => console.error("Tur bitirme hatası:", err));
            }
        }

        const wasFinished = oldGameData?.status === 'finished';
        const isNowPlaying = gameData.status === 'playing';
        
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

        // Hakkı bitenler için sayaç durdurma
        if (gameData.status === 'playing') {
            const myGuesses = gameData.players[currentUserId]?.guesses || [];
            if (myGuesses.length >= gameData.GUESS_COUNT) {
                stopTurnTimer(); 
                if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';
            }
        }
        
        // 8. OYUN BİTİŞ VE EKRAN ÇİZİMİ (KRİTİK DÜZELTME)
        if (gameData.status === 'finished') {
            console.log("🏁 Oyun Bitti Sinyali. Sonuç ekranına gidiliyor...");
            stopTurnTimer();
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'none';

            renderGameState(gameData, didMyGuessChange).then(() => {
                const delay = (gameData.gameType === 'multiplayer-br') ? 2500 : 1500;
                
                setTimeout(() => {
                    const currentScreen = document.getElementById('scoreboard-screen');
                    // Eğer zaten sonuç ekranındaysak tekrar açıp titretme
                    if (currentScreen && !currentScreen.classList.contains('hidden')) return;
                    showScoreboard(gameData);
                }, delay);
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
            
            console.log("LOG: 20 Saniyelik Bot Sayacı Başlatıldı...");
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

    // Seçenekleri alıyoruz, timeLimit'i 'let' ile tanımladık ki değiştirebilelim
    let { invitedFriendId = null, timeLimit = 45, matchLength = 5, gameType = 'friend' } = options;
    
    // EĞER: Gevşek oyunsa VEYA (Arkadaş oyunu VE Tek Tursa) -> Süreyi 'null' (Süresiz) yap.
    if (gameType === 'random_loose' || (gameType === 'friend' && matchLength === 1)) {
        timeLimit = null; 
    }

    if (!db || !state.getUserId()) return showToast("Sunucuya bağlanılamıyor.", true);

    
    const currentUserId = state.getUserId();
    const username = getUsername();
    
    // --- DÜZELTME: Profil Resmini Al ---
    const profile = state.getCurrentUserProfile();
    const myAvatar = profile ? profile.avatarUrl : null;
    const myTier = profile ? (profile.currentTier || 'rookie') : 'rookie';
    
    
    // Kelime seçimi
    const selectedLength = getRandomWordLength();
    const secretWord = await getNewSecretWord(selectedLength);
    if (!secretWord) return;

    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const playerIdsList = [currentUserId];
    if (invitedFriendId) {
        playerIdsList.push(invitedFriendId);
    }

    const gameData = {
        gameId, 
        wordLength: secretWord.length, 
        secretWord, 
        timeLimit,
        creatorId: currentUserId, 
        isHardMode: false, 
        matchLength,
        currentRound: 1, 
        players: { 
            [currentUserId]: { 
                username, 
                avatarUrl: myAvatar, // <--- BU SATIRI EKLE (Virgüle dikkat)
                leagueTier: myTier,
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
        GUESS_COUNT: GUESS_COUNT, 
        gameType: gameType // Gelen tür neyse o kaydedilir
    };

    if (invitedFriendId) { 
        gameData.invitedPlayerId = invitedFriendId; 
    }

    try {
        await setDoc(doc(db, "games", gameId), gameData);
        
        // DÜZELTME: Gelen oyun türünü state'e işle (random_series, vsCPU vb.)
        state.setGameMode(gameType); 
        
        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        state.setLocalGameData(gameData);
        
        import('./ui.js').then(ui => ui.showScreen('game-screen'));
        initializeGameUI(gameData); 
        listenToGameUpdates(gameId);
        import('./game.js').then(m => m.setupVisibilityHandler(gameId));
        
        // Standart oyun mesajı
        showToast("Oyun kuruldu. Rakip bekleniyor...", false);
        
    } catch (error) {
        console.error("Error creating game:", error);
        showToast("Oyun oluşturulamadı!", true);
    }
}

export async function createBRGame(visibility = 'public') { 
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();

    const timeLimit = 120; 
    const wordLength = getRandomWordLength(); 

    if (!db || !state.getUserId()) {
         return showToast("Sunucuya bağlanılamıyor.", true);
    }
    const currentUserId = state.getUserId();
    const username = getUsername();
    const secretWord = await getNewSecretWord(wordLength);
    if (!secretWord) return;

    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Profil ve Avatar bilgisini al
    const profile = state.getCurrentUserProfile();
    const myAvatar = profile ? profile.avatarUrl : null;
    const myTier = profile ? (profile.currentTier || 'rookie') : 'rookie'; // <--- YENİ EKLENDİ

    const gameData = {
        gameId, wordLength, secretWord, timeLimit,
        creatorId: currentUserId, 
        isHardMode: false, 
        matchLength: 10,
        players: { 
            [currentUserId]: { 
                userId: currentUserId, 
                username, 
                avatarUrl: myAvatar,
                leagueTier: myTier, // <--- YENİ EKLENDİ
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
        currentPlayersCount: 1,  // Başlangıçta sadece kurucu var
        roundWinner: null,
        createdAt: serverTimestamp(),
        turnStartTime: serverTimestamp(),
        GUESS_COUNT: 6, 
        gameType: 'multiplayer-br',
        maxPlayers: 8, 
        currentRound: 1,
        visibility: visibility 
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
        
        // Hemen UI'ı güncelle ki lobi butonları görünür olsun
        import('./game.js').then(m => m.updateTurnDisplay(gameData));
        
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
            
            // Battle Royale Kontrolü
            if (gameData.gameType === 'multiplayer-br') {
                if (gameData.players[currentUserId]) {
                    gameDataToJoin = gameData;
                    return;
                }
                throw new Error("Bu bir Battle Royale oyunu. Lütfen lobiden katılın.");
            }

            // Zaten oyundaysak veriyi al ve çık
            if (gameData.players[currentUserId]) {
                gameDataToJoin = gameData;
                return; 
            }

            // Standart oyun için yer var mı?
            if (Object.keys(gameData.players).length < 2) {
                // --- PROFİL VE AVATAR BİLGİLERİNİ EKLE ---
                const profile = state.getCurrentUserProfile();
                const myAvatar = profile ? profile.avatarUrl : null;
                const myTier = profile ? (profile.currentTier || 'rookie') : 'rookie';
                
                const newPlayerState = { 
                    username, 
                    avatarUrl: myAvatar, // Avatar eklendi
                    leagueTier: myTier,  // Lig rütbesi eklendi
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
                
                // Yerel veri objesini güncelle
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

        // --- DÜZELTME BURADA YAPILDI ---
        // Oyun modunu doğru ayarla ve sonrasında ezilmesini engelle
        if (gameDataToJoin.gameType === 'league') {
            state.setGameMode('league');
        } else if (gameDataToJoin.gameType === 'multiplayer-br') {
            state.setGameMode('multiplayer-br');
        } else {
            // Diğer türler (friend, random_series vb.) için genel multiplayer modu
            state.setGameMode('multiplayer');
        }
        // SİLİNDİ: state.setGameMode('multiplayer'); <-- Bu satır hatalıydı, sildik.

        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        state.setLocalGameData(gameDataToJoin);
        
        // Eşleşme ekranı kontrolü (Radar)
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

// js/game.js içinde bu fonksiyonu bul ve bununla değiştir:

// js/game.js -> getDailySecretWord (Yerel Saat Ayarlı)

async function getDailySecretWord() {
    console.log("Günün kelimesi talep ediliyor...");

    try {
        const docRef = doc(db, "system_data", "daily");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            // Yerel Tarih Kontrolü
            const todayStr = getLocalTodayStr();
            
            if (data.date === todayStr && data.word) {
                console.log("✅ Günün kelimesi SUNUCUDAN alındı.");
                return data.word.toLocaleUpperCase('tr-TR');
            }
        }
    } catch (error) {
        console.warn("Sunucu kelimesi alınamadı, yerele geçiliyor.");
    }

    // YEDEK PLAN (Yerel Saat ile)
    console.log("🔄 Yedek plan: Yerel Sözlük.");
    const wordList = allWordList["5"] || []; 
    if (wordList.length === 0) return "KALEM";

    // Yerel saati kullanarak gün sayısını bul
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const year = now.getFullYear();

    const index = (year * 365 + dayOfYear) % wordList.length;
    return wordList[index].toLocaleUpperCase('tr-TR');
}

// js/game.js -> startNewGame (GÜNCEL - SÜRESİZ VERSİYON)

// js/game.js -> startNewGame (FİNAL - vsCPU KAYITLI VERSİYON)

export async function startNewGame(config) {
    // Temizlik
    state.resetKnownCorrectPositions();
    state.resetHasUserStartedTyping();
    state.setGameMode(config.mode);
    
    let secretWord;
    const initialGuesses = config.initialGuesses || []; 

    const gameSettings = { 
        isHardMode: false,
        wordLength: 5,
        timeLimit: 60,
        matchLength: 1
    };
    
    // Oyun ID'si oluştur (Eğer config'den gelmiyorsa)
    const gameId = config.gameId || Math.random().toString(36).substring(2, 8).toUpperCase();

    switch (config.mode) {
        case 'vsCPU':
            gameSettings.wordLength = getRandomWordLength();
            gameSettings.timeLimit = 120; 
            gameSettings.matchLength = 5;
            break;

        case 'league':
            secretWord = config.secretWord;
            if (!secretWord) { import('./utils.js').then(u => u.showToast("Lig kelimesi yüklenemedi.", true)); return; }
            gameSettings.wordLength = secretWord.length;
            gameSettings.timeLimit = 120; 
            gameSettings.matchLength = 1;
            break;

        case 'daily':
            const savedState = getDailyGameState();
            if (savedState) {
                restoreDailyGame(savedState);
                return;
            }
            const currentDailyWord = await getDailySecretWord();
            if (!currentDailyWord) {
                import('./utils.js').then(u => u.showToast("Günün kelimesi yüklenemedi.", true));
                return;
            }
            secretWord = currentDailyWord;
            gameSettings.wordLength = secretWord.length;
            gameSettings.timeLimit = null; 
            gameSettings.matchLength = 1;
            break;
            
        case 'random_loose':
            gameSettings.timeLimit = null; 
            gameSettings.matchLength = 1;
            break;

        case 'random_series':
            gameSettings.timeLimit = 120;
            gameSettings.matchLength = 5;
            break;
    }

    // Kelime üretimi
    if (!secretWord) {
        secretWord = await getNewSecretWord(gameSettings.wordLength || 5);
    }

    if (!secretWord) {
        import('./utils.js').then(u => u.showToast("Oyun için kelime alınamadı.", true));
        return;
    }

    // Profil bilgilerini al
    const currentUserId = state.getUserId();
    const profile = state.getCurrentUserProfile();
    const myAvatar = profile ? profile.avatarUrl : null;
    const myTier = profile ? (profile.currentTier || 'rookie') : 'rookie';

    // Oyun Verisini Oluştur
    const gameData = {
        gameId: gameId, // ID'yi ekledik
        wordLength: gameSettings.wordLength, 
        secretWord: secretWord, 
        timeLimit: gameSettings.timeLimit, 
        isHardMode: gameSettings.isHardMode, 
        currentRound: 1, 
        matchLength: gameSettings.matchLength,
        
        // Oyuncu Verileri
        players: { 
            [currentUserId]: { 
                username: getUsername(), 
                avatarUrl: myAvatar,
                leagueTier: myTier,
                guesses: initialGuesses, 
                score: 0,
                hasSolved: false,
                hasFailed: false,
                isEliminated: false,
                jokersUsed: { present: false, correct: false, remove: false } 
            } 
        },
        currentPlayerId: currentUserId, 
        status: 'playing', 
        turnStartTime: serverTimestamp(), // Sunucu saati
        GUESS_COUNT: 6,
        gameType: config.mode,
        difficulty: config.difficulty || 'average', // Zorluk seviyesi
        
        // Sorgulama yapabilmek için gerekli alan
        playerIds: [currentUserId] 
    };

    // vsCPU ise Bilgisayarı Ekle
    if (config.mode === 'vsCPU') {
        gameData.players['cpu'] = { 
            username: 'Bilgisayar', 
            avatarUrl: 'https://api.dicebear.com/8.x/bottts/svg?seed=cpu', // Bot avatarı
            leagueTier: 'gold',
            guesses: [], 
            score: 0, 
            jokersUsed: { present: false, correct: false, remove: false },
            isBot: true 
        };
        gameData.playerIds.push('cpu');
    }

    // Veriyi Kaydet (Önce Local)
    state.setLocalGameData(gameData);
    state.setCurrentGameId(gameId);
    localStorage.setItem('activeGameId', gameId);

    // --- KRİTİK EKLENTİ: vsCPU OYUNUNU VERİTABANINA YAZ ---
    if (config.mode === 'vsCPU') {
        try {
            await setDoc(doc(db, "games", gameId), gameData);
        } catch (e) {
            console.error("vsCPU oyunu kaydedilemedi:", e);
        }
    }
    // ------------------------------------------------------
    
    // GÜNLÜK MOD İSE -> LOCALSTORAGE YAZ
    if (config.mode === 'daily') {
        saveDailyGameState(gameData);
    }

    // Ekranı Başlat
    showScreen('game-screen');
    initializeGameUI(gameData);
    await renderGameState(gameData);

    // Sayaçları Başlat
    setTimeout(() => {
        if (gameData.timeLimit !== null) startTurnTimer();
    }, 500);

    // Bot Döngüsünü Başlat
    if (config.mode === 'vsCPU') {
        if (typeof cpuLoopTimeout !== 'undefined' && cpuLoopTimeout) clearTimeout(cpuLoopTimeout);
        setTimeout(() => startCpuLoop('cpu'), 1500); 
    }
    
    // Veritabanı dinleyicisini başlat (vsCPU için de gerekli artık)
    if (config.mode === 'vsCPU') {
        listenToGameUpdates(gameId);
    }
}

// js/game.js -> Helper Fonksiyonlar (Yerel Saat Ayarlı)

function getLocalTodayStr() {
    const d = new Date();
    // YYYY-MM-DD formatında yerel tarih oluşturur
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDailyGameState() {
    const userId = state.getUserId();
    if (!userId) return null;

    const key = `dailyGameState_${userId}`;
    const savedString = localStorage.getItem(key);
    
    if (!savedString) return null;

    try {
        const savedState = JSON.parse(savedString);
        
        // DÜZELTME: UTC yerine Yerel Tarih kullanıyoruz
        const todayStr = getLocalTodayStr(); 
        
        if (savedState.date === todayStr) {
            console.log("✅ Bugüne ait kayıt bulundu:", savedState);
            return savedState;
        } else {
            console.warn("⚠️ Kayıt eski tarihli (Düne ait), siliniyor.");
            localStorage.removeItem(key); 
            return null;
        }
    } catch (e) { 
        console.error("Kayıt okuma hatası:", e);
        return null; 
    }
}

function saveDailyGameState(gameState) {
    const userId = state.getUserId();
    if (!userId || !gameState) return;

    // DÜZELTME: Kaydederken de yerel tarih kullanıyoruz
    const toSave = {
        date: getLocalTodayStr(), 
        secretWord: gameState.secretWord,
        guesses: gameState.players[userId].guesses || [],
        score: gameState.players[userId].score || 0,
        status: gameState.status,
        roundWinner: gameState.roundWinner,
        jokersUsed: gameState.players[userId].jokersUsed || { present: false, correct: false, remove: false }
    };

    const key = `dailyGameState_${userId}`;
    localStorage.setItem(key, JSON.stringify(toSave));
}

function restoreDailyGame(savedState) {
    console.log("🔄 Günün kelimesi geri yükleniyor. Durum:", savedState.status);
    
    state.setGameMode('daily');
    const currentUserId = state.getUserId();

    // Veriyi State formatına uygun hale getir
    const restoredGameData = {
        ...savedState,
        gameType: 'daily',
        currentPlayerId: currentUserId,
        timeLimit: null, // Süre yok
        GUESS_COUNT: 6,
        players: { 
            [currentUserId]: { 
                username: getUsername(),
                guesses: savedState.guesses || [],
                score: savedState.score || 0,
                jokersUsed: savedState.jokersUsed || { present: false, correct: false, remove: false },
                // Eğer oyun bitmişse flagleri doğru ayarla
                hasSolved: savedState.status === 'finished' && savedState.roundWinner === currentUserId,
                hasFailed: savedState.status === 'finished' && savedState.roundWinner !== currentUserId,
                isEliminated: false
            } 
        }
    };

    state.setLocalGameData(restoredGameData);

    // --- DÜZELTME BURADA ---
    // Artık dinamik import (import('./ui.js').then...) kullanmıyoruz.
    // Çünkü bu fonksiyonlar dosyanın en üstünde zaten import edilmiş durumda.
    // Bu sayede "is not a function" hatası çözülecek.

    // 1. Ekranı Aç
    showScreen('game-screen');
    
    // 2. Tahtayı ve Klavyeyi Oluştur
    initializeGameUI(restoredGameData); 
    
    // 3. Harfleri Boya
    renderGameState(restoredGameData, true);

    // 4. Eğer oyun BİTMİŞSE -> Direkt sonuç ekranına (Scoreboard) git
    if (savedState.status === 'finished') {
        console.log("🏁 Oyun zaten tamamlanmış. Sonuç ekranı açılıyor.");
        stopTurnTimer();
        
        // Klavye kilitli olmalı
        const keyboard = document.getElementById('keyboard');
        if (keyboard) keyboard.style.pointerEvents = 'none';

        // 500 milisaniye bekleyip skorbordu aç (Kullanıcı önce tahtayı görsün)
        setTimeout(() => {
            showScoreboard(restoredGameData);
        }, 500);
    } else {
        // Bitmemişse klavyeyi aç, devam etsin
        const keyboard = document.getElementById('keyboard');
        if (keyboard) keyboard.style.pointerEvents = 'auto';
    }
}
// js/game.js -> getLast7DaysStats (DÜZELTİLMİŞ)

async function getLast7DaysStats(userId) {
    // Son 7 günün tarihini bul
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const dateLimit = d.toISOString().split('T')[0];

    // Veritabanından son 7 günün verilerini çek
    const q = query(
        collection(db, "daily_results"), 
        where("userId", "==", userId),
        where("date", ">=", dateLimit)
    );

    const snapshot = await getDocs(q);
    
    let totalScore = 0;
    let totalGuesses = 0;
    let playCount = snapshot.size;

    snapshot.forEach(doc => {
        const data = doc.data();
        totalScore += data.score || 0;
        if(data.win) totalGuesses += data.guesses || 0;
    });

    return {
        avgScore: playCount > 0 ? (totalScore / playCount).toFixed(1) : '-',
        avgGuesses: playCount > 0 ? (totalGuesses / playCount).toFixed(1) : '-',
        totalGames: playCount
    };
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


// js/game.js -> saveDailyResultToDatabase (Fail-Safe Versiyon)

async function saveDailyResultToDatabase(userId, username, word, win, guesses, score) {
    const todayStr = getLocalTodayStr(); // Yerel tarih fonksiyonunu kullandığından emin ol
    const docId = `${userId}_${todayStr}`;
    
    try {
        // 1. Yazma İşlemi (Genelde çalışır)
        const resultRef = doc(db, "daily_results", docId);
        const resultData = {
            userId: userId, username: username, date: todayStr,
            word: word, win: win, guesses: guesses, score: score,
            timestamp: serverTimestamp()
        };
        await setDoc(resultRef, resultData);
        console.log("✅ Kişisel skor kaydedildi.");

        // 2. Okuma İşlemi (İzin/İndeks hatası en çok burada olur)
        try {
            const q = query(collection(db, "daily_results"), where("date", "==", todayStr));
            const querySnapshot = await getDocs(q);

            let totalScore = 0;
            let totalGuesses = 0;
            let betterPlayersCount = 0;
            let totalPlayers = querySnapshot.size;

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                totalScore += (data.score || 0);
                if (data.win) totalGuesses += (data.guesses || 0);
                if (data.score > score) betterPlayersCount++;
            });

            const avgScore = totalPlayers > 0 ? (totalScore / totalPlayers).toFixed(1) : score;
            const avgGuesses = totalPlayers > 0 ? (totalGuesses / totalPlayers).toFixed(1) : guesses;
            
            return {
                userPosition: betterPlayersCount + 1,
                totalPlayers: totalPlayers,
                avgScore: avgScore,
                avgGuesses: avgGuesses,
                // UI için kendi skorunu da geri dönüyoruz
                userScore: score,
                userGuesses: guesses
            };

        } catch (readError) {
            console.warn("⚠️ İstatistik okunamadı (İzin/İndeks):", readError);
            // HATA OLSA BİLE SENİN PUANINI GERİ DÖNDÜRÜYORUZ
            return {
                userPosition: '-', 
                totalPlayers: '-', 
                avgScore: '-', 
                avgGuesses: '-',
                userScore: score,    // <--- İŞTE ÇÖZÜM BU
                userGuesses: guesses // <--- İŞTE ÇÖZÜM BU
            };
        }

    } catch (e) {
        console.error("❌ Kritik Kayıt Hatası:", e);
        return { 
            userPosition: '-', totalPlayers: '-', avgScore: '-', avgGuesses: '-',
            userScore: score, userGuesses: guesses 
        };
    }
}

// js/game.js -> submitGuess fonksiyonunun TAMAMI

async function submitGuess() {
    const localGameData = state.getLocalGameData();
    if (!localGameData || localGameData.status !== 'playing') return;

    const gameMode = state.getGameMode();
    const currentUserId = state.getUserId();
    const playerState = localGameData.players[currentUserId];

    // 1. Temel Kontroller
    if (!playerState || playerState.isEliminated || playerState.hasSolved || playerState.hasFailed || (playerState.guesses && playerState.guesses.length >= localGameData.GUESS_COUNT)) {
        return;
    }
    
    // 2. Kelimeyi Topla
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
            triggerVibration([50, 50, 50]);
            return;
        }
        guessWord += tileInner.textContent;
    }

    // Hard Mode ve Sözlük Kontrolleri...
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
        triggerVibration([50, 50, 50]);
        if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        return;
    }

    // 3. Renk ve Puan Hesabı
    const secretWord = localGameData.secretWord;
    const colors = calculateColors(guessWord, secretWord);
    
    let greenCount = 0;
    colors.forEach(c => { if(c === 'correct') greenCount++; });
    if (greenCount > 0) updateQuestProgress('green_tile', greenCount);

    const newGuess = { word: guessWord, colors: colors };
    if (!localGameData.players[currentUserId].guesses) localGameData.players[currentUserId].guesses = [];
    localGameData.players[currentUserId].guesses.push(newGuess);
    
    updateKnownPositions(localGameData.players[currentUserId].guesses);
    state.resetHasUserStartedTyping();
    
    const isWinner = (guessWord === secretWord);
    const guessCount = localGameData.players[currentUserId].guesses.length;
    
    // ============================================================
    // === GÜNLÜK MOD (DAILY) - CRASH KORUMALI VERSİYON ===
    // ============================================================
    if (gameMode === 'daily') {
        
        if (isWinner) {
            localGameData.status = 'finished';
            localGameData.roundWinner = currentUserId;
            localGameData.players[currentUserId].hasSolved = true;
            localGameData.players[currentUserId].score = calculateDailyScore(guessCount, true);
            await updateStats(true, guessCount);
        } 
        else if (guessCount >= localGameData.GUESS_COUNT) {
            localGameData.status = 'finished';
            localGameData.roundWinner = null;
            localGameData.players[currentUserId].hasFailed = true;
            await updateStats(false, guessCount);
        }

        // UI Güncelle ve Kaydet
        await renderGameState(localGameData, true);
        saveDailyGameState(localGameData);

        if (localGameData.status === 'finished') {
            stopTurnTimer();
            
            const didWin = isWinner;
            const score = localGameData.players[currentUserId].score;

            // --- KRİTİK DÜZELTME: Try-Catch Bloğu ---
            // Bu blok sayesinde istatistik çekemese bile oyun devam eder.
            (async () => {
                try {
                    // 1. Günlük Sonucu Kaydet
                    const rankData = await saveDailyResultToDatabase(currentUserId, getUsername(), secretWord, didWin, guessCount, score);
                    
                    // 2. Haftalık Verileri Çek (Hata olursa boş değer kullanır)
                    let weeklyData = { avgScore: '-', avgGuesses: '-' };
                    let globalWeeklyData = { avgScore: '-', avgGuesses: '-' };
                    
                    try {
                        weeklyData = await getLast7DaysStats(currentUserId);
                        globalWeeklyData = await getGlobalWeeklyStats();
                    } catch (weeklyError) {
                        console.warn("Haftalık veri henüz hazır değil veya indeks bekleniyor:", weeklyError);
                    }

                    // 3. Sonuç Ekranını Aç (Verilerle)
                    setTimeout(() => {
                        showScoreboard(localGameData); 
                        // Not: İstatistik verileri arka planda hazırlandı,
                        // kullanıcı "İstatistikler" butonuna bastığında bu veriler kullanılabilir.
                    }, 1500);

                } catch (e) {
                    console.error("Oyun sonu işlem hatası:", e);
                    // Hata olsa bile ekranı aç ki oyun donmasın
                    setTimeout(() => showScoreboard(localGameData), 1500);
                }
            })();
        } else {
            if (keyboardContainer) keyboardContainer.style.pointerEvents = 'auto';
        }
        
        return; 
    }
    // ============================================================

    // ... Diğer modlar (Aynen kalıyor) ...
    // ... Multi, Lig, vsCPU kodları ...
    if (gameMode === 'multiplayer' || isBattleRoyale(gameMode) || gameMode === 'friend' || gameMode === 'random_series' || gameMode === 'random_loose') {
        const updates = { [`players.${currentUserId}.guesses`]: localGameData.players[currentUserId].guesses };
        if (isWinner) {
            updates[`players.${currentUserId}.hasSolved`] = true;
            const roundScore = calculateRoundScore(guessCount, true);
            updates[`players.${currentUserId}.score`] = (localGameData.players[currentUserId].score || 0) + roundScore;
        } else if (guessCount >= localGameData.GUESS_COUNT) {
            updates[`players.${currentUserId}.hasFailed`] = true;
        }
        try { await updateDoc(doc(db, "games", state.getCurrentGameId()), updates); } catch (e) {}
    } 
    else if (gameMode === 'league') {
         const weekID = localGameData.leagueWeekID;
         const matchId = localGameData.leagueMatchId;
         const tier = localGameData.leagueTier;
         const groupId = localGameData.leagueGroupId;
         if (weekID && matchId && tier && groupId) {
             const matchRef = doc(db, "leagues", weekID, "tiers", tier, "groups", groupId, "matches", matchId);
             const playerKey = (localGameData.players[currentUserId].role === 'p1' || localGameData.leaguePlayerSide === 'p1') ? 'p1_data' : 'p2_data';
             const updates = {};
             updates[`${playerKey}.guesses`] = localGameData.players[currentUserId].guesses;
             if (isWinner) { updates[`${playerKey}.completed`] = true; updates[`${playerKey}.failed`] = false; }
             else if (guessCount >= localGameData.GUESS_COUNT) { updates[`${playerKey}.completed`] = true; updates[`${playerKey}.failed`] = true; }
             try { await updateDoc(matchRef, updates); 
                 if (isWinner || guessCount >= localGameData.GUESS_COUNT) {
                     localGameData.status = 'finished'; localGameData.roundWinner = isWinner ? currentUserId : null;
                     state.setLocalGameData(localGameData); stopTurnTimer(); setTimeout(() => showScoreboard(localGameData), 1000);
                 }
             } catch (e) {}
         }
    }
    else if (gameMode === 'vsCPU') {
        if (isWinner) {
             localGameData.players[currentUserId].hasSolved = true;
             localGameData.players[currentUserId].score += calculateRoundScore(guessCount, true);
             await updateStats(true, guessCount);
             showToast("Tebrikler!", false);
        } else if (guessCount >= localGameData.GUESS_COUNT) {
             localGameData.players[currentUserId].hasFailed = true;
             await updateStats(false, guessCount);
             showToast("Bilemedin!", true);
        }
        state.setLocalGameData(localGameData);
        checkVsCpuGameEnd();
    }

    renderGameState(localGameData, true);
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
            triggerVibration(15);
            submitGuess();
        } else if (processedKey === '⌫' || processedKey === 'BACKSPACE') {
            playSound('click');
            triggerVibration(15);
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
                triggerVibration(15);
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

// js/game.js -> findBestCpuGuess (GÜNCELLENMİŞ ZEKA)

function findBestCpuGuess(botId = 'cpu') {
    const localGameData = state.getLocalGameData();
    const botGuesses = localGameData.players[botId]?.guesses || [];
    
    // Zorluk Seviyesini Al (Varsayılan: average)
    const difficulty = localGameData.difficulty || 'average';

    const wordLenStr = String(localGameData.wordLength);
    let possibleWords = [...(allWordList[wordLenStr] || allWordList["5"])]; 
    
    // Zeka Filtresi: Mevcut kısıtlamaları (Yeşil/Sarı/Gri) hesapla
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
                // Eğer harf daha önce yeşil/sarı değilse gri listesine ekle
                let isKnownPresent = false;
                for (let k = 0; k < g.word.length; k++) {
                    if ((g.colors[k] === 'correct' || g.colors[k] === 'present') && g.word[k] === letter) {
                        isKnownPresent = true;
                        break;
                    }
                }
                if (!isKnownPresent) absentLetters.add(letter);
            }
        }
    });

    // --- ZEKA SEVİYESİNE GÖRE FİLTRELEME ---

    // ÇAYLAK (ROOKIE): %50 ihtimalle kısıtlamaları görmezden gelir, tamamen sallar.
    if (difficulty === 'rookie' && Math.random() < 0.5) {
        console.log("BOT (Çaylak): Kısıtlamaları unuttu, rastgele sallıyor.");
        // Filtreleme yapma, tüm kelimelerden rastgele seç
    } 
    // ORTALAMA (AVERAGE): %15 ihtimalle hata yapar (Gözünden kaçırır).
    else if (difficulty === 'average' && Math.random() < 0.15) {
        console.log("BOT (Ortalama): Ufak bir hata yaptı.");
        // Filtreleme yapma (veya kısmi yap, ama basitlik için direkt atlıyoruz)
    }
    // UZMAN (EXPERT) veya Diğerlerinin Şanslı Anı: Mükemmel Filtreleme
    else {
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
    }
    
    // Daha önce denenenleri çıkar
    const guessedWords = new Set(botGuesses.map(g => g.word));
    let finalWords = possibleWords.filter(w => !guessedWords.has(w));
    
    // Eğer hiç kelime kalmadıysa (Hata durumu), tüm listeden seç
    if (finalWords.length === 0) {
        finalWords = (allWordList[wordLenStr] || []).filter(w => !guessedWords.has(w));
    }

    // Doğru cevap listede var mı?
    const secretWord = localGameData.secretWord;
    const winningWordIndex = finalWords.indexOf(secretWord);
    
    // UZMAN MODU EKSTRA: Sonlara doğru kazanma şansını artır
    // Eğer Uzman ise ve 3. tahminden sonraysa ve doğru cevap listedeyse %50 kazanır.
    if (difficulty === 'expert' && botGuesses.length >= 2 && winningWordIndex !== -1) {
        if (Math.random() > 0.5) return secretWord;
    }

    // Standart Seçim
    // Eğer cevap listedeyse, botun onu erkenden bulmasını biraz engelle (İnsan gibi görünsün)
    // Ama Uzman modunda engelleme.
    if (difficulty !== 'expert' && botGuesses.length < 3 && winningWordIndex !== -1 && finalWords.length > 3) {
        finalWords.splice(winningWordIndex, 1); // Cevabı geçici olarak çıkar, hemen bilmesin
    }

    const randomIndex = Math.floor(Math.random() * finalWords.length);
    return finalWords[randomIndex] || "KALEM"; 
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

// js/game.js -> startTurnTimer (FİNAL DÜZELTİLMİŞ)
export function startTurnTimer() {
    const gameMode = state.getGameMode();
    const localGameData = state.getLocalGameData();
    const currentUserId = state.getUserId(); 

    // Sayaç çakışmalarını önlemek için önce eskileri temizle
    stopTurnTimer(); 

    // 1. GÜNLÜK MOD KONTROLÜ
    if (gameMode === 'daily') {
        if (timerDisplay) timerDisplay.style.display = 'none';
        return;
    }

    // 2. SÜRESİZ OYUN KONTROLÜ (YENİ EKLENEN KISIM)
    // Eğer süre 'null' ise sayacı gizle ve fonksiyonu durdur.
    if (localGameData && localGameData.timeLimit === null) {
        if (timerDisplay) timerDisplay.style.display = 'none';
        return;
    }

    // Oyun verisi yoksa veya oyun oynamıyorsa çık
    if (!localGameData || localGameData.status !== 'playing') return;
    
    // Eğer ben zaten çözdüysem, yandıysam veya elendiysem sayaç 0 olsun
    const myState = localGameData.players[currentUserId];
    if (myState && (myState.hasSolved || myState.hasFailed || myState.isEliminated)) {
        if (timerDisplay) timerDisplay.textContent = "0";
        return;
    }

    // 1. BAŞLANGIÇ ZAMANINI GÜVENLİ ŞEKİLDE AL
    let turnStartTime;
    const startTimeObj = localGameData.turnStartTime;

    if (!startTimeObj) {
        turnStartTime = new Date();
    } else if (startTimeObj.toDate) {
        turnStartTime = startTimeObj.toDate(); // Firebase Timestamp ise
    } else {
        turnStartTime = new Date(startTimeObj); // Normal Date ise
    }
    
    // 2. SÜRE LİMİTİ
    const limit = (gameMode === 'league') ? 120 : (localGameData.timeLimit || 120);

    if (timerDisplay) timerDisplay.style.display = 'block';

    // 3. MATEMATİKSEL HESAPLAMA (Telefona değil, zamana güven)
    const updateTimer = async () => {
        const now = new Date();
        // Şu anki zaman ile başlangıç zamanı arasındaki fark (Saniye)
        const elapsedSeconds = Math.floor((now - turnStartTime) / 1000);
        
        let timeLeft = limit - elapsedSeconds; 
        
        if (timeLeft < 0) timeLeft = 0; 

        // Ekrana Yaz
        if (timerDisplay) { 
            timerDisplay.textContent = timeLeft;
            
            if (timeLeft <= 10 && timeLeft > 0) {
                timerDisplay.classList.add('text-red-500', 'pulsate');
            } else {
                 timerDisplay.classList.remove('text-red-500', 'pulsate');
            }
        }
        
        // SÜRE BİTTİ Mİ?
        if (timeLeft <= 0) {
            stopTurnTimer(); // Sayacı durdur
            
            // Eğer hala oyundaysam (çözmediysem ve yanmadıysam) -> TURU YAK
            if (myState && !myState.hasSolved && !myState.hasFailed) {
                console.log("⏳ Süre bitti! Otomatik failTurn çağrılıyor.");
                await failTurn(); 
            }
        }
    };

    updateTimer(); // Gecikme olmasın diye hemen çalıştır
    const interval = setInterval(updateTimer, 1000); // Saniyede bir güncelle
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
            
            // Oyun Türü Kontrolü
            if (gameData.gameType !== 'multiplayer-br') {
                 throw new Error("Bu bir Battle Royale oyunu değil.");
            }
            
            // Zaten içeride miyiz?
            if (gameData.players[currentUserId]) {
                gameDataToJoin = gameData;
                return; 
            }
            
            // Oyun Durumu Kontrolü
            if (gameData.status !== 'waiting') {
                // Eğer oyun oynanıyorsa ve biz zaten oyuncuysak (ve elenmemişsek) girebiliriz
                if (gameData.status === 'playing' && gameData.players[currentUserId] && !gameData.players[currentUserId].isEliminated) {
                     gameDataToJoin = gameData;
                     return;
                }
                throw new Error("Bu oyun çoktan başladı veya bitti.");
            }

            // Kapasite Kontrolü (Sayaca veya mevcut listeye bak)
            const currentCount = gameData.currentPlayersCount || Object.keys(gameData.players).length;
            const maxPlayers = gameData.maxPlayers || 8; // Varsayılan 8

            if (currentCount >= maxPlayers) throw new Error("Oyun dolu.");

            // Profil Verilerini Hazırla
            const profile = state.getCurrentUserProfile(); 
            const myAvatar = profile ? profile.avatarUrl : null;
            const myTier = profile ? (profile.currentTier || 'rookie') : 'rookie';

            const newPlayerObject = { 
                userId: currentUserId, 
                username, 
                avatarUrl: myAvatar,
                leagueTier: myTier,
                guesses: [], 
                isEliminated: false, 
                hasSolved: false, 
                isWinner: false, 
                hasFailed: false,
                jokersUsed: { present: false, correct: false, remove: false } 
            };

            // Güncellemeleri Hazırla
            const updates = {
                [`players.${currentUserId}`]: newPlayerObject,
                playerIds: arrayUnion(currentUserId),
                // YENİ: Sayacı 1 artır
                currentPlayersCount: currentCount + 1
            };

            transaction.update(gameRef, updates);
            
            // Yerel veriyi güncelle (Optimistic UI)
            gameDataToJoin = { 
                ...gameData, 
                players: {
                    ...gameData.players,
                    [currentUserId]: newPlayerObject 
                },
                playerIds: [...gameData.playerIds, currentUserId],
                currentPlayersCount: currentCount + 1
            };
        });

        // Veri tutarsızlığı olursa son halini çek
        if (!gameDataToJoin) {
            const finalDoc = await getDoc(gameRef);
            if(finalDoc.exists()) gameDataToJoin = finalDoc.data();
            else throw new Error("Oyun verisi bulunamadı.");
        }

        // State Ayarları
        state.setGameMode('multiplayer-br');
        localStorage.setItem('activeGameId', gameId);
        state.setCurrentGameId(gameId);
        state.setLocalGameData(gameDataToJoin); 
        
        // Ekranı Aç
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
    
    // --- GÜNLÜK GÖREV: JOKER ---
    updateQuestProgress('use_joker', 1);
    
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

    // Eğer şu an aktif olan oyundaysak yerel temizlik yap
    if (state.getCurrentGameId() === gameId) {
        leaveGame();
    }

    const currentUserId = state.getUserId();
    const gameRef = doc(db, "games", gameId);

    // UI: Silinme efekti (listeden çağrıldıysa)
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
        
        // Oyun listesinden gizle
        let updateData = {
            hiddenFrom: arrayUnion(currentUserId)
        };
        
        // SENARYO 1: Kurucu oyunu beklerken kapatırsa -> OYUN SİLİNİR
        if (gameData.status === 'waiting' && gameData.creatorId === currentUserId) {
            await deleteDoc(gameRef);
            showToast("Oyun lobisi kapatıldı.");
        }
        // SENARYO 2: Battle Royale Lobisinden Ayrılma (Oyun Başlamamış) -> SADECE OYUNCU SİLİNİR
        else if (gameData.gameType === 'multiplayer-br' && gameData.status === 'waiting') {
            const currentCount = gameData.currentPlayersCount || Object.keys(gameData.players).length;
            
            // Oyuncuyu ve ID'sini sil, sayacı 1 azalt
            await updateDoc(gameRef, {
                [`players.${currentUserId}`]: deleteField(),
                playerIds: arrayRemove(currentUserId),
                currentPlayersCount: Math.max(0, currentCount - 1), // Negatif olmasın diye önlem
                hiddenFrom: arrayUnion(currentUserId)
            });
            showToast("Lobiden ayrıldınız.");
        }
        // SENARYO 3: Standart Oyun (Rakip varken kaçış) -> KAYBEDEN SAYILIR
        else if (gameData.gameType !== 'multiplayer-br' && gameData.playerIds.length > 1 && gameData.status !== 'finished') {
            const opponentId = gameData.playerIds.find(id => id !== currentUserId);
            updateData.status = 'finished';
            updateData.roundWinner = opponentId;
            updateData.matchWinnerId = opponentId;
            await updateDoc(gameRef, updateData);
            showToast("Oyundan çekildiniz. Rakibiniz kazandı.");
        }
        // SENARYO 4: Oyun zaten bitmişse veya BR oynanırken çıkıldıysa -> ELENDİ/BİTTİ
        else {
            updateData.status = 'finished'; 

            if (gameData.gameType === 'multiplayer-br') {
                 // BR oynanırken çıkarsa sadece elendi işaretle
                 updateData[`players.${currentUserId}.isEliminated`] = true;
            }

            await updateDoc(gameRef, updateData);
            showToast("Oyun bitenlere taşındı.");
        }
        
        // Listeden elementi tamamen kaldır
        if (gameDivElement) {
            gameDivElement.remove();
        }

    } catch (error) {
        console.error("Oyundan ayrılırken hata:", error);
        showToast("Oyundan ayrılırken bir hata oluştu.", true);
        
        // Hata olursa butonu geri aç
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

// js/game.js - fetchAndDisplayLeagueMatches (DÜZELTİLMİŞ SON HALİ)

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

    // --- UI GÜNCELLEME: LİG VE GRUP ---
    const tierDisplay = document.getElementById('league-tier-display');
    const groupDisplay = document.getElementById('league-group-display');

    // Türkçe Lig İsimleri
    const tierNames = {
        'rookie': 'ÇAYLAK LİGİ',
        'bronze': 'BRONZ LİGİ',
        'silver': 'GÜMÜŞ LİGİ',
        'gold': 'ALTIN LİGİ',
        'platinum': 'PLATİN LİGİ',
        'diamond': 'ELMAS LİGİ'
    };
    
    const tierColors = {
        'rookie': 'text-gray-400',
        'bronze': 'text-orange-500',
        'silver': 'text-gray-300',
        'gold': 'text-yellow-400',
        'platinum': 'text-cyan-400',
        'diamond': 'text-blue-500'
    };

    if (tierDisplay) {
        const tierName = tierNames[tier] || (tier.toUpperCase() + ' LİGİ');
        tierDisplay.textContent = tierName;
        tierDisplay.className = `text-sm font-black uppercase tracking-widest drop-shadow-sm ${tierColors[tier] || 'text-white'}`;
    }

    if (groupDisplay) {
        const groupNum = groupId.replace('grup_', '');
        groupDisplay.textContent = `${groupNum}. GRUP`;
        groupDisplay.className = "text-xs font-bold text-gray-400 mt-0.5 tracking-wide";
    }

    // 2. O Grubun Katılımcılarını Çek
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

            // Puanlama Mantığı
            if (p1Data.failed && p2Data.failed) { 
                p1Points = 1; p2Points = 1; // Berabere (İkisi de yandı)
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
                p1Points = 1; p2Points = 1; // Berabere (Eşit tahmin)
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
                sortCategory = 1; // Ben oynadım, rakip bekliyor
            } else {
                // Maç bitmiş
                let myMatchPoints = 0;
                // (Puan hesaplama mantığının tekrarı sadece sort için)
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
                tier: tier,     
                groupId: groupId, 
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
                tier: tier,       
                groupId: groupId  
            });
        }
    });

    // Sıralamalar
    myMatchesList.sort((a, b) => a.sortCategory - b.sortCategory);

    // Puan Durumu Sıralaması
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

    // UI'a Gönder
    const { renderLeagueMatches, renderLeagueStandings } = await import('./ui.js');
    
    const leagueScoreEl = document.getElementById('league-total-score');
    if(leagueScoreEl) leagueScoreEl.textContent = myTotalScore;

    const weekDisplay = document.getElementById('league-week-display');
    if(weekDisplay) {
        const weekNum = weekID.split('-W')[1];
        weekDisplay.textContent = weekNum || 1;
    }

    // --- TEK SEFER ÇAĞIRIYORUZ (DÜZELTİLDİ) ---
    renderLeagueMatches(myMatchesList, userId); 
    renderLeagueStandings(standingsList, userId); 

    // --- SİMÜLASYONLAR (BOT AKTİVİTESİ) ---
    // 1. Botlar kendi aralarında maç yapsın (Eşleşmeli)
    simulateLeagueActivity(weekID, tier, groupId);

    // 2. İnsan vs Bot maçlarında, insan oynamışsa ama bot takılmışsa botu tamamla
    if (typeof resolvePendingBotMatches === 'function') {
        resolvePendingBotMatches(weekID, tier, groupId);
    }
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
        updateQuestProgress('add_dict', 1);
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

// js/game.js -> assignBotToGame fonksiyonunun TAMAMI

async function assignBotToGame(gameId) {
    // 1. Bot ismini belirle
    const botId = 'bot_' + Date.now(); 
    const botName = getRandomBotName();
    
    console.log(`LOG: Süre doldu. Bot atanıyor: ${botName}`);

    const gameRef = doc(db, "games", gameId);
    
    // 2. Oyuncuların kullandığı avatar listesi (main.js ile aynı)
    const AVAILABLE_AVATARS = [
        'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar1&background=%236b7280',
        'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar2&background=%23ef4444',
        'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar3&background=%23f59e0b',
        'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar4&background=%2310b981',
        'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar5&background=%233b82f6',
        'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar6&background=%238b5cf6',
        'https://api.dicebear.com/8.x/pixel-art/svg?seed=huso&background=%23ec4899',
        'https://api.dicebear.com/8.x/pixel-art/svg?seed=gemini&background=%2314b8a6'
    ];

    // Listeden rastgele bir avatar seç
    const randomAvatar = AVAILABLE_AVATARS[Math.floor(Math.random() * AVAILABLE_AVATARS.length)];

    // 3. Bot verilerini hazırla
    const botPlayerState = { 
        username: botName, 
        guesses: [], 
        score: 0, 
        jokersUsed: { present: false, correct: false, remove: false },
        avatarUrl: randomAvatar, // <-- Düzeltilmiş gerçek avatar URL'si
        leagueTier: ['bronze', 'silver', 'gold'][Math.floor(Math.random()*3)], 
        isBot: true
    };

    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;
            
            const gameData = gameDoc.data();
            
            // Eğer son anda gerçek oyuncu girdiyse botu iptal et
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

// js/game.js -> getGlobalWeeklyStats (YENİ/GÜNCEL)

async function getGlobalWeeklyStats() {
    // Son 7 gün
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const dateLimit = d.toISOString().split('T')[0];

    // Tüm oyuncuların son 7 gündeki oyunları
    const q = query(
        collection(db, "daily_results"), 
        where("date", ">=", dateLimit)
    );

    const snapshot = await getDocs(q);
    
    let totalScore = 0;
    let totalGuesses = 0;
    let totalGames = snapshot.size;

    snapshot.forEach(doc => {
        const data = doc.data();
        totalScore += data.score || 0;
        if(data.win) totalGuesses += data.guesses || 0;
    });

    // Bu basit bir "Oyun Başına Global Ortalama" hesabıdır
    return {
        avgScore: totalGames > 0 ? (totalScore / totalGames).toFixed(1) : '-',
        avgGuesses: totalGames > 0 ? (totalGuesses / totalGames).toFixed(1) : '-'
    };
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

// QUICK CHAT GÖNDERME
export async function sendQuickChat(message) {
    const gameId = state.getCurrentGameId();
    const userId = state.getUserId();
    if (!gameId || !userId) return;

    const gameRef = doc(db, "games", gameId);
    
    try {
        await updateDoc(gameRef, {
            [`players.${userId}.lastMessage`]: message,
            [`players.${userId}.lastMessageTime`]: serverTimestamp()
        });
    } catch (error) {
        console.error("Mesaj gönderilemedi:", error);
    }
}

// js/game.js - EN ALTA EKLE (GÖREV SİSTEMİ)

// js/game.js -> QUEST_DEFINITIONS (Genişletilmiş Liste)

const QUEST_DEFINITIONS = [
    // --- OYNANIŞ (KLASİK) ---
    { id: 'play_5', type: 'play', target: 5, reward: 200, title: "Maratoncu", desc: "5 oyun tamamla." },
    { id: 'win_3', type: 'win', target: 3, reward: 500, title: "Yenilmez", desc: "3 oyun kazan." },
    { id: 'win_fast_1', type: 'win_fast', target: 1, reward: 400, title: "Şimşek Hızı", desc: "Bir kelimeyi 4 veya daha az tahminde bil." },
    
    // --- HARF AVCILIĞI ---
    { id: 'find_green_20', type: 'green_tile', target: 20, reward: 250, title: "Yeşil Vadi", desc: "Toplam 20 harfi doğru yerinde bil." },
    { id: 'find_yellow_25', type: 'yellow_tile', target: 25, reward: 250, title: "Sarı Alarm", desc: "Toplam 25 harf bul (yerleri yanlış olabilir)." },
    
    // --- SOSYAL & ETKİLEŞİM (SENİN İSTEDİKLERİN) ---
    { id: 'invite_friend_1', type: 'invite_friend', target: 1, reward: 1000, title: "Elçi", desc: "Bir arkadaşını oyuna davet et (Link paylaş)." },
    { id: 'challenge_rank_1', type: 'challenge_rank', target: 1, reward: 300, title: "Cesur Yürek", desc: "Genel sıralamadan birine meydan oku." },
    { id: 'share_result_1', type: 'share_result', target: 1, reward: 200, title: "Hava At", desc: "Bir oyun sonucunu paylaş." },
    
    // --- EKONOMİ & KIRTASİYE ---
    { id: 'watch_ad_1', type: 'watch_ad', target: 1, reward: 600, title: "Sinema Saati", desc: "Kırtasiye'de bir reklam izle." },
    { id: 'spend_gold_1', type: 'spend_gold', target: 1, reward: 100, title: "Müşteri", desc: "Kırtasiyeden herhangi bir ürün al." },
    { id: 'use_joker_3', type: 'use_joker', target: 3, reward: 150, title: "Joker", desc: "Toplam 3 kez joker kullan." },

    // --- KEŞİF & EĞİTİM (TUTORIAL TADINDA) ---
    { id: 'add_dict_1', type: 'add_dict', target: 1, reward: 200, title: "Lügatçı", desc: "Sözlüğüne yeni bir kelime ekle." },
    { id: 'change_avatar_1', type: 'change_avatar', target: 1, reward: 150, title: "Yeni İmaj", desc: "Profilinden avatarını değiştir." },
    { id: 'change_theme_1', type: 'change_theme', target: 1, reward: 100, title: "Gece/Gündüz", desc: "Temayı (Aydınlık/Karanlık) değiştir." },
    { id: 'view_tutorial_1', type: 'view_tutorial', target: 1, reward: 50, title: "Öğrenci", desc: "'Nasıl Oynanır' ekranını aç." },
    
    // --- MODLAR ---
    { id: 'play_br_1', type: 'play_br', target: 1, reward: 350, title: "Arena", desc: "Bir Battle Royale maçına katıl." },
    { id: 'play_cpu_1', type: 'play_vs_cpu', target: 1, reward: 100, title: "Antrenman", desc: "Bilgisayara karşı oyna." }
];

// js/game.js - checkAndGenerateDailyQuests (GÜVENLİ & DÜZELTİLMİŞ)

export async function checkAndGenerateDailyQuests() {
    const userId = state.getUserId();
    if (!userId) return;

    // Kullanıcıya hissettirmeden arka planda sunucuya soruyoruz
    console.log("Görev kontrolü: Sunucuya bağlanılıyor...");
    
    try {
        // NOT: Buradaki URL, 'firebase deploy' işleminden sonra terminalde çıkan URL olmalıdır.
        // Genellikle format şöyledir: https://checkandgeneratedailyquests-PROJEID-uc.a.run.app
        const functionUrl = "https://checkandgeneratedailyquests-wxw6bd452q-uc.a.run.app"; 
        
        // Auth Token almamız lazım çünkü sunucu "request.auth" kontrolü yapıyor
        // (Kullanıcının gerçekten giriş yapmış biri olduğunu kanıtlıyoruz)
        if (!auth.currentUser) return;
        const token = await auth.currentUser.getIdToken();

        // HTTP İsteği (Fetch) ile sunucuyu çağırıyoruz
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // Güvenlik anahtarı
            },
            body: JSON.stringify({ data: {} }) // Firebase onCall fonksiyonları veriyi { data: ... } içinde bekler
        });

        if (!response.ok) {
            throw new Error(`Sunucu hatası: ${response.status}`);
        }

        const jsonResponse = await response.json();
        // Firebase functions cevabı .result içinde döner
        const result = jsonResponse.result; 

        console.log("Sunucu Cevabı:", result ? result.message : "Tamamlandı");
        
        // Sunucu veritabanını güncellediği için, biz de yerel state'i yenilemeliyiz
        const userRef = doc(db, "users", userId);
        const snap = await getDoc(userRef);
        if(snap.exists()) {
            state.setCurrentUserProfile(snap.data());
            // UI'daki kırmızı noktayı güncelle
            import('./ui.js').then(ui => ui.updateQuestBadge());
        }

    } catch (error) {
        console.error("Görev kontrol hatası:", error);
    }
}

// İlerlemeyi Kaydet (Oyun içinden çağrılacak)
export async function updateQuestProgress(type, amount = 1) {
    const userId = state.getUserId();
    const profile = state.getCurrentUserProfile();
    
    if (!userId || !profile || !profile.dailyQuests) return;

    // Tarih kontrolü (Eski görevleri güncelleme)
    const todayStr = new Date().toISOString().split('T')[0];
    if (profile.dailyQuests.date !== todayStr) return;

    let updated = false;
    const newList = profile.dailyQuests.list.map(quest => {
        // Görev tipi eşleşiyor mu ve henüz tamamlanmadı mı?
        // (Örn: 'play' == 'play' veya 'win' == 'win')
        if (quest.type === type && !quest.completed) {
            const newProgress = Math.min(quest.progress + amount, quest.target);
            
            if (newProgress !== quest.progress) {
                updated = true;
                quest.progress = newProgress;
                
                // Görev bitti mi?
                if (quest.progress >= quest.target) {
                    quest.completed = true;
                    import('./utils.js').then(u => {
                        u.showToast(`🏆 Görev Tamamlandı: ${quest.title}`, false);
                        u.playSound('win');
                    });
                }
            }
        }
        return quest;
    });

    if (updated) {
        const newQuestData = { ...profile.dailyQuests, list: newList };
        
        // Yerel State Güncelle
        state.setCurrentUserProfile({ ...profile, dailyQuests: newQuestData });
        
        // Veritabanı Güncelle
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, { dailyQuests: newQuestData }).catch(console.error);
        
        // UI Bildirimini Güncelle (Kırmızı nokta)
        import('./ui.js').then(ui => ui.updateQuestBadge());
    }
}

// Ödül Toplama
export async function claimQuestReward(questId) {
    const userId = state.getUserId();
    const profile = state.getCurrentUserProfile();
    if (!profile || !profile.dailyQuests) return;

    const questIndex = profile.dailyQuests.list.findIndex(q => q.id === questId);
    if (questIndex === -1) return;

    const quest = profile.dailyQuests.list[questIndex];

    if (quest.completed && !quest.claimed) {
        // 1. Ödülü Ver (Fonksiyon aynı dosyada olduğu için import'a gerek yok)
        await addGold(quest.reward); 
        
        // 2. Görevi "Alındı" (claimed) olarak işaretle
        quest.claimed = true;
        profile.dailyQuests.list[questIndex] = quest;

        // 3. Veritabanını Güncelle (Hem Altın hem Görev Durumu tek seferde güncellenebilir ama ayrı ayrı güvenlidir)
        const userRef = doc(db, "users", userId);
        
        // Sadece günlük görev listesini güncelle (Altın zaten addGold içinde güncellendi)
        await updateDoc(userRef, { dailyQuests: profile.dailyQuests });
        
        // 4. Yerel State'i Güncelle
        state.setCurrentUserProfile(profile);
        
        // 5. Arayüzü Yenile (UI ve Rozet)
        import('./ui.js').then(ui => {
            ui.renderQuestList(); // Butonu "Alındı"ya çevir
            ui.updateQuestBadge(); // Kırmızı noktayı kaldır
            ui.updateMarketUI();   // Altın bakiyesini güncelle
        });
        
        // Geri bildirim
        import('./utils.js').then(u => {
            u.showToast(`+${quest.reward} Altın Kazanıldı!`, false);
            u.playSound('win');
        });
    }
}

// js/game.js - EN ALT KISIM

// js/game.js - EN ALT KISIM (GÜNCELLENMİŞ SİMÜLASYON)

// js/game.js - simulateLeagueActivity (DÜZELTİLMİŞ HALİ)

async function simulateLeagueActivity(weekID, tier, groupId) {
    const groupPath = `leagues/${weekID}/tiers/${tier}/groups/${groupId}`;
    const participantsRef = collection(db, groupPath, "participants");
    
    try {
        const snapshot = await getDocs(participantsRef);
        const totalPlayers = snapshot.size; 
        const maxMatches = totalPlayers - 1; 

        const now = new Date();
        const fourHours = 4 * 60 * 60 * 1000; // 4 Saatlik bekleme süresi

        // 1. ADIM: Maç yapmaya müsait botları topla
        let eligibleBots = [];

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            if (data.isBot) {
                const stats = data.stats || { O: 0, G: 0, B: 0, M: 0, P: 0 };
                // Maç hakkı dolmamış VE son maçından bu yana 4 saat geçmiş botlar
                let lastSim = data.lastSimulated ? data.lastSimulated.toDate() : new Date(0);
                
                if (stats.O < maxMatches && (now - lastSim > fourHours)) {
                    eligibleBots.push({ id: docSnap.id, data: data, stats: stats });
                }
            }
        });

        // Eğer eşleşecek yeterli bot yoksa çık
        if (eligibleBots.length < 2) return;

        // 2. ADIM: Botları rastgele karıştır (Shuffle)
        eligibleBots.sort(() => 0.5 - Math.random());

        // 3. ADIM: İkili eşleştir ve maç yaptır
        // Döngüyü 2'şer atlayarak kuruyoruz
        for (let i = 0; i < eligibleBots.length - 1; i += 2) {
            const bot1 = eligibleBots[i];
            const bot2 = eligibleBots[i + 1];

            // Maç Sonucunu Belirle (Zar At)
            const rand = Math.random();
            
            // Bot 1 ve Bot 2'nin Oynadığı Maç Sayısını Artır
            bot1.stats.O += 1;
            bot2.stats.O += 1;

            if (rand < 0.4) { 
                // SENARYO A: Bot 1 Kazanır (3 Puan)
                bot1.stats.G += 1;
                bot1.stats.P += 3;
                
                bot2.stats.M += 1;
            } 
            else if (rand < 0.8) { 
                // SENARYO B: Bot 2 Kazanır (3 Puan)
                bot2.stats.G += 1;
                bot2.stats.P += 3;
                
                bot1.stats.M += 1;
            } 
            else { 
                // SENARYO C: Beraberlik (1 Puan)
                bot1.stats.B += 1;
                bot1.stats.P += 1;
                
                bot2.stats.B += 1;
                bot2.stats.P += 1;
            }

            // --- GÜNCELLEMELERİ YAZ ---
            
            // Bot 1 Kaydet
            const bot1Ref = doc(db, groupPath, "participants", bot1.id);
            updateDoc(bot1Ref, {
                stats: bot1.stats,
                score: bot1.stats.P,
                lastSimulated: serverTimestamp()
            });

            // Bot 2 Kaydet
            const bot2Ref = doc(db, groupPath, "participants", bot2.id);
            updateDoc(bot2Ref, {
                stats: bot2.stats,
                score: bot2.stats.P,
                lastSimulated: serverTimestamp()
            });

            console.log(`🤖 Maç Simüle Edildi: ${bot1.data.username} VS ${bot2.data.username}`);
        }
        
        if (eligibleBots.length % 2 !== 0) {
            console.log("Bir bot eşleşemedi, sonraki turu bekleyecek.");
        }

    } catch (error) {
        console.error("Lig simülasyonu hatası:", error);
    }
    
    // DİKKAT: Buradaki recursive (kendini çağıran) kodlar SİLİNDİ.
    // Fonksiyon burada bitmeli.
}

/// js/game.js - EN ALT (YENİ FONKSİYON - REVİZE EDİLDİ)

// İNSAN vs BOT: Bekleyen Maçları Sonuçlandır (1 Saat Kuralı)
async function resolvePendingBotMatches(weekID, tier, groupId) {
    const groupPath = `leagues/${weekID}/tiers/${tier}/groups/${groupId}`;
    const matchesRef = collection(db, groupPath, "matches");
    
    try {
        const snapshot = await getDocs(matchesRef);
        const now = new Date();
        const oneHour = 60 * 60 * 1000; // 1 Saat bekleme süresi

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // Eğer maç zaten bitmişse atla
            const p1Done = data.p1_data && data.p1_data.completed;
            const p2Done = data.p2_data && data.p2_data.completed;
            if (p1Done && p2Done) return;

            // Süre kontrolü
            let startTime = data.createdAt ? data.createdAt.toDate() : new Date(0);
            if (data.p1_startedAt) startTime = data.p1_startedAt.toDate();
            
            if (now - startTime < oneHour) return;

            // --- BOT KİM? ---
            // 'bot_' veya 'player_' ile başlayanlar bot kabul edilir.
            const isP2Bot = data.p2.startsWith('bot_') || data.p2.startsWith('player_');
            const isP1Bot = data.p1.startsWith('bot_') || data.p1.startsWith('player_');

            let updateNeeded = false;
            let updates = {};

            // SENARYO 1: İnsan (P1) oynamış, Bot (P2) takılmış
            if (p1Done && !p2Done && isP2Bot) {
                const botResult = generateSimulatedMatchResult(); 
                updates['p2_data.guesses'] = botResult.guesses;
                updates['p2_data.completed'] = true;
                updates['p2_data.failed'] = botResult.failed;
                updateNeeded = true;
                console.log(`🤖 Bot (${data.p2}) maçı tamamladı (Süre aşımı).`);
            }

            // SENARYO 2: İnsan (P2) oynamış, Bot (P1) takılmış
            else if (p2Done && !p1Done && isP1Bot) {
                const botResult = generateSimulatedMatchResult();
                updates['p1_data.guesses'] = botResult.guesses;
                updates['p1_data.completed'] = true;
                updates['p1_data.failed'] = botResult.failed;
                updateNeeded = true;
                console.log(`🤖 Bot (${data.p1}) maçı tamamladı (Süre aşımı).`);
            }

            if (updateNeeded) {
                const matchRef = doc(db, groupPath, "matches", docSnap.id);
                updateDoc(matchRef, updates); // await kullanmadık ki döngü hızlı aksın
            }
        });

    } catch (error) {
        console.error("Bekleyen maçları temizleme hatası:", error);
    }
}

// Yardımcı: Bot için rastgele maç sonucu üretir (GÖRSEL DÜZELTME YAPILDI)
function generateSimulatedMatchResult() {
    const rand = Math.random();
    const isWin = rand > 0.4; // %60 kazanma şansı
    const guessCount = isWin ? Math.floor(Math.random() * 3) + 3 : 6; // Kazandıysa 3-5, kaybettiyse 6 tahmin
    
    // DÜZELTME: Eğer kaybettiyse 'correct' (Yeşil) değil, 'absent' (Gri) renk verelim.
    // Eğer kazandıysa sadece SON tahmin yeşil olsun.
    
    const dummyGuesses = [];
    for (let i = 0; i < guessCount; i++) {
        let colors = ['absent', 'absent', 'present', 'absent', 'absent']; // Varsayılan: Gri/Sarı karışık
        
        // Eğer kazandıysa ve bu son tahminse -> Hepsi Yeşil
        if (isWin && i === guessCount - 1) {
            colors = ['correct', 'correct', 'correct', 'correct', 'correct'];
        }

        dummyGuesses.push({
            word: 'BOTXX', // Temsili kelime
            colors: colors
        });
    }
    
    return {
        failed: !isWin,
        guesses: dummyGuesses
    };
}

// js/game.js -> handleVsCpuClick (GÜNCELLENMİŞ)

export async function handleVsCpuClick() {
    const userId = state.getUserId();
    if (!userId) return import('./utils.js').then(u => u.showToast("Giriş yapmalısın.", true));

    // Yükleniyor efekti verelim (Butonu kilitlemek iyi olur ama şimdilik toast yeterli)
    
    try {
        const gamesRef = collection(db, 'games');
        
        // DİKKAT: Firebase Console'da INDEX oluşturman gerekebilir.
        // Hata alırsan konsoldaki linke tıkla.
        const q = query(gamesRef, 
            where('gameType', '==', 'vsCPU'),
            where('playerIds', 'array-contains', userId),
            where('status', '==', 'playing'),
            orderBy('createdAt', 'desc'), // En son oyunu getir
            limit(1)
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            // Yarım kalan oyun bulundu
            const gameDoc = snapshot.docs[0];
            const gameId = gameDoc.id;
            const gameData = gameDoc.data();
            
            // Eğer oyun aslında bitmişse ama status 'playing' kaldıysa temizle
            // (Bu kontrolü yapmazsak sonsuz döngüye girer)
            const myPlayer = gameData.players[userId];
            if (myPlayer && (myPlayer.hasSolved || myPlayer.hasFailed)) {
                 // Oyun bitmiş ama veritabanında kalmış, bunu bitirip yenisini açalım
                 await abandonGame(gameId);
                 document.getElementById('cpu-difficulty-modal').classList.remove('hidden');
                 return;
            }

            const modal = document.getElementById('cpu-resume-modal');
            const btnResume = document.getElementById('btn-cpu-resume');
            const btnNew = document.getElementById('btn-cpu-new-game');

            if (modal) {
                modal.classList.remove('hidden');

                // DEVAM ET
                btnResume.onclick = () => {
                    modal.classList.add('hidden');
                    joinGame(gameId); // Oyuna gir
                };

                // YENİ OYUN
                btnNew.onclick = async () => {
                    modal.classList.add('hidden');
                    // Eski oyunu sil (Veya finished yap)
                    await deleteDoc(doc(db, "games", gameId)); 
                    // Yeni zorluk seçimi
                    document.getElementById('cpu-difficulty-modal').classList.remove('hidden');
                };
            }
        } else {
            // Hiç oyun yok, direkt zorluk seçimi
            document.getElementById('cpu-difficulty-modal').classList.remove('hidden');
        }
    } catch (error) {
        console.error("vsCPU oyun kontrol hatası:", error);
        // Hata olursa (örn: index yoksa) kullanıcıyı bekletmemek için direkt modalı aç
        // Aynı zamanda konsola hata basar ki index linkini görebilesin.
        document.getElementById('cpu-difficulty-modal').classList.remove('hidden');
    }
}