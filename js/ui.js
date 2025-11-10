// js/ui.js - TAM DOSYA (TÜM DÜZELTMELER DAHİL)

import * as state from './state.js'; // Sunucunun çökmemesi için import
import { getStatsFromProfile, createElement } from './utils.js';
import { joinGame, joinBRGame, acceptInvite, rejectInvite, abandonGame } from './game.js';

// Değişkenler
export let 
    // Game Screen
    guessGrid, keyboardContainer, turnDisplay, timerDisplay, gameIdDisplay, 
    startGameBtn, roundCounter, shareGameBtn, multiplayerScoreBoard,
    
    // BR Scoreboard
    brRoundCounter, brTimerDisplay, brTurnDisplay,
    
    // Jokers
    jokerPresentBtn, jokerCorrectBtn, jokerRemoveBtn,
    
    // Auth
    loginBtn, registerBtn, logoutBtn, goToRegisterBtn, backToLoginBtn,
    
    // Main Menu
    newGameBtn, myGamesBtn, friendsBtn, statsBtn, statsBtnMain,
    howToPlayBtn, closeHowToPlayBtn, themeLightBtn, themeDarkBtn,
    closeProfileBtn,
    
    // Navigation
    backToMainMenuBtn, backToMainMenuFromGamesBtn, backToMainFromFriendsBtn,
    backToModeMultiBtn, backToModeBrBtn, leaveGameButton,
    
    // Game Setup
    randomGameBtn, seriesGameBtn, withFriendsBtn, vsCpuBtn, multiplayerBrBtn,
    dailyWordBtn, 
    createGameBtn, joinGameBtn, createBRGameBtn, joinBRGameBtn,
    
    // Friends Tabs
    friendsTab, requestsTab, addFriendTab, showFriendsTabBtn, 
    showRequestsTabBtn, showAddFriendTabBtn, searchFriendBtn, friendRequestCount,
    
    // My Games Tabs
    showActiveGamesTabBtn, showFinishedGamesTabBtn, showInvitesTabBtn,
    gameInviteCount,
    
    // Game Over
    newRoundBtn, mainMenuBtn, shareResultsBtn,
    
    // Misc
    userDisplay, invitationModal, copyGameIdBtn;

const brPlayerSlots = []; 

export function initUI() {
    // Game Screen
    guessGrid = document.getElementById('guess-grid');
    keyboardContainer = document.getElementById('keyboard');
    turnDisplay = document.getElementById('turn-display');
    timerDisplay = document.getElementById('timer-display');
    gameIdDisplay = document.getElementById('game-id-display');
    startGameBtn = document.getElementById('start-game-btn');
    roundCounter = document.getElementById('round-counter');
    shareGameBtn = document.getElementById('share-game-btn');
    multiplayerScoreBoard = document.getElementById('multiplayer-score-board');

    // BR Scoreboard
    brRoundCounter = document.getElementById('br-round-counter');
    brTimerDisplay = document.getElementById('br-timer-display');
    brTurnDisplay = document.getElementById('br-turn-display');
    brPlayerSlots.push(document.getElementById('br-player-slot-0'));
    brPlayerSlots.push(document.getElementById('br-player-slot-1'));
    brPlayerSlots.push(document.getElementById('br-player-slot-2'));
    brPlayerSlots.push(document.getElementById('br-player-slot-3'));

    // Jokers
    jokerPresentBtn = document.getElementById('joker-present');
    jokerCorrectBtn = document.getElementById('joker-correct');
    jokerRemoveBtn = document.getElementById('joker-remove');

    // Auth
    loginBtn = document.getElementById('login-btn');
    registerBtn = document.getElementById('register-btn');
    logoutBtn = document.getElementById('logout-btn');
    goToRegisterBtn = document.getElementById('go-to-register-btn');
    backToLoginBtn = document.getElementById('back-to-login-btn');

    // Main Menu
    newGameBtn = document.getElementById('new-game-btn');
    myGamesBtn = document.getElementById('my-games-btn');
    friendsBtn = document.getElementById('friends-btn');
    statsBtn = document.getElementById('stats-btn');
    statsBtnMain = document.getElementById('stats-btn-main');
    howToPlayBtn = document.getElementById('how-to-play-btn');
    closeHowToPlayBtn = document.getElementById('close-how-to-play-btn');
    themeLightBtn = document.getElementById('theme-light-btn');
    themeDarkBtn = document.getElementById('theme-dark-btn');
    closeProfileBtn = document.getElementById('close-profile-btn');

    // Navigation
    backToMainMenuBtn = document.getElementById('back-to-main-menu-btn');
    backToMainMenuFromGamesBtn = document.getElementById('back-to-main-menu-from-games-btn');
    backToMainFromFriendsBtn = document.getElementById('back-to-main-from-friends-btn');
    backToModeMultiBtn = document.getElementById('back-to-mode-multi-btn');
    backToModeBrBtn = document.getElementById('back-to-mode-br-btn');
    leaveGameButton = document.getElementById('leave-game-button');

    // Game Setup
    randomGameBtn = document.getElementById('random-game-btn');
    seriesGameBtn = document.getElementById('series-game-btn');
    withFriendsBtn = document.getElementById('with-friends-btn');
    vsCpuBtn = document.getElementById('vs-cpu-btn');
    multiplayerBrBtn = document.getElementById('multiplayer-br-btn');
    dailyWordBtn = document.getElementById('daily-word-btn'); 
    createGameBtn = document.getElementById('create-game-btn');
    joinGameBtn = document.getElementById('join-game-btn');
    createBRGameBtn = document.getElementById('create-br-game-btn');
    joinBRGameBtn = document.getElementById('join-br-game-btn');

    // Friends Tabs
    friendsTab = document.getElementById('friends-tab');
    requestsTab = document.getElementById('requests-tab');
    addFriendTab = document.getElementById('add-friend-tab');
    showFriendsTabBtn = document.getElementById('show-friends-tab-btn');
    showRequestsTabBtn = document.getElementById('show-requests-tab-btn');
    showAddFriendTabBtn = document.getElementById('show-add-friend-tab-btn');
    searchFriendBtn = document.getElementById('search-friend-btn');
    friendRequestCount = document.getElementById('friend-request-count');

    // My Games Tabs
    showActiveGamesTabBtn = document.getElementById('show-active-games-tab-btn');
    showFinishedGamesTabBtn = document.getElementById('show-finished-games-tab-btn');
    showInvitesTabBtn = document.getElementById('show-invites-tab-btn');
    gameInviteCount = document.getElementById('game-invite-count');

    // Game Over
    newRoundBtn = document.getElementById('new-round-btn');
    mainMenuBtn = document.getElementById('main-menu-btn');
    shareResultsBtn = document.getElementById('share-results-btn');

    // Misc
    userDisplay = document.getElementById('user-display');
    invitationModal = document.getElementById('invitation-modal');
    copyGameIdBtn = document.getElementById('copy-game-id-btn');
}

export function showScreen(screenId) {
    const screens = [
        'login-screen', 'register-screen', 'main-menu-screen', 'new-game-screen',
        'my-games-screen', 'game-screen', 'scoreboard-screen', 'profile-screen',
        'how-to-play-screen', 'friends-screen', 'br-setup-screen', 'multiplayer-setup-screen', 'edit-profile-screen'
    ];
    screens.forEach(id => {
        const screenElement = document.getElementById(id);
        if (screenElement) {
            screenElement.classList.add('hidden');
        }
    });
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
    } else {
        console.error(`showScreen Fonksiyonu çağrıldı ama "${screenId}" ID'li ekran bulunamadı!`);
    }
}

export function createGrid(wordLength, GUESS_COUNT) {
    if (!guessGrid) return;
    guessGrid.innerHTML = '';
    guessGrid.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;
    for (let i = 0; i < GUESS_COUNT; i++) {
        for (let j = 0; j < wordLength; j++) {
            const tile = createElement('div', { id: `tile-${i}-${j}`, className: 'tile' });
            const tileInnerFront = createElement('div', { className: 'tile-inner front' });
            const tileInnerBack = createElement('div', { className: 'tile-inner back' });
            tile.appendChild(tileInnerFront);
            tile.appendChild(tileInnerBack);
            guessGrid.appendChild(tile);
        }
    }
}

export function createKeyboard(handleKeyPress) {
    if (!keyboardContainer) return;
    keyboardContainer.innerHTML = '';
    const keyRows = [
        ['E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
        ['Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç'],
        ['⌫', 'ENTER']
    ];
    keyRows.forEach((row, rowIndex) => {
        const rowDiv = createElement('div', { className: `flex justify-center gap-1 mt-1 w-full ${rowIndex === 3 ? 'gap-2' : ''}` });
        
        row.forEach(key => {
            const isSpecialKey = key === '⌫' || key === 'ENTER';
            const keySizeClass = isSpecialKey ? 'flex-1' : 'w-10'; 

            const keyButton = createElement('button', {
                className: `keyboard-key rounded font-semibold uppercase bg-gray-500 ${isSpecialKey ? 'bg-gray-600' : ''} ${keySizeClass}`,
                dataset: { key: key },
                onclick: () => handleKeyPress(key),
            });

            if (key === '⌫') {
                keyButton.innerHTML = `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>`;
            } else if (key === 'ENTER') {
                keyButton.innerHTML = `<svg class="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4l10 6-10 6V4z"/></svg>`;
            } else {
                keyButton.textContent = key;
            }
            rowDiv.appendChild(keyButton);
        });
        keyboardContainer.appendChild(rowDiv);
    });
}


// === BAŞLANGIÇ: DÜZELTİLMİŞ updateKeyboard FONKSİYONU ===
export function updateKeyboard(gameData) {
    if (!gameData || !gameData.players) return;

    // Kendi ID'mizi state'den alıyoruz
    const currentUserId = state.getUserId(); 
    if (!currentUserId) return; // ID yoksa (olmamalı ama) çık

    const keyStates = {};

    // 1. ADIM: SADECE KENDİ TAHMİNLERİMİZİ İŞLE
    const myGuesses = gameData.players[currentUserId]?.guesses || [];
    myGuesses.forEach(({ word, colors }) => {
        for (let i = 0; i < word.length; i++) {
            const letter = word[i];
            const color = colors[i];
            
            if (keyStates[letter] === 'correct') continue; 
            if (keyStates[letter] === 'present' && color !== 'correct') continue; 
            keyStates[letter] = color;
        }
    });

    // 2. ADIM: RAKİPLERİN TAHMİNLERİNİ İŞLE
    Object.keys(gameData.players).forEach(playerId => {
        if (playerId === currentUserId) return; 

        const opponentGuesses = gameData.players[playerId]?.guesses || [];
        opponentGuesses.forEach(({ word, colors }) => {
            for (let i = 0; i < word.length; i++) {
                const letter = word[i];
                const color = colors[i];
                const myCurrentColor = keyStates[letter];

                // Rakip yeşil VEYA sarı bulduysa
                if (color === 'correct' || color === 'present') {
                    // Ve biz bu harfi ya hiç bulamadıysak YA DA 'absent' sanıyorsak...
                    if (!myCurrentColor || myCurrentColor === 'absent') {
                        // ...klavyemizi 'present' (sarı) olarak güncelle.
                        keyStates[letter] = 'present';
                    }
                }
                // Rakip gri bulduysa
                else if (color === 'absent') {
                    // Ve biz bu harf hakkında HİÇBİR ŞEY bilmiyorsak...
                    if (!myCurrentColor) {
                        // ...o zaman gri olarak işaretle.
                        keyStates[letter] = 'absent';
                    }
                }
            }
        });
    });
    // === DÜZELTME SONU ===

    // 3. ADIM: keyStates'i UI'a uygula
    document.querySelectorAll('.keyboard-key').forEach(btn => {
        const keyId = btn.dataset.key;
        if (keyId === 'ENTER' || keyId === '⌫') return;
        const guessColor = keyStates[keyId]; 
        if (guessColor === 'correct') {
            btn.classList.remove('present', 'absent'); 
            btn.classList.add('correct');
        } 
        else if (guessColor === 'present' && !btn.classList.contains('correct')) {
            btn.classList.remove('absent'); 
            btn.classList.add('present');
        } 
        else if (guessColor === 'absent' && !btn.classList.contains('correct') && !btn.classList.contains('present')) {
            btn.classList.add('absent');
        }
    });
}
// === BİTİŞ: DÜZELTİLMİŞ updateKeyboard FONKSİYONU ===


// === BAŞLANGIÇ: YENİ EKLENEN FONKSİYONLAR (GERÇEK OYUN İÇİN) ===

/**
 * YENİ FONKSİYON: Bir kareyi animasyonsuz, anında günceller.
 * (Yeşil harfleri alt satıra taşımak için kullanılır)
 */
export function updateStaticTile(row, col, letter, colorClass) {
    const tileId = `tile-${row}-${col}`;
    const tile = document.getElementById(tileId);
    if (!tile) return;

    const front = tile.querySelector('.front');
    const back = tile.querySelector('.back');

    // Harfi hem öne hem arkaya yaz
    front.textContent = letter;
    back.textContent = letter;

    // Rengi .back yüzüne ver
    back.className = 'tile-inner back ' + colorClass;

    // Kutuya 'flip' (dönme) sınıfı VERME.
    // Sadece statik rengi göstermesi için 'tile' sınıfına da ekle.
    tile.className = 'tile static ' + colorClass;
}

/**
 * YENİ FONKSİYON: Bir satırdaki tüm statik (taşınan) kareleri temizler.
 * (Kullanıcı yazmaya başladığında çağrılır)
 */
export function clearStaticTiles(row, wordLength) {
     for (let j = 0; j < wordLength; j++) {
        const tileId = `tile-${row}-${j}`;
        const tile = document.getElementById(tileId);
        // Sadece 'static' sınıfına sahip olanları temizle
        if (tile && tile.classList.contains('static')) {
             // Statik rengi kaldır, normal boş tile'a döndür
             tile.className = 'tile';
             const front = tile.querySelector('.front');
             // === DÜZELTME (Hard Mode Hatası için) ===
             // Harfleri hem önden hem arkadan sil
             if (front) front.textContent = '';
             const back = tile.querySelector('.back');
             if (back) back.textContent = '';
             // === DÜZELTME SONU ===
        }
    }
}

// === BİTİŞ: YENİ EKLENEN FONKSİYONLAR ===


export function getUsername() {
    const profile = state.getCurrentUserProfile();
    return profile?.username || 'Oyuncu';
}

export function displayStats(profileData) {
    const stats = getStatsFromProfile(profileData);
    document.getElementById('stats-played').textContent = stats.played;
    const winPercentage = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
    document.getElementById('stats-win-percentage').textContent = winPercentage;
    document.getElementById('stats-current-streak').textContent = stats.currentStreak;
    document.getElementById('stats-max-streak').textContent = stats.maxStreak;
    
    const distributionContainer = document.getElementById('stats-guess-distribution');
    distributionContainer.innerHTML = '';
    let maxDistribution = Math.max(...Object.values(stats.guessDistribution));
    if (maxDistribution === 0) maxDistribution = 1;

    for (let i = 1; i <= 6; i++) {
        const count = stats.guessDistribution[String(i)] || 0;
        const percentage = (count / maxDistribution) * 100;
        const bar = `<div class="flex items-center"><div class="w-4">${i}</div><div class="flex-grow bg-gray-700 rounded"><div class="bg-amber-500 text-right pr-2 rounded text-black font-bold" style="width: ${percentage > 0 ? percentage : 1}%">${count > 0 ? count : ''}</div></div></div>`;
        distributionContainer.innerHTML += bar;
    }
}

export function updateMultiplayerScoreBoard(gameData) {
    if (!multiplayerScoreBoard) return;
    
    const isBR = state.getGameMode() === 'multiplayer-br';
    const currentUserId = state.getUserId();
    
    const sequentialGameInfo = document.getElementById('sequential-game-info');
    if (sequentialGameInfo) {
        sequentialGameInfo.classList.toggle('hidden', isBR && state.getGameMode() !== 'daily');
    }
    
    multiplayerScoreBoard.classList.toggle('hidden', !isBR);

    if (isBR) {
        const players = Object.entries(gameData.players)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => a.id.localeCompare(b.id));

        for (let i = 0; i < 4; i++) {
            const slot = brPlayerSlots[i];
            const player = players[i]; 

            if (slot) {
                const nameEl = slot.querySelector('p:first-child');
                const statusEl = slot.querySelector('p:last-child');

                if (player) {
                    const isMe = player.id === currentUserId;
                    const isEliminated = player.isEliminated;
                    const hasSolved = player.hasSolved;
                    const hasFailed = player.hasFailed;

                    let playerStatus = '';
                    let statusColor = 'text-gray-400';
                    let bgColor = isMe ? 'bg-indigo-600' : 'bg-gray-600';
                    let nameColor = isMe ? 'text-white' : 'text-gray-200';

                    if (hasSolved) {
                        playerStatus = 'ÇÖZDÜ!';
                        statusColor = 'text-green-400 font-bold';
                    } else if (isEliminated) {
                        playerStatus = 'ELENDİ';
                        statusColor = 'text-red-400 font-bold';
                        bgColor = 'bg-gray-700 opacity-60'; 
                        nameColor = 'text-gray-500';
                    } else if (hasFailed) {
                        playerStatus = 'HAKKI BİTTİ';
                        statusColor = 'text-yellow-400 font-bold';
                        bgColor = isMe ? 'bg-indigo-800' : 'bg-gray-700';
                    } else if (gameData.status === 'playing') {
                        playerStatus = `${(player.guesses || []).length}/${gameData.GUESS_COUNT}`;
                        statusColor = isMe ? 'text-indigo-200' : 'text-gray-400';
                    } else if (gameData.status === 'waiting') {
                        playerStatus = 'Bekliyor...';
                        statusColor = 'text-gray-400';
                    }

                    slot.className = `${bgColor} p-2 rounded-lg shadow`; 
                    nameEl.textContent = `${player.username} ${isMe ? '(Sen)' : ''}`;
                    nameEl.className = `font-bold text-sm truncate ${nameColor}`;
                    statusEl.textContent = playerStatus;
                    statusEl.className = `text-xs ${statusColor}`;

                } else {
                    slot.className = 'bg-gray-700 p-2 rounded-lg shadow';
                    nameEl.textContent = '---';
                    nameEl.className = 'font-bold text-sm truncate text-gray-500';
                    statusEl.textContent = 'Boş';
                    statusEl.className = 'text-xs text-gray-500';
                }
            }
        }
    }

    const p1ScoreEl = document.getElementById('player1-score');
    const p2ScoreEl = document.getElementById('player2-score');
    
    if (p1ScoreEl && p2ScoreEl && !isBR && state.getGameMode() !== 'daily') {
        const playerIds = Object.keys(gameData.players);
        let p1Id = gameData.creatorId || playerIds[0];
        
        if (playerIds.length > 0) {
            const p1 = gameData.players[p1Id];
            if (p1) p1ScoreEl.innerHTML = `<span class="font-bold">${p1.username}</span><br>${p1.score || 0} Puan`;
        }
        
        if (playerIds.length > 1) {
            const p2Id = playerIds.find(id => id !== p1Id);
            const p2 = gameData.players[p2Id];
            if (p2) p2ScoreEl.innerHTML = `<span class="font-bold">${p2.username}</span><br>${p2.score || 0} Puan`;
        } else {
            p2ScoreEl.innerHTML = '';
        }
    }
}

export function switchFriendTab(tabName) {
    const tabs = { friends: document.getElementById('friends-tab'), requests: document.getElementById('requests-tab'), add: document.getElementById('add-friend-tab') };
    const buttons = { friends: document.getElementById('show-friends-tab-btn'), requests: document.getElementById('show-requests-tab-btn'), add: document.getElementById('show-add-friend-tab-btn') };
    for (const key in tabs) {
        if(tabs[key]) tabs[key].classList.add('hidden');
        if(buttons[key]) {
            buttons[key].classList.remove('text-white', 'border-indigo-500');
            buttons[key].classList.add('text-gray-400');
        }
    }
    if(tabs[tabName]) tabs[tabName].classList.remove('hidden');
    if(buttons[tabName]){
        buttons[tabName].classList.add('text-white', 'border-b-2', 'border-indigo-500');
        buttons[tabName].classList.remove('text-gray-400');
    }
}

export function switchMyGamesTab(tabName) {
    const tabs = { 
        active: document.getElementById('active-games-tab'), 
        finished: document.getElementById('finished-games-tab'), 
        invites: document.getElementById('invites-tab') 
    };
    const buttons = { 
        active: document.getElementById('show-active-games-tab-btn'), 
        finished: document.getElementById('show-finished-games-tab-btn'), 
        invites: document.getElementById('show-invites-tab-btn') 
    };

    for (const key in tabs) {
        if (tabs[key]) tabs[key].classList.add('hidden');
        if (buttons[key]) {
            buttons[key].classList.remove('text-white', 'border-indigo-500');
            buttons[key].classList.add('text-gray-400');
        }
    }

    if (tabs[tabName]) tabs[tabName].classList.remove('hidden');
    if (buttons[tabName]){
        buttons[tabName].classList.add('text-white', 'border-b-2', 'border-indigo-500');
        buttons[tabName].classList.remove('text-gray-400');
    }
}

export function renderMyGamesLists(activeGames, finishedGames, invites) {
    const activeTab = document.getElementById('active-games-tab');
    const finishedTab = document.getElementById('finished-games-tab');
    const invitesTab = document.getElementById('invites-tab');

    activeTab.innerHTML = '';
    finishedTab.innerHTML = '';
    invitesTab.innerHTML = '';

    const createPlaceholder = (text) => `<p class="text-center text-gray-400 mt-16">${text}</p>`;

    // Aktif Oyunları Render Et
    if (activeGames.length > 0) {
        activeGames.forEach(game => {
            const opponentId = game.playerIds.find(id => id !== state.getUserId());
            const opponentUsername = opponentId ? (game.players[opponentId]?.username || 'Rakip') : 'Rakip bekleniyor';
            let statusText = game.status === 'waiting' ? 'Rakip bekleniyor...' : `Sıra: ${game.players[game.currentPlayerId]?.username || '...'}`;
            if (game.currentPlayerId === state.getUserId()) statusText = "Sıra sende!";

            if (game.gameType === 'multiplayer-br') {
                statusText = game.status === 'waiting' ? `Lobi (${game.playerIds.length}/${game.maxPlayers || 4})` : `Oynanıyor (Tur ${game.currentRound})`;
            }

            const gameDiv = createElement('div', {
                className: 'bg-gray-700 p-3 rounded-lg mb-2 flex justify-between items-center'
            });

            const infoDiv = createElement('div', {
                className: 'cursor-pointer hover:opacity-75',
                onclick: () => (game.gameType === 'multiplayer-br' ? joinBRGame(game.id) : joinGame(game.id)),
            });
            
            const titleP = createElement('p', {
                className: 'font-bold',
                textContent: game.gameType === 'multiplayer-br' ? 'Battle Royale' : opponentUsername
            });
            
            const statusP = createElement('p', {
                className: `text-sm ${game.currentPlayerId === state.getUserId() || (game.gameType === 'multiplayer-br' && game.status === 'playing') ? 'text-green-400 font-bold' : 'text-gray-400'}`,
                textContent: statusText
            });

            infoDiv.appendChild(titleP);
            infoDiv.appendChild(statusP);

            const leaveBtn = createElement('button', {
                className: 'bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-lg text-xs flex-shrink-0',
                textContent: 'Ayrıl',
                onclick: (e) => {
                    e.stopPropagation(); 
                    const gameName = game.gameType === 'multiplayer-br' ? 'Battle Royale' : opponentUsername;
                    if (confirm(`'${gameName}' oyunundan ayrılmak istediğinize emin misiniz? Bu işlem oyunu sonlandırabilir.`)) {
                        abandonGame(game.id, gameDiv); 
                    }
                }
            });
            
            gameDiv.appendChild(infoDiv);
            gameDiv.appendChild(leaveBtn);

            activeTab.appendChild(gameDiv);
        });
    } else {
        activeTab.innerHTML = createPlaceholder('Aktif oyununuz bulunmuyor.');
    }

    // Biten Oyunları Render Et
    if (finishedGames.length > 0) {
        finishedGames.forEach(game => {
            const opponentId = game.playerIds.find(id => id !== state.getUserId());
            const opponentUsername = opponentId ? (game.players[opponentId]?.username || 'Rakip') : 'Bilinmiyor';
            let resultText = 'Bitti';
            let borderColor = 'border-gray-500';

            if (game.gameType === 'multiplayer-br') {
                const isWinner = game.matchWinnerId === state.getUserId();
                resultText = isWinner ? 'Kazandın' : (game.matchWinnerId === null ? 'Berabere' : 'Kaybettin');
                borderColor = isWinner ? 'border-green-500' : (game.matchWinnerId === null ? 'border-yellow-500' : 'border-red-500');
            } else {
                const isWinner = game.roundWinner === state.getUserId(); 
                resultText = game.roundWinner ? (isWinner ? 'Kazandın' : 'Kaybettin') : 'Berabere';
                borderColor = isWinner ? 'border-green-500' : (game.roundWinner === null ? 'border-yellow-500' : 'border-red-500');
            }

            const gameDiv = createElement('div', {
                className: `bg-gray-800 p-3 rounded-lg mb-2 border-l-4 ${borderColor}`,
                innerHTML: `
                    <div class="flex justify-between items-center">
                        <p class="font-bold">${game.gameType === 'multiplayer-br' ? 'Battle Royale' : opponentUsername}</p>
                        <p class="text-sm font-bold ${borderColor.replace('border-', 'text-')}">${resultText}</p>
                    </div>
                `
            });
            finishedTab.appendChild(gameDiv);
        });
    } else {
        finishedTab.innerHTML = createPlaceholder('Henüz biten oyununuz yok.');
    }

    // Davetleri Render Et
    if (invites.length > 0) {
        invites.forEach(invite => {
            const creatorUsername = invite.players[invite.creatorId]?.username || 'Bir arkadaşın';
            
            const inviteDiv = createElement('div', {
                className: 'bg-gray-700 p-3 rounded-lg mb-2',
                innerHTML: `<p><strong>${creatorUsername}</strong> seni bir ${invite.gameType === 'multiplayer-br' ? 'Battle Royale' : 'oyuna'} davet ediyor!</p>`
            });

            const buttonWrapper = createElement('div', {
                className: 'flex gap-2 mt-2 justify-end' 
            });

            const rejectBtn = createElement('button', {
                className: 'bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-lg text-xs',
                textContent: 'İptal',
                onclick: (e) => {
                    e.stopPropagation(); 
                    rejectInvite(invite.id); 
                }
            });

            const joinBtn = createElement('button', {
                className: 'bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-lg text-xs',
                textContent: 'Katıl',
                onclick: (e) => {
                    e.stopPropagation();
                    if (invite.gameType === 'multiplayer-br') {
                        joinBRGame(invite.id);
                    } else {
                        acceptInvite(invite.id); 
                    }
                }
            });

            buttonWrapper.appendChild(rejectBtn);
            buttonWrapper.appendChild(joinBtn);
            inviteDiv.appendChild(buttonWrapper);
            invitesTab.appendChild(inviteDiv);
        });
    } else {
        invitesTab.innerHTML = createPlaceholder('Yeni davetiniz yok.');
    }
}

export function updateJokerUI(jokersUsed, isMyTurn, gameStatus) {
    const jokers = [jokerPresentBtn, jokerCorrectBtn, jokerRemoveBtn];
    const jokerKeys = ['present', 'correct', 'remove'];

    const canUseJokers = isMyTurn && gameStatus === 'playing';

    jokers.forEach((btn, index) => {
        if (!btn) return;
        
        const key = jokerKeys[index];
        const isUsed = (jokersUsed && jokersUsed[key]) ? true : false;

        if (isUsed || !canUseJokers) {
            btn.disabled = true;
        } else {
            btn.disabled = false;
        }
    });
}

// === BAŞLANGIÇ: "NASIL OYNANIR" ANİMASYON KODLARI (DEĞİŞİKLİK YOK) ===

let tutorialTimeoutIds = []; 
let isTutorialRunning = false; 

const wait = (ms) => new Promise((resolve, reject) => {
    if (!isTutorialRunning) {
        reject(new Error("Tutorial stopped"));
        return;
    }
    const id = setTimeout(resolve, ms);
    tutorialTimeoutIds.push(id);
});

function cleanTutorialBoard() {
    tutorialTimeoutIds.forEach(id => clearTimeout(id));
    tutorialTimeoutIds = [];

    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 5; c++) {
            const tile = document.getElementById(`t-${r}-${c}`);
            if (tile) {
                tile.classList.remove('flip');
                const front = tile.querySelector('.front');
                const back = tile.querySelector('.back');
                front.textContent = '';
                front.classList.remove('pop');
                back.textContent = ''; 
                back.className = 'tile-inner back'; 
            }
        }
    }
    
    document.querySelectorAll('#tutorial-keyboard .tutorial-key').forEach(key => {
        key.className = 'tutorial-key'; 
    });

    const jokerIds = ['tutorial-joker-present', 'tutorial-joker-correct', 'tutorial-joker-remove'];
    jokerIds.forEach(id => {
        const jokerBtn = document.getElementById(id);
        if (jokerBtn) {
            jokerBtn.disabled = false;
            jokerBtn.classList.remove('tutorial-highlight');
        }
    });
}

async function typeTutorialTile(row, col, letter, delay) {
    await wait(delay);
    const tile = document.getElementById(`t-${row}-${col}`);
    if (tile) {
        const front = tile.querySelector('.front');
        front.textContent = letter;
        front.classList.add('pop');
    }
}

async function flipTutorialTile(row, col, colorClass, delay) {
    await wait(delay);
    const tile = document.getElementById(`t-${row}-${col}`);
    if (tile) {
        const front = tile.querySelector('.front');
        const back = tile.querySelector('.back');
        
        back.textContent = front.textContent; 
        back.className = 'tile-inner back ' + colorClass; 
        tile.classList.add('flip'); 
    }
}

async function updateTutorialKeyboard(keys, colorClass, delay) {
    await wait(delay);
    keys.forEach(key => {
        const keyEl = document.querySelector(`#tutorial-keyboard .tutorial-key[data-key="${key}"]`);
        if (!keyEl) return; 

        if (keyEl.classList.contains('correct')) return;
        if (keyEl.classList.contains('present') && colorClass === 'absent') return;
        if (keyEl.classList.contains(colorClass)) return;
        
        if (colorClass === 'correct') {
            keyEl.className = 'tutorial-key correct';
        } else if (colorClass === 'present') {
            keyEl.className = 'tutorial-key present';
        } else { // absent
            keyEl.className = 'tutorial-key absent';
        }
        
        keyEl.classList.add('key-pop');
        setTimeout(() => keyEl.classList.remove('key-pop'), 200); 
    });
}

async function highlightTutorialJoker(jokerId, delay, duration = 1000) {
    await wait(delay);
    const jokerBtn = document.getElementById(jokerId);
    if (jokerBtn) {
        jokerBtn.classList.add('tutorial-highlight');
        await wait(duration);
        jokerBtn.classList.remove('tutorial-highlight');
    }
}

async function disableTutorialJoker(jokerId, delay) {
    await wait(delay);
    const jokerBtn = document.getElementById(jokerId);
    if (jokerBtn) {
        jokerBtn.disabled = true;
    }
}

async function animateJokerRemove(delay) {
    await wait(delay);
    const keysToEliminate = ['Y', 'I', 'P', 'A']; 
    
    let eliminationDelay = 100; 
    for (const key of keysToEliminate) {
        const keyEl = document.querySelector(`#tutorial-keyboard .tutorial-key[data-key="${key}"]`);
        if (keyEl && !keyEl.classList.contains('absent')) {
            await wait(eliminationDelay);
            keyEl.className = 'tutorial-key absent'; 
            keyEl.classList.add('key-pop');
            setTimeout(() => keyEl.classList.remove('key-pop'), 200);
        }
    }
}


export async function playTutorialAnimation() {
    if (isTutorialRunning) return; 
    isTutorialRunning = true; 
    cleanTutorialBoard(); 

    // Senaryonun gizli kelimesi: ÖRNEK
    
    try {
        // --- ADIM 1: TAHMİN "ÖLÇÜT" (SATIR 0) ---
        const guess1 = { word: ['Ö', 'L', 'Ç', 'Ü', 'T'], colors: ['correct', 'absent', 'absent', 'absent', 'absent'], keys: { correct: ['Ö'], absent: ['L', 'Ç', 'Ü', 'T'] } };
        await typeTutorialTile(0, 0, guess1.word[0], 50); 
        await typeTutorialTile(0, 1, guess1.word[1], 150);
        await typeTutorialTile(0, 2, guess1.word[2], 150);
        await typeTutorialTile(0, 3, guess1.word[3], 150);
        await typeTutorialTile(0, 4, guess1.word[4], 150);
        await wait(1000);
        for (let i = 0; i < 5; i++) await flipTutorialTile(0, i, guess1.colors[i], 300);
        await updateTutorialKeyboard(guess1.keys.correct, 'correct', 0);
        await updateTutorialKeyboard(guess1.keys.absent, 'absent', 0);
        await wait(2000); 

        // --- ADIM 2: TAHMİN "ÖZLEM" (SATIR 1) ---
        const guess2 = { word: ['Ö', 'Z', 'L', 'E', 'M'], colors: ['correct', 'absent', 'absent', 'correct', 'absent'], keys: { correct: ['E'], absent: ['Z', 'M'] } };
        await wait(500); // Tahminler arası bekleme
        await typeTutorialTile(1, 0, 'Ö', 0); // 'Ö' harfini satıra koy
        await flipTutorialTile(1, 0, 'correct', 0); // Anında yeşil yap
        await wait(1500); // *** KRİTİK BEKLEME 1: Kullanıcı taşınan harfi görsün ***
        await typeTutorialTile(1, 1, guess2.word[1], 150); // 'Z'
        await typeTutorialTile(1, 2, guess2.word[2], 150); // 'L'
        await typeTutorialTile(1, 3, guess2.word[3], 150); // 'E'
        await typeTutorialTile(1, 4, guess2.word[4], 150); // 'M'
        await wait(1000);
        for (let i = 1; i < 5; i++) await flipTutorialTile(1, i, guess2.colors[i], 300);
        await updateTutorialKeyboard(guess2.keys.correct, 'correct', 0);
        await updateTutorialKeyboard(guess2.keys.absent, 'absent', 0);
        await wait(2000); 

        // --- ADIM 3: SARI JOKER + TAHMİN "ÖNDER" (SATIR 2) ---
        await wait(500); // Adımlar arası bekleme
        await typeTutorialTile(2, 0, 'Ö', 0); // 0. index
        await flipTutorialTile(2, 0, 'correct', 0);
        await typeTutorialTile(2, 3, 'E', 150); // 3. index
        await flipTutorialTile(2, 3, 'correct', 0);
        await wait(2000); // *** KRİTİK BEKLEME 2: (Yavaşlatıldı) Kullanıcı taşınan 2 harfi görsün ***

        await highlightTutorialJoker('tutorial-joker-present', 0, 1000);
        await disableTutorialJoker('tutorial-joker-present', 1000);
        await wait(1000); // Jokerin basılma efektini gör

        await typeTutorialTile(2, 1, 'N', 500); // Jokerin ipucu verdiği 'N' harfi
        await flipTutorialTile(2, 1, 'present', 0); // Anında SARI yap
        await wait(2000); // *** KRİTİK BEKLEME 3: (Yavaşlatıldı) Kullanıcı sarı joker ipucunu görsün ***
        
        await typeTutorialTile(2, 2, 'D', 150);
        await typeTutorialTile(2, 4, 'R', 150);

        const guess3 = { word: ['Ö', 'N', 'D', 'E', 'R'], colors: ['correct', 'present', 'absent', 'correct', 'present'], keys: { present: ['N', 'R'], absent: ['D'] } };
        await wait(1000);
        await flipTutorialTile(2, 2, guess3.colors[2], 300); // D (gri)
        await flipTutorialTile(2, 4, guess3.colors[4], 300); // R (sarı)
        await updateTutorialKeyboard(guess3.keys.present, 'present', 0);
        await updateTutorialKeyboard(guess3.keys.absent, 'absent', 0);
        await wait(2000); 

        // --- ADIM 4: KLAVYE JOKERİ (Remove) ---
        await wait(500); // Adımlar arası bekleme
        await typeTutorialTile(3, 0, 'Ö', 0); // 4. Satıra (index 3) 'Ö' koy
        await flipTutorialTile(3, 0, 'correct', 0);
        await typeTutorialTile(3, 3, 'E', 150); // 4. Satıra (index 3) 'E' koy
        await flipTutorialTile(3, 3, 'correct', 0);
        await wait(2000); // *** KRİTİK BEKLEME 4: (Yavaşlatıldı) Taşınan harfleri gör ***

        await highlightTutorialJoker('tutorial-joker-remove', 0, 1000);
        await disableTutorialJoker('tutorial-joker-remove', 1000);
        await animateJokerRemove(1000); // 4 harfi sil
        await wait(2000); 

        // --- ADIM 5: YEŞİL JOKER (Correct) + "ÖRNEK" TAHMİNİ (SATIR 3) ---
        await wait(500); // Adımlar arası bekleme
        await highlightTutorialJoker('tutorial-joker-correct', 0, 1000);
        await disableTutorialJoker('tutorial-joker-correct', 1000);
        await wait(1000); // Jokerin basılma efektini gör
        
        await typeTutorialTile(3, 4, 'K', 500); // Jokerin ipucu verdiği 'K' harfi
        await flipTutorialTile(3, 4, 'correct', 0); // Anında YEŞİL yap
        await wait(2000); // *** KRİTİK BEKLEME 5: (Yavaşlatıldı) Yeşil joker ipucunu gör ***
        
        const guess4 = { word: ['Ö', 'R', 'N', 'E', 'K'], colors: ['correct', 'correct', 'correct', 'correct', 'correct'], keys: { correct: ['R', 'N', 'K'] } };
        await typeTutorialTile(3, 1, guess4.word[1], 150); // R
        await typeTutorialTile(3, 2, guess4.word[2], 150); // N
        
        await wait(1000);
        await flipTutorialTile(3, 1, guess4.colors[1], 300);
        await flipTutorialTile(3, 2, guess4.colors[2], 300);
        
        await updateTutorialKeyboard(guess4.keys.correct, 0);
        
        // Animasyon bitti.
        
    } catch (e) {
        // "Anladım"a basılırsa burası çalışır.
        console.log("Tutorial animation stopped by user.");
    } finally {
        isTutorialRunning = false;
    }
}

export function stopTutorialAnimation() {
    isTutorialRunning = false; 
    cleanTutorialBoard();
}
// === BİTİŞ: "NASIL OYNANIR" ANİMASYON KODLARI ===