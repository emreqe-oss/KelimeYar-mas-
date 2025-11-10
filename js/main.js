// js/main.js - TAM VE TEMİZLENMİŞ DOSYA (10 Kasım 2025 Düzeltmesi)

import { 
    setUserId, setCurrentUserProfile, getCurrentUserProfile, getUserId, getCurrentGameId,
    getFriendsUnsubscribe, setFriendsUnsubscribe,
    getMyGamesUnsubscribe, setMyGamesUnsubscribe,
    getChallengedFriendId, setChallengedFriendId 
} from './state.js';

import { db, auth } from './firebase.js'; 
import { onAuthStateChanged } from "firebase/auth"; 
import { 
    getDoc, doc, collection, query, orderBy, limit, getDocs 
} from "firebase/firestore"; 
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
    backToMainMenuBtn, 
    backToMainMenuFromGamesBtn,
    backToMainFromFriendsBtn,
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

// ========================================================================
// === BAŞLANGIÇ: 'fetchAndDisplayGlobalRanking' (SADECE CSS SINIFI KULLANAN) ===
// ========================================================================
async function fetchAndDisplayGlobalRanking() {
    const listElement = document.getElementById('global-ranking-list');
    const loadingElement = document.getElementById('global-ranking-loading');
    if (!listElement || !loadingElement) return;

    // Listeyi her zaman temizle ve "yükleniyor" metnini göster
    listElement.innerHTML = '';
    loadingElement.classList.remove('hidden');
    loadingElement.textContent = "Sıralama yükleniyor..."; 

    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, 
            orderBy("stats.wins", "desc"), 
            orderBy("stats.played", "asc"),
            limit(20) 
        );

        const querySnapshot = await getDocs(q);
        let rank = 1;
        const currentUserId = getUserId(); 

        if (querySnapshot.empty) {
            loadingElement.textContent = "Henüz sıralamaya girecek kimse yok.";
            return;
        }

        querySnapshot.forEach(doc => {
            const user = doc.data();
            const stats = user.stats || { played: 0, wins: 0 };
            
            if (!user.username) return; // Bozuk veriyi atla

            // 1. Ana satırı oluştur ve 'ranking-row' sınıfını ver
            const row = document.createElement('div');
            row.className = 'ranking-row'; 
            
            // 2. Vurgulama için 'current-user' sınıfını ekle
            const isMe = doc.id === currentUserId;
            if (isMe) {
                row.classList.add('current-user'); 
            }

            // 3. İç HTML'i, style.css'teki sınıflara göre oluştur
            const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
            const wins = stats.wins || 0;

            row.innerHTML = `
                <div class="rank-details">
                    <span class="rank-number">${rank}.</span>
                    <span class="rank-username">${user.username}</span>
                </div>
                <div class="rank-score">
                    <span>Başarı: <strong>%${winRate}</strong></span> | 
                    <span>Kazanma: <strong>${wins}</strong></span>
                </div>
            `;
            
            // 4. Listeye ekle
            listElement.appendChild(row);
            rank++;
        });

        loadingElement.classList.add('hidden');

    } catch (error) {
        console.error("Sıralama yüklenirken hata:", error);
        loadingElement.textContent = "Sıralama yüklenemedi.";
    }
}
// ======================================================================
// === BİTİŞ: YENİ 'fetchAndDisplayGlobalRanking' FONKSİYONU ===
// ======================================================================


// İstatistik ekranındaki sekmeleri (tab) yöneten fonksiyon
function switchStatsTab(tabName) {
    const personalTab = document.getElementById('personal-stats-tab');
    const globalTab = document.getElementById('global-ranking-tab');
    const personalBtn = document.getElementById('show-personal-stats-tab-btn');
    const globalBtn = document.getElementById('show-global-ranking-tab-btn');

    if (tabName === 'global') {
        personalTab.classList.add('hidden');
        globalTab.classList.remove('hidden');
        personalBtn.classList.remove('text-white', 'border-indigo-500');
        personalBtn.classList.add('text-gray-400');
        globalBtn.classList.add('text-white', 'border-indigo-500');
        globalBtn.classList.remove('text-gray-400');
        // Sekmeye tıklandığında veriyi YENİDEN (veya İLK KEZ) yükle
        fetchAndDisplayGlobalRanking(); 
    } else { // 'personal'
        personalTab.classList.remove('hidden');
        globalTab.classList.add('hidden');
        personalBtn.classList.add('text-white', 'border-indigo-500');
        personalBtn.classList.remove('text-gray-400');
        globalBtn.classList.remove('text-white', 'border-indigo-500');
        globalBtn.classList.add('text-gray-400');
    }
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

    // İstatistik Butonları
    const openStatsScreen = () => {
        const profile = getCurrentUserProfile();
        if (!profile) return; 

        // 1. Sadece Kişisel İstatistikleri Doldur
        displayStats(profile); 
        
        // 2. Ekranı aç ve varsayılan sekmeyi ayarla
        showScreen('profile-screen');
        switchStatsTab('personal'); // Varsayılan olarak 'Kişisel'i göster
    };
    statsBtn.addEventListener('click', openStatsScreen);
    statsBtnMain.addEventListener('click', openStatsScreen);

    // İstatistik Sekme Butonları
    document.getElementById('show-personal-stats-tab-btn').addEventListener('click', () => switchStatsTab('personal'));
    document.getElementById('show-global-ranking-tab-btn').addEventListener('click', () => switchStatsTab('global'));

    // === "Nasıl Oynanır" Animasyon Tetikleyicileri ===
    howToPlayBtn.addEventListener('click', () => {
        showScreen('how-to-play-screen');
        playTutorialAnimation(); 
    });
    closeHowToPlayBtn.addEventListener('click', () => {
        showScreen('main-menu-screen');
        stopTutorialAnimation(); 
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
    if (searchFriendBtn) { // ui.js'den 'searchFriendBtn' olarak geldiğinden emin ol
        searchFriendBtn.addEventListener('click', searchUsers);
    }
    
    // Oyun İçi Butonlar
    leaveGameButton.addEventListener('click', leaveGame);
    startGameBtn.addEventListener('click', startGame);

    // Skor Ekranı Butonları
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
        } else if (e.key.length === 1 && e.key.match(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/i)) {
            handleKeyPress(e.key.toLocaleUpperCase('TR'));
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