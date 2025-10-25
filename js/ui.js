// js/ui.js

import * as state from './state.js';
import { getStatsFromProfile } from './utils.js';

// Değişkenler burada sadece tanımlanıyor.
export let guessGrid, keyboardContainer, turnDisplay, timerDisplay, gameIdDisplay, startGameBtn, roundCounter, shareGameBtn, userDisplay, invitationModal, friendsTab, requestsTab, addFriendTab, showFriendsTabBtn, showRequestsTabBtn, showAddFriendTabBtn, friendRequestCount, multiplayerScoreBoard;

export function initUI() {
    // Değer atamaları burada yapılıyor.
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
    // YENİ EKLEME
    multiplayerScoreBoard = document.getElementById('multiplayer-score-board');
}

export function showScreen(screenId) {
    const screens = [
        'login-screen', 'register-screen', 'mode-selection-screen', 
        'singleplayer-setup-screen', 'multiplayer-setup-screen', 'game-screen', 
        'scoreboard-screen', 'profile-screen', 'how-to-play-screen', 'friends-screen',
        'br-setup-screen' // YENİ EKRAN
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

// ... (createGrid ve createKeyboard fonksiyonları aynı kalmalı)

export function createGrid(wordLength, GUESS_COUNT) {
    if (!guessGrid) return;
    guessGrid.innerHTML = '';
    guessGrid.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;
    for (let i = 0; i < GUESS_COUNT; i++) {
        for (let j = 0; j < wordLength; j++) {
            const tile = document.createElement('div');
            tile.classList.add('tile');
            tile.id = `tile-${i}-${j}`;
            const tileInnerFront = document.createElement('div');
            tileInnerFront.classList.add('tile-inner', 'front');
            const tileInnerBack = document.createElement('div');
            tileInnerBack.classList.add('tile-inner', 'back');
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
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('flex', 'justify-center', 'gap-1', 'my-1', 'w-full');
        if (rowIndex === 3) rowDiv.classList.add('gap-2');
        row.forEach(key => {
            const keyButton = document.createElement('button');
            keyButton.dataset.key = key;
            if (key === '⌫') {
                keyButton.innerHTML = `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>`;
            } else if (key === 'ENTER') {
                keyButton.innerHTML = `<svg class="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4l10 6-10 6V4z"/></svg>`;
            } else {
                keyButton.textContent = key;
            }
            keyButton.classList.add('keyboard-key', 'rounded', 'font-semibold', 'uppercase', 'bg-gray-500');
            if (rowIndex === 3) {
                keyButton.style.flex = '6';
                keyButton.classList.add('bg-gray-600');
            } else {
                keyButton.style.flex = '1';
            }
            keyButton.onclick = () => handleKeyPress(key);
            rowDiv.appendChild(keyButton);
        });
        keyboardContainer.appendChild(rowDiv);
    });
}


export function updateKeyboard(gameData) {
    if (!gameData || !gameData.players) return;
    // BR modu: Sadece kendi tahminlerimizi dikkate almalıyız, başkalarınınkini değil.
    // Ancak genel olarak klavye, oyundaki tüm bilgileri göstermeli (ortak tecrübe).
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

// YENİ FONKSİYON: 4 KİŞİLİK SKOR TABLOSUNU GÜNCELLE
export function updateMultiplayerScoreBoard(gameData) {
    if (!multiplayerScoreBoard) return;
    const isBR = state.getGameMode() === 'multiplayer-br';
    const currentUserId = state.getUserId();
    const players = Object.entries(gameData.players);

    // Sıralı 2 kişilik mod için eski skor panosunu gizle, BR için yenisini göster
    const sequentialGameInfo = document.getElementById('sequential-game-info');
    if (isBR) {
        multiplayerScoreBoard.classList.remove('hidden');
        sequentialGameInfo?.classList.add('hidden');
    } else {
        multiplayerScoreBoard.classList.add('hidden');
        sequentialGameInfo?.classList.remove('hidden');
        return;
    }
    
    multiplayerScoreBoard.innerHTML = '';

    players.forEach(([id, data]) => {
        const isMe = id === currentUserId;
        const isEliminated = data.guesses.length >= gameData.GUESS_COUNT && !data.isWinner;
        const isCurrentTurn = gameData.currentPlayerId === id;
        const isWinner = gameData.roundWinner === id;

        let playerStatus = '';
        if(isWinner) {
             playerStatus = '<span class="text-green-400 font-bold">KAZANDI!</span>';
        } else if (isEliminated) {
            playerStatus = '<span class="text-red-400 font-bold">ELENDİ</span>';
        } else if (isBR && gameData.status === 'playing') {
            playerStatus = `<span class="text-xs text-gray-400">${data.guesses.length}/${gameData.GUESS_COUNT}</span>`;
        }

        const bgColor = isMe ? 'bg-indigo-600' : (isEliminated ? 'bg-gray-700' : 'bg-gray-600');
        const borderColor = isCurrentTurn ? 'border-4 border-yellow-400' : '';
        
        const playerDiv = document.createElement('div');
        playerDiv.className = `${bgColor} ${borderColor} p-2 rounded-lg shadow w-full sm:w-1/2 md:w-1/4 flex-grow`;
        playerDiv.style.maxWidth = '100%'; // BR modunda 4 oyuncu göstermek için genişliği ayarla

        playerDiv.innerHTML = `
            <p class="font-bold text-sm truncate ${isMe ? 'text-white' : 'text-gray-200'}">${data.username} ${isMe ? '(Sen)' : ''}</p>
            <p class="text-xs ${isMe ? 'text-indigo-200' : 'text-gray-400'}">${playerStatus}</p>
        `;
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