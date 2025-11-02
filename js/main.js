// js/main.js - Hata Ayıklama Kayıtları ile SON KOD

import { doc, getDoc } from "firebase/firestore"; 
import { db, auth } from './firebase.js';
import * as state from './state.js';
import { handleLogin, handleRegister, handleLogout } from './auth.js';
import * as game from './game.js';
import * as friends from './friends.js';
import * as ui from './ui.js';
import { showToast } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    ui.initUI();

    const appContainer = document.getElementById('app');
    if (appContainer) {
        appContainer.addEventListener('click', (event) => {
            // Tıklanan elemanı veya en yakın butonu bul
            const button = event.target.closest('button'); 
            if (!button) return;

            const buttonId = button.id;
            
            // HATA AYIKLAMA: Hangi butonun tıklandığını konsola yaz
            console.log(`LOG: Buton tıklandı: ${buttonId}`); 
            
            switch (buttonId) {
                // Ana Ekran Navigasyonu
                case 'new-game-btn': ui.showScreen('new-game-screen'); break;
                case 'my-games-btn': ui.showScreen('my-games-screen'); break;
                case 'kelimelig-btn': showToast('KelimeLİG yakında!', false); break;
                case 'daily-word-btn': game.startNewGame({ mode: 'daily' }); break;
                case 'friends-btn': ui.showScreen('friends-screen'); break;
                case 'stats-btn':
                case 'stats-scroll-btn': ui.showScreen('profile-screen'); break;
                case 'settings-btn': showToast('Ayarlar menüsü yakında!', false); break;

                // Yeni Oyun Ekranı Navigasyonu
                case 'random-game-btn':
                    game.findOrCreateRandomGame({ timeLimit: 12 * 60 * 60, matchLength: 5, gameType: 'gevsek' });
                    break;
                case 'series-game-btn':
                    game.findOrCreateRandomGame({ timeLimit: 45, matchLength: 5, gameType: 'seri' });
                    break;
                case 'with-friends-btn':
                    ui.showScreen('friends-screen');
                    showToast('Kime meydan okumak istersin?');
                    break;
                    
                // ÇOKLU OYUNCU (BR) YÖNLENDİRMESİ
                case 'multiplayer-br-btn': 
                    ui.showScreen('br-setup-screen'); 
                    break;
                
                case 'vs-cpu-btn': game.startNewGame({ mode: 'vsCPU' }); break;
                
                // BR Kurulum Ekranı Butonları
                case 'create-br-game-btn':
                    console.log("LOG: create-br-game-btn tıklandı, game.createBRGame çağrılıyor."); // HATA AYIKLAMA
                    game.createBRGame({
                        wordLength: parseInt(document.getElementById('word-length-select-br').value),
                        timeLimit: parseInt(document.getElementById('time-select-br').value),
                        isHardMode: document.getElementById('hard-mode-checkbox-br').checked,
                    });
                    break;
                case 'join-br-game-btn':
                    const gameIdInputBR = document.getElementById('game-id-input-br');
                    if (gameIdInputBR) game.joinBRGame(gameIdInputBR.value.toUpperCase());
                    break;
                case 'back-to-mode-br-btn': 
                    ui.showScreen('new-game-screen');
                    break;
                case 'back-to-mode-multi-btn': 
                    ui.showScreen('new-game-screen'); 
                    break;
                
                // Geri ve Ayrıl Butonları
                case 'back-to-main-menu-btn': ui.showScreen('main-menu-screen'); break;
                case 'back-to-main-menu-from-games-btn': ui.showScreen('main-menu-screen'); break;
                case 'close-profile-btn': ui.showScreen('main-menu-screen'); break;
                case 'back-to-main-from-friends-btn': ui.showScreen('main-menu-screen'); break;
                
                case 'leave-game-button': 
                    console.log("LOG: leave-game-button tıklandı. game.leaveGame çağrılıyor."); // HATA AYIKLAMA
                    game.leaveGame(); 
                    break; 
                case 'main-menu-btn': 
                    console.log("LOG: main-menu-btn tıklandı. game.leaveGame çağrılıyor."); // HATA AYIKLAMA
                    game.leaveGame(); 
                    break; 

                // Oyunlarım Ekranı Tabları
                case 'show-active-games-tab-btn': ui.switchMyGamesTab('active'); break;
                case 'show-finished-games-tab-btn': ui.switchMyGamesTab('finished'); break;
                case 'show-invites-tab-btn': ui.switchMyGamesTab('invites'); break;

                // Genel Butonlar
                case 'how-to-play-btn': ui.showScreen('how-to-play-screen'); break;
                case 'close-how-to-play-btn': ui.showScreen('main-menu-screen'); break;
                case 'theme-light-btn': document.body.classList.add('theme-light'); break;
                case 'theme-dark-btn': document.body.classList.remove('theme-light'); break;

                // Auth Butonları
                case 'login-btn': handleLogin(); break;
                case 'register-btn': handleRegister(); break;
                case 'go-to-register-btn': ui.showScreen('register-screen'); break;
                case 'back-to-login-btn': ui.showScreen('login-screen'); break;
                case 'logout-btn': handleLogout(); break;
                
                // Arkadaşlık Ekranı Butonları
                case 'show-friends-tab-btn': ui.switchFriendTab('friends'); break;
                case 'show-requests-tab-btn': ui.switchFriendTab('requests'); break;
                case 'show-add-friend-tab-btn': ui.switchFriendTab('add'); break;
                case 'search-friend-btn': friends.searchUsers(); break;
                
                // Oyun İçi Kontroller
                case 'new-round-btn': game.startNewRound(); break;
                case 'copy-game-id-btn':
                    if (ui.gameIdDisplay) {
                        const gameId = ui.gameIdDisplay.textContent;
                        navigator.clipboard.writeText(gameId).then(() => { showToast('Oyun ID kopyalandı!'); });
                    }
                    break;
                case 'start-game-btn': game.startGame(); break;
                case 'share-results-btn': game.shareResultsAsEmoji(); break;
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        game.handleKeyPress(e.key);
    });

    function initializeApp() {
        auth.onAuthStateChanged(async user => {
            if (user && !user.isAnonymous) {
                state.setUserId(user.uid);
                
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    state.setCurrentUserProfile(userDoc.data());
                    const usernameDisplay = document.getElementById('main-menu-username');
                    if (usernameDisplay) {
                        usernameDisplay.textContent = state.getCurrentUserProfile().username;
                    }
                }
                
                state.setFriendsUnsubscribe(friends.listenToFriendships());
                state.setMyGamesUnsubscribe(friends.listenToMyGames());
                
                ui.showScreen('main-menu-screen');
            } else {
                state.setUserId(null);
                state.setCurrentUserProfile(null);
                
                const friendsUnsubscribe = state.getFriendsUnsubscribe();
                if (friendsUnsubscribe) friendsUnsubscribe();
                const myGamesUnsubscribe = state.getMyGamesUnsubscribe();
                if (myGamesUnsubscribe) myGamesUnsubscribe();

                ui.showScreen('login-screen'); 
            }
        });
    }

    initializeApp();
});