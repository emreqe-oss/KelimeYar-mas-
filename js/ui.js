// js/ui.js

import * as state from './state.js';
import { getStatsFromProfile, createElement } from './utils.js';

// Değişkenler
export let guessGrid, keyboardContainer, turnDisplay, timerDisplay, gameIdDisplay, startGameBtn, roundCounter, shareGameBtn, userDisplay, invitationModal, friendsTab, requestsTab, addFriendTab, showFriendsTabBtn, showRequestsTabBtn, showAddFriendTabBtn, friendRequestCount, multiplayerScoreBoard;

export function initUI() {
    guessGrid = document.getElementById('guess-grid');
    keyboardContainer = document.getElementById('keyboard');
    turnDisplay = document.getElementById('turn-display');
    timerDisplay = document.getElementById('timer-display');
    gameIdDisplay = document.getElementById('game-id-display');
    startGameBtn = document.getElementById('start-game-btn');
    roundCounter = document.getElementById('round-counter');
    shareGameBtn = document.getElementById('share-game-btn');
    userDisplay = document.getElementById('user-display');
    invitationModal = document.getElementById('invitation-modal');
    friendsTab = document.getElementById('friends-tab');
    requestsTab = document.getElementById('requests-tab');
    addFriendTab = document.getElementById('add-friend-tab');
    showFriendsTabBtn = document.getElementById('show-friends-tab-btn');
    showRequestsTabBtn = document.getElementById('show-requests-tab-btn');
    showAddFriendTabBtn = document.getElementById('show-add-friend-tab-btn');
    friendRequestCount = document.getElementById('friend-request-count');
    multiplayerScoreBoard = document.getElementById('multiplayer-score-board');
}

export function showScreen(screenId) {
    const screens = [
        'login-screen', 'register-screen', 'main-menu-screen', 'new-game-screen',
        'my-games-screen', 'game-screen', 'scoreboard-screen', 'profile-screen',
        'how-to-play-screen', 'friends-screen', 'br-setup-screen'
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
        console.error(`showScreen fonksiyonu çağrıldı ama "${screenId}" ID'li ekran bulunamadı!`);
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
        const rowDiv = createElement('div', { className: `flex justify-center gap-1 my-1 w-full ${rowIndex === 3 ? 'gap-2' : ''}` });
        row.forEach(key => {
            const isSpecialKey = key === '⌫' || key === 'ENTER';
            const keyButton = createElement('button', {
                className: `keyboard-key rounded font-semibold uppercase bg-gray-500 ${isSpecialKey ? 'bg-gray-600' : ''}`,
                dataset: { key: key },
                onclick: () => handleKeyPress(key),
                style: { flex: isSpecialKey ? '6' : '1' }
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
    const allGuesses = Object.values(gameData.players).flatMap(p => p.guesses);
    const keyStates = {};
    allGuesses.forEach(({ word, colors }) => {
        for (let i = 0; i < word.length; i++) {
            const letter = word[i];
            const color = colors[i];
            if (keyStates[letter] === 'correct') continue;
            if (keyStates[letter] === 'present' && color !== 'correct') continue;
            keyStates[letter] = color;
        }
    });
    document.querySelectorAll('.keyboard-key').forEach(btn => {
        const keyId = btn.dataset.key;
        if (keyId === 'ENTER' || keyId === '⌫') return;
        const state = keyStates[keyId];
        btn.classList.remove('correct', 'present', 'absent');
        if (state) btn.classList.add(state);
    });
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
    const players = Object.entries(gameData.players);

    const sequentialGameInfo = document.getElementById('sequential-game-info');
    if (isBR) {
        multiplayerScoreBoard.classList.remove('hidden');
        sequentialGameInfo?.classList.add('hidden');
    } else {
        multiplayerScoreBoard.classList.add('hidden');
        sequentialGameInfo?.classList.remove('hidden');
        const p1ScoreEl = document.getElementById('player1-score');
        const p2ScoreEl = document.getElementById('player2-score');
        if (p1ScoreEl && p2ScoreEl) {
             const playerIds = Object.keys(gameData.players);
             let p1Id = gameData.creatorId || playerIds[0];
             if (playerIds.length > 0) {
                 const p1 = gameData.players[p1Id];
                 if (p1) p1ScoreEl.innerHTML = `<span class="font-bold">${p1.username}</span><br>${p1.score} Puan`;
             }
             if (playerIds.length > 1) {
                 const p2Id = playerIds.find(id => id !== p1Id);
                 const p2 = gameData.players[p2Id];
                 if (p2) p2ScoreEl.innerHTML = `<span class="font-bold">${p2.username}</span><br>${p2.score} Puan`;
             } else {
                 p2ScoreEl.innerHTML = '';
             }
        }
        return;
    }
    
    multiplayerScoreBoard.innerHTML = '';

    players.forEach(([id, data]) => {
        const isMe = id === currentUserId;
        const isEliminated = data.isEliminated;
        const isWinner = data.isWinner;

        let playerStatus = '';
        if(isWinner) {
             playerStatus = '<span class="text-green-400 font-bold">KAZANDI!</span>';
        } else if (isEliminated) {
            playerStatus = '<span class="text-red-400 font-bold">ELENDİ</span>';
        } else if (isBR && gameData.status === 'playing') {
            playerStatus = `<span class="text-xs text-gray-400">${data.guesses.length}/${gameData.GUESS_COUNT}</span>`;
        }

        const bgColor = isMe ? 'bg-indigo-600' : (isEliminated ? 'bg-gray-700' : 'bg-gray-600');
        
        const playerDiv = createElement('div', {
            className: `${bgColor} p-2 rounded-lg shadow w-full sm:w-1/2 flex-grow`,
            style: { minWidth: '100px' },
            innerHTML: `
                <p class="font-bold text-sm truncate ${isMe ? 'text-white' : 'text-gray-200'}">${data.username} ${isMe ? '(Sen)' : ''}</p>
                <p class="text-xs ${isMe ? 'text-indigo-200' : 'text-gray-400'}">${playerStatus}</p>
            `
        });
        multiplayerScoreBoard.appendChild(playerDiv);
    });
}

export function switchFriendTab(tabName) {
    const tabs = { friends: document.getElementById('friends-tab'), requests: document.getElementById('requests-tab'), add: document.getElementById('add-friend-tab') };
    const buttons = { friends: document.getElementById('show-friends-tab-btn'), requests: document.getElementById('show-requests-tab-btn'), add: document.getElementById('show-add-friend-tab-btn') };
    for (const key in tabs) {
        if(tabs[key]) tabs[key].classList.add('hidden');
        if(buttons[key]) {
            buttons[key].classList.remove('border-indigo-500', 'text-white');
            buttons[key].classList.add('text-gray-400');
        }
    }
    if(tabs[tabName]) tabs[tabName].classList.remove('hidden');
    if(buttons[tabName]){
        buttons[tabName].classList.add('border-indigo-500', 'text-white');
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
            buttons[key].classList.remove('border-indigo-500', 'text-white');
            buttons[key].classList.add('text-gray-400');
        }
    }

    if (tabs[tabName]) tabs[tabName].classList.remove('hidden');
    if (buttons[tabName]){
        buttons[tabName].classList.add('border-indigo-500', 'text-white');
        buttons[tabName].classList.remove('text-gray-400');
    }
}