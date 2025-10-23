// js/ui.js
import { currentUserProfile } from './state.js';

// --- ELEMENT SEÇİCİLERİ ---
// Ekranlar
export const loginScreen = document.getElementById('login-screen');
export const registerScreen = document.getElementById('register-screen');
export const modeSelectionScreen = document.getElementById('mode-selection-screen');
export const singleplayerSetupScreen = document.getElementById('singleplayer-setup-screen');
export const multiplayerSetupScreen = document.getElementById('multiplayer-setup-screen');
export const gameScreen = document.getElementById('game-screen');
export const scoreboardScreen = document.getElementById('scoreboard-screen');
export const profileScreen = document.getElementById('profile-screen');
export const howToPlayScreen = document.getElementById('how-to-play-screen');
export const friendsScreen = document.getElementById('friends-screen');
export const invitationModal = document.getElementById('invitation-modal');

// Genel Elementler
export const guessGrid = document.getElementById('guess-grid');
export const keyboardContainer = document.getElementById('keyboard');
export const turnDisplay = document.getElementById('turn-display');
export const timerDisplay = document.getElementById('timer-display');
export const gameIdDisplay = document.getElementById('game-id-display');
export const startGameBtn = document.getElementById('start-game-btn');
export const roundCounter = document.getElementById('round-counter');
export const shareGameBtn = document.getElementById('share-game-btn');
export const userDisplay = document.getElementById('user-display');

// Friends Ekranı Elementleri
export const friendsTab = document.getElementById('friends-tab');
export const requestsTab = document.getElementById('requests-tab');
export const addFriendTab = document.getElementById('add-friend-tab');
export const showFriendsTabBtn = document.getElementById('show-friends-tab-btn');
export const showRequestsTabBtn = document.getElementById('show-requests-tab-btn');
export const showAddFriendTabBtn = document.getElementById('show-add-friend-tab-btn');
export const friendRequestCount = document.getElementById('friend-request-count');


// --- ARAYÜZ FONKSİYONLARI ---

export function showScreen(screenId) {
    [
        'login-screen', 'register-screen', 'mode-selection-screen', 
        'singleplayer-setup-screen', 'multiplayer-setup-screen', 'game-screen', 
        'scoreboard-screen', 'profile-screen', 'how-to-play-screen', 'friends-screen'
    ].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

export function createGrid(wordLength, GUESS_COUNT) {
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
    return currentUserProfile?.username || 'Oyuncu';
}

function getStats(profileData) {
    const defaultStats = { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, guessDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 } };
    return profileData?.stats ? { ...defaultStats, ...profileData.stats } : defaultStats;
}

export function displayStats(profileData) {
    const stats = getStats(profileData);
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
        const count = stats.guessDistribution[i] || 0;
        const percentage = (count / maxDistribution) * 100;
        const bar = `<div class="flex items-center"><div class="w-4">${i}</div><div class="flex-grow bg-gray-700 rounded"><div class="bg-amber-500 text-right pr-2 rounded text-black font-bold" style="width: ${percentage > 0 ? percentage : 1}%">${count > 0 ? count : ''}</div></div></div>`;
        distributionContainer.innerHTML += bar;
    }
}

export function switchFriendTab(tabName) {
    const tabs = { friends: friendsTab, requests: requestsTab, add: addFriendTab };
    const buttons = { friends: showFriendsTabBtn, requests: showRequestsTabBtn, add: showAddFriendTabBtn };
    for (const key in tabs) {
        tabs[key].classList.add('hidden');
        buttons[key].classList.remove('border-indigo-500', 'text-white');
        buttons[key].classList.add('text-gray-400');
    }
    tabs[tabName].classList.remove('hidden');
    buttons[tabName].classList.add('border-indigo-500', 'text-white');
    buttons[tabName].classList.remove('text-gray-400');
}