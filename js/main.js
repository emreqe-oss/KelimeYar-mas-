// js/main.js

// Modülleri import et
import { db, auth } from './firebase.js';
import * as state from './state.js';
import { handleLogin, handleRegister, handleLogout } from './auth.js';
import * as game from './game.js';
import * as friends from './friends.js';
import * as ui from './ui.js';
import { showToast } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- EVENT LISTENERS ---

    // Tema
    document.getElementById('theme-light-btn').addEventListener('click', () => { document.body.classList.add('theme-light'); });
    document.getElementById('theme-dark-btn').addEventListener('click', () => { document.body.classList.remove('theme-light'); });

    // Mod Seçimi
    document.getElementById('daily-word-btn').addEventListener('click', game.startDailyGame);
    document.getElementById('single-player-btn').addEventListener('click', () => {
        state.setSinglePlayerMode('single');
        document.getElementById('singleplayer-title').textContent = 'Tek Kişilik Oyun';
        ui.showScreen('singleplayer-setup-screen');
    });
    document.getElementById('vs-cpu-btn').addEventListener('click', () => {
        state.setSinglePlayerMode('vsCPU');
        document.getElementById('singleplayer-title').textContent = 'Bilgisayara Karşı';
        ui.showScreen('singleplayer-setup-screen');
    });
    document.getElementById('multiplayer-btn').addEventListener('click', () => {
        document.getElementById('create-game-btn').onclick = () => game.createGame();
        if (state.gameIdFromUrl) {
            game.joinGame(state.gameIdFromUrl);
        } else {
            ui.showScreen('multiplayer-setup-screen');
        }
    });

    // Oyun Kurulum
    document.getElementById('start-single-game-btn').addEventListener('click', () => {
        game.setupAndStartGame(state.singlePlayerMode);
    });
    document.getElementById('create-game-btn').addEventListener('click', () => game.createGame());
    document.getElementById('join-game-btn').addEventListener('click', () => {
        const gameId = document.getElementById('game-id-input').value.toUpperCase();
        game.joinGame(gameId);
    });
    document.getElementById('rejoin-game-btn').addEventListener('click', () => {
        const lastGameId = localStorage.getItem('activeGameId');
        if (lastGameId) game.joinGame(lastGameId);
    });

    // Oyun İçi
    document.getElementById('leave-game-button').onclick = game.leaveGame;
    document.getElementById('copy-game-id-btn').addEventListener('click', () => {
        const gameId = ui.gameIdDisplay.textContent;
        navigator.clipboard.writeText(gameId).then(() => { showToast('Oyun ID kopyalandı!'); });
    });
    document.getElementById('share-game-btn').addEventListener('click', game.shareGame);
    ui.startGameBtn.addEventListener('click', async () => {
        if (!state.currentGameId || state.gameMode !== 'multiplayer') return;
        const gameRef = db.collection("games").doc(state.currentGameId);
        await gameRef.update({ status: 'playing', turnStartTime: firebase.firestore.FieldValue.serverTimestamp() });
    });
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        game.handleKeyPress(e.key);
    });

    // Skor Tablosu
    document.getElementById('main-menu-btn').addEventListener('click', game.leaveGame);
    document.getElementById('new-round-btn').addEventListener('click', game.startNewRound);
    document.getElementById('share-results-btn').addEventListener('click', game.shareResultsAsEmoji);

    // Navigasyon & Diğerleri
    document.getElementById('back-to-mode-single-btn').addEventListener('click', () => ui.showScreen('mode-selection-screen'));
    document.getElementById('back-to-mode-multi-btn').addEventListener('click', () => ui.showScreen('mode-selection-screen'));
    document.getElementById('profile-btn').addEventListener('click', () => {
        document.getElementById('profile-fullname').textContent = state.currentUserProfile.fullname;
        document.getElementById('profile-username').textContent = state.currentUserProfile.username;
        document.getElementById('profile-email').textContent = state.currentUserProfile.email;
        document.getElementById('profile-age').textContent = state.currentUserProfile.age;
        document.getElementById('profile-city').textContent = state.currentUserProfile.city;
        ui.displayStats(state.currentUserProfile);
        ui.showScreen('profile-screen');
    });
    document.getElementById('close-profile-btn').addEventListener('click', () => ui.showScreen('mode-selection-screen'));
    document.getElementById('how-to-play-btn').addEventListener('click', () => ui.showScreen('how-to-play-screen'));
    document.getElementById('close-how-to-play-btn').addEventListener('click', () => ui.showScreen('mode-selection-screen'));

    // Auth
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('register-btn').addEventListener('click', handleRegister);
    document.getElementById('logout-btn').addEventListener('click', () => handleLogout(state.friendsUnsubscribe, state.invitesUnsubscribe));
    document.getElementById('go-to-register-btn').addEventListener('click', () => ui.showScreen('register-screen'));
    document.getElementById('back-to-login-btn').addEventListener('click', () => ui.showScreen('login-screen'));

    // Friends
    document.getElementById('friends-btn').addEventListener('click', () => ui.showScreen('friends-screen'));
    document.getElementById('back-to-menu-from-friends-btn').addEventListener('click', () => ui.showScreen('mode-selection-screen'));
    ui.showFriendsTabBtn.addEventListener('click', () => ui.switchFriendTab('friends'));
    ui.showRequestsTabBtn.addEventListener('click', () => ui.switchFriendTab('requests'));
    ui.showAddFriendTabBtn.addEventListener('click', () => ui.switchFriendTab('add'));
    document.getElementById('search-friend-btn').addEventListener('click', friends.searchUsers);
    document.getElementById('invite-friend-btn').addEventListener('click', () => {
        ui.showScreen('friends-screen');
        ui.switchFriendTab('friends');
        showToast('Oyun kurmak için bir arkadaşını davet et.');
    });

    // --- UYGULAMAYI BAŞLATMA ---
    async function initializeApp() {
        if (typeof firebase === 'undefined') {
            showToast("Firebase kütüphanesi yüklenemedi.", true);
            return;
        }
        
        auth.onAuthStateChanged(async user => {
            const createBtn = document.getElementById('create-game-btn');
            const joinBtn = document.getElementById('join-game-btn');

            if (user && !user.isAnonymous) {
                state.setUserId(user.uid);
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    state.setCurrentUserProfile(userDoc.data());
                    ui.userDisplay.textContent = state.currentUserProfile.username;
                } else {
                    state.setCurrentUserProfile({ username: user.email.split('@')[0], email: user.email });
                    ui.userDisplay.textContent = state.currentUserProfile.username;
                }

                createBtn.disabled = false;
                joinBtn.disabled = false;
                const lastGameId = localStorage.getItem('activeGameId');
                if(lastGameId) { document.getElementById('rejoin-game-btn').classList.remove('hidden'); }

                await game.loadWords();
                
                document.getElementById('daily-word-btn').disabled = false;
                document.getElementById('single-player-btn').disabled = false;
                document.getElementById('vs-cpu-btn').disabled = false;
                document.getElementById('multiplayer-btn').disabled = false;

                state.setFriendsUnsubscribe(friends.listenToFriendships());
                state.setInvitesUnsubscribe(friends.listenForGameInvites());

                const urlParams = new URLSearchParams(window.location.search);
                const gameId = urlParams.get('gameId');
                state.setGameIdFromUrl(gameId);

                if (gameId && !state.currentGameId) {
                    game.joinGame(gameId);
                    window.history.replaceState({}, document.title, window.location.pathname);
                    state.setGameIdFromUrl(null);
                } else {
                    ui.showScreen('mode-selection-screen');
                }
            } else {
                state.setUserId(null);
                state.setCurrentUserProfile(null);
                createBtn.disabled = true;
                joinBtn.disabled = true;
                if(state.friendsUnsubscribe) state.friendsUnsubscribe();
                if(state.invitesUnsubscribe) state.invitesUnsubscribe();
                ui.showScreen('login-screen');
            }
        });
    }

    initializeApp();
});