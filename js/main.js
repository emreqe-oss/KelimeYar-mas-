// js/main.js

import { db, auth } from './firebase.js';
import * as state from './state.js';
import { handleLogin, handleRegister, handleLogout } from './auth.js';
import * as game from './game.js';
import * as friends from './friends.js';
import * as ui from './ui.js';
import { showToast } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    // DOM hazır olduğunda ilk iş olarak UI elementlerini bul ve ata.
    ui.initUI();

    // --- OLAY YETKİLENDİRME (EVENT DELEGATION) ---
    const appContainer = document.getElementById('app');
    if (appContainer) {
        appContainer.addEventListener('click', (event) => {
            const target = event.target;
            const button = target.closest('button');
            if (!button) return;

            const buttonId = button.id;

            switch (buttonId) {
                // Tema
                case 'theme-light-btn': document.body.classList.add('theme-light'); break;
                case 'theme-dark-btn': document.body.classList.remove('theme-light'); break;
                
                // Mod Seçimi
                case 'daily-word-btn': game.startDailyGame(); break;
                case 'single-player-btn': 
                    state.setSinglePlayerMode('single');
                    document.getElementById('singleplayer-title').textContent = 'Tek Kişilik Oyun';
                    ui.showScreen('singleplayer-setup-screen');
                    break;
                case 'vs-cpu-btn':
                    state.setSinglePlayerMode('vsCPU');
                    document.getElementById('singleplayer-title').textContent = 'Bilgisayara Karşı';
                    ui.showScreen('singleplayer-setup-screen');
                    break;
                case 'multiplayer-btn':
                    const createBtn = document.getElementById('create-game-btn');
                    if(createBtn) createBtn.onclick = () => game.createGame();
                    // DÜZELTME: state.gameIdFromUrl -> state.getGameIdFromUrl()
                    if (state.getGameIdFromUrl()) game.joinGame(state.getGameIdFromUrl());
                    else ui.showScreen('multiplayer-setup-screen');
                    break;

                // Oyun Kurulum
                // DÜZELTME: state.singlePlayerMode -> state.getSinglePlayerMode()
                case 'start-single-game-btn': game.setupAndStartGame(state.getSinglePlayerMode()); break;
                case 'create-game-btn': game.createGame(); break;
                case 'join-game-btn':
                    const gameIdInput = document.getElementById('game-id-input');
                    if (gameIdInput) game.joinGame(gameIdInput.value.toUpperCase());
                    break;
                case 'rejoin-game-btn':
                    const lastGameId = localStorage.getItem('activeGameId');
                    if (lastGameId) game.joinGame(lastGameId);
                    break;

                // Oyun İçi
                case 'leave-game-button': game.leaveGame(); break;
                case 'copy-game-id-btn':
                    if (ui.gameIdDisplay) {
                        const gameId = ui.gameIdDisplay.textContent;
                        navigator.clipboard.writeText(gameId).then(() => { showToast('Oyun ID kopyalandı!'); });
                    }
                    break;
                case 'share-game-btn': game.shareGame(); break;
                case 'start-game-btn':
                    // DÜZELTME: state.currentGameId -> state.getCurrentGameId() ve state.gameMode -> state.getGameMode()
                    if (!state.getCurrentGameId() || state.getGameMode() !== 'multiplayer') return;
                    const gameRef = db.collection("games").doc(state.getCurrentGameId());
                    gameRef.update({ status: 'playing', turnStartTime: firebase.firestore.FieldValue.serverTimestamp() });
                    break;

                // Skor Tablosu
                case 'main-menu-btn': game.leaveGame(); break;
                case 'new-round-btn': game.startNewRound(); break;
                case 'share-results-btn': game.shareResultsAsEmoji(); break;

                // Navigasyon & Diğerleri
                case 'back-to-mode-single-btn': ui.showScreen('mode-selection-screen'); break;
                case 'back-to-mode-multi-btn': ui.showScreen('mode-selection-screen'); break;
                case 'profile-btn':
                    // DÜZELTME: state.currentUserProfile -> state.getCurrentUserProfile()
                    const userProfile = state.getCurrentUserProfile();
                    if (userProfile) {
                        document.getElementById('profile-fullname').textContent = userProfile.fullname;
                        document.getElementById('profile-username').textContent = userProfile.username;
                        document.getElementById('profile-email').textContent = userProfile.email;
                        document.getElementById('profile-age').textContent = userProfile.age;
                        document.getElementById('profile-city').textContent = userProfile.city;
                        ui.displayStats(userProfile);
                        ui.showScreen('profile-screen');
                    }
                    break;
                case 'close-profile-btn': ui.showScreen('mode-selection-screen'); break;
                case 'how-to-play-btn': ui.showScreen('how-to-play-screen'); break;
                case 'close-how-to-play-btn': ui.showScreen('mode-selection-screen'); break;

                // Auth
                case 'login-btn': handleLogin(); break;
                case 'register-btn': handleRegister(); break;
                // DÜZELTME: state.friendsUnsubscribe -> state.getFriendsUnsubscribe() vb.
                case 'logout-btn': handleLogout(state.getFriendsUnsubscribe(), state.getInvitesUnsubscribe()); break;
                case 'go-to-register-btn': ui.showScreen('register-screen'); break;
                case 'back-to-login-btn': ui.showScreen('login-screen'); break;
                
                // Friends
                case 'friends-btn': ui.showScreen('friends-screen'); break;
                case 'back-to-menu-from-friends-btn': ui.showScreen('mode-selection-screen'); break;
                case 'show-friends-tab-btn': ui.switchFriendTab('friends'); break;
                case 'show-requests-tab-btn': ui.switchFriendTab('requests'); break;
                case 'show-add-friend-tab-btn': ui.switchFriendTab('add'); break;
                case 'search-friend-btn': friends.searchUsers(); break;
                case 'invite-friend-btn':
                    ui.showScreen('friends-screen');
                    ui.switchFriendTab('friends');
                    showToast('Oyun kurmak için bir arkadaşını davet et.');
                    break;
            }
        });
    }

    // Fiziksel klavye olayları
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        game.handleKeyPress(e.key);
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
                    // DÜZELTME: state.currentUserProfile -> state.getCurrentUserProfile()
                    if(ui.userDisplay) ui.userDisplay.textContent = state.getCurrentUserProfile().username;
                } else {
                    const profileData = { username: user.email.split('@')[0], email: user.email };
                    state.setCurrentUserProfile(profileData);
                    // DÜZELTME: state.currentUserProfile -> state.getCurrentUserProfile()
                    if(ui.userDisplay) ui.userDisplay.textContent = state.getCurrentUserProfile().username;
                }
                
                if (createBtn) createBtn.disabled = false;
                if (joinBtn) joinBtn.disabled = false;

                const lastGameId = localStorage.getItem('activeGameId');
                const rejoinBtn = document.getElementById('rejoin-game-btn');
                if(lastGameId && rejoinBtn) { 
                    rejoinBtn.classList.remove('hidden'); 
                }

                const dailyBtn = document.getElementById('daily-word-btn');
                const singleBtn = document.getElementById('single-player-btn');
                const vsCpuBtn = document.getElementById('vs-cpu-btn');
                const multiBtn = document.getElementById('multiplayer-btn');

                if(dailyBtn) dailyBtn.disabled = false;
                if(singleBtn) singleBtn.disabled = false;
                if(vsCpuBtn) vsCpuBtn.disabled = false;
                if(multiBtn) multiBtn.disabled = false;

                state.setFriendsUnsubscribe(friends.listenToFriendships());
                state.setInvitesUnsubscribe(friends.listenForGameInvites());

                const urlParams = new URLSearchParams(window.location.search);
                const gameId = urlParams.get('gameId');
                state.setGameIdFromUrl(gameId);

                // DÜZELTME: state.currentGameId -> state.getCurrentGameId()
                if (gameId && !state.getCurrentGameId()) {
                    game.joinGame(gameId);
                    window.history.replaceState({}, document.title, window.location.pathname);
                    state.setGameIdFromUrl(null);
                } else {
                    ui.showScreen('mode-selection-screen');
                }
            } else {
                state.setUserId(null);
                state.setCurrentUserProfile(null);
                
                if (createBtn) createBtn.disabled = true;
                if (joinBtn) joinBtn.disabled = true;

                // DÜZELTME: Artık önce fonksiyonu çağırıp, sonra çalıştırıyoruz.
                const friendsUnsubscribe = state.getFriendsUnsubscribe();
                if (friendsUnsubscribe) friendsUnsubscribe();
                
                const invitesUnsubscribe = state.getInvitesUnsubscribe();
                if (invitesUnsubscribe) invitesUnsubscribe();

                ui.showScreen('login-screen');
            }
        });
    }

    initializeApp();
});