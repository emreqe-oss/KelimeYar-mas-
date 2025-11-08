// js/main.js - TAM DOSYA (YENİ TUR HATASI DÜZELTİLDİ)

import { 
    setUserId, setCurrentUserProfile, getCurrentUserProfile, getUserId, getCurrentGameId,
    getFriendsUnsubscribe, setFriendsUnsubscribe,
    getMyGamesUnsubscribe, setMyGamesUnsubscribe,
    getChallengedFriendId, setChallengedFriendId 
} from './state.js';

import { db, auth } from './firebase.js'; 
import { onAuthStateChanged } from "firebase/auth"; 
import { getDoc, doc } from "firebase/firestore"; 
import { handleLogin, handleRegister, handleLogout } from './auth.js';
import { 
    searchUsers,
    listenToFriendships,
    listenToMyGames 
} from './friends.js';

import { 
    initUI, 
    showScreen, 
    displayStats, 
    switchFriendTab, 
    switchMyGamesTab,
    loginBtn, registerBtn, logoutBtn, goToRegisterBtn, backToLoginBtn,
    newGameBtn, myGamesBtn, friendsBtn, statsBtn, statsBtnMain,
    howToPlayBtn, closeHowToPlayBtn, themeLightBtn, themeDarkBtn,
    backToMainMenuBtn, backToMainMenuFromGamesBtn, backToMainFromFriendsBtn,
    randomGameBtn, seriesGameBtn, withFriendsBtn, vsCpuBtn, multiplayerBrBtn,
    dailyWordBtn,
    showActiveGamesTabBtn, showFinishedGamesTabBtn, showInvitesTabBtn,
    showFriendsTabBtn, showRequestsTabBtn, showAddFriendTabBtn, searchFriendBtn,
    closeProfileBtn,
    createGameBtn, joinGameBtn, createBRGameBtn, joinBRGameBtn, 
    backToModeMultiBtn, backToModeBrBtn,
    leaveGameButton, startGameBtn, copyGameIdBtn, shareGameBtn,
    newRoundBtn, mainMenuBtn, shareResultsBtn,
    jokerPresentBtn, jokerCorrectBtn, jokerRemoveBtn,

    // === "Nasıl Oynanır" animasyon fonksiyonları ===
    playTutorialAnimation,
    stopTutorialAnimation
} from './ui.js';
import { 
    startNewGame, 
    findOrCreateRandomGame, 
    joinGame, 
    createBRGame, 
    joinBRGame, 
    leaveGame, 
    handleKeyPress, 
    startGame, 
    listenToGameUpdates, 
    createGame,
    usePresentJoker, 
    useCorrectJoker, 
    useRemoveJoker 
} from './game.js';
import { showToast } from './utils.js';

// Uygulamayı başlatan ana fonksiyon
function initApp() {
    initUI();
    addEventListeners();
    initAuthListener();
    initTheme();
}

// Kullanıcı giriş/çıkış durumunu dinleyen fonksiyon
function initAuthListener() {
    onAuthStateChanged(auth, async (user) => { 
        const authLoading = document.getElementById('auth-loading');
        if (user) {
            authLoading.classList.add('hidden');
            setUserId(user.uid);
            
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const profileData = userSnap.data();
                setCurrentUserProfile(profileData);
                
                document.getElementById('main-menu-username').textContent = profileData.username || 'Kullanıcı';
                const stats = profileData.stats || { played: 0, wins: 0, currentStreak: 0 };
                const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
                document.getElementById('main-menu-stats').textContent = `Başarı: %${winRate} | Seri: ${stats.currentStreak}`;
                
                const friendsUnsub = listenToFriendships();
                const gamesUnsub = listenToMyGames();
                setFriendsUnsubscribe(friendsUnsub);
                setMyGamesUnsubscribe(gamesUnsub);

            } else {
                console.warn("Kullanıcı profili bulunamadı.");
                setCurrentUserProfile({ email: user.email });
            }
            
            const activeGameId = localStorage.getItem('activeGameId');
            if (activeGameId) {
                try {
                    const gameDoc = await getDoc(doc(db, "games", activeGameId));
                    if (gameDoc.exists() && gameDoc.data().status !== 'finished') {
                        showToast("Yarım kalan oyununa devam ediyorsun!");
                        if (gameDoc.data().gameType === 'multiplayer-br') {
                            await joinBRGame(activeGameId);
                        } else {
                            await joinGame(activeGameId);
                        }
                    } else {
                        localStorage.removeItem('activeGameId');
                        showScreen('main-menu-screen');
                    }
                } catch (error) {
                    console.error("Yarım kalan oyuna girerken hata:", error);
                    localStorage.removeItem('activeGameId');
                    showScreen('main-menu-screen');
                }
            } else {
                showScreen('main-menu-screen');
            }
            
        } else {
            authLoading.classList.add('hidden');
            setUserId(null);
            setCurrentUserProfile(null);

            if (getFriendsUnsubscribe()) getFriendsUnsubscribe()();
            if (getMyGamesUnsubscribe()) getMyGamesUnsubscribe()();
            setFriendsUnsubscribe(null);
            setMyGamesUnsubscribe(null);

            showScreen('login-screen');
        }
    });
}

// Tüm butonlara tıklama olaylarını (event listener) ekleyen fonksiyon
function addEventListeners() {
    // Auth Ekranları
    loginBtn.addEventListener('click', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    registerBtn.addEventListener('click', handleRegister);
    goToRegisterBtn.addEventListener('click', () => showScreen('register-screen'));
    backToLoginBtn.addEventListener('click', () => showScreen('login-screen'));

    // Ana Menü
    newGameBtn.addEventListener('click', () => showScreen('new-game-screen'));
    myGamesBtn.addEventListener('click', () => showScreen('my-games-screen'));
    friendsBtn.addEventListener('click', () => showScreen('friends-screen'));
    statsBtn.addEventListener('click', () => {
        displayStats(getCurrentUserProfile());
        showScreen('profile-screen');
    });
    statsBtnMain.addEventListener('click', () => {
        displayStats(getCurrentUserProfile());
        showScreen('profile-screen');
    });

    // === "Nasıl Oynanır" Animasyon Tetikleyicileri ===
    howToPlayBtn.addEventListener('click', () => {
        showScreen('how-to-play-screen');
        playTutorialAnimation(); // Animasyonu başlat
    });
    closeHowToPlayBtn.addEventListener('click', () => {
        showScreen('main-menu-screen');
        stopTutorialAnimation(); // Animasyonu durdur ve temizle
    });
    // === Bitiş ===

    closeProfileBtn.addEventListener('click', () => showScreen('main-menu-screen'));

    // Tema Butonları
    themeLightBtn.addEventListener('click', () => switchTheme('light'));
    themeDarkBtn.addEventListener('click', () => switchTheme('dark'));

    // Geri Butonları
    backToMainMenuBtn.addEventListener('click', () => showScreen('main-menu-screen'));
    backToMainMenuFromGamesBtn.addEventListener('click', () => showScreen('main-menu-screen'));
    backToMainFromFriendsBtn.addEventListener('click', () => showScreen('main-menu-screen'));

    // Oyun Modu Seçim
    vsCpuBtn.addEventListener('click', () => startNewGame({ mode: 'vsCPU' }));
    dailyWordBtn.addEventListener('click', () => startNewGame({ mode: 'daily' }));
    randomGameBtn.addEventListener('click', () => findOrCreateRandomGame({ timeLimit: 43200, matchLength: 5, gameType: 'random_loose' }));
    seriesGameBtn.addEventListener('click', () => findOrCreateRandomGame({ timeLimit: 45, matchLength: 5, gameType: 'random_series' }));

    // Online Oyun Kurma / Katılma
    withFriendsBtn.addEventListener('click', () => {
        showScreen('friends-screen');
        switchFriendTab('friends'); 
    });
    
    multiplayerBrBtn.addEventListener('click', () => showScreen('br-setup-screen'));
    backToModeMultiBtn.addEventListener('click', () => showScreen('new-game-screen'));
    backToModeBrBtn.addEventListener('click', () => showScreen('new-game-screen'));

    // Online Multiplayer
    createGameBtn.addEventListener('click', () => {
        const friendId = getChallengedFriendId(); 
        
        if (!friendId) {
            showToast("Lütfen önce 'Arkadaşlar' listesinden birini seçip 'Davet Et'e basın.", true);
            showScreen('friends-screen'); 
            return;
        }

        createGame({ 
            invitedFriendId: friendId,
            timeLimit: parseInt(document.getElementById('time-select-multi').value, 10),
            matchLength: parseInt(document.getElementById('match-length-select').value, 10),
            isHardMode: document.getElementById('hard-mode-checkbox-multi').checked,
            gameType: 'friend'
        });

        setChallengedFriendId(null); 
    });
    
    joinGameBtn.addEventListener('click', () => {
        const gameId = document.getElementById('game-id-input').value.toUpperCase();
        if (gameId) joinGame(gameId);
    });

    // Battle Royale
    createBRGameBtn.addEventListener('click', () => createBRGame());
    joinBRGameBtn.addEventListener('click', () => {
        const gameId = document.getElementById('game-id-input-br').value.toUpperCase();
        if (gameId) joinBRGame(gameId);
    });

    // Oyunlarım Sekmeleri
    showActiveGamesTabBtn.addEventListener('click', () => switchMyGamesTab('active'));
    showFinishedGamesTabBtn.addEventListener('click', () => switchMyGamesTab('finished'));
    showInvitesTabBtn.addEventListener('click', () => switchMyGamesTab('invites'));

    // Arkadaşlar Sekmeleri
    showFriendsTabBtn.addEventListener('click', () => switchFriendTab('friends'));
    showRequestsTabBtn.addEventListener('click', () => switchFriendTab('requests'));
    showAddFriendTabBtn.addEventListener('click', () => switchFriendTab('add'));
    searchFriendBtn.addEventListener('click', searchUsers);
    
    // Oyun İçi Butonlar
    leaveGameButton.addEventListener('click', leaveGame);
    startGameBtn.addEventListener('click', startGame);

    // Skor Ekranı Butonları
    
    // === DÜZELTME: (SIRA SENDE HATASI) ===
    // 'newRoundBtn' için olan 'addEventListener' kaldırıldı.
    // Bu butonun mantığı artık tamamen game.js içindeki 'showScoreboard' tarafından .onclick = startNewRound;
    // şeklinde yönetiliyor. Buradaki eski listener, o fonksiyonun çalışmasını engelliyordu.
    // newRoundBtn.addEventListener('click', () => {
    //     console.log("Yeni Tur butonu main.js'den tıklandı.");
    // });
    // === DÜZELTME SONU ===
    
    mainMenuBtn.addEventListener('click', leaveGame);
    
    // Kopyala & Paylaş
    copyGameIdBtn.addEventListener('click', () => {
        const gameId = document.getElementById('game-id-display').textContent;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(gameId).then(() => {
                showToast("Oyun ID kopyalandı!");
            });
        }
    });

    shareGameBtn.addEventListener('click', () => {
        const gameId = document.getElementById('game-id-display').textContent;
        const text = `Kelime Yarışması'na gel! Oyun ID: ${gameId}`;
        if (navigator.share) {
            navigator.share({
                title: 'Kelime Yarışması',
                text: text,
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(text).then(() => {
                showToast("Davet linki kopyalandı!");
            });
        }
    });

    // JOKER BUTONLARI BAĞLANTILARI
    if (jokerPresentBtn) jokerPresentBtn.addEventListener('click', usePresentJoker);
    if (jokerCorrectBtn) jokerCorrectBtn.addEventListener('click', useCorrectJoker);
    if (jokerRemoveBtn) jokerRemoveBtn.addEventListener('click', useRemoveJoker);

    // Fiziksel Klavye Dinleyicisi
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT') return;
        if (document.getElementById('game-screen').classList.contains('hidden')) return;

        if (e.key === 'Enter') {
            handleKeyPress('ENTER');
        } else if (e.key === 'Backspace') {
            handleKeyPress('⌫');
        } else if (e.key.length === 1 && e.key.match(/[a-zçğıöşü]/i)) {
            handleKeyPress(e.key);
        }
    });
}

// Tema Yönetimi
function switchTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('theme-light');
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.remove('theme-light');
        localStorage.setItem('theme', 'dark');
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    switchTheme(savedTheme);
}

// Uygulamayı başlat
initApp();