// js/ui.js - TAM DOSYA (Sözlük Özelliği Eklendi)

import * as state from './state.js'; 
import { getStatsFromProfile, createElement } from './utils.js';
import { 
    joinGame, joinBRGame, acceptInvite, rejectInvite, abandonGame, 
    checkLeagueStatus, joinCurrentLeague, buyItem, addGold,
    loadDictionary, removeWordFromDictionary // <-- Sözlük için eklendi
} from './game.js';

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
    closeProfileBtn, marketBtn, backToMainFromMarketBtn, userGoldDisplay, stockPresent, stockCorrect, stockRemove,
    
    // Navigation
    backToMainMenuBtn, backToMainMenuFromGamesBtn, backToMainFromFriendsBtn,
    backToModeMultiBtn, backToModeBrBtn, leaveGameButton,
    
    // Game Setup
    randomGameBtn, seriesGameBtn, withFriendsBtn, vsCpuBtn, multiplayerBrBtn,
    dailyWordBtn, 
    createGameBtn, joinGameBtn, createBRGameBtn, joinBRGameBtn,
    
    // Kelimelig UI
    kelimeligBtn, joinLeagueBtn, backToMainFromLeagueBtn, 
    leagueIntroSection, leagueDashboardSection, leagueMatchesList,
    btnShowFixtures, btnShowStandings, tabLeagueFixtures, tabLeagueStandings, leagueStandingsBody,

    // Friends Tabs
    friendsTab, requestsTab, addFriendTab, showFriendsTabBtn, 
    showRequestsTabBtn, showAddFriendTabBtn, searchFriendBtn, friendRequestCount,
    
    // My Games Tabs
    showActiveGamesTabBtn, showFinishedGamesTabBtn, showInvitesTabBtn, 
    gameInviteCount,
    
    // Game Over
    newRoundBtn, mainMenuBtn, shareResultsBtn,
    
    // Misc
    userDisplay, invitationModal, 
    copyGameIdBtn,

    // --- SÖZLÜK ELEMENTLERİ (YENİ) ---
    dictionaryMenuBtn, dictionaryScreen, backToMainFromDictionaryBtn, 
    dictionaryListContainer, dictionaryEmptyMsg, btnAddWordToDict;

const brPlayerSlots = []; 
let currentScreen = '';

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

    // Kelimelig UI
    kelimeligBtn = document.getElementById('kelimelig-btn');
    joinLeagueBtn = document.getElementById('join-league-btn');
    backToMainFromLeagueBtn = document.getElementById('back-to-main-from-league-btn');
    leagueIntroSection = document.getElementById('league-intro-section');
    leagueDashboardSection = document.getElementById('league-dashboard-section');
    leagueMatchesList = document.getElementById('league-matches-list');
    
    // Kelimelig Tabs
    btnShowFixtures = document.getElementById('btn-show-fixtures');
    btnShowStandings = document.getElementById('btn-show-standings');
    tabLeagueFixtures = document.getElementById('tab-league-fixtures');
    tabLeagueStandings = document.getElementById('tab-league-standings');
    leagueStandingsBody = document.getElementById('league-standings-body');

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

    // Market UI
    marketBtn = document.getElementById('market-btn');
    backToMainFromMarketBtn = document.getElementById('back-to-main-from-market-btn');
    userGoldDisplay = document.getElementById('user-gold-display');
    stockPresent = document.getElementById('stock-present');
    stockCorrect = document.getElementById('stock-correct');
    stockRemove = document.getElementById('stock-remove');

    // --- SÖZLÜK ELEMENTLERİ (YENİ) ---
    dictionaryMenuBtn = document.getElementById('dictionary-menu-btn');
    dictionaryScreen = document.getElementById('dictionary-screen');
    backToMainFromDictionaryBtn = document.getElementById('back-to-main-from-dictionary-btn');
    dictionaryListContainer = document.getElementById('dictionary-list-container');
    dictionaryEmptyMsg = document.getElementById('dictionary-empty-msg');
    btnAddWordToDict = document.getElementById('btn-add-word-to-dict');
}

export function showScreen(screenId, isBackNavigation = false) {
    const screens = [
        'login-screen', 'register-screen', 'main-menu-screen', 'new-game-screen',
        'my-games-screen', 'game-screen', 'scoreboard-screen', 'profile-screen',
        'how-to-play-screen', 'friends-screen', 'br-setup-screen', 'multiplayer-setup-screen',
        'edit-profile-screen', 'kelimelig-screen', 'kirtasiye-screen',
        'dictionary-screen' // <-- Sözlük Ekranı Eklendi
    ];
    
    if (currentScreen === screenId) return;

    screens.forEach(id => {
        const screenElement = document.getElementById(id);
        if (screenElement) {
            screenElement.classList.add('hidden');
        }
    });
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
        currentScreen = screenId;
        if (!isBackNavigation) {
            history.pushState({ screen: screenId }, '', `#${screenId}`);
        }
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

export function updateKeyboard(gameData) {
    if (!gameData || !gameData.players) return;

    const currentUserId = state.getUserId(); 
    if (!currentUserId) return; 

    const keyStates = {};

    // 1. Tahminlerden Gelen Renkler
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

    // Eğer bir harf yeşil jokerle açıldıysa, klavyede her zaman yeşil kalsın.
    // --- DÜZELTME BAŞLANGIÇ: Yeşil Joker Hafızasını da Ekle ---
    const knownPositions = state.getKnownCorrectPositions(); 
    if (knownPositions) {
        Object.values(knownPositions).forEach(letter => {
            if (letter) keyStates[letter] = 'correct'; 
        });
    }

    // --- YENİ EKLEME: Turuncu Joker Hafızasını da Ekle ---
    const presentLetters = state.getPresentJokerLetters(); 
    
    if (presentLetters) {
        presentLetters.forEach(letter => {
            // Eğer harf zaten YEŞİL değilse, SARI yap
            if (keyStates[letter] !== 'correct') {
                keyStates[letter] = 'present';
            }
        });
    }
    
    // 3. Klavyeyi Boya
    document.querySelectorAll('.keyboard-key').forEach(btn => {
        const keyId = btn.dataset.key;
        if (keyId === 'ENTER' || keyId === '⌫') return;
        
        const guessColor = keyStates[keyId]; 
        
        // Mevcut renkleri temizle
        btn.classList.remove('correct', 'present', 'absent');
        
        // Yeni rengi ekle
        if (guessColor === 'correct') btn.classList.add('correct');
        else if (guessColor === 'present') btn.classList.add('present');
        else if (guessColor === 'absent') btn.classList.add('absent');
    });
}

export function updateStaticTile(row, col, letter, colorClass) {
    const tileId = `tile-${row}-${col}`;
    const tile = document.getElementById(tileId);
    if (!tile) return;
    const front = tile.querySelector('.front');
    const back = tile.querySelector('.back');
    front.textContent = letter;
    back.textContent = letter;
    back.className = 'tile-inner back ' + colorClass;
    tile.className = 'tile static ' + colorClass;
}

export function clearStaticTiles(row, wordLength) {
     for (let j = 0; j < wordLength; j++) {
        const tileId = `tile-${row}-${j}`;
        const tile = document.getElementById(tileId);
        if (tile && tile.classList.contains('static')) {
             tile.className = 'tile';
             const front = tile.querySelector('.front');
             if (front) front.textContent = '';
             const back = tile.querySelector('.back');
             if (back) back.textContent = '';
        }
    }
}

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
            .sort((a, b) => (b.score || 0) - (a.score || 0)); 

        for (let i = 0; i < 4; i++) {
            const slot = brPlayerSlots[i];
            const player = players[i]; 

            if (slot) {
                const nameEl = slot.querySelector('p:first-child');
                const statusEl = slot.querySelector('p:last-child');

                if (player) {
                    const isMe = player.id === currentUserId;
                    const hasSolved = player.hasSolved;
                    const hasFailed = player.hasFailed;

                    let playerStatus = '';
                    let statusColor = 'text-gray-400';
                    let bgColor = isMe ? 'bg-indigo-600' : 'bg-gray-700';
                    let nameColor = isMe ? 'text-white' : 'text-gray-200';

                    const scoreText = `${player.score || 0} Puan`;

                    if (hasSolved) {
                        playerStatus = `✅ ${scoreText}`;
                        statusColor = 'text-green-400 font-bold';
                    } else if (hasFailed) {
                        playerStatus = `❌ ${scoreText}`;
                        statusColor = 'text-red-400 font-bold';
                    } else if (gameData.status === 'playing') {
                        const guessCount = (player.guesses || []).length;
                        playerStatus = `🤔 ${guessCount}/6 - ${scoreText}`;
                        statusColor = 'text-yellow-300';
                    } else if (gameData.status === 'waiting') {
                        playerStatus = 'Bekliyor...';
                    } else {
                         playerStatus = scoreText;
                    }

                    slot.className = `${bgColor} p-2 rounded-lg shadow border border-gray-600`; 
                    nameEl.textContent = `${player.username}`;
                    nameEl.className = `font-bold text-sm truncate ${nameColor}`;
                    statusEl.textContent = playerStatus;
                    statusEl.className = `text-xs ${statusColor}`;

                } else {
                    slot.className = 'bg-gray-800 p-2 rounded-lg shadow opacity-50';
                    nameEl.textContent = '-';
                    statusEl.textContent = 'Boş';
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

    const getGameTypeLabel = (game) => {
        if (game.gameType === 'multiplayer-br') return '👑 Battle Royale';
        if (game.gameType === 'random_series') return '🏆 Seri Oyun (Rastgele)';
        if (game.gameType === 'random_loose') return '🎲 Gevşek Oyun';
        if (game.gameType === 'friend') {
            return game.matchLength > 1 ? '🆚 Seri Oyun (Arkadaş)' : '⚔️ Meydan Okuma';
        }
        return 'Oyun';
    };

    if (activeGames.length > 0) {
        activeGames.forEach(game => {
            const opponentId = game.playerIds.find(id => id !== state.getUserId());
            const opponentUsername = opponentId ? (game.players[opponentId]?.username || 'Rakip') : 'Rakip bekleniyor';
            
            let statusText = game.status === 'waiting' ? 'Rakip bekleniyor...' : `Sıra: ${game.players[game.currentPlayerId]?.username || '...'}`;
            if (game.currentPlayerId === state.getUserId()) statusText = "Sıra sende!";

            if (game.gameType === 'multiplayer-br') {
                statusText = game.status === 'waiting' ? `Lobi (${game.playerIds.length}/${game.maxPlayers || 4})` : `Oynanıyor (Tur ${game.currentRound})`;
            }

            const typeLabel = getGameTypeLabel(game);

            const gameDiv = createElement('div', {
                className: 'bg-gray-700 p-3 rounded-lg mb-2 flex justify-between items-center'
            });

            const infoDiv = createElement('div', {
                className: 'cursor-pointer hover:opacity-75 flex-grow',
                onclick: () => (game.gameType === 'multiplayer-br' ? joinBRGame(game.id) : joinGame(game.id)),
            });
            
            const titleContainer = createElement('div', { className: 'flex flex-col mb-1' });
            
            const titleP = createElement('span', {
                className: 'font-bold text-white text-lg',
                textContent: game.gameType === 'multiplayer-br' ? 'Battle Royale Ligi' : opponentUsername
            });

            const typeBadge = createElement('span', {
                className: 'text-xs text-indigo-300 font-medium uppercase tracking-wide',
                textContent: typeLabel
            });

            titleContainer.appendChild(titleP);
            titleContainer.appendChild(typeBadge);
            
            const statusP = createElement('p', {
                className: `text-sm ${game.currentPlayerId === state.getUserId() || (game.gameType === 'multiplayer-br' && game.status === 'playing') ? 'text-green-400 font-bold' : 'text-gray-400'}`,
                textContent: statusText
            });

            infoDiv.appendChild(titleContainer);
            infoDiv.appendChild(statusP);

            const leaveBtn = createElement('button', {
                className: 'bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg text-xs flex-shrink-0 ml-2',
                textContent: 'Ayrıl',
                onclick: (e) => {
                    e.stopPropagation(); 
                    const gameName = game.gameType === 'multiplayer-br' ? 'Battle Royale' : opponentUsername;
                    if (confirm(`'${gameName}' oyunundan ayrılmak istediğinize emin misiniz?`)) {
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

    if (finishedGames.length > 0) {
        finishedGames.forEach(game => {
            const opponentId = game.playerIds.find(id => id !== state.getUserId());
            const opponentUsername = opponentId ? (game.players[opponentId]?.username || 'Rakip') : 'Bilinmiyor';
            
            let resultText = 'Bitti';
            let borderColor = 'border-gray-500';

            if (game.gameType === 'multiplayer-br') {
                const myScore = game.players[state.getUserId()]?.score || 0;
                resultText = `${myScore} Puan`;
                borderColor = 'border-indigo-500';
            } else {
                const isWinner = game.roundWinner === state.getUserId(); 
                resultText = game.roundWinner ? (isWinner ? 'Kazandın' : 'Kaybettin') : 'Berabere';
                borderColor = isWinner ? 'border-green-500' : (game.roundWinner === null ? 'border-yellow-500' : 'border-red-500');
            }

            const typeLabel = getGameTypeLabel(game);

            const gameDiv = createElement('div', {
                className: `bg-gray-800 p-3 rounded-lg mb-2 border-l-4 ${borderColor} relative`,
                innerHTML: `
                    <div class="flex justify-between items-start">
                        <div class="flex flex-col">
                            <span class="text-xs text-gray-500 mb-1">${typeLabel}</span>
                            <p class="font-bold text-white">${game.gameType === 'multiplayer-br' ? 'Battle Royale' : opponentUsername}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-sm font-bold ${borderColor.replace('border-', 'text-')}">${resultText}</p>
                            <span class="text-xs text-gray-500">${new Date(game.createdAt?.seconds * 1000).toLocaleDateString('tr-TR')}</span>
                        </div>
                    </div>
                `
            });
            finishedTab.appendChild(gameDiv);
        });
    } else {
        finishedTab.innerHTML = createPlaceholder('Henüz biten oyununuz yok.');
    }

    if (invites.length > 0) {
        invites.forEach(invite => {
            const creatorUsername = invite.players[invite.creatorId]?.username || 'Bir arkadaşın';
            const typeLabel = getGameTypeLabel(invite);
            
            const inviteDiv = createElement('div', {
                className: 'bg-indigo-900/40 border border-indigo-500/30 p-4 rounded-lg mb-2',
                innerHTML: `
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded">${typeLabel}</span>
                    </div>
                    <p class="text-gray-200 mb-3">
                        <strong class="text-white text-lg">${creatorUsername}</strong> seni oyuna davet ediyor!
                    </p>
                `
            });

            const buttonWrapper = createElement('div', {
                className: 'flex gap-3 justify-end' 
            });

            const rejectBtn = createElement('button', {
                className: 'bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg text-sm transition-colors',
                textContent: 'Reddet',
                onclick: (e) => {
                    e.stopPropagation(); 
                    rejectInvite(invite.id); 
                }
            });

            const joinBtn = createElement('button', {
                className: 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg text-sm shadow-lg transition-transform active:scale-95',
                textContent: 'Kabul Et',
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

export function updateJokerUI(unusedParam, isMyTurn, gameStatus) {
    const jokers = [jokerPresentBtn, jokerCorrectBtn, jokerRemoveBtn];
    const jokerKeys = ['present', 'correct', 'remove'];

    // Profil bilgisinden stok durumunu al
    const profile = state.getCurrentUserProfile();
    const inventory = profile ? (profile.inventory || {}) : {};

    const canPlay = isMyTurn && gameStatus === 'playing';

    jokers.forEach((btn, index) => {
        if (!btn) return;
        
        const key = jokerKeys[index];
        const stock = inventory[key] || 0;

        // Rozeti güncelle (Stok sayısını yaz)
        const badge = btn.querySelector('.joker-badge');
        if (badge) {
            badge.textContent = `x${stock}`;
            // Stok yoksa rozeti gri yap, varsa kırmızı
            badge.style.backgroundColor = stock > 0 ? '#ef4444' : '#6b7280';
        }

        // Butonu aktif/pasif yap
        // Kural: Sıra sendeyse VE stok varsa aktiftir.
        if (canPlay && stock > 0) {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
        } else {
            btn.disabled = true;
            // Eğer stok yoksa biraz daha silik görünsün
            btn.style.opacity = stock <= 0 ? "0.5" : "1"; 
            btn.style.cursor = "not-allowed";
        }
    });
}

// --- KELİMELİG (League) EK FONKSİYONLARI ---

export async function openKelimeligScreen() {
    showScreen('kelimelig-screen');
    
    const intro = document.getElementById('league-intro-section');
    const dashboard = document.getElementById('league-dashboard-section');
    const joinStatus = document.getElementById('league-join-status');
    const joinBtn = document.getElementById('join-league-btn');

    if(intro) intro.classList.remove('hidden');
    if(dashboard) dashboard.classList.add('hidden');
    if(joinStatus) joinStatus.classList.add('hidden');
    if(joinBtn) joinBtn.classList.remove('hidden');

    await checkLeagueStatus();
}

export function renderLeagueMatches(matches, currentUserId) {
    const list = document.getElementById('league-matches-list');
    if (!list) return;
    list.innerHTML = '';

    if (matches.length === 0) {
        list.innerHTML = `
            <div class="text-center p-8 bg-gray-700/30 rounded-lg border border-dashed border-gray-600">
                <p class="text-gray-400 text-sm">Henüz rakip yok.</p>
                <p class="text-xs text-gray-500 mt-1">Lig başladığında rakipler burada görünecek.</p>
            </div>
        `;
        return;
    }

    matches.forEach(match => {
        const opponentId = match.p1 === currentUserId ? match.p2 : match.p1;
        const opponentName = match.opponentName || 'Rakip';
        
        const myData = match.p1 === currentUserId ? match.p1_data : match.p2_data;
        const oppData = match.p1 === currentUserId ? match.p2_data : match.p1_data;
        
        const hasIPlayed = myData && myData.guesses;
        const hasOppPlayed = oppData && oppData.guesses;

        let statusBadge = '';
        let buttonHTML = '';
        let cardClass = 'bg-gray-800 border-gray-700';
        let scoreDisplay = '';

        if (hasIPlayed) {
            if (!hasOppPlayed) {
                buttonHTML = '<button class="bg-gray-600 text-gray-400 cursor-not-allowed py-1 px-3 rounded text-xs font-bold" disabled>Bekleniyor...</button>';
                statusBadge = '<span class="text-[10px] bg-yellow-900/50 text-yellow-500 px-2 py-0.5 rounded uppercase tracking-wide">Rakip Bekleniyor</span>';
                cardClass = 'bg-gray-800/80 border-yellow-900/30';
            } else {
                const myGuesses = myData.guesses.length;
                const oppGuesses = oppData.guesses.length;
                const myFail = myData.failed;
                const oppFail = oppData.failed;
                
                let myPoints = 0;
                let resultText = '';
                let resultColor = '';

                if (myFail && oppFail) { myPoints = 1; resultText = 'BERABERE'; resultColor = 'text-blue-400'; }
                else if (myFail) { myPoints = 0; resultText = 'KAYBETTİN'; resultColor = 'text-red-400'; }
                else if (oppFail) { myPoints = 3; resultText = 'KAZANDIN'; resultColor = 'text-green-400'; }
                else if (myGuesses < oppGuesses) { myPoints = 3; resultText = 'KAZANDIN'; resultColor = 'text-green-400'; }
                else if (myGuesses === oppGuesses) { myPoints = 1; resultText = 'BERABERE'; resultColor = 'text-blue-400'; }
                else { myPoints = 0; resultText = 'KAYBETTİN'; resultColor = 'text-red-400'; }

                buttonHTML = `<div class="text-right"><span class="block text-xs font-bold ${resultColor}">${resultText}</span></div>`;
                scoreDisplay = `<div class="flex flex-col items-center justify-center bg-gray-900 rounded p-2 ml-3 w-12 h-12 border border-gray-700 shadow-inner">
                                    <span class="text-lg font-black text-white leading-none">${myPoints}</span>
                                    <span class="text-[8px] text-gray-500 uppercase">Puan</span>
                                </div>`;
                cardClass = myPoints === 3 ? 'bg-green-900/20 border-green-900/50' : (myPoints === 1 ? 'bg-blue-900/20 border-blue-900/50' : 'bg-red-900/10 border-red-900/30');
            }
        } else {
            buttonHTML = `<button class="play-league-match-btn bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg text-sm shadow-lg transition active:scale-95 flex items-center gap-1">
                            <span>▶</span> OYNA
                          </button>`;
            statusBadge = '<span class="text-[10px] bg-green-900/50 text-green-400 px-2 py-0.5 rounded uppercase tracking-wide animate-pulse">Sıra Sende</span>';
            cardClass = 'bg-gray-700 border-green-500/50 shadow-md';
        }

        const matchDiv = document.createElement('div');
        matchDiv.className = `p-3 rounded-lg border flex justify-between items-center transition hover:bg-gray-750 ${cardClass}`;
        
        matchDiv.innerHTML = `
            <div class="flex flex-col">
                <div class="flex items-center gap-2 mb-1">
                    <span class="font-bold text-white text-md">${opponentName}</span>
                </div>
                ${statusBadge}
            </div>
            <div class="flex items-center">
                ${buttonHTML}
                ${scoreDisplay}
            </div>
        `;
        
        const playBtn = matchDiv.querySelector('.play-league-match-btn');
        if (playBtn) {
            playBtn.onclick = () => {
                import('./game.js').then(module => {
                    module.startLeagueMatch(match.id, opponentId, opponentName);
                });
            };
        }

        list.appendChild(matchDiv);
    });
}

// --- TUTORIAL (Animasyon Kodları) ---
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
        } else { 
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
    
    try {
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

        const guess2 = { word: ['Ö', 'Z', 'L', 'E', 'M'], colors: ['correct', 'absent', 'absent', 'correct', 'absent'], keys: { correct: ['E'], absent: ['Z', 'M'] } };
        await wait(500); 
        await typeTutorialTile(1, 0, 'Ö', 0); 
        await flipTutorialTile(1, 0, 'correct', 0); 
        await wait(1500); 
        await typeTutorialTile(1, 1, guess2.word[1], 150); 
        await typeTutorialTile(1, 2, guess2.word[2], 150); 
        await typeTutorialTile(1, 3, guess2.word[3], 150); 
        await typeTutorialTile(1, 4, guess2.word[4], 150); 
        await wait(1000);
        for (let i = 1; i < 5; i++) await flipTutorialTile(1, i, guess2.colors[i], 300);
        await updateTutorialKeyboard(guess2.keys.correct, 'correct', 0);
        await updateTutorialKeyboard(guess2.keys.absent, 'absent', 0);
        await wait(2000); 

        await wait(500); 
        await typeTutorialTile(2, 0, 'Ö', 0); 
        await flipTutorialTile(2, 0, 'correct', 0);
        await typeTutorialTile(2, 3, 'E', 150); 
        await flipTutorialTile(2, 3, 'correct', 0);
        await wait(2000); 

        await highlightTutorialJoker('tutorial-joker-present', 0, 1000);
        await disableTutorialJoker('tutorial-joker-present', 1000);
        await wait(1000); 

        await typeTutorialTile(2, 1, 'N', 500); 
        await flipTutorialTile(2, 1, 'present', 0); 
        await wait(2000); 
        
        await typeTutorialTile(2, 2, 'D', 150);
        await typeTutorialTile(2, 4, 'R', 150);

        const guess3 = { word: ['Ö', 'N', 'D', 'E', 'R'], colors: ['correct', 'present', 'absent', 'correct', 'present'], keys: { present: ['N', 'R'], absent: ['D'] } };
        await wait(1000);
        await flipTutorialTile(2, 2, guess3.colors[2], 300); 
        await flipTutorialTile(2, 4, guess3.colors[4], 300); 
        await updateTutorialKeyboard(guess3.keys.present, 'present', 0);
        await updateTutorialKeyboard(guess3.keys.absent, 'absent', 0);
        await wait(2000); 

        await wait(500); 
        await typeTutorialTile(3, 0, 'Ö', 0); 
        await flipTutorialTile(3, 0, 'correct', 0);
        await typeTutorialTile(3, 3, 'E', 150); 
        await flipTutorialTile(3, 3, 'correct', 0);
        await wait(2000); 

        await highlightTutorialJoker('tutorial-joker-remove', 0, 1000);
        await disableTutorialJoker('tutorial-joker-remove', 1000);
        await animateJokerRemove(1000); 
        await wait(2000); 

        await wait(500); 
        await highlightTutorialJoker('tutorial-joker-correct', 0, 1000);
        await disableTutorialJoker('tutorial-joker-correct', 1000);
        await wait(1000); 
        
        await typeTutorialTile(3, 4, 'K', 500); 
        await flipTutorialTile(3, 4, 'correct', 0); 
        await wait(2000); 
        
        const guess4 = { word: ['Ö', 'R', 'N', 'E', 'K'], colors: ['correct', 'correct', 'correct', 'correct', 'correct'], keys: { correct: ['R', 'N', 'K'] } };
        await typeTutorialTile(3, 1, guess4.word[1], 150); 
        await typeTutorialTile(3, 2, guess4.word[2], 150); 
        
        await wait(1000);
        await flipTutorialTile(3, 1, guess4.colors[1], 300);
        await flipTutorialTile(3, 2, guess4.colors[2], 300);
        
        await updateTutorialKeyboard(guess4.keys.correct, 0);
        
    } catch (e) {
        console.log("Tutorial animation stopped by user.");
    } finally {
        isTutorialRunning = false;
    }
}

export function stopTutorialAnimation() {
    isTutorialRunning = false; 
    cleanTutorialBoard();
}

export function switchLeagueTab(tabName) {
    const fixturesBtn = document.getElementById('btn-show-fixtures');
    const standingsBtn = document.getElementById('btn-show-standings');
    const fixturesTab = document.getElementById('tab-league-fixtures');
    const standingsTab = document.getElementById('tab-league-standings');

    if (!fixturesBtn || !standingsBtn) return;

    if (tabName === 'fixtures') {
        fixturesTab.classList.remove('hidden');
        standingsTab.classList.add('hidden');
        
        fixturesBtn.classList.add('text-white', 'border-yellow-500');
        fixturesBtn.classList.remove('text-gray-400', 'border-transparent');
        
        standingsBtn.classList.remove('text-white', 'border-yellow-500');
        standingsBtn.classList.add('text-gray-400', 'border-transparent');
    } else {
        fixturesTab.classList.add('hidden');
        standingsTab.classList.remove('hidden');
        
        standingsBtn.classList.add('text-white', 'border-yellow-500');
        standingsBtn.classList.remove('text-gray-400', 'border-transparent');
        
        fixturesBtn.classList.remove('text-white', 'border-yellow-500');
        fixturesBtn.classList.add('text-gray-400', 'border-transparent');
    }
}

export function renderLeagueStandings(standingsData, currentUserId) {
    const tbody = document.getElementById('league-standings-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (standingsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Henüz veri yok.</td></tr>';
        return;
    }

    standingsData.forEach((row, index) => {
        const isMe = row.id === currentUserId;
        const tr = document.createElement('tr');
        tr.className = isMe ? 'bg-indigo-900/40 border-b border-gray-700' : 'border-b border-gray-700 hover:bg-gray-750';
        
        tr.innerHTML = `
            <td class="px-3 py-3 font-medium whitespace-nowrap flex items-center gap-2">
                <span class="text-gray-500 text-xs w-4">${index + 1}.</span>
                <span class="${isMe ? 'text-yellow-300 font-bold' : 'text-white'} truncate max-w-[100px]">${row.username}</span>
            </td>
            <td class="px-2 py-3 text-center text-gray-300">${row.O}</td>
            <td class="px-2 py-3 text-center text-green-400">${row.G}</td>
            <td class="px-2 py-3 text-center text-blue-400">${row.B}</td>
            <td class="px-2 py-3 text-center text-red-400">${row.M}</td>
            <td class="px-3 py-3 text-center font-black text-yellow-400 text-lg">${row.P}</td>
        `;
        tbody.appendChild(tr);
    });
}

export function updateMarketUI() {
    const profile = state.getCurrentUserProfile();
    if (!profile) return;

    const gold = profile.gold || 0;
    if (userGoldDisplay) userGoldDisplay.textContent = gold;

    const inventory = profile.inventory || { present: 0, correct: 0, remove: 0 };
    
    if (stockPresent) stockPresent.textContent = inventory.present || 0;
    if (stockCorrect) stockCorrect.textContent = inventory.correct || 0;
    if (stockRemove) stockRemove.textContent = inventory.remove || 0;

    document.querySelectorAll('.buy-item-btn').forEach(btn => {
        btn.onclick = () => {
            const type = btn.dataset.type; 
            const item = btn.dataset.item; 
            const price = parseInt(btn.dataset.price);
            buyItem(type, item, price);
        };
    });

    document.querySelectorAll('.buy-gold-btn').forEach(btn => {
        btn.onclick = () => {
            const amount = parseInt(btn.dataset.amount);
            addGold(amount);
        };
    });
}

export function openKirtasiyeScreen() {
    showScreen('kirtasiye-screen');
    updateMarketUI();
}

// --- SÖZLÜK (DICTIONARY) FONKSİYONLARI (YENİ) ---

export async function openDictionaryScreen() {
    showScreen('dictionary-screen');
    
    if (dictionaryListContainer) {
        dictionaryListContainer.innerHTML = '<p class="text-center text-gray-500 mt-10 animate-pulse">Sözlük yükleniyor...</p>';
    }

    await loadDictionary();
}

export function renderDictionaryList(words) {
    if (!dictionaryListContainer) return;
    dictionaryListContainer.innerHTML = '';

    if (!words || words.length === 0) {
        dictionaryListContainer.innerHTML = '<p id="dictionary-empty-msg" class="text-gray-500 text-center mt-10 italic">Sözlüğün henüz boş.</p>';
        return;
    }

    words.forEach(item => {
        const card = document.createElement('div');
        card.className = 'dictionary-card';
        
        const meaning = item.meaning ? item.meaning : 'Anlam bulunamadı.';

        card.innerHTML = `
            <div class="dictionary-header">
                <span class="dictionary-word">${item.word}</span>
                <button class="btn-delete-word" title="Sözlükten Sil">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>
            <div class="dictionary-meaning">${meaning}</div>
        `;

        const deleteBtn = card.querySelector('.btn-delete-word');
        if (deleteBtn) {
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`"${item.word}" kelimesini sözlüğünden silmek istiyor musun?`)) {
                    removeWordFromDictionary(item.word, card);
                }
            };
        }

        dictionaryListContainer.appendChild(card);
    });
}